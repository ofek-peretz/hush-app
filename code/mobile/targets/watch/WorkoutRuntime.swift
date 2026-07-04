import Foundation
import HealthKit

// The watch's OS-level workout runtime: owns the HKWorkoutSession + HKLiveWorkoutBuilder
// that grant the app background execution during a workout (timers and haptics keep firing
// wrist-down / screen-off) and persist the finished workout to HealthKit on the watch.
//
// This is the permanent standalone seam. Today the runtime is DRIVEN by the phone's
// authoritative mirror (WatchModel maps live/paused/complete phases onto it); when the
// watch becomes its own authority, the same runtime is driven by the local session
// instead — nothing here assumes a companion. It NEVER gates the workout flow: every
// HealthKit failure (no authorization, session error, save error) degrades to inert and
// the mirror-rendered experience is unaffected.
//
// All public methods must be called on the main queue; HealthKit callbacks are hopped
// back to main before touching state.
final class WorkoutRuntime: NSObject {
  private enum State { case idle, starting, live, ending }

  private let store = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  private var state: State = .idle
  private var saveOnEnd = true
  private var wantsPause = false

  private static var available: Bool { HKHealthStore.isHealthDataAvailable() }

  // MARK: Authorization

  /// The minimal standalone set: write workouts; read the sensor streams the live builder
  /// collects (heart rate + active energy). Safe to call every launch — the system only
  /// prompts the first time; a denial just means workouts aren't recorded to Health.
  func requestAuthorization() {
    guard Self.available else { return }
    let share: Set<HKSampleType> = [HKObjectType.workoutType()]
    var read: Set<HKObjectType> = [HKObjectType.workoutType()]
    if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) { read.insert(hr) }
    if let energy = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { read.insert(energy) }
    store.requestAuthorization(toShare: share, read: read) { _, _ in }
  }

  // MARK: Relaunch recovery

  /// Re-adopt a workout session that survived an app relaunch (crash / eviction). The
  /// authority still decides its fate: the next envelope either keeps it live, finishes
  /// it (persist), or abandons it (discard).
  func recoverActiveSession() {
    guard Self.available else { return }
    store.recoverActiveWorkoutSession { [weak self] session, _ in
      guard let session else { return }
      DispatchQueue.main.async { self?.adopt(session) }
    }
  }

  private func adopt(_ recovered: HKWorkoutSession) {
    guard state == .idle, session == nil else { return }
    recovered.delegate = self
    session = recovered
    builder = recovered.associatedWorkoutBuilder()
    if builder?.dataSource == nil {
      builder?.dataSource = HKLiveWorkoutDataSource(
        healthStore: store, workoutConfiguration: recovered.workoutConfiguration
      )
    }
    saveOnEnd = true
    switch recovered.state {
    case .ended, .stopped:
      state = .ending
      finalize()
    default:
      state = .live
      applyPauseState()
    }
  }

  // MARK: Lifecycle (idempotent — safe to call on every authoritative frame)

  /// A LIVE phase is showing: start the OS workout session on the first live frame, then
  /// keep the pause state in step on every subsequent one.
  func trackLive(paused: Bool) {
    wantsPause = paused
    switch state {
    case .idle: begin()
    case .live: applyPauseState()
    case .starting, .ending: break // pause state is re-applied when the transition settles
    }
  }

  /// The workout completed on the authority — end the OS session and persist the HKWorkout.
  func finish() { end(save: true) }

  /// The session evaporated without completing (abandoned on the authority) — discard.
  func abandon() { end(save: false) }

  private func begin() {
    guard Self.available, state == .idle else { return }
    let config = HKWorkoutConfiguration()
    config.activityType = .traditionalStrengthTraining
    config.locationType = .indoor
    let started: HKWorkoutSession
    do {
      started = try HKWorkoutSession(healthStore: store, configuration: config)
    } catch {
      return // no OS runtime this workout; the rendered experience is unaffected
    }
    let liveBuilder = started.associatedWorkoutBuilder()
    liveBuilder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
    started.delegate = self
    session = started
    builder = liveBuilder
    saveOnEnd = true
    state = .starting
    let start = Date()
    started.startActivity(with: start)
    liveBuilder.beginCollection(withStart: start) { [weak self] _, _ in
      DispatchQueue.main.async {
        guard let self, self.state == .starting else { return }
        self.state = .live
        self.applyPauseState()
      }
    }
  }

  private func applyPauseState() {
    guard state == .live, let session else { return }
    if wantsPause, session.state == .running {
      session.pause()
    } else if !wantsPause, session.state == .paused {
      session.resume()
    }
  }

  private func end(save: Bool) {
    guard session != nil, state == .starting || state == .live else { return }
    saveOnEnd = save
    state = .ending
    session?.end() // the delegate's .ended transition finalizes collection + save/discard
  }

  private func finalize() {
    guard let builder else {
      reset()
      return
    }
    let done: () -> Void = { [weak self] in DispatchQueue.main.async { self?.reset() } }
    if saveOnEnd {
      builder.endCollection(withEnd: Date()) { _, _ in
        builder.finishWorkout { _, _ in done() }
      }
    } else {
      builder.discardWorkout()
      done()
    }
  }

  private func reset() {
    session = nil
    builder = nil
    state = .idle
    wantsPause = false
    saveOnEnd = true
  }
}

// MARK: HKWorkoutSessionDelegate

extension WorkoutRuntime: HKWorkoutSessionDelegate {
  func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState,
    date: Date
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self, workoutSession === self.session else { return }
      switch toState {
      case .ended:
        self.finalize()
      case .stopped:
        workoutSession.end()
      default:
        break
      }
    }
  }

  func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    DispatchQueue.main.async { [weak self] in
      guard let self, workoutSession === self.session else { return }
      // Degrade to inert: the workout itself lives on the authority, unaffected.
      self.builder?.discardWorkout()
      self.reset()
    }
  }
}
