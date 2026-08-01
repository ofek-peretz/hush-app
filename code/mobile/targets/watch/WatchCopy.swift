import Foundation

// ════════════════════════════════════════════════════════════════════════════════════════════════
// WATCH COPY — the strings arrive FROM THE PHONE, and the English below is the fallback.
//
// This file used to open by saying the opposite: "the watch target has no i18n runtime; v1 is
// English only, so these are constants." The founder overturned that ruling (2026-07-31, after
// device QA: *"no Hebrew on the watch"*) — the wrist speaks her language, laid out the way the
// phone lays it out.
//
// ── WHY THE PHONE SENDS THE WORDS ───────────────────────────────────────────────────────────────
// The obvious build is a second copy of every string here, keyed on locale: 111 constants, 222
// strings, hand-maintained, in a file the app's copy lint cannot read. It would drift from he.json
// inside a week. Worse — Hebrew conjugates the SECOND PERSON, so "save" said to a woman is a
// different word, and a dictionary here would either duplicate the phone's gender machinery or
// address every woman as a man on the surface she looks at most during a workout.
//
// So `WatchCopyPack` rides the lobby envelope (`src/platform/watch/watchCopyPack.ts`), already
// resolved for her language AND her gender, and `L` looks each string up by key. The keys ARE the
// member names below, which is what `__tests__/flows/watchCopyPack.test.ts` checks mechanically:
// a constant added here without a `watch.*` key fails on the phone side.
//
// The English stays as the fallback, and it is not decoration. The watch app installs
// asynchronously from the phone app, so a wrist one build behind receives no pack at all — and a
// missing pack has to mean "use what you shipped with", never a blank screen.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/// The phone's resolved copy — mirror of `watchCopyPack.ts` `WatchCopyPack`.
///
/// Every field optional but `s`: a pack from a phone one build ahead may carry keys this binary has
/// never heard of, and that is fine — unknown keys are simply never asked for.
struct WireCopyPack: Codable, Equatable {
  var v: Int?
  var locale: String?
  /// Lay the interface right-to-left. A FACT from the phone, not a guess from the characters — the
  /// wrist's lines are mixed (exercise names stay English by their own ruling) and any inference
  /// from content gets the first mixed line wrong.
  var rtl: Bool?
  /// `watch.*`, resolved.
  var s: [String: String]
  /// The body map's muscles, keyed by the map's own English name — which is what the wrist sends
  /// BACK when she reports a pain, so her report needs no interpretation on the way in.
  var m: [String: String]?
}

/// The live pack. Set once at launch from disk, and again whenever the phone publishes a lobby.
///
/// A global rather than an `@EnvironmentObject`: `WatchCopy` is read from `LocalWorkoutEngine` and
/// from notification builders as well as from views, and threading an environment value into
/// non-view code would mean passing it through every call in the file.
enum WatchCopyStore {
  private static let lock = NSLock()
  private static var current: WireCopyPack?

  static var pack: WireCopyPack? {
    lock.lock(); defer { lock.unlock() }
    return current
  }

  static func adopt(_ pack: WireCopyPack?) {
    guard let pack, !pack.s.isEmpty else { return }
    lock.lock(); current = pack; lock.unlock()
  }

  /// Right-to-left, as the phone reported it. False until a pack arrives — an English fallback in
  /// an RTL layout would be worse than either honest end.
  static var isRTL: Bool { pack?.rtl == true }
}

enum WatchCopy {
  /// One string, by key, with the shipped English behind it.
  static func L(_ key: String, _ fallback: String) -> String {
    guard let v = WatchCopyStore.pack?.s[key], !v.isEmpty else { return fallback }
    return v
  }

  /// A template with one placeholder substituted — the only formatting the wrist owns.
  ///
  /// Search-and-replace, not an i18n runtime: the phone sends `"{{n}} lifts"` with the braces
  /// intact because the number is not known when the pack is built, and rebuilding a hundred
  /// strings to change one would be absurd.
  static func L(_ key: String, _ fallback: String, _ subs: [String: String]) -> String {
    var out = L(key, fallback)
    for (name, value) in subs {
      out = out.replacingOccurrences(of: "{{\(name)}}", with: isolate(value))
    }
    return out
  }

  /// Wrap a substituted run so the surrounding text cannot reorder it — or it the text.
  ///
  /// The phone's own `bidi()`, on the wrist. Every value that lands in a Hebrew sentence here is a
  /// left-to-right run inside a right-to-left one: an exercise name (English by its own ruling), a
  /// weight, a set number. Without the isolate the BiDi algorithm drags the adjacent punctuation to
  /// the wrong side, and "Bench, done." closes with the comma on the far end of the line.
  ///
  /// Left-to-right layouts get the string untouched — the control characters are invisible, but
  /// there is no reason to carry them where nothing can reorder.
  private static func isolate(_ s: String) -> String {
    guard WatchCopyStore.isRTL else { return s }
    return "\u{2068}\(s)\u{2069}" // FIRST STRONG ISOLATE … POP DIRECTIONAL ISOLATE
  }

  /// A body-map muscle in her language. Falls back to the map's own English name.
  static func muscle(_ name: String) -> String { WatchCopyStore.pack?.m?[name] ?? name }

  // Start
  static var nextWorkout: String { L("nextWorkout", "Next workout") }
  static var begin: String { L("begin", "Begin") }
  static var chooseWorkout: String { L("chooseWorkout", "Choose workout") }
  // WT1 (today): the name sits under an "Up next" legend; the meta line reads "6 LIFTS · ~55 MIN";
  // the button row splits into "Another" (re-choose) and "Cardio" (run/walk).
  static var another: String { L("another", "Another") }
  static var cardio: String { L("cardio", "Cardio") }
  static var liftsWord: String { L("liftsWord", "LIFTS") }
  // Calendar-primary cadence: the week rolls SATURDAY 20:30 local (founder 2026-07-13 — an update
  // nobody is awake for is not an update). Keep in step with en.json `watch.recovery`.
  static var recovery: String { L("recovery", "Recovery — your next week opens Saturday") }
  // Paywall: training is gated on the phone; the wrist never starts (or bypasses) it.
  static var membershipNeeded: String { L("membershipNeeded", "Continue on iPhone — your membership needs attention") }
  static func lifts(_ n: Int) -> String { L("lifts", "\(n) lifts", ["n": "\(n)"]) }
  /// It said "Open Hush on iPhone" for a year, and the copy lint has banned Hush from naming
  /// itself since 2026-07-12 — the app speaks in the first person. The string was invisible to the
  /// lint because it lived in Swift; the moment it moved into the copy files it failed on the first
  /// run. The name buys nothing here anyway: she is looking at her own watch.
  static var idleWaiting: String { L("idleWaiting", "Open on iPhone") }

  // Active Set
  static var editResult: String { L("editResult", "Edit result") }
  static var completeSet: String { L("completeSet", "Complete set") }
  static var save: String { L("save", "Save") }
  static var crownToAdjust: String { L("crownToAdjust", "Crown to adjust") }
  // WT9 · EDIT SET: the header legend, the moss crown instruction, and the "N reps" pill.
  static var editSet: String { L("editSet", "EDIT SET") }
  static var turnCrownToSet: String { L("turnCrownToSet", "TURN CROWN TO SET") }
  static func repsCount(_ n: Int) -> String { L("repsCount", "\(n) reps", ["n": "\(n)"]) }
  static var kg: String { L("kg", "kg") }
  static var bodyweight: String { L("bodyweight", "BW") }
  // Bodyweight on the LIVE stage: the reps are the hero, and "bodyweight" is a whisper under
  // them (founder 2026-07-11 — the athlete on a pull-up already knows what they are lifting).
  static var reps: String { L("reps", "reps") }
  static var bodyweightQuiet: String { L("bodyweightQuiet", "Bodyweight") }
  // Equipment-native setup line (item 11)
  static var perHand: String { L("perHand", "per hand") }
  static var pin: String { L("pin", "pin") }
  // WT2 (the set): the per-side plate figure reads "7 kg a side"; the load opens Edit.
  static var aSide: String { L("aSide", "a side") }
  static var tapWeightToEdit: String { L("tapWeightToEdit", "Tap weight to edit") }
  // Instruction-first execution (verb + state). Verbs are uppercase legends; confirmations are quiet.
  static var exLoad: String { L("exLoad", "LOAD") }
  static var exUse: String { L("exUse", "USE") }
  static var exDumbbells: String { L("exDumbbells", "dumbbells") }
  static var exSetPin: String { L("exSetPin", "SET THE PIN") }
  static var exTakeBar: String { L("exTakeBar", "TAKE THE BAR") }
  static var exLoaded: String { L("exLoaded", "Loaded") }
  static var exInHand: String { L("exInHand", "In hand") }
  static var exPinSet: String { L("exPinSet", "Pin set") }
  static var exBarReady: String { L("exBarReady", "Bar ready") }

  // Rest
  static var ready: String { L("ready", "Ready") }
  static var rest: String { L("rest", "Rest") }
  static var next: String { L("next", "Next") }
  static var upNext: String { L("upNext", "Up next") }
  // WT4 up-next card legend words (uppercased at the call site).
  static var liftWord: String { L("liftWord", "LIFT") }
  static var setWord: String { L("setWord", "SET") }
  static var startNextSet: String { L("startNextSet", "Start next set") }
  static var skipRest: String { L("skipRest", "Skip rest") }
  static var startNextLift: String { L("startNextLift", "Start next lift") }
  // WT10 · EXERCISE DONE — the lift she just closed, named once on the transition ("Bench, done.").
  // Facts, not praise: it says what happened, and the next lift's own card says what is coming.
  static func liftDone(_ name: String) -> String { L("liftDone", "\(name), done.", ["name": name]) }
  static var addRest: String { L("addRest", "+15 sec") }
  // Compact form for the side-by-side rest action row (fits the 41 mm case without scrolling).
  static var addShort: String { L("addShort", "+15s") }

  // THE SIGNATURE MOMENT (2026-07-17) — Loop 1 moved the next set's load, and this is Hush saying
  // so, on the wrist. The phone's sentence (en.json `workout.correctedUp/Down`) also names the band
  // edge the set crossed: "You did 12. Your range tops out at 10, so I added weight." The wrist
  // says the shorter half, because the wire does not carry the band and because the clause that
  // EARNS the change is the reps — the phone owns the fuller account. Both halves are measured
  // fact; neither invents a reason (R7).
  // WT3 · THE CORRECTION — the eyebrow states WHICH WAY, because the number alone does not: a load
  // that moved from 34 to 31.5 is only obviously an ease to someone who read both figures.
  static var easedForYou: String { L("easedForYou", "EASED FOR YOU") }
  static var raisedForYou: String { L("raisedForYou", "RAISED FOR YOU") }
  /// The beat's closing line: what happened, and where she is. It asks for nothing.
  static var loggedResting: String { L("loggedResting", "logged · resting") }

  static func corrected(_ reps: Int, up: Bool) -> String {
    up
      ? L("correctedUp", "You did \(reps), so I added weight.", ["reps": "\(reps)"])
      : L("correctedDown", "You did \(reps), so I took weight off.", ["reps": "\(reps)"])
  }

  // Set Confirmation
  static var recorded: String { L("recorded", "Recorded.") }
  static func setLogged(_ n: Int, _ m: Int) -> String {
    L("setLogged", "Set \(n) of \(m) logged", ["n": "\(n)", "m": "\(m)"])
  }

  // Pause
  static var workoutHeld: String { L("workoutHeld", "Workout held") }
  static var pausedTitle: String { L("pausedTitle", "Paused") }
  static var resume: String { L("resume", "Resume") }
  static var endWorkout: String { L("endWorkout", "End workout") }
  // WT13 (paused): a third way out — flag a body area that hurts, so the phone can act on it.
  // Clay-outlined, quiet: it is a report, not a command.
  static var somethingOff: String { L("somethingOff", "Something feels off") }

  // End guard: ending is irreversible, so it asks first (WT13b). The mock makes "End workout"
  // the clay primary on the confirm screen — you already asked to end to get here — with
  // "Keep going" the outlined way back, and a serif question + a quiet reassurance above them.
  static var endConfirmTitle: String { L("endConfirmTitle", "End the\nworkout?") }
  static var endConfirmSub: String { L("endConfirmSub", "Saved as-is at this point.") }
  static var finishConfirmTitle: String { L("finishConfirmTitle", "Finish & save?") }
  static var keepGoing: String { L("keepGoing", "Keep going") }
  static var endAndSave: String { L("endAndSave", "End & save") }

  // WT14 (what's off): no body map on a 41 mm case — the areas as a plain list, the phone's
  // body-map regions in words. Selecting one reports it; the phone owns what to do with it.
  static var whereIsIt: String { L("whereIsIt", "WHERE IS IT?") }
  // The MAP'S OWN muscles, in words (founder 2026-07-28). The wrist and the engine speak one
  // vocabulary, so her report needs no interpretation on the way in — she names the muscle that is
  // rested and the lifts that are swapped. Mirrors `domain/painReport.WRIST_PAIN_MUSCLES`; the
  // phone keeps the old JOINT words as aliases so an un-updated wrist still lands.
  ///
  /// The wire value and the label are now two different things, and they have to be: she taps a row
  /// that reads "חזה" and the phone must receive `Chest`. One list, two columns — a screen that
  /// sent back what it displayed would hand the engine a muscle it has never heard of.
  static let painAreaValues = [
    "Chest", "Shoulders", "Triceps", "Back", "Biceps",
    "Quads", "Hamstrings", "Glutes", "Calves", "Core",
  ]
  static var painAreas: [MuscleChoice] {
    painAreaValues.map { MuscleChoice(value: $0, label: muscle($0)) }
  }
  struct MuscleChoice: Identifiable {
    let value: String // the body map's own name — what crosses the wire
    let label: String // what she reads
    var id: String { value }
  }

  // WT14b · HOW SHARP? — the SAME three the phone asks (§13.2), in the same order, because the only
  // thing the answer buys is how long the muscle rests. The wire values are the phone's own
  // (`PainSeverity`); the labels are what she reads.
  static var howSharp: String { L("howSharp", "HOW SHARP?") }
  /// A named type, not a tuple: `ForEach(_, id: \.value)` needs a key path, and Swift has no key
  /// paths into tuples.
  struct SeverityChoice: Identifiable {
    let value: String // the phone's own `PainSeverity` — what crosses the wire
    let label: String // what she reads
    var id: String { value }
  }
  static var severityChoices: [SeverityChoice] {
    [
      SeverityChoice(value: "twinge", label: L("severityTwinge", "A twinge")),
      SeverityChoice(value: "pain", label: L("severityPain", "It hurts")),
      SeverityChoice(value: "sharp", label: L("severitySharp", "Sharp")),
    ]
  }

  // WT15 · ENGINE RESPONDS — the acknowledgement her report earns. Facts only: what Hush did, not
  // a diagnosis and not sympathy. The muscle's name arrives from the row she tapped.
  static var gotIt: String { L("gotIt", "GOT IT") }
  /// The area arrives as the MAP'S OWN name ("Chest") and is shown to her in her own word.
  static func easingToday(_ area: String) -> String {
    L("easingToday", "Easing your\n\(area.lowercased()) today.", ["muscle": muscle(area)])
  }
  static var easedSwapped: String { L("easedSwapped", "Its lifts → swapped") }
  static var easedRests: String { L("easedRests", "Resting for now") }

  // WT7 · THE FIRST FOUR — the lobby, the first time. She has no history, so there is nothing to
  // report and nothing to compare: the honest line is what the engine is about to DO.
  static var firstWorkout: String { L("firstWorkout", "FIRST WORKOUT") }
  static var findYourWeights: String { L("findYourWeights", "Let\u{2019}s find\nyour weights.") }
  static var liftTillHonest: String { L("liftTillHonest", "Lift till it\u{2019}s honest — I learn from it.") }
  static var start: String { L("start", "Start") }

  // WT5 · REST — LEARNED. Her measured rest (S-17) is already what the timer runs; this is the
  // line that SAYS so, and it appears only once the median is hers rather than the bootstrap.
  static var yourPace: String { L("yourPace", "your pace") }

  // CR3 · KM LOGGED — a whole kilometre lands like a logged set.
  static func kilometreSplit(_ n: Int) -> String {
    L("kilometreSplit", "KILOMETRE \(n) · SPLIT", ["n": "\(n)"])
  }
  static var perKm: String { L("perKm", "/km") }
  static var quickestThisRun: String { L("quickestThisRun", "QUICKEST THIS RUN") }
  static var loggedBackToRun: String { L("loggedBackToRun", "LOGGED · BACK TO RUN") }

  // WT13c · GLANCE — swipe the other way from the set. Heart, burn, and her own work so far.
  static var nowLegend: String { L("nowLegend", "NOW") }
  static var backToYourSet: String { L("backToYourSet", "back to your set") }
  static var metricKgSets: String { L("metricKgSets", "KG · SETS") }

  // Controls page (swipe right — the Apple Workout idiom). The legend names what is
  // actually THERE (founder 2026-07-12: "Controls" was opaque); the swipe hint on the
  // stages is the ‹ ⏸ glyph pair + PAUSE.
  static var controlsLegend: String { L("controlsLegend", "Pause · End") }
  static var pause: String { L("pause", "Pause") }
  static var metricElapsed: String { L("metricElapsed", "Elapsed") }
  static var metricHeart: String { L("metricHeart", "Heart") }
  static var metricKcal: String { L("metricKcal", "Kcal") }
  static var bpm: String { L("bpm", "bpm") }

  // Complete
  static var saved: String { L("saved", "Saved") }
  /// The read-back beat's legend — the workout being walked lift by lift (founder 2026-07-12).
  static var reading: String { L("reading", "Reading your workout") }
  // WT6 SESSION EARNED: the close is a quiet serif line, not a workout name + "complete." The
  // wrist's version of the phone's "That's the work." — measured fact, no praise.
  static var thatsTheWork: String { L("thatsTheWork", "That’s the\nwork.") }
  // Forced break so the name and "complete." stack like the design (and never
  // ellipsize on the smaller 41 mm case).
  static func complete(_ name: String) -> String { L("complete", "\(name)\ncomplete.", ["name": name]) }
  static var done: String { L("done", "Done") }
  /// Beat 4's legend — a mark the workout crossed (en.json `milestones.legend`). The mark's own
  /// words arrive on the wire, already written by the phone.
  static var milestone: String { L("milestone", "Milestone") }
  static var metricTime: String { L("metricTime", "Time") }
  static var metricSets: String { L("metricSets", "Sets") }
  // WT6 four-metric row (mock uppercases the mono labels): MIN · KCAL · T · UP.
  static var metricMinShort: String { L("metricMinShort", "MIN") }
  static var metricKcalShort: String { L("metricKcalShort", "KCAL") }
  static var metricTonnesShort: String { L("metricTonnesShort", "T") }
  static var metricUpShort: String { L("metricUpShort", "UP") }
  // The count of lifts whose load the model raised this session ("Up" read as a cipher —
  // founder 2026-07-12).
  static var metricUp: String { L("metricUp", "Raised") }

  // Swap (one-tap — Hush picks; kept for accessibility labels)
  static var swapTitle: String { L("swapTitle", "Swap exercise") }
  // The moment after a one-tap swap carries a way back (founder 2026-07-12).
  static var undo: String { L("undo", "Undo") }

  // Open training (run / walk on the wrist — recorded to Health, never coached)
  static var openTraining: String { L("openTraining", "Open training") }
  // CR1 · READY — one cardio, not two gaits (founder 2026-08-01). The gait is decided, not asked.
  static var startCardio: String { L("startCardio", "Start cardio") }
  static var recordedNotCoached: String { L("recordedNotCoached", "Recorded beside your lifting.") }
  // CR4 · DONE — a run closes on its DISTANCE, the way a workout closes on its work.
  static var cardioSaved: String { L("cardioSaved", "CARDIO · SAVED") }
  static var thatsTheDistance: String { L("thatsTheDistance", "That’s the distance.") }
  static var run: String { L("run", "Run") }
  static var walk: String { L("walk", "Walk") }
  static var running: String { L("running", "Running") }
  static var walking: String { L("walking", "Walking") }
  static var finishSave: String { L("finishSave", "Finish & save") }
  static var metricKm: String { L("metricKm", "Km") }
  static var recordedLegend: String { L("recordedLegend", "Recorded") }

  // Connection
  static var reconnecting: String { L("reconnecting", "Reconnecting") }
  static var continueOnPhone: String { L("continueOnPhone", "Continue on iPhone") }
}
