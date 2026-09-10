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
  static let key = "hush.lockIntents"
  static let darwinName = "com.hushfitness.app.lockIntent"
  static let restDoneId = "hush.rest_done"
  static let restWarnId = "hush.rest_warn"

  /// `figures` — her load and reps from the steppers, riding only on a logged set
  /// (`platform/liveActivity.LockIntent.weight/reps`); bodyweight leaves the `weight` key out.
  static func push(_ kind: HushLockIntentKind, figures: HushLockPending.Figures? = nil) {
    let store = UserDefaults(suiteName: suite)
    var queue = store?.array(forKey: key) as? [[String: Any]] ?? []
    var entry: [String: Any] = [
      "id": UUID().uuidString,
      "type": kind.rawValue,
      "atMs": Date().timeIntervalSince1970 * 1000,
    ]
    if let f = figures {
      entry["reps"] = f.reps
      // A property list has no null: bodyweight is the KEY'S ABSENCE (`NSNull` would throw inside
      // `UserDefaults.set` and take the app process — where this intent runs — down with it).
      if let w = f.weight { entry["weight"] = w }
    }
    queue.append(entry)
    store?.set(queue, forKey: key)
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(darwinName as CFString),
      nil, nil, true
    )
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

  static func write(_ f: Figures) {
    var d: [String: Any] = ["key": f.key, "reps": f.reps]
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

  /// One turn of a stepper: the load by this lift's detent, the reps by one. Parked in the App
  /// Group for the set on the card and drawn at once. Only on a set — a rest has nothing to type.
  static func adjust(field: String, delta: Int) async {
    guard let a = activity() else { return }
    var s = a.content.state
    guard s.phase == "set" else { return }
    if field == "reps" {
      s.targetReps = max(1, min(100, s.targetReps + delta))
    } else if let w = s.targetWeight {
      let step = s.weightStep > 0 ? s.weightStep : 0.5
      // Rounded to the detent, so 40 − 2.5 + 2.5 is 40 again and never 39.999.
      s.targetWeight = max(0, (w + Double(delta) * step) / step).rounded() * step
    } else {
      return // bodyweight has no load to turn
    }
    HushLockPending.write(.init(key: HushLockPending.key(liftIndex: s.liftIndex, setIndex: s.setIndex), weight: s.targetWeight, reps: s.targetReps))
    await apply(s, to: a, unless: "set")
  }

  /// A set logged as written — or with her figures, when the steppers moved: its rest starts now,
  /// wearing the next set's label; the last set of the session has no rest to start and says so.
  static func completeSet() async {
    guard let a = activity() else { return }
    var s = a.content.state
    guard s.phase == "set" else { return } // a second tap on the same set is not a second set
    HushLockPending.clear() // sent with the tap (see the intent) — the card's next set starts clean
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
      let end = Date().addingTimeInterval(s.restAfterS)
      s.phase = "rest"
      s.isResting = true
      s.restEndDate = end
      s.restTotalS = s.restAfterS
      s.setLabel = s.nextSetLabel
      s.setIndex = s.nextSetIndex
      s.setCount = s.nextSetCount
      scheduleRestDone(at: end, title: s.alertTitle, body: s.alertBody)
    }
    await apply(s, to: a, unless: "set")
  }

  /// The phone may have republished the truth between the read above and this write (the whistle
  /// went out first, and JS may be awake): a projection is a guess, and it never overwrites a fact
  /// that arrived meanwhile — if the phase already left `stillPhase`, the phone spoke, and this stands down.
  private static func apply(_ s: HushSessionAttributes.ContentState, to a: Activity<HushSessionAttributes>, unless stillPhase: String) async {
    await apply(s, to: a) { $0.phase == stillPhase }
  }
  private static func apply(_ s: HushSessionAttributes.ContentState, to a: Activity<HushSessionAttributes>, while still: (HushSessionAttributes.ContentState) -> Bool) async {
    guard still(a.content.state) else { return }
    await a.update(ActivityContent(state: s, staleDate: nil))
  }

  /// Fifteen more seconds on the running rest — the end moves, and so does the alert.
  static func addRest(_ seconds: Double = 15) async {
    guard let a = activity() else { return }
    var s = a.content.state
    guard s.isResting, let end = s.restEndDate else { return }
    let newEnd = max(end, Date()).addingTimeInterval(seconds)
    s.restEndDate = newEnd
    s.restTotalS = (s.restTotalS ?? 0) + seconds
    scheduleRestDone(at: newEnd, title: s.alertTitle, body: s.alertBody)
    await apply(s, to: a) { $0.isResting }
  }

  /// "מוכן" from the card: the set is under way — the Ready button goes, Done stays. The phone
  /// moves the clock's stamp to the tap when it replays the queue.
  static func setReady() async {
    guard let a = activity() else { return }
    var s = a.content.state
    guard s.phase == "set", s.awaitingReady else { return }
    s.awaitingReady = false
    await apply(s, to: a) { $0.phase == "set" && $0.awaitingReady }
  }

  /// The rest is over when she says so: the next set is on the card, the alert stands down.
  static func endRest() async {
    guard let a = activity() else { return }
    var s = a.content.state
    guard s.isResting else { return }
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
    await apply(s, to: a) { $0.isResting }
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

// MARK: - The three intents

@available(iOS 17.0, *)
struct HushCompleteSetIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Log set"
  static var description = IntentDescription("Logs the current set as written and starts the rest.")
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    // Her figures ride with the tap — read BEFORE the projection clears them for the next set.
    HushLockIntentBus.push(.completeSet, figures: HushLockProjection.pendingForCurrentSet())
    await HushLockProjection.completeSet()
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
    await HushLockProjection.adjust(field: field, delta: delta)
    return .result()
  }
}

@available(iOS 17.0, *)
struct HushAddRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Add 15 seconds"
  static var description = IntentDescription("Adds fifteen seconds to the running rest.")
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    HushLockIntentBus.push(.addRest)
    await HushLockProjection.addRest()
    return .result()
  }
}

@available(iOS 17.0, *)
struct HushSetReadyIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Ready"
  static var description = IntentDescription("The set starts now — the bar is loaded.")
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    HushLockIntentBus.push(.setReady)
    await HushLockProjection.setReady()
    return .result()
  }
}

@available(iOS 17.0, *)
struct HushEndRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Start next set"
  static var description = IntentDescription("Ends the rest and presents the next set.")
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    HushLockIntentBus.push(.endRest)
    await HushLockProjection.endRest()
    return .result()
  }
}
