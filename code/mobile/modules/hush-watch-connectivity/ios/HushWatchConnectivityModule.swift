import ExpoModulesCore
import WatchConnectivity

// Phone-side WatchConnectivity transport (the native swap point behind
// `src/platform/watch/watchTransportNative.ts`).
//
// This is intentionally a DUMB PIPE: it carries the already-serialized session
// envelope to the watch and forwards raw watch intents back to JS. ALL authority,
// validation, de-dupe, freshness, and telemetry live in the JS `WatchSession`
// bridge (watchBridge.ts) — the phone is the sole source of truth. Keeping the
// native layer logic-free is what lets the bridge be fully unit-tested on any host.
//
// Wire shapes (see protocol.ts):
//  - phone → watch: applicationContext / message ["envelope": <json string>]
//    (applicationContext = coalesced last-write-wins, survives unreachable;
//     sendMessage = low-latency when reachable).
//  - watch → phone: message ["intent": <json string>] → emitted as `onIntent`.
public final class HushWatchConnectivityModule: Module {
  private var sessionDelegate: PhoneSessionDelegate?

  public func definition() -> ModuleDefinition {
    Name("HushWatchConnectivity")
    Events("onIntent", "onReachabilityChange")

    OnCreate {
      guard WCSession.isSupported() else { return }
      // WCSessionDelegate callbacks arrive on a background queue; hop to main before
      // emitting JS events so delivery order is stable and JS sees them on its thread.
      let delegate = PhoneSessionDelegate(
        onIntent: { [weak self] json in
          DispatchQueue.main.async { self?.sendEvent("onIntent", ["intent": json]) }
        },
        onReachability: { [weak self] reachable in
          DispatchQueue.main.async { self?.sendEvent("onReachabilityChange", ["reachable": reachable]) }
        }
      )
      self.sessionDelegate = delegate
      let session = WCSession.default
      session.delegate = delegate
      session.activate()
    }

    Function("isReachable") { () -> Bool in
      WCSession.isSupported() ? WCSession.default.isReachable : false
    }

    // Publish the latest envelope. Always update the coalesced application context
    // (survives the watch being asleep / unreachable); also push a live message when
    // the watch is reachable for low-latency updates.
    AsyncFunction("sendState") { (json: String) in
      guard WCSession.isSupported() else { return }
      let session = WCSession.default
      try? session.updateApplicationContext(["envelope": json])
      if session.isReachable {
        session.sendMessage(["envelope": json], replyHandler: nil, errorHandler: nil)
      }
    }
  }
}

/// WCSession delegate that forwards reachability + inbound intents via closures.
final class PhoneSessionDelegate: NSObject, WCSessionDelegate {
  private let onIntent: (String) -> Void
  private let onReachability: (Bool) -> Void

  init(onIntent: @escaping (String) -> Void, onReachability: @escaping (Bool) -> Void) {
    self.onIntent = onIntent
    self.onReachability = onReachability
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    onReachability(session.isReachable)
  }

  // iOS may deactivate the session when switching paired watches — reactivate.
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }

  func sessionReachabilityDidChange(_ session: WCSession) {
    onReachability(session.isReachable)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    if let intent = message["intent"] as? String { onIntent(intent) }
  }
}
