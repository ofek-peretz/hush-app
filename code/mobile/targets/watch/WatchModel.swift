import Combine
import Foundation
import HealthKit
import SwiftUI

// The watch's single source of *presentation* state. It holds the latest phone
// mirror (advancing only on a higher authoritySeq), the pre-session lobby, the
// connection state, and the transient LOCAL UI the design needs (a committed Edit
// override shown until Complete Set; the Set Confirmation interstitial). Inline edit
// mode, the Choose overlay, and the Swap overlay are VIEW-local (driven from the
// lobby/mirror) and do not live here.
//
// Authority arbitration (standalone track): when the phone is absent, a
// LocalWorkoutEngine executes the stored plan snapshot and its frames take
// precedence over phone envelopes until the local session is dismissed. Under
// phone authority the watch still owns no workout state.
//
// `screen` is the Swift port of projectWatchScreen() (watchPresentation.ts):
// connection-lost wins, then the Set Confirmation interstitial, then the live
// phase / pre-session lobby.

enum ConnectionState { case connected, reconnecting }

/// A committed weight/reps override (from inline Edit) shown on Active Set until the
/// set is completed; the Complete Set intent carries it.
struct EditDraft: Equatable {
  var weight: Double?
  var reps: Int
}

/// Which slot a one-tap swap replaced — the CURRENT lift (Active Set) or the NEXT one
/// (Transition Rest). The undo offer resolves against the matching option pool only.
enum SwapUndoContext { case current, next }

/// The closing record of a wrist run/walk — snapshotted at Finish (the OS runtime clears its
/// live metrics as it persists the HKWorkout, so the summary must be captured first).
struct CardioSummary: Equatable {
  var gait: String
  var elapsedS: TimeInterval
  var distanceKm: Double?
  var kcal: Int?
}

/// The screen to render, with the data each one needs.
/// CR3 · KM LOGGED — one whole kilometre, closed. Facts only: which kilometre, how long it took,
/// and whether it was the quickest of this recording. Nothing here is a target or a grade.
struct KmSplit: Equatable {
  let km: Int
  let splitS: TimeInterval
  let quickest: Bool
}

enum WatchScreen: Equatable {
  case idle
  case start(WireLobby)
  case connectionLost(mirror: WireMirror?)
  case workoutComplete(WireMirror)
  case setConfirmation(weight: Double?, reps: Int, index: Int, total: Int)
  case activeSet(WireMirror, draft: EditDraft?)
  case interRest(WireMirror)
  case transitionRest(WireMirror)
  case paused
  /// Watch-local run/walk (founder 2026-07-10): recorded on the wrist via the OS
  /// workout runtime (HR/kcal/distance), persisted to Health — never engine state.
  case cardio(gait: String, paused: Bool)
  case cardioComplete(CardioSummary)
}

final class WatchModel: ObservableObject {
  @Published private(set) var screen: WatchScreen = .idle

  private var mirror: WireMirror?
  private var lobby: WireLobby?
  // ---- Standalone (watch-local authority) ----
  // When the phone is absent, the watch runs the workout itself: the local engine
  // executes the stored plan snapshot and emits the SAME mirror frames the phone
  // would, so screens/haptics/runtime are authority-agnostic. Arbitration rule
  // (permanent): a LIVE LOCAL SESSION always wins the display; the phone's state
  // is still ingested underneath and takes over once the local session is
  // dismissed. A local session can only START when the phone is unreachable.
  private let store = WatchStore()
  private var localEngine: LocalWorkoutEngine?
  private var localMirror: WireMirror?
  /// The workout picked on the offline Start screen (phone absent — no phone to
  /// own the selection). Presentation-only until Begin.
  private var offlineQueuedWorkoutId: String?
  /// The frame to render from: the local authority when live, else the phone's.
  private var effectiveMirror: WireMirror? { localMirror ?? mirror }
  /// Training is behind the paywall right now (the phone's live lobby wins; falls back to
  /// the last flag it published this process).
  private var gatedNow: Bool { lobby?.gated ?? lastKnownGated }
  // Optimistic: assume connected until a sustained drop proves otherwise (item 5). The honest
  // "Reconnecting" viewer must be rare — a brief unreachable blip (display asleep, phone app
  // backgrounded) is normal and applicationContext still syncs, so we keep showing the last mirror.
  private var connection: ConnectionState = .connected
  private var highestSeq = Int.min

  // Local UI (presentation only — never workout state).
  private var editDraft: EditDraft?
  private var setConfirm: (weight: Double?, reps: Int, index: Int, total: Int)?
  private var setConfirmToken = 0

  // One-tap swap safety net (founder 2026-07-12): the tap applies instantly, so the moment
  // after it carries an Undo. The original lift is re-identified BY NAME among the NEW
  // exercise's own alternatives once the post-swap frame lands (the synonym pool is mutual —
  // domain/swapPool ranks both ways), so no protocol change is needed. If the original
  // doesn't surface among them (rare deep pool), the offer simply never appears.
  private var pendingUndo: (name: String, at: Date, context: SwapUndoContext)?
  @Published private var undoOption: WireSwapOption?
  private var undoContext: SwapUndoContext?
  private var undoExpiry: DispatchWorkItem?
  /// The live undo offer for the CURRENT lift (Active Set reads this), and for the NEXT
  /// one (Transition Rest). Exactly one can be live at a time.
  var currentUndo: WireSwapOption? { undoContext == SwapUndoContext.current ? undoOption : nil }
  var nextUndo: WireSwapOption? { undoContext == SwapUndoContext.next ? undoOption : nil }

  // Km-split beat (founder 2026-07-12): one strong haptic per whole kilometre of a wrist
  // run/walk — the wrist is the runner's eyes. Reset at every cardio start.
  private var lastKmSplit = 0
  /// CR3 · KM LOGGED — the split just closed, held for the beat the screen is on stage, then
  /// cleared. Published so the cardio stage can hand it straight to the view; the km itself and
  /// its seconds are FACTS off the runtime clock, never an estimate.
  @Published private(set) var kmSplit: KmSplit?
  /// The elapsed second each whole kilometre closed at — the split is the gap between two of them.
  private var kmMarks: [TimeInterval] = []
  /// The quickest split of THIS recording, so the screen can say when one is her best.
  private var bestSplitS: TimeInterval?
  private var cancellables = Set<AnyCancellable>()

  // Watch-local cardio (run/walk): a live recording OWNS the display + the OS runtime
  // until ended. Pure watch state — the strength engine/mirror never sees it.
  private var cardioGait: String?
  private var cardioPaused = false
  // The clock must never freeze. HKLiveWorkoutBuilder.elapsedTime is the truth when the OS
  // runtime is live, but HealthKit can be unavailable or denied — then these carry an honest
  // wall-clock elapsed (pause-aware) so the athlete still sees their time running.
  private var cardioStartedAt: Date?
  private var cardioPausedAt: Date?
  private var cardioPausedTotal: TimeInterval = 0
  /// The finished run/walk, held until the athlete taps Done (the wrist CLOSES the activity —
  /// it never just vanishes back to the lobby).
  private var cardioSummary: CardioSummary?

  /// A completed WORKOUT frame, held until Done (founder 2026-07-11: "the completion screen is
  /// gone from the watch"). The phone republishes its lobby the instant the program updates —
  /// which used to overwrite the complete frame within a second, so the athlete never saw it.
  /// The completion belongs to the watch until dismissed; lobby envelopes still land underneath.
  private var completeHold: WireMirror?
  /// Active calories for that finished workout, captured as the frame lands — the OS runtime
  /// clears its live metrics while it persists the HKWorkout, so reading them later gives nil.
  private var completeKcal: Int?
  /// Read by the Complete screen (the workout's energy replaced its set count).
  var completedKcal: Int? { completeKcal }

  // Begin fallback (founder 2026-07-10, "it froze — wouldn't let me start"): a
  // reachable phone whose app never answers the start intent must not strand the
  // athlete on Start — after a short grace the watch runs the stored plan itself.
  // `fallbackStarted` marks a local session created this way: it is provisional, so a
  // phone that answers late (before any set is logged) reclaims authority in apply().
  private var beginFallback: DispatchWorkItem?
  private var fallbackStarted = false
  /// The paywall gate as last published by the phone. A gated athlete must not be able to
  /// start a workout from the wrist — not through the phone (it would only open the
  /// paywall, leaving Begin dead) and not standalone (which would bypass the purchase).
  private var lastKnownGated = false

  // Connection grace: only fall back to the Reconnecting viewer after a SUSTAINED unreachable gap.
  private var graceWork: DispatchWorkItem?
  private let reconnectGraceS: TimeInterval = 12
  // Locally-scheduled rest countdown + completion haptics (item 7) — the watch OWNS the rest
  // haptics (it fires reliably wrist-down/screen-off), anchored to the phone's absolute rest end.
  private var restHaptics: [DispatchWorkItem] = []
  private var lastReturnHaptic = Date.distantPast

  private let manager = WatchSessionManager()
  // OS-level workout runtime (HKWorkoutSession): background execution during a workout +
  // HealthKit persistence. Driven from the authoritative mirror in syncWorkoutRuntime().
  private let workoutRuntime = WorkoutRuntime()
  /// Live HR / kcal / elapsed from the OS runtime — observed by the Controls page.
  var liveMetrics: LiveMetrics { workoutRuntime.metrics }
  /// Fired when a screen is entered, so the view can play the entry haptic.
  let onEntryHaptic = PassthroughSubject<HapticEvent, Never>()

  /// Start is driven from the root view's onAppear, which can fire more than once in a
  /// process — every subscription and activation here must happen exactly once (a second
  /// pass would, among other things, double every km-split beat).
  private var didStart = false

  func start() {
    guard !didStart else { return }
    didStart = true
    manager.model = self
    manager.activate()
    workoutRuntime.requestAuthorization()
    // A recovered still-live RUN/WALK re-enters the cardio presentation (founder batch
    // 2026-07-10): without this, cardioGait is lost across a relaunch and the next
    // phone envelope (no live phase) would abandon() the athlete's recording.
    workoutRuntime.onAdoptedActivity = { [weak self] activity in
      guard let self, self.cardioGait == nil, self.localEngine == nil else { return }
      switch activity {
      case .running: self.cardioGait = "run"
      case .walking: self.cardioGait = "walk"
      default: return // strength — the phone / local authority drives it as before
      }
      self.cardioPaused = false
      // The watch owns the cardio clock (founder 2026-07-11), so a RECOVERED run must
      // recover its clock too — without this the relaunch showed 0:00 for a run already
      // 40 minutes old. The OS builder's elapsed is the honest anchor; km splits resume
      // from the distance already collected instead of re-firing every past kilometre.
      let alreadyRun = self.workoutRuntime.metrics.elapsed() ?? 0
      self.cardioStartedAt = Date().addingTimeInterval(-alreadyRun)
      self.cardioPausedAt = nil
      self.cardioPausedTotal = 0
      self.lastKmSplit = Int(self.workoutRuntime.metrics.distanceKm ?? 0)
      self.recompute()
    }
    workoutRuntime.recoverActiveSession()
    // The km-split beat: fires on every WHOLE kilometre a wrist run/walk collects.
    workoutRuntime.metrics.$distanceKm
      .compactMap { $0 }
      .sink { [weak self] km in self?.kmTicked(km) }
      .store(in: &cancellables)
    // ONE NUMBER PER WORKOUT (founder 2026-07-28). The standalone engine builds its record and
    // enqueues it DURABLY inside its own `finish()`, so the measured energy has to already be on
    // the engine by then — stamping it afterwards would send a figure the outbox copy does not
    // carry, and a replay after a crash would deliver the other one. Kept current here instead, on
    // every reading, so whenever the last set lands the record is already right.
    workoutRuntime.metrics.$activeKcal
      .sink { [weak self] kcal in self?.localEngine?.measuredKcal = kcal }
      .store(in: &cancellables)
    // Standalone recovery: a local session that survived an app termination
    // resumes exactly where it was (elapsed rests are caught up wall-clock).
    if localEngine == nil,
       let saved = store.loadActiveSession(),
       let engine = LocalWorkoutEngine(restored: saved, store: store) {
      adoptLocal(engine)
      engine.activate()
    }
    flushOutbox()
    recompute()
  }

  /// The watch app returned to the foreground (raise-to-wake / reopened). A gentle "you're back in
  /// the workout" cue during a live session (item 6); debounced so a wake that also reconnects
  /// never double-buzzes.
  func appBecameActive() { signalReturnToWorkout() }

  private func signalReturnToWorkout() {
    guard cardioGait == nil else { return } // a run/walk is its own stage — no lift cue on it
    guard let m = effectiveMirror, m.phase != "complete", m.phase != "paused" else { return }
    let now = Date()
    guard now.timeIntervalSince(lastReturnHaptic) > 2 else { return }
    lastReturnHaptic = now
    onEntryHaptic.send(.reconnected)
  }

  // MARK: Inbound (from WatchSessionManager)

  func apply(_ envelope: WireEnvelope) {
    guard envelope.authoritySeq > highestSeq else { return } // reorder-proof
    highestSeq = envelope.authoritySeq

    // Standalone execution data: persist every published plan snapshot so a
    // workout can start with the phone absent, days after this envelope.
    if let plan = envelope.plan { store.savePlan(plan) }

    let prev = mirror
    mirror = envelope.mirror
    lobby = envelope.lobby
    if let l = envelope.lobby { lastKnownGated = l.gated == true }

    let phoneLive = ["active_set", "rest_inter", "rest_transition", "paused"].contains(mirror?.phase ?? "")

    // A NEW live workout always wins a completion the athlete never dismissed (they walked away
    // from the wrist and started the next session on the phone) — the held frame is stale. The
    // same goes for a run/walk summary still sitting on the stage.
    if phoneLive {
      completeHold = nil
      completeKcal = nil
      cardioSummary = nil
    }

    // Two authorities can never run at once. The Begin FALLBACK starts a local session when
    // the phone doesn't answer in time — if that phone then answers LATE with a live session,
    // it reclaims authority here: the untouched local session (no set logged) is discarded
    // without a trace. Once the athlete has logged a set on the wrist, the local session is
    // the truth and keeps it (the phone's session reconciles against the transferred record).
    if let engine = localEngine, fallbackStarted, phoneLive, engine.state.sets.isEmpty {
      engine.discard()
      localEngine = nil
      localMirror = nil
      fallbackStarted = false
      cancelRestHaptics() // beats scheduled against the discarded local rest
    }

    // A live LOCAL session (strength engine or a wrist run/walk) owns the display,
    // the haptics, and the OS runtime — phone state is recorded above (it takes over
    // after dismissal) but must not drive side effects mid-local-activity (a phone
    // frame must never abandon() the runtime out from under a live recording).
    if localEngine != nil || cardioGait != nil {
      recompute()
      return
    }

    // A live frame answers a pending Begin — the fallback is no longer needed.
    if phoneLive {
      beginFallback?.cancel()
      beginFallback = nil
    }

    let phaseChanged = prev?.phase != mirror?.phase
    let indexChanged = prev?.globalIndex != mirror?.globalIndex
    if phaseChanged || indexChanged {
      // A new set invalidates any in-flight Edit override.
      if mirror?.phase != "active_set" || indexChanged { editDraft = nil }
      // …and closes the swap-undo window: the offer belongs to the moment of the swap.
      // (The swap frame itself changes neither phase nor globalIndex — same slot.)
      clearUndo()
    }
    resolveUndo(with: mirror)
    // The workout is over: the completion experience supersedes any in-flight per-set confirmation,
    // so clear it immediately (otherwise the 1.5s Set Confirmation would mask Workout Complete — the
    // "watch doesn't show the completion experience" defect, item 3). The frame is also HELD (see
    // completeHold) so the phone's next lobby publish can't wipe the completion off the wrist.
    if let m = mirror, m.phase == "complete" {
      setConfirmToken += 1
      setConfirm = nil
      completeHold = m
      completeKcal = liveMetrics.activeKcal // BEFORE syncWorkoutRuntime finishes + clears them
    }
    syncRestHaptics(prev: prev, next: mirror)
    syncWorkoutRuntime(phase: mirror?.phase)
    recompute()
  }

  /// Drive the OS workout runtime from the authoritative phase: live phases hold an
  /// HKWorkoutSession open (background execution + sensor collection), complete persists
  /// the workout to HealthKit, and a session that evaporates without completing (back to
  /// the lobby / idle) is discarded. Every call is idempotent. Authority-agnostic — the
  /// phone's mirror and the local engine drive it through the same mapping.
  private func syncWorkoutRuntime(phase: String?) {
    switch phase {
    case "active_set", "rest_inter", "rest_transition":
      workoutRuntime.trackLive(paused: false)
    case "paused":
      workoutRuntime.trackLive(paused: true)
    case "complete":
      workoutRuntime.finish()
    default:
      workoutRuntime.abandon()
    }
  }

  // MARK: Standalone — local authority lifecycle

  private func adoptLocal(_ engine: LocalWorkoutEngine) {
    localEngine = engine
    // Synchronous adoption: every engine entry point (UI actions, activate(), the
    // rest work item) already runs on the main queue, and synchronous frames keep
    // action → screen ordering deterministic (e.g. the last-set completion frame
    // lands BEFORE completeSet() decides whether to show the set confirmation).
    engine.onFrame = { [weak self] frame in self?.adoptLocalFrame(frame) }
    engine.onComplete = { [weak self] record, frame in
      self?.localCompleted(record: record, frame: frame)
    }
  }

  private func adoptLocalFrame(_ frame: WireMirror) {
    let prev = localMirror
    localMirror = frame
    syncRestHaptics(prev: prev, next: frame)
    syncWorkoutRuntime(phase: frame.phase)
    recompute()
  }

  private func localCompleted(record: WireSessionRecord, frame: WireMirror) {
    // The completion experience supersedes any in-flight set confirmation (same
    // rule as the phone-authority path) and is held until Done.
    setConfirmToken += 1
    setConfirm = nil
    completeHold = frame
    completeKcal = liveMetrics.activeKcal // captured before the runtime finishes + clears them
    let prev = localMirror
    localMirror = frame
    syncRestHaptics(prev: prev, next: frame)
    syncWorkoutRuntime(phase: frame.phase) // "complete" → persist the HKWorkout
    if !record.sets.isEmpty { manager.transferRecord(record) }
    recompute()
  }

  /// Begin with the phone unreachable: run the stored plan locally. No plan / all
  /// workouts done → inert (the Start screen would not have been shown).
  /// `viaFallback` marks a session started because a REACHABLE phone never answered —
  /// provisional, so a late phone answer can still reclaim authority (see apply()).
  private func startLocalWorkout(viaFallback: Bool = false) {
    guard localEngine == nil, !gatedNow, let stored = store.loadPlan() else { return }
    let remaining = stored.plan.workouts.filter { !stored.doneWorkoutIds.contains($0.id) }
    let targetId = offlineQueuedWorkoutId ?? lobby?.workoutId
    guard let workout = remaining.first(where: { $0.id == targetId }) ?? remaining.first else { return }
    offlineQueuedWorkoutId = nil
    completeHold = nil // a fresh workout supersedes an undismissed completion
    let engine = LocalWorkoutEngine(workout: workout, plan: stored.plan, store: store)
    fallbackStarted = viaFallback
    adoptLocal(engine)
    engine.activate()
  }

  /// The Start screen with no phone: derived from the stored plan snapshot, so the
  /// watch is fully bootable on its own. Phone-published lobbies take precedence.
  private func offlineLobby() -> WireLobby? {
    guard let stored = store.loadPlan() else { return nil }
    let remaining = stored.plan.workouts.filter { !stored.doneWorkoutIds.contains($0.id) }
    guard !remaining.isEmpty else { return nil }
    let queued = remaining.first { $0.id == offlineQueuedWorkoutId } ?? remaining[0]
    let lifts = Set(queued.steps.map { $0.exerciseId }).count
    return WireLobby(
      workoutId: queued.id,
      workoutName: queued.name,
      muscles: queued.muscles,
      lifts: lifts,
      durationLabel: "~\(lifts * 8) min",
      resting: false,
      // The last gate the phone published (in this process). Unknown after a relaunch →
      // false, which preserves the standalone contract: an offline athlete who already
      // has a plan can train; the paywall is settled the next time the phone is present.
      gated: lastKnownGated,
      workouts: stored.plan.workouts.map { w in
        WireLobbyWorkout(
          id: w.id,
          name: w.name,
          lifts: Set(w.steps.map { $0.exerciseId }).count,
          muscles: w.muscles,
          done: stored.doneWorkoutIds.contains(w.id)
        )
      }
    )
  }

  /// Re-offer every unacked local session record (at-least-once; the phone
  /// de-dupes on recordId and acks durably).
  private func flushOutbox() {
    for record in store.outboxRecords() {
      manager.transferRecord(record)
    }
    // The wrist's runs travel the same way (founder 2026-07-28). Flushed in the same breath, so a
    // reconnect settles BOTH queues; a run that waited three days for the phone still lands.
    for record in store.outboxCardioRecords() {
      manager.transferCardioRecord(record)
    }
  }

  /// The phone durably acknowledged a record — reconciliation is complete.
  ///
  /// One ack clears both queues, because one channel carries both and the id is unique across them
  /// (a UUID). Removing from the queue that does not hold it is a no-op, so the ack stays a single
  /// call and cannot half-clear.
  func recordAcked(_ recordId: String) {
    store.removeRecord(recordId)
    store.removeCardioRecord(recordId)
  }

  func setReachable(_ reachable: Bool) {
    if reachable {
      graceWork?.cancel()
      graceWork = nil
      flushOutbox() // the phone is back — re-offer any unacked local session records
      guard connection != .connected else { return }
      connection = .connected
      recompute()
      signalReturnToWorkout() // came back during a live session → the return cue (item 6)
      return
    }
    // A dropped reachability is NORMAL (display asleep / phone app backgrounded); keep showing the
    // last mirror and only fall back to the honest Reconnecting viewer after a sustained gap.
    guard connection == .connected, graceWork == nil else { return }
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.graceWork = nil
      self.connection = .reconnecting
      self.recompute()
    }
    graceWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + reconnectGraceS, execute: work)
  }

  // MARK: Rest haptics (locally scheduled against the phone's absolute rest end)

  /// (Re)schedule the rest countdown + GO haptics when a rest begins or its end moves (+15 / resume);
  /// cancel them when rest ends, is skipped, or the phase otherwise changes.
  private func syncRestHaptics(prev: WireMirror?, next: WireMirror?) {
    let isRest: (WireMirror?) -> Bool = { $0?.phase == "rest_inter" || $0?.phase == "rest_transition" }
    let nowRest = isRest(next)
    let wasRest = isRest(prev)
    let endChanged = prev?.restEndsAt != next?.restEndsAt
    if nowRest, let endIso = next?.restEndsAt, let end = WatchWire.parseDate(endIso), (!wasRest || endChanged) {
      scheduleRestHaptics(endsAt: end, isTransition: next?.phase == "rest_transition")
    } else if !nowRest {
      cancelRestHaptics()
    }
  }

  private func cancelRestHaptics() {
    for w in restHaptics { w.cancel() }
    restHaptics = []
  }

  private func scheduleRestHaptics(endsAt: Date, isTransition: Bool) {
    cancelRestHaptics()
    let now = Date()
    // "The Approach": soft awareness at T-7, rising at T-3/-2, crisp at T-1, then the GO at 0 —
    // a new lift gets the distinct exercise-boundary triple, a next set the rest-elapsed double.
    let plan: [(TimeInterval, HapticEvent)] = [
      (-7, .restApproach), (-3, .restApproach), (-2, .restApproach), (-1, .restApproachFinal),
      (0, isTransition ? .exerciseBoundary : .restElapsed),
    ]
    for (offset, event) in plan {
      let intended = endsAt.addingTimeInterval(offset)
      let delay = intended.timeIntervalSince(now)
      guard delay > 0.05 else { continue } // beats already in the past are skipped (no buzz storm)
      let work = DispatchWorkItem { [weak self] in
        // Late-delivery guard (founder 2026-07-10: "the 7s buzz fired at 3s"): a beat the
        // system delivered late — a briefly suspended runloop batches its timers on wake —
        // is STALE. Buzzing the wrong count teaches the wrong rhythm; skip it. The GO beat
        // (offset 0) gets a wider window so the rest-over signal itself is never lost.
        let lateBy = -intended.timeIntervalSinceNow
        let tolerance: TimeInterval = offset == 0 ? 3.0 : 1.2
        guard lateBy < tolerance else { return }
        self?.onEntryHaptic.send(event)
      }
      restHaptics.append(work)
      DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }
  }

  // MARK: Local UI — inline Edit (committed override) + Set Confirmation

  /// Commit the inline Edit (load + reps): shown on Active Set until Complete logs it.
  func saveEdit(weight: Double?, reps: Int) {
    editDraft = EditDraft(weight: weight, reps: max(0, reps))
    recompute()
  }

  /// The current shown weight/reps (override if present, else the target) — the
  /// inline editor seeds from this.
  func currentDraft() -> EditDraft {
    if let d = editDraft { return d }
    return EditDraft(weight: effectiveMirror?.targetWeight, reps: effectiveMirror?.targetReps ?? 0)
  }

  private func scheduleSetConfirmClear() {
    setConfirmToken += 1
    let token = setConfirmToken
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
      guard let self, self.setConfirmToken == token else { return }
      self.setConfirm = nil
      self.recompute()
    }
  }

  /// Tap on the Set Confirmation advances immediately.
  func dismissSetConfirm() {
    guard setConfirm != nil else { return }
    setConfirmToken += 1
    setConfirm = nil
    recompute()
  }

  // MARK: Outbound actions — routed to the live authority.
  // Phone authority: proposals (the phone validates + decides). Local authority:
  // the engine IS the decision — same UI, no phone involved.

  func completeSet() {
    guard let m = effectiveMirror else { return }
    let weight = editDraft?.weight ?? m.targetWeight
    let reps = editDraft?.reps ?? m.targetReps
    let confirm = (weight: weight, reps: reps, index: m.setNumber ?? 1, total: m.setsInExercise ?? 1)
    if let engine = localEngine {
      engine.completeSet(weight: weight, reps: reps)
    } else {
      let edited = editDraft != nil
      sendIntent(
        type: "complete_set",
        expectedIndex: m.globalIndex,
        actualReps: edited ? reps : nil,
        actualWeight: edited ? weight : nil
      )
    }
    editDraft = nil
    // The LAST local set completes the workout synchronously — the completion
    // experience then supersedes the per-set confirmation (same rule as apply()).
    guard localMirror?.phase != "complete" else { return }
    setConfirm = confirm
    recompute()
    scheduleSetConfirmClear()
  }

  func ready() {
    if let engine = localEngine { engine.endRest() } else { sendIntent(type: "end_rest") }
  }

  func addRest() {
    if let engine = localEngine { engine.addRest(seconds: 15) } else { sendIntent(type: "add_rest", seconds: 15) }
  }

  func pause() {
    if let engine = localEngine { engine.pause() } else { sendIntent(type: "pause") }
  }

  func resume() {
    if let engine = localEngine { engine.resume() } else { sendIntent(type: "resume") }
  }

  func endWorkout() {
    if let engine = localEngine { engine.finishEarly() } else { sendIntent(type: "finish_early") }
  }

  /// The athlete flagged a body area that hurts (WT14). It is a REPORT, not a session action: it
  /// never touches the local engine's execution — it rides to the phone as `report_pain`, and the
  /// phone (which owns the body map + the model) decides what to do with it. Sent only when the
  /// phone is the authority; a standalone wrist session has no channel and no store for it, so it
  /// simply surfaces nothing rather than pretending to record.
  /// WT14 → WT14b. The wrist asks the same two questions the phone asks — WHERE, then HOW SHARP —
  /// and sends both. Nothing is assumed on her behalf: without a severity the phone records nothing,
  /// so the flow is only ever complete or absent, never half-guessed.
  /// Returns TRUE when the report actually left for the phone.
  ///
  /// It matters because WT15 says "Easing your <muscle> today" — a claim about something the PHONE
  /// does (the body map, the ease window, the swaps). On a standalone wrist session there is no
  /// channel and no local store for a pain flag, so the report goes nowhere; drawing the
  /// acknowledgement anyway would be Hush stating, in its own voice, that it had acted when it had
  /// not. The wrist takes the flag with a haptic either way — she was heard — and only claims the
  /// ease when the phone is there to make it.
  @discardableResult
  func reportPain(_ area: String, severity: String) -> Bool {
    onEntryHaptic.send(.paused) // a quiet acknowledgement that the flag was taken
    guard localEngine == nil, manager.isReachable else { return false }
    sendIntent(type: "report_pain", area: area, severity: severity)
    return true
  }

  func dismissComplete() {
    completeHold = nil // the athlete closed the completion — the lobby may take the stage again
    completeKcal = nil
    // Local authority: the record is already durable in the outbox and the active
    // session cleared — dismissal just tears the local presentation down (the
    // phone's state, or the offline Start lobby, takes over).
    if localEngine != nil {
      localEngine = nil
      localMirror = nil
      fallbackStarted = false
      recompute()
      return
    }
    // Phone authority: the phone has already saved + torn down the watch session by
    // the time the Complete frame arrives, so there's nothing to send. Clear the
    // local mirror so Done leaves the Complete screen immediately (→ the Start lobby
    // once the phone republishes it, else idle).
    mirror = nil
    recompute()
  }

  func begin() {
    guard localEngine == nil, cardioGait == nil else { return }
    // Paywall: a gated athlete starts nothing from the wrist (the phone owns the purchase).
    // The Start screen already renders the "continue on iPhone" state, so this is defense
    // in depth — and it keeps the Begin fallback below from bypassing the gate.
    guard !gatedNow else { return }
    if manager.isReachable {
      // The phone is present — it stays the authority over the session lifecycle.
      sendIntent(type: "start_workout", workoutId: lobby?.workoutId)
      // …but a phone that never ANSWERS (app killed / asleep — sendMessage silently
      // evaporates) must not leave a dead Begin button. If no live frame arrives
      // within the grace and a plan snapshot exists, the watch starts the workout
      // itself; the standalone record reconciles to the phone later (de-duped).
      beginFallback?.cancel()
      let work = DispatchWorkItem { [weak self] in
        guard let self else { return }
        self.beginFallback = nil
        let live = ["active_set", "rest_inter", "rest_transition", "paused"].contains(self.mirror?.phase ?? "")
        guard !live, self.localEngine == nil, self.cardioGait == nil else { return }
        self.startLocalWorkout(viaFallback: true)
      }
      beginFallback = work
      DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: work)
    } else {
      // Phone absent — the watch runs the stored plan itself (standalone).
      startLocalWorkout()
    }
  }

  func selectWorkout(_ id: String) {
    // A workout already trained this week is FINISHED (founder 2026-07-11) — it can be
    // read, never re-queued. The list renders it as done; this is the defense in depth.
    if lobby?.workouts.first(where: { $0.id == id })?.done == true { return }
    if manager.isReachable {
      sendIntent(type: "select_workout", workoutId: id)
    } else {
      // Offline Start screen: the pick is watch-local until Begin.
      offlineQueuedWorkoutId = id
      recompute()
    }
  }

  /// Swap the CURRENT lift (Active Set). `originalName` is the lift being replaced — it is
  /// what the undo offer resolves against.
  func swapCurrent(_ exerciseId: String, replacing originalName: String) {
    swap(exerciseId, replacing: originalName, context: .current)
  }

  /// Swap the NEXT lift (Transition Rest).
  func swapNext(_ exerciseId: String, replacing originalName: String) {
    swap(exerciseId, replacing: originalName, context: .next)
  }

  private func swap(_ exerciseId: String, replacing originalName: String, context: SwapUndoContext) {
    // Exercise selection belongs to the phone's model; the offline mirror offers no
    // swap options, so this can only fire under phone authority. One-tap (founder
    // 2026-07-10): Hush already picked the replacement — apply it immediately, ack by
    // feel, and the next mirror frame shows the new lift (exact parity with the phone).
    // The original's NAME is remembered so the post-swap frame can offer the way back.
    guard localEngine == nil else { return }
    // A nameless original (a version-skewed frame) simply gets no undo offer — it must never
    // cost the athlete the swap itself.
    pendingUndo = originalName.isEmpty ? nil : (name: originalName, at: Date(), context: context)
    sendIntent(type: "swap_exercise", exerciseId: exerciseId)
    onEntryHaptic.send(.exerciseBusyApplied)
  }

  /// The post-swap frame landed: if the lift the athlete HAD now reads as one of the new
  /// lift's own alternatives, offer it back for a short window.
  private func resolveUndo(with m: WireMirror?) {
    guard let p = pendingUndo, let m else { return }
    guard Date().timeIntervalSince(p.at) < 10 else {
      pendingUndo = nil
      return
    }
    switch p.context {
    case .current:
      guard m.exerciseName != p.name,
            let hit = (m.swapOptions ?? []).first(where: { $0.name == p.name }) else { return }
      offerUndo(hit, context: .current)
    case .next:
      guard let nextName = m.nextExerciseName, nextName != p.name,
            let hit = (m.nextSwapOptions ?? []).first(where: { $0.name == p.name }) else { return }
      offerUndo(hit, context: .next)
    }
  }

  private func offerUndo(_ option: WireSwapOption, context: SwapUndoContext) {
    pendingUndo = nil
    undoOption = option
    undoContext = context
    undoExpiry?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.undoOption = nil
      self.undoContext = nil
    }
    undoExpiry = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 6, execute: work)
  }

  private func clearUndo() {
    pendingUndo = nil
    undoExpiry?.cancel()
    undoExpiry = nil
    if undoOption != nil {
      undoOption = nil
      undoContext = nil
    }
  }

  /// Undo tap: swap straight back to the lift the athlete had. Routed like any swap —
  /// the phone resolves current-vs-next by its own live phase.
  func undoSwap() {
    guard let u = undoOption else { return }
    clearUndo()
    sendIntent(type: "swap_exercise", exerciseId: u.id)
    onEntryHaptic.send(.exerciseBusyApplied)
  }

  // MARK: Watch-local cardio (run / walk)

  func startCardio(gait: String) {
    guard cardioGait == nil, localEngine == nil else { return }
    completeHold = nil // a fresh activity supersedes an undismissed completion
    cardioGait = gait
    cardioPaused = false
    cardioStartedAt = Date()
    cardioPausedAt = nil
    cardioPausedTotal = 0
    lastKmSplit = 0 // the split beat counts THIS recording's kilometres
    kmMarks = []
    bestSplitS = nil
    kmSplit = nil
    workoutRuntime.trackLive(paused: false, activity: gait == "run" ? .running : .walking, indoor: false)
    onEntryHaptic.send(.readyTapped)
    recompute()
  }

  func toggleCardioPause() {
    guard cardioGait != nil else { return }
    cardioPaused.toggle()
    if cardioPaused {
      cardioPausedAt = Date()
    } else if let at = cardioPausedAt {
      cardioPausedTotal += Date().timeIntervalSince(at)
      cardioPausedAt = nil
    }
    workoutRuntime.trackLive(paused: cardioPaused)
    onEntryHaptic.send(cardioPaused ? .paused : .resumed)
    recompute()
  }

  /// A whole kilometre closed during a wrist run/walk → the strong split beat (founder
  /// 2026-07-12). Only during a live, unpaused recording; never for strength (distance
  /// is nil there by construction).
  private func kmTicked(_ km: Double) {
    guard cardioGait != nil, !cardioPaused else { return }
    let whole = Int(km)
    guard whole > lastKmSplit else { return }
    lastKmSplit = whole
    onEntryHaptic.send(.kmSplit)
    // CR3 · KM LOGGED — the haptic has fired here since the beat was built, and it was the ONLY
    // thing that happened: a whole kilometre closed and the wrist showed nothing. "Every kilometre
    // lands like a logged set", so it gets the same shape as one — the number, the split, a breath,
    // and back to the run. The screen dismisses itself; a runner does not tap.
    let now = cardioElapsed()
    let previous = kmMarks.last ?? 0
    kmMarks.append(now)
    let split = max(0, now - previous)
    let best = bestSplitS.map { split < $0 } ?? true
    if bestSplitS == nil || split < bestSplitS! { bestSplitS = split }
    kmSplit = KmSplit(km: whole, splitS: split, quickest: best)
    recompute()
    let shown = kmSplit
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.2) { [weak self] in
      guard let self, self.kmSplit == shown else { return } // a newer split already replaced it
      self.kmSplit = nil
      self.recompute()
    }
  }

  /// Elapsed seconds for the cardio stage. The WATCH owns this clock (founder 2026-07-11:
  /// "pause doesn't stop the time"): it is computed from our own start/pause bookkeeping, so a
  /// Pause stops it instantly and deterministically — never dependent on whether HealthKit
  /// accepted the session pause, or on HealthKit being available at all. HealthKit remains the
  /// source for HR / kcal / distance only.
  func cardioElapsed() -> TimeInterval {
    guard let started = cardioStartedAt else { return 0 }
    let pausedNow = cardioPausedAt.map { Date().timeIntervalSince($0) } ?? 0
    return max(0, Date().timeIntervalSince(started) - cardioPausedTotal - pausedNow)
  }

  func endCardio() {
    guard let gait = cardioGait else { return }
    // The start instant, BEFORE the teardown below clears it — the record needs it and the
    // bookkeeping is about to be reset. (Reading `cardioStartedAt` after this block is nil, which
    // would have stamped every wrist run with the epoch.)
    let began = cardioStartedAt ?? Date()
    // Snapshot the record BEFORE finishing: the runtime clears its live metrics as it persists
    // the HKWorkout, and the completion screen must show what the athlete actually did.
    cardioSummary = CardioSummary(
      gait: gait,
      elapsedS: cardioElapsed(),
      distanceKm: liveMetrics.distanceKm,
      kcal: liveMetrics.activeKcal
    )
    cardioGait = nil
    cardioPaused = false
    cardioStartedAt = nil
    cardioPausedAt = nil
    cardioPausedTotal = 0
    // Persist the honest record to Health (HR / kcal / distance); the strength
    // engine never sees it — recorded, never coached.
    workoutRuntime.finish()
    // …and carry it HOME (founder 2026-07-28). Until now this stopped at Health, so the kilometres
    // she ran on her wrist appeared in Apple Health and in no part of Hush — not her Log, not her
    // Progress distance, not her lifetime burn. It is queued DURABLY first and only then offered,
    // exactly like a standalone strength record: the phone may be in a locker, and a run she
    // actually did must not depend on the pair being in range at the moment she stops.
    if let summary = cardioSummary, summary.elapsedS >= 1 {
      let record = WireCardioRecord(
        v: WATCH_PROTOCOL_VERSION,
        type: "cardio_record",
        recordId: UUID().uuidString,
        gait: summary.gait,
        startedAt: WatchWire.iso(began),
        endedAt: WatchWire.iso(Date()),
        durationSec: summary.elapsedS,
        distanceKm: summary.distanceKm,
        // NO avgHr. The runtime publishes the LATEST beat, not an average, and sending the last
        // reading of the run under a field called `avgHr` would be Hush stating a number it never
        // computed. The HKWorkout in Health carries the real average; Hush omits what it cannot
        // measure (the same honesty rule `kcalForKm` follows for a missing bodyweight).
        avgHr: nil,
        kcal: summary.kcal
      )
      store.enqueueCardioRecord(record)
      manager.transferCardioRecord(record)
    }
    onEntryHaptic.send(.workoutSaved)
    recompute() // → the completion screen, held until Done
  }

  /// Done on the run/walk completion — the wrist hands the stage back to the phone's state.
  func dismissCardioComplete() {
    guard cardioSummary != nil else { return }
    cardioSummary = nil
    // Phone state was ingested but never acted on while the recording owned the wrist —
    // re-apply its side effects now that it is the authority again (a live phone workout
    // gets its rest haptics + OS runtime back; no phone session ends as a no-op).
    syncRestHaptics(prev: nil, next: mirror)
    syncWorkoutRuntime(phase: mirror?.phase)
    recompute()
  }

  private func sendIntent(
    type: String,
    expectedIndex: Int? = nil,
    actualReps: Int? = nil,
    actualWeight: Double? = nil,
    workoutId: String? = nil,
    exerciseId: String? = nil,
    seconds: Int? = nil,
    area: String? = nil,
    severity: String? = nil
  ) {
    let intent = WireIntent(
      v: WATCH_PROTOCOL_VERSION,
      type: type,
      intentId: UUID().uuidString,
      issuedAt: ISO8601DateFormatter().string(from: Date()),
      expectedGlobalIndex: expectedIndex,
      actualReps: actualReps,
      actualWeight: actualWeight,
      workoutId: workoutId,
      exerciseId: exerciseId,
      seconds: seconds,
      severity: severity,
      area: area
    )
    if let json = WatchWire.encodeIntent(intent) { manager.send(intentJSON: json) }
  }

  // MARK: Projection (port of projectWatchScreen)

  private func recompute() {
    let next = project()
    let kindChanged = !sameKind(next, screen)
    screen = next
    if kindChanged, let haptic = entryHaptic(for: next) {
      onEntryHaptic.send(haptic)
    }
  }

  private func project() -> WatchScreen {
    // A live wrist recording owns the display until ended, then its completion holds the
    // stage until Done — a recording never just vanishes back to the lobby.
    if let gait = cardioGait {
      return .cardio(gait: gait, paused: cardioPaused)
    }
    if let s = cardioSummary {
      return .cardioComplete(s)
    }
    // A finished WORKOUT holds the stage until Done, whatever the phone publishes next
    // (it republishes its lobby the moment the program updates — that used to erase this).
    if let c = completeHold {
      return .workoutComplete(c)
    }
    // The Reconnecting viewer only makes sense when the PHONE is the live authority:
    // a local session needs no phone at all, and pre-session an unreachable phone
    // must yield the (offline) Start screen, not a connection error.
    if localMirror == nil, connection == .reconnecting, mirror != nil {
      return .connectionLost(mirror: mirror)
    }
    if let sc = setConfirm {
      return .setConfirmation(weight: sc.weight, reps: sc.reps, index: sc.index, total: sc.total)
    }
    guard let m = effectiveMirror else {
      if let l = lobby { return .start(l) }
      // No phone state at all: boot the Start screen from the stored plan snapshot
      // (the fully standalone path).
      if let l = offlineLobby() { return .start(l) }
      return .idle
    }
    switch m.phase {
    case "complete":
      return .workoutComplete(m)
    case "paused":
      return .paused
    case "active_set":
      return .activeSet(m, draft: editDraft)
    case "rest_inter":
      return .interRest(m)
    case "rest_transition":
      return .transitionRest(m)
    default:
      return .idle
    }
  }

  private func entryHaptic(for screen: WatchScreen) -> HapticEvent? {
    switch screen {
    case .connectionLost: return .connectionLost
    case .workoutComplete: return .workoutSaved
    case .paused: return .paused
    case .setConfirmation: return .setLogged
    default: return nil // cardioComplete plays its own beat in endCardio()
    }
  }

  private func sameKind(_ a: WatchScreen, _ b: WatchScreen) -> Bool {
    switch (a, b) {
    case (.idle, .idle), (.start, .start), (.connectionLost, .connectionLost),
         (.workoutComplete, .workoutComplete), (.setConfirmation, .setConfirmation),
         (.activeSet, .activeSet), (.interRest, .interRest), (.transitionRest, .transitionRest),
         (.paused, .paused), (.cardio, .cardio), (.cardioComplete, .cardioComplete):
      return true
    default:
      return false
    }
  }
}
