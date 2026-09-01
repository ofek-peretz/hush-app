import Foundation
import WatchConnectivity

// Watch-side WCSession transport. Receives the phone's session envelope (coalesced
// applicationContext + live messages) and sends the watch's proposed intents back.
//
// Authority model: this manager NEVER decides anything. It hands every decoded
// envelope to the WatchModel (which only advances on a higher authoritySeq) and
// sends intents the phone is free to reject. Intents are sent ONLY when reachable
// and are NEVER queued — a completion must not be replayed late after a reconnect
// (the phone owns the save-order invariant; offline, the phone completes on its own).
final class WatchSessionManager: NSObject, WCSessionDelegate {
  weak var model: WatchModel?

  /*
   * ════ THE WRIST'S OWN TESTIMONY (founder's build-59 silence, 2026-08-26) ════
   *
   * Every layer of this pipe could fail without a word: activation completes WITH AN ERROR that
   * the delegate used to ignore, or completes clean and no envelope ever arrives. From the
   * outside those are one symptom — the idle screen forever — and they took a day of guessing
   * apart. Three facts close that: the activation state, the error it completed with (if any),
   * and how many envelopes have actually been ingested. The idle screen prints them in one quiet
   * line, so the failing layer is named by a glance at the wrist itself.
   */
  private(set) var activationDiag: String = "wc:…"
  private(set) var framesIngested: Int = 0

  func activate() {
    guard WCSession.isSupported() else {
      activationDiag = "wc:unsupported"
      return
    }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  /// One quiet line for the idle screen: activation · frames seen (· error).
  var diagLine: String { "\(activationDiag) · rx:\(framesIngested)" }

  var isReachable: Bool {
    WCSession.isSupported() ? WCSession.default.isReachable : false
  }

  /**
   * ⛔ A REPORT OF PAIN IS A FACT, NOT A PROPOSAL — so it takes the DURABLE channel.
   *
   * FOUNDER, 2026-08-05: *"when you press injury mode on the watch it shows the area picker and the
   * pain level, which is fine — but when I press it nothing happens."*
   *
   * Nothing was broken in the screens. `WatchModel.reportPain` guarded on `manager.isReachable` and
   * returned false, and **every one of his watch screenshots has the aeroplane glyph in the corner**
   * — so the intent was never sent, the acknowledgement was correctly suppressed, and the flow
   * simply returned her to Paused as though she had pressed nothing.
   *
   * The reachable-only rule above is right for what it was written for: a `complete_set` is a
   * proposal against LIVE state and must never be replayed late after a reconnect. **A muscle that
   * hurts is not live state.** It is true whether or not the phone is listening, it is still true
   * ten minutes later, and it is the single most important thing this watch can say. It belongs on
   * the same at-least-once channel as a finished session record.
   *
   * ⚠️ Keyed by `intentId` so the in-flight check dedupes a double tap, exactly as records are.
   */
  func transferIntent(_ json: String, intentId: String) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    let inFlight = session.outstandingUserInfoTransfers.contains {
      ($0.userInfo["recordId"] as? String) == intentId
    }
    guard !inFlight else { return }
    session.transferUserInfo(["intent": json, "recordId": intentId])
  }

  /// Send a proposed intent to the phone. Reachable only, never queued.
  ///
  /// ⛔ IT REPORTS WHETHER IT LEFT. This returned Void and dropped in silence, and the caller went
  /// on to show a confirmation regardless — so a set completed with the phone in a locker played
  /// the confirm haptic, drew the tick, and was logged nowhere. Losing the set is bad; telling her
  /// it was saved is worse, because she has no reason to look again.
  ///
  /// `false` means "this did not leave the watch". It is NOT queued for later on purpose: an
  /// intent is a proposal about the set she is standing in, and one delivered twenty minutes late
  /// would be judged against a session that has moved on (or ended). The honest answer is to say
  /// so now — see `WatchModel.intentDidNotLeave()`.
  @discardableResult
  func send(intentJSON json: String) -> Bool {
    guard WCSession.isSupported() else { return false }
    let session = WCSession.default
    guard session.isReachable else { return false }
    session.sendMessage(["intent": json], replyHandler: nil, errorHandler: nil)
    return true
  }

  /**
   * ⛔ W3 · A SET IS CONFIRMED BY AN ANSWER, NOT BY AN ADDRESS (watch audit 2026-08-23).
   *
   * `send` returns true when the OS ACCEPTED the message — which proves the iPhone is in range,
   * not that the app heard. A jettisoned phone app is woken by the very tap that then dies in its
   * boot window, so the wrist played the confirm haptic for a set logged nowhere. This variant
   * asks for a reply: the phone answers `listening: true` only when its React layer is up and
   * subscribed, and the completion runs on the main queue with that verdict.
   *
   * ⚠️ THE SKEW FALLBACK IS LOAD-BEARING. A phone one build behind has no reply-handler delegate
   * method, and iOS then fails the delivery outright (`errorHandler`) — which would have turned
   * every wrist set completion against an older phone into a dead tap. On error, the intent is
   * re-sent once on the plain fire-and-forget channel and reported as delivered exactly as the old
   * code did: a skewed pair keeps yesterday's behaviour, never less.
   */
  func sendExpectingReply(intentJSON json: String, completion: @escaping (Bool) -> Void) {
    guard WCSession.isSupported() else { completion(false); return }
    let session = WCSession.default
    guard session.isReachable else { completion(false); return }
    session.sendMessage(
      ["intent": json],
      replyHandler: { reply in
        let heard = (reply["listening"] as? Bool) ?? true
        DispatchQueue.main.async { completion(heard) }
      },
      errorHandler: { _ in
        DispatchQueue.main.async {
          guard session.isReachable else { completion(false); return }
          session.sendMessage(["intent": json], replyHandler: nil, errorHandler: nil)
          completion(true) // the pre-reply contract: accepted by the OS, as it always was
        }
      }
    )
  }

  /// Transfer a watch-local session record to the phone — the DURABLE channel
  /// (transferUserInfo survives both apps terminating and delivers whenever the
  /// pair next syncs). Unlike intents, records MUST be queued: they are facts
  /// about a finished workout, not proposals against live state. At-least-once +
  /// a phone-side idempotent apply; skipped when the same record is already
  /// in flight.
  func transferRecord(_ record: WireSessionRecord) {
    guard let json = WatchWire.encodeRecord(record) else { return }
    transfer(json, recordId: record.recordId)
  }

  /// A run/walk the wrist recorded (founder 2026-07-28). The SAME durable channel and the same ack:
  /// the phone discriminates on the `type` inside the JSON, so cardio needed no second native
  /// event, no second outstanding-transfer check, and no second acknowledgement path.
  func transferCardioRecord(_ record: WireCardioRecord) {
    guard let json = WatchWire.encodeCardioRecord(record) else { return }
    transfer(json, recordId: record.recordId)
  }

  private func transfer(_ json: String, recordId: String) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    let inFlight = session.outstandingUserInfoTransfers.contains {
      ($0.userInfo["recordId"] as? String) == recordId
    }
    guard !inFlight else { return }
    session.transferUserInfo(["record": json, "recordId": recordId])
  }

  private func ingest(_ payload: [String: Any]) {
    /*
     * ⛔ TWO DIFFERENT FAILURES WORE ONE NAME (founder 2026-08-30, photographing `wc:badframe · rx:0`).
     *
     * A payload with no `envelope` string at all and a payload whose JSON will not decode are not
     * the same event — the first says the phone (or a stale stored context) sent us something that
     * is not ours, the second says the two declarations of one shape have drifted. They are
     * diagnosed in opposite directions and they were reported identically.
     *
     * ⚠️ AND THE REASON WAS ONE CHARACTER AWAY THE WHOLE TIME: `decodeEnvelope` is `try?`, so
     * `JSONDecoder`'s account of exactly which field died was being discarded at the point of
     * failure. This is a device that cannot be attached to a debugger, in a pair of processes no
     * developer machine can reproduce, and one bad leaf takes the mirror, the lobby, the plan and
     * the copy pack with it. A photograph of the wrist is the only instrument there is.
     */
    guard let json = payload["envelope"] as? String else {
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        // Not our frame at all: no `envelope` key, or it is not a string. The keys we DID get are
        // the answer — a stale context from an older build looks completely different here.
        self.activationDiag = "wc:nokey:" + payload.keys.sorted().prefix(2).joined(separator: ",")
        self.model?.diagChanged()
      }
      return
    }
    guard let envelope = WatchWire.decodeEnvelope(json) else {
      let why = WatchWire.decodeFailureReason(json)
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.activationDiag = "wc:badframe:" + why
        self.model?.diagChanged()
      }
      return
    }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.framesIngested += 1
      /*
       * ⚠️ AND A GOOD FRAME CLEARS THE COMPLAINT. `activationDiag` was set on failure and never
       * reset, so one bad frame — a single stale context adopted at activation — pinned "badframe"
       * on the screen for the rest of the app's life, over a pipe that had since started working.
       * A diagnosis that cannot go back to healthy is a diagnosis nobody can act on.
       */
      if self.activationDiag.hasPrefix("wc:badframe") || self.activationDiag.hasPrefix("wc:nokey") {
        self.activationDiag = "wc:on"
      }
      self.model?.diagChanged()
      self.model?.apply(envelope)
    }
  }

  private func pushReachability() {
    let reachable = isReachable
    DispatchQueue.main.async { [weak self] in self?.model?.setReachable(reachable) }
  }

  // MARK: WCSessionDelegate

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    // The error was IGNORED here since the file was written — an activation that completes broken
    // looked identical to one that completed clean (build-59 silence). Named now, on the wrist.
    let state: String
    switch activationState {
    case .activated: state = "on"
    case .inactive: state = "inactive"
    case .notActivated: state = "off"
    @unknown default: state = "unknown"
    }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.activationDiag = error == nil ? "wc:\(state)" : "wc:\(state)!\((error! as NSError).code)"
      self.model?.diagChanged()
    }
    // Adopt any context that arrived while inactive, then publish reachability.
    if !session.receivedApplicationContext.isEmpty { ingest(session.receivedApplicationContext) }
    pushReachability()
  }

  func sessionReachabilityDidChange(_ session: WCSession) { pushReachability() }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    ingest(message)
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    ingest(applicationContext)
  }

  // The phone's durable acknowledgment of a reconciled session record — clear it
  // from the outbox (the reconciliation loop is closed).
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    guard let ack = userInfo["recordAck"] as? String else { return }
    DispatchQueue.main.async { [weak self] in self?.model?.recordAcked(ack) }
  }
}
