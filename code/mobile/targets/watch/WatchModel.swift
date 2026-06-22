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
  private var connection: ConnectionState = .reconnecting
  private var highestSeq = Int.min

  // Local UI (presentation only — never workout state).
  private var editDraft: EditDraft?
  private var setConfirm: (weight: Double?, reps: Int, index: Int, total: Int)?
  private var setConfirmToken = 0

  private let manager = WatchSessionManager()
  /// Fired when a screen is entered, so the view can play the entry haptic.
  let onEntryHaptic = PassthroughSubject<HapticEvent, Never>()

  func start() {
    manager.model = self
    manager.activate()
    recompute()
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
    recompute()
  }

  func setReachable(_ reachable: Bool) {
    let next: ConnectionState = reachable ? .connected : .reconnecting
    guard next != connection else { return }
    connection = next
    recompute()
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
