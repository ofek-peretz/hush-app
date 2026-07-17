import Foundation

// Watch copy — verbatim mirror of en.json `watch.*`, realizing the Claude Design
// watch (ui_kits/watch). The watch target has no i18n runtime; v1 is English only,
// so these are constants. If en.json `watch.*` changes, change these too.
enum WatchCopy {
  // Start
  static let nextWorkout = "Next workout"
  static let begin = "Begin"
  static let chooseWorkout = "Choose workout"
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
  static let kg = "kg"
  static let bodyweight = "BW"
  // Bodyweight on the LIVE stage: the reps are the hero, and "bodyweight" is a whisper under
  // them (founder 2026-07-11 — the athlete on a pull-up already knows what they are lifting).
  static let reps = "reps"
  static let bodyweightQuiet = "Bodyweight"
  // Equipment-native setup line (item 11)
  static let perHand = "per hand"
  static let pin = "pin"
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
  static let startNextSet = "Start next set"
  static let skipRest = "Skip rest"
  static let startNextLift = "Start next lift"
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

  // End guard (founder 2026-07-12): ending is irreversible, so it asks first. "Keep going"
  // is the big safe default; the end action is a deliberate second button.
  static let endConfirmTitle = "End workout?"
  static let finishConfirmTitle = "Finish & save?"
  static let keepGoing = "Keep going"
  static let endAndSave = "End & save"

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
  // Forced break so the name and "complete." stack like the design (and never
  // ellipsize on the smaller 41 mm case).
  static func complete(_ name: String) -> String { "\(name)\ncomplete." }
  static let done = "Done"
  /// Beat 4's legend — a mark the workout crossed (en.json `milestones.legend`). The mark's own
  /// words arrive on the wire, already written by the phone.
  static let milestone = "Milestone"
  static let metricTime = "Time"
  static let metricSets = "Sets"
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
