import AVFoundation
import ExpoModulesCore
import Foundation

// ════ THE AUDIO SESSION UNDER THE VOICE COACH (docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md §4) ════
//
// Four jobs, and no opinions:
//
//   · `headsetConnected` / `onRouteChange` — the voice is on ONLY with earbuds (spec §0.1). The
//     route's outputs answer it (Bluetooth A2DP/HFP/LE, wired headphones, USB audio); the speaker
//     is not a headset. ⛔ READ ON A CONFIGURED SESSION (2026-09-09, *"הקול באימון לא עובד"*): before
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

  public func definition() -> ModuleDefinition {
    Name("HushVoiceAudio")
    Events("onRouteChange")

    OnCreate {
      self.routeObserver = NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
      ) { [weak self] _ in
        guard let self else { return }
        self.sendEvent("onRouteChange", ["connected": Self.headsetConnected()])
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
        try? Self.setPlayback(duck: false)
        if let p = self.keepAlive, !p.isPlaying { p.play() }
      }
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

    /// Open the session for a workout with the voice on: playback under the silent switch, mixed
    /// with her music, and a looping second of silence so the process stays awake in the pocket.
    AsyncFunction("startKeepAlive") { () in
      self.keepAliveWanted = true
      try Self.setPlayback(duck: false)
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
      try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    /// Before a line is spoken: her music down to a quarter for as long as the session is active.
    AsyncFunction("duck") { () in
      try Self.setPlayback(duck: true)
      if self.keepAliveWanted, let p = self.keepAlive, !p.isPlaying { p.play() }
    }

    /// After a line, or after a listening window: release the duck (deactivate, which is the only
    /// way iOS lets go of it), then restore playback-mixed and the keep-alive.
    AsyncFunction("unduck") { () in
      let session = AVAudioSession.sharedInstance()
      self.keepAlive?.pause()
      try? session.setActive(false, options: [.notifyOthersOnDeactivation])
      try Self.setPlayback(duck: false)
      if self.keepAliveWanted, let p = self.keepAlive { p.play() }
    }

    /// The rest-over sound: half a second, generated, at the level of the music.
    AsyncFunction("playChime") { () in
      try Self.setPlayback(duck: true)
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

  static func headsetConnected() -> Bool {
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
    return outputs.contains { o in
      switch o.portType {
      case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .headphones, .usbAudio:
        return true
      default:
        return false
      }
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
