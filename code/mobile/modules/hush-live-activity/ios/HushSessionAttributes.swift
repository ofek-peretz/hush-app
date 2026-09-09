import ActivityKit
import Foundation

// DUPLICATE of targets/widget/HushSessionAttributes.swift (the widget copy is the source).
//
// ActivityKit decodes ContentState across the app↔widget process boundary by its
// Codable shape, so both targets MUST declare this type identically. The app target
// encodes the FULL state (HushActivityController.strengthState); a widget copy
// with a divergent (smaller) shape is what stops the Live Activity from pairing/rendering
// reliably (TestFlight item 8). Keep the two copies byte-identical; if you change one,
// change the other — `theLockScreenIsAControl` compares them.
//
// ════ THE LOCK SCREEN IS A CONTROL (founder, 2026-09-08) ════
// *"לעשות אפשרות של שליטה מבלי לפתוח את הפלאפון… להזין סט כשהמסך סגור וגם מנוחה של קיצור או הוספת
// 15 שניות."* The read-only contract of §8.5 is retired by his hand. The state now carries what a
// tap on the lock screen needs to answer WITHOUT the phone's JS awake: the rest this set earns,
// the label of the set that follows, the words in her language, and the alert the rest-over
// notification wears (`HushLockIntents.swift` projects a tap onto this state locally, and the
// phone reconciles the same tap from the App Group queue when it wakes).
struct HushSessionAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// Program-day name, e.g. "Upper B".
    var workoutName: String
    /// "set" | "rest" | "transition" | "paused" | "logged" (the last set, logged from the lock screen).
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

    // ── The lock screen as a control (2026-09-08) ──
    /// The rest this set earns when it is logged (s); 0 on the last set of the session.
    var restAfterS: Double
    /// The set logged from here is the session's last — there is no rest to start, only the phone.
    var lastSetOfSession: Bool
    /// The set that follows this one, as the label and the numbers the dot row needs.
    var nextSetLabel: String
    var nextSetIndex: Int
    var nextSetCount: Int
    /// What the rest-over notification says when the rest was started from here — the next set's
    /// figures, baked on the phone in her language (`nextSetAlert`). Empty → the generic line.
    var alertTitle: String
    var alertBody: String
    /// Her language, baked on the phone: the plain words and the three verbs.
    var wordRest: String
    var wordNext: String
    var wordPaused: String
    var wordLogged: String
    var actDone: String
    var actAddRest: String
    var actStart: String
    // ── Her figures, typed on the lock screen (founder 2026-09-08, mid-workout) ──
    /// The unit word beside the load ("kg" / "lb") — never assumed.
    var unitLabel: String
    /// One turn of the load stepper: this lift's own detent (`domain/weightStep`), baked on the phone.
    var weightStep: Double
    /// The word beside the rep count, in her language.
    var wordReps: String
    // ── The voice's loading dialogue (spec §3.2 / §4) ──
    /// The set on stage waits for her "מוכן": the card offers Ready beside Done, and a tap on it
    /// is the set's start (`set_ready` on the wire).
    var awaitingReady: Bool
    var actReady: String
  }
}
