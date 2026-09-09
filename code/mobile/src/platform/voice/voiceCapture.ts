/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE EAR — a window, not a stream.
 *
 * docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md §4: the microphone opens only after a question and
 * closes on the first final sentence or when the window runs out. Three reasons, all measured on a
 * gym floor: the earbuds' microphone drops the music to phone quality (HFP) for as long as it is
 * open; an always-on microphone in the loudest room the app is ever in is a stream of false
 * answers; and the recognizer's own one-minute cap means a long window (the loading dialogue, up
 * to 90 s) must be restarted silently under the athlete — which this seam does.
 *
 * A thin seam over `expo-speech-recognition` (Apple's Speech framework), resolved as an OPTIONAL
 * native module exactly as the Live Activity is: present in a dev-client / store build, absent in
 * Expo Go, on the web and under jest — and absent means `available() === false` and a window
 * that closes at once with `unavailable`, never a throw. Nothing here imports the package's JS.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/** The slice of `ExpoSpeechRecognitionModule` this seam uses — typed here so the package's JS is never imported. */
interface SpeechModule {
  start(options: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  getPermissionsAsync(): Promise<{ granted: boolean }>;
  supportsOnDeviceRecognition?(): boolean;
  addListener(event: string, listener: (e: unknown) => void): { remove(): void };
}

export type WindowEnd = 'heard' | 'silence' | 'timeout' | 'closed' | 'error' | 'denied' | 'unavailable';

const nativeModule: SpeechModule | null =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition')
    : null;

/** The recognizer's tag for the app's locale. */
export function recognizerLang(locale: string): string {
  return locale.startsWith('he') ? 'he-IL' : 'en-US';
}

/**
 * The audio session while a window is open: record AND play, the earbuds' microphone over
 * Bluetooth, her music ducked. Restored to playback-only by the audio module when the window closes.
 */
const LISTENING_SESSION = {
  category: 'playAndRecord',
  categoryOptions: ['duckOthers', 'allowBluetooth', 'defaultToSpeaker'],
  mode: 'measurement',
} as const;

/** Apple's recognizer ends a request itself around the minute; restart under it at 55 s (spec §3.2). */
const RESTART_AFTER_MS = 55_000;

export interface WindowOptions {
  locale: string;
  /** How long to listen, in milliseconds. Long windows are restarted silently under the athlete. */
  ms: number;
  hints?: readonly string[];
  /**
   * Every FINAL sentence the window hears. Return `true` to keep the window open (the sentence was
   * not an answer — noise during loading), `false` to close it as `heard`.
   */
  onSentence: (text: string, confidence: number | null) => boolean;
  /** The window closed, and why. Called exactly once. */
  onEnd: (why: WindowEnd) => void;
}

export interface OpenWindow {
  close(): void;
}

export const voiceCapture = {
  /** Is there an ear at all in this build? False in Expo Go, on the web and under jest. */
  available(): boolean {
    return nativeModule != null;
  },

  /** Ask for the microphone and speech permissions once, up front — at session start, not mid-set. */
  async ensurePermission(): Promise<boolean> {
    const m = nativeModule;
    if (!m) return false;
    try {
      let perm = await m.getPermissionsAsync();
      if (!perm.granted) perm = await m.requestPermissionsAsync();
      return perm.granted;
    } catch {
      return false;
    }
  },

  /**
   * Open one listening window. Closes on the first final sentence the caller accepts, on `ms`
   * elapsed, or on `close()`. Never throws; every road out ends in exactly one `onEnd`.
   */
  open(opts: WindowOptions): OpenWindow {
    const m = nativeModule;
    let ended = false;
    let subs: { remove(): void }[] = [];
    let deadline: ReturnType<typeof setTimeout> | null = null;
    /** A pending reopen (after the recognizer's own end, or an error retried once). */
    let restart: ReturnType<typeof setTimeout> | null = null;
    /** The restart under Apple's minute cap. */
    let cap: ReturnType<typeof setTimeout> | null = null;
    let retried = false;
    let lastFinal = '';
    const clear = () => {
      for (const s of subs) s.remove();
      subs = [];
      if (restart) clearTimeout(restart);
      restart = null;
      if (cap) clearTimeout(cap);
      cap = null;
    };
    const end = (why: WindowEnd) => {
      if (ended) return;
      ended = true;
      clear();
      if (deadline) clearTimeout(deadline);
      deadline = null;
      try {
        m?.stop();
      } catch {
        /* not running */
      }
      opts.onEnd(why);
    };
    if (!m) {
      setTimeout(() => end('unavailable'), 0);
      return { close: () => end('closed') };
    }
    const startRequest = () => {
      if (ended) return;
      clear();
      subs.push(
        m.addListener('result', (e) => {
          const ev = e as { isFinal?: boolean; results?: { transcript?: string; confidence?: number }[] };
          const best = ev.results?.[0];
          const text = (best?.transcript ?? '').trim();
          if (!ev.isFinal || !text) return;
          if (text === lastFinal) return; // some recognizers repeat the last final on segment end
          lastFinal = text;
          const keepOpen = opts.onSentence(text, typeof best?.confidence === 'number' ? best.confidence : null);
          if (!keepOpen) end('heard');
        }),
        m.addListener('error', (e) => {
          const ev = e as { error?: string };
          if (ev.error === 'no-speech') return; // silence: 'end' follows, and the window's own deadline rules
          if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') return end('denied');
          // Any other error mid-window: try once more under the athlete; a second one closes it.
          if (retried) return end('error');
          retried = true;
          if (!restart) restart = setTimeout(startRequest, 300);
        }),
        m.addListener('end', () => {
          // The recognizer closed its own request (silence, the minute cap). Reopen under the
          // athlete for as long as the window has time left.
          if (!ended && !restart) restart = setTimeout(startRequest, 150);
        }),
      );
      // Apple chooses on-device recognition where the locale has it and the network where it
      // does not; REQUIRING on-device would fail every window on a device whose Hebrew is not
      // installed offline (spec §4 accepts Apple's server for the one sentence).
      try {
        m.start({
          lang: recognizerLang(opts.locale),
          interimResults: false,
          // One answer per request: the recognizer ends itself on silence (3 s on iOS 17, the
          // final result on 18+) and hands over ONE final sentence; the window reopens it under
          // the athlete for as long as it has time left. `continuous` would hold the final back.
          continuous: false,
          maxAlternatives: 1,
          requiresOnDeviceRecognition: false,
          addsPunctuation: false,
          contextualStrings: [...(opts.hints ?? [])].slice(0, 100),
          iosTaskHint: 'confirmation',
          iosCategory: LISTENING_SESSION,
        });
      } catch {
        if (retried) return end('error');
        retried = true;
        if (!restart) restart = setTimeout(startRequest, 500);
        return;
      }
      // Restart under the athlete before Apple's own cap ends the request.
      cap = setTimeout(() => {
        cap = null;
        try {
          m.stop();
        } catch {
          /* not running */
        }
        if (!restart) restart = setTimeout(startRequest, 150);
      }, RESTART_AFTER_MS);
    };
    deadline = setTimeout(() => end('timeout'), Math.max(500, opts.ms));
    startRequest();
    return { close: () => end('closed') };
  },
};
