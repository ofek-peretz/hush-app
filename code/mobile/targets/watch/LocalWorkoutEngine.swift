import Foundation

// Watch-local workout authority — the standalone execution engine.
//
// When the phone is absent, THIS is the session machine: it runs a plan-snapshot
// workout set by set (active_set → rest_inter/rest_transition → … → complete),
// owns the wall-clock rests, and logs actuals. It deliberately emits the SAME
// WireMirror frames the phone publishes, so every existing screen, haptic, and
// the HKWorkoutSession runtime work identically under either authority.
//
// Boundaries (permanent):
//  - The engine NEVER computes targets — it executes the phone-prescribed plan
//    verbatim (the phone owns the model). No swaps, no reorders offline.
//  - Every transition is persisted BEFORE it is rendered (WatchStore), so an app
//    termination/crash resumes exactly where the athlete was — an elapsed rest is
//    caught up on restore (wall-clock, not timer-based).
//  - Completion produces a durable WireSessionRecord (outbox) for phone
//    reconciliation; the engine itself is then inert.

/// The persisted state of a live local session — the restore point. `steps` is a
/// full copy of the executed prescriptions so restore is immune to the plan file
/// being replaced mid-workout.
struct LocalSessionState: Codable {
  var recordId: String
  var planId: String
  var workoutId: String
  var workoutName: String
  var startedAt: String // ISO
  var phase: String // active_set | rest_inter | rest_transition | paused
  /// The live phase frozen under pause (restored on resume).
  var pausedFrom: String?
  /// Remaining rest (s) frozen under pause, when pausedFrom is a rest.
  var pausedRestRemainingS: Int?
  /// Index of the PRESENTED step. During a rest this stays on the just-completed
  /// set (phone-machine parity: the next set presents when the rest ends).
  var currentIndex: Int
  var restEndsAt: String? // ISO absolute — wall-clock, drift/termination-proof
  var restTotalS: Int?
  var restInterS: Int
  var restTransitionS: Int
  var steps: [WirePlanStep]
  var sets: [WireRecordSet]
  /// The holds and carries she has finished (2026-10-13). Optional so a session persisted by the
  /// build before this one still restores.
  var items: [WireRecordItem]?
  /// A hold whose clock is running ends at this instant — wall-clock, like a rest's end.
  var holdEndsAt: String?
  /// What remained of that hold when she paused.
  var pausedHoldRemainingS: Int?
  /// ⛔ THE REST SHE ACTUALLY TAKES (stage 5, 2026-10-17). When the running rest began — moved on by
  /// any pause inside it, exactly as the phone moves its own anchor (`unfrozenRestAnchor`) — and when
  /// she paused, so a resume knows how far to move it. Optional: a session persisted by an older
  /// build restores without them and simply banks no rest.
  var restStartedAt: String?
  var pausedAt: String?
  /// A rest she finished and has not logged a set after yet — the next set's `restBeforeS`.
  var pendingRestS: Int?
  /// A workout this wrist TOOK OVER from the phone (stage 3): the phone's session id, and how much
  /// of `sets` + `items` the phone had logged at that moment.
  var takeoverOf: String?
  var splitAt: Int?
}

final class LocalWorkoutEngine {
  private(set) var state: LocalSessionState
  private let store: WatchStore
  /// Every state change renders through here (the WatchModel adopts the frame).
  var onFrame: ((WireMirror) -> Void)?
  /// Fired once at completion with the durable record + the terminal frame.
  var onComplete: ((WireSessionRecord, WireMirror) -> Void)?

  private var restWork: DispatchWorkItem?
  private var finished = false
  /// The engine's one clock. A watch reads the wall; the instrument that runs this engine on a Mac
  /// (`native-tests/wrist-engine`) hands it the phone's own scripted time, so a rest taken across a
  /// pause is measured on both devices from the same seconds.
  let now: () -> Date

  // MARK: Construction

  /// Fresh start from a plan workout (phone absent; Begin on the watch).
  init(workout: WirePlanWorkout, plan: WirePlan, store: WatchStore, now: @escaping () -> Date = { Date() }) {
    self.store = store
    self.now = now
    self.state = LocalSessionState(
      recordId: UUID().uuidString,
      planId: plan.planId,
      workoutId: workout.id,
      workoutName: workout.name,
      startedAt: WatchWire.iso(now()),
      phase: "active_set",
      pausedFrom: nil,
      pausedRestRemainingS: nil,
      currentIndex: 0,
      restEndsAt: nil,
      restTotalS: nil,
      restInterS: plan.restInterS,
      restTransitionS: plan.restTransitionS,
      steps: workout.steps,
      sets: [],
      items: nil,
      holdEndsAt: nil,
      pausedHoldRemainingS: nil,
      restStartedAt: nil,
      pausedAt: nil,
      pendingRestS: nil,
      takeoverOf: nil,
      splitAt: nil
    )
  }

  /// Restore after an app termination/crash. Returns nil on an unusable state.
  init?(restored: LocalSessionState, store: WatchStore, now: @escaping () -> Date = { Date() }) {
    guard !restored.steps.isEmpty, restored.currentIndex < restored.steps.count else { return nil }
    self.store = store
    self.now = now
    self.state = restored
  }

  /**
   * ⛔ THE PHONE WENT SILENT — CARRY ITS WORKOUT ON FROM HERE (stage 3, 2026-10-17).
   *
   * The phone's last word on its workout (`WireTakeoverKit`): its plan as it held it — her weights
   * carried, the bridges she asked for — what she has logged, and where she stands. The engine
   * starts at exactly that point; `activate()` then catches up a rest that ran out while nobody was
   * listening, as it does after a crash. Everything she does from here is this wrist's, and is
   * offered back under the phone's own session id when the phone answers again.
   *
   * Nil when the kit cannot be stood in: no plan in it (the wrist holds an older rev), or a cursor
   * outside the plan — then the wrist says "reconnecting", as it always did, rather than guess.
   */
  init?(takeover kit: WireTakeoverKit, store: WatchStore, now: @escaping () -> Date = { Date() }) {
    let phases = ["active_set", "rest_inter", "rest_transition", "paused"]
    guard let steps = kit.steps, !steps.isEmpty, kit.cursor >= 0, kit.cursor < steps.count,
          phases.contains(kit.phase) else { return nil }
    if kit.phase == "paused" {
      guard let from = kit.pausedFrom, from != "paused", phases.contains(from) else { return nil }
    }
    self.store = store
    self.now = now
    self.state = LocalSessionState(
      recordId: UUID().uuidString,
      planId: kit.rev,
      workoutId: kit.workoutId,
      workoutName: kit.workoutName,
      startedAt: kit.startedAt,
      phase: kit.phase,
      pausedFrom: kit.phase == "paused" ? kit.pausedFrom : nil,
      pausedRestRemainingS: kit.pausedRestRemainingS,
      currentIndex: kit.cursor,
      restEndsAt: kit.restEndsAt,
      restTotalS: kit.restTotalS,
      restInterS: kit.restInterS,
      restTransitionS: kit.restTransitionS,
      steps: steps,
      sets: kit.sets,
      items: kit.items,
      holdEndsAt: kit.holdEndsAt,
      pausedHoldRemainingS: nil,
      restStartedAt: kit.restStartedAt,
      // A pause carried over began when the PHONE paused — the rest's start moves on from there.
      pausedAt: kit.phase == "paused" ? (kit.pausedAt ?? WatchWire.iso(now())) : nil,
      pendingRestS: kit.pendingRestS,
      takeoverOf: kit.sessionId,
      splitAt: kit.sets.count + (kit.items?.count ?? 0)
    )
  }

  /// Persist + render the current state, catching up any wall-clock rest that
  /// elapsed while the app was dead. Call once after construction.
  func activate() {
    if isResting(state.phase), let end = WatchWire.parseDate(state.restEndsAt), end <= now() {
      advancePastRest(byClock: true) // the rest finished while we were gone
      return
    }
    persist()
    scheduleRestAdvance()
    emit()
  }

  // MARK: Actions (the local counterparts of the phone-validated intents)

  /// Log the presented set (with the athlete's actuals) and move on.
  func completeSet(weight: Double?, reps: Int) {
    guard !finished, state.phase == "active_set" else { return }
    let step = state.steps[state.currentIndex]
    if step.isHold {
      // ⛔ A HOLD IS FINISHED, NOT COUNTED (2026-10-13). Done on a plank writes an ITEM — what was
      // asked, where the plan had it — and never a set of zero reps: that is the difference between
      // "she held a plank" and "she did a lift called plank for nothing" in her record.
      var items = state.items ?? []
      items.append(WireRecordItem(
        exerciseId: step.exerciseId,
        block: step.at?.block ?? 1,
        round: step.at?.round ?? step.setIndexInExercise + 1,
        position: step.at?.position ?? 1,
        kind: step.holdSeconds != nil ? "time" : "distance",
        seconds: step.holdSeconds,
        metres: step.holdMetres,
        // What she carried is on the PLAN, and the phone's own record of a hold does not repeat it
        // (`itemResultOf`) — so neither does this one: one record, whichever device wrote it.
        load: nil,
        completedAt: WatchWire.iso(now()),
        restBeforeS: state.pendingRestS
      ))
      state.items = items
      state.holdEndsAt = nil
    } else {
      state.sets.append(WireRecordSet(
        exerciseId: step.exerciseId,
        setIndex: step.setIndexInExercise,
        blockId: step.blockId,
        recommendedWeight: step.targetWeight,
        recommendedReps: step.targetReps,
        actualWeight: weight,
        actualReps: reps,
        completedAt: WatchWire.iso(now()),
        isWarmup: step.isBridge ? true : nil,
        // A bridge has no place in the coach's day (`insertWarmup` gives it none); a set has its own.
        at: step.isBridge ? nil : step.at,
        restBeforeS: state.pendingRestS
      ))
      // A bridge's half weight is the road TO her number, never a number to carry onto it — the
      // phone's line exactly (`completeSet`: "its weight must not carry onto the working sets").
      if !step.isBridge { carryForward(from: state.currentIndex, weight: weight) }
    }
    // One rest belongs to exactly one step — spent here, as the phone spends its own.
    state.pendingRestS = nil
    let isLast = state.currentIndex >= state.steps.count - 1
    if isLast {
      finish(early: false)
      return
    }
    // Phone-machine parity: the index stays on the completed set during the rest;
    // the next set presents when the rest ends.
    let next = state.steps[state.currentIndex + 1]
    let transition = next.exerciseId != step.exerciseId
    // ⛔ STRAIGHT ON (2026-10-13). The first lift of a superset's round is followed by its partner,
    // not by a rest — the phone's machine skips the rest screen for any rest of five seconds or
    // under (`afterSetCompletion`), and the step now says how long its rest is. A plan from an older
    // phone says nothing (`nil`), and rests as it always did.
    if let said = step.restAfterS, said <= REST_SKIP_THRESHOLD_S {
      advancePastRest(byClock: false)
      return
    }
    beginRest(transition: transition)
  }

  /// "Ready" on a timed hold — its one clock starts, and every surface of the wrist counts to the
  /// same end (the set screen's countdown, the haptic at zero). Idempotent: a second Ready never
  /// restarts a hold already running. Nothing is written at zero — Done writes it (founder, 2026-09-09).
  func startHold() {
    guard !finished, state.phase == "active_set", state.holdEndsAt == nil else { return }
    let step = state.steps[state.currentIndex]
    guard let seconds = step.holdSeconds, seconds > 0 else { return } // a carry has no clock
    state.holdEndsAt = WatchWire.iso(now().addingTimeInterval(TimeInterval(seconds)))
    persist()
    emit()
  }

  /**
   * "+ Warm-up" — the bridges the phone would insert before the set on stage go in, ahead of it
   * (2026-10-17, the wrist-alone plan, stage 2).
   *
   * ⛔ NOTHING IS COMPUTED HERE. The phone answered `warmupOffer` for this exact step when it built
   * the plan and put the answer on the step (`ramp`): each bridge's load, reps and bar. This is the
   * phone's `insertWarmup`, to the letter — a bridge per rung, immediately BEFORE the working set, so
   * the cursor (which addresses the plan by position) lands on the first bridge without moving;
   * negative set numbers; the fixed breath after each; no place in the coach's day; never the last
   * of its lift; positions re-derived for the whole plan. The offer is then spent: on the phone,
   * `warmupOffer` finds a bridge in front of the working set and offers nothing; here the step's
   * `ramp` is simply taken off it.
   */
  func addWarmup() {
    guard !finished, state.phase == "active_set", state.holdEndsAt == nil else { return }
    let at = state.currentIndex
    let anchor = state.steps[at]
    guard !anchor.isBridge, !anchor.isHold, let ramp = anchor.ramp, !ramp.isEmpty else { return }
    let bridges: [WirePlanStep] = ramp.enumerated().map { i, rung in
      var b = anchor
      b.setIndexInExercise = i - ramp.count
      b.targetWeight = rung.weightKg
      b.targetReps = rung.reps
      b.targetRepsHi = nil // a bridge has no band: it is so many reps, at a weight below her number
      b.loadSetup = rung.loadSetup
      b.reasonType = nil
      b.reasonDelta = nil
      b.lastReps = nil // last time's WORKING reps are not a ghost a bridge should draw
      b.lastLoadKg = nil
      b.restAfterS = WARMUP_REST_S
      b.restWritten = true
      b.restIsLearned = nil
      b.superset = nil
      b.at = nil
      b.ramp = nil
      b.warmup = WireWarmupPlace(index: i, count: ramp.count)
      return b
    }
    state.steps[at].ramp = nil
    state.steps.insert(contentsOf: bridges, at: at)
    for i in state.steps.indices { state.steps[i].globalIndex = i }
    persist()
    emit()
  }

  /// "Ready" — end the running rest now.
  func endRest() {
    guard !finished, isResting(state.phase) else { return }
    advancePastRest(byClock: false)
  }

  /// "+15 sec" — extend the running rest. The END moves out; `restTotalS` does NOT (founder
  /// 2026-07-13). It is the ring's denominator, and growing it in lock-step with the remaining
  /// time is what made the wrist's arc lurch backwards and climb again on every +15. The phone
  /// adds the seconds to the numerator alone, so the arc fills FORWARD; the wrist now does the
  /// same. (The phone-driven mirror holds the identical law — see sessionMirror.ts.)
  func addRest(seconds: Int) {
    guard !finished, isResting(state.phase), let end = WatchWire.parseDate(state.restEndsAt) else { return }
    state.restEndsAt = WatchWire.iso(end.addingTimeInterval(TimeInterval(seconds)))
    persist()
    scheduleRestAdvance()
    emit()
  }

  /// Freeze the workout (§7.2). A running rest freezes its REMAINING seconds.
  func pause() {
    guard !finished, state.phase != "paused" else { return }
    cancelRestAdvance()
    state.pausedFrom = state.phase
    if isResting(state.phase), let end = WatchWire.parseDate(state.restEndsAt) {
      state.pausedRestRemainingS = max(0, Int(end.timeIntervalSince(now()).rounded()))
    }
    // A hold in flight freezes too: what remained of it comes back when she resumes.
    if let end = WatchWire.parseDate(state.holdEndsAt) {
      state.pausedHoldRemainingS = max(0, Int(end.timeIntervalSince(now()).rounded()))
      state.holdEndsAt = nil
    }
    state.pausedAt = WatchWire.iso(now())
    state.phase = "paused"
    state.restEndsAt = nil
    persist()
    emit()
  }

  /// Resume the frozen phase; a frozen rest restarts with its remaining seconds.
  func resume() {
    guard !finished, state.phase == "paused" else { return }
    let from = state.pausedFrom ?? "active_set"
    state.phase = from
    state.pausedFrom = nil
    if let left = state.pausedHoldRemainingS {
      state.pausedHoldRemainingS = nil
      state.holdEndsAt = WatchWire.iso(now().addingTimeInterval(TimeInterval(left)))
    }
    // The rest's start moves on by exactly the time the workout stood still — the phone's
    // `unfrozenRestAnchor` — so a pause is never counted as rest she took.
    if let started = WatchWire.parseDate(state.restStartedAt), let paused = WatchWire.parseDate(state.pausedAt) {
      state.restStartedAt = WatchWire.iso(started.addingTimeInterval(max(0, now().timeIntervalSince(paused))))
    }
    state.pausedAt = nil
    if isResting(from) {
      let remaining = state.pausedRestRemainingS ?? 0
      state.pausedRestRemainingS = nil
      if remaining <= 0 {
        // Under the old clock the end would have come; the rest ran its length.
        state.restEndsAt = WatchWire.iso(now())
        advancePastRest(byClock: true)
        return
      }
      state.restEndsAt = WatchWire.iso(now().addingTimeInterval(TimeInterval(remaining)))
      // restTotalS keeps the full prescribed length (the ring's denominator).
    }
    persist()
    scheduleRestAdvance()
    emit()
  }

  /// End the workout now, keeping every logged set (the truthful early finish).
  func finishEarly() {
    guard !finished else { return }
    finish(early: true)
  }

  /// Work logged into this session on this wrist — a set she did, or a hold she finished.
  ///
  /// ⛔ A PLANK IS WORK (2026-10-17). Every guard that protects a session from being thrown away
  /// read `state.sets.isEmpty`, written while a set was the only thing the wrist could log. Since
  /// the wrist runs holds alone (2026-10-13), a session that opened on a plank had real work in it
  /// and `sets` still empty — so a phone that turned up live discarded it, plank and all.
  ///
  /// ⚠️ ON THIS WRIST. A workout taken over from the phone (stage 3) starts with the phone's account
  /// in it; none of that is this wrist's to protect — it is already on the phone. Only what was
  /// logged past the split is work the wrist alone holds.
  var hasWork: Bool { state.sets.count + (state.items?.count ?? 0) > (state.splitAt ?? 0) }

  /// A workout this wrist took over from the phone (stage 3), rather than one it began itself.
  var isTakeover: Bool { state.takeoverOf != nil }

  /// Tear the local session down WITHOUT recording anything. Only valid while nothing
  /// has been logged (asserted by the caller): the Begin fallback starts a local session
  /// when the phone doesn't answer, and if the phone then answers late, the phone reclaims
  /// authority — the never-used local session must leave no record and no persisted state.
  func discard() {
    guard !finished, !hasWork else { return }
    finished = true
    cancelRestAdvance()
    onFrame = nil
    onComplete = nil
    store.clearActiveSession()
  }

  /// Tear the local session down because the PHONE HAS TAKEN IT OVER — the live handover.
  ///
  /// ⛔ THIS IS NOT `discard()`, AND THE DIFFERENCE IS THE WHOLE POINT. `discard` refuses a session
  /// with sets in it, and must: it exists for a local session that was never used, and a guard is
  /// the only thing standing between that path and deleting work. Here the sets are not being
  /// thrown away — they are ON THE PHONE, which said so by name.
  ///
  /// ⚠️ THE CALLER MUST HAVE MATCHED `adoptedRecordId` AGAINST `state.recordId`. Releasing on
  /// anything weaker — "the phone seems to be running something" — is how a workout disappears
  /// between two devices with nobody able to say where it went.
  func release() {
    guard !finished else { return }
    finished = true
    cancelRestAdvance()
    onFrame = nil
    onComplete = nil
    store.clearActiveSession()
  }

  // MARK: Internals

  /// ⛔ THE WEIGHT SHE LIFTED IS THE WEIGHT THE REST OF THE LIFT OPENS AT (2026-10-13).
  ///
  /// The founder's ruling for a workout in flight (2026-08-26): she is a logger — *"אם נתנו לו משקל X
  /// והוא עושה Y אנחנו קופצים למשקל שהוא עשה"* — and nothing else moves her plates between sets. The
  /// phone has done exactly this since (`carryWeightForward`); the wrist alone logged her 55 and put
  /// 60 back on the next set (`theWristRunsWhatThePhoneRuns`, scenario `her-own-weight`: 17 facts
  /// apart). The same rule, to the letter: every LATER set of the same lift, a hold never, a
  /// bodyweight set (no weight) carries nothing.
  ///
  /// ⚠️ This is not a second engine on the wrist. Nothing is computed: her own number is copied
  /// forward. The plate breakdown that was worked out for the WRITTEN weight is dropped with it —
  /// the wrist cannot do plate arithmetic, and no breakdown is better than the wrong one.
  private func carryForward(from index: Int, weight: Double?) {
    guard let weight, index + 1 < state.steps.count else { return }
    let lift = state.steps[index].exerciseId
    for i in (index + 1)..<state.steps.count {
      guard state.steps[i].exerciseId == lift, !state.steps[i].isHold, state.steps[i].targetWeight != weight else { continue }
      state.steps[i].targetWeight = weight
      state.steps[i].loadSetup = nil
    }
  }

  private func isResting(_ phase: String) -> Bool {
    phase == "rest_inter" || phase == "rest_transition"
  }

  private func beginRest(transition: Bool) {
    // Per-tier rest (S2): the just-completed step carries its exercise's between-sets rest;
    // the plan-level value is the fallback for a snapshot from an older phone build.
    let step = state.steps.indices.contains(state.currentIndex) ? state.steps[state.currentIndex] : nil
    // The phone's own answer for THIS step when the plan carries one (2026-10-13) — the rest between
    // a superset's rounds is neither "this lift's rest" nor "the walk", it is what the plan says.
    let restS = step?.restAfterS ?? (transition ? state.restTransitionS : (step?.restInterS ?? state.restInterS))
    state.phase = transition ? "rest_transition" : "rest_inter"
    state.restStartedAt = WatchWire.iso(now())
    state.restEndsAt = WatchWire.iso(now().addingTimeInterval(TimeInterval(restS)))
    state.restTotalS = restS
    persist()
    scheduleRestAdvance()
    emit()
  }

  /**
   * ⛔ THE REST SHE TOOK IS BANKED FOR THE SET THAT FOLLOWS IT (stage 5, 2026-10-17) — the phone's
   * `endRest`, to the letter. Ended by her: from its start to now. Run out by itself (the timer, or
   * caught up after the app was gone): its whole length, start to end — the phone's clock banks the
   * same (`sessionClock`, `restS`). Under `REST_SAMPLE_FLOOR_S` it was a thumb, not her pace, and is
   * not banked: unknown, never zero. No rest at all (straight on) banks nothing.
   */
  private func advancePastRest(byClock: Bool) {
    cancelRestAdvance()
    if isResting(state.phase), let started = WatchWire.parseDate(state.restStartedAt) {
      let until = byClock ? (WatchWire.parseDate(state.restEndsAt) ?? now()) : now()
      let tookS = max(0, Int(until.timeIntervalSince(started).rounded()))
      state.pendingRestS = tookS >= REST_SAMPLE_FLOOR_S ? tookS : nil
    }
    state.restStartedAt = nil
    state.currentIndex = min(state.currentIndex + 1, state.steps.count - 1)
    state.phase = "active_set"
    state.restEndsAt = nil
    state.restTotalS = nil
    state.holdEndsAt = nil // a new step: no hold is running on it yet
    persist()
    emit()
  }

  /// Wall-clock rest ending: a work item at the absolute end instant. The
  /// HKWorkoutSession keeps the app executing in the background so this fires
  /// wrist-down; if the app dies anyway, activate() catches the elapsed rest up.
  private func scheduleRestAdvance() {
    cancelRestAdvance()
    guard isResting(state.phase), let end = WatchWire.parseDate(state.restEndsAt) else { return }
    let delay = max(0.05, end.timeIntervalSince(now()))
    let work = DispatchWorkItem { [weak self] in
      guard let self, !self.finished, self.isResting(self.state.phase) else { return }
      self.advancePastRest(byClock: true)
    }
    restWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
  }

  private func cancelRestAdvance() {
    restWork?.cancel()
    restWork = nil
  }

  /// Active kilocalories the wrist measured for this workout, handed in by the model at the
  /// whistle (the runtime clears its live metrics as it persists the HKWorkout). ONE NUMBER PER
  /// WORKOUT: on a standalone session the wrist is the authority, so this becomes the session's
  /// figure on the phone too, instead of the phone re-estimating beside it.
  var measuredKcal: Int?

  private func finish(early: Bool) {
    finished = true
    cancelRestAdvance()
    let record = WireSessionRecord(
      v: WATCH_PROTOCOL_VERSION,
      type: "session_record",
      recordId: state.recordId,
      planId: state.planId,
      workoutId: state.workoutId,
      workoutName: state.workoutName,
      startedAt: state.startedAt,
      endedAt: WatchWire.iso(now()),
      earlyFinish: early,
      kcal: measuredKcal,
      sets: state.sets,
      items: state.items,
      takeoverOf: state.takeoverOf,
      splitAt: state.splitAt
    )
    // Durability order: the record enters the outbox BEFORE the active session is
    // cleared — a crash between the two re-offers a completed workout to the
    // outbox, never loses one (the phone de-dupes). A hold she finished is work: a record of
    // holds alone goes home too. A warm-up alone is not a workout, on either device.
    if record.isAWorkout {
      store.enqueueRecord(record)
      store.markWorkoutDone(state.workoutId)
    }
    store.clearActiveSession()
    onComplete?(record, completeFrame())
  }

  private func persist() {
    guard !finished else { return }
    store.saveActiveSession(state)
  }

  private func emit() {
    onFrame?(project())
  }

  // MARK: Projection — the Swift twin of projectSessionMirror over plan steps

  private func signedDelta(_ step: WirePlanStep?) -> Double {
    guard let step, let reason = step.reasonType else { return 0 }
    let mag = step.reasonDelta ?? 0
    return reason == "increase" ? mag : reason == "decrease" ? -mag : 0
  }

  private func liftPosition(at idx: Int) -> (index: Int, count: Int) {
    // LIFTS, not runs — a superset (A, B, A, B) is two lifts. The phone's rule (`sessionMirror.liftPosition`).
    var order: [String] = []
    for s in state.steps where !order.contains(s.exerciseId) { order.append(s.exerciseId) }
    let here = state.steps.indices.contains(idx) ? order.firstIndex(of: state.steps[idx].exerciseId) : nil
    return ((here ?? 0) + 1, max(order.count, 1))
  }

  /**
   * ⛔ THE CURRENT BLOCK'S SETS OF ONE LIFT — not every set of it today.
   *
   * `setIndex` is the round WITHIN a block, so a lift the coach split across two blocks restarts it
   * at 0 and collecting them all put block one's reps into block two's row. The plan runs front to
   * back, so the current block is the trailing run that begins at the last `setIndex == 0`. Port of
   * the phone's `currentBlockSets`, and the same bug it was written for.
   */
  private func currentBlockSets(_ exerciseId: String) -> [WireRecordSet] {
    // A bridge is not "her work so far" — the phone's line (`soFarOnLift`).
    let all = state.sets.filter { $0.exerciseId == exerciseId && $0.isWarmup != true }
    var start = 0
    for (i, s) in all.enumerated() where s.setIndex == 0 { start = i }
    return all.isEmpty ? [] : Array(all[start...])
  }

  /// TO-LOAD vs LOADED (port of the phone's isToLoad, pure over the logged sets).
  private func toLoad(_ cur: WirePlanStep) -> Bool {
    guard let target = cur.targetWeight else { return false } // bodyweight
    var lastLoaded: Double?
    var any = false
    for s in state.sets where s.exerciseId == cur.exerciseId {
      lastLoaded = s.actualWeight
      any = true
    }
    if !any { return true }
    return lastLoaded != target
  }

  private func timeLabel(fromISO iso: String) -> String {
    let started = WatchWire.parseDate(iso) ?? now()
    let s = max(0, Int(now().timeIntervalSince(started).rounded()))
    return "\(s / 60):" + String(format: "%02d", s % 60)
  }

  /// Distinct lifts the athlete actually trained AND the model raised — truthful "up".
  private func progressedLifts() -> Int {
    let trained = Set(state.sets.map { $0.exerciseId })
    let raised = state.steps
      .filter { $0.reasonType == "increase" && trained.contains($0.exerciseId) }
      .map { $0.exerciseId }
    return Set(raised).count
  }

  /// "Set 2 of 4" — or, on a warm-up bridge, its place in the RAMP ("Warm-up 1 of 2"), never a
  /// working-set number. The phone's `stepPosition`, which every surface there reads.
  private func position(_ s: WirePlanStep) -> (label: String, n: Int, m: Int) {
    if let w = s.warmup { return ("Warm-up \(w.index + 1) of \(w.count)", w.index + 1, w.count) }
    return ("Set \(s.setIndexInExercise + 1) of \(s.totalSetsInExercise)", s.setIndexInExercise + 1, s.totalSetsInExercise)
  }

  /// Her WORKING sets — what every count and every tonnage reads (a bridge is the road to her
  /// number, not work; the phone draws the same line in `liveSets` and the summary).
  private var workingSets: [WireRecordSet] { state.sets.filter { $0.isWarmup != true } }

  private func baseMirror(cur: WirePlanStep, phase: String) -> WireMirror {
    let lift = liftPosition(at: min(state.currentIndex, state.steps.count - 1))
    let here = position(cur)
    return WireMirror(
      schema: MIRROR_SCHEMA_VERSION,
      phase: phase,
      exerciseName: cur.exerciseName,
      exerciseGroup: cur.exerciseGroup,
      setLabel: here.label,
      setNumber: here.n,
      setsInExercise: here.m,
      // Passed explicitly rather than leaning on the memberwise initializer's implicit nil for an
      // optional: this file is only ever compiled on EAS, so a wrong assumption here costs a whole
      // build to discover. `project()` fills them in on a rest frame.
      nextSetLabel: nil,
      nextSetNumber: nil,
      nextSetsInExercise: nil,
      globalIndex: cur.globalIndex,
      totalSets: state.steps.count,
      targetWeight: cur.targetWeight,
      targetReps: cur.targetReps,
      targetRepsHi: cur.targetRepsHi, // the band's ceiling, so the ruler draws standalone too
      /*
       * ⛔ HER OWN SETS, PROJECTED LOCALLY (2026-08-04). The wrist logs its own sets when the phone
       * is in a locker, so the row of figures works standalone exactly as it does mirrored — and
       * `watchWireParity` exists precisely because the last field added here was forgotten and the
       * phone-absent athlete quietly saw less.
       */
      setsSoFar: currentBlockSets(cur.exerciseId).map { $0.actualReps },
      loadsSoFar: currentBlockSets(cur.exerciseId).map { $0.actualWeight },
      /*
       * ⛔ AND LAST TIME COMES OFF THE STEP (founder 2026-08-04). It used to be nil here with a
       * comment explaining that the wrist carries the plan and never the history — true, and the
       * wrong conclusion: the PHONE has the history and builds the plan, so it simply had to put it
       * in. A standalone set now draws the same ghosts a mirrored one does.
       */
      lastReps: cur.lastReps,
      lastLoadKg: cur.lastLoadKg,
      restEndsAt: nil,
      restRemainingS: nil,
      restTotalS: nil,
      // WT5 — the phone now SAYS whether this step's rest is hers, rather than the wrist inferring
      // it. This used to read `cur.restInterS != nil`, which is true of her learned median AND of a
      // rest the coach wrote for the block: precisely the case where "your pace" is a lie. A plan
      // from an older phone decodes nil here and the line stays down, which is the honest default.
      restIsLearned: cur.restIsLearned == true,
      nextExerciseName: nil,
      nextExerciseGroup: nil,
      nextTargetWeight: nil,
      nextTargetReps: nil,
      completedExerciseName: nil,
      canMarkBusy: false, // no offline reorders — the phone owns plan mutations
      loadDeltaKg: nil,
      nextLoadDeltaKg: nil,
      liftIndex: lift.index,
      liftCount: lift.count,
      // Filled in by `project()`, which knows whether this frame is a set (the superset it is in)
      // or a rest (the one it leads into) — the choice the phone's projector makes. Until 2026-10-13
      // the wrist alone listed each lift's sets in a row and there was never one to name.
      superset: nil,
      // WT13c · GLANCE — the standalone engine owes the wrist the SAME two live figures the phone
      // sends, or a phone-absent workout glances at a blank. Same arithmetic as the closing
      // summary's `volumeKg` (bodyweight contributes 0), read off the sets already logged here.
      liveVolumeKg: workingSets.reduce(0.0) { $0 + ($1.actualWeight ?? 0) * Double($1.actualReps) },
      liveSets: workingSets.count,
      workoutName: state.workoutName,
      summary: nil,
      swapOptions: nil, // no offline swaps — the phone owns exercise selection
      nextSwapOptions: nil,
      loadSetup: nil,
      nextLoadSetup: nil,
      toLoad: nil,
      // No correction offline, and this is not a gap to fill later: Loop 1 lives on the phone, and
      // there is no second engine on the wrist — that is the standing rule, not an omission. A
      // standalone session executes the plan snapshot as prescribed; the phone re-decides the loads
      // when it reconciles the record. Saying nothing here is the honest answer.
      correction: nil
    )
  }

  /**
   * The workout, read back lift by lift — the wrist's closing beat (founder 2026-07-12/13).
   *
   * Port of the phone's `summaryLifts`, and it holds the phone's rule exactly: ONLY the lifts the
   * athlete performed, each with the best set they actually logged on it (best by volume). A lift
   * they never reached is not part of the workout that just happened and does not appear.
   *
   * A standalone workout finishes on the WATCH, with no phone in the room to project a summary for
   * it — so without this the read-back would not play for the athlete who trains furthest from
   * their phone, which is precisely the athlete this runtime exists for.
   */
  private func summaryLifts() -> [WireSummaryLift] {
    // A bridge is neither prescribed work nor a best set — the phone's line (`summaryLifts`).
    let sets = workingSets
    let frontier = sets.count
    var order: [String] = []
    var best: [String: WireRecordSet] = [:]
    func volume(_ s: WireRecordSet) -> Double { (s.actualWeight ?? 0) * Double(s.actualReps) }
    /// WITHIN one lift: heavier work wins; tied work — which is EVERY bodyweight set, whose volume
    /// is 0 by definition — goes to the longer set. The phone's comparator, to the letter
    /// (sessionMirror.ts / WellDone.tsx): a standalone workout must not read itself back
    /// differently from a phone-driven one.
    func better(_ a: WireRecordSet, _ b: WireRecordSet) -> Bool {
      volume(a) != volume(b) ? volume(a) > volume(b) : a.actualReps > b.actualReps
    }
    // ⚠️ BY THE SET'S OWN LIFT, NOT BY ITS INDEX (2026-10-13). This read "set i belongs to step i",
    // true while every step was a set. A hold is a step that writes no set, so past the first plank
    // every set was read back under the NEXT step's name.
    var names: [String: String] = [:]
    for step in state.steps where names[step.exerciseId] == nil { names[step.exerciseId] = step.exerciseName }
    for set in sets.prefix(frontier) {
      let name = names[set.exerciseId] ?? set.exerciseId
      if let cur = best[name] {
        if better(set, cur) { best[name] = set }
      } else {
        order.append(name)
        best[name] = set
      }
    }
    return order.map { name in
      let s = best[name]!
      // A lift with no load says its reps and nothing else — the phone's rule (`bestSetLabel`), not "BW".
      let w = s.actualWeight.map { $0.rounded() == $0 ? String(Int($0)) : String(format: "%.1f", $0) }
      return WireSummaryLift(name: name, best: w.map { "\($0) × \(s.actualReps)" } ?? "× \(s.actualReps)")
    }
  }

  private func completeFrame() -> WireMirror {
    let cur = state.steps[min(state.currentIndex, state.steps.count - 1)]
    var m = baseMirror(cur: cur, phase: "complete")
    // External tonnage moved, from the ACTUALS — so a standalone (phone-absent) workout reads
    // the same WT6 "T" metric a phone-driven one does. Bodyweight sets (weight nil) count 0.
    let volumeKg = workingSets.reduce(0.0) { $0 + ($1.actualWeight ?? 0) * Double($1.actualReps) }
    m.summary = WireSummary(
      timeLabel: timeLabel(fromISO: state.startedAt),
      sets: workingSets.count,
      up: progressedLifts(),
      volumeKg: volumeKg,
      lifts: summaryLifts()
    )
    return m
  }

  private func project() -> WireMirror {
    let cur = state.steps[min(state.currentIndex, state.steps.count - 1)]

    let next = state.currentIndex + 1 < state.steps.count ? state.steps[state.currentIndex + 1] : nil

    if state.phase == "paused" {
      var p = baseMirror(cur: cur, phase: "paused")
      // A pause keeps the superset of what it froze: the set she was on, or the round the rest led into.
      p.superset = isResting(state.pausedFrom ?? "active_set") ? next?.superset : cur.superset
      p.holdSeconds = cur.holdSeconds
      p.holdMetres = cur.holdMetres
      p.isWarmup = cur.isBridge
      return p
    }

    var m = baseMirror(cur: cur, phase: state.phase)
    // ⛔ A HOLD IS SAID AS A HOLD ON EVERY FRAME (2026-10-13): its seconds or its metres on the step
    // she is on — and, on a rest, on the step that rest leads into. The wrist's screens have drawn
    // these since 2026-09-17 for a session the phone runs; the engine now states them for its own.
    m.holdSeconds = cur.holdSeconds
    m.holdMetres = cur.holdMetres
    m.isWarmup = cur.isBridge
    if state.phase == "active_set" {
      m.loadDeltaKg = signedDelta(cur)
      m.loadSetup = cur.loadSetup
      m.toLoad = cur.isHold ? false : toLoad(cur)
      m.superset = cur.superset
      m.holdEndsAt = state.holdEndsAt
      m.awaitingReady = false
      // The warm-up the phone would offer before this set, while it is still on offer (`addWarmup`
      // takes it off the step once the bridges are in). A hold no plan gives one; said anyway.
      m.warmupOffered = cur.isBridge || cur.isHold ? nil : cur.ramp.map { $0.count }
      return m
    }

    // Resting: the presented step is the just-completed one; the NEXT step is the
    // set the rest leads into (phone parity).
    m.superset = next?.superset
    m.restEndsAt = state.restEndsAt
    if let end = WatchWire.parseDate(state.restEndsAt) {
      m.restRemainingS = max(0, Int(end.timeIntervalSince(now()).rounded()))
    }
    m.restTotalS = state.restTotalS
    m.nextExerciseName = next?.exerciseName
    m.nextExerciseGroup = next?.exerciseGroup
    m.nextTargetWeight = next?.targetWeight
    m.nextTargetReps = next?.targetReps
    m.nextSetsInExercise = next.map { position($0).m }
    // A rest that leads into a warm-up bridge says so, as the phone's does (2026-10-17: the wrist
    // alone runs the ramp she asks for — `addWarmup`).
    m.nextIsWarmup = next?.isBridge == true
    // The hold this rest leads into, when it is one (2026-10-13 — the plan carries holds now).
    m.nextHoldSeconds = next?.holdSeconds
    m.nextHoldMetres = next?.holdMetres
    // Nor a voice (2026-09-28): the wrist alone has no loading dialogue to offer Ready for, and no
    // hold whose one clock could run — both said explicitly, for the parity contract.
    m.awaitingReady = false
    m.holdEndsAt = nil
    // THE SET THAT IS COMING (parity with the phone's projector, 2026-07-12). The presented step
    // during a rest is the one just FINISHED — so a rest screen that renders `setLabel` counts the
    // set behind the athlete. This engine had the `next` step in its hand and never published its
    // label; standalone workouts were showing the wrong set number on the wrist for exactly as
    // long as the mirrored ones were.
    if let n = next {
      m.nextSetLabel = position(n).label
      m.nextSetNumber = position(n).n
    }
    if state.phase == "rest_transition" {
      m.completedExerciseName = cur.exerciseName
      m.nextLoadDeltaKg = signedDelta(next)
      m.nextLoadSetup = next?.loadSetup
    }
    return m
  }
}
