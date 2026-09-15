import SwiftUI

// watchOS app entry. Two authorities, one UI:
//  - Phone present: the watch renders the phone's read-only mirror and proposes
//    intents over WatchConnectivity (the phone validates everything).
//  - Phone absent: the watch IS the authority — LocalWorkoutEngine executes the
//    phone-prescribed plan snapshot, persists every transition (WatchStore), and
//    the finished workout reconciles back to the phone durably (outbox → ack).
// The phone still owns the MODEL (targets, program, progression) in both modes;
// the watch never computes a prescription. WorkoutRuntime holds the OS-level
// HKWorkoutSession during live phases under either authority (background
// execution + HealthKit persistence).
@main
struct HushWatchApp: App {
  @StateObject private var model = WatchModel()
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      WatchRootView(model: model)
        .onAppear { model.start() }
    }
    // Returning to the foreground (raise-to-wake / reopened) during a live session gets a gentle
    // "you're back in the workout" cue (item 6).
    .onChange(of: scenePhase) { phase in
      if phase == .active { model.appBecameActive() }
    }
  }
}
