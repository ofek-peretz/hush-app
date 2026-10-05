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

/** Which microphone the pocket ear records from — her choice (see `HushEar.swift`). */
export type EarSource = 'headset' | 'phone';

export type KeepAliveOwner = 'workout' | 'indoorRun' | 'voiceTest' | 'voice';

/** The chime's half second (`toneWav(seconds: 0.5)` in the Swift) and a breath after it. */
const CHIME_SOUNDS_MS = 650;
const keepAliveOwners = new Set<KeepAliveOwner>();

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
