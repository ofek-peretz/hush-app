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

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  var isReachable: Bool {
    WCSession.isSupported() ? WCSession.default.isReachable : false
  }

  /// Send a proposed intent to the phone. Reachable only, never queued.
  func send(intentJSON json: String) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.isReachable else { return }
    session.sendMessage(["intent": json], replyHandler: nil, errorHandler: nil)
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
    guard let json = payload["envelope"] as? String,
          let envelope = WatchWire.decodeEnvelope(json) else { return }
    DispatchQueue.main.async { [weak self] in self?.model?.apply(envelope) }
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
