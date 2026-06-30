import Combine
import Foundation
import SwiftUI

// The watch's single source of *presentation* state. It holds the latest phone
// mirror (advancing only on a higher authoritySeq), the pre-session lobby, the
// connection state, and the transient LOCAL UI the design needs (a committed Edit
// override shown until Complete Set; the Set Confirmation interstitial). Inline edit
// mode, the Choose overlay, and the Swap overlay are VIEW-local (driven from the
// lobby/mirror) and do not live here. The watch owns NO workout state.
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
  /// Fired when a screen is entered, so the view can play the entry haptic.
  let onEntryHaptic = PassthroughSubject<HapticEvent, Never>()

  func start() {
    manager.model = self
    manager.activate()
    recompute()
  }

  /// The watch app returned to the foreground (raise-to-wake / reopened). A gentle "you're back in
  /// the workout" cue during a live session (item 6); debounced so a wake that also reconnects
  /// never double-buzzes.
  func appBecameActive() { signalReturnToWorkout() }

  private func signalReturnToWorkout() {
    guard let m = mirror, m.phase != "complete", m.phase != "paused" else { return }
    let now = Date()
    guard now.timeIntervalSince(lastReturnHaptic) > 2 else { return }
    lastReturnHaptic = now
    onEntryHaptic.send(.reconnected)
  }

  // MARK: Inbound (from WatchSessionManager)

  func apply(_ envelope: WireEnvelope) {
    guard envelope.authoritySeq > highestSeq else { return } // reorder-proof
    highestSeq = envelope.authoritySeq

    let prev = mirror
    mirror = envelope.mirror
    lobby = envelope.lobby

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
    recompute()
  }

  func setReachable(_ reachable: Bool) {
    if reachable {
      graceWork?.cancel()
      graceWork = nil
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
    return EditDraft(weight: mirror?.targetWeight, reps: mirror?.targetReps ?? 0)
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

  // MARK: Outbound intents (proposals — the phone validates + decides)

  func completeSet() {
    guard let m = mirror else { return }
    let weight = editDraft?.weight ?? m.targetWeight
    let reps = editDraft?.reps ?? m.targetReps
    let edited = editDraft != nil
    sendIntent(
      type: "complete_set",
      expectedIndex: m.globalIndex,
      actualReps: edited ? reps : nil,
      actualWeight: edited ? weight : nil
    )
    setConfirm = (weight: weight, reps: reps, index: m.setNumber ?? 1, total: m.setsInExercise ?? 1)
    editDraft = nil
    recompute()
    scheduleSetConfirmClear()
  }

  func ready() { sendIntent(type: "end_rest") }
  func addRest() { sendIntent(type: "add_rest", seconds: 15) }
  func pause() { sendIntent(type: "pause") }
  func resume() { sendIntent(type: "resume") }
  func endWorkout() { sendIntent(type: "finish_early") }
  func dismissComplete() {
    // The phone has already saved + torn down the watch session by the time the
    // Complete frame arrives, so there's nothing to send. Clear the local mirror so
    // Done leaves the Complete screen immediately (→ the Start lobby once the phone
    // republishes it, else idle). Without this the Done button is inert (the defect).
    mirror = nil
    recompute()
  }

  func begin() { sendIntent(type: "start_workout", workoutId: lobby?.workoutId) }
  func selectWorkout(_ id: String) { sendIntent(type: "select_workout", workoutId: id) }
  func swap(_ exerciseId: String) { sendIntent(type: "swap_exercise", exerciseId: exerciseId) }

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
    if connection == .reconnecting { return .connectionLost(mirror: mirror) }
    if let sc = setConfirm {
      return .setConfirmation(weight: sc.weight, reps: sc.reps, index: sc.index, total: sc.total)
    }
    guard let m = mirror else {
      if let l = lobby { return .start(l) }
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
