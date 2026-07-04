import Combine
import Foundation
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

/// The screen to render, with the data each one needs.
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
  // Optimistic: assume connected until a sustained drop proves otherwise (item 5). The honest
  // "Reconnecting" viewer must be rare — a brief unreachable blip (display asleep, phone app
  // backgrounded) is normal and applicationContext still syncs, so we keep showing the last mirror.
  private var connection: ConnectionState = .connected
  private var highestSeq = Int.min

  // Local UI (presentation only — never workout state).
  private var editDraft: EditDraft?
  private var setConfirm: (weight: Double?, reps: Int, index: Int, total: Int)?
  private var setConfirmToken = 0

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
  /// Fired when a screen is entered, so the view can play the entry haptic.
  let onEntryHaptic = PassthroughSubject<HapticEvent, Never>()

  func start() {
    manager.model = self
    manager.activate()
    workoutRuntime.requestAuthorization()
    workoutRuntime.recoverActiveSession()
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

    // A live LOCAL session owns the display, the haptics, and the OS runtime —
    // phone state is recorded above (it takes over after dismissal) but must not
    // drive side effects while the athlete is mid-local-workout.
    if localEngine != nil {
      recompute()
      return
    }

    let phaseChanged = prev?.phase != mirror?.phase
    let indexChanged = prev?.globalIndex != mirror?.globalIndex
    if phaseChanged || indexChanged {
      // A new set invalidates any in-flight Edit override.
      if mirror?.phase != "active_set" || indexChanged { editDraft = nil }
    }
    // The workout is over: the completion experience supersedes any in-flight per-set confirmation,
    // so clear it immediately (otherwise the 1.5s Set Confirmation would mask Workout Complete — the
    // "watch doesn't show the completion experience" defect, item 3).
    if mirror?.phase == "complete" {
      setConfirmToken += 1
      setConfirm = nil
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
    // rule as the phone-authority path).
    setConfirmToken += 1
    setConfirm = nil
    let prev = localMirror
    localMirror = frame
    syncRestHaptics(prev: prev, next: frame)
    syncWorkoutRuntime(phase: frame.phase) // "complete" → persist the HKWorkout
    if !record.sets.isEmpty { manager.transferRecord(record) }
    recompute()
  }

  /// Begin with the phone unreachable: run the stored plan locally. No plan / all
  /// workouts done → inert (the Start screen would not have been shown).
  private func startLocalWorkout() {
    guard localEngine == nil, let stored = store.loadPlan() else { return }
    let remaining = stored.plan.workouts.filter { !stored.doneWorkoutIds.contains($0.id) }
    let targetId = offlineQueuedWorkoutId ?? lobby?.workoutId
    guard let workout = remaining.first(where: { $0.id == targetId }) ?? remaining.first else { return }
    offlineQueuedWorkoutId = nil
    let engine = LocalWorkoutEngine(workout: workout, plan: stored.plan, store: store)
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
  }

  /// The phone durably acknowledged a record — reconciliation is complete.
  func recordAcked(_ recordId: String) {
    store.removeRecord(recordId)
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
      let delay = endsAt.addingTimeInterval(offset).timeIntervalSince(now)
      guard delay > 0.05 else { continue } // beats already in the past are skipped (no buzz storm)
      let work = DispatchWorkItem { [weak self] in
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

  func dismissComplete() {
    // Local authority: the record is already durable in the outbox and the active
    // session cleared — dismissal just tears the local presentation down (the
    // phone's state, or the offline Start lobby, takes over).
    if localEngine != nil {
      localEngine = nil
      localMirror = nil
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
    guard localEngine == nil else { return }
    if manager.isReachable {
      // The phone is present — it stays the authority over the session lifecycle.
      sendIntent(type: "start_workout", workoutId: lobby?.workoutId)
    } else {
      // Phone absent — the watch runs the stored plan itself (standalone).
      startLocalWorkout()
    }
  }

  func selectWorkout(_ id: String) {
    if manager.isReachable {
      sendIntent(type: "select_workout", workoutId: id)
    } else {
      // Offline Start screen: the pick is watch-local until Begin.
      offlineQueuedWorkoutId = id
      recompute()
    }
  }

  func swap(_ exerciseId: String) {
    // Exercise selection belongs to the phone's model; the offline mirror offers no
    // swap options, so this can only fire under phone authority.
    guard localEngine == nil else { return }
    sendIntent(type: "swap_exercise", exerciseId: exerciseId)
  }

  private func sendIntent(
    type: String,
    expectedIndex: Int? = nil,
    actualReps: Int? = nil,
    actualWeight: Double? = nil,
    workoutId: String? = nil,
    exerciseId: String? = nil,
    seconds: Int? = nil
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
      seconds: seconds
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
    default: return nil
    }
  }

  private func sameKind(_ a: WatchScreen, _ b: WatchScreen) -> Bool {
    switch (a, b) {
    case (.idle, .idle), (.start, .start), (.connectionLost, .connectionLost),
         (.workoutComplete, .workoutComplete), (.setConfirmation, .setConfirmation),
         (.activeSet, .activeSet), (.interRest, .interRest), (.transitionRest, .transitionRest),
         (.paused, .paused):
      return true
    default:
      return false
    }
  }
}
