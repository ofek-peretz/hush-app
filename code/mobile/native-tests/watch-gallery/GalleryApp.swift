import SwiftUI
import WatchKit

// ════ THE WRIST'S GALLERY — the real screens, fed the phone's own frames ════
//
// Compiled together with `targets/watch/*.swift` (minus `HushWatchApp.swift`, whose place this
// takes) into a watchOS-simulator app by `render.sh`. One launch draws one shot: the frame's name
// arrives in `HUSH_FRAME`, its envelope goes through the wrist's real decoder and
// `WatchModel.apply`, and `WatchRootView` — the product's own root — draws whatever that produces.
// Nothing here lays out a screen; if a shot looks wrong, the product looks wrong.
//
// Two things a photograph cannot do are done for it:
//   · `HUSH_OPEN` opens the live set's editor (the one `#if GALLERY` seam in the product's source);
//   · `HUSH_DIRECT` draws a screen the model only reaches through a tap or a lost connection —
//     under the same root treatment `WatchRootView` gives every screen.
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
  @State private var mirror: WireMirror?
  private let frame = ProcessInfo.processInfo.environment["HUSH_FRAME"] ?? "02-set-first"
  private let direct = ProcessInfo.processInfo.environment["HUSH_DIRECT"] ?? "-"

  init(model: WatchModel) {
    _model = ObservedObject(wrappedValue: model)
    // `00-idle` is the face that waits for the phone: NO frame is applied, so the model stays where
    // a fresh install leaves it. Only her language is adopted — and before the first render, since
    // the copy store is not something a view observes.
    if ProcessInfo.processInfo.environment["HUSH_FRAME"] == GalleryRoot.idle,
       let home = GALLERY_FRAMES["01-home"], let envelope = WatchWire.decodeEnvelope(home) {
      WatchCopyStore.adopt(envelope.copy)
    }
  }
  private static let idle = "00-idle"

  var body: some View {
    ZStack {
      if direct == "-" {
        WatchRootView(model: model)
      } else if fed {
        Group {
          switch direct {
          case "liftdone":
            LiftDoneScreen(name: mirror?.exerciseName ?? "", lift: (done: 3, count: 6), onTap: {})
          case "reconnecting":
            ConnectionLostScreen(mirror: mirror)
          default:
            Text("no direct: \(direct)")
          }
        }
        // The root's own treatment (see `WatchRootView.body`).
        .wholeGlass()
        .background(Palette.stage0.ignoresSafeArea())
        .environment(\.layoutDirection, WatchCopyStore.isRTL ? .rightToLeft : .leftToRight)
      }
      if let fault {
        // A frame the wrist refused is shown as its reason, so the photograph is the diagnosis.
        Text(fault).font(.system(size: 11)).foregroundStyle(.red).padding(6).background(Color.black)
      }
    }
    .onAppear {
      guard !fed else { return }
      feed()
      fed = true
    }
  }

  private func feed() {
    guard frame != GalleryRoot.idle else { return }
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
    mirror = envelope.mirror
    if direct == "-" {
      model.apply(envelope)
    } else {
      // A direct screen never passes through `apply`; it still speaks her language.
      WatchCopyStore.adopt(envelope.copy)
    }
  }
}
