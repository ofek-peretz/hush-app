import Foundation

// Watch copy — verbatim mirror of en.json `watch.*`, realizing the Claude Design
// watch (ui_kits/watch). The watch target has no i18n runtime; v1 is English only,
// so these are constants. If en.json `watch.*` changes, change these too.
enum WatchCopy {
  // Start
  static let nextWorkout = "Next workout"
  static let begin = "Begin"
  static let chooseWorkout = "Choose workout"
  // Calendar-primary cadence: the week rolls SUNDAY 04:00 (keep in step with en.json).
  static let recovery = "Recovery — your next workout opens Sunday"
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

  // Set Confirmation
  static let recorded = "Recorded."
  static func setLogged(_ n: Int, _ m: Int) -> String { "Set \(n) of \(m) logged" }

  // Pause
  static let workoutHeld = "Workout held"
  static let pausedTitle = "Paused"
  static let resume = "Resume"
  static let endWorkout = "End workout"

  // Controls page (swipe left — the Apple Workout idiom)
  static let controls = "Controls"
  static let pause = "Pause"
  static let metricElapsed = "Elapsed"
  static let metricHeart = "Heart"
  static let metricKcal = "Kcal"
  static let bpm = "bpm"

  // Complete
  static let saved = "Saved"
  // Forced break so the name and "complete." stack like the design (and never
  // ellipsize on the smaller 41 mm case).
  static func complete(_ name: String) -> String { "\(name)\ncomplete." }
  static let done = "Done"
  static let metricTime = "Time"
  static let metricSets = "Sets"
  static let metricUp = "Up"

  // Swap (one-tap — Hush picks; kept for accessibility labels)
  static let swapTitle = "Swap exercise"

  // Open training (run / walk on the wrist — recorded to Health, never coached)
  static let openTraining = "Open training"
  static let run = "Run"
  static let walk = "Walk"
  static let running = "Running"
  static let walking = "Walking"
  static let finishSave = "Finish & save"
  static let metricKm = "Km"

  // Connection
  static let reconnecting = "Reconnecting"
  static let continueOnPhone = "Continue on iPhone"
  static let done2 = "Done"
}
