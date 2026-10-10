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

/// Any JSON, decoded by Swift's scanner — the phone's stand-in for the wrist's `WireEnvelope`, so
/// the pre-send self-check exercises the SAME decoder the wrist uses, over the whole document.
enum HushJSONValue: Decodable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([HushJSONValue])
  case object([String: HushJSONValue])

  init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() { self = .null; return }
    if let b = try? c.decode(Bool.self) { self = .bool(b); return }
    if let n = try? c.decode(Double.self) { self = .number(n); return }
    if let s = try? c.decode(String.self) { self = .string(s); return }
    if let a = try? c.decode([HushJSONValue].self) { self = .array(a); return }
    self = .object(try c.decode([String: HushJSONValue].self))
  }
}

public final class HushWatchConnectivityModule: Module {
  private var sessionDelegate: PhoneSessionDelegate?

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // ⛔ AN EVENT EMITTED BEFORE JS LISTENS IS AN EVENT DELIVERED TO NOBODY (watch audit 2026-08-23).
  //
  // WCSession activates in OnCreate — milliseconds into a cold launch — and iOS hands over any
  // QUEUED userInfo transfers the moment activation completes. React Native takes seconds to boot
  // and subscribe. `sendEvent` with no listener drops the payload, so everything in that window
  // died silently: a pain report she filed from aeroplane mode (one-shot — gone forever), a
  // finished standalone workout (healed only when the wrist's outbox re-sent it, hours later), a
  // live intent from a wrist tap that WOKE this app (the tap that launched us was the tap we
  // dropped).
  //
  // So inbound intents + records are BUFFERED here until JS says it is listening — the transport
  // calls `flushPending` once BOTH its channels are subscribed. Reachability is deliberately not
  // buffered: it is state, re-read at any time, and replaying a stale boolean helps nobody.
  //
  // The cap bounds a pathological queue; at-least-once records survive an overflow via the wrist's
  // outbox, and 128 is far beyond anything the OS actually batches at a launch.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  private var jsListening = false
  private var pending: [(event: String, body: [String: Any])] = []
  private let pendingCap = 128

  private func emitOrBuffer(_ event: String, _ body: [String: Any]) {
    if jsListening {
      sendEvent(event, body)
    } else if pending.count < pendingCap {
      pending.append((event, body))
    }
  }

  public func definition() -> ModuleDefinition {
    Name("HushWatchConnectivity")
    Events("onIntent", "onReachabilityChange", "onSessionRecord", "onSendError")

    OnCreate {
      guard WCSession.isSupported() else { return }
      // WCSessionDelegate callbacks arrive on a background queue; hop to main before
      // emitting JS events so delivery order is stable and JS sees them on its thread.
      let delegate = PhoneSessionDelegate(
        onIntent: { [weak self] json in
          DispatchQueue.main.async { self?.emitOrBuffer("onIntent", ["intent": json]) }
        },
        onReachability: { [weak self] reachable in
          DispatchQueue.main.async { self?.sendEvent("onReachabilityChange", ["reachable": reachable]) }
        },
        onSessionRecord: { [weak self] json in
          DispatchQueue.main.async { self?.emitOrBuffer("onSessionRecord", ["record": json]) }
        },
        // W3 — the reply a wrist's confirmed set stands on: "is anyone actually listening?"
        // JS truth, not delegate truth, so a background launch that never mounted React answers
        // false and the wrist shows the honest viewer instead of confirming a set to nobody.
        listening: { [weak self] in self?.jsListening ?? false }
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
      /*
       * ⛔ THE SWALLOW IS GONE (founder's wrist, build 59, 2026-08-26: "Open on iPhone" forever).
       *
       * This line was `try?`. `updateApplicationContext` THROWS for real, diagnosable reasons —
       * session not activated yet, watch not paired, payload over the WatchConnectivity budget —
       * and `try?` turned every one of them into a phone that believed it was publishing while
       * the wrist starved. The error now rejects the promise, the JS transport answers `false`,
       * and the bridge's existing `statePublishFailed` telemetry finally counts what the OS
       * refused instead of what JS attempted.
       */
      // The live channel's own refusals stopped being silent too (same day): `errorHandler: nil`
      // was the second swallow, and a workout mirrors over THIS channel many times a minute.
      /*
       * ⛔ THE PHONE CHECKS ITS OWN FRAME FIRST (founder 2026-09-08, second photograph of the wrist:
       * `wc:badframe:json:The given data was not valid`). The wrist and the phone parse JSON with
       * the same Foundation; if the wrist will refuse this string, so will the phone — HERE, where
       * the refusal can be sent to telemetry (`onSendError` → `statePublishFailed`) with the parser's
       * own account of the byte that broke it. A photograph stops being the only instrument.
       * The frame is still sent (the wrist's diagnosis names the same byte), with its length
       * beside it, so a string cut in transit is told apart from one that left the phone broken.
       */
      let byteCount = json.utf8.count
      var outgoing = json
      if let data = json.data(using: .utf8) {
        // Two parsers, because the wrist decodes with the second: `JSONSerialization` (Apple's
        // older parser) and Swift's own `JSONDecoder` scanner, which refuses some documents the
        // first accepts (founder 2026-09-08, fourth photograph: the wrist said yes, then no).
        // Whichever refuses, its OWN account — the underlying error, with its location — goes to
        // telemetry and to the Profile sheet's watch row.
        var refusal: String? = nil
        var parsed: Any? = nil
        do {
          parsed = try JSONSerialization.jsonObject(with: data)
        } catch {
          refusal = "invalid_json: " + ((error as NSError).userInfo[NSDebugDescriptionErrorKey] as? String ?? error.localizedDescription)
        }
        if refusal == nil {
          do {
            _ = try JSONDecoder().decode(HushJSONValue.self, from: data)
          } catch DecodingError.dataCorrupted(let ctx) {
            refusal = "invalid_json_decoder: " + (ctx.underlyingError.map { String(describing: $0) } ?? ctx.debugDescription)
            // The older parser read it: send ITS serialisation, which the scanner accepts — the
            // wrist gets a clean frame whatever the scanner disliked, and the reason is reported.
            if let obj = parsed, JSONSerialization.isValidJSONObject(obj),
               let clean = try? JSONSerialization.data(withJSONObject: obj),
               let text = String(data: clean, encoding: .utf8) {
              outgoing = text
            }
          } catch {
            refusal = "invalid_json_decoder: \(error)"
          }
        }
        if let why = refusal {
          let head = String(json.prefix(24)).replacingOccurrences(of: "\n", with: "⏎")
          DispatchQueue.main.async { [weak self] in
            self?.sendEvent("onSendError", ["reason": "\(why.prefix(220)) · len \(byteCount) · head \(head)"])
          }
        }
      }
      let frame: [String: Any] = ["envelope": outgoing, "len": outgoing.utf8.count]
      let live: () -> Void = { [weak self] in
        guard session.isReachable else { return }
        session.sendMessage(frame, replyHandler: nil, errorHandler: { err in
          DispatchQueue.main.async {
            self?.sendEvent("onSendError", ["reason": "sendMessage: \(err.localizedDescription)"])
          }
        })
      }
      do {
        try session.updateApplicationContext(frame)
      } catch {
        live()
        throw error
      }
      live()
    }

    // Durably acknowledge a reconciled watch-local session record. transferUserInfo
    // is OS-queued and survives both apps terminating — the ack ALWAYS eventually
    // reaches the watch, which then clears its outbox (at-least-once + idempotent
    // reconcile makes replays harmless). De-duped against in-flight acks.
    // JS has subscribed BOTH inbound channels — deliver everything that arrived while it booted.
    // Idempotent: the queue drains once and later calls find it empty. Main-queue, like every emit.
    Function("flushPending") { () in
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.jsListening = true
        let queued = self.pending
        self.pending = []
        for e in queued { self.sendEvent(e.event, e.body) }
      }
    }

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
  private let listening: () -> Bool

  init(
    onIntent: @escaping (String) -> Void,
    onReachability: @escaping (Bool) -> Void,
    onSessionRecord: @escaping (String) -> Void,
    listening: @escaping () -> Bool
  ) {
    self.onIntent = onIntent
    self.onReachability = onReachability
    self.onSessionRecord = onSessionRecord
    self.listening = listening
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

  /**
   * ⛔ W3 · THE REPLY A CONFIRMED SET STANDS ON (watch audit 2026-08-23).
   *
   * The wrist used to confirm a `complete_set` the moment `sendMessage` was ACCEPTED by the OS —
   * which proves the iPhone is in range, not that anyone heard. A jettisoned phone app is woken by
   * the very tap it then drops (see the buffering note above): the wrist played the confirm haptic
   * and the set was logged nowhere. Now the wrist sends its set completions WITH a replyHandler,
   * and this answers with the one fact that matters: whether React is up and subscribed. A
   * `listening: false` reply (or a delivery error) sends the wrist to its honest Reconnecting
   * viewer instead of a lie.
   *
   * The intent is STILL forwarded on a false reply — it is buffered above and judged by the TTL
   * once JS wakes, so a set that CAN legally land, does.
   */
  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    if let intent = message["intent"] as? String { onIntent(intent) }
    replyHandler(["listening": listening()])
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
