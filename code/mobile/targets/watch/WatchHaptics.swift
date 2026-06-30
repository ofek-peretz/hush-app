import Foundation
import WatchKit

// Haptic taxonomy player — the WatchKit realization of watchHaptics.ts (§3 of
// WATCH_EXPERIENCE_SPEC.md). The five MAJOR progress events (set / rest / exercise /
// workout / connection-lost) are mutually distinguishable by rhythm so a trained
// athlete can run a session by feel. Workout Complete is the signature: two soft
// taps, a pause, then one sustained beat.
//
// WatchKit exposes a fixed set of `WKHapticType`s (no arbitrary waveform), so each
// canonical pattern is realized as a timed SEQUENCE of the closest types. The
// rhythm + count carry the meaning, matching the beats in watchHaptics.ts.

enum HapticEvent {
  case setLogged // single light tap
  case restApproach // soft awareness tick (T-7 / T-3 / T-2 of the rest countdown)
  case restApproachFinal // crisp imminent tick (T-1)
  case restElapsed // soft ascending double — the go signal
  case readyTapped // action ack
  case exerciseBoundary // even triple — closed phase
  case workoutSaved // signature
  case connectionLost // single low descending
  case reconnected // gentle affirm
  case paused // soft settle
  case resumed // gentle affirm
  case receiptEarned // firm even double
  case exerciseBusyApplied // action ack
}

enum WatchHaptics {
  /// One scheduled beat: a WatchKit type fired after `delay` seconds.
  private struct Beat { let delay: TimeInterval; let type: WKHapticType }

  static func play(_ event: HapticEvent) {
    for beat in beats(for: event) {
      DispatchQueue.main.asyncAfter(deadline: .now() + beat.delay) {
        WKInterfaceDevice.current().play(beat.type)
      }
    }
  }

  private static func beats(for event: HapticEvent) -> [Beat] {
    switch event {
    case .setLogged:
      return [Beat(delay: 0, type: .click)]
    case .restApproach:
      // soft awareness whisper — felt without looking, never alarming.
      return [Beat(delay: 0, type: .start)]
    case .restApproachFinal:
      // crisp, imminent — "one".
      return [Beat(delay: 0, type: .directionUp)]
    case .restElapsed:
      // ascending double: a soft start then a firmer up — "go".
      return [Beat(delay: 0, type: .start), Beat(delay: 0.12, type: .directionUp)]
    case .readyTapped, .exerciseBusyApplied:
      return [Beat(delay: 0, type: .click)]
    case .exerciseBoundary:
      // even triple — a closed phase.
      return [Beat(delay: 0, type: .directionUp), Beat(delay: 0.15, type: .directionUp), Beat(delay: 0.30, type: .directionUp)]
    case .workoutSaved:
      // signature: two soft taps, a pause, one sustained warm beat.
      return [Beat(delay: 0, type: .click), Beat(delay: 0.12, type: .click), Beat(delay: 0.62, type: .success)]
    case .connectionLost:
      // single low, descending — soft, never alarming.
      return [Beat(delay: 0, type: .directionDown)]
    case .reconnected, .resumed:
      return [Beat(delay: 0, type: .click)]
    case .paused:
      // single soft settle.
      return [Beat(delay: 0, type: .stop)]
    case .receiptEarned:
      // firm even double — "Hush was right".
      return [Beat(delay: 0, type: .success), Beat(delay: 0.14, type: .success)]
    }
  }
}
