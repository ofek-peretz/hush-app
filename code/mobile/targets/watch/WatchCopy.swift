import Foundation

// Founder-LOCKED watch copy — verbatim mirror of en.json `watch.*`
// (WATCH_EXPERIENCE_SPEC.md). The watch target has no i18n runtime; v1 is English
// only, so these are constants. If en.json `watch.*` changes, change these too.
// "Well Done." keeps its period — do not alter.
enum WatchCopy {
  static let next = "Next:"
  static let interEncouragement = "You can do this."
  static let transitionEncouragement = "Let's go."
  static let pausedTitle = "Paused"
  static let finishPrompt = "Finish Workout?"
  static let finishYes = "Yes"
  static let finishNo = "No"
  static let completeSet = "Complete Set"
  static let couldntComplete = "Couldn't Complete"
  static let repAdjustTitle = "Actual reps"
  static let confirm = "Confirm"
  static let cancel = "Cancel"
  static let resume = "Resume"
  static let finish = "Finish"
  static let ready = "Ready"
  static let exerciseBusy = "Exercise Busy"
  static let workoutCompleteTitle = "Well Done."
  static let reconnecting = "Reconnecting"
  static let continueOnPhone = "Continue on iPhone"

  static func exerciseComplete(_ exercise: String) -> String { "\(exercise) Complete" }
  static func repAdjustTarget(_ reps: Int) -> String { "Target \(reps)" }
}
