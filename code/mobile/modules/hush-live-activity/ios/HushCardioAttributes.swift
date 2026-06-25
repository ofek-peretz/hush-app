import ActivityKit
import Foundation

// Canonical ActivityKit attributes for the Hush CARDIO (Open training) Live Activity.
//
// Native mirror of `CardioLiveActivityState` (kind: 'cardio') in
// `src/platform/liveActivity.ts`. Recorded, never coached — sealed off from the
// strength engine. Unlike the strength activity, cardio LEGITIMATELY surfaces pace,
// heart rate, and calories (it is a logged activity, not a coaching surface).
//
// The elapsed clock is driven from `startDate` (absolute) via `Text(timerInterval:)`
// so it stays drift-proof under ActivityKit update latency.
struct HushCardioAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// "run" | "walk".
    var gait: String
    var paused: Bool
    /// Absolute start instant (drives the drift-proof elapsed timer).
    var startDate: Date
    var elapsedSec: Double
    var distanceKm: Double
    /// Current average pace, sec/km.
    var paceSec: Double
    var hr: Int
    var calories: Int
    /// The most recent kilometre split, or nil.
    var lastSplitKm: Int?
    var lastSplitPaceSec: Double?
    var lastSplitFastest: Bool
  }
}
