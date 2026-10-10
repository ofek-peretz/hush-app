// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE WRIST READS WHAT THE PHONE SAID — the Swift half of the sync simulator. (2026-09-17)
//
// `__tests__/sync/theSurfacesNeverDisagree` drives the real session store and writes, at the moments
// that matter, the exact envelope the watch is sent beside the facts the PHONE's own view states.
// This program decodes every one of those envelopes with the watch's real `WatchWire.decodeEnvelope`
// and checks each fact against what the wrist would read. Built and run by the macOS CI job:
//
//   xcrun swiftc code/mobile/targets/watch/WatchWire.swift code/mobile/targets/watch/WatchCopy.swift \
//     code/mobile/native-tests/wire-fixtures/main.swift -o wirecheck
//   ./wirecheck code/mobile/__tests__/sync/__fixtures__
//
// Exit 1 on any disagreement, naming the frame, the fact, and both values.
// ════════════════════════════════════════════════════════════════════════════════════════════════
import Foundation

let dir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let files = ((try? FileManager.default.contentsOfDirectory(atPath: dir)) ?? []).filter { $0.hasSuffix(".json") }.sorted()
var failures: [String] = []
var checked = 0

func num(_ v: Any?) -> Double? {
  if let n = v as? NSNumber { return n.doubleValue }
  return nil
}

func same(_ a: Double?, _ b: Double?) -> Bool {
  switch (a, b) {
  case (nil, nil): return true
  case let (x?, y?): return abs(x - y) < 0.0001
  default: return false
  }
}

func show(_ v: Any?) -> String { v.map { "\($0)" } ?? "nil" }

if files.isEmpty {
  print("wirecheck: no fixtures in \(dir)")
  exit(1)
}

for file in files {
  let path = (dir as NSString).appendingPathComponent(file)
  guard let data = FileManager.default.contents(atPath: path),
        let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let phone = root["phone"] as? [String: Any],
        let envObj = root["envelope"],
        let envData = try? JSONSerialization.data(withJSONObject: envObj),
        let envJSON = String(data: envData, encoding: .utf8)
  else {
    failures.append("\(file): unreadable fixture")
    continue
  }
  guard let env = WatchWire.decodeEnvelope(envJSON) else {
    failures.append("\(file): the watch REFUSED the envelope — \(WatchWire.decodeFailureReason(envJSON))")
    continue
  }
  guard let m = env.mirror else {
    failures.append("\(file): decoded with no mirror")
    continue
  }
  func expect(_ fact: String, _ phoneValue: Any?, _ wristValue: Any?, _ equal: Bool) {
    checked += 1
    if !equal { failures.append("\(file): \(fact) — PHONE \(show(phoneValue)) / WRIST \(show(wristValue))") }
  }

  let phase = phone["phase"] as? String
  expect("phase", phase, m.phase, phase == m.phase)
  if phase == "complete" { continue }

  if phone.keys.contains("restEndsAtMs") {
    let want = num(phone["restEndsAtMs"])
    let got = WatchWire.parseDate(m.restEndsAt).map { ($0.timeIntervalSince1970 * 1000).rounded() }
    expect("rest end (ms)", want, got, same(want, got))
  }
  if phone.keys.contains("exerciseName"), let name = phone["exerciseName"] as? String {
    expect("lift", name, m.exerciseName, name == m.exerciseName)
  }
  if phone.keys.contains("targetWeight") {
    expect("load", phone["targetWeight"], m.targetWeight, same(num(phone["targetWeight"]), m.targetWeight))
  }
  if phone.keys.contains("setNumber"), let n = num(phone["setNumber"]) {
    expect("set #", n, m.setNumber, same(n, m.setNumber.map(Double.init)))
  }
  if phone.keys.contains("holdSeconds") {
    expect("hold seconds", phone["holdSeconds"], m.holdSeconds, same(num(phone["holdSeconds"]), m.holdSeconds.map(Double.init)))
  }
  if phone.keys.contains("holdMetres") {
    expect("carry metres", phone["holdMetres"], m.holdMetres, same(num(phone["holdMetres"]), m.holdMetres.map(Double.init)))
  }
  if phone.keys.contains("nextSetNumber"), let n = num(phone["nextSetNumber"]) {
    expect("next set #", n, m.nextSetNumber, same(n, m.nextSetNumber.map(Double.init)))
  }
  if phone.keys.contains("nextTargetWeight") {
    expect("next load", phone["nextTargetWeight"], m.nextTargetWeight, same(num(phone["nextTargetWeight"]), m.nextTargetWeight))
  }
  if phone.keys.contains("nextHoldSeconds") {
    expect("next hold seconds", phone["nextHoldSeconds"], m.nextHoldSeconds, same(num(phone["nextHoldSeconds"]), m.nextHoldSeconds.map(Double.init)))
  }
  if phone.keys.contains("nextHoldMetres") {
    expect("next carry metres", phone["nextHoldMetres"], m.nextHoldMetres, same(num(phone["nextHoldMetres"]), m.nextHoldMetres.map(Double.init)))
  }
}

if failures.isEmpty {
  print("wirecheck: \(files.count) frames, \(checked) facts — the wrist reads exactly what the phone said")
  exit(0)
}
print("wirecheck: \(failures.count) DISAGREEMENT(S)")
for f in failures { print("  ✗ \(f)") }
exit(1)
