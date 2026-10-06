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

/// The natural voice's line ended — once, whichever way (finished, failed to decode, stopped).
final class ClipDone: NSObject, AVAudioPlayerDelegate {
  private var callback: ((Bool) -> Void)?

  init(_ callback: @escaping (Bool) -> Void) {
    self.callback = callback
  }

  func fire(_ ok: Bool) {
    let c = callback
    callback = nil
    c?(ok)
  }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    fire(flag)
  }

  func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    fire(false)
  }
}

public class HushVoiceAudioModule: Module {
  private var keepAlive: AVAudioPlayer?
  private var chime: AVAudioPlayer?
  /// The natural voice's current line and its one-shot ending (main queue only).
  private var clipPlayer: AVAudioPlayer?
  private var clipDone: ClipDone?
  private var keepAliveWanted = false
  private var routeObserver: NSObjectProtocol?
  private var interruptionObserver: NSObjectProtocol?
  /// The pocket ear (`HushEar`): the workout's microphone and each window's audio, on every iOS
  /// this app runs on — only Apple's on-device recognizer inside it asks for iOS 26 (2026-10-05).
  private var ear: HushEar?
  /// ⛔ OFF, AND ONLY THE MEASUREMENT TURNS IT ON (2026-10-06): `.duckOthers` put on and off the live
  /// session while the pocket ear runs. See `applySession`.
  private var duckUnderEar = false
  /// The measurement's ear (`HushProcessedEar`): voice processing, opened by the profile only.
  private var processedEar: HushProcessedEar?

  /// A microphone is held — the workout's, or the measurement's. Either way the session is never
  /// deactivated or moved to `.playback` under it.
  private var earRunning: Bool {
    return (ear?.running ?? false) || (processedEar?.running ?? false)
  }

  private func makeEar() -> HushEar {
    let ear = HushEar()
    ear.onResult = { [weak self] text, token in
      self?.sendEvent("onEarResult", ["text": text, "token": token])
    }
    ear.onState = { [weak self] state in
      self?.sendEvent("onEarState", state)
    }
    self.ear = ear
    return ear
  }

  public func definition() -> ModuleDefinition {
    Name("HushVoiceAudio")
    Events("onRouteChange", "onEarResult", "onEarState", "onInterruption")

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
      // ⛔ And the voice is TOLD (2026-09-27, spec §3.9): a question dropped by a call is asked once
      // after it, and nothing is said over the call — until today JS never heard of it.
      self.interruptionObserver = NotificationCenter.default.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
      ) { [weak self] note in
        guard let self,
              let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        // ⛔ "YOU WERE SUSPENDED" IS NOT A CALL (2026-10-06). When iOS has suspended the app it says
        // so, on the way back, as an interruption that BEGAN with the reason `appWasSuspended` — and
        // never sends its end. Nobody took the audio: told to JS as a call, the coach went silent
        // waiting for an "ended" that does not exist. The session is simply taken again, here.
        if type == .began,
           let rawReason = note.userInfo?[AVAudioSessionInterruptionReasonKey] as? UInt,
           AVAudioSession.InterruptionReason(rawValue: rawReason) == .appWasSuspended {
          try? self.applySession(duck: false)
          self.ear?.resume()
          if self.keepAliveWanted, let p = self.keepAlive, !p.isPlaying { p.play() }
          // Written down on the phone's side (`voiceJournal`): it is the one trace a sleep leaves.
          self.sendEvent("onEarState", ["running": self.ear?.alive ?? false, "error": "app was suspended"])
          return
        }
        self.sendEvent("onInterruption", ["began": type == .began])
        guard type == .ended, self.keepAliveWanted else { return }
        try? self.applySession(duck: false)
        // The interruption stopped the microphone's engine too, and nothing else starts it again.
        self.ear?.resume()
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
    /// the background). Null when it runs; the reason when it does not. Any iOS: the strong ear
    /// hears through this microphone whether or not the phone has a recognizer of its own.
    AsyncFunction("earOpen") { (source: String) async -> String? in
      // A workout's microphone always wins over a measurement left open.
      if let processed = self.processedEar {
        self.processedEar = nil
        processed.close()
      }
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
      guard let ear = self.ear, ear.running else { return }
      ear.close()
      if self.keepAliveWanted {
        try? Self.setPlayback(duck: false)
        if let p = self.keepAlive, !p.isPlaying { p.play() }
      } else {
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
      }
    }

    /// What the phone is told: the microphone is really running — not only meant to be (a call can
    /// stop it; see `HushEar.resume`). The session's own decisions above keep reading the intent.
    Function("earRunning") { () -> Bool in
      self.ear?.alive ?? false
    }

    // ── ⛔ The measurement's steps (profile only — `src/platform/voice/voiceMeasure.ts`) ──────────
    // Three ways the coach might be heard over her music while the microphone is held, each asked of
    // the phone itself. None of them is called by a workout.

    /// Step: `duck`/`unduck` put `.duckOthers` on and off the LIVE session while the pocket ear runs.
    Function("setDuckUnderEar") { (on: Bool) in
      self.duckUnderEar = on
    }

    /// Step: the running engine moved to the other microphone — the earbuds', and back
    /// (`HushEar.reroute`). Null when it records there; otherwise why it does not.
    AsyncFunction("earReroute") { (source: String, promise: Promise) in
      guard let ear = self.ear, ear.running else {
        promise.resolve("ear not running")
        return
      }
      ear.reroute(to: HushEar.Source(rawValue: source) ?? .phone) { error in
        promise.resolve(error)
      }
    }

    /// The session as iOS has it this instant: ports, sample rate, mode, options, other audio.
    Function("sessionReport") { () -> [String: Any] in
      HushProcessedEar.report()
    }

    /// Step: the phone's microphone opened WITH voice processing — ON GLASS ONLY. Null when it runs.
    AsyncFunction("earProcessedOpen") { () -> String? in
      if let ear = self.ear, ear.running { return "the workout holds the microphone" }
      let processed = self.processedEar ?? HushProcessedEar()
      self.processedEar = processed
      do {
        try processed.open()
        if self.keepAliveWanted, let p = self.keepAlive, !p.isPlaying { p.play() }
        return nil
      } catch {
        return error.localizedDescription
      }
    }

    AsyncFunction("earProcessedClose") { () in
      guard let processed = self.processedEar else { return }
      self.processedEar = nil
      processed.close()
      if self.keepAliveWanted {
        try? Self.setPlayback(duck: false)
        if let p = self.keepAlive, !p.isPlaying { p.play() }
      } else {
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
      }
    }

    Function("earProcessedAlive") { () -> Bool in
      self.processedEar?.alive ?? false
    }

    /// How far everything that is not the processed voice is lowered (0 default, 10, 20, 30 most),
    /// and whether only while someone speaks. "ok", or why not.
    Function("earProcessedDuck") { (level: Int, advanced: Bool) -> String in
      self.processedEar?.setDuck(level: level, advanced: advanced) ?? "not open"
    }

    /// One cached line played through the processed output. True when it played to its end.
    AsyncFunction("earProcessedSay") { (path: String, promise: Promise) in
      DispatchQueue.main.async {
        guard let processed = self.processedEar else {
          promise.resolve(false)
          return
        }
        let url: URL = path.hasPrefix("file://") ? (URL(string: path) ?? URL(fileURLWithPath: path)) : URL(fileURLWithPath: path)
        processed.speak(url: url) { ok in
          promise.resolve(ok)
        }
      }
    }

    /// From here the processed microphone's audio is kept, until `earProcessedClip` reads it.
    Function("earProcessedKeep") { () in
      if let processed = self.processedEar { processed.keep() }
    }

    /// What it heard since (16 kHz mono WAV, base64, and its loudest and quietest moments) — nil when nothing.
    AsyncFunction("earProcessedClip") { () -> [String: Any]? in
      guard let processed = self.processedEar else { return nil }
      return processed.clip()
    }

    Function("earProcessedPreferPhoneMic") { () -> String in
      self.processedEar?.preferPhoneMic() ?? "not open"
    }

    Function("earProcessedRestate") { () -> String in
      self.processedEar?.restate() ?? "not open"
    }

    /// Is Apple's on-device recognizer listening to the open window too? (False is not a fault: the
    /// window's audio is kept either way, and the strong ear hears it.)
    Function("earRecognizing") { () -> Bool in
      self.ear?.recognizing ?? false
    }

    /// ⛔ AN INTERRUPTION THAT NEVER SAID IT ENDED (2026-10-05). iOS does not promise an "ended" for
    /// every "began", and the voice says nothing while one is on — one missed "ended" and the coach
    /// was mute for the rest of the workout. Asked by the phone when she is back on glass: the
    /// session is taken again, the microphone's engine restarted, the silent loop resumed. True
    /// when the audio is ours; false while a call still holds it (activating then fails).
    AsyncFunction("recoverSession") { () -> Bool in
      do {
        try self.applySession(duck: false)
      } catch {
        return false
      }
      self.ear?.resume()
      if self.keepAliveWanted, let p = self.keepAlive, !p.isPlaying { p.play() }
      return true
    }

    /// Open a window: keep the microphone's audio until `earStopListening`, and hand it to Apple's
    /// recognizer where the phone has one. Null when the window is open.
    AsyncFunction("earListen") { (locale: String, token: Int) async -> String? in
      guard let ear = self.ear else { return "ear not open" }
      do {
        try await ear.listen(localeIdentifier: locale, token: token)
        return nil
      } catch {
        return error.localizedDescription
      }
    }

    /// Stop listening; resolves after the last sentence she was saying has been reported.
    AsyncFunction("earStopListening") { () async in
      guard let ear = self.ear else { return }
      await ear.stopListening()
    }

    /// The window's audio (16 kHz mono WAV, base64) for the second ear — nil when it is not that
    /// window's, or the ear does not run (2026-09-27, `platform/voice/cloudEar`).
    AsyncFunction("earClip") { (token: Int, maxSeconds: Double) -> [String: Any]? in
      guard let ear = self.ear else { return nil }
      return ear.clip(token: token, maxSeconds: maxSeconds)
    }

    /// ════ THE NATURAL VOICE (2026-09-27, `platform/voice/neuralVoice`) ════
    /// A cached line played on the session the coach already holds (ducked by `duck`, like Carmit).
    /// Resolves true when it played to the end, false when it could not start, failed, or was
    /// stopped. Everything runs on the main queue, where the player's delegate calls back.
    AsyncFunction("playFile") { (path: String, promise: Promise) in
      DispatchQueue.main.async {
        self.finishClip(false)
        let url: URL = path.hasPrefix("file://") ? (URL(string: path) ?? URL(fileURLWithPath: path)) : URL(fileURLWithPath: path)
        do {
          let player = try AVAudioPlayer(contentsOf: url)
          let done = ClipDone { ok in promise.resolve(ok) }
          player.delegate = done
          player.volume = 1.0
          player.prepareToPlay()
          self.clipPlayer = player
          self.clipDone = done
          if !player.play() { self.finishClip(false) }
        } catch {
          promise.resolve(false)
        }
      }
    }

    /// Earbuds out, a call, the moment passed: the line stops now, and its promise resolves false.
    Function("stopFile") { () in
      DispatchQueue.main.async { self.finishClip(false) }
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
    /// ⚠️ Ducking begins when a session ACTIVATES (2026-09-27, the output audit) — the keep-alive has
    /// kept ours active since the first set, so the option alone could land on a live session and
    /// duck nothing. A session not already ducking is deactivated first (without telling her music,
    /// which plays on), then activated with the duck.
    AsyncFunction("duck") { () in
      let session = AVAudioSession.sharedInstance()
      if !self.earRunning && !session.categoryOptions.contains(.duckOthers) {
        self.keepAlive?.pause()
        try? session.setActive(false)
      }
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
      // ⛔ THE LOOP COMES BACK EVEN IF THE CATEGORY DOES NOT (2026-09-27, the output audit). A failed
      // `setPlayback` (a call or Siri holding the audio) used to skip the `play()` below: the session
      // stayed inactive, the loop paused, and iOS put the process to sleep in her pocket — the clock,
      // the voice and the lock-screen buttons with it. `play()` also activates the session.
      defer { if self.keepAliveWanted, let p = self.keepAlive, !p.isPlaying { p.play() } }
      try Self.setPlayback(duck: false)
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

  // MARK: - The natural voice's player (main queue only)

  private func finishClip(_ ok: Bool) {
    let done = clipDone
    clipDone = nil
    clipPlayer?.stop()
    clipPlayer = nil
    done?.fire(ok)
  }

  // MARK: - The session

  /// Every session change goes through here: playback-mixed normally, record-and-play with the
  /// ear's own options while the pocket ear runs (leaving `.playAndRecord` would stop its engine).
  ///
  /// ⛔ UNDER THE POCKET EAR THE SESSION IS NEVER DEACTIVATED — AND SO HER MUSIC IS NOT LOWERED.
  /// Deactivating here would stop the microphone, and a microphone stopped in a pocket cannot be
  /// started again. Apple's page on `.duckOthers`: "Ducking begins when you activate your app's audio
  /// session and ends when you deactivate the session." So a workout that holds the microphone speaks
  /// over her music at full volume (founder, 2026-10-06: *"המתאמן שומע בפול ווליום את המוזיקה ולא
  /// שומעים את המאמן"*) — the conflict the measurement exists to find a way out of.
  ///
  /// `duckUnderEar` puts the option on and off the LIVE session instead. It is off; only the
  /// profile's measurement turns it on, for one step, to hear what a phone does with it. For one
  /// afternoon (2026-10-06) it was the workout's default, on a guess.
  private func applySession(duck: Bool) throws {
    if let ear = self.ear, ear.running {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .default, options: HushEar.sessionOptions(ear.source, duck: duck && self.duckUnderEar))
      ear.ducking = duck && self.duckUnderEar
      try session.setActive(true)
      return
    }
    if let processed = self.processedEar, processed.running {
      // Voice processing has shaped this session (its mode, its route); it is kept active, never restated.
      try AVAudioSession.sharedInstance().setActive(true)
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
