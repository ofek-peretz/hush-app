import ActivityKit
import Foundation

// DUPLICATE of modules/hush-live-activity/ios/HushSessionAttributes.swift.
//
// ActivityKit decodes ContentState across the app↔widget process boundary by its
// Codable shape, so both targets must declare this type identically. Keep the two
// copies byte-identical; if you change one, change the other.
struct HushSessionAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var exerciseName: String
    var setLabel: String
    var restEndDate: Date?
    var isResting: Bool
  }
}
