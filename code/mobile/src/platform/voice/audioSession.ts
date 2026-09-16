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
  earListen?(locale: string, token: number): Promise<string | null>;
  earStopListening?(): Promise<void>;
  addListener(event: 'onRouteChange', cb: (e: { connected: boolean }) => void): { remove(): void };
  addListener(event: 'onEarResult', cb: (e: { text: string; token: number }) => void): { remove(): void };
  addListener(event: 'onEarState', cb: (e: { running: boolean; error?: string; restarted?: boolean }) => void): { remove(): void };
}

const native: AudioModule | null =
  Platform.OS === 'ios' ? requireOptionalNativeModule<AudioModule>('HushVoiceAudio') : null;

/** Which microphone the pocket ear records from — her choice (see `HushEar.swift`). */
export type EarSource = 'headset' | 'phone';

export type KeepAliveOwner = 'workout' | 'indoorRun' | 'voiceTest';
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
    return quiet(() => native?.stopKeepAlive());
  },
  /** Before a line: her music to a quarter. */
  duck: () => quiet(() => native?.duck()),
  /** After a line or a listening window: the music back, the session back to playback-mixed. */
  unduck: () => quiet(() => native?.unduck()),
  playChime: () => quiet(() => native?.playChime()),
  /** Before the recognizer starts: the listening session taken ahead of it (see the Swift). */
  prepareListening: () => quiet(() => native?.prepareListening()),
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
