// HOW LONG APPLE'S NETWORKING WAITS ON A QUIET LINE — measured, not assumed (2026-10-12).
//
// FOUNDER: "אתה לא יכול לבדוק את זה אם הצד של האייפון יוכח?"
//
// The week's build may now take up to 107 s (the strong model's deadline). Apple documents
// `timeoutIntervalForRequest` as an IDLE timer — "how long a task should wait for additional data
// to arrive… reset whenever new data arrives… the default value is 60" — and React Native leaves it
// at that default, sending every request with `timeoutInterval = 0` (RCTNetworking.mm). So the
// Worker keeps the line alive with a comment every ten seconds. Whether that is enough is a fact
// about URLSession, and this asks URLSession: the same Foundation, with the same settings React
// Native uses, against a local server that is silent, or that beats.
//
// THE DECISION TABLE, FIXED BEFORE THE RUN:
//   B and C ARRIVE          the heartbeat holds a line past sixty seconds — the design is sound.
//   B or C is CUT at ~60 s  the timer does not reset on data — the design fails on iOS, and the
//                           build must move to start-and-poll before any build ships.
//   A is CUT at ~60 s       the limit is real with React Native's settings: the heartbeat was needed.
//   A ARRIVES               there is no sixty-second limit with those settings: the beat is insurance.
//
// Built twice by `probe.sh`: for macOS, and for the iOS SIMULATOR (run with `simctl spawn`, so the
// networking under it is iOS's own).

import Foundation

final class Probe: NSObject, URLSessionDataDelegate {
  private let name: String
  private let started = Date()
  private var last = Date()
  private var chunks = 0
  private var bytes = 0
  private var longest = 0.0
  private var status = -1
  private let done: (String) -> Void

  init(name: String, done: @escaping (String) -> Void) {
    self.name = name
    self.done = done
    super.init()
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    status = (response as? HTTPURLResponse)?.statusCode ?? -1
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    let now = Date()
    longest = max(longest, now.timeIntervalSince(last))
    last = now
    chunks += 1
    bytes += data.count
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let seconds = String(format: "%.1f", Date().timeIntervalSince(started))
    if let e = error as NSError? {
      done("\(name) => CUT after \(seconds)s  [\(e.domain) \(e.code): \(e.localizedDescription)]  http \(status), \(chunks) chunks")
    } else {
      let quiet = String(format: "%.1f", longest)
      done("\(name) => ARRIVED after \(seconds)s  http \(status), \(chunks) chunks, \(bytes) bytes, longest silence \(quiet)s")
    }
    session.finishTasksAndInvalidate()
  }
}

let port = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "8765"
let lock = NSLock()
let group = DispatchGroup()
var sessions: [URLSession] = []

func say(_ line: String) {
  lock.lock()
  print(line)
  fflush(stdout)
  lock.unlock()
}

/// One request, made the way React Native makes it: the default session configuration, cookies on,
/// a delegate — and `timeoutInterval` exactly as given (`0` is what RN sends; `nil` leaves the default).
func launch(_ name: String, _ path: String, _ timeout: TimeInterval?) {
  group.enter()
  let probe = Probe(name: name) { line in
    say(line)
    group.leave()
  }
  let configuration = URLSessionConfiguration.default
  configuration.httpShouldSetCookies = true
  configuration.httpCookieAcceptPolicy = .always
  let session = URLSession(configuration: configuration, delegate: probe, delegateQueue: nil)
  sessions.append(session)
  var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)\(path)")!)
  request.httpMethod = "POST"
  request.setValue("application/json", forHTTPHeaderField: "content-type")
  request.httpBody = Data("{}".utf8)
  if let timeout = timeout {
    request.timeoutInterval = timeout
  }
  session.dataTask(with: request).resume()
}

let simulator = ProcessInfo.processInfo.environment["SIMULATOR_RUNTIME_VERSION"]
say("system: \(ProcessInfo.processInfo.operatingSystemVersionString)\(simulator.map { " · iOS simulator runtime \($0)" } ?? " · not a simulator")")
say("defaults: configuration.timeoutIntervalForRequest = \(URLSessionConfiguration.default.timeoutIntervalForRequest)s · a new URLRequest.timeoutInterval = \(URLRequest(url: URL(string: "http://127.0.0.1")!).timeoutInterval)s")

launch("A  silent for 75s, then the answer            (timeoutInterval 0 — what React Native sends)", "/silent?s=75", 0)
launch("B  a beat every 10s for 75s, then the answer  (timeoutInterval 0)", "/beat?s=75", 0)
launch("C  a beat every 10s for 110s, then the answer (timeoutInterval 0) — our worst case", "/beat?s=110", 0)
launch("D  headers at once, then silent for 75s       (timeoutInterval 0)", "/headers-then-silent?s=75", 0)
launch("E  silent for 75s, then the answer            (request left at its default)", "/silent?s=75", nil)

if group.wait(timeout: .now() + 240) == .timedOut {
  say("probe: some requests had not finished after 240s")
}
say("done")
