import ActivityKit
import ExpoModulesCore
import Foundation

// Expo module that controls the Hush Live Activities from JS.
//
// JS swap point: `src/platform/liveActivity.ts` calls these async functions by the
// native module name "HushLiveActivity". The module is the ONLY writer of the
// Activities; the phone's session / cardio machines are the source of truth, and the
// Live Activity is a read-only projection.
//
// Two kinds share one entry point, discriminated by `kind` ("strength" | "cardio").
// Only one Activity is in flight at a time (you cannot lift and run at once); starting
// one kind ends the other.

/// Flat record from JS — superset of `LiveActivityState` and `CardioLiveActivityState`
/// in liveActivity.ts, discriminated by `kind`.
struct ActivityRecord: Record {
  @Field var kind: String = "strength"

  // ---- strength ----
  @Field var workoutName: String = ""
  @Field var phase: String = "set"
  @Field var exerciseName: String = ""
  @Field var setLabel: String = ""
  @Field var liftIndex: Int = 1
  @Field var liftCount: Int = 1
  @Field var targetWeight: Double? = nil
  @Field var targetReps: Int = 0
  @Field var restEndsAtMs: Double? = nil
  @Field var restTotalS: Double? = nil
  @Field var isResting: Bool = false
  @Field var nextExerciseName: String? = nil
  @Field var nextTargetWeight: Double? = nil
  @Field var nextTargetReps: Int? = nil
  // v7 6.2 — the set count as NUMBERS, for the dot row beside the load.
  @Field var setIndex: Int = 1
  @Field var setCount: Int = 1

  // ---- cardio ----
  @Field var gait: String = "run"
  @Field var paused: Bool = false
  @Field var startedAtMs: Double = 0
  @Field var elapsedSec: Double = 0
  @Field var distanceKm: Double = 0
  @Field var paceSec: Double = 0
  @Field var hr: Int = 0
  @Field var calories: Int = 0
  @Field var lastSplit: SplitRecord? = nil
}

struct SplitRecord: Record {
  @Field var km: Int = 0
  @Field var paceSec: Double = 0
  @Field var fastest: Bool = false
}

public class HushLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HushLiveActivity")

    Function("areActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("startActivity") { (state: ActivityRecord) -> Bool in
      HushActivityController.shared.start(state)
    }

    AsyncFunction("updateActivity") { (state: ActivityRecord) in
      HushActivityController.shared.update(state)
    }

    AsyncFunction("endActivity") {
      HushActivityController.shared.end()
    }
  }
}

/// Holds the single in-flight Activity (strength OR cardio) and bridges record →
/// ContentState. All ActivityKit access is guarded by `#available(iOS 16.2, *)`.
final class HushActivityController {
  static let shared = HushActivityController()
  private var current: Any?

  // ---- projections ----
  @available(iOS 16.2, *)
  private func strengthState(_ r: ActivityRecord) -> HushSessionAttributes.ContentState {
    HushSessionAttributes.ContentState(
      workoutName: r.workoutName,
      phase: r.phase,
      exerciseName: r.exerciseName,
      setLabel: r.setLabel,
      liftIndex: r.liftIndex,
      liftCount: r.liftCount,
      targetWeight: r.targetWeight,
      targetReps: r.targetReps,
      restEndDate: r.isResting ? r.restEndsAtMs.map { Date(timeIntervalSince1970: $0 / 1000.0) } ?? nil : nil,
      restTotalS: r.isResting ? r.restTotalS : nil,
      isResting: r.isResting,
      nextExerciseName: r.nextExerciseName,
      nextTargetWeight: r.nextTargetWeight,
      nextTargetReps: r.nextTargetReps,
      setIndex: r.setIndex,
      setCount: r.setCount
    )
  }

  @available(iOS 16.2, *)
  private func cardioState(_ r: ActivityRecord) -> HushCardioAttributes.ContentState {
    HushCardioAttributes.ContentState(
      gait: r.gait,
      paused: r.paused,
      startDate: Date(timeIntervalSince1970: (r.startedAtMs > 0 ? r.startedAtMs : Date().timeIntervalSince1970 * 1000) / 1000.0),
      elapsedSec: r.elapsedSec,
      distanceKm: r.distanceKm,
      paceSec: r.paceSec,
      hr: r.hr,
      calories: r.calories,
      lastSplitKm: r.lastSplit?.km,
      lastSplitPaceSec: r.lastSplit?.paceSec,
      lastSplitFastest: r.lastSplit?.fastest ?? false
    )
  }

  // ---- lifecycle ----
  func start(_ r: ActivityRecord) -> Bool {
    guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
    // If an activity of the same kind is already running, just update it.
    if r.kind == "cardio", current is Activity<HushCardioAttributes> {
      update(r); return true
    }
    if r.kind == "strength", current is Activity<HushSessionAttributes> {
      update(r); return true
    }
    end() // switching kinds (or first start) — clear any prior activity
    do {
      if r.kind == "cardio" {
        current = try Activity.request(
          attributes: HushCardioAttributes(),
          content: ActivityContent(state: cardioState(r), staleDate: nil), pushType: nil)
      } else {
        current = try Activity.request(
          attributes: HushSessionAttributes(),
          content: ActivityContent(state: strengthState(r), staleDate: nil), pushType: nil)
      }
      return true
    } catch {
      return false
    }
  }

  func update(_ r: ActivityRecord) {
    guard #available(iOS 16.2, *) else { return }
    if let a = current as? Activity<HushCardioAttributes> {
      Task { await a.update(ActivityContent(state: cardioState(r), staleDate: nil)) }
    } else if let a = current as? Activity<HushSessionAttributes> {
      Task { await a.update(ActivityContent(state: strengthState(r), staleDate: nil)) }
    }
  }

  func end() {
    guard #available(iOS 16.2, *) else { return }
    if let a = current as? Activity<HushCardioAttributes> {
      Task { await a.end(nil, dismissalPolicy: .immediate) }
    } else if let a = current as? Activity<HushSessionAttributes> {
      Task { await a.end(nil, dismissalPolicy: .immediate) }
    }
    current = nil
  }
}
