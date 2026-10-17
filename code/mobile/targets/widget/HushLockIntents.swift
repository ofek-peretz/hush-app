import ActivityKit
import AppIntents
import Foundation
import UserNotifications

// ════ THE LOCK SCREEN IS A CONTROL (founder, 2026-09-08) ════
//
//   > *"לעשות אפשרות של שליטה מבלי לפתוח את הפלאפון אלא כאשר הוא סגור שיופיע מה שצריך על המסך
//   > הסגור. כך שאפשר להזין סט כשהמסך סגור וגם מנוחה של קיצור או הוספת 15 שניות. כי כרגע חובה
//   > בכל פעם לפתוח את המסך."*
//
// Three verbs, and only three — the ones a thumb has on the stage: log the set as written, add
// fifteen seconds to the rest, start the next set now. Each is a `LiveActivityIntent`, which iOS
// performs IN THE APP'S PROCESS (launching it in the background if it has to), and each does two
// things, in this order:
//
//   1. WRITES THE TAP DOWN, durably, in the App Group queue (`HushLockIntentBus`) with the instant
//      it happened — so the phone's session store, whose JS may be asleep, can replay it at that
//      instant when it wakes (`sessionStore.applyLockIntents`). The queue is the truth; the app
//      is told immediately over a Darwin notification when it is alive to listen.
//   2. PROJECTS THE TAP ONTO THE LIVE ACTIVITY LOCALLY (`HushLockProjection`), so the lock screen
//      answers in the same second: a logged set becomes its rest with the countdown running, +15
//      moves the end, "next" shows the set. The phone corrects this projection from the truth the
//      moment it republishes. The rest-over notification is rescheduled here too, under the same
//      identifier the phone uses (`hush.rest_done`), wearing the next set's figures the phone baked
//      into the state — so a rest started from the lock screen still lights it when it ends.
//
// THIS FILE IS COMPILED INTO BOTH TARGETS: the widget extension (so `Button(intent:)` can name the
// intents) and the main app, where `plugins/withLockIntents.js` adds it — Apple's own recipe for
// a Live Activity intent. It therefore depends on nothing but the frameworks and the attributes
// type, which both targets already declare identically.

/// The three verbs, on the wire the phone reads (`platform/liveActivity.LockIntent.type`).
enum HushLockIntentKind: String {
  case completeSet = "complete_set"
  case addRest = "add_rest"
  case endRest = "end_rest"
  /// "מוכן" — the voice's loading dialogue answered by a thumb (spec §3.2): the set starts at the tap.
  case setReady = "set_ready"
}

/// The durable queue in the App Group, and the whistle that says it changed.
enum HushLockIntentBus {
  static let suite = "group.com.hushfitness.app"
  /// The queue as it was until 2026-10-17: one array. The phone still drains it; nothing writes it.
  static let key = "hush.lockIntents"
  /// ⛔ ONE KEY PER TAP (2026-10-17). The array was read, appended to and written back here while the
  /// phone's drain read, filtered and wrote it back on another thread — so a tap written between the
  /// drain's read and its write was erased by that write. A key of its own is written once, by the tap,
  /// and removed once, by the drain; there is no read-modify-write left for two threads to interleave.
  static let entryPrefix = "hush.lockIntent."
  static let darwinName = "com.hushfitness.app.lockIntent"
  static let restDoneId = "hush.rest_done"
  static let restWarnId = "hush.rest_warn"

  /// `figures` — her load and reps from the steppers, riding only on a logged set
  /// (`platform/liveActivity.LockIntent.weight/reps`); bodyweight leaves the `weight` key out.
  ///
  /// ⛔ WRITTEN DOWN AT THE TAP (2026-10-17, founder: *"הם מגיבים בדילאיי ולא בזמן אמת"*). Called in the
  /// first moment of `perform`, before anything is drawn or waited on, and stamped with the instant the
  /// tap began — so the phone replays the set, the rest and the next set at HER moment, whatever the card
  /// or the phone was doing.
  static func record(_ kind: HushLockIntentKind, atMs: Double, figures: HushLockPending.Figures? = nil) {
    let id = UUID().uuidString
    var entry: [String: Any] = [
      "id": id,
      "type": kind.rawValue,
      "atMs": atMs,
    ]
    if let f = figures {
      entry["reps"] = f.reps
      // A property list has no null: bodyweight is the KEY'S ABSENCE (`NSNull` would throw inside
      // `UserDefaults.set` and take the app process — where this intent runs — down with it).
      if let w = f.weight { entry["weight"] = w }
    }
    UserDefaults(suiteName: suite)?.set(entry, forKey: entryPrefix + id)
  }

  /// Tell the phone's JS, when it is alive to listen, that the queue holds a tap.
  static func whistle() {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(darwinName as CFString),
      nil, nil, true
    )
  }
}

/// ════ ONE TAP AT A TIME (2026-10-17) ════
///
/// A tap has two halves, and they are kept apart on purpose:
///
///   · its DECISION — what it reads and writes in the App Group (the queue entry, her parked figures)
///     — is made the instant the tap begins, under one lock, in tap order (`decide`). Nothing it does
///     waits on ActivityKit, so no tap is ever written down late, or lost to a process that died while
///     it waited, and "+ + + +" counts four;
///   · its DRAW — the card redrawn — runs in one lane, each draw after the one before it (`draw`), so
///     a slow draw is never overtaken by a later one and the card always ends on the last tap.
final class HushLockSerial: @unchecked Sendable {
  static let shared = HushLockSerial()
  private let lock = NSLock()
  private var tail: Task<Void, Never>?
  /// "Done"s decided and not yet drawn on the card — while one is on its way, the set it leaves is
  /// still on the card, and a stepper or a second "Done" aimed at that set is refused.
  private var leavingTheSet = 0

  /// ⚠️ A STALLED DRAW MAY NOT HOLD THE NEXT TAP HOSTAGE. ActivityKit has been reported to stall
  /// updates from a process playing audio — and this one plays the silent keep-alive. A draw waits at
  /// most this long for the one before it, and a tap waits at most `drawCapS` for its own.
  static let waitForPreviousS: Double = 2
  static let drawCapS: Double = 3

  /// The tap's decision, made at once and in tap order — and, in the SAME critical section, its draw
  /// put in the lane, so the card is drawn in exactly the order the taps were decided. `body` reads and
  /// writes the App Group and returns the redraw, or nil when the tap is refused (nothing is drawn).
  func decide(_ body: (inout Int) -> (@Sendable () async -> Void)?) -> Task<Void, Never>? {
    lock.lock()
    defer { lock.unlock() }
    guard let draw = body(&leavingTheSet) else { return nil }
    let previous = tail
    let mine = Task {
      if let previous { await HushLockSerial.waitAtMost(previous, seconds: HushLockSerial.waitForPreviousS) }
      await draw()
    }
    tail = mine
    return mine
  }

  /// A "Done" reached the card — or gave up waiting for it (`HushLockTapRun.tap`).
  func landed() {
    lock.lock()
    defer { lock.unlock() }
    leavingTheSet = max(0, leavingTheSet - 1)
  }

  /// Returns when `task` finishes (true) or `seconds` pass (false), whichever is first. A task-group
  /// race would not do: a group waits for every child, and a child awaiting a stuck task never ends.
  @discardableResult
  static func waitAtMost(_ task: Task<Void, Never>, seconds: Double) async -> Bool {
    await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
      let once = HushLockOnce()
      Task {
        await task.value
        once.run { done.resume(returning: true) }
      }
      Task {
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
        once.run { done.resume(returning: false) }
      }
    }
  }
}

/// What a tap's draw came to — written inside the lane, read once the tap stops waiting for it.
final class HushLockDrawn: @unchecked Sendable {
  private let lock = NSLock()
  private var drawn = false
  private var atMs: Double?

  func set(_ value: Bool) {
    lock.lock()
    defer { lock.unlock() }
    drawn = value
    atMs = Date().timeIntervalSince1970 * 1000
  }

  func get() -> (drawn: Bool, atMs: Double?) {
    lock.lock()
    defer { lock.unlock() }
    return (drawn, atMs)
  }
}

/// Runs its closure the first time only — a continuation may be resumed exactly once.
final class HushLockOnce: @unchecked Sendable {
  private let lock = NSLock()
  private var done = false

  func run(_ body: () -> Void) {
    lock.lock()
    defer { lock.unlock() }
    guard !done else { return }
    done = true
    body()
  }
}

/// ════ HOW LONG A TAP TOOK TO SHOW (2026-10-17) ════
///
///   > *"כאשר אני לוחץ על הפקדים של האפליקציה בLIVE ACTIVITY הם מגיבים בדילאיי ולא בזמן אמת."*
///
/// Before this, nothing measured the lock screen's half of a tap: the phone knew when it REPLAYED a
/// tap (`lock_intent.lateS`), never when the card answered it, nor whether iOS had to launch the app
/// first. Each tap now leaves one row — when our code began, when the card's redraw returned, how old
/// the process was (seconds old = iOS launched the app for this very tap), and whether the card was
/// drawn or stood down for a truth the phone had already published. The phone drains the rows into
/// its lock-tap journal (`platform/lockTapJournal`). The newest 40 are kept.
enum HushLockTimings {
  /// One key per row (`HushLockIntentBus.entryPrefix` says why): `hush.lockTimings.<id>`.
  static let prefix = "hush.lockTimings."
  static let cap = 40
  /// Seconds since this process started, from the kernel — or −1 when it would not say.
  static func processAgeS() -> Double {
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
    guard sysctl(&mib, u_int(mib.count), &info, &size, nil, 0) == 0 else { return -1 }
    let start = info.kp_proc.p_un.__p_starttime
    let startedS = Double(start.tv_sec) + Double(start.tv_usec) / 1_000_000
    guard startedS > 0 else { return -1 }
    return max(0, Date().timeIntervalSince1970 - startedS)
  }

  /// Written after the tap stops waiting — never inside the lane, where reading the App Group to trim
  /// the rows would delay the next tap's draw. `drawnMs` is when the draw returned (or now, if it never did).
  static func note(_ kind: String, atMs: Double, drawnMs: Double, ageS: Double, drawn: Bool) {
    guard let store = UserDefaults(suiteName: HushLockIntentBus.suite) else { return }
    let id = UUID().uuidString
    store.set([
      "id": id,
      "k": kind,
      "atMs": atMs,
      "drawnMs": drawnMs,
      "ageS": ageS,
      "drawn": drawn,
    ] as [String: Any], forKey: prefix + id)
    // Bounded: a phone that never drains (the sync test off, the app never woken) keeps the newest few.
    let rows = store.dictionaryRepresentation().filter { $0.key.hasPrefix(prefix) }
    if rows.count > cap {
      let oldest = rows
        .sorted { (($0.value as? [String: Any])?["atMs"] as? Double ?? 0) < (($1.value as? [String: Any])?["atMs"] as? Double ?? 0) }
        .prefix(rows.count - cap)
      for row in oldest { store.removeObject(forKey: row.key) }
    }
  }
}

/// ════ HER FIGURES, TYPED ON THE LOCK SCREEN (founder 2026-09-08, mid-workout) ════
///
///   > *"אפשרות להזין ישירות מהלייב אקטיביטי את המשקל והחזרות."*
///
/// A Live Activity has no text field, so the card carries two steppers. Each turn is parked
/// HERE, in the App Group, keyed by the set it was typed for (`liftIndex/setIndex`), and drawn on
/// the card at once (`HushLockProjection.adjust`). "Done" then sends the parked figures with the
/// tap and clears them. The phone's module reads the same key when it republishes the state, so
/// her numbers survive a tick — and it drops them the moment the card moves to any other set.
enum HushLockPending {
  static let key = "hush.lockPending"
  struct Figures { let key: String; let weight: Double?; let reps: Int }

  static func key(liftIndex: Int, setIndex: Int) -> String { "\(liftIndex)/\(setIndex)" }

  static func read() -> Figures? {
    guard let store = UserDefaults(suiteName: HushLockIntentBus.suite),
          let d = store.dictionary(forKey: key),
          let k = d["key"] as? String,
          let reps = d["reps"] as? Int else { return nil }
    return Figures(key: k, weight: d["weight"] as? Double, reps: reps)
  }

  /// Stamped with the instant it was typed (`atMs`): the phone's module keeps a FRESH parked figure
  /// through a republish of some other card (`HushLiveActivityModule.strengthState`), and drops a
  /// stale one.
  static func write(_ f: Figures) {
    var d: [String: Any] = ["key": f.key, "reps": f.reps, "atMs": Date().timeIntervalSince1970 * 1000]
    if let w = f.weight { d["weight"] = w }
    UserDefaults(suiteName: HushLockIntentBus.suite)?.set(d, forKey: key)
  }

  static func clear() {
    UserDefaults(suiteName: HushLockIntentBus.suite)?.removeObject(forKey: key)
  }
}

/// What the lock screen shows in the second after a tap, before the phone has spoken.
@available(iOS 16.2, *)
enum HushLockProjection {
  private static func activity() -> Activity<HushSessionAttributes>? {
    Activity<HushSessionAttributes>.activities.first
  }

  /// The figures parked for the set on the card, if any — what "Done" sends along with the tap.
  static func pendingForCurrentSet() -> HushLockPending.Figures? {
    guard let a = activity() else { return nil }
    let s = a.content.state
    guard s.phase == "set", let p = HushLockPending.read(),
          p.key == HushLockPending.key(liftIndex: s.liftIndex, setIndex: s.setIndex) else { return nil }
    return p
  }

  /// One turn of a stepper: the load by this lift's detent, the reps by one, parked in the App Group
  /// for the set on the card. Only on a set — a rest has nothing to type. A DECISION: synchronous, run
  /// under the lane's lock (`HushLockSerial.decide`); the card is redrawn by `drawFigures`.
  ///
  /// ⛔ COUNTED FROM HER LAST TURN, NOT FROM THE CARD (2026-10-17). This read the figure off the
  /// card, and the card is only what ActivityKit has finished drawing: a second "+" that arrived
  /// while the first was still being drawn read the same old number, and two taps added one step.
  /// She pressed again, and that is the lag she felt. The parked figures are written the instant a
  /// turn is counted, so they are the true running total.
  static func count(field: String, delta: Int) -> Bool {
    guard let a = activity() else { return false }
    var s = a.content.state
    guard s.phase == "set" else { return false }
    let key = HushLockPending.key(liftIndex: s.liftIndex, setIndex: s.setIndex)
    if let p = HushLockPending.read(), p.key == key {
      s.targetWeight = p.weight
      s.targetReps = p.reps
    }
    if field == "reps" {
      s.targetReps = max(1, min(100, s.targetReps + delta))
    } else if let w = s.targetWeight {
      let step = s.weightStep > 0 ? s.weightStep : 0.5
      // Rounded to the detent, so 40 − 2.5 + 2.5 is 40 again and never 39.999.
      s.targetWeight = max(0, (w + Double(delta) * step) / step).rounded() * step
    } else {
      return false // bodyweight has no load to turn
    }
    HushLockPending.write(.init(key: key, weight: s.targetWeight, reps: s.targetReps))
    return true
  }

  /// The card redrawn with her figures as they stand NOW — the latest count, whichever turn's draw
  /// this is, so draws that land in any order still end on her last turn.
  @discardableResult
  static func drawFigures() async -> Bool {
    guard let a = activity() else { return false }
    var s = a.content.state
    guard s.phase == "set", let p = HushLockPending.read(),
          p.key == HushLockPending.key(liftIndex: s.liftIndex, setIndex: s.setIndex) else { return false }
    s.targetWeight = p.weight
    s.targetReps = p.reps
    return await apply(s, to: a, unless: "set")
  }

  /// A set logged as written — or with her figures, when the steppers moved: its rest starts now,
  /// wearing the next set's label; the last set of the session has no rest to start and says so.
  ///
  /// `at` is the tap's own instant: the rest is anchored to it, as the phone anchors its replay.
  /// Her parked figures were sent and cleared by the tap's decision (`HushCompleteSetIntent`).
  @discardableResult
  static func completeSet(at: Date) async -> Bool {
    guard let a = activity() else { return false }
    var s = a.content.state
    guard s.phase == "set" else { return false } // a second tap on the same set is not a second set
    if s.lastSetOfSession {
      s.phase = "logged"
      s.isResting = false
      s.restEndDate = nil
      s.restTotalS = nil
      cancelRestAlerts()
    } else if s.restAfterS <= 0 {
      // No rest after this set (the first half of a superset, §1.14): the next set is on the card
      // at once — never "logged", which is the session's end and has no buttons.
      s.phase = "set"
      s.isResting = false
      s.restEndDate = nil
      s.restTotalS = nil
      s.setLabel = s.nextSetLabel
      s.setIndex = s.nextSetIndex
      s.setCount = s.nextSetCount
      s.awaitingReady = false
    } else {
      let end = at.addingTimeInterval(s.restAfterS)
      s.phase = "rest"
      s.isResting = true
      s.restEndDate = end
      s.restTotalS = s.restAfterS
      s.setLabel = s.nextSetLabel
      s.setIndex = s.nextSetIndex
      s.setCount = s.nextSetCount
      scheduleRestDone(at: end, title: s.alertTitle, body: s.alertBody)
    }
    return await apply(s, to: a, unless: "set")
  }

  /// The phone may have republished the truth between the read above and this write (the whistle
  /// went out first, and JS may be awake): a projection is a guess, and it never overwrites a fact
  /// that arrived meanwhile — if the phase already left `stillPhase`, the phone spoke, and this stands down.
  private static func apply(_ s: HushSessionAttributes.ContentState, to a: Activity<HushSessionAttributes>, unless stillPhase: String) async -> Bool {
    await apply(s, to: a) { $0.phase == stillPhase }
  }
  private static func apply(_ s: HushSessionAttributes.ContentState, to a: Activity<HushSessionAttributes>, while still: (HushSessionAttributes.ContentState) -> Bool) async -> Bool {
    guard still(a.content.state) else { return false }
    await a.update(ActivityContent(state: s, staleDate: nil))
    return true
  }

  /// Fifteen more seconds on the running rest — the end moves, and so does the alert.
  ///
  /// ⛔ THE BAR'S LENGTH STAYS THE PRESCRIBED REST (2026-10-17). This grew `restTotalS` by the 15
  /// seconds, and the phone — by the founder's own ruling of 2026-07-13 (`sessionMirror`: "+15 …
  /// rise from where it is") — never does: it moves the END and keeps the yardstick. So the card drew
  /// one bar and the phone's republish a moment later drew another, and the line jumped after every
  /// +15. Now the card draws exactly what the phone will: the end moves, the line rises by 15 s.
  @discardableResult
  static func addRest(_ seconds: Double = 15) async -> Bool {
    guard let a = activity() else { return false }
    var s = a.content.state
    guard s.isResting, let end = s.restEndDate else { return false }
    let newEnd = max(end, Date()).addingTimeInterval(seconds)
    s.restEndDate = newEnd
    scheduleRestDone(at: newEnd, title: s.alertTitle, body: s.alertBody)
    return await apply(s, to: a) { $0.isResting }
  }

  /// "מוכן" from the card: the set is under way — the Ready button goes, Done stays. The phone
  /// moves the clock's stamp to the tap when it replays the queue.
  @discardableResult
  static func setReady() async -> Bool {
    guard let a = activity() else { return false }
    var s = a.content.state
    guard s.phase == "set", s.awaitingReady else { return false }
    s.awaitingReady = false
    return await apply(s, to: a) { $0.phase == "set" && $0.awaitingReady }
  }

  /// The rest is over when she says so: the next set is on the card, the alert stands down.
  @discardableResult
  static func endRest() async -> Bool {
    guard let a = activity() else { return false }
    var s = a.content.state
    guard s.isResting else { return false }
    if s.phase == "transition", let name = s.nextExerciseName {
      s.exerciseName = name
      s.targetWeight = s.nextTargetWeight
      s.targetReps = s.nextTargetReps ?? s.targetReps
    }
    s.phase = "set"
    s.isResting = false
    s.restEndDate = nil
    s.restTotalS = nil
    s.nextExerciseName = nil
    s.nextTargetWeight = nil
    s.nextTargetReps = nil
    cancelRestAlerts()
    return await apply(s, to: a) { $0.isResting }
  }

  // The same two identifiers `platform/restHaptics` schedules under, so a phone re-arm coalesces
  // with these rather than stacking beside them.
  private static func scheduleRestDone(at end: Date, title: String, body: String) {
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: [HushLockIntentBus.restDoneId, HushLockIntentBus.restWarnId])
    let seconds = end.timeIntervalSinceNow
    guard seconds >= 1 else { return }
    let content = UNMutableNotificationContent()
    content.title = title.isEmpty ? "Rest complete" : title
    content.body = body.isEmpty ? "Go." : body
    content.sound = .default
    content.userInfo = ["kind": "rest_done"]
    if #available(iOS 15.0, *) { content.interruptionLevel = .timeSensitive }
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
    center.add(UNNotificationRequest(identifier: HushLockIntentBus.restDoneId, content: content, trigger: trigger))
  }

  private static func cancelRestAlerts() {
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [HushLockIntentBus.restDoneId, HushLockIntentBus.restWarnId])
  }
}

/// How every tap runs: decided and written down at once, drawn in the lane, timed, and whistled.
enum HushLockTapRun {
  /// The phone hears of a verb when the card has answered it — or after this long, whichever is
  /// first. Drawing first means her thumb sees the card move before the phone redraws the same truth;
  /// the cap means a stalled draw can never leave the phone deaf to a tap.
  static let whistleAfterAtMostS: Double = 0.4

  /// One tap, start to finish. `decide` runs at once, under the lane's lock and in tap order, with the
  /// count of "Done"s still on their way and the tap's own instant; it writes what the tap writes and
  /// returns the card's redraw, or nil when the tap is refused. `leaves`: the tap is a "Done", counted
  /// as on its way until its draw lands or the tap stops waiting for it — exactly once either way.
  static func tap(
    _ kind: String,
    whistles: Bool,
    leaves: Bool = false,
    decide: (inout Int, Double) -> (@Sendable () async -> Bool)?
  ) async {
    let atMs = Date().timeIntervalSince1970 * 1000
    let ageS = HushLockTimings.processAgeS()
    let outcome = HushLockDrawn()
    let land = HushLockOnce()
    let lane = HushLockSerial.shared.decide { (leaving: inout Int) -> (@Sendable () async -> Void)? in
      guard let draw = decide(&leaving, atMs) else { return nil }
      return {
        outcome.set(await draw())
        if leaves { land.run { HushLockSerial.shared.landed() } }
      }
    }
    guard let lane else {
      HushLockTimings.note(kind, atMs: atMs, drawnMs: Date().timeIntervalSince1970 * 1000, ageS: ageS, drawn: false)
      return
    }
    let told = HushLockOnce()
    if whistles {
      Task {
        try? await Task.sleep(nanoseconds: UInt64(whistleAfterAtMostS * 1_000_000_000))
        told.run { HushLockIntentBus.whistle() }
      }
    }
    await HushLockSerial.waitAtMost(lane, seconds: HushLockSerial.drawCapS)
    if whistles { told.run { HushLockIntentBus.whistle() } }
    if leaves { land.run { HushLockSerial.shared.landed() } }
    let result = outcome.get()
    HushLockTimings.note(kind, atMs: atMs, drawnMs: result.atMs ?? Date().timeIntervalSince1970 * 1000, ageS: ageS, drawn: result.drawn)
  }

  /// A verb on the wire with nothing to decide but itself: "+15", "Next set", "Ready".
  static func verb(_ kind: HushLockIntentKind, draw: @escaping @Sendable (Date) async -> Bool) async {
    await tap(kind.rawValue, whistles: true) { _, atMs in
      HushLockIntentBus.record(kind, atMs: atMs)
      let at = Date(timeIntervalSince1970: atMs / 1000)
      return { await draw(at) }
    }
  }
}

// MARK: - The three intents

@available(iOS 17.0, *)
struct HushCompleteSetIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Log set"
  static var description = IntentDescription("Logs the current set as written and starts the rest.")
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    await HushLockTapRun.tap(HushLockIntentKind.completeSet.rawValue, whistles: true, leaves: true) { leaving, atMs in
      /*
       * ⛔ ONE "DONE" PER SET ON THE CARD (found in review, 2026-10-17). A card that lags is pressed
       * twice — and on a superset's first half, where no rest follows, the phone replayed the second
       * press onto the SECOND half and logged it as prescribed. While a "Done" is on its way to the
       * card, the set on the card is already logged: a second press is refused, not recorded.
       */
      guard leaving == 0 else { return nil }
      // Her parked figures ride with the tap — read before they are cleared, in one critical section.
      HushLockIntentBus.record(.completeSet, atMs: atMs, figures: HushLockProjection.pendingForCurrentSet())
      HushLockPending.clear()
      leaving += 1
      let at = Date(timeIntervalSince1970: atMs / 1000)
      return { await HushLockProjection.completeSet(at: at) }
    }
    return .result()
  }
}

/// One turn of a stepper on the card (2026-09-08). NOT a verb on the wire: nothing is queued — the
/// figures are parked in the App Group and travel with the "Done" tap that follows, so the phone
/// sees one event per set, carrying the numbers, exactly as a typed set on the stage does.
@available(iOS 17.0, *)
struct HushAdjustFigureIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Adjust set"
  static var description = IntentDescription("Changes the load or the reps of the set on the lock screen.")
  static var isDiscoverable: Bool = false

  /// "weight" | "reps"
  @Parameter(title: "Field") var field: String
  /// +1 / −1 — one detent of load, or one rep.
  @Parameter(title: "Delta") var delta: Int

  init() {
    self.field = "reps"
    self.delta = 1
  }

  init(field: String, delta: Int) {
    self.field = field
    self.delta = delta
  }

  func perform() async throws -> some IntentResult {
    let field = self.field
    let delta = self.delta
    // Counted at once, in tap order — unless a "Done" is still on its way to the card, in which case
    // the set this turn was aimed at is already logged and the turn is not counted.
    await HushLockTapRun.tap("adjust_\(field)", whistles: false) { leaving, _ in
      guard leaving == 0, HushLockProjection.count(field: field, delta: delta) else { return nil }
      return { await HushLockProjection.drawFigures() }
    }
    return .result()
  }
}

@available(iOS 17.0, *)
struct HushAddRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Add 15 seconds"
  static var description = IntentDescription("Adds fifteen seconds to the running rest.")
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    await HushLockTapRun.verb(.addRest) { _ in await HushLockProjection.addRest() }
    return .result()
  }
}

@available(iOS 17.0, *)
struct HushSetReadyIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Ready"
  static var description = IntentDescription("The set starts now — the bar is loaded.")
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    await HushLockTapRun.verb(.setReady) { _ in await HushLockProjection.setReady() }
    return .result()
  }
}

@available(iOS 17.0, *)
struct HushEndRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Start next set"
  static var description = IntentDescription("Ends the rest and presents the next set.")
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    await HushLockTapRun.verb(.endRest) { _ in await HushLockProjection.endRest() }
    return .result()
  }
}
