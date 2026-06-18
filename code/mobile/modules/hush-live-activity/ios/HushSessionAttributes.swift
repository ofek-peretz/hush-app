import ActivityKit
import Foundation

// Canonical ActivityKit attributes for the Hush session Live Activity.
//
// This is the native mirror of the SUBSET of `SessionMirror` (sessionMirror.ts)
// that the Live Activity / Dynamic Island / Lock Screen renders. It is duplicated
// verbatim in the widget extension target (targets/widget/HushSessionAttributes.swift)
// because ActivityKit decodes `ContentState` across the app↔widget process boundary
// by its Codable shape — the two copies MUST stay byte-identical.
//
// Contract (spec §8.5): read-only; the timer (`restEndDate`) is the hero; the
// exercise name + set label are support. No completion control, progress ring,
// heart rate, calories, or streak.
struct HushSessionAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// Current exercise name (support text).
    var exerciseName: String
    /// e.g. "Set 2 of 4" (support text).
    var setLabel: String
    /// Absolute instant the current rest ends. Non-nil only while resting; drives
    /// the drift-proof `Text(timerInterval:)` countdown. Nil during an active set.
    var restEndDate: Date?
    /// True while the session is in a rest phase (inter-set or transition).
    var isResting: Bool
  }
}
