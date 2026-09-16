import AVFoundation
import ExpoModulesCore
import Foundation

// ════ THE AUDIO SESSION UNDER THE VOICE COACH (docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md §4) ════
//
// Four jobs, and no opinions:
//
//   · `headsetConnected` / `onRouteChange` — the voice is on ONLY with earbuds (spec §0.1). The
//     route's outputs answer it: anything but the phone's own speaker or receiver (see the function). ⛔ READ ON A CONFIGURED SESSION (2026-09-09, *"הקול באימון לא עובד"*): before
//     this process has ever set a category, `currentRoute` can still describe the default route —
//     the speaker — with earbuds in, and no route-change notification follows, because nothing
//     changes. A gate read once at mount from that answer never opened. So the read first makes
//     sure the session is ours (`.playback` + `.mixWithOthers`, active) unless a listening window
//     already owns it (`.playAndRecord` — switching under the recognizer would end the recording).
//   · `startKeepAlive` / `stopKeepAlive` — a looping second of silence under `.playback` +
//     `.mixWithOthers`, with the `audio` background mode, is what keeps the process — and so the
//     JS clock, the lock-intent listener and the Live Activity's App Intents — awake with the
//     screen off. Her music keeps playing over it untouched. Since 2026-09-09 it runs for the WHOLE
//     workout, voice or no voice (the session store starts it with the Live Activity): a tap on
//     the lock screen's steppers is an intent iOS performs in this process, and a suspended
//     process answered it late. Stopped the moment the workout ends.
//   · `duck` / `unduck` — while a line is spoken the category carries `.duckOthers` (her music to
//     a quarter); ducking is released only by deactivating the session, so `unduck` deactivates
//     with `.notifyOthersOnDeactivation`, restores `.mixWithOthers`, and resumes the keep-alive.
//     The same call restores the session after a listening window, which `expo-speech-recognition`
//     had switched to `.playAndRecord`.
//   · `playChime` — the rest-over sound: half a second of a generated tone at the music's own
//     level, never a vibration (spec §3.6). Generated in memory so the pod ships no asset.
//
// `.playback` plays under the ring/silent switch — exactly how her music does — which is the
// whole answer to "what if the phone is on silent" (spec, the first fact).

public class HushVoiceAudioModule: Module {
  private var keepAlive: AVAudioPlayer?
  private var chime: AVAudioPlayer?
  private var keepAliveWanted = false
  private var routeObserver: NSObjectProtocol?
  private var interruptionObserver: NSObjectProtocol?
  /// The pocket ear (`HushEar`, iOS 26). Held untyped: a stored property cannot be marked iOS 26.
  private var earBox: AnyObject?

  @available(iOS 26.0, *)
  private var ear: HushEar? { earBox as? HushEar }

  private var earRunning: Bool {
    if #available(iOS 26.0, *) { return ear?.running ?? false }
    return false
  }

  @available(iOS 26.0, *)
  private func makeEar() -> HushEar {
    let ear = HushEar()
    ear.onResult = { [weak self] text, token in
      self?.sendEvent("onEarResult", ["text": text, "token": token])
    }
    ear.onState = { [weak self] state in
      self?.sendEvent("onEarState", state)
    }
    earBox = ear
    return ear
  }

  public func definition() -> ModuleDefinition {
    Name("HushVoiceAudio")
    Events("onRouteChange", "onEarResult", "onEarState")

    OnCreate {
      self.routeObserver = NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
      ) { [weak self] note in
        guard let self else { return }
        // ⛔ ONLY A DEVICE COMING OR GOING IS NEWS (2026-09-15, *"חבר אותן והוא מתחיל" — with them in*).
        // This app changes its own category all workout long — the keep-alive, every duck and
        // unduck, every listening window — and each change posts a route change too. Read between a
        // `setCategory` and a `setActive`, the route could answer "speaker" with earbuds in, and that
        // one answer shut the gate (or silenced a coach mid-line). The JS side re-reads on this event
        // and confirms a departure before believing it; here, the app's own switches say nothing.
        let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
        let reason = raw.flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
        if reason == .newDeviceAvailable || reason == .oldDeviceUnavailable {
          self.sendEvent("onRouteChange", ["connected": Self.headsetConnected()])
        }
        // A route change (earbuds out, then in) can stop the keep-alive player; put it back.
        if self.keepAliveWanted, let p = self.keepAlive, !p.isPlaying { p.play() }
      }
      // A phone call, Siri, an alarm: the interruption stops the keep-alive player, and when it
      // ends the process would go to sleep in the pocket. Put the loop back the moment it ends.
      self.interruptionObserver = NotificationCenter.default.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
      ) { [weak self] note in
        guard let self, self.keepAliveWanted,
              let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
        try? self.applySession(duck: false)
        if let p = self.keepAlive, !p.isPlaying { p.play() }
      }
    }

    // ── The pocket ear (HushEar.swift) ─────────────────────────────────────────────────────────

    /// Can this phone transcribe the locale on-device (iOS 26 SpeechAnalyzer)?
    AsyncFunction("earAvailable") { (locale: String) async -> Bool in
      guard #available(iOS 26.0, *) else { return false }
      return await HushEar.supportedLocale(locale) != nil
    }

    /// The locale's model installed (downloaded on first use). False when it could not be.
    AsyncFunction("earPrepare") { (locale: String) async -> Bool in
      guard #available(iOS 26.0, *) else { return false }
      return (try? await HushEar.ensureModel(locale)) ?? false
    }

    /// Open the microphone for the workout — ON GLASS ONLY (iOS refuses a recording started from
    /// the background). Null when it runs; the reason when it does not.
    AsyncFunction("earOpen") { (source: String) async -> String? in
      guard #available(iOS 26.0, *) else { return "requires iOS 26" }
      let ear = self.ear ?? self.makeEar()
      do {
        try ear.open(source: HushEar.Source(rawValue: source) ?? .headset)
        if self.keepAliveWanted, let p = self.keepAlive, !p.isPlaying { p.play() }
        return nil
      } catch {
        return error.localizedDescription
      }
    }

    AsyncFunction("earClose") { () in
      guard #available(iOS 26.0, *), let ear = self.ear, ear.running else { return }
      ear.close()
      if self.keepAliveWanted {
        try? Self.setPlayback(duck: false)
        if let p = self.keepAlive, !p.isPlaying { p.play() }
      } else {
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
      }
    }

    Function("earRunning") { () -> Bool in
      self.earRunning
    }

    /// Hand the microphone to the recognizer until `earStopListening`. Null when listening.
    AsyncFunction("earListen") { (locale: String, token: Int) async -> String? in
      guard #available(iOS 26.0, *), let ear = self.ear else { return "ear not open" }
      do {
        try await ear.listen(localeIdentifier: locale, token: token)
        return nil
      } catch {
        return error.localizedDescription
      }
    }

    /// Stop listening; resolves after the last sentence she was saying has been reported.
    AsyncFunction("earStopListening") { () async in
      guard #available(iOS 26.0, *), let ear = self.ear else { return }
      await ear.stopListening()
    }

    OnDestroy {
      if let o = self.routeObserver { NotificationCenter.default.removeObserver(o) }
      if let o = self.interruptionObserver { NotificationCenter.default.removeObserver(o) }
      self.keepAlive?.stop()
      self.keepAlive = nil
    }

    Function("headsetConnected") { () -> Bool in
      Self.ensureOurSession()
      return Self.headsetConnected()
    }

    /// What the route actually is, in words — for the profile's voice row and the gate's telemetry.
    /// The gate has been reported shut with earbuds in three times; this is the reading that says why.
    Function("routeInfo") { () -> [String: Any] in
      Self.ensureOurSession()
      let session = AVAudioSession.sharedInstance()
      return [
        "outputs": session.currentRoute.outputs.map { ["type": $0.portType.rawValue, "name": $0.portName] },
        "category": session.category.rawValue,
        "mode": session.mode.rawValue,
      ]
    }

    /// ⛔ THE MICROPHONE'S ROUTE IS TAKEN BEFORE THE RECOGNIZER STARTS (2026-09-15 audit).
    /// `expo-speech-recognition` sets `.playAndRecord` itself when it starts, and that switch moves
    /// Bluetooth earbuds from A2DP to HFP — a route change. The recognizer listens for route changes
    /// from the moment it starts, and when the app is not in the foreground (the phone locked in her
    /// pocket) it treats ANY route change as an interruption and ends the recognition. So every
    /// window opened from the pocket died as it opened. Here the exact same category, mode and
    /// options are set first; the caller waits for the route to settle; the recognizer's own
    /// `setCategory` then changes nothing and posts nothing.
    /// Keep in step with `LISTENING_SESSION` in `src/platform/voice/voiceCapture.ts`.
    AsyncFunction("prepareListening") { () in
      // The pocket ear already holds a record-and-play session; this is the screen-on ear's step.
      if self.earRunning { return }
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .allowBluetooth, .defaultToSpeaker])
      try session.setActive(true, options: .notifyOthersOnDeactivation)
      if self.keepAliveWanted, let p = self.keepAlive, !p.isPlaying { p.play() }
    }

    /// Open the session for a workout with the voice on: playback under the silent switch, mixed
    /// with her music, and a looping second of silence so the process stays awake in the pocket.
    AsyncFunction("startKeepAlive") { () in
      self.keepAliveWanted = true
      try self.applySession(duck: false)
      if self.keepAlive == nil {
        self.keepAlive = try AVAudioPlayer(data: Self.silentWav(seconds: 1.0))
        self.keepAlive?.numberOfLoops = -1
        self.keepAlive?.volume = 0.01
        self.keepAlive?.prepareToPlay()
      }
      self.keepAlive?.play()
    }

    AsyncFunction("stopKeepAlive") { () in
      self.keepAliveWanted = false
      self.keepAlive?.stop()
      self.keepAlive = nil
      // A running ear is its own reason to stay awake; it is closed by `earClose`, not here.
      if self.earRunning { return }
      try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    /// Before a line is spoken: her music down to a quarter for as long as the session is active.
    AsyncFunction("duck") { () in
      try self.applySession(duck: true)
      if self.keepAliveWanted, let p = self.keepAlive, !p.isPlaying { p.play() }
    }

    /// After a line, or after a listening window: release the duck (deactivate, which is the only
    /// way iOS lets go of it), then restore playback-mixed and the keep-alive.
    AsyncFunction("unduck") { () in
      // ⛔ With the pocket ear running, never deactivate: it would stop the microphone, and a
      // microphone stopped in the pocket cannot be restarted there. The duck option is dropped on
      // the live session instead (whether iOS releases the duck without a deactivation is one of the
      // things the locked-phone test is for).
      if self.earRunning {
        try self.applySession(duck: false)
        return
      }
      let session = AVAudioSession.sharedInstance()
      self.keepAlive?.pause()
      try? session.setActive(false, options: [.notifyOthersOnDeactivation])
      try Self.setPlayback(duck: false)
      if self.keepAliveWanted, let p = self.keepAlive { p.play() }
    }

    /// The rest-over sound: half a second, generated, at the level of the music.
    AsyncFunction("playChime") { () in
      try self.applySession(duck: true)
      if self.chime == nil {
        self.chime = try AVAudioPlayer(data: Self.toneWav(seconds: 0.5, hz: 880))
        self.chime?.prepareToPlay()
      }
      self.chime?.currentTime = 0
      self.chime?.volume = 0.9
      self.chime?.play()
    }
  }

  // MARK: - The session

  /// Every session change goes through here: playback-mixed normally, record-and-play with the
  /// ear's own options while the pocket ear runs (leaving `.playAndRecord` would stop its engine).
  private func applySession(duck: Bool) throws {
    if #available(iOS 26.0, *), let ear = self.ear, ear.running {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .default, options: HushEar.sessionOptions(ear.source, duck: duck))
      try session.setActive(true)
      return
    }
    try Self.setPlayback(duck: duck)
  }

  private static func setPlayback(duck: Bool) throws {
    let session = AVAudioSession.sharedInstance()
    var options: AVAudioSession.CategoryOptions = [.mixWithOthers]
    if duck { options.insert(.duckOthers) }
    try session.setCategory(.playback, mode: .default, options: options)
    try session.setActive(true)
  }

  /// The session is ours — `.playback` + `.mixWithOthers`, active — unless a listening window holds
  /// it (`.playAndRecord`) or it already is. Cheap and idempotent; see the header on `headsetConnected`.
  static func ensureOurSession() {
    let session = AVAudioSession.sharedInstance()
    if session.category == .playAndRecord { return }
    if session.category == .playback { try? session.setActive(true); return }
    try? setPlayback(duck: false)
  }

  /// ⛔ THE GATE ASKS "IS IT THE PHONE'S OWN SPEAKER?", NOT "IS IT A PORT ON MY LIST?" (2026-09-15).
  /// The list (A2DP, HFP, LE, headphones, USB) answered "no" to any output it did not name — a port
  /// type a newer iOS reports for newer earbuds would shut the gate for good, with earbuds in and no
  /// sign why. What the gate exists to prevent is one thing: the coach talking out of the phone in
  /// a gym. So any output that is not the built-in speaker or receiver opens it (earbuds, wired,
  /// a car, a Bluetooth speaker); no route at all does not.
  static func headsetConnected() -> Bool {
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
    return outputs.contains { o in
      o.portType != .builtInSpeaker && o.portType != .builtInReceiver
    }
  }

  // MARK: - Generated audio (no assets in the pod)

  /// A 16-bit mono PCM WAV of `seconds` of silence.
  private static func silentWav(seconds: Double) -> Data {
    let rate = 8000
    let frames = Int(Double(rate) * seconds)
    return wav(samples: [Int16](repeating: 0, count: frames), rate: rate)
  }

  /// A 16-bit mono PCM WAV of a sine tone with a soft attack and a linear decay — the chime.
  private static func toneWav(seconds: Double, hz: Double) -> Data {
    let rate = 22_050
    let frames = Int(Double(rate) * seconds)
    var samples = [Int16](repeating: 0, count: frames)
    for i in 0..<frames {
      let t = Double(i) / Double(rate)
      let attack = min(1.0, t / 0.02)
      let decay = 1.0 - Double(i) / Double(frames)
      let v = sin(2.0 * Double.pi * hz * t) * attack * decay * 0.6
      samples[i] = Int16(max(-1.0, min(1.0, v)) * Double(Int16.max))
    }
    return wav(samples: samples, rate: rate)
  }

  private static func wav(samples: [Int16], rate: Int) -> Data {
    var data = Data()
    let byteRate = UInt32(rate * 2)
    let dataSize = UInt32(samples.count * 2)
    func put(_ s: String) { data.append(contentsOf: Array(s.utf8)) }
    func put32(_ v: UInt32) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 4)) }
    func put16(_ v: UInt16) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 2)) }
    put("RIFF"); put32(36 + dataSize); put("WAVE")
    put("fmt "); put32(16); put16(1); put16(1); put32(UInt32(rate)); put32(byteRate); put16(2); put16(16)
    put("data"); put32(dataSize)
    samples.withUnsafeBufferPointer { buf in
      data.append(Data(buffer: buf))
    }
    return data
  }
}
