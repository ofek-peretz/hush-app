import AVFoundation
import Foundation

// ════ ⛔ WHICH ACT STOPS HER MUSIC — ASKED ONE ACT AT A TIME (2026-10-10) ════
//
// What his phone said, with Spotify, Sony WH-1000XM5 and iOS 26.3.1:
//   > *"לחצתי על בדיקת קול המוזיקה נחלשה."*                    — the coach speaking with NO microphone
//   > *"התחלתי אימון והמוזיקה נעצרה … חזרתי לספוטיפיי להמשיך את המוזיקה וחזרתי ל-FERROX, אבל איך
//   > שהמאמנת התחילה לדבר המוזיקה שוב נעצרה לגמרי."*            — the coach speaking with it held
//
// So on that phone it is one or the other: she hears him from his pocket, or he has his music. By
// Apple's own pages it should not be — the workout's ear asks for a session that mixes with other
// apps — and no page, and no reading of this code, says which act it is that stops Spotify: opening
// a record-and-play session, stating it again before a line, the line itself, or the player the line
// is played with. One developer of a fitness app describes the same ("Persistent PlayAndRecord: … no
// audible music") and was not answered.
//
// So each act is tried alone, and after each the PHONE is asked whether another app is still playing
// (`isOtherAudioPlaying`) — nobody's ears, nobody's memory. A trial ends by releasing the session
// with `.notifyOthersOnDeactivation`, which is what made Spotify resume by itself at the end of the
// first measurement; the next trial starts when it has.
//
// On glass only: a locked phone refuses to change its session at all (measured the same day:
// "לא ניתן היה להשלים את הפעולה", 23 ms). Reached only from the profile's measurement
// (`src/platform/voice/voiceMeasure.ts`); `theMeasurementAsksThePhone` pins that, and that every
// trial the phone is asked for by name exists here.

final class HushSessionTrial {
  enum Sound {
    case none
    /// An `AVAudioPlayer` — what the coach's lines are played with today.
    case player
    /// A player node on the SAME engine that holds the microphone.
    case engine
  }

  struct Plan {
    /// Begin as a workout does: `.playback`, mixed and active, a silent loop playing — and THEN the
    /// category changed under it. Without it, the trial's activation is a first one.
    let warm: Bool
    let record: Bool
    let options: AVAudioSession.CategoryOptions
    /// The microphone's engine is started.
    let microphone: Bool
    /// The category is stated and activated again before the sound — what `duck` does before a line.
    let restate: Bool
    let sound: Sound
    /// Apple's voice processing, restated to the default mode (`HushProcessedEar`).
    let processed: Bool
  }

  /// What the workout's ear asks for (`HushEar.sessionOptions(.phone)`).
  private static let standard: AVAudioSession.CategoryOptions = [.mixWithOthers, .defaultToSpeaker, .allowBluetoothA2DP]

  /// The trials, by the name the phone is asked for them by.
  static func plan(_ name: String) -> Plan? {
    switch name {
    case "playback":
      // The control: no microphone anywhere. Her music must still be playing after it.
      return Plan(warm: false, record: false, options: [.mixWithOthers], microphone: false, restate: false, sound: .player, processed: false)
    case "mic only":
      return Plan(warm: true, record: true, options: standard, microphone: true, restate: false, sound: .none, processed: false)
    case "mic + line":
      return Plan(warm: true, record: true, options: standard, microphone: true, restate: false, sound: .player, processed: false)
    case "mic + restate + line":
      // The workout, exactly.
      return Plan(warm: true, record: true, options: standard, microphone: true, restate: true, sound: .player, processed: false)
    case "mic + line through engine":
      return Plan(warm: true, record: true, options: standard, microphone: true, restate: false, sound: .engine, processed: false)
    case "mic fresh + line":
      return Plan(warm: false, record: true, options: standard, microphone: true, restate: false, sound: .player, processed: false)
    case "mic, no speaker option + line":
      return Plan(warm: true, record: true, options: [.mixWithOthers, .allowBluetoothA2DP], microphone: true, restate: false, sound: .player, processed: false)
    case "mic + duck option + line":
      return Plan(warm: false, record: true, options: standard.union(.duckOthers), microphone: true, restate: false, sound: .player, processed: false)
    case "record session, no mic + line":
      return Plan(warm: true, record: true, options: standard, microphone: false, restate: false, sound: .player, processed: false)
    case "voice processing + line":
      return Plan(warm: false, record: true, options: standard, microphone: true, restate: false, sound: .engine, processed: true)
    default:
      return nil
    }
  }

  /// What a trial found, gathered as it goes (a reference: every step writes into the same one).
  final class Facts {
    private(set) var all: [String: Any]
    var failed = false

    init(_ name: String) {
      all = ["name": name]
    }

    func set(_ key: String, _ value: Any) {
      all[key] = value
    }
  }

  /// A route or a profile settling, and Spotify's own reaction to being interrupted.
  private static let openSeconds = 1.5
  private static let restateSeconds = 1.0
  private static let toneSeconds = 1.0
  private static let afterSeconds = 0.8
  private static let toneRate = 22_050.0

  private var engine: AVAudioEngine?
  private var node: AVAudioPlayerNode?
  private var loop: AVAudioPlayer?
  private var line: AVAudioPlayer?
  private var processed: HushProcessedEar?
  private var busy = false

  private static func fault(_ message: String) -> NSError {
    return NSError(domain: "HushSessionTrial", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  private func after(_ seconds: Double, _ work: @escaping () -> Void) {
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  /// Each step's work, then its wait, then the next.
  private func walk(_ steps: [(Double, () -> Void)], from index: Int = 0) {
    guard index < steps.count else { return }
    let (wait, work) = steps[index]
    work()
    after(wait) { [weak self] in
      self?.walk(steps, from: index + 1)
    }
  }

  // MARK: - One trial, from the first statement to the release

  /// Main queue. `done` is called once, with what iOS said after each act:
  /// `before` / `open` / `restated` / `sound` — is another app's audio playing? — the route, and
  /// what each call answered.
  func run(_ name: String, done: @escaping ([String: Any]) -> Void) {
    guard !busy else { return done(["name": name, "error": "a trial is already running"]) }
    guard let plan = Self.plan(name) else { return done(["name": name, "error": "no such trial"]) }
    busy = true
    let facts = Facts(name)
    let session = AVAudioSession.sharedInstance()
    var steps: [(Double, () -> Void)] = []

    steps.append((Self.openSeconds, { [weak self] in
      facts.set("before", session.isOtherAudioPlaying)
      do {
        try self?.open(plan)
      } catch {
        facts.failed = true
        facts.set("error", "open: \(error.localizedDescription)")
      }
    }))
    if plan.processed {
      // Voice processing has put the sound where it wants it; the category is stated again, which
      // on his phone is what brought it back to the earbuds.
      steps.append((Self.openSeconds, { [weak self] in
        guard !facts.failed else { return }
        facts.set("first", session.currentRoute.outputs.first?.portType.rawValue ?? "none")
        facts.set("restate", self?.processed?.restate() ?? "not open")
      }))
    }
    steps.append((0, {
      guard !facts.failed else { return }
      facts.set("open", session.isOtherAudioPlaying)
      facts.set("in", session.currentRoute.inputs.first?.portType.rawValue ?? "none")
      facts.set("out", session.currentRoute.outputs.first?.portType.rawValue ?? "none")
      facts.set("rate", session.sampleRate)
      facts.set("mode", session.mode.rawValue)
      facts.set("mixing", session.categoryOptions.contains(.mixWithOthers))
    }))
    if plan.restate {
      steps.append((Self.restateSeconds, {
        guard !facts.failed else { return }
        do {
          try session.setCategory(.playAndRecord, mode: .default, options: plan.options)
          try session.setActive(true)
          facts.set("restate", "ok")
        } catch {
          facts.set("restate", error.localizedDescription)
        }
      }))
      steps.append((0, {
        guard !facts.failed else { return }
        facts.set("restated", session.isOtherAudioPlaying)
      }))
    }
    steps.append((Self.toneSeconds + Self.afterSeconds, { [weak self] in
      guard !facts.failed, let self else { return }
      facts.set("played", self.sound(plan, facts))
    }))
    steps.append((0, { [weak self] in
      if !facts.failed { facts.set("sound", session.isOtherAudioPlaying) }
      self?.release(facts, done)
    }))
    walk(steps)
  }

  private func open(_ plan: Plan) throws {
    let session = AVAudioSession.sharedInstance()
    if plan.processed {
      let ear = HushProcessedEar()
      processed = ear
      try ear.open()
      return
    }
    if plan.warm {
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true)
      let loop = try AVAudioPlayer(data: Self.wav(Self.silence(seconds: 1.0)))
      loop.numberOfLoops = -1
      loop.volume = 0.01
      loop.prepareToPlay()
      loop.play()
      self.loop = loop
    } else {
      // Nothing of ours is active when the category is stated: the activation below is a first one.
      try? session.setActive(false)
    }
    try session.setCategory(plan.record ? .playAndRecord : .playback, mode: .default, options: plan.options)
    try session.setActive(true)
    if plan.record, let mic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
      try? session.setPreferredInput(mic)
    }
    if plan.microphone { try startEngine(withNode: plan.sound == .engine) }
    if let loop, !loop.isPlaying { loop.play() }
  }

  private func startEngine(withNode: Bool) throws {
    let engine = AVAudioEngine()
    let input = engine.inputNode
    let heard = input.outputFormat(forBus: 0)
    guard heard.sampleRate > 0, heard.channelCount > 0 else { throw Self.fault("microphone input is busy") }
    // Pulled, and nothing kept: an input nobody reads is not a held microphone.
    input.installTap(onBus: 0, bufferSize: 4096, format: nil) { _, _ in }
    if withNode {
      let played = engine.outputNode.outputFormat(forBus: 0)
      guard played.sampleRate > 0, played.channelCount > 0 else { throw Self.fault("no output to play to") }
      guard let format = AVAudioFormat(standardFormatWithSampleRate: Self.toneRate, channels: 1) else {
        throw Self.fault("no tone format")
      }
      let node = AVAudioPlayerNode()
      engine.attach(node)
      engine.connect(node, to: engine.mainMixerNode, format: format)
      self.node = node
    }
    engine.prepare()
    try engine.start()
    self.engine = engine
  }

  /// The trial's one sound: a second of a soft tone. "ok" when it was started; otherwise why not.
  private func sound(_ plan: Plan, _ facts: Facts) -> String {
    if plan.processed {
      guard let ear = processed else { return "not open" }
      facts.set("lowering", ear.setDuck(level: 30, advanced: false))
      let url = FileManager.default.temporaryDirectory.appendingPathComponent("hush-trial-tone.wav")
      do {
        try Self.wav(Self.tone(seconds: Self.toneSeconds)).write(to: url)
      } catch {
        return "no tone file"
      }
      ear.speak(url: url) { ok in
        facts.set("ended", ok)
      }
      return ear.alive ? "ok" : "engine not running"
    }
    switch plan.sound {
    case .none:
      return "none"
    case .player:
      do {
        let line = try AVAudioPlayer(data: Self.wav(Self.tone(seconds: Self.toneSeconds)))
        line.volume = 1.0
        line.prepareToPlay()
        self.line = line
        return line.play() ? "ok" : "would not play"
      } catch {
        return error.localizedDescription
      }
    case .engine:
      guard let engine, let node, engine.isRunning else { return "engine not running" }
      guard let format = AVAudioFormat(standardFormatWithSampleRate: Self.toneRate, channels: 1),
            let buffer = Self.toneBuffer(format: format, seconds: Self.toneSeconds) else { return "no tone" }
      node.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
      // A player started on an engine that has just stopped raises; the check is made last.
      guard engine.isRunning else { return "engine stopped" }
      node.play()
      return "ok"
    }
  }

  /// Everything of the trial stopped, and the session given back — the release that lets a music
  /// app iOS had interrupted resume by itself.
  private func release(_ facts: Facts, _ done: @escaping ([String: Any]) -> Void) {
    line?.stop()
    line = nil
    node?.stop()
    node = nil
    if let engine {
      engine.inputNode.removeTap(onBus: 0)
      if engine.isRunning { engine.stop() }
    }
    engine = nil
    processed?.close()
    processed = nil
    loop?.stop()
    loop = nil
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
      facts.set("released", "ok")
    } catch {
      facts.set("released", error.localizedDescription)
    }
    busy = false
    done(facts.all)
  }

  // MARK: - Generated sound (no assets in the pod)

  private static func value(_ i: Int, of frames: Int) -> Double {
    let t = Double(i) / toneRate
    let attack = min(1.0, t / 0.02)
    let decay = 1.0 - Double(i) / Double(max(1, frames))
    return sin(2.0 * Double.pi * 660.0 * t) * attack * decay * 0.5
  }

  private static func tone(seconds: Double) -> [Int16] {
    let frames = Int(toneRate * seconds)
    var samples = [Int16](repeating: 0, count: frames)
    for i in 0..<frames {
      samples[i] = Int16(max(-1.0, min(1.0, value(i, of: frames))) * Double(Int16.max))
    }
    return samples
  }

  private static func silence(seconds: Double) -> [Int16] {
    return [Int16](repeating: 0, count: Int(toneRate * seconds))
  }

  private static func wav(_ samples: [Int16]) -> Data {
    let pcm = samples.withUnsafeBufferPointer { Data(buffer: $0) }
    return HushEar.wav(pcm: pcm, rate: Int(toneRate))
  }

  private static func toneBuffer(format: AVAudioFormat, seconds: Double) -> AVAudioPCMBuffer? {
    let frames = Int(format.sampleRate * seconds)
    guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
          let channel = buffer.floatChannelData else { return nil }
    buffer.frameLength = AVAudioFrameCount(frames)
    for i in 0..<frames {
      channel[0][i] = Float(value(i, of: frames))
    }
    return buffer
  }
}
