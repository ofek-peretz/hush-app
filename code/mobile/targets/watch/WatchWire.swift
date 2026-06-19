import Foundation

// Wire contracts shared with the phone (the Swift mirror of protocol.ts +
// sessionMirror.ts). The watch is a TERMINAL: it decodes the read-only mirror the
// phone publishes and encodes intents it proposes. It owns no workout state and
// never mutates the mirror — the phone validates every intent against its own truth.
//
// Keep these shapes in lockstep with:
//   - src/platform/sessionMirror.ts  (SessionMirror → WireMirror)
//   - src/platform/watch/protocol.ts (WatchStateEnvelope / WatchIntent)

let WATCH_PROTOCOL_VERSION = 1
let MIRROR_SCHEMA_VERSION = 1

/// Read-only projection of the live session (subset rendered on the watch).
struct WireMirror: Codable, Equatable {
  var schema: Int
  var phase: String // active_set | rest_inter | rest_transition | paused | complete
  var exerciseName: String
  var setLabel: String
  var globalIndex: Int
  var totalSets: Int
  var targetWeight: Double?
  var targetReps: Int
  var restEndsAt: String?
  var restRemainingS: Int?
  var nextExerciseName: String?
  var nextTargetWeight: Double?
  var nextTargetReps: Int?
  var completedExerciseName: String?
  var canMarkBusy: Bool
}

/// Phone → watch envelope. `authoritySeq` is monotonic; the watch keeps the highest
/// it has seen and ignores any envelope with a lower seq (reorder-proof).
struct WireEnvelope: Codable {
  var v: Int
  var type: String
  var mirror: WireMirror?
  var authoritySeq: Int
  var sentAt: String
}

/// Watch → phone intent. The phone de-dupes on `intentId` and rejects stale/wrong-
/// phase/wrong-index intents — so this is a PROPOSAL, never an authoritative action.
struct WireIntent: Codable {
  var v: Int
  var type: String // complete_set | end_rest | pause | resume | finish_early | exercise_busy
  var intentId: String
  var issuedAt: String
  var expectedGlobalIndex: Int?
  var actualReps: Int?
  // Actual weight (kg) from the watch Edit Result; nil ⇒ omitted from the wire
  // (Swift Codable encodeIfPresent), so the phone falls back to the target weight.
  var actualWeight: Double?
}

enum WatchWire {
  static func decodeEnvelope(_ json: String) -> WireEnvelope? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(WireEnvelope.self, from: data)
  }

  static func encodeIntent(_ intent: WireIntent) -> String? {
    guard let data = try? JSONEncoder().encode(intent) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  /// Parse an absolute rest-end instant (ISO-8601) into a Date for a drift-proof
  /// countdown. Returns nil when not resting / unparseable.
  static func parseDate(_ iso: String?) -> Date? {
    guard let iso else { return nil }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: iso) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: iso)
  }
}
