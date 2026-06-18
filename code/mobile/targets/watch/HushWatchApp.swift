import SwiftUI

// watchOS app entry. The watch is a TERMINAL companion to the iPhone: it renders the
// phone's read-only session mirror and proposes intents over WatchConnectivity. It
// has NO local workout database, NO model execution, and NO independent lifecycle —
// the phone is the sole source of truth (WATCH_EXPERIENCE_SPEC.md; audit ratified).
@main
struct HushWatchApp: App {
  @StateObject private var model = WatchModel()

  var body: some Scene {
    WindowGroup {
      WatchRootView(model: model)
        .onAppear { model.start() }
    }
  }
}
