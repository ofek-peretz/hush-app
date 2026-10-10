/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE NATURAL VOICE (2026-09-27) — the coach's lines in a neural voice, cached on the phone for good.
 *
 * Founder: *"לגבי הקול של כרמית של אפל — האם יש לדעתך קול טוב בהרבה יותר למטרה הזאת?"* Carmit is a
 * concatenative voice from another decade; the lines she hears every workout deserve a voice that
 * sounds like a person. This module turns a line into a file:
 *
 *   · CACHED FOR GOOD. A line is synthesized once per voice (`server/voice.ts` `say`) and kept in the
 *     app's documents. Most of a workout repeats workout to workout ("קדימה.", "מנוחה: דקה וחצי.",
 *     the questions, her usual loads) — after the first sessions nearly every line plays instantly,
 *     offline, for nothing.
 *   · FETCHED AHEAD. `prefetch` takes the lines the session is about to need (`domain/voiceLinesAhead`)
 *     during a rest, when nothing is waiting on them.
 *   · NEVER WAITED ON FOR LONG. `clip(text, …, waitMs)` answers a file or null; null means Carmit says
 *     this line now (`coachVoice`), and the fetch still lands in the cache for next time.
 *
 * `'device'` as the voice is Carmit, by her choice — nothing is fetched at all.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { track } from '@/platform/telemetry';
import { audioSession } from '@/platform/voice/audioSession';
import { cloudSay, voiceCloudLastFailure, voiceCloudReachable } from '@/platform/voice/voiceCloud';

/**
 * The voices offered in the profile — the same list the Worker accepts (`server/voice.ts` VOICES).
 * OpenAI's only (founder, 2026-09-28); `marin`, its most natural, first and the default.
 */
export const NEURAL_VOICES = [
  'openai:gpt-4o-mini-tts:marin',
  'openai:gpt-4o-mini-tts:coral',
  'openai:gpt-4o-mini-tts:sage',
  'openai:gpt-4o-mini-tts:shimmer',
  'openai:gpt-4o-mini-tts:nova',
] as const;
/** Carmit, on the device — offline, free, and the fallback for every line either way. */
export const DEVICE_VOICE = 'device';
export const DEFAULT_COACH_VOICE: string = NEURAL_VOICES[0];

/** How many lines are kept before the least recently heard are let go (≈150 KB each). */
const MAX_CLIPS = 400;
/** Lines fetched at once while prefetching — a burst the Worker's limiter is sized for. */
const PREFETCH_PARALLEL = 3;
/** A synthesis this slow is abandoned; the line is Carmit's this time. */
const FETCH_TIMEOUT_MS = 10_000;
const INDEX_KEY = 'hush.voice.clips';

interface LegacyFs {
  documentDirectory: string | null;
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  makeDirectoryAsync(uri: string, opts?: { intermediates?: boolean }): Promise<void>;
  writeAsStringAsync(uri: string, contents: string, opts?: { encoding?: string }): Promise<void>;
  deleteAsync(uri: string, opts?: { idempotent?: boolean }): Promise<void>;
}

function optionalRequire<T>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}

/* ⚠️ `expo-file-system/legacy`, NOT the main entry: on SDK 54 the main entry's `writeAsStringAsync`
   and friends are stubs that THROW (`legacyWarnings.ts`) — the classic API lives under `/legacy`. */
const fs: LegacyFs | null =
  Platform.OS === 'ios' ? optionalRequire<LegacyFs>(() => require('expo-file-system/legacy') as LegacyFs) : null;

/** FNV-1a, 64 bits as two 32-bit halves — a file name, not a secret. */
export function clipKey(voice: string, locale: string, text: string): string {
  const s = `${voice}|${locale.startsWith('he') ? 'he' : 'en'}|${text}`;
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

let voice: string = DEFAULT_COACH_VOICE;
/** key → when it was last heard (ms). The files on disk are exactly the keys here. */
let index: Record<string, number> | null = null;
let indexLoading: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const inflight = new Map<string, Promise<string | null>>();
let prefetchQueue: { text: string; locale: string; voice: string }[] = [];
let prefetchRunning = 0;
/** Consecutive failed syntheses. */
let failures = 0;
/**
 * ⛔ THREE FAILURES PAUSE THE NATURAL VOICE — THEY DO NOT END IT (2026-10-05).
 *
 *   > founder: *"הקול של האימון לא נשמע טוב זה כמו 'סירי'"* … *"ובדקת בקוד שזה אמור לעבוד?"*
 *
 * Past three failed fetches this stopped trying "until the next workout". Three lines are fetched at
 * once as a workout opens — so one dead corner of a gym, for the few seconds it takes to walk
 * through it, was three failures at the same instant, and every line for the rest of that hour was
 * the phone's own voice: the exact sound he reported, from a cause the next room would have cured.
 * Now three in a row pause the fetching for `PAUSE_MS`, and then it is tried again — a few requests
 * every half-minute while the network is gone, and her voice back within half a minute of its return.
 */
const PAUSE_AFTER_FAILURES = 3;
export const PAUSE_MS = 30_000;
let pausedUntil = 0;
const paused = () => failures >= PAUSE_AFTER_FAILURES && Date.now() < pausedUntil;

const dir = () => (fs?.documentDirectory ? `${fs.documentDirectory}coach-voice/` : null);
const uriOf = (key: string) => `${dir()}${key}.wav`;

function loadIndex(): Promise<void> {
  if (index) return Promise.resolve();
  if (!indexLoading) {
    indexLoading = (async () => {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(INDEX_KEY);
        index = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      } catch {
        index = {};
      }
      const d = dir();
      // No index (a first launch, or an account wiped with `db.clearAll`): whatever files are left
      // belong to no one — the directory starts empty.
      if (d && fs && raw == null) await fs.deleteAsync(d, { idempotent: true }).catch(() => {});
      if (d && fs) await fs.makeDirectoryAsync(d, { intermediates: true }).catch(() => {});
    })();
  }
  return indexLoading;
}

function saveIndexSoon(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index ?? {})).catch(() => {});
  }, 2_000);
}

/** The oldest-heard fifth goes when the cache is full. */
async function evictIfFull(): Promise<void> {
  if (!index || !fs) return;
  const keys = Object.keys(index);
  if (keys.length <= MAX_CLIPS) return;
  const old = keys.sort((a, b) => index![a] - index![b]).slice(0, Math.ceil(keys.length / 5));
  for (const k of old) {
    delete index[k];
    await fs.deleteAsync(uriOf(k), { idempotent: true }).catch(() => {});
  }
  saveIndexSoon();
}

async function fetchClip(text: string, locale: string, v: string): Promise<string | null> {
  const key = clipKey(v, locale, text);
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const r = await cloudSay(text, locale, v, FETCH_TIMEOUT_MS);
    if (!r.ok || !fs) {
      failures += 1;
      if (failures >= PAUSE_AFTER_FAILURES) pausedUntil = Date.now() + PAUSE_MS;
      // ⛔ WHY, WRITTEN DOWN (2026-10-05): a natural voice that could not be fetched was Carmit with no
      // trace anywhere — the founder heard "Siri" for a whole workout and nothing recorded the reason.
      void track('voice_neural_failed', { why: r.ok ? 'no_files' : r.why, failures });
      return null;
    }
    failures = 0;
    try {
      await fs.writeAsStringAsync(uriOf(key), r.audio, { encoding: 'base64' });
    } catch {
      return null;
    }
    await loadIndex();
    index![key] = Date.now();
    saveIndexSoon();
    void evictIfFull();
    return uriOf(key);
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

export const neuralVoice = {
  /** Her choice from the profile; `'device'` is Carmit. Unknown ids fall back to the default. */
  setVoice(id: string | null | undefined): void {
    const next = id === DEVICE_VOICE ? DEVICE_VOICE : (NEURAL_VOICES as readonly string[]).includes(String(id)) ? String(id) : DEFAULT_COACH_VOICE;
    if (next !== voice) prefetchQueue = [];
    voice = next;
  },
  voice(): string {
    return voice;
  },

  /** Is a natural voice in play at all? (This build can play a file, keep one, and reach the Worker.) */
  enabled(): boolean {
    return voice !== DEVICE_VOICE && !!fs && !!dir() && audioSession.canPlayFile() && voiceCloudReachable();
  },

  /** A new workout: a network that failed last time is tried again at once. */
  reset(): void {
    failures = 0;
    pausedUntil = 0;
  },

  /** Already on the phone? — a file to play at once, or null (no waiting, no network). */
  async cached(text: string, locale: string): Promise<string | null> {
    if (!neuralVoice.enabled()) return null;
    await loadIndex();
    const key = clipKey(voice, locale, text);
    if (index && index[key] != null) {
      index[key] = Date.now();
      saveIndexSoon();
      return uriOf(key);
    }
    return null;
  },

  /**
   * The line as a file: from the cache at once, or fetched — waited on for at most `waitMs`. Null is
   * "Carmit says it now"; a fetch still under way keeps going and lands in the cache.
   */
  async clip(text: string, locale: string, waitMs: number): Promise<string | null> {
    if (!neuralVoice.enabled()) return null;
    const hit = await neuralVoice.cached(text, locale);
    if (hit) return hit;
    if (paused()) return null;
    const job = fetchClip(text, locale, voice);
    return Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), waitMs))]);
  },

  /** Lines the workout is about to need — fetched in the background, a few at a time, cache-first. */
  prefetch(lines: readonly string[], locale: string): void {
    if (!neuralVoice.enabled() || paused()) return;
    const v = voice;
    const seen = new Set(prefetchQueue.map((q) => q.text));
    for (const text of lines) {
      const t = text.trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        prefetchQueue.push({ text: t, locale, voice: v });
      }
    }
    const pump = async () => {
      while (prefetchQueue.length > 0 && !paused()) {
        const next = prefetchQueue.shift()!;
        if (next.voice !== voice) continue;
        await loadIndex();
        if (index && index[clipKey(next.voice, next.locale, next.text)] != null) continue;
        await fetchClip(next.text, next.locale, next.voice);
      }
    };
    while (prefetchRunning < PREFETCH_PARALLEL) {
      prefetchRunning += 1;
      void pump().finally(() => {
        prefetchRunning -= 1;
      });
    }
  },

  /** For the profile's voice row: how many lines are kept, whether the last fetches failed — and why. */
  stats(): { clips: number; failing: boolean; why: string | null } {
    return { clips: index ? Object.keys(index).length : 0, failing: failures >= PAUSE_AFTER_FAILURES, why: voiceCloudLastFailure().say };
  },
};
