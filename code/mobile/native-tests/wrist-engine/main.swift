// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE WRIST RUNS WHAT THE PHONE RUNS — the watch's half. (founder, 2026-10-13)
//
//   "אני רוצה שהאימון בשעון יהיה ברמה הגבוהה ביותר ושיהיה מסונכרן בצורה מושלמת עם הפלאפון."
//
// `__tests__/sync/theWristRunsWhatThePhoneRuns` runs each scenario through the phone's real session
// store and writes down, after every action, what the phone tells the wrist — beside the plan the
// wrist would have been sent for that same day. This program plays the SAME script on the watch's
// REAL engine (`LocalWorkoutEngine.swift`, with its real `WatchStore` and `WatchWire`), on a Mac in
// CI, and holds every one of those facts against the frame the engine itself draws.
//
//   xcrun swiftc code/mobile/targets/watch/LocalWorkoutEngine.swift code/mobile/targets/watch/WatchStore.swift \
//     code/mobile/targets/watch/WatchWire.swift code/mobile/targets/watch/WatchCopy.swift \
//     code/mobile/native-tests/wrist-engine/main.swift -o wristengine
//   ./wristengine code/mobile/__tests__/sync/__fixtures__/wrist-engine [report.txt]
//
// A scenario that says `agrees: true` must agree on every fact. One that names a gap is allowed to
// differ — and REQUIRED to: when a gap stops differing this fails, so a gap cannot be closed in the
// engine without being closed in the scenario too. Exit 1 on either.
//
// What it cannot see: a rest running out by itself (the engine's timer needs a run loop and a
// minute), the haptics, the screens, Bluetooth. Those are the gallery's and the device's.
// ════════════════════════════════════════════════════════════════════════════════════════════════
import Foundation

let dir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let reportPath: String? = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : nil
let files = ((try? FileManager.default.contentsOfDirectory(atPath: dir)) ?? []).filter { $0.hasSuffix(".json") }.sorted()

var lines: [String] = []
var failures = 0
func say(_ s: String) {
  lines.append(s)
  print(s)
}

// ── comparing two JSON-shaped values ─────────────────────────────────────────────────────────────
func isNull(_ v: Any?) -> Bool {
  guard let v else { return true }
  return v is NSNull
}

func same(_ a: Any?, _ b: Any?) -> Bool {
  if isNull(a) && isNull(b) { return true }
  if isNull(a) || isNull(b) { return false }
  if let x = a as? String, let y = b as? String { return x == y }
  if let x = a as? [Any], let y = b as? [Any] {
    if x.count != y.count { return false }
    for i in 0..<x.count where !same(x[i], y[i]) { return false }
    return true
  }
  if let x = a as? [String: Any], let y = b as? [String: Any] {
    for k in Set(x.keys).union(y.keys) where !same(x[k], y[k]) { return false }
    return true
  }
  if let x = a as? NSNumber, let y = b as? NSNumber { return abs(x.doubleValue - y.doubleValue) < 0.0001 }
  return false
}

func show(_ v: Any?) -> String {
  if isNull(v) { return "–" }
  if let s = v as? String { return "\"\(s)\"" }
  if let a = v as? [Any] { return "[" + a.map { show($0) }.joined(separator: ", ") + "]" }
  if let d = v as? [String: Any] { return "{" + d.keys.sorted().map { "\($0): \(show(d[$0]))" }.joined(separator: ", ") + "}" }
  if let n = v as? NSNumber {
    let d = n.doubleValue
    return d.rounded() == d ? String(Int(d)) : String(d)
  }
  return "\(v!)"
}

// ── the wrist, as a dictionary of the facts it draws ─────────────────────────────────────────────
func drawn(_ m: WireMirror?) -> [String: Any] {
  guard let m, let data = try? JSONEncoder().encode(m),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
  else { return ["phase": "none"] }
  if m.phase == "complete" {
    var out: [String: Any] = ["phase": "complete"]
    if let s = m.summary {
      out["summarySets"] = s.sets
      if let kg = s.volumeKg { out["summaryVolumeKg"] = kg }
      let read: [String] = (s.lifts ?? []).map { lift in "\(lift.name) \(lift.best ?? "")" }
      out["summaryLifts"] = read
    }
    return out
  }
  var out = obj
  // "What comes next" is a fact of a rest — see the phone's half for why it is not compared off one.
  if m.phase != "rest_inter" && m.phase != "rest_transition" {
    for k in out.keys where k.hasPrefix("next") { out[k] = nil }
  }
  out["isWarmup"] = m.isWarmup == true
  return out
}

/// Every fact the phone stated, held against what the wrist drew. Returns the disagreements.
func disagreements(at label: String, phone: [String: Any], wrist: [String: Any]) -> [String] {
  var out: [String] = []
  for key in phone.keys.sorted() where !same(phone[key], wrist[key]) {
    out.append("\(label): \(key) — PHONE \(show(phone[key])) / WRIST \(show(wrist[key]))")
  }
  return out
}

/// The engine keeps its session and its outbox under Application Support. Every scenario starts on an empty wrist.
func emptyTheWrist() {
  let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
    ?? FileManager.default.temporaryDirectory
  try? FileManager.default.removeItem(at: base.appendingPathComponent("HushStandalone", isDirectory: true))
}

if files.isEmpty {
  say("wristengine: no scenarios in \(dir)")
  exit(1)
}

for file in files {
  let path = (dir as NSString).appendingPathComponent(file)
  guard let data = FileManager.default.contents(atPath: path),
        let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let name = root["name"] as? String,
        let steps = root["steps"] as? [[String: Any]],
        let start = root["start"] as? [String: Any],
        let logged = root["logged"] as? [[String: Any]],
        let workoutId = root["workoutId"] as? String
  else {
    say("✖ \(file): unreadable scenario")
    failures += 1
    continue
  }
  let says = root["says"] as? String ?? ""
  let gap = root["agrees"] as? [String: Any] // absent (it is `true`) when the two must agree
  var diffs: [String] = []

  emptyTheWrist()
  var engine: LocalWorkoutEngine?
  var last: WireMirror?
  var record: WireSessionRecord?

  if isNull(root["plan"]) {
    diffs.append("the wrist was sent NO plan for this day — it cannot be started here at all")
  } else if let planData = try? JSONSerialization.data(withJSONObject: root["plan"]!),
            let plan = try? JSONDecoder().decode(WirePlan.self, from: planData),
            let workout = plan.allWorkouts.first(where: { $0.id == workoutId }) {
    let e = LocalWorkoutEngine(workout: workout, plan: plan, store: WatchStore())
    e.onFrame = { last = $0 }
    e.onComplete = { r, frame in
      record = r
      last = frame
    }
    e.activate()
    engine = e
    diffs += disagreements(at: "start", phone: start, wrist: drawn(last))
  } else {
    diffs.append("the wrist could not READ the plan the phone built for this day")
  }

  if let engine {
    for (i, step) in steps.enumerated() {
      let what = step["do"] as? String ?? "?"
      switch what {
      case "complete":
        // As written unless she gave her own figures — the rule `WatchModel.completeSet` applies.
        let own = !isNull(step["reps"])
        let weight: Double? = own ? (step["weight"] as? NSNumber)?.doubleValue : last?.targetWeight
        let reps: Int = own ? ((step["reps"] as? NSNumber)?.intValue ?? 0) : (last?.targetReps ?? 0)
        engine.completeSet(weight: weight, reps: reps)
      case "start": engine.startHold()
      case "endRest": engine.endRest()
      case "addRest": engine.addRest(seconds: 15)
      case "pause": engine.pause()
      case "resume": engine.resume()
      case "finishEarly": engine.finishEarly()
      default: diffs.append("step \(i): an action this program does not know — \(what)")
      }
      let phone = step["phone"] as? [String: Any] ?? [:]
      diffs += disagreements(at: "step \(i) (\(what))", phone: phone, wrist: drawn(last))
    }

    // The record she brings home: every set, in order, with what she actually lifted.
    let sets = record?.sets ?? engine.state.sets
    let home: [[String: Any]] = sets.map { s in
      var row: [String: Any] = ["exerciseId": s.exerciseId, "setIndex": s.setIndex, "reps": s.actualReps]
      if let w = s.actualWeight { row["weight"] = w }
      return row
    }
    if !same(logged, home) {
      diffs.append("the record — PHONE \(show(logged)) / WRIST \(show(home))")
    }
    // …and every hold and carry she finished: where the plan had it, and what was asked.
    let heldOnPhone = root["held"] as? [[String: Any]] ?? []
    let heldOnWrist: [[String: Any]] = (record?.items ?? engine.state.items ?? []).map { i in
      var row: [String: Any] = ["exerciseId": i.exerciseId, "block": i.block, "round": i.round, "position": i.position, "kind": i.kind]
      if let s = i.seconds { row["seconds"] = s }
      if let m = i.metres { row["metres"] = m }
      if let l = i.load { row["load"] = l }
      return row
    }
    if !same(heldOnPhone, heldOnWrist) {
      diffs.append("the holds — PHONE \(show(heldOnPhone)) / WRIST \(show(heldOnWrist))")
    }
  }

  if let gap {
    let stage = (gap["stage"] as? NSNumber)?.intValue ?? 0
    let what = gap["gap"] as? String ?? ""
    if diffs.isEmpty {
      say("✖ \(name) — written down as a GAP (stage \(stage): \(what)) and the wrist now AGREES with the phone on every fact. Close it in the scenario.")
      failures += 1
    } else {
      say("… \(name) — known gap, stage \(stage): \(what). \(diffs.count) facts differ; the first:")
      for d in diffs.prefix(4) { say("      \(d)") }
    }
  } else if diffs.isEmpty {
    say("✔ \(name) — \(says): \(steps.count) actions, every fact the phone states is what the wrist draws, and the record is the same")
  } else {
    say("✖ \(name) — \(says): the wrist alone DISAGREES with the phone on \(diffs.count) facts")
    for d in diffs.prefix(12) { say("      \(d)") }
    failures += 1
  }
}

say(failures == 0 ? "\nwristengine: \(files.count) scenarios — the wrist alone is the phone wherever it is said to be" : "\nwristengine: \(failures) scenario(s) FAILED")
if let reportPath { try? lines.joined(separator: "\n").write(toFile: reportPath, atomically: true, encoding: .utf8) }
exit(failures == 0 ? 0 : 1)
