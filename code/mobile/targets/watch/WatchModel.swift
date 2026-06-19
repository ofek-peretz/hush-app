import Combine
import Foundation
import SwiftUI

// The watch's single source of *presentation* state. It holds the latest phone
// mirror (advancing only on a higher authoritySeq), the connection state, and the
// two transient LOCAL UI flags allowed by the spec (Finish confirmation open;
// Exercise Complete interstitial elapsed) plus the rep-adjustment value.
//
// `currentScreen` is the Swift port of projectWatchScreen() (watchPresentation.ts):
// connection-lost wins, then a finished session, then the live phase. The watch
// owns NO workout state; it proposes intents and the phone decides.

enum ConnectionState { case connected, reconnecting }

/// Which value the Digital Crown currently drives on the Edit Result screen (§3.6).
enum WatchEditColumn: Equatable { case weight, reps }

/// The screen to render, with the data each one needs.
enum WatchScreen: Equatable {
  case idle
  case connectionLost(mirror: WireMirror?)
  case workoutComplete
  case paused(WireMirror)
  case finishConfirm
  // Edit Result: adjust the current set's weight + reps before logging (§3.6). `weight`
  // is nil for a bodyweight movement (only the reps column shows).
  case editResult(WireMirror, weight: Double?, reps: Int, active: WatchEditColumn)
  case activeSet(WireMirror)
  case interRest(WireMirror)
  case exerciseComplete(WireMirror)
  case transitionRest(WireMirror)
}

final class WatchModel: ObservableObject {
  @Published private(set) var screen: WatchScreen = .idle

  private var mirror: WireMirror?
  private var connection: ConnectionState = .reconnecting
  private var highestSeq = Int.min

  // Local UI (presentation only — never workout state).
  private var finishConfirm = false
  private var exerciseCompleteAck = false
  // Edit Result draft: editReps != nil ⇒ the edit screen is open. editWeight is nil for
  // a bodyweight movement. editActive = which column the Crown drives.
  private var editReps: Int?
  private var editWeight: Double?
  private var editActive: WatchEditColumn = .reps

  private let manager = WatchSessionManager()
  /// Fired when a screen is entered, so the view can play the entry haptic.
  let onEntryHaptic = PassthroughSubject<HapticEvent, Never>()
  /// Live heart rate + active calories for the rest screens (watch-only signal).
  /// Owns no workout state — a read-only HealthKit live-workout reader.
  let vitals = WatchVitals()

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

    // Reset transient local UI when the phase or set changes underneath us.
    let phaseChanged = prev?.phase != mirror?.phase
    let indexChanged = prev?.globalIndex != mirror?.globalIndex
    if phaseChanged || indexChanged {
      if mirror?.phase != "paused" { finishConfirm = false }
      if mirror?.phase != "active_set" || indexChanged { editReps = nil; editWeight = nil }
      // A fresh transition (new completed exercise) re-arms the interstitial.
      if mirror?.phase == "rest_transition" && (phaseChanged || indexChanged) {
        exerciseCompleteAck = false
      }
      if mirror?.phase != "rest_transition" { exerciseCompleteAck = false }
    }
    recompute()
  }

  func setReachable(_ reachable: Bool) {
    let next: ConnectionState = reachable ? .connected : .reconnecting
    guard next != connection else { return }
    connection = next
    recompute()
  }

  /// The Exercise Complete interstitial elapsed → reveal the transition rest.
  func ackExerciseComplete() {
    guard !exerciseCompleteAck else { return }
    exerciseCompleteAck = true
    recompute()
  }

  // MARK: Local UI transitions

  func openFinishConfirm() { finishConfirm = true; recompute() }
  func closeFinishConfirm() { finishConfirm = false; recompute() }

  func openEdit() {
    editReps = mirror?.targetReps ?? 0
    editWeight = mirror?.targetWeight            // nil ⇒ bodyweight (reps-only edit)
    editActive = (mirror?.targetWeight != nil) ? .weight : .reps
    recompute()
  }
  func cancelEdit() { editReps = nil; editWeight = nil; recompute() }
  func setEditActive(_ column: WatchEditColumn) {
    // The Crown can only drive the weight column when there IS a weight.
    editActive = (column == .weight && editWeight == nil) ? .reps : column
    recompute()
  }
  /// Apply a Crown-driven absolute value to the active column (1-unit detents:
  /// ±1 kg / ±1 rep — founder: 1 kg steps everywhere).
  func applyEditCrown(_ value: Double) {
    guard editReps != nil else { return }
    switch editActive {
    case .weight:
      if editWeight != nil { editWeight = max(0, value.rounded()) }
    case .reps:
      editReps = max(0, Int(value.rounded()))
    }
    recompute()
  }

  // MARK: Outbound intents (proposals — the phone validates + decides)

  func completeSet() { sendIntent(type: "complete_set", expectedIndex: mirror?.globalIndex) }
  func confirmEdit() {
    // Log the edited weight + reps (each rides through to the phone; weight nil for a
    // bodyweight movement is omitted on the wire → phone keeps the target).
    sendIntent(
      type: "complete_set",
      expectedIndex: mirror?.globalIndex,
      actualReps: editReps,
      actualWeight: editWeight
    )
    editReps = nil
    editWeight = nil
    recompute()
  }
  func markExerciseBusy() { sendIntent(type: "exercise_busy", expectedIndex: mirror?.globalIndex) }
  func endRest() { sendIntent(type: "end_rest") }
  func pause() { sendIntent(type: "pause") }
  func resume() { sendIntent(type: "resume") }
  func finishYes() { finishConfirm = false; sendIntent(type: "finish_early"); recompute() }

  private func sendIntent(
    type: String,
    expectedIndex: Int? = nil,
    actualReps: Int? = nil,
    actualWeight: Double? = nil
  ) {
    let intent = WireIntent(
      v: WATCH_PROTOCOL_VERSION,
      type: type,
      intentId: UUID().uuidString,
      issuedAt: ISO8601DateFormatter().string(from: Date()),
      expectedGlobalIndex: expectedIndex,
      actualReps: actualReps,
      actualWeight: actualWeight
    )
    if let json = WatchWire.encodeIntent(intent) { manager.send(intentJSON: json) }
  }

  // MARK: Projection (port of projectWatchScreen)

  private func recompute() {
    let next = project()
    let kindChanged = !sameKind(next, screen)
    screen = next
    manageVitals(next)
    if kindChanged, let haptic = entryHaptic(for: next) {
      onEntryHaptic.send(haptic)
    }
  }

  /// Run the live-vitals workout while a workout is on screen; end it when the
  /// session completes or we fall idle. A connection blip keeps the current state.
  private func manageVitals(_ screen: WatchScreen) {
    switch screen {
    case .activeSet, .interRest, .transitionRest, .exerciseComplete, .paused, .editResult, .finishConfirm:
      vitals.start()
    case .workoutComplete, .idle:
      vitals.stop()
    case .connectionLost:
      break
    }
  }

  private func project() -> WatchScreen {
    if connection == .reconnecting { return .connectionLost(mirror: mirror) }
    guard let m = mirror else { return .idle }

    switch m.phase {
    case "complete":
      return .workoutComplete
    case "paused":
      return finishConfirm ? .finishConfirm : .paused(m)
    case "active_set":
      if let reps = editReps { return .editResult(m, weight: editWeight, reps: reps, active: editActive) }
      return .activeSet(m)
    case "rest_inter":
      return .interRest(m)
    case "rest_transition":
      if let done = m.completedExerciseName, !done.isEmpty, !exerciseCompleteAck {
        return .exerciseComplete(m)
      }
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
    case .exerciseComplete: return .exerciseBoundary
    default: return nil
    }
  }

  private func sameKind(_ a: WatchScreen, _ b: WatchScreen) -> Bool {
    switch (a, b) {
    case (.idle, .idle), (.connectionLost, .connectionLost), (.workoutComplete, .workoutComplete),
         (.paused, .paused), (.finishConfirm, .finishConfirm), (.editResult, .editResult),
         (.activeSet, .activeSet), (.interRest, .interRest), (.exerciseComplete, .exerciseComplete),
         (.transitionRest, .transitionRest):
      return true
    default:
      return false
    }
  }
}
