import Foundation

// Durable watch-local persistence — the standalone storage layer.
//
// Three surfaces, all JSON files under Application Support (atomic writes, so a
// crash/termination mid-write never corrupts state):
//  - plan.json     — the latest phone-published plan snapshot (+ which of its
//                    workouts the watch completed locally), so a workout can be
//                    STARTED with the phone absent, days after the last sync.
//  - session.json  — the live local session state, rewritten on every transition,
//                    so an app termination/crash resumes mid-workout.
//  - outbox/*.json — completed session records awaiting the phone's durable ack
//                    (at-least-once delivery; the phone de-dupes on recordId).
//
// Everything degrades to inert on I/O failure — persistence must never take the
// workout down.
final class WatchStore {
  /// The stored plan + local completion marks (a workout finished on the watch is
  /// not offered again, even before the phone learns about it).
  struct StoredPlan: Codable {
    var plan: WirePlan
    var doneWorkoutIds: [String]
  }

  private let dir: URL
  private let outboxDir: URL

  init() {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? FileManager.default.temporaryDirectory
    dir = base.appendingPathComponent("HushStandalone", isDirectory: true)
    outboxDir = dir.appendingPathComponent("outbox", isDirectory: true)
    try? FileManager.default.createDirectory(at: outboxDir, withIntermediateDirectories: true)
  }

  // MARK: JSON file primitives (atomic)

  private func write<T: Encodable>(_ value: T, to url: URL) {
    guard let data = try? JSONEncoder().encode(value) else { return }
    try? data.write(to: url, options: .atomic)
  }

  private func read<T: Decodable>(_ type: T.Type, from url: URL) -> T? {
    guard let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(type, from: data)
  }

  // MARK: Plan snapshot

  private var planURL: URL { dir.appendingPathComponent("plan.json") }

  func loadPlan() -> StoredPlan? {
    guard let stored = read(StoredPlan.self, from: planURL) else { return nil }
    guard stored.plan.schema == WATCH_PLAN_SCHEMA_VERSION else { return nil }
    return stored
  }

  /// Adopt a phone-published snapshot. A NEW plan (different planId) resets the
  /// local done marks (the phone's snapshot already excludes workouts it knows are
  /// completed); republishes of the same plan keep them.
  func savePlan(_ plan: WirePlan) {
    guard plan.schema == WATCH_PLAN_SCHEMA_VERSION else { return }
    let existing = loadPlan()
    let done = existing?.plan.planId == plan.planId ? existing?.doneWorkoutIds ?? [] : []
    write(StoredPlan(plan: plan, doneWorkoutIds: done), to: planURL)
  }

  /// Mark a workout locally completed so the offline Start screen stops offering it.
  func markWorkoutDone(_ workoutId: String) {
    guard var stored = loadPlan() else { return }
    guard !stored.doneWorkoutIds.contains(workoutId) else { return }
    stored.doneWorkoutIds.append(workoutId)
    write(stored, to: planURL)
  }

  // MARK: The watch face (design pass 2026-09-09)
  //
  // What the complication draws — the Home screen's first fact, written into the App Group
  // container the widget extension can read. The extension has no wire and no copy runtime; the
  // strings arrive here already in her language. Mirror of `HushComplication.WristFaceSnapshot`.

  struct WristFaceSnapshot: Codable {
    var v: Int
    var workoutName: String
    var legend: String
    var weekCount: Int
    var weekDone: Int
    var queuedIndex: Int?
    var resting: Bool
    var rtl: Bool
    var updatedAt: Double
  }

  /// The face's own file lives in the App Group container, not under Application Support: the
  /// widget runs as its own process and can read nothing else of ours. Nil when the group is not
  /// provisioned — the face then keeps its launcher and nothing here fails.
  private var faceURL: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.hushfitness.app")?
      .appendingPathComponent("wrist-face.json")
  }

  func saveFaceSnapshot(_ face: WristFaceSnapshot) {
    guard let url = faceURL else { return }
    write(face, to: url)
  }

  // MARK: Her copy (the phone's resolved strings)
  //
  // Stored for the same reason the plan is: the standalone runtime exists so she can train with the
  // phone in a locker, and a wrist that reverted to English the moment it lost the phone would be
  // the founder's own bug report one step further out.

  private var copyURL: URL { dir.appendingPathComponent("copy.json") }

  func loadCopy() -> WireCopyPack? { read(WireCopyPack.self, from: copyURL) }

  func saveCopy(_ pack: WireCopyPack) {
    // An empty pack would blank every string on the wrist. Fallbacks are for a MISSING pack.
    guard !pack.s.isEmpty else { return }
    write(pack, to: copyURL)
  }

  // MARK: The workout the phone last offered
  //
  // Founder, device QA 2026-07-30: *"the watch's first screen forces a specific workout instead of
  // showing today."*
  //
  // With the phone present the wrist shows what Today shows — the lobby carries `workoutId`. With
  // the phone ABSENT the wrist rebuilt a lobby from the stored plan and offered `remaining[0]`: the
  // first workout of the week the watch had not seen finished. That is the plan's order, not hers,
  // and it disagreed with the phone she had been looking at ten minutes earlier.
  //
  // One string is enough to fix it, and it belongs on disk rather than in memory: the case that
  // matters is precisely the one where the app was relaunched away from the phone.

  private var queuedURL: URL { dir.appendingPathComponent("queued.json") }

  func loadQueuedWorkoutId() -> String? { read([String: String].self, from: queuedURL)?["id"] }

  func saveQueuedWorkoutId(_ id: String?) {
    guard let id, !id.isEmpty else { return }
    write(["id": id], to: queuedURL)
  }

  // MARK: Active local session (rewritten on every transition)

  private var sessionURL: URL { dir.appendingPathComponent("session.json") }

  func loadActiveSession() -> LocalSessionState? {
    read(LocalSessionState.self, from: sessionURL)
  }

  func saveActiveSession(_ state: LocalSessionState) {
    write(state, to: sessionURL)
  }

  func clearActiveSession() {
    try? FileManager.default.removeItem(at: sessionURL)
  }

  // MARK: Outbox (completed records awaiting the phone's durable ack)

  private func recordURL(_ recordId: String) -> URL {
    // recordId is a UUID we minted — safe as a filename component.
    outboxDir.appendingPathComponent("\(recordId).json")
  }

  func enqueueRecord(_ record: WireSessionRecord) {
    write(record, to: recordURL(record.recordId))
  }

  func removeRecord(_ recordId: String) {
    try? FileManager.default.removeItem(at: recordURL(recordId))
  }

  /// All records still awaiting an ack, oldest first (stable resend order).
  func outboxRecords() -> [WireSessionRecord] {
    outbox(WireSessionRecord.self).sorted { $0.endedAt < $1.endedAt }
  }

  // MARK: Cardio outbox (founder 2026-07-28)
  //
  // A run recorded on the wrist used to write its HKWorkout to Health and stop — so the kilometres
  // appeared in Apple Health and NOWHERE in Hush. It rides the SAME durable path as a strength
  // record (own file, at-least-once, cleared by the phone's ack) and a SEPARATE directory, because
  // the two decode to different shapes and a `compactMap` that silently drops the other kind would
  // be indistinguishable from an empty outbox.

  private var cardioDir: URL { dir.appendingPathComponent("cardio-outbox", isDirectory: true) }
  private func cardioURL(_ recordId: String) -> URL {
    try? FileManager.default.createDirectory(at: cardioDir, withIntermediateDirectories: true)
    return cardioDir.appendingPathComponent("\(recordId).json")
  }

  func enqueueCardioRecord(_ record: WireCardioRecord) {
    write(record, to: cardioURL(record.recordId))
  }

  func removeCardioRecord(_ recordId: String) {
    try? FileManager.default.removeItem(at: cardioURL(recordId))
  }

  /// Cardio records still awaiting an ack, oldest first.
  func outboxCardioRecords() -> [WireCardioRecord] {
    outbox(WireCardioRecord.self, in: cardioDir).sorted { $0.endedAt < $1.endedAt }
  }

  /// One reader for both outboxes — a decode failure drops that FILE, never the queue.
  private func outbox<T: Decodable>(_ type: T.Type, in folder: URL? = nil) -> [T] {
    let d = folder ?? outboxDir
    let files = (try? FileManager.default.contentsOfDirectory(
      at: d, includingPropertiesForKeys: nil
    )) ?? []
    return files
      .filter { $0.pathExtension == "json" }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
      .compactMap { read(type, from: $0) }
  }
}
