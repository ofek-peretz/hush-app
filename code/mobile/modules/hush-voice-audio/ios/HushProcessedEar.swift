import AVFoundation
import Foundation

// ════ ⛔ VOICE PROCESSING — ONE OF THE TRIALS, NEVER THE WORKOUT'S EAR (2026-10-06 → 2026-10-10) ════
//
//   > founder: *"אתה לא יכול לבדוק את זה באינטרנט או בכלי חיפוש כלשהו אם זה אמור או יכול לעבוד והאם
//   > יש תקדים לזה שהצליחו? … אני לא רוצה שישר תתחיל לעשות מבלי לתכנן לפני … אנחנו בונים פה סטארטאפ
//   > לא צעצוע."*
//
// THE CANDIDATE, from Apple (WWDC23 "What's new in voice processing", iOS 17): the engine a call uses
// lowers "other audio", other apps' included, by itself, by a level the app sets
// (`voiceProcessingOtherAudioDuckingConfiguration`). No activation, no deactivation — which is what a
// microphone that may never be closed needs. A line played THROUGH the processed output is the voice;
// everything else is what gets lowered.
//
// WHAT HIS PHONE SAID (build 77, Spotify · Sony WH-1000XM5 · iOS 26.3.1):
//   · opened with the phone's microphone, voice processing set the mode to `VoiceChat` by itself and
//     threw the sound OUT of the earbuds — `out=PHONE SPEAKER`;
//   · asking for the phone's microphone again changed nothing;
//   · stating the category again (mode `.default`) gave the earbuds back at full quality, the engine
//     still alive — but the session no longer in the call mode.
// So voice processing as designed is not a way to keep her music whole. What nobody could tell from
// that run is whether, in that restated state, it lowers her music at all — her music had already
// stopped (see `HushSessionTrial`, which is what asks now).
//
// ⛔ This class shares no engine with the workout's ear (`HushEar`) and is reached only from
// `HushSessionTrial`, i.e. from the profile's measurement. `theMeasurementAsksThePhone` pins that.

final class HushProcessedEar {
  private var engine: AVAudioEngine?
  /// The line's player. What it plays leaves through the processed output: the one sound in the
  /// phone that the processing does not lower.
  private var mouth: AVAudioPlayerNode?
  private var configObserver: NSObjectProtocol?

  private(set) var running = false
  /// How many times iOS reconfigured the engine under the trial (a route change) and it was started
  /// again — and the last time it could not be.
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
    // A route change (the sound moved to the speaker, or back to the earbuds) reconfigures the
    // engine and stops it. Started again here; the count is part of what the trial prints.
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
    // The microphone is pulled (a tap that keeps nothing): an input nobody reads is not a held one.
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 4096, format: nil) { _, _ in }
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
    if let engine {
      mouth?.stop()
      engine.inputNode.removeTap(onBus: 0)
      if engine.isRunning { engine.stop() }
      try? engine.inputNode.setVoiceProcessingEnabled(false)
    }
    engine = nil
    mouth = nil
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

  /// Plays one sound file. `done(true)` when it was played to its end; false when it could not be
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

  // MARK: - Asked of the live session, after voice processing has shaped it

  /// The category stated again as the workout's ear states it — no call profile, the default mode —
  /// on the live session, then the phone's microphone asked for. Never a deactivation. On his phone
  /// this is what brought the sound back from the speaker to the earbuds.
  func restate() -> String {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .default, options: HushEar.sessionOptions(.phone, duck: false))
      try session.setActive(true)
    } catch {
      return error.localizedDescription
    }
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

  // MARK: - What iOS says the session is

  /// The route's ports in iOS's own words, the hardware's sample rate (a Bluetooth call profile is
  /// 8–24 kHz, her music 44.1–48), the mode and options iOS has NOW, and whether another app is
  /// playing — the one reading of her music that needs nobody's ears.
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
      "mixing": options.contains(.mixWithOthers),
      "otherAudio": session.isOtherAudioPlaying,
    ]
  }
}

/// A sound's ending, said once: played to its end, or not — whichever is known first.
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
