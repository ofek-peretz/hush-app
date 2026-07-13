import Foundation

// Wire contracts shared with the phone (the Swift mirror of protocol.ts +
// sessionMirror.ts). The watch is a TERMINAL: it decodes the read-only mirror the
// phone publishes and encodes intents it proposes. It owns no workout state and
// never mutates the mirror — the phone validates every intent against its own truth.
//
// Keep these shapes in lockstep with:
//   - src/platform/sessionMirror.ts  (SessionMirror → WireMirror)
//   - src/platform/watch/protocol.ts (WatchStateEnvelope / WatchIntent / WatchLobby)

let WATCH_PROTOCOL_VERSION = 1
let MIRROR_SCHEMA_VERSION = 1

struct WireSwapOption: Codable, Equatable {
  var id: String
  var name: String
}

/// One lift the athlete PERFORMED — mirror of sessionMirror.ts `MirrorSummaryLift`. Feeds the
/// wrist's read-back: a green check lands on every lift, with its best set beside it. Lifts that
/// were never reached are not on the wire at all (founder 2026-07-13 — the phone's read-back walks
/// what was DONE, and the wrist plays the same beat, not a ledger of what was missed).
struct WireSummaryLift: Codable, Equatable {
  var name: String
  /// The best set of that lift, as the phone prints it: "60 × 8" / "BW × 12".
  ///
  /// OPTIONAL, like every field added after v1 — and for a sharper reason than usual. The watch
  /// app installs ASYNCHRONOUSLY from the phone app, so a phone on this build can talk to a watch
  /// on the previous one for hours. A non-optional field throws inside `decodeIfPresent` when the
  /// key is missing, and because `summary` is a nested optional that throw takes the WHOLE FRAME
  /// down — the wrist would miss the closing screen entirely rather than miss one line of it.
  var best: String?
}

struct WireSummary: Codable, Equatable {
  var timeLabel: String
  var sets: Int
  var up: Int
  /// Optional so a phone on an older mirror schema still decodes (the read-back beat simply
  /// does not play, and the summary lands the way it always did).
  var lifts: [WireSummaryLift]?
}

/// Equipment-native load setup (kg) — how to physically load the prescribed weight, so the athlete
/// never has to calculate on the wrist (item 11). Mirror of sessionMirror.ts `MirrorLoadSetup`.
struct WireLoadSetup: Codable, Equatable {
  var style: String
  var perSide: Double?
  var plates: [Double]?
  var barKg: Double?
  var perHand: Double?
  var pin: Double?
  var fixedBar: Double?
}

/// Read-only projection of the live session (subset rendered on the watch). The
/// fields added for the stage design are optional so a version-skewed frame still
/// decodes; the model/views coalesce them.
struct WireMirror: Codable, Equatable {
  var schema: Int
  var phase: String // active_set | rest_inter | rest_transition | paused | complete
  var exerciseName: String
  var exerciseGroup: String?
  /// The CURRENT step — which during a rest is the set the athlete has just FINISHED (the phone's
  /// machine holds `setIndex` until the rest ends). Never render this on a rest screen; render
  /// `nextSetLabel`, which is the set they are about to do. This screen used to get it wrong and
  /// the load beside it hid the fact.
  var setLabel: String
  var setNumber: Int?
  var setsInExercise: Int?
  /// The set that is COMING. Present on every rest frame; nil on an active set / the last set.
  var nextSetLabel: String?
  var nextSetNumber: Int?
  var nextSetsInExercise: Int?
  var globalIndex: Int
  var totalSets: Int
  var targetWeight: Double?
  var targetReps: Int
  var restEndsAt: String?
  var restRemainingS: Int?
  var restTotalS: Int?
  var nextExerciseName: String?
  var nextExerciseGroup: String?
  var nextTargetWeight: Double?
  var nextTargetReps: Int?
  var completedExerciseName: String?
  var canMarkBusy: Bool
  /// Signed kg load change of the current set: + increase, − decrease, 0 hold.
  var loadDeltaKg: Double?
  var nextLoadDeltaKg: Double?
  var liftIndex: Int?
  var liftCount: Int?
  var workoutName: String?
  var summary: WireSummary?
  var swapOptions: [WireSwapOption]?
  var nextSwapOptions: [WireSwapOption]?
  /// Equipment-native setup (kg) for the current set's load + the upcoming exercise's first set.
  var loadSetup: WireLoadSetup?
  var nextLoadSetup: WireLoadSetup?
  /// TO-LOAD (set the equipment) vs LOADED (already set) for the current set.
  var toLoad: Bool?
}

/// One pickable workout in the Start screen's "Choose workout" overlay.
struct WireLobbyWorkout: Codable, Equatable {
  var id: String
  var name: String
  var lifts: Int?
  var muscles: String?
  var done: Bool?
}

/// Pre-session lobby — what the phone publishes when there is NO active session, so
/// the watch can render the Start screen (mirrors the iPhone home card).
struct WireLobby: Codable, Equatable {
  var workoutId: String?
  var workoutName: String
  var muscles: String
  var lifts: Int?
  var durationLabel: String?
  var resting: Bool?
  /// Training is behind the paywall (free sessions spent, no membership). The watch then
  /// neither proposes a start nor runs one standalone — the purchase belongs to the phone.
  var gated: Bool?
  var workouts: [WireLobbyWorkout]
}

/// Phone → watch envelope. `authoritySeq` is monotonic; the watch keeps the highest
/// it has seen and ignores any envelope with a lower seq (reorder-proof). `lobby` is
/// populated only when `mirror` is nil (pre-session); `plan` rides lobby envelopes
/// and is the standalone execution data the watch stores durably.
struct WireEnvelope: Codable {
  var v: Int
  var type: String
  var mirror: WireMirror?
  var lobby: WireLobby?
  var plan: WirePlan?
  var authoritySeq: Int
  var sentAt: String
}

// ---- Standalone plan snapshot (phone → watch) -------------------------------
//
// The phone owns the MODEL; the watch owns nothing but execution. The snapshot is
// the model's output — every remaining workout of the week, fully prescribed and
// name-resolved — so the watch can EXECUTE one with the phone absent. Mirror of
// protocol.ts `WatchPlanSnapshot`.

let WATCH_PLAN_SCHEMA_VERSION = 1

struct WirePlanStep: Codable, Equatable {
  var exerciseId: String
  var exerciseName: String
  var exerciseGroup: String?
  var setIndexInExercise: Int
  var totalSetsInExercise: Int
  var globalIndex: Int
  var targetWeight: Double?
  var targetReps: Int
  var blockId: String?
  /// Advisory load-change reason ("increase" | "decrease") + magnitude (kg).
  var reasonType: String?
  var reasonDelta: Double?
  var loadSetup: WireLoadSetup?
  /// Between-sets rest (s) for this exercise (tier-based, S2). Optional on the wire —
  /// absent (older phone build) falls back to the plan-level restInterS.
  var restInterS: Int?
}

struct WirePlanWorkout: Codable, Equatable {
  var id: String
  var name: String
  var muscles: String
  var steps: [WirePlanStep]
}

struct WirePlan: Codable, Equatable {
  var schema: Int
  var planId: String
  var generatedAt: String
  var restInterS: Int
  var restTransitionS: Int
  var workouts: [WirePlanWorkout]
}

// ---- Watch-local session record (watch → phone reconciliation) --------------
//
// What the watch reports after executing a workout AS THE LOCAL AUTHORITY.
// Durable in the outbox until the phone acks `recordId`; delivered at-least-once
// (the phone de-dupes). Mirror of protocol.ts `WatchSessionRecord`.

struct WireRecordSet: Codable, Equatable {
  var exerciseId: String
  var setIndex: Int
  var blockId: String?
  var recommendedWeight: Double?
  var recommendedReps: Int
  var actualWeight: Double?
  var actualReps: Int
  var completedAt: String
}

struct WireSessionRecord: Codable, Equatable {
  var v: Int
  var type: String // "session_record"
  var recordId: String
  var planId: String?
  var workoutId: String
  var workoutName: String
  var startedAt: String
  var endedAt: String
  var earlyFinish: Bool
  var sets: [WireRecordSet]
}

/// Watch → phone intent. The phone de-dupes on `intentId` and rejects stale/wrong-
/// phase/wrong-index intents — so this is a PROPOSAL, never an authoritative action.
struct WireIntent: Codable {
  var v: Int
  // complete_set | end_rest | pause | resume | finish_early | exercise_busy |
  // select_workout | start_workout | swap_exercise | add_rest
  var type: String
  var intentId: String
  var issuedAt: String
  var expectedGlobalIndex: Int?
  var actualReps: Int?
  var actualWeight: Double?
  var workoutId: String?
  var exerciseId: String?
  var seconds: Int?
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

  static func encodeRecord(_ record: WireSessionRecord) -> String? {
    guard let data = try? JSONEncoder().encode(record) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func iso(_ date: Date) -> String {
    ISO8601DateFormatter().string(from: date)
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
