import SwiftUI
import WatchKit

// ════ THE WRIST'S GALLERY — the real screens, fed the phone's own frames ════
//
// Compiled together with `targets/watch/*.swift` (minus `HushWatchApp.swift`, whose place this
// takes) into a watchOS-simulator app by `render.sh`. One launch draws one frame: the name arrives
// in `HUSH_FRAME`, its envelope goes through the wrist's real decoder and `WatchModel.apply`, and
// `WatchRootView` — the product's own root — draws whatever that produces. Nothing here lays out a
// screen; if a frame looks wrong, the product looks wrong.
//
// `model.start()` is deliberately never called: it would open WatchConnectivity and ask HealthKit
// for authorization, and a gallery has neither a phone nor a body.

@main
struct GalleryApp: App {
  @StateObject private var model = WatchModel()
  var body: some Scene {
    WindowGroup {
      GalleryRoot(model: model)
    }
  }
}

struct GalleryRoot: View {
  @ObservedObject var model: WatchModel
  @State private var fed = false
  @State private var fault: String?
  private let frame = ProcessInfo.processInfo.environment["HUSH_FRAME"] ?? "02-set-first"

  var body: some View {
    ZStack {
      WatchRootView(model: model)
      if let fault {
        // A frame the wrist refused is shown as its reason, so the photograph is the diagnosis.
        Text(fault).font(.system(size: 11)).foregroundStyle(.red).padding(6).background(Color.black)
      }
    }
    .onAppear {
      guard !fed else { return }
      fed = true
      feed()
    }
  }

  private func feed() {
    guard let template = GALLERY_FRAMES[frame] else {
      fault = "no frame: \(frame)"
      return
    }
    let now = Date()
    let json = template
      .replacingOccurrences(of: "@REST_END@", with: WatchWire.iso(now.addingTimeInterval(74)))
      .replacingOccurrences(of: "@HOLD_END@", with: WatchWire.iso(now.addingTimeInterval(33)))
    guard let envelope = WatchWire.decodeEnvelope(json) else {
      fault = "decode: " + WatchWire.decodeFailureReason(json, sentLen: nil)
      return
    }
    model.apply(envelope)
  }
}
