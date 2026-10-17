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
    /// ⛔ THE CARD'S OWN WORDS, BAKED ON THE PHONE (sync audit, 2026-09-14). This state carried no
    /// words at all, so every label the cardio card draws was an English literal inside the widget
    /// while the strength card beside it spoke her language and her gender. Resolved once per
    /// publish by `cardioWords()` — see `platform/liveActivity`.
    var wordRun: String
    var wordWalk: String
    var wordLive: String
    var wordPaused: String
    var unitKm: String
    var unitKcal: String
    var unitBpm: String
  }
}
