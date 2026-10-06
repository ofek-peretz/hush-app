import AVFoundation
import Foundation
import Speech

// ════ THE EAR THAT SURVIVES THE POCKET (2026-09-15) ════
//
//   > founder: *"אם המסך דלוק זה אומר שזה שווה ערך לזה שהמתאמן יצטרך ללחוץ על המסך … מה שהורס את
//   > כל חווית הלא לגעת בפלאפון בזמן האימון."*
//
// The first ear (`expo-speech-recognition`, i.e. SFSpeechRecognizer) opened the microphone at every
// question. From a locked phone that meets two walls, both documented: iOS refuses to START a
// recording from the background (`cannotStartRecording`, 561145187), and Apple "explicitly don't
// support speech recognition in the background" for SFSpeechRecognizer (kAFAssistantErrorDomain
// 1700). A recording that was started in the FOREGROUND keeps running when the phone locks — the
// `audio` background mode covers it, as it covers any recorder.
//
// So this ear is opened once, on glass (the gate opens on the stage, which she is looking at), and
// runs for the workout. Nothing is kept or transcribed until the conductor asks a question: only
// then is the microphone's audio kept — and only until the window closes.
//
// ════ ⛔ THE MICROPHONE IS FOR EVERY PHONE; APPLE'S RECOGNIZER IS THE EXTRA (2026-10-05) ════
//
//   > founder: *"מה זאת אומרת אין עדיין אוזן של openai? אבל אמרנו ש-openai זה מי שהמשתמש מנהל איתו
//   > את השיחה לאורך כל האימון."*
//
// He had said it, on 2026-09-28: the strongest recognizer is the input of the workout. And this
// whole class stood behind `@available(iOS 26.0, *)`, and `listen` threw before it kept a single
// sample unless Apple's on-device recognizer (SpeechAnalyzer) had a model for her language — so the
// recording the strong ear needs existed only where Apple's NEW recognizer did. On an iPhone that
// cannot run iOS 26, or one without the Hebrew model, the coach's ear was Apple's old recognizer on
// a lit screen and nothing else. That was never a decision; it was the order two things were built
// in.
//
// Now there are two layers, and only one of them asks anything of the phone:
//   · THE MICROPHONE AND THE WINDOW'S AUDIO — AVAudioEngine, a tap, 16 kHz PCM. Every iOS this app
//     runs on. This is what the strong ear hears (`platform/voice/cloudEar`).
//   · APPLE'S ON-DEVICE RECOGNIZER — iOS 26 and a model for the locale. When both are there it
//     listens to the same window and reports its sentences; it is the answer in a gym with no
//     signal. When either is missing the window simply has no second listener.
// The wiring of the recognizer follows the verified shape of
// github.com/simplememofast/ios26-speechanalyzer-live-mic (SpeechSession / AudioBufferConverter).
//
// Two sources:
//   · phone   — the phone's own microphone; the earbuds stay on A2DP and her music keeps its quality.
//     The only source the workout holds open (founder, 2026-09-15: "the music must not suffer").
//   · headset — the earbuds' microphone (Bluetooth HFP): iOS cannot record from Bluetooth and play
//     A2DP at once, so her music is at call quality for as long as it is open. Opened only for a
//     single short window (the locked-phone test's "window" steps), never for a workout.
//
// ⛔ While the ear runs, the session category never leaves `.playAndRecord`: switching to
// `.playback` (the keep-alive's, the duck's) removes the input and stops the engine, and a stopped
// engine can only be restarted on glass. The audio module asks `sessionOptions` for every change.

final class HushEar {
  enum Source: String {
    case headset
    case phone
  }

  private let engine = AVAudioEngine()
  private let lock = NSLock()
  private var target: AVAudioFormat?
  private var token: Int = 0
  private var converter: AVAudioConverter?
  private var resultsTask: Task<Void, Never>?
  private var configObserver: NSObjectProtocol?
  /// Apple's on-device recognizer for the open window (`SpeechAnalyzer`) and the stream it reads
  /// (`AsyncStream<AnalyzerInput>.Continuation`). Held untyped: a stored property cannot be marked
  /// iOS 26, and this class must exist on every iOS the app runs on.
  private var analyzerBox: AnyObject?
  private var builderBox: Any?
  /// A window is open: what the microphone hears is being kept.
  private var capturing = false

  private(set) var running = false
  private(set) var source: Source = .headset
  /// Apple's recognizer is listening to the open window too (iOS 26, the locale's model installed).
  private(set) var recognizing = false

  // ── The window's own audio, for the strong ear (2026-09-27) ─────────────────────────────────────
  // While a window listens, what the microphone hears is kept as 16 kHz mono 16-bit PCM — the shape
  // a cloud recognizer takes. Capped at the last `clipMaxSeconds`; cleared when the next window
  // opens; read by `clip(token:)` during the window and after it ends. Never written anywhere but
  // memory.
  static let clipRate: Double = 16_000
  static let clipMaxSeconds: Double = 20
  private let clipFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: HushEar.clipRate, channels: 1, interleaved: true)
  private var clipConverter: AVAudioConverter?
  private var clipData = Data()
  private var clipToken: Int = -1

  /// A final sentence Apple's recognizer heard inside a window, with the window's token.
  var onResult: ((String, Int) -> Void)?
  /// The engine stopped or failed to restart — the JS side falls back to the screen-on ear.
  var onState: (([String: Any]) -> Void)?

  // MARK: - Apple's on-device recognizer: can this phone, for this locale?

  @available(iOS 26.0, *)
  static func supportedLocale(_ identifier: String) async -> Locale? {
    await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: identifier))
  }

  /// The on-device model for the locale, downloaded on first use (needs a network once).
  @available(iOS 26.0, *)
  static func ensureModel(_ identifier: String) async throws -> Bool {
    guard let locale = await supportedLocale(identifier) else { return false }
    let installed = await Set(SpeechTranscriber.installedLocales.map { $0.identifier(.bcp47) })
    if installed.contains(locale.identifier(.bcp47)) { return true }
    let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [], attributeOptions: [])
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      try await request.downloadAndInstall()
    }
    let now = await Set(SpeechTranscriber.installedLocales.map { $0.identifier(.bcp47) })
    return now.contains(locale.identifier(.bcp47))
  }

  static func sessionOptions(_ source: Source, duck: Bool) -> AVAudioSession.CategoryOptions {
    // `.defaultToSpeaker`: with no earbuds a record-and-play session would move every sound on the
    // phone to the earpiece. `.mixWithOthers`: her music keeps playing.
    var options: AVAudioSession.CategoryOptions = [.mixWithOthers, .defaultToSpeaker]
    switch source {
    case .headset: options.insert(.allowBluetooth)
    case .phone: options.insert(.allowBluetoothA2DP)
    }
    if duck { options.insert(.duckOthers) }
    return options
  }

  // MARK: - The engine (opened on glass, kept for the workout)

  // MARK: - ⛔ Two moves on the live session — STEPS OF THE MEASUREMENT, never a workout's (2026-10-06)
  //
  //   > founder: *"חייב שהשמע יהיה מהאוזניות ולא מהפלאפון, כי בגלל שזה מהפלאפון המתאמן שומע בפול ווליום
  //   > את המוזיקה ולא שומעים את המאמן. ואני חושב שגם מהאוזניות הקלט יהיה הרבה יותר טוב כי זה ממש על
  //   > הפה. … גם אם זה ינמיך לרגע את המוזיקה."*
  //
  // Built into the workout that afternoon, and taken out of it the same day:
  //
  //   > founder: *"אתה לא יכול לבדוק את זה באינטרנט … אם זה אמור או יכול לעבוד והאם יש תקדים לזה
  //   > שהצליחו? … אנחנו בונים פה סטארטאפ לא צעצוע."*
  //
  // What the search found, from Apple's own pages: a duck "begins when you activate your app's audio
  // session and ends when you deactivate the session" — and this engine cannot be deactivated (a
  // recording cannot be started again from a pocket). And nothing Apple has written says a recorder
  // may be restarted on a new route from a locked phone; the earbuds' microphone is a call profile,
  // always both ways, so her music is at call quality for as long as it is open.
  //
  // So neither is the workout's. They stay as two steps of the profile's measurement
  // (`platform/voice/voiceMeasure`), which asks the phone, in her pocket, with her music on:
  //   · the duck — `.duckOthers` put on and taken off the running session (the audio module's
  //     `applySession`, behind `duckUnderEar`, which only the measurement turns on).
  //   · `reroute` — the input moved to the earbuds and back; a route change, after which the engine
  //     is restarted (as it already is when earbuds are pulled out mid-set).
  // The third step is the one Apple documents — voice processing, in `HushProcessedEar.swift`.

  /// The measurement's duck is on right now — set by the audio module, which puts `.duckOthers` on
  /// and off the live session; kept here so a reroute carries it across.
  var ducking = false

  /// Move the running engine to the other microphone. `done(nil)` when it records there; otherwise
  /// why not — and then the ear is no longer running (the JS side is told, and reopens on glass).
  func reroute(to next: Source, done: @escaping (String?) -> Void) {
    guard running else { return done("ear not running") }
    if next == source && engine.isRunning { return done(nil) }
    source = next
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .default, options: Self.sessionOptions(next, duck: ducking))
    } catch {
      return done("category: \(error.localizedDescription)")
    }
    switch next {
    case .phone:
      if let mic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) { try? session.setPreferredInput(mic) }
    case .headset:
      // The earbuds' own microphone when they have one; with none, iOS keeps the phone's.
      try? session.setPreferredInput(session.availableInputs?.first(where: { $0.portType == .bluetoothHFP }))
    }
    settle(tries: 5, done: done)
  }

  /// A Bluetooth profile takes a moment to change, and the input has no format until it has: the
  /// engine is started on the new route a few times over a second and a half before giving up.
  private func settle(tries: Int, done: @escaping (String?) -> Void) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      guard let self else { return done("ear gone") }
      guard self.running else { return done("ear stopped") }
      do {
        try self.startEngine()
        done(nil)
      } catch {
        if tries > 1 { return self.settle(tries: tries - 1, done: done) }
        self.running = false
        self.onState?(["running": false, "error": "reroute: \(error.localizedDescription)"])
        done(error.localizedDescription)
      }
    }
  }

  /// The microphone is really running. `running` is the intent — the workout holds the ear — and
  /// this is the fact: an interruption stops the engine without a word to anyone (see `resume`).
  var alive: Bool {
    return running && engine.isRunning
  }

  /// ⛔ A CALL ENDS, AND THE MICROPHONE COMES BACK (2026-10-05). A phone call, Siri or an alarm
  /// interrupts the session and stops the engine; iOS posts no configuration change for it, so
  /// nothing restarted it — `running` stayed true over a microphone that heard nothing, and every
  /// window for the rest of the workout was silence. Called when the interruption ends: the app is
  /// the one that was interrupted, which is the one case iOS lets a recording start again from the
  /// pocket. If it will not, the JS side is told, and the next time she is on glass it reopens.
  func resume() {
    guard running, !engine.isRunning else { return }
    do {
      try startEngine()
      onState?(["running": true, "restarted": true])
    } catch {
      running = false
      onState?(["running": false, "error": "resume: \(error.localizedDescription)"])
    }
  }

  func open(source: Source) throws {
    // Asked to open what is already open AND alive: nothing to do. An engine an interruption left
    // stopped is not "open" — it is closed and opened again, below.
    if running && self.source == source && engine.isRunning { return }
    if running { close() }
    self.source = source
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .default, options: Self.sessionOptions(source, duck: false))
    try session.setActive(true)
    if source == .phone, let mic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
      try? session.setPreferredInput(mic)
    } else if source == .headset {
      try? session.setPreferredInput(nil)
    }
    try startEngine()
    running = true
    if configObserver == nil {
      // A route change (earbuds out, a call) reconfigures the engine and stops it. Restart it; from a
      // locked phone iOS may refuse, and then the JS side is told and falls back.
      configObserver = NotificationCenter.default.addObserver(
        forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
      ) { [weak self] _ in
        guard let self, self.running else { return }
        do {
          try self.startEngine()
          self.onState?(["running": true, "restarted": true])
        } catch {
          self.running = false
          self.onState?(["running": false, "error": "restart: \(error.localizedDescription)"])
        }
      }
    }
  }

  private func startEngine() throws {
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw NSError(domain: "HushEar", code: 1, userInfo: [NSLocalizedDescriptionKey: "microphone input is busy"])
    }
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 4096, format: nil) { [weak self] buffer, _ in
      self?.feed(buffer)
    }
    engine.prepare()
    try engine.start()
  }

  func close() {
    lock.lock()
    let b = builderBox
    builderBox = nil
    target = nil
    capturing = false
    clipData = Data()
    clipToken = -1
    lock.unlock()
    let a = analyzerBox
    analyzerBox = nil
    recognizing = false
    if #available(iOS 26.0, *) {
      (b as? AsyncStream<AnalyzerInput>.Continuation)?.finish()
      if let analyzer = a as? SpeechAnalyzer {
        Task { try? await analyzer.finalizeAndFinishThroughEndOfInput() }
      }
    }
    resultsTask?.cancel()
    resultsTask = nil
    engine.inputNode.removeTap(onBus: 0)
    if engine.isRunning { engine.stop() }
    running = false
    if let o = configObserver {
      NotificationCenter.default.removeObserver(o)
      configObserver = nil
    }
  }

  // MARK: - A window

  /// Open a window: from here the microphone's audio is kept (for the strong ear), and — where this
  /// phone has Apple's recognizer and a model for the locale — handed to it as well. Results carry
  /// `token`, so a late sentence from a window already closed is never taken for the next one's
  /// answer. Throws only when the microphone itself is not running.
  func listen(localeIdentifier: String, token: Int) async throws {
    await stopListening()
    guard running else {
      throw NSError(domain: "HushEar", code: 2, userInfo: [NSLocalizedDescriptionKey: "ear not running"])
    }
    lock.lock()
    self.token = token
    // A new window, a new clip: nothing of the last answer is ever sent as this one's.
    self.clipData = Data()
    self.clipToken = token
    self.capturing = true
    lock.unlock()
    if #available(iOS 26.0, *) {
      recognizing = await startRecognizer(localeIdentifier: localeIdentifier, token: token)
    } else {
      recognizing = false
    }
  }

  /// Apple's on-device recognizer on this window. False — and nothing else changes — when the locale
  /// is not supported, its model is not on the phone (a window never waits on a download), or the
  /// recognizer would not start.
  @available(iOS 26.0, *)
  private func startRecognizer(localeIdentifier: String, token: Int) async -> Bool {
    guard let locale = await Self.supportedLocale(localeIdentifier) else { return false }
    let installed = await Set(SpeechTranscriber.installedLocales.map { $0.identifier(.bcp47) })
    guard installed.contains(locale.identifier(.bcp47)) else { return false }
    let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [], attributeOptions: [])
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    let bestFormat: AVAudioFormat? = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])
    guard let format = bestFormat else { return false }
    let results = Task { [weak self] in
      do {
        for try await result in transcriber.results {
          guard result.isFinal else { continue }
          let text = String(result.text.characters)
          self?.onResult?(text, token)
        }
      } catch {
        // The stream ends with the window.
      }
    }
    let (sequence, continuation) = AsyncStream<AnalyzerInput>.makeStream()
    do {
      try await analyzer.start(inputSequence: sequence)
    } catch {
      results.cancel()
      return false
    }
    resultsTask = results
    analyzerBox = analyzer
    lock.lock()
    self.target = format
    self.builderBox = continuation
    lock.unlock()
    return true
  }

  /// The audio this window heard (the last `maxSeconds` of it) as a 16 kHz mono WAV, base64 — and how
  /// loud the loudest and the quietest tenth of a second IN THAT STRETCH were, so the phone can skip
  /// sending a stretch of room noise. Nil when `token` is not the window the clip belongs to.
  func clip(token: Int, maxSeconds: Double) -> [String: Any]? {
    lock.lock()
    guard token == clipToken, !clipData.isEmpty else {
      lock.unlock()
      return nil
    }
    let maxBytes = Int(HushEar.clipRate * max(0.1, maxSeconds)) * 2
    let pcm = clipData.count > maxBytes ? Data(clipData.suffix(maxBytes)) : Data(clipData)
    lock.unlock()
    let (peak, floor) = HushEar.loudness(pcm)
    return [
      "wav": HushEar.wav(pcm: pcm, rate: Int(HushEar.clipRate)).base64EncodedString(),
      "seconds": Double(pcm.count) / 2 / HushEar.clipRate,
      "peakDb": HushEar.decibels(peak),
      "floorDb": HushEar.decibels(floor),
    ]
  }

  /// The loudest and the quietest tenth of a second in 16-bit mono PCM, as RMS (0…1).
  static func loudness(_ pcm: Data) -> (Float, Float) {
    let frame = Int(HushEar.clipRate / 10)
    var peak: Float = 0
    var floor: Float = 1
    pcm.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
      let samples = raw.bindMemory(to: Int16.self)
      var i = 0
      while i + frame <= samples.count {
        var sum: Float = 0
        for j in i..<(i + frame) {
          let v = Float(samples[j]) / 32768
          sum += v * v
        }
        let rms = (sum / Float(frame)).squareRoot()
        if rms > peak { peak = rms }
        if rms < floor { floor = rms }
        i += frame
      }
    }
    return (peak, floor)
  }

  static func decibels(_ v: Float) -> Double {
    return Double(20 * log10(max(v, 0.000_001)))
  }

  /// 16-bit mono PCM in a RIFF header.
  static func wav(pcm: Data, rate: Int) -> Data {
    var data = Data()
    func put(_ s: String) { data.append(contentsOf: Array(s.utf8)) }
    func put32(_ v: UInt32) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 4)) }
    func put16(_ v: UInt16) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 2)) }
    put("RIFF"); put32(UInt32(36 + pcm.count)); put("WAVE")
    put("fmt "); put32(16); put16(1); put16(1); put32(UInt32(rate)); put32(UInt32(rate * 2)); put16(2); put16(16)
    put("data"); put32(UInt32(pcm.count))
    data.append(pcm)
    return data
  }

  /// Close the window: nothing more is kept (what was kept stays readable until the next window),
  /// and what she was mid-way through saying is finalized by Apple's recognizer and still reported.
  func stopListening() async {
    lock.lock()
    let b = builderBox
    builderBox = nil
    target = nil
    capturing = false
    lock.unlock()
    let a = analyzerBox
    analyzerBox = nil
    recognizing = false
    if #available(iOS 26.0, *) {
      (b as? AsyncStream<AnalyzerInput>.Continuation)?.finish()
      if let analyzer = a as? SpeechAnalyzer {
        try? await analyzer.finalizeAndFinishThroughEndOfInput()
      }
    }
    if let t = resultsTask {
      resultsTask = nil
      _ = await t.value
    }
  }

  // MARK: - The tap (real-time audio thread)

  private func feed(_ buffer: AVAudioPCMBuffer) {
    lock.lock()
    let keep = capturing
    let b = builderBox
    let t = target
    lock.unlock()
    guard keep else { return }
    appendClip(buffer)
    if #available(iOS 26.0, *) {
      guard let continuation = b as? AsyncStream<AnalyzerInput>.Continuation, let t else { return }
      guard let converted = convert(buffer, to: t) else { return }
      continuation.yield(AnalyzerInput(buffer: converted))
    }
  }

  /// The window's audio, kept for the strong ear: 16 kHz mono 16-bit, the last `clipMaxSeconds`.
  private func appendClip(_ buffer: AVAudioPCMBuffer) {
    guard let format = clipFormat, let out = convertClip(buffer, to: format), let channels = out.int16ChannelData else { return }
    let frames = Int(out.frameLength)
    guard frames > 0 else { return }
    let bytes = Data(bytes: channels[0], count: frames * 2)
    let cap = Int(HushEar.clipRate * HushEar.clipMaxSeconds) * 2
    lock.lock()
    clipData.append(bytes)
    // Trimmed a second at a time (a copy per buffer would be a copy twelve times a second).
    if clipData.count > cap + Int(HushEar.clipRate) * 2 { clipData = Data(clipData.suffix(cap)) }
    lock.unlock()
  }

  /// The clip's own converter — kept apart from the analyzer's, whose target format differs.
  private func convertClip(_ buffer: AVAudioPCMBuffer, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
    let inputFormat = buffer.format
    if clipConverter == nil || clipConverter?.inputFormat != inputFormat || clipConverter?.outputFormat != format {
      clipConverter = AVAudioConverter(from: inputFormat, to: format)
      clipConverter?.primeMethod = .none
    }
    guard let converter = clipConverter else { return nil }
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

  /// The microphone's format is the hardware's; the analyzer's is its own. Converted — or copied,
  /// because the tap's storage is reused after the callback returns.
  private func convert(_ buffer: AVAudioPCMBuffer, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
    let inputFormat = buffer.format
    if inputFormat == format {
      return buffer.copy() as? AVAudioPCMBuffer
    }
    if converter == nil || converter?.inputFormat != inputFormat || converter?.outputFormat != format {
      converter = AVAudioConverter(from: inputFormat, to: format)
      converter?.primeMethod = .none
    }
    guard let converter else { return nil }
    let ratio = converter.outputFormat.sampleRate / converter.inputFormat.sampleRate
    let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up))
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
}

/// AVAudioConverter pulls its input through a @Sendable block; the one buffer is handed over once.
/// (Shared with the measurement's ear, `HushProcessedEar.swift`.)
final class OneShotInput: @unchecked Sendable {
  private let lock = NSLock()
  private var buffer: AVAudioPCMBuffer?

  init(_ buffer: AVAudioPCMBuffer) { self.buffer = buffer }

  func take() -> AVAudioPCMBuffer? {
    lock.lock()
    defer { lock.unlock() }
    let next = buffer
    buffer = nil
    return next
  }
}
