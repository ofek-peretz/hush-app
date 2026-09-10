import ActivityKit
import Foundation

// DUPLICATE of modules/hush-live-activity/ios/HushCardioAttributes.swift.
//
// ActivityKit decodes ContentState across the app↔widget process boundary by its
// Codable shape, so both targets MUST declare this type identically — the same
// parity rule as HushSessionAttributes (a divergent copy is what stopped the
// strength activity from pairing, TestFlight item 8). Keep the two copies
// byte-identical; if you change one, change the other.
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
