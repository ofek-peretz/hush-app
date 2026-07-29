import ActivityKit
import Foundation

// DUPLICATE of modules/hush-live-activity/ios/HushSessionAttributes.swift.
//
// ActivityKit decodes ContentState across the app↔widget process boundary by its
// Codable shape, so both targets MUST declare this type identically. The app target
// encodes the FULL 16-field state (HushActivityController.strengthState); a widget copy
// with a divergent (smaller) shape is what stops the Live Activity from pairing/rendering
// reliably (TestFlight item 8). Keep the two copies byte-identical; if you change one,
// change the other. The widget UI may render only a subset of these fields.
struct HushSessionAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// Program-day name, e.g. "Upper B".
    var workoutName: String
    /// "set" | "rest" | "transition" | "paused".
    var phase: String
    /// Current exercise name.
    var exerciseName: String
    /// e.g. "Set 2 of 4".
    var setLabel: String
    /// 1-based ordinal of the current lift among the session's distinct lifts.
    var liftIndex: Int
    var liftCount: Int
    /// Prescribed load (kg); nil => bodyweight.
    var targetWeight: Double?
    var targetReps: Int
    /// Absolute instant the current rest ends. Non-nil only while resting; drives
    /// the drift-proof `Text(timerInterval:)` countdown.
    var restEndDate: Date?
    /// Full prescribed rest length (s) — the ring denominator; nil unless resting.
    var restTotalS: Double?
    var isResting: Bool
    /// Upcoming exercise during a transition rest (else nil).
    var nextExerciseName: String?
    var nextTargetWeight: Double?
    var nextTargetReps: Int?
    /// Which set of how many, as NUMBERS — v7 6.2 draws the set count as a row of dots beside the
    /// load, and a dot row cannot be parsed out of the localized `setLabel` string.
    var setIndex: Int
    var setCount: Int
  }
}
