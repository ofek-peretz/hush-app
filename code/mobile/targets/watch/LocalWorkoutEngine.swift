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

  // MARK: Construction

  /// Fresh start from a plan workout (phone absent; Begin on the watch).
  init(workout: WirePlanWorkout, plan: WirePlan, store: WatchStore) {
    self.store = store
    self.state = LocalSessionState(
      recordId: UUID().uuidString,
      planId: plan.planId,
      workoutId: workout.id,
      workoutName: workout.name,
      startedAt: WatchWire.iso(Date()),
      phase: "active_set",
      pausedFrom: nil,
      pausedRestRemainingS: nil,
      currentIndex: 0,
      restEndsAt: nil,
      restTotalS: nil,
      restInterS: plan.restInterS,
      restTransitionS: plan.restTransitionS,
      steps: workout.steps,
      sets: []
    )
  }

  /// Restore after an app termination/crash. Returns nil on an unusable state.
  init?(restored: LocalSessionState, store: WatchStore) {
    guard !restored.steps.isEmpty, restored.currentIndex < restored.steps.count else { return nil }
    self.store = store
    self.state = restored
  }

  /// Persist + render the current state, catching up any wall-clock rest that
  /// elapsed while the app was dead. Call once after construction.
  func activate() {
    if isResting(state.phase), let end = WatchWire.parseDate(state.restEndsAt), end <= Date() {
      advancePastRest() // the rest finished while we were gone
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
    state.sets.append(WireRecordSet(
      exerciseId: step.exerciseId,
      setIndex: step.setIndexInExercise,
      blockId: step.blockId,
      recommendedWeight: step.targetWeight,
      recommendedReps: step.targetReps,
      actualWeight: weight,
      actualReps: reps,
      completedAt: WatchWire.iso(Date())
    ))
    let isLast = state.currentIndex >= state.steps.count - 1
    if isLast {
      finish(early: false)
      return
    }
    // Phone-machine parity: the index stays on the completed set during the rest;
    // the next set presents when the rest ends.
    let next = state.steps[state.currentIndex + 1]
    let transition = next.exerciseId != step.exerciseId
    beginRest(transition: transition)
  }

  /// "Ready" — end the running rest now.
  func endRest() {
    guard !finished, isResting(state.phase) else { return }
    advancePastRest()
  }

  /// "+15 sec" — extend the running rest.
  func addRest(seconds: Int) {
    guard !finished, isResting(state.phase), let end = WatchWire.parseDate(state.restEndsAt) else { return }
    state.restEndsAt = WatchWire.iso(end.addingTimeInterval(TimeInterval(seconds)))
    state.restTotalS = (state.restTotalS ?? 0) + seconds
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
      state.pausedRestRemainingS = max(0, Int(end.timeIntervalSince(Date()).rounded()))
    }
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
    if isResting(from) {
      let remaining = state.pausedRestRemainingS ?? 0
      state.pausedRestRemainingS = nil
      if remaining <= 0 {
        advancePastRest()
        return
      }
      state.restEndsAt = WatchWire.iso(Date().addingTimeInterval(TimeInterval(remaining)))
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

  // MARK: Internals

  private func isResting(_ phase: String) -> Bool {
    phase == "rest_inter" || phase == "rest_transition"
  }

  private func beginRest(transition: Bool) {
    // Per-tier rest (S2): the just-completed step carries its exercise's between-sets rest;
    // the plan-level value is the fallback for a snapshot from an older phone build.
    let stepRestS = state.steps.indices.contains(state.currentIndex) ? state.steps[state.currentIndex].restInterS : nil
    let restS = transition ? state.restTransitionS : (stepRestS ?? state.restInterS)
    state.phase = transition ? "rest_transition" : "rest_inter"
    state.restEndsAt = WatchWire.iso(Date().addingTimeInterval(TimeInterval(restS)))
    state.restTotalS = restS
    persist()
    scheduleRestAdvance()
    emit()
  }

  private func advancePastRest() {
    cancelRestAdvance()
    state.currentIndex = min(state.currentIndex + 1, state.steps.count - 1)
    state.phase = "active_set"
    state.restEndsAt = nil
    state.restTotalS = nil
    persist()
    emit()
  }

  /// Wall-clock rest ending: a work item at the absolute end instant. The
  /// HKWorkoutSession keeps the app executing in the background so this fires
  /// wrist-down; if the app dies anyway, activate() catches the elapsed rest up.
  private func scheduleRestAdvance() {
    cancelRestAdvance()
    guard isResting(state.phase), let end = WatchWire.parseDate(state.restEndsAt) else { return }
    let delay = max(0.05, end.timeIntervalSince(Date()))
    let work = DispatchWorkItem { [weak self] in
      guard let self, !self.finished, self.isResting(self.state.phase) else { return }
      self.advancePastRest()
    }
    restWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
  }

  private func cancelRestAdvance() {
    restWork?.cancel()
    restWork = nil
  }

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
      endedAt: WatchWire.iso(Date()),
      earlyFinish: early,
      sets: state.sets
    )
    // Durability order: the record enters the outbox BEFORE the active session is
    // cleared — a crash between the two re-offers a completed workout to the
    // outbox, never loses one (the phone de-dupes).
    if !record.sets.isEmpty {
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
    var runs = 0
    var curRun = 1
    var prev: String?
    for (i, s) in state.steps.enumerated() {
      if s.exerciseId != prev {
        runs += 1
        prev = s.exerciseId
      }
      if i == idx { curRun = runs }
    }
    return (max(curRun, 1), max(runs, 1))
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
    let started = WatchWire.parseDate(iso) ?? Date()
    let s = max(0, Int(Date().timeIntervalSince(started).rounded()))
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

  private func baseMirror(cur: WirePlanStep, phase: String) -> WireMirror {
    let lift = liftPosition(at: min(state.currentIndex, state.steps.count - 1))
    return WireMirror(
      schema: MIRROR_SCHEMA_VERSION,
      phase: phase,
      exerciseName: cur.exerciseName,
      exerciseGroup: cur.exerciseGroup,
      setLabel: "Set \(cur.setIndexInExercise + 1) of \(cur.totalSetsInExercise)",
      setNumber: cur.setIndexInExercise + 1,
      setsInExercise: cur.totalSetsInExercise,
      nextSetsInExercise: nil,
      globalIndex: cur.globalIndex,
      totalSets: state.steps.count,
      targetWeight: cur.targetWeight,
      targetReps: cur.targetReps,
      restEndsAt: nil,
      restRemainingS: nil,
      restTotalS: nil,
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
      workoutName: state.workoutName,
      summary: nil,
      swapOptions: nil, // no offline swaps — the phone owns exercise selection
      nextSwapOptions: nil,
      loadSetup: nil,
      nextLoadSetup: nil,
      toLoad: nil
    )
  }

  private func completeFrame() -> WireMirror {
    let cur = state.steps[min(state.currentIndex, state.steps.count - 1)]
    var m = baseMirror(cur: cur, phase: "complete")
    m.summary = WireSummary(
      timeLabel: timeLabel(fromISO: state.startedAt),
      sets: state.sets.count,
      up: progressedLifts()
    )
    return m
  }

  private func project() -> WireMirror {
    let cur = state.steps[min(state.currentIndex, state.steps.count - 1)]

    if state.phase == "paused" {
      return baseMirror(cur: cur, phase: "paused")
    }

    var m = baseMirror(cur: cur, phase: state.phase)
    if state.phase == "active_set" {
      m.loadDeltaKg = signedDelta(cur)
      m.loadSetup = cur.loadSetup
      m.toLoad = toLoad(cur)
      return m
    }

    // Resting: the presented step is the just-completed one; the NEXT step is the
    // set the rest leads into (phone parity).
    let next = state.currentIndex + 1 < state.steps.count ? state.steps[state.currentIndex + 1] : nil
    m.restEndsAt = state.restEndsAt
    if let end = WatchWire.parseDate(state.restEndsAt) {
      m.restRemainingS = max(0, Int(end.timeIntervalSince(Date()).rounded()))
    }
    m.restTotalS = state.restTotalS
    m.nextExerciseName = next?.exerciseName
    m.nextExerciseGroup = next?.exerciseGroup
    m.nextTargetWeight = next?.targetWeight
    m.nextTargetReps = next?.targetReps
    m.nextSetsInExercise = next?.totalSetsInExercise
    if state.phase == "rest_transition" {
      m.completedExerciseName = cur.exerciseName
      m.nextLoadDeltaKg = signedDelta(next)
      m.nextLoadSetup = next?.loadSetup
    }
    return m
  }
}
