import CoreMotion
import ExpoModulesCore
import Foundation

// ════ THE LIVE INDOOR DISTANCE (founder, 2026-09-15: "עשה אותה") ════
//
// A treadmill run reads its distance from Health's `DistanceWalkingRunning`, and the iPhone flushes
// that type to Health in BATCHES minutes apart — so the first metres of every indoor run arrived
// minutes late and then all at once. Core Motion holds the same measurement live: `CMPedometer`
// answers "how far since this instant" from the motion coprocessor, which counts in hardware even
// while the app sleeps, so one query also heals any gap.
//
// One job, no opinions: `distanceSince(fromMs)` → metres, or nil when there is no answer (no
// pedometer, Motion & Fitness refused, a query error). nil is "not measured", never "did not move" —
// the tracker falls back to Health on it. The first query shows the Motion & Fitness prompt; the
// Info.plist carries `NSMotionUsageDescription`, without which that query would crash the app.

public class HushPedometerModule: Module {
  private let pedometer = CMPedometer()

  public func definition() -> ModuleDefinition {
    Name("HushPedometer")

    Function("isDistanceAvailable") { () -> Bool in
      return CMPedometer.isDistanceAvailable()
    }

    Function("authorizationStatus") { () -> String in
      switch CMPedometer.authorizationStatus() {
      case .authorized:
        return "granted"
      case .denied, .restricted:
        return "denied"
      case .notDetermined:
        return "unknown"
      @unknown default:
        return "unknown"
      }
    }

    AsyncFunction("distanceSince") { (fromMs: Double, promise: Promise) in
      guard CMPedometer.isDistanceAvailable() else {
        promise.resolve(nil)
        return
      }
      let status = CMPedometer.authorizationStatus()
      if status == .denied || status == .restricted {
        promise.resolve(nil)
        return
      }
      let from = Date(timeIntervalSince1970: fromMs / 1000)
      let to = Date()
      guard to > from else {
        promise.resolve(0.0)
        return
      }
      self.pedometer.queryPedometerData(from: from, to: to) { data, error in
        guard error == nil, let data = data else {
          promise.resolve(nil)
          return
        }
        guard let metres = data.distance?.doubleValue, metres.isFinite, metres >= 0 else {
          // Steps with no distance estimate is not a distance.
          promise.resolve(nil)
          return
        }
        promise.resolve(metres)
      }
    }
  }
}
