import Foundation

// Watch copy — verbatim mirror of en.json `watch.*`, realizing the Claude Design
// watch (ui_kits/watch). The watch target has no i18n runtime; v1 is English only,
// so these are constants. If en.json `watch.*` changes, change these too.
enum WatchCopy {
  // Start
  static let nextWorkout = "Next workout"
  static let begin = "Begin"
  static let chooseWorkout = "Choose workout"
  static let recovery = "Recovery — your next workout opens Monday"
  static func lifts(_ n: Int) -> String { "\(n) lifts" }

  // Active Set
  static let editResult = "Edit result"
  static let completeSet = "Complete set"
  static let save = "Save"
  static let crownToAdjust = "Crown to adjust"
  static let kg = "kg"
  static let bodyweight = "BW"

  // Rest
  static let ready = "Ready"
  static let rest = "Rest"
  static let next = "Next"
  static let upNext = "Up next"
  static let startNextSet = "Start next set"
  static let skipRest = "Skip rest"
  static let startNextLift = "Start next lift"
  static let addRest = "+15 sec"

  // Set Confirmation
  static let recorded = "Recorded."
  static func setLogged(_ n: Int, _ m: Int) -> String { "Set \(n) of \(m) logged" }

  // Pause
  static let workoutHeld = "Workout held"
  static let pausedTitle = "Paused"
  static let resume = "Resume"
  static let endWorkout = "End workout"

  // Complete
  static let saved = "Saved"
  static func complete(_ name: String) -> String { "\(name) complete." }
  static let done = "Done"
  static let metricTime = "Time"
  static let metricSets = "Sets"
  static let metricUp = "Up"

  // Swap
  static let swapTitle = "Swap exercise"
  static let swapHint = "Hush recalibrates the load."
  static let current = "Current"
  static let cancel = "Cancel"

  // Connection
  static let reconnecting = "Reconnecting"
  static let continueOnPhone = "Continue on iPhone"
  static let done2 = "Done"
}
