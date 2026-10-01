/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE MOUTH — one line at a time, in order, and you can wait for it.
 *
 * docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md §4: Apple's on-device voices ("כרמית" for Hebrew,
 * "Samantha" for English), a touch slower than the default, a short breath between sentences. The
 * conductor needs to know WHEN a line has finished — the listening window opens after "כמה חזרות
 * עשית?", not over it — so `say` returns a promise that resolves when the line is done (or was cut
 * off), and lines queue behind each other.
 *
 * `expo-speech` is required lazily inside a guard, so a build without it (Expo Go, the web, jest)
 * is silent and never throws: `available()` is false and `say` resolves at once.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { audioSession } from '@/platform/voice/audioSession';
import { neuralVoice } from '@/platform/voice/neuralVoice';

type SpeechApi = {
  speak(text: string, opts?: {
    language?: string;
    voice?: string;
    rate?: number;
    pitch?: number;
    onStart?: () => void;
    onDone?: () => void;
    onStopped?: () => void;
    onError?: () => void;
  }): void;
  stop(): Promise<void>;
  getAvailableVoicesAsync?(): Promise<{ identifier: string; language: string; quality?: string }[]>;
};

function api(): SpeechApi | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech') as SpeechApi;
    return typeof mod?.speak === 'function' ? mod : null;
  } catch {
    return null;
  }
}

/** A touch slower than the default: numbers read at conversational speed are numbers heard. */
const RATE = 0.92;
/** The breath between two queued sentences, in milliseconds (spec §4: 300). */
const BREATH_MS = 300;
/** A line's longest honest length: a floor, plus far more per character than any voice needs. */
const WATCHDOG_BASE_MS = 4000;
/**
 * How long a line not yet on the phone is waited on in the natural voice before Carmit says it
 * instead (2026-09-27). Most lines are cached or prefetched; this is the price of a surprise.
 */
const NEURAL_WAIT_MS = 1_800;
/** How long a line may take to START before it is tried once more on the default voice. */
const START_BUDGET_MS = 2500;
const WATCHDOG_PER_CHAR_MS = 150;

interface Item {
  text: string;
  locale: string;
  resolve: () => void;
}

const queue: Item[] = [];
let speaking = false;
/** Bumped by `interrupt()`: a line from before it ends without starting the queue again. */
let generation = 0;

export type LineEnd = 'done' | 'stopped' | 'error' | 'watchdog';
export interface LastLine {
  how: LineEnd;
  /** Which mouth said it: the natural voice from its file, or Carmit on the device. */
  engine: 'neural' | 'device';
  /** The synthesizer reported the line began — false means the phone never played a sound. */
  started: boolean;
  voice: string | null;
  atMs: number;
}
let last: LastLine | null = null;
let cachedVoice: { locale: string; id: string | null } | null = null;

/** The best voice the device has for the locale — the enhanced one when it was downloaded. */
async function voiceFor(locale: string): Promise<string | undefined> {
  const s = api();
  if (!s?.getAvailableVoicesAsync) return undefined;
  const lang = locale.startsWith('he') ? 'he-IL' : 'en-US';
  if (cachedVoice && cachedVoice.locale === lang) return cachedVoice.id ?? undefined;
  try {
    const voices = await s.getAvailableVoicesAsync();
    const ours = voices.filter((v) => v.language === lang);
    // The spec's voice first (Carmit / Samantha), its better recording when downloaded — an arbitrary
    // enhanced en-US voice used to win over Samantha.
    const named = (v: { identifier: string }) => /carmit|samantha/i.test(v.identifier);
    const better = (v: { quality?: string }) => v.quality === 'Enhanced' || v.quality === 'Premium';
    const pick = ours.find((v) => named(v) && better(v)) ?? ours.find(named) ?? ours.find(better) ?? ours[0];
    cachedVoice = { locale: lang, id: pick?.identifier ?? null };
    return pick?.identifier;
  } catch {
    cachedVoice = { locale: lang, id: null };
    return undefined;
  }
}

function next(): void {
  const s = api();
  const item = queue.shift();
  if (!item) {
    speaking = false;
    return;
  }
  if (!s) {
    speaking = false;
    item.resolve();
    next();
    return;
  }
  speaking = true;
  const gen = generation;
  let settled = false;
  let started = false;
  let engine: 'neural' | 'device' = 'device';
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let usedVoice: string | undefined;
  const done = (how: LineEnd) => {
    if (settled) return;
    settled = true;
    if (watchdog) clearTimeout(watchdog);
    last = { how, engine, started, voice: usedVoice ?? null, atMs: Date.now() };
    item.resolve();
    setTimeout(() => {
      // An `interrupt()` since this line began owns the queue now: this line's end starts nothing.
      if (gen !== generation) return;
      speaking = false;
      next();
    }, BREATH_MS);
  };
  /*
   * ⛔ A LINE THAT NEVER ENDS MUST NOT END THE COACH (2026-09-15). `expo-speech`'s `speak` does not
   * await its native call: a refused utterance (an unknown voice id throws there) rejects into the
   * void and no onDone / onError ever arrives — and this queue, and every `await say` in the
   * conductor behind it, waited for ever in silence. The watchdog ends the line at a generous
   * length for its text, and a line that timed out on a chosen voice drops that voice for the next.
   */
  watchdog = setTimeout(() => {
    if (settled) return;
    if (usedVoice && cachedVoice?.id === usedVoice) cachedVoice = { locale: cachedVoice.locale, id: null };
    /* ⛔ AND THE SYNTHESIZER IS FLUSHED (2026-09-27, the output audit). Resolving the promise alone
       left the stuck utterance at the head of iOS's own queue — every later line waited natively
       behind it and ended by watchdog too: one interruption, and the coach was mute for the workout.
       Its late `didCancel` lands on a settled line and is ignored. */
    void s.stop().catch(() => {});
    audioSession.stopFile();
    done('watchdog');
  }, NEURAL_WAIT_MS + WATCHDOG_BASE_MS + item.text.length * WATCHDOG_PER_CHAR_MS);
  /** Which attempt the callbacks belong to — a retried line ignores its first attempt's cancel. */
  let attempt = 0;
  let startCheck: ReturnType<typeof setTimeout> | null = null;
  const speakNow = (voice: string | undefined) => {
    const mine = ++attempt;
    usedVoice = voice;
    const ours = (f: () => void) => () => {
      if (mine === attempt) f();
    };
    try {
      s.speak(item.text, {
        language: item.locale.startsWith('he') ? 'he-IL' : 'en-US',
        ...(voice ? { voice } : {}),
        rate: RATE,
        onStart: ours(() => {
          started = true;
          if (startCheck) clearTimeout(startCheck);
        }),
        onDone: ours(() => done('done')),
        onStopped: ours(() => done('stopped')),
        onError: ours(() => done('error')),
      });
    } catch {
      done('error');
      return;
    }
    /* A line that has not STARTED within its start budget is retried once on the language's default
       voice — the chosen one may be a voice the synthesizer can no longer load. */
    if (mine === 1) {
      startCheck = setTimeout(() => {
        if (settled || started || gen !== generation) return;
        if (voice && cachedVoice?.id === voice) cachedVoice = { locale: cachedVoice.locale, id: null };
        void s.stop().catch(() => {});
        speakNow(undefined);
      }, START_BUDGET_MS);
    }
  };
  void (async () => {
    /*
     * ⛔ THE NATURAL VOICE FIRST (2026-09-27, `neuralVoice`): a line already on the phone plays at
     * once from its file; a new one is waited on for `NEURAL_WAIT_MS`. Anything else — no file, no
     * network, a file that would not play — and Carmit says the line, exactly as before.
     */
    const uri = neuralVoice.enabled() ? await neuralVoice.clip(item.text, item.locale, NEURAL_WAIT_MS).catch(() => null) : null;
    if (gen !== generation) return done('stopped');
    if (uri) {
      engine = 'neural';
      usedVoice = neuralVoice.voice();
      started = true;
      const played = await audioSession.playFile(uri);
      if (gen !== generation) return done('stopped');
      if (played) return done('done');
      engine = 'device';
      started = false;
    }
    // Interrupted while the voice was being chosen (earbuds out): this line is never played.
    const voice = await voiceFor(item.locale);
    if (gen !== generation) return done('stopped');
    speakNow(voice);
  })();
}

export const coachVoice = {
  available(): boolean {
    return api() != null;
  },

  /** Warm the natural voice for lines about to be said (the conductor, before an utterance). */
  warm(lines: readonly string[], locale: string): void {
    neuralVoice.prefetch(lines, locale);
  },

  /** Say one line after whatever is queued; resolves when it has been said (or cut off). */
  say(text: string, locale: string): Promise<void> {
    const t = text.trim();
    if (!t) return Promise.resolve();
    return new Promise<void>((resolve) => {
      queue.push({ text: t, locale, resolve });
      if (!speaking) next();
    });
  },

  /** Drop what has not been said and stop what is being said — the moment has passed. */
  interrupt(): void {
    generation += 1;
    const dropped = queue.splice(0, queue.length);
    for (const d of dropped) d.resolve();
    const s = api();
    if (s) void s.stop().catch(() => {});
    audioSession.stopFile();
    speaking = false;
  },

  /** How the last line ended — `done` with `started` is a line the phone actually played. */
  lastLine(): LastLine | null {
    return last;
  },

  /** For tests and the harness: what is waiting to be said. */
  pending(): number {
    return queue.length;
  },
};
