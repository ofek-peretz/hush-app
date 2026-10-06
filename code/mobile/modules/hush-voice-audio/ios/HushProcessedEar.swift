import AVFoundation
import Foundation

// ════ ⛔ THE MEASUREMENT'S EAR — VOICE PROCESSING, ASKED OF THE PHONE (2026-10-06) ════
//
//   > founder: *"אתה לא יכול לבדוק את זה באינטרנט או בכלי חיפוש כלשהו אם זה אמור או יכול לעבוד והאם
//   > יש תקדים לזה שהצליחו? … בסוף יש פתרון אלגנטי ונכון בהרבה יותר משאתה עושה. אני לא רוצה שישר
//   > תתחיל לעשות מבלי לתכנן לפני … אנחנו בונים פה סטארטאפ לא צעצוע."*
//
// THE CONFLICT, from Apple's own pages. The workout hears her from a pocket only because its
// microphone was opened on glass and is never closed. And the one documented way to lower her music
// for a line — `.duckOthers` — "begins when you activate your app's audio session and ends when you
// deactivate the session". Deactivating closes the microphone. So with the microphone held, the coach
// has spoken over music at full volume.
//
// THE CANDIDATE, also from Apple (WWDC23 "What's new in voice processing", iOS 17): the engine a
// call uses — voice processing — lowers "other audio", other apps' included, by itself, by a level
// the app sets (`voiceProcessingOtherAudioDuckingConfiguration`: min / mid / max, and an "advanced"
// style that lowers it only while someone speaks). No activation, no deactivation. A line played
// THROUGH the processed output is the voice; everything else is what gets lowered.
//
// WHAT NO PAGE SAYS, and so this class exists: voice processing sets the session's mode to
// `voiceChat` by itself, and that mode allows the earbuds' call profile by itself — which on
// Bluetooth is her music at phone-call quality. Whether the phone's own microphone can be kept with
// the earbuds on their music profile under voice processing, whether the level changes on a live
// engine, and whether the music comes back — a phone answers, in her pocket, with her music on.
//
// ⛔ THIS IS NOT THE WORKOUT'S EAR and shares no engine with it (`HushEar`). It is opened only by
// the profile's measurement (`src/platform/voice/voiceMeasure.ts`), on glass, with no workout
// running; `theMeasurementAsksThePhone` pins that nothing else reaches it. If the phone says yes,
// the workout's ear is rebuilt on what was measured — not on this file.

final class HushProcessedEar {
  private var engine: AVAudioEngine?
  /// The line's player. What it plays leaves through the processed output: the one sound in the
  /// phone that the processing does not lower.
  private var mouth: AVAudioPlayerNode?
  private var configObserver: NSObjectProtocol?
  private let lock = NSLock()
  private var keeping = false
  private var kept = Data()
  private var converter: AVAudioConverter?
  private let clipFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: HushEar.clipRate, channels: 1, interleaved: true)

  private(set) var running = false
  /// How many times iOS reconfigured the engine under the measurement (a route change) and it was
  /// started again — and the last time it could not be.
  private(set) var restarts = 0
  private(set) var lastError: String?

  /// The engine is really running (see `HushEar.alive`).
  var alive: Bool {
    return running && (engine?.isRunning ?? false)
  }

  private static func fault(_ message: String) -> NSError {
    return NSError(domain: "HushProcessedEar", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  // MARK: - Open (on glass), close

  /// The phone's own microphone, with voice processing — the session asked for exactly as the
  /// workout's ear asks (record-and-play, mixed with her music, the earbuds on their music
  /// profile), so what iOS changes after that is iOS's own doing, and `report()` prints it.
  func open() throws {
    close()
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .default, options: HushEar.sessionOptions(.phone, duck: false))
    try session.setActive(true)
    if let mic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
      try? session.setPreferredInput(mic)
    }
    // A new engine every time: nothing of a last run's formats is carried into this one.
    let engine = AVAudioEngine()
    let mouth = AVAudioPlayerNode()
    try engine.inputNode.setVoiceProcessingEnabled(true)
    engine.attach(mouth)
    self.engine = engine
    self.mouth = mouth
    do {
      try start()
    } catch {
      self.engine = nil
      self.mouth = nil
      throw error
    }
    running = true
    restarts = 0
    lastError = nil
    // A route change (the earbuds moved to their call profile, or back) reconfigures the engine and
    // stops it. Started again here; the count is part of what the measurement prints.
    configObserver = NotificationCenter.default.addObserver(
      forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
    ) { [weak self] _ in
      guard let self, self.running else { return }
      do {
        try self.start()
        self.restarts += 1
      } catch {
        self.lastError = "restart: \(error.localizedDescription)"
      }
    }
  }

  private func start() throws {
    guard let engine, let mouth else { throw Self.fault("no engine") }
    let input = engine.inputNode
    let heard = input.outputFormat(forBus: 0)
    guard heard.sampleRate > 0, heard.channelCount > 0 else { throw Self.fault("microphone input is busy") }
    let played = engine.outputNode.outputFormat(forBus: 0)
    guard played.sampleRate > 0, played.channelCount > 0 else { throw Self.fault("no output to play to") }
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 4096, format: nil) { [weak self] buffer, _ in
      self?.feed(buffer)
    }
    // The line's player into the mixer; the mixer is connected to the output by the engine itself.
    engine.connect(mouth, to: engine.mainMixerNode, format: nil)
    engine.prepare()
    try engine.start()
  }

  func close() {
    if let o = configObserver {
      NotificationCenter.default.removeObserver(o)
      configObserver = nil
    }
    lock.lock()
    keeping = false
    kept = Data()
    lock.unlock()
    if let engine {
      mouth?.stop()
      engine.inputNode.removeTap(onBus: 0)
      if engine.isRunning { engine.stop() }
      try? engine.inputNode.setVoiceProcessingEnabled(false)
    }
    engine = nil
    mouth = nil
    converter = nil
    running = false
  }

  // MARK: - The level her music is lowered to

  /// 0 the system's default, 10 the least, 20, 30 the most; `advanced` lowers it only while someone
  /// is speaking. "ok" when set; otherwise why not (iOS 16 and older have no such setting).
  func setDuck(level: Int, advanced: Bool) -> String {
    guard running, let engine else { return "not running" }
    guard #available(iOS 17.0, *) else { return "needs iOS 17" }
    let chosen: AVAudioVoiceProcessingOtherAudioDuckingConfiguration.Level
    switch level {
    case 10: chosen = .min
    case 20: chosen = .mid
    case 30: chosen = .max
    default: chosen = .`default`
    }
    engine.inputNode.voiceProcessingOtherAudioDuckingConfiguration =
      AVAudioVoiceProcessingOtherAudioDuckingConfiguration(enableAdvancedDucking: ObjCBool(advanced), duckingLevel: chosen)
    return "ok"
  }

  // MARK: - A line through the processed output

  /// Plays one cached line. `done(true)` when it was played to its end; false when it could not be
  /// (no engine, an unreadable file) or did not end within its own length and three seconds.
  func speak(url: URL, done: @escaping (Bool) -> Void) {
    let ending = OneShotEnd(done)
    guard running, let engine, let mouth, engine.isRunning else { return ending.fire(false) }
    guard let file = try? AVAudioFile(forReading: url), file.length > 0 else { return ending.fire(false) }
    let format = file.processingFormat
    guard format.sampleRate > 0, format.channelCount > 0 else { return ending.fire(false) }
    mouth.stop()
    engine.disconnectNodeOutput(mouth)
    engine.connect(mouth, to: engine.mainMixerNode, format: format)
    mouth.scheduleFile(file, at: nil, completionCallbackType: .dataPlayedBack) { _ in
      ending.fire(true)
    }
    // A player started on an engine that has just stopped raises; the check is made last.
    guard engine.isRunning else { return ending.fire(false) }
    mouth.play()
    let seconds = Double(file.length) / format.sampleRate
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds + 3) {
      ending.fire(false)
    }
  }

  // MARK: - What the processed microphone heard

  /// From here the microphone's audio is kept (16 kHz mono, at most `HushEar.clipMaxSeconds`).
  func keep() {
    lock.lock()
    kept = Data()
    keeping = true
    lock.unlock()
  }

  /// What was kept since `keep()`, in the shape `HushEar.clip` gives — and nothing more is kept.
  func clip() -> [String: Any]? {
    lock.lock()
    keeping = false
    let pcm = kept
    kept = Data()
    lock.unlock()
    guard !pcm.isEmpty else { return nil }
    let (peak, floor) = HushEar.loudness(pcm)
    return [
      "wav": HushEar.wav(pcm: pcm, rate: Int(HushEar.clipRate)).base64EncodedString(),
      "seconds": Double(pcm.count) / 2 / HushEar.clipRate,
      "peakDb": HushEar.decibels(peak),
      "floorDb": HushEar.decibels(floor),
    ]
  }

  private func feed(_ buffer: AVAudioPCMBuffer) {
    lock.lock()
    let keep = keeping
    lock.unlock()
    guard keep, let format = clipFormat, let out = convert(buffer, to: format), let channels = out.int16ChannelData else { return }
    let frames = Int(out.frameLength)
    guard frames > 0 else { return }
    let bytes = Data(bytes: channels[0], count: frames * 2)
    let cap = Int(HushEar.clipRate * HushEar.clipMaxSeconds) * 2
    lock.lock()
    if kept.count < cap { kept.append(bytes) }
    lock.unlock()
  }

  /// The tap's format is the processing's own; the clip's is 16 kHz mono (see `HushEar.convertClip`).
  private func convert(_ buffer: AVAudioPCMBuffer, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
    let inputFormat = buffer.format
    if converter == nil || converter?.inputFormat != inputFormat || converter?.outputFormat != format {
      converter = AVAudioConverter(from: inputFormat, to: format)
      converter?.primeMethod = .none
    }
    guard let converter else { return nil }
    let ratio = converter.outputFormat.sampleRate / converter.inputFormat.sampleRate
    let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 16
    guard let output = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: capacity) else { return nil }
    var nsError: NSError?
    let once = OneShotInput(buffer)
    let status = converter.convert(to: output, error: &nsError) { _, statusPtr in
      let next = once.take()
      statusPtr.pointee = next == nil ? .noDataNow : .haveData
      return next
    }
    return status == .error ? nil : output
  }

  // MARK: - Two things asked of the live session, after voice processing has shaped it

  /// The phone's own microphone asked for again — voice processing allows the earbuds' call profile
  /// by itself, and iOS may have taken it. "ok" when the request was accepted (what the route then
  /// IS, `report()` says); otherwise why not.
  func preferPhoneMic() -> String {
    let session = AVAudioSession.sharedInstance()
    guard let mic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) else {
      return "no built-in microphone offered"
    }
    do {
      try session.setPreferredInput(mic)
      return "ok"
    } catch {
      return error.localizedDescription
    }
  }

  /// The category stated again as the workout's ear states it — no call profile, the default mode —
  /// on the live session, then the phone's microphone asked for. Never a deactivation.
  func restate() -> String {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .default, options: HushEar.sessionOptions(.phone, duck: false))
      try session.setActive(true)
    } catch {
      return error.localizedDescription
    }
    return preferPhoneMic()
  }

  // MARK: - What iOS says the session is

  /// The route's ports in iOS's own words, the hardware's sample rate (a Bluetooth call profile is
  /// 8–24 kHz, her music 44.1–48), the mode and options iOS has NOW — which voice processing changes
  /// without being asked — and whether another app is playing.
  static func report() -> [String: Any] {
    let session = AVAudioSession.sharedInstance()
    let route = session.currentRoute
    let options = session.categoryOptions
    return [
      "inputs": route.inputs.map { $0.portType.rawValue },
      "outputs": route.outputs.map { $0.portType.rawValue },
      "outputNames": route.outputs.map { $0.portName },
      "category": session.category.rawValue,
      "mode": session.mode.rawValue,
      "rate": session.sampleRate,
      "hfpAllowed": options.contains(.allowBluetooth),
      "a2dpAllowed": options.contains(.allowBluetoothA2DP),
      "ducking": options.contains(.duckOthers),
      "otherAudio": session.isOtherAudioPlaying,
    ]
  }
}

/// A line's ending, said once: played to its end, or not — whichever is known first.
final class OneShotEnd: @unchecked Sendable {
  private let lock = NSLock()
  private var callback: ((Bool) -> Void)?

  init(_ callback: @escaping (Bool) -> Void) {
    self.callback = callback
  }

  func fire(_ ok: Bool) {
    lock.lock()
    let c = callback
    callback = nil
    lock.unlock()
    guard let c else { return }
    DispatchQueue.main.async { c(ok) }
  }
}
