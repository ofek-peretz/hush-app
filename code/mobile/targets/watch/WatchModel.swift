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

/// The screen to render, with the data each one needs.
enum WatchScreen: Equatable {
  case idle
  case connectionLost(mirror: WireMirror?)
  case workoutComplete
  case paused(WireMirror)
  case finishConfirm
  case repAdjust(WireMirror, actualReps: Int)
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
  private var repAdjustReps: Int?

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

    // Reset transient local UI when the phase or set changes underneath us.
    let phaseChanged = prev?.phase != mirror?.phase
    let indexChanged = prev?.globalIndex != mirror?.globalIndex
    if phaseChanged || indexChanged {
      if mirror?.phase != "paused" { finishConfirm = false }
      if mirror?.phase != "active_set" || indexChanged { repAdjustReps = nil }
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

  func openRepAdjust() {
    repAdjustReps = mirror?.targetReps ?? 0
    recompute()
  }
  func cancelRepAdjust() { repAdjustReps = nil; recompute() }
  func setRepAdjust(_ reps: Int) {
    repAdjustReps = max(0, reps)
    recompute()
  }

  // MARK: Outbound intents (proposals — the phone validates + decides)

  func completeSet() { sendIntent(type: "complete_set", expectedIndex: mirror?.globalIndex) }
  func confirmReps() {
    sendIntent(type: "complete_set", expectedIndex: mirror?.globalIndex, actualReps: repAdjustReps)
    repAdjustReps = nil
    recompute()
  }
  func markExerciseBusy() { sendIntent(type: "exercise_busy", expectedIndex: mirror?.globalIndex) }
  func endRest() { sendIntent(type: "end_rest") }
  func pause() { sendIntent(type: "pause") }
  func resume() { sendIntent(type: "resume") }
  func finishYes() { finishConfirm = false; sendIntent(type: "finish_early"); recompute() }

  private func sendIntent(type: String, expectedIndex: Int? = nil, actualReps: Int? = nil) {
    let intent = WireIntent(
      v: WATCH_PROTOCOL_VERSION,
      type: type,
      intentId: UUID().uuidString,
      issuedAt: ISO8601DateFormatter().string(from: Date()),
      expectedGlobalIndex: expectedIndex,
      actualReps: actualReps
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
    guard let m = mirror else { return .idle }

    switch m.phase {
    case "complete":
      return .workoutComplete
    case "paused":
      return finishConfirm ? .finishConfirm : .paused(m)
    case "active_set":
      if let reps = repAdjustReps { return .repAdjust(m, actualReps: reps) }
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
         (.paused, .paused), (.finishConfirm, .finishConfirm), (.repAdjust, .repAdjust),
         (.activeSet, .activeSet), (.interRest, .interRest), (.exerciseComplete, .exerciseComplete),
         (.transitionRest, .transitionRest):
      return true
    default:
      return false
    }
  }
}
