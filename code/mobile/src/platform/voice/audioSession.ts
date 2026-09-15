/**
 * The audio session under the voice coach — the JS side of `modules/hush-voice-audio`.
 *
 * Optional native module, resolved exactly as the Live Activity and the ear are: present in a
 * dev-client / store build, absent in Expo Go, on the web and under jest — and absent means no
 * headset (so no voice), and every call a resolved no-op. See the Swift file for what each does.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

interface AudioModule {
  headsetConnected(): boolean;
  startKeepAlive(): Promise<void>;
  stopKeepAlive(): Promise<void>;
  duck(): Promise<void>;
  unduck(): Promise<void>;
  playChime(): Promise<void>;
  addListener(event: 'onRouteChange', cb: (e: { connected: boolean }) => void): { remove(): void };
}

const native: AudioModule | null =
  Platform.OS === 'ios' ? requireOptionalNativeModule<AudioModule>('HushVoiceAudio') : null;

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
  startKeepAlive: () => quiet(() => native?.startKeepAlive()),
  stopKeepAlive: () => quiet(() => native?.stopKeepAlive()),
  /** Before a line: her music to a quarter. */
  duck: () => quiet(() => native?.duck()),
  /** After a line or a listening window: the music back, the session back to playback-mixed. */
  unduck: () => quiet(() => native?.unduck()),
  playChime: () => quiet(() => native?.playChime()),
};
