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
    let files = (try? FileManager.default.contentsOfDirectory(
      at: outboxDir, includingPropertiesForKeys: nil
    )) ?? []
    return files
      .filter { $0.pathExtension == "json" }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
      .compactMap { read(WireSessionRecord.self, from: $0) }
      .sorted { $0.endedAt < $1.endedAt }
  }
}
