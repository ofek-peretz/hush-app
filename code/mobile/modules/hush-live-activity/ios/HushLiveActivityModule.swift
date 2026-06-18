import ActivityKit
import ExpoModulesCore
import Foundation

// Expo module that controls the Hush session Live Activity from JS.
//
// JS swap point: `src/platform/liveActivity.ts` (liveActivityNative) calls these
// async functions by the native module name "HushLiveActivity". The module is the
// ONLY writer of the Activity; the phone's session machine is the source of truth,
// and the Live Activity is a read-only projection of the canonical SessionMirror.

/// Typed args from JS — mirrors `LiveActivityState` in liveActivity.ts.
struct ActivityStateRecord: Record {
  @Field var exerciseName: String = ""
  @Field var setLabel: String = ""
  /// Absolute rest-end instant in ms epoch; nil unless resting.
  @Field var restEndsAtMs: Double? = nil
  @Field var isResting: Bool = false
}

public class HushLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HushLiveActivity")

    // Whether the user has Live Activities enabled for the app (Settings toggle).
    Function("areActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    // Start a new Live Activity. Resolves true if one was requested.
    AsyncFunction("startActivity") { (state: ActivityStateRecord) -> Bool in
      return HushLiveActivityController.shared.start(state)
    }

    // Update the running Live Activity (no-op if none is active).
    AsyncFunction("updateActivity") { (state: ActivityStateRecord) in
      HushLiveActivityController.shared.update(state)
    }

    // End the running Live Activity immediately (no-op if none is active).
    AsyncFunction("endActivity") {
      HushLiveActivityController.shared.end()
    }
  }
}

/// Holds the single in-flight Activity and bridges record → ContentState. All
/// ActivityKit access is guarded by `#available(iOS 16.2, *)`; the stored handle is
/// `Any?` so the type need not be annotated. Thread-safe enough for the app's usage
/// (start/update/end are serialized by the JS session lifecycle).
final class HushLiveActivityController {
  static let shared = HushLiveActivityController()

  private var current: Any?

  @available(iOS 16.2, *)
  private func contentState(from r: ActivityStateRecord) -> HushSessionAttributes.ContentState {
    let restEnd = r.restEndsAtMs.map { Date(timeIntervalSince1970: $0 / 1000.0) }
    return HushSessionAttributes.ContentState(
      exerciseName: r.exerciseName,
      setLabel: r.setLabel,
      restEndDate: r.isResting ? restEnd : nil,
      isResting: r.isResting
    )
  }

  func start(_ r: ActivityStateRecord) -> Bool {
    guard #available(iOS 16.2, *) else { return false }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
    // If one is already running, just update it (one session ⇒ one activity).
    if let activity = current as? Activity<HushSessionAttributes> {
      Task { await activity.update(ActivityContent(state: contentState(from: r), staleDate: nil)) }
      return true
    }
    do {
      let activity = try Activity.request(
        attributes: HushSessionAttributes(),
        content: ActivityContent(state: contentState(from: r), staleDate: nil),
        pushType: nil
      )
      current = activity
      return true
    } catch {
      return false
    }
  }

  func update(_ r: ActivityStateRecord) {
    guard #available(iOS 16.2, *), let activity = current as? Activity<HushSessionAttributes> else { return }
    Task { await activity.update(ActivityContent(state: contentState(from: r), staleDate: nil)) }
  }

  func end() {
    guard #available(iOS 16.2, *), let activity = current as? Activity<HushSessionAttributes> else { return }
    current = nil
    Task { await activity.end(nil, dismissalPolicy: .immediate) }
  }
}
