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

type SpeechApi = {
  speak(text: string, opts?: {
    language?: string;
    voice?: string;
    rate?: number;
    pitch?: number;
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

interface Item {
  text: string;
  locale: string;
  resolve: () => void;
}

const queue: Item[] = [];
let speaking = false;
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
    const pick = ours.find((v) => v.quality === 'Enhanced') ?? ours.find((v) => /carmit|samantha/i.test(v.identifier)) ?? ours[0];
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
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    item.resolve();
    setTimeout(() => {
      speaking = false;
      next();
    }, BREATH_MS);
  };
  void voiceFor(item.locale).then((voice) => {
    try {
      s.speak(item.text, {
        language: item.locale.startsWith('he') ? 'he-IL' : 'en-US',
        ...(voice ? { voice } : {}),
        rate: RATE,
        onDone: done,
        onStopped: done,
        onError: done,
      });
    } catch {
      done();
    }
  });
}

export const coachVoice = {
  available(): boolean {
    return api() != null;
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
    const dropped = queue.splice(0, queue.length);
    for (const d of dropped) d.resolve();
    const s = api();
    if (s) void s.stop().catch(() => {});
    speaking = false;
  },

  /** For tests and the harness: what is waiting to be said. */
  pending(): number {
    return queue.length;
  },
};
