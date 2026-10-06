/**
 * The audio session under the voice coach — the JS side of `modules/hush-voice-audio`.
 *
 * Optional native module, resolved exactly as the Live Activity and the ear are: present in a
 * dev-client / store build, absent in Expo Go, on the web and under jest — and absent means no
 * headset (so no voice), and every call a resolved no-op. See the Swift file for what each does.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/** The route in words: each output's port type and name, and the session's category and mode. */
export interface RouteInfo {
  outputs: { type: string; name: string }[];
  category: string;
  mode: string;
}

interface AudioModule {
  headsetConnected(): boolean;
  startKeepAlive(): Promise<void>;
  stopKeepAlive(): Promise<void>;
  duck(): Promise<void>;
  unduck(): Promise<void>;
  playChime(): Promise<void>;
  prepareListening(): Promise<void>;
  routeInfo(): RouteInfo;
  earAvailable?(locale: string): Promise<boolean>;
  earPrepare?(locale: string): Promise<boolean>;
  earOpen?(source: EarSource): Promise<string | null>;
  earClose?(): Promise<void>;
  earRunning?(): boolean;
  earRecognizing?(): boolean;
  earListen?(locale: string, token: number): Promise<string | null>;
  earStopListening?(): Promise<void>;
  earClip?(token: number, maxSeconds: number): Promise<EarClip | null>;
  playFile?(path: string): Promise<boolean>;
  stopFile?(): void;
  recoverSession?(): Promise<boolean>;
  earReroute?(source: EarSource): Promise<string | null>;
  setDuckUnderEar?(on: boolean): void;
  sessionReport?(): SessionReport;
  earProcessedOpen?(): Promise<string | null>;
  earProcessedClose?(): Promise<void>;
  earProcessedAlive?(): boolean;
  earProcessedDuck?(level: number, advanced: boolean): string;
  earProcessedSay?(path: string): Promise<boolean>;
  earProcessedKeep?(): void;
  earProcessedClip?(): Promise<EarClip | null>;
  earProcessedPreferPhoneMic?(): string;
  earProcessedRestate?(): string;
  addListener(event: 'onRouteChange', cb: (e: { connected: boolean }) => void): { remove(): void };
  addListener(event: 'onEarResult', cb: (e: { text: string; token: number }) => void): { remove(): void };
  addListener(event: 'onEarState', cb: (e: { running: boolean; error?: string; restarted?: boolean }) => void): { remove(): void };
  addListener(event: 'onInterruption', cb: (e: { began: boolean }) => void): { remove(): void };
}

/**
 * ⛔ THE MUSIC IS NOT PUMPED (2026-09-27, the output audit). Every line ended with an unduck and the
 * next line began with a duck — down, up, down within a tenth of a second, and on earbuds that are
 * listening each of those is a switch of Bluetooth profile, a drop-out she hears. An unduck now
 * waits this long, and a duck, a chime or a listening window that comes first simply keeps the duck.
 * The call resolves at once: nothing that awaits it needs the music back before it goes on.
 */
const UNDUCK_AFTER_MS = 700;
let pendingUnduck: ReturnType<typeof setTimeout> | null = null;
const keepDuck = () => {
  if (pendingUnduck) clearTimeout(pendingUnduck);
  pendingUnduck = null;
};

const native: AudioModule | null =
  Platform.OS === 'ios' ? requireOptionalNativeModule<AudioModule>('HushVoiceAudio') : null;

/**
 * A window's own audio (2026-09-27): 16 kHz mono WAV as base64, how long it is, and how loud its
 * loudest and quietest moments were — the phone sends it to the second ear only when she spoke.
 */
export interface EarClip {
  wav: string;
  seconds: number;
  peakDb: number;
  floorDb: number;
}

/**
 * Which microphone an ear records from (see `HushEar.swift`). The workout's is always `phone`
 * (2026-10-06); `headset` is opened only by the profile's measurement.
 */
export type EarSource = 'headset' | 'phone';

export type KeepAliveOwner = 'workout' | 'indoorRun' | 'voiceTest' | 'voice';

/** The chime's half second (`toneWav(seconds: 0.5)` in the Swift) and a breath after it. */
const CHIME_SOUNDS_MS = 650;
const keepAliveOwners = new Set<KeepAliveOwner>();

/**
 * The audio session as iOS has it this instant — what the profile's measurement prints
 * (`platform/voice/voiceMeasure`): the ports it records from and plays to, the hardware's sample rate
 * (a Bluetooth call profile is 8–24 kHz; music is 44.1–48), the mode iOS chose, and whether another
 * app's audio is playing.
 */
export interface SessionReport {
  inputs: string[];
  outputs: string[];
  outputNames: string[];
  category: string;
  mode: string;
  rate: number;
  hfpAllowed: boolean;
  a2dpAllowed: boolean;
  ducking: boolean;
  otherAudio: boolean;
}

const quiet = async (f: () => Promise<void> | void) => {
  try {
    await f();
  } catch {
    /* the session is best-effort: a refused category never stops a workout */
  }
};

export const audioSession = {
  available(): boolean {
    return native != null;
  },
  /** Earbuds (Bluetooth, wired or USB) on the output route — the voice's one gate (spec §0.1). */
  headsetConnected(): boolean {
    try {
      return native?.headsetConnected() ?? false;
    } catch {
      return false;
    }
  },
  onRouteChange(cb: (connected: boolean) => void): () => void {
    if (!native) return () => {};
    try {
      const sub = native.addListener('onRouteChange', (e) => cb(!!e.connected));
      return () => sub.remove();
    } catch {
      return () => {};
    }
  },
  /*
   * ⛔ THE KEEP-ALIVE HAS OWNERS (2026-09-15). The workout held it alone until the indoor run needed
   * it too — a treadmill run has no location session, so with the screen locked iOS suspended the
   * process and the lock-screen card, the wrist and the kilometre notes froze until she looked. A
   * cardio item opened from inside a workout would then have STOPPED the workout's loop on its way
   * out. So each owner holds it by name, and the loop stops only when the last one lets go.
   */
  holdKeepAlive(owner: KeepAliveOwner): Promise<void> {
    const first = keepAliveOwners.size === 0;
    keepAliveOwners.add(owner);
    return first ? quiet(() => native?.startKeepAlive()) : Promise.resolve();
  },
  /** Is anything holding the loop right now — a workout (from Start to its end), a run, the voice, a test? */
  keepAliveHeld(): boolean {
    return keepAliveOwners.size > 0;
  },
  releaseKeepAlive(owner: KeepAliveOwner): Promise<void> {
    if (!keepAliveOwners.delete(owner) || keepAliveOwners.size > 0) return Promise.resolve();
    keepDuck(); // a late unduck must not re-open a session the workout just closed
    return quiet(() => native?.stopKeepAlive());
  },
  /** Before a line: her music to a quarter. */
  duck: () => {
    keepDuck();
    return quiet(() => native?.duck());
  },
  /** After a line or a listening window: the music back, the session back to playback-mixed — soon. */
  unduck: (): Promise<void> => {
    keepDuck();
    pendingUnduck = setTimeout(() => {
      pendingUnduck = null;
      void quiet(() => native?.unduck());
    }, UNDUCK_AFTER_MS);
    return Promise.resolve();
  },
  /*
   * Resolves when the tone has SOUNDED, not when it was started (2026-09-27): the native call returns
   * at `play()`, and the next set's line was spoken over the half-second chime it was meant to follow.
   */
  playChime: () =>
    quiet(async () => {
      keepDuck();
      if (!native) return;
      await native.playChime();
      await new Promise((r) => setTimeout(r, CHIME_SOUNDS_MS));
    }),
  /** Before the recognizer starts: the listening session taken ahead of it (see the Swift). */
  prepareListening: () => {
    keepDuck();
    return quiet(() => native?.prepareListening());
  },
  /** A call, Siri, an alarm took the audio (`began`) or gave it back — spec §3.9. */
  onInterruption(cb: (began: boolean) => void): () => void {
    if (!native) return () => {};
    try {
      const sub = native.addListener('onInterruption', (e) => cb(!!e.began));
      return () => sub.remove();
    } catch {
      return () => {};
    }
  },
  /*
   * ════ THE POCKET EAR (2026-09-15) ════
   * A microphone opened on glass and kept for the workout, so a question asked from a locked phone
   * can be answered (iOS will not START a recording in the background, and SFSpeechRecognizer does
   * not run there). Every call resolves to "no" without iOS 26 or the module — then the screen-on
   * ear (`voiceCapture`'s first path) is what listens.
   */
  async earAvailable(locale: string): Promise<boolean> {
    try {
      return (await native?.earAvailable?.(locale)) ?? false;
    } catch {
      return false;
    }
  },
  async earPrepare(locale: string): Promise<boolean> {
    try {
      return (await native?.earPrepare?.(locale)) ?? false;
    } catch {
      return false;
    }
  },
  /** Null when the microphone runs; otherwise why it does not. Call on glass only. */
  async earOpen(source: EarSource): Promise<string | null> {
    if (!native?.earOpen) return 'no ear in this build';
    try {
      return (await native.earOpen(source)) ?? null;
    } catch (e) {
      return e instanceof Error ? e.message : 'earOpen threw';
    }
  },
  earClose: () => quiet(() => native?.earClose?.()),
  /*
   * ════ ⛔ THE MEASUREMENT'S CALLS — NEVER A WORKOUT'S (2026-10-06) ════
   *
   *   > founder: *"אתה לא יכול לבדוק את זה באינטרנט … אם זה אמור או יכול לעבוד והאם יש תקדים לזה
   *   > שהצליחו? … אני לא רוצה שישר תתחיל לעשות מבלי לתכנן לפני"*
   *
   * For one afternoon the workout lowered her music by flipping an option on the live session, and
   * moved its held microphone to the earbuds for each answer. Apple's own page says a duck "begins
   * when you activate your app's audio session and ends when you deactivate" it, and nothing Apple
   * has written says a recorder may be restarted on a new route from a locked phone. Both left the
   * workout the same day. What follows are the same moves — and the one Apple does document, voice
   * processing with its own ducking (iOS 17) — as steps of the profile's measurement
   * (`platform/voice/voiceMeasure`), which asks the phone itself. `theMeasurementAsksThePhone` pins
   * that nothing else calls them.
   */
  /** The session as iOS has it now — null without the module. */
  sessionReport(): SessionReport | null {
    try {
      const r = native?.sessionReport?.();
      return r && Array.isArray(r.inputs) && Array.isArray(r.outputs) ? r : null;
    } catch {
      return null;
    }
  },
  /** Step: `.duckOthers` put on and taken off the LIVE session by `duck`/`unduck` while the microphone is held. */
  setDuckUnderEar(on: boolean): void {
    try {
      native?.setDuckUnderEar?.(on);
    } catch {
      /* not in this build */
    }
  },
  /** Step: the held engine moved to the other microphone. Null when it records there; otherwise why not. */
  async earReroute(source: EarSource): Promise<string | null> {
    if (!native?.earReroute) return 'not in this build';
    try {
      return (await native.earReroute(source)) ?? null;
    } catch (e) {
      return e instanceof Error ? e.message : 'earReroute threw';
    }
  },
  /** Step: the phone's microphone opened WITH Apple's voice processing — on glass only. Null when it runs. */
  async processedOpen(): Promise<string | null> {
    if (!native?.earProcessedOpen) return 'not in this build';
    try {
      return (await native.earProcessedOpen()) ?? null;
    } catch (e) {
      return e instanceof Error ? e.message : 'earProcessedOpen threw';
    }
  },
  processedClose: () => quiet(() => native?.earProcessedClose?.()),
  processedAlive(): boolean {
    try {
      return native?.earProcessedAlive?.() ?? false;
    } catch {
      return false;
    }
  },
  /** How far everything that is not the processed voice is lowered: 0 default, 10 min, 20 mid, 30 max. "ok", or why not. */
  processedDuck(level: 0 | 10 | 20 | 30, advanced: boolean): string {
    try {
      return native?.earProcessedDuck?.(level, advanced) ?? 'not in this build';
    } catch (e) {
      return e instanceof Error ? e.message : 'earProcessedDuck threw';
    }
  },
  /** A cached line played THROUGH the processed output — the one sound the processing does not lower. */
  async processedSay(path: string): Promise<boolean> {
    try {
      return (await native?.earProcessedSay?.(path)) === true;
    } catch {
      return false;
    }
  },
  /** From here what the processed microphone hears is kept, until `processedClip` reads it. */
  processedKeep(): void {
    try {
      native?.earProcessedKeep?.();
    } catch {
      /* not in this build */
    }
  },
  async processedClip(): Promise<EarClip | null> {
    try {
      const c = await native?.earProcessedClip?.();
      return c && typeof c.wav === 'string' && c.wav.length > 0 ? c : null;
    } catch {
      return null;
    }
  },
  /** Asks iOS for the phone's own microphone again, on the live processed session. "ok", or why not. */
  processedPreferPhoneMic(): string {
    try {
      return native?.earProcessedPreferPhoneMic?.() ?? 'not in this build';
    } catch (e) {
      return e instanceof Error ? e.message : 'threw';
    }
  },
  /** States the category again (no call profile, the phone's microphone) on the live processed session. */
  processedRestate(): string {
    try {
      return native?.earProcessedRestate?.() ?? 'not in this build';
    } catch (e) {
      return e instanceof Error ? e.message : 'threw';
    }
  },
  /**
   * The audio taken back after an interruption nothing reported as ended (see the Swift): true when
   * the session is ours again — the microphone restarted, the silent loop playing. False while a
   * call still holds it, and in a build without the function.
   */
  async recoverSession(): Promise<boolean> {
    try {
      return (await native?.recoverSession?.()) === true;
    } catch {
      return false;
    }
  },
  earRunning(): boolean {
    try {
      return native?.earRunning?.() ?? false;
    } catch {
      return false;
    }
  },
  async earListen(locale: string, token: number): Promise<string | null> {
    if (!native?.earListen) return 'no ear in this build';
    try {
      return (await native.earListen(locale, token)) ?? null;
    } catch (e) {
      return e instanceof Error ? e.message : 'earListen threw';
    }
  },
  earStopListening: () => quiet(() => native?.earStopListening?.()),
  /** Is the phone's own recognizer listening to the open window too? (The strong ear hears it either way.) */
  earRecognizing(): boolean {
    try {
      return native?.earRecognizing?.() ?? false;
    } catch {
      return false;
    }
  },
  /** The audio the window `token` heard, for the second ear — null without it (`cloudEar`). */
  async earClip(token: number, maxSeconds = 12): Promise<EarClip | null> {
    try {
      const c = await native?.earClip?.(token, maxSeconds);
      return c && typeof c.wav === 'string' && c.wav.length > 0 ? c : null;
    } catch {
      return null;
    }
  },
  /** Can this build play a natural-voice line? (`neuralVoice` falls back to Carmit when not.) */
  canPlayFile(): boolean {
    return typeof native?.playFile === 'function';
  },
  /** Play one cached line; true when it played to its end. Never throws. */
  async playFile(path: string): Promise<boolean> {
    try {
      keepDuck();
      return (await native?.playFile?.(path)) === true;
    } catch {
      return false;
    }
  },
  stopFile(): void {
    try {
      native?.stopFile?.();
    } catch {
      /* nothing playing */
    }
  },
  onEarResult(cb: (text: string, token: number) => void): () => void {
    if (!native) return () => {};
    try {
      const sub = native.addListener('onEarResult', (e) => cb(String(e.text ?? ''), Number(e.token)));
      return () => sub.remove();
    } catch {
      return () => {};
    }
  },
  onEarState(cb: (running: boolean, error: string | null) => void): () => void {
    if (!native) return () => {};
    try {
      const sub = native.addListener('onEarState', (e) => cb(!!e.running, e.error ?? null));
      return () => sub.remove();
    } catch {
      return () => {};
    }
  },
  /** The route as the phone reports it — null without the module. */
  routeInfo(): RouteInfo | null {
    try {
      return native?.routeInfo() ?? null;
    } catch {
      return null;
    }
  },
};
