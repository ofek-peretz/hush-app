import ActivityKit
import ExpoModulesCore
import Foundation

// Expo module that controls the Hush Live Activities from JS.
//
// JS swap point: `src/platform/liveActivity.ts` calls these async functions by the
// native module name "HushLiveActivity". The phone's session / cardio machines are the
// source of truth; the Live Activity is a projection of them — and, since 2026-09-08,
// a CONTROL as well: three lock-screen taps (`targets/widget/HushLockIntents.swift`)
// queue themselves in the App Group and whistle over a Darwin notification. This module
// listens for the whistle and hands the queue to JS (`onLockIntent` → `drainLockIntents`),
// and JS replays each tap at the instant it happened.
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
  // The lock screen as a control (2026-09-08) — see HushSessionAttributes.
  @Field var restAfterS: Double = 0
  @Field var lastSetOfSession: Bool = false
  @Field var nextSetLabel: String = ""
  @Field var nextSetIndex: Int = 1
  @Field var nextSetCount: Int = 1
  @Field var alertTitle: String = ""
  @Field var alertBody: String = ""
  @Field var wordRest: String = "Rest"
  @Field var wordNext: String = "Next up"
  @Field var wordPaused: String = "Paused"
  @Field var wordLogged: String = "Logged"
  @Field var actDone: String = "Done"
  @Field var actAddRest: String = "+15 s"
  @Field var actStart: String = "Next set"
  // Her figures, typed on the lock screen (2026-09-08) — see HushSessionAttributes.
  @Field var unitLabel: String = "kg"
  @Field var weightStep: Double = 2.5
  @Field var wordReps: String = "reps"
  // The voice's loading dialogue (spec §3.2): Ready beside Done while the set waits for her word.
  @Field var awaitingReady: Bool = false
  @Field var actReady: String = "Ready"

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

/// The App Group queue the lock-screen intents write (`HushLockIntentBus` in the widget target —
/// the same suite, the same key, read here because a pod cannot see the app target's Swift).
private enum LockQueue {
  static let suite = "group.com.hushfitness.app"
  static let key = "hush.lockIntents"
  static let darwinName = "com.hushfitness.app.lockIntent"

  /// Take everything queued. Only the ids handed over are removed, so a tap pushed by the intent
  /// process between the read and the write is kept for the next drain, never lost.
  static func drain() -> [[String: Any]] {
    guard let store = UserDefaults(suiteName: suite) else { return [] }
    let queue = store.array(forKey: key) as? [[String: Any]] ?? []
    if queue.isEmpty { return [] }
    let taken = Set(queue.compactMap { $0["id"] as? String })
    let now = store.array(forKey: key) as? [[String: Any]] ?? []
    let left = now.filter { !(($0["id"] as? String).map(taken.contains) ?? false) }
    if left.isEmpty { store.removeObject(forKey: key) } else { store.set(left, forKey: key) }
    return queue
  }
}

/// Her figures from the lock screen's steppers, parked in the App Group until the set is logged —
/// the same suite and key `HushLockPending` writes in the widget target (a pod cannot see the app
/// target's Swift, so the shape is declared twice; `theLockScreenIsAControl` holds the literals).
private enum LockPending {
  static let key = "hush.lockPending"
  struct Figures { let key: String; let weight: Double?; let reps: Int }

  static func key(liftIndex: Int, setIndex: Int) -> String { "\(liftIndex)/\(setIndex)" }

  static func read() -> Figures? {
    guard let store = UserDefaults(suiteName: LockQueue.suite),
          let d = store.dictionary(forKey: key),
          let k = d["key"] as? String,
          let reps = d["reps"] as? Int else { return nil }
    return Figures(key: k, weight: d["weight"] as? Double, reps: reps)
  }

  static func clear() {
    UserDefaults(suiteName: LockQueue.suite)?.removeObject(forKey: key)
  }
}

public class HushLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HushLiveActivity")
    Events("onLockIntent")

    OnCreate {
      // The whistle: a lock-screen intent was queued. Emitted without a payload — JS drains the
      // queue itself, so an event and a foreground drain can never apply the same tap twice.
      let center = CFNotificationCenterGetDarwinNotifyCenter()
      let observer = Unmanaged.passUnretained(self).toOpaque()
      CFNotificationCenterAddObserver(
        center,
        observer,
        { _, observer, _, _, _ in
          guard let observer = observer else { return }
          let module = Unmanaged<HushLiveActivityModule>.fromOpaque(observer).takeUnretainedValue()
          DispatchQueue.main.async { module.sendEvent("onLockIntent", [:]) }
        },
        LockQueue.darwinName as CFString,
        nil,
        .deliverImmediately
      )
    }

    OnDestroy {
      CFNotificationCenterRemoveEveryObserver(
        CFNotificationCenterGetDarwinNotifyCenter(),
        Unmanaged.passUnretained(self).toOpaque()
      )
    }

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

    /// Every lock-screen tap since the last drain — `{ id, type, atMs }` each — and the queue is
    /// emptied. JS replays them in order at their instants (`sessionStore.applyLockIntents`).
    AsyncFunction("drainLockIntents") { () -> [[String: Any]] in
      LockQueue.drain()
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
    /*
     * ════ HER FIGURES SURVIVE A REPUBLISH (2026-09-08) ════
     * The lock screen's steppers write her load and reps into the App Group (`hush.lockPending`,
     * keyed by the set they belong to) and project them onto the card locally. The phone republishes
     * this state on every change of its own — a tick, a mirror — and would put the prescription back
     * over her numbers. So the pending figures are merged HERE, on the set they were typed for, and
     * dropped the moment the card shows any other set (or a rest): a stale edit never lands on the
     * wrong set.
     */
    var weight = r.targetWeight
    var reps = r.targetReps
    let key = LockPending.key(liftIndex: r.liftIndex, setIndex: r.setIndex)
    if r.phase == "set", let p = LockPending.read(), p.key == key {
      weight = p.weight
      reps = p.reps
    } else {
      LockPending.clear()
    }
    return HushSessionAttributes.ContentState(
      workoutName: r.workoutName,
      phase: r.phase,
      exerciseName: r.exerciseName,
      setLabel: r.setLabel,
      liftIndex: r.liftIndex,
      liftCount: r.liftCount,
      targetWeight: weight,
      targetReps: reps,
      restEndDate: r.isResting ? r.restEndsAtMs.map { Date(timeIntervalSince1970: $0 / 1000.0) } ?? nil : nil,
      restTotalS: r.isResting ? r.restTotalS : nil,
      isResting: r.isResting,
      nextExerciseName: r.nextExerciseName,
      nextTargetWeight: r.nextTargetWeight,
      nextTargetReps: r.nextTargetReps,
      setIndex: r.setIndex,
      setCount: r.setCount,
      restAfterS: r.restAfterS,
      lastSetOfSession: r.lastSetOfSession,
      nextSetLabel: r.nextSetLabel,
      nextSetIndex: r.nextSetIndex,
      nextSetCount: r.nextSetCount,
      alertTitle: r.alertTitle,
      alertBody: r.alertBody,
      wordRest: r.wordRest,
      wordNext: r.wordNext,
      wordPaused: r.wordPaused,
      wordLogged: r.wordLogged,
      actDone: r.actDone,
      actAddRest: r.actAddRest,
      actStart: r.actStart,
      unitLabel: r.unitLabel,
      weightStep: r.weightStep,
      wordReps: r.wordReps,
      awaitingReady: r.awaitingReady,
      actReady: r.actReady
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
