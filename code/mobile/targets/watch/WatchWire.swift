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

/// A milestone the workout just crossed — mirror of sessionMirror.ts `MirrorMilestone`.
///
/// COPY ONLY. The mark is earned on the phone, from the phone's history, and arrives here as a
/// finished English sentence: there is no milestone engine on the wrist. Every field but the
/// title is optional (and the whole struct is), because a phone one build behind sends no
/// milestone at all — and a throw inside this nested optional would cost the wrist its entire
/// closing screen, not just the medallion.
struct WireMilestone: Codable, Equatable {
  /// The engraved figure ("100", "250 t") — empty for a mark that is an event, not a number.
  var value: String?
  /// The tiny unit under the figure ("workouts", "tonnes").
  var caption: String?
  var title: String
  var sub: String?
}

struct WireSummary: Codable, Equatable {
  var timeLabel: String
  var sets: Int
  var up: Int
  /// Total external load moved this session, in KILOGRAMS (the phone's Σ weight × reps). The
  /// Complete screen renders it as tonnes ("11.7 T"). Optional like every post-v1 field — a phone
  /// one build behind sends no key and the metric simply reads "––" rather than an invented figure.
  var volumeKg: Double?
  /// Optional so a phone on an older mirror schema still decodes (the read-back beat simply
  /// does not play, and the summary lands the way it always did).
  /// The session's calories AS THE PHONE COMPUTED THEM (founder 2026-07-28). The wrist can read
  /// HealthKit's active energy and the phone cannot, so the two used to print different figures for
  /// one workout. The authority produces the number; this surface renders it.
  var kcal: Int?
  var lifts: [WireSummaryLift]?
  /// Present only on the session that crossed it — a mark is celebrated once, on its own workout.
  var milestone: WireMilestone?
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

/// THE SIGNATURE MOMENT, on the wire — mirror of sessionMirror.ts `SessionMirror.correction`.
///
/// Loop 1 moved the NEXT set's load because of the set she just finished. The brief calls this the
/// product's single most distinctive moment and requires it on BOTH surfaces ("the same change
/// appears on the watch") — which matters most here: mid-workout the wrist is often the only thing
/// she looks at, and a load changing on it with no account of why is the app doing something TO her
/// rather than WITH her.
///
/// `from`/`to` are kg (the mirror's unit; the wrist formats). Present ONLY on an inter-set rest
/// frame that just earned a correction — the phone's projection holds that guard, so this struct
/// never needs to ask which lift it belongs to.
struct WireCorrection: Codable, Equatable {
  var from: Double
  var to: Double
  var direction: String // "up" | "down"
  /// The reps she just did — the measured fact that moved the load, and the whole reason.
  var reps: Int
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
  /// The rep band's ceiling (floor == targetReps). Carried so the wrist draws the same 8–10
  /// rep-range ruler the phone's stage does (WT2). Nil when the target is a single rep count.
  var targetRepsHi: Int?
  /*
   * ⛔ HER OWN SETS ON THIS LIFT, AND LAST TIME'S (2026-08-04). The wrist drew four dots — filled,
   * ringed, empty — which say HOW MANY sets are behind her and never WHAT HAPPENED in them, while
   * the phone printed the figures. These four close that.
   *
   * ⚠️ ALL OPTIONAL, AND THE SCHEMA IS NOT BUMPED. `mirrorToWire` is a spread and Swift's decoder
   * ignores keys it does not know, so a NEW phone talking to an OLD watch is a no-op, and an OLD
   * phone talking to a new watch decodes these as nil — which draws exactly what the wrist drew
   * before. A version bump would have made both directions a hard stop instead.
   */
  var setsSoFar: [Int]?
  var loadsSoFar: [Double?]?
  var lastReps: [Int]?
  var lastLoadKg: Double?
  var restEndsAt: String?
  var restRemainingS: Int?
  var restTotalS: Int?
  /// WT5 — the running rest is HER measured median on this lift (S-17), not the tier bootstrap.
  var restIsLearned: Bool?
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
  /// WT13c · GLANCE — her own work so far, live. The summary carries the same pair but only on the
  /// terminal frame, so a glance mid-session had nothing of HERS to read (heart and burn come from
  /// the OS; these are the only two figures about her lifting).
  var liveVolumeKg: Double?
  var liveSets: Int?
  var workoutName: String?
  var summary: WireSummary?
  var swapOptions: [WireSwapOption]?
  var nextSwapOptions: [WireSwapOption]?
  /// Equipment-native setup (kg) for the current set's load + the upcoming exercise's first set.
  var loadSetup: WireLoadSetup?
  var nextLoadSetup: WireLoadSetup?
  /// TO-LOAD (set the equipment) vs LOADED (already set) for the current set.
  var toLoad: Bool?
  /// The correction Loop 1 just made — see WireCorrection. Optional like every post-v1 field: a
  /// phone one build behind sends no key, and the rest frame simply lands without the line (the
  /// next load it shows is still the correct, corrected one).
  var correction: WireCorrection?
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
  /// WT7 · THE FIRST FOUR — she has never completed a workout. The lobby's ordinary face reports on
  /// a WEEK and compares to a history; on day one both are empty, so it says what the engine is
  /// about to DO instead.
  var firstWorkout: Bool?
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
  /// Her copy, resolved by the phone. Rides lobby envelopes only — it changes when she changes her
  /// language, which is almost never, and a mirror is published many times a second during a rest.
  /// Optional like every post-v1 field: a phone one build behind sends none and the wrist keeps the
  /// English it shipped with.
  var copy: WireCopyPack?
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
  /// The TOP of her band — without it the standalone projector cannot draw the rep ruler.
  var targetRepsHi: Int?
  /*
   * ⛔ WHAT SHE DID LAST TIME ON THIS LIFT (founder 2026-08-04): *"send the history for a standalone
   * workout too."* Without these the phone-in-a-locker athlete saw dashes in the set row where a
   * mirrored session shows last time's reps — the one asymmetry left between the two surfaces, and
   * only she would ever have met it.
   *
   * ⚠️ Optional, and the plan schema is NOT bumped: an old watch ignores keys it does not know, and
   * a new watch reading an old plan decodes nil, which draws exactly what it drew before.
   */
  var lastReps: [Int]?
  var lastLoadKg: Double?
  var blockId: String?
  /// Advisory load-change reason ("increase" | "decrease") + magnitude (kg).
  var reasonType: String?
  var reasonDelta: Double?
  var loadSetup: WireLoadSetup?
  /// Between-sets rest (s) for this exercise (tier-based, S2). Optional on the wire —
  /// absent (older phone build) falls back to the plan-level restInterS.
  var restInterS: Int?
  /// ⛔ IS `restInterS` HERS, OR THE COACH'S? (S-17) — the fact behind the "your pace" line.
  ///
  /// The wrist used to infer it from `restInterS != nil`, which is true of her learned median AND
  /// of a rest the coach wrote — so a number she had never produced was labelled with her name, on
  /// the surface she looks at most during a set. The phone sets this on her branch only.
  ///
  /// Optional, and NOT a schema bump (as `lastReps` was not): an older phone omits it and this
  /// decodes `nil`, which draws exactly what it drew before.
  var restIsLearned: Bool?
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
  /// Active kilocalories the WRIST measured for a standalone workout — the phone has no such
  /// sensor, so here the wrist is the authority and its number becomes the session's.
  var kcal: Int?
  var sets: [WireRecordSet]
}

/// Watch → phone intent. The phone de-dupes on `intentId` and rejects stale/wrong-
/// phase/wrong-index intents — so this is a PROPOSAL, never an authoritative action.
/// A run/walk the WRIST recorded, carried home (founder 2026-07-28). Mirrors
/// `protocol.WatchCardioRecord` exactly — `watchWireParity` holds the two together.
///
/// Four honest facts and nothing else: the wrist has no GPS trace worth carrying (the route is the
/// phone's) and no split history to replay. Every measurement is optional because the wrist may
/// genuinely lack it — no heart-rate source, no bodyweight to bill calories against.
struct WireCardioRecord: Codable, Equatable {
  var v: Int
  var type: String
  var recordId: String
  var gait: String
  var startedAt: String
  var endedAt: String
  /// The WATCH's own pause-aware clock — never `end − start` (founder 2026-07-11: a pause stops it).
  var durationSec: Double
  var distanceKm: Double?
  var avgHr: Int?
  var kcal: Int?
}

struct WireIntent: Codable {
  var v: Int
  // complete_set | end_rest | pause | resume | finish_early | exercise_busy |
  // select_workout | start_workout | swap_exercise | add_rest | report_pain
  var type: String
  var intentId: String
  var issuedAt: String
  var expectedGlobalIndex: Int?
  var actualReps: Int?
  var actualWeight: Double?
  var workoutId: String?
  var exerciseId: String?
  var seconds: Int?
  /// The body area a `report_pain` intent flags ("Shoulder", "Lower back", …). Nil on every
  /// other intent. The phone owns what to do with it — the wrist only names where it hurts.
  /// WT14b — how sharp it is, in HER words. Required by the phone: a report without it is a
  /// half-finished flow, and the engine may not choose a rest window she did not choose.
  var severity: String?
  var area: String?
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

  /// The cardio twin. Both ride ONE durable channel and the phone tells them apart by the `type`
  /// field inside the JSON — no second native event, no second ack path.
  static func encodeCardioRecord(_ record: WireCardioRecord) -> String? {
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
