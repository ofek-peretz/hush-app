import Combine
import Foundation
import HealthKit

// Live workout vitals for the rest screens (heart rate + active calories) — the
// watch's signature surface (hush-watch-v1-spec §3.4/§3.5; founder #7/#1). The
// watch is the ONLY place these are sensed; the phone shows an estimate when there's
// no watch. This owns NO workout state — it's a read-only HealthKit live-workout
// reader that publishes the latest values for display.
//
// Fully defensive: if HealthKit is unavailable, unauthorized, or anything fails,
// the published values simply stay nil and the rest screen hides the line. It never
// throws to the UI and never blocks anything.
final class WatchVitals: NSObject, ObservableObject {
  @Published private(set) var heartRateBpm: Int?
  @Published private(set) var activeKcal: Int?

  private let store = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  private var running = false

  private static let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate)
  private static let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)
  private static let bpmUnit = HKUnit.count().unitDivided(by: HKUnit.minute())

  /// Begin a live workout (idempotent). Safe to call repeatedly as the workout runs.
  func start() {
    guard HKHealthStore.isHealthDataAvailable(), !running else { return }
    guard let hr = WatchVitals.heartRateType, let energy = WatchVitals.energyType else { return }
    running = true
    let read: Set<HKObjectType> = [hr, energy]
    let share: Set<HKSampleType> = [HKObjectType.workoutType()]
    store.requestAuthorization(toShare: share, read: read) { [weak self] granted, _ in
      guard let self, granted else {
        self?.running = false
        return
      }
      DispatchQueue.main.async { self.begin() }
    }
  }

  private func begin() {
    let config = HKWorkoutConfiguration()
    config.activityType = .traditionalStrengthTraining
    config.locationType = .indoor
    do {
      let session = try HKWorkoutSession(healthStore: store, configuration: config)
      let builder = session.associatedWorkoutBuilder()
      builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
      builder.delegate = self
      self.session = session
      self.builder = builder
      let now = Date()
      session.startActivity(with: now)
      builder.beginCollection(withStart: now) { _, _ in }
    } catch {
      running = false
    }
  }

  /// End the live workout and clear the values (called when the workout completes).
  func stop() {
    guard running else { return }
    running = false
    let endingBuilder = builder
    session?.end()
    endingBuilder?.endCollection(withEnd: Date()) { _, _ in
      endingBuilder?.finishWorkout { _, _ in }
    }
    session = nil
    builder = nil
    DispatchQueue.main.async {
      self.heartRateBpm = nil
      self.activeKcal = nil
    }
  }
}

extension WatchVitals: HKLiveWorkoutBuilderDelegate {
  func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
    for type in collectedTypes {
      guard let quantityType = type as? HKQuantityType,
            let stats = workoutBuilder.statistics(for: quantityType) else { continue }
      switch quantityType.identifier {
      case HKQuantityTypeIdentifier.heartRate.rawValue:
        if let bpm = stats.mostRecentQuantity()?.doubleValue(for: WatchVitals.bpmUnit) {
          DispatchQueue.main.async { self.heartRateBpm = Int(bpm.rounded()) }
        }
      case HKQuantityTypeIdentifier.activeEnergyBurned.rawValue:
        if let kcal = stats.sumQuantity()?.doubleValue(for: HKUnit.kilocalorie()) {
          DispatchQueue.main.async { self.activeKcal = Int(kcal.rounded()) }
        }
      default:
        break
      }
    }
  }

  func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
