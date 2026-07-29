import Foundation

// Watch copy — verbatim mirror of en.json `watch.*`, realizing the Claude Design
// watch (ui_kits/watch). The watch target has no i18n runtime; v1 is English only,
// so these are constants. If en.json `watch.*` changes, change these too.
enum WatchCopy {
  // Start
  static let nextWorkout = "Next workout"
  static let begin = "Begin"
  static let chooseWorkout = "Choose workout"
  // WT1 (today): the name sits under an "Up next" legend; the meta line reads "6 LIFTS · ~55 MIN";
  // the button row splits into "Another" (re-choose) and "Cardio" (run/walk).
  static let another = "Another"
  static let cardio = "Cardio"
  static let liftsWord = "LIFTS"
  // Calendar-primary cadence: the week rolls SATURDAY 20:30 local (founder 2026-07-13 — an update
  // nobody is awake for is not an update). Keep in step with en.json `watch.recovery`.
  static let recovery = "Recovery — your next week opens Saturday"
  // Paywall: training is gated on the phone; the wrist never starts (or bypasses) it.
  static let membershipNeeded = "Continue on iPhone — your membership needs attention"
  static func lifts(_ n: Int) -> String { "\(n) lifts" }
  static let idleWaiting = "Open Hush on iPhone"

  // Active Set
  static let editResult = "Edit result"
  static let completeSet = "Complete set"
  static let save = "Save"
  static let crownToAdjust = "Crown to adjust"
  // WT9 · EDIT SET: the header legend, the moss crown instruction, and the "N reps" pill.
  static let editSet = "EDIT SET"
  static let turnCrownToSet = "TURN CROWN TO SET"
  static func repsCount(_ n: Int) -> String { "\(n) reps" }
  static let kg = "kg"
  static let bodyweight = "BW"
  // Bodyweight on the LIVE stage: the reps are the hero, and "bodyweight" is a whisper under
  // them (founder 2026-07-11 — the athlete on a pull-up already knows what they are lifting).
  static let reps = "reps"
  static let bodyweightQuiet = "Bodyweight"
  // Equipment-native setup line (item 11)
  static let perHand = "per hand"
  static let pin = "pin"
  // WT2 (the set): the per-side plate figure reads "7 kg a side"; the load opens Edit.
  static let aSide = "a side"
  static let tapWeightToEdit = "Tap weight to edit"
  // Instruction-first execution (verb + state). Verbs are uppercase legends; confirmations are quiet.
  static let exLoad = "LOAD"
  static let exUse = "USE"
  static let exDumbbells = "dumbbells"
  static let exSetPin = "SET THE PIN"
  static let exTakeBar = "TAKE THE BAR"
  static let exLoaded = "Loaded"
  static let exInHand = "In hand"
  static let exPinSet = "Pin set"
  static let exBarReady = "Bar ready"

  // Rest
  static let ready = "Ready"
  static let rest = "Rest"
  static let next = "Next"
  static let upNext = "Up next"
  // WT4 up-next card legend words (uppercased at the call site).
  static let liftWord = "LIFT"
  static let setWord = "SET"
  static let startNextSet = "Start next set"
  static let skipRest = "Skip rest"
  static let startNextLift = "Start next lift"
  // WT10 · EXERCISE DONE — the lift she just closed, named once on the transition ("Bench, done.").
  // Facts, not praise: it says what happened, and the next lift's own card says what is coming.
  static func liftDone(_ name: String) -> String { "\(name), done." }
  static let addRest = "+15 sec"
  // Compact form for the side-by-side rest action row (fits the 41 mm case without scrolling).
  static let addShort = "+15s"

  // THE SIGNATURE MOMENT (2026-07-17) — Loop 1 moved the next set's load, and this is Hush saying
  // so, on the wrist. The phone's sentence (en.json `workout.correctedUp/Down`) also names the band
  // edge the set crossed: "You did 12. Your range tops out at 10, so I added weight." The wrist
  // says the shorter half, because the wire does not carry the band and because the clause that
  // EARNS the change is the reps — the phone owns the fuller account. Both halves are measured
  // fact; neither invents a reason (R7).
  static func corrected(_ reps: Int, up: Bool) -> String {
    "You did \(reps), so I \(up ? "added weight" : "took weight off")."
  }

  // Set Confirmation
  static let recorded = "Recorded."
  static func setLogged(_ n: Int, _ m: Int) -> String { "Set \(n) of \(m) logged" }

  // Pause
  static let workoutHeld = "Workout held"
  static let pausedTitle = "Paused"
  static let resume = "Resume"
  static let endWorkout = "End workout"
  // WT13 (paused): a third way out — flag a body area that hurts, so the phone can act on it.
  // Clay-outlined, quiet: it is a report, not a command.
  static let somethingOff = "Something feels off"

  // End guard: ending is irreversible, so it asks first (WT13b). The mock makes "End workout"
  // the clay primary on the confirm screen — you already asked to end to get here — with
  // "Keep going" the outlined way back, and a serif question + a quiet reassurance above them.
  static let endConfirmTitle = "End the\nworkout?"
  static let endConfirmSub = "Saved as-is at this point."
  static let finishConfirmTitle = "Finish & save?"
  static let keepGoing = "Keep going"
  static let endAndSave = "End & save"

  // WT14 (what's off): no body map on a 41 mm case — the areas as a plain list, the phone's
  // body-map regions in words. Selecting one reports it; the phone owns what to do with it.
  static let whereIsIt = "WHERE IS IT?"
  // The MAP'S OWN muscles, in words (founder 2026-07-28). The wrist and the engine speak one
  // vocabulary, so her report needs no interpretation on the way in — she names the muscle that is
  // rested and the lifts that are swapped. Mirrors `domain/painReport.WRIST_PAIN_MUSCLES`; the
  // phone keeps the old JOINT words as aliases so an un-updated wrist still lands.
  static let painAreas = [
    "Chest", "Shoulders", "Triceps", "Back", "Biceps",
    "Quads", "Hamstrings", "Glutes", "Calves", "Core",
  ]

  // WT14b · HOW SHARP? — the SAME three the phone asks (§13.2), in the same order, because the only
  // thing the answer buys is how long the muscle rests. The wire values are the phone's own
  // (`PainSeverity`); the labels are what she reads.
  static let howSharp = "HOW SHARP?"
  /// A named type, not a tuple: `ForEach(_, id: \.value)` needs a key path, and Swift has no key
  /// paths into tuples.
  struct SeverityChoice: Identifiable {
    let value: String // the phone's own `PainSeverity` — what crosses the wire
    let label: String // what she reads
    var id: String { value }
  }
  static let severityChoices: [SeverityChoice] = [
    SeverityChoice(value: "twinge", label: "A twinge"),
    SeverityChoice(value: "pain", label: "It hurts"),
    SeverityChoice(value: "sharp", label: "Sharp"),
  ]

  // WT15 · ENGINE RESPONDS — the acknowledgement her report earns. Facts only: what Hush did, not
  // a diagnosis and not sympathy. The muscle's name arrives from the row she tapped.
  static let gotIt = "GOT IT"
  static func easingToday(_ muscle: String) -> String { "Easing your\n\(muscle.lowercased()) today." }
  static let easedSwapped = "Its lifts → swapped"
  static let easedRests = "Resting for now"

  // WT7 · THE FIRST FOUR — the lobby, the first time. She has no history, so there is nothing to
  // report and nothing to compare: the honest line is what the engine is about to DO.
  static let firstWorkout = "FIRST WORKOUT"
  static let findYourWeights = "Let\u{2019}s find\nyour weights."
  static let liftTillHonest = "Lift till it\u{2019}s honest — I learn from it."
  static let start = "Start"

  // WT5 · REST — LEARNED. Her measured rest (S-17) is already what the timer runs; this is the
  // line that SAYS so, and it appears only once the median is hers rather than the bootstrap.
  static let yourPace = "your pace"

  // CR3 · KM LOGGED — a whole kilometre lands like a logged set.
  static func kilometreSplit(_ n: Int) -> String { "KILOMETRE \(n) · SPLIT" }
  static let perKm = "/km"
  static let quickestThisRun = "QUICKEST THIS RUN"
  static let loggedBackToRun = "LOGGED · BACK TO RUN"

  // WT13c · GLANCE — swipe the other way from the set. Heart, burn, and her own work so far.
  static let nowLegend = "NOW"
  static let backToYourSet = "back to your set"
  static let metricKgSets = "KG · SETS"

  // Controls page (swipe right — the Apple Workout idiom). The legend names what is
  // actually THERE (founder 2026-07-12: "Controls" was opaque); the swipe hint on the
  // stages is the ‹ ⏸ glyph pair + PAUSE.
  static let controlsLegend = "Pause · End"
  static let pause = "Pause"
  static let metricElapsed = "Elapsed"
  static let metricHeart = "Heart"
  static let metricKcal = "Kcal"
  static let bpm = "bpm"

  // Complete
  static let saved = "Saved"
  /// The read-back beat's legend — the workout being walked lift by lift (founder 2026-07-12).
  static let reading = "Reading your workout"
  // WT6 SESSION EARNED: the close is a quiet serif line, not a workout name + "complete." The
  // wrist's version of the phone's "That's the work." — measured fact, no praise.
  static let thatsTheWork = "That’s the\nwork."
  // Forced break so the name and "complete." stack like the design (and never
  // ellipsize on the smaller 41 mm case).
  static func complete(_ name: String) -> String { "\(name)\ncomplete." }
  static let done = "Done"
  /// Beat 4's legend — a mark the workout crossed (en.json `milestones.legend`). The mark's own
  /// words arrive on the wire, already written by the phone.
  static let milestone = "Milestone"
  static let metricTime = "Time"
  static let metricSets = "Sets"
  // WT6 four-metric row (mock uppercases the mono labels): MIN · KCAL · T · UP.
  static let metricMinShort = "MIN"
  static let metricKcalShort = "KCAL"
  static let metricTonnesShort = "T"
  static let metricUpShort = "UP"
  // The count of lifts whose load the model raised this session ("Up" read as a cipher —
  // founder 2026-07-12).
  static let metricUp = "Raised"

  // Swap (one-tap — Hush picks; kept for accessibility labels)
  static let swapTitle = "Swap exercise"
  // The moment after a one-tap swap carries a way back (founder 2026-07-12).
  static let undo = "Undo"

  // Open training (run / walk on the wrist — recorded to Health, never coached)
  static let openTraining = "Open training"
  static let run = "Run"
  static let walk = "Walk"
  static let running = "Running"
  static let walking = "Walking"
  static let finishSave = "Finish & save"
  static let metricKm = "Km"
  static let recordedLegend = "Recorded"

  // Connection
  static let reconnecting = "Reconnecting"
  static let continueOnPhone = "Continue on iPhone"
  static let done2 = "Done"
}
