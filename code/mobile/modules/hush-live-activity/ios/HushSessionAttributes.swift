import ActivityKit
import Foundation

// Canonical ActivityKit attributes for the Hush STRENGTH session Live Activity.
//
// Native mirror of the SUBSET of `SessionMirror` (sessionMirror.ts) that the Live
// Activity / Dynamic Island / Lock Screen renders — kept in sync with the
// `LiveActivityState` (kind: 'strength') projection in `src/platform/liveActivity.ts`.
// ActivityKit decodes `ContentState` across the app↔widget process boundary by its
// Codable shape, so the copy in the widget extension target MUST stay byte-identical.
//
// Contract (spec §8.5): read-only; the rest timer (`restEndDate`) is the hero during
// rest; NO completion control, progress ring, heart rate, calories, or streak.
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
  }
}
