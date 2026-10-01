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
// runs for the workout. Nothing is transcribed until the conductor asks a question: only then is
// the microphone's audio handed to SpeechAnalyzer (iOS 26, on-device, he_IL supported), and only
// until the window closes. The wiring follows the verified shape of
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

@available(iOS 26.0, *)
final class HushEar {
  enum Source: String {
    case headset
    case phone
  }

  private let engine = AVAudioEngine()
  private let lock = NSLock()
  private var builder: AsyncStream<AnalyzerInput>.Continuation?
  private var target: AVAudioFormat?
  private var token: Int = 0
  private var converter: AVAudioConverter?
  private var analyzer: SpeechAnalyzer?
  private var resultsTask: Task<Void, Never>?
  private var configObserver: NSObjectProtocol?

  private(set) var running = false
  private(set) var source: Source = .headset

  // ── The window's own audio, for the second ear (2026-09-27) ─────────────────────────────────────
  // While a window listens, what the microphone hears is also kept as 16 kHz mono 16-bit PCM — the
  // shape a cloud recognizer takes — so an answer the on-device model missed or mis-heard can be
  // heard again by a stronger one. Capped at the last `clipMaxSeconds`; cleared when the next
  // window opens; read by `clip(token:)` after the window ends. Never written anywhere but memory.
  static let clipRate: Double = 16_000
  static let clipMaxSeconds: Double = 20
  private let clipFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: HushEar.clipRate, channels: 1, interleaved: true)
  private var clipConverter: AVAudioConverter?
  private var clipData = Data()
  private var clipToken: Int = -1

  /// A final sentence heard inside a window, with the window's token.
  var onResult: ((String, Int) -> Void)?
  /// The engine stopped or failed to restart — the JS side falls back to the screen-on ear.
  var onState: (([String: Any]) -> Void)?

  // MARK: - Capability

  static func supportedLocale(_ identifier: String) async -> Locale? {
    await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: identifier))
  }

  /// The on-device model for the locale, downloaded on first use (needs a network once).
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

  func open(source: Source) throws {
    if running && self.source == source { return }
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
    let b = builder
    builder = nil
    target = nil
    clipData = Data()
    clipToken = -1
    lock.unlock()
    b?.finish()
    if let a = analyzer {
      analyzer = nil
      Task { try? await a.finalizeAndFinishThroughEndOfInput() }
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

  /// Start handing the microphone to the recognizer. Results carry `token`, so a late sentence from
  /// a window already closed is never taken for the next one's answer.
  func listen(localeIdentifier: String, token: Int) async throws {
    await stopListening()
    guard running else {
      throw NSError(domain: "HushEar", code: 2, userInfo: [NSLocalizedDescriptionKey: "ear not running"])
    }
    guard let locale = await Self.supportedLocale(localeIdentifier) else {
      throw NSError(domain: "HushEar", code: 3, userInfo: [NSLocalizedDescriptionKey: "locale not supported"])
    }
    let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [], attributeOptions: [])
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    let bestFormat: AVAudioFormat? = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])
    guard let format = bestFormat else {
      throw NSError(domain: "HushEar", code: 4, userInfo: [NSLocalizedDescriptionKey: "no analyzer format"])
    }
    resultsTask = Task { [weak self] in
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
    try await analyzer.start(inputSequence: sequence)
    self.analyzer = analyzer
    lock.lock()
    self.token = token
    self.target = format
    self.builder = continuation
    // A new window, a new clip: nothing of the last answer is ever sent as this one's.
    self.clipData = Data()
    self.clipToken = token
    lock.unlock()
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
    let maxBytes = Int(HushEar.clipRate * max(0.5, maxSeconds)) * 2
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
  private static func loudness(_ pcm: Data) -> (Float, Float) {
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

  private static func decibels(_ v: Float) -> Double {
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

  /// Stop handing audio over; what she was mid-way through saying is finalized and still reported.
  func stopListening() async {
    lock.lock()
    let b = builder
    builder = nil
    target = nil
    lock.unlock()
    b?.finish()
    if let a = analyzer {
      analyzer = nil
      try? await a.finalizeAndFinishThroughEndOfInput()
    }
    if let t = resultsTask {
      resultsTask = nil
      _ = await t.value
    }
  }

  // MARK: - The tap (real-time audio thread)

  private func feed(_ buffer: AVAudioPCMBuffer) {
    lock.lock()
    let b = builder
    let t = target
    lock.unlock()
    guard let b, let t else { return }
    appendClip(buffer)
    guard let converted = convert(buffer, to: t) else { return }
    b.yield(AnalyzerInput(buffer: converted))
  }

  /// The window's audio, kept for the second ear: 16 kHz mono 16-bit, the last `clipMaxSeconds`.
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
private final class OneShotInput: @unchecked Sendable {
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
