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
//  - watch → phone: userInfo ["record": <json string>] — a DURABLE transfer of a
//    watch-local session record (the watch executed a workout with the phone
//    absent) → emitted as `onSessionRecord` for reconciliation.
//  - phone → watch: userInfo ["recordAck": <recordId>] — durable acknowledgment;
//    the watch clears the record from its outbox on receipt.
public final class HushWatchConnectivityModule: Module {
  private var sessionDelegate: PhoneSessionDelegate?

  public func definition() -> ModuleDefinition {
    Name("HushWatchConnectivity")
    Events("onIntent", "onReachabilityChange", "onSessionRecord")

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
        },
        onSessionRecord: { [weak self] json in
          DispatchQueue.main.async { self?.sendEvent("onSessionRecord", ["record": json]) }
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

    // IS THERE A WATCH ON THIS WRIST AT ALL?
    //
    // `isReachable` cannot answer that: it is false whenever the watch app is not in the
    // foreground, which is nearly always. `isPaired` / `isWatchAppInstalled` are the two
    // facts WCSession holds about the DEVICE, and they are iPhone-only members.
    //
    // `activated` is part of the answer, not an implementation detail. Both flags read
    // false until activation completes (it is asynchronous, started in OnCreate), so a
    // caller that could not tell "no watch" from "not asked yet" would tell an Apple Watch
    // owner they have no watch on the one boot it lost the race. JS treats
    // `activated: false` as UNKNOWN and simply asks again next time.
    Function("pairingState") { () -> [String: Any] in
      guard WCSession.isSupported() else {
        return ["activated": true, "paired": false, "appInstalled": false]
      }
      let session = WCSession.default
      let activated = session.activationState == .activated
      return [
        "activated": activated,
        "paired": activated && session.isPaired,
        "appInstalled": activated && session.isWatchAppInstalled,
      ]
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

    // Durably acknowledge a reconciled watch-local session record. transferUserInfo
    // is OS-queued and survives both apps terminating — the ack ALWAYS eventually
    // reaches the watch, which then clears its outbox (at-least-once + idempotent
    // reconcile makes replays harmless). De-duped against in-flight acks.
    Function("ackRecord") { (recordId: String) in
      guard WCSession.isSupported() else { return }
      let session = WCSession.default
      let inFlight = session.outstandingUserInfoTransfers.contains {
        ($0.userInfo["recordAck"] as? String) == recordId
      }
      if !inFlight {
        session.transferUserInfo(["recordAck": recordId])
      }
    }
  }
}

/// WCSession delegate that forwards reachability + inbound intents/records via closures.
final class PhoneSessionDelegate: NSObject, WCSessionDelegate {
  private let onIntent: (String) -> Void
  private let onReachability: (Bool) -> Void
  private let onSessionRecord: (String) -> Void

  init(
    onIntent: @escaping (String) -> Void,
    onReachability: @escaping (Bool) -> Void,
    onSessionRecord: @escaping (String) -> Void
  ) {
    self.onIntent = onIntent
    self.onReachability = onReachability
    self.onSessionRecord = onSessionRecord
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

  // Durable watch-local session records (the watch's outbox delivers these
  // at-least-once; the JS reconciler is idempotent and acks each one).
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    if let record = userInfo["record"] as? String { onSessionRecord(record) }
    /*
     * ⛔ AN INTENT CAN ARRIVE ON THE DURABLE CHANNEL TOO (2026-08-05).
     *
     * Intents normally ride `sendMessage`, which is reachable-only — correct for a `complete_set`,
     * which is a proposal against LIVE state and must never be replayed late. **A report of pain is
     * not live state.** It is true whether or not the phone was listening, and the founder found it
     * being dropped: every one of his watch screenshots has the aeroplane glyph, and the report
     * silently went nowhere.
     *
     * ⚠️ THIS LINE IS THE HALF THAT IS EASY TO FORGET. The wrist queuing it and the phone never
     * looking for it here is the WT14 shape exactly — a wrist intent that reaches the phone and
     * dies — and it would have failed identically: no crash, no log, nothing on the screen.
     * `everyWristIntentLandsSomewhere` is the law that exists because of it.
     */
    if let intent = userInfo["intent"] as? String { onIntent(intent) }
  }
}
