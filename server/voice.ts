/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE VOICE'S CLOUD HALF (2026-09-27) — a better ear and a better mouth, behind the same Worker.
 *
 * Founder: *"אפשר לעשות שיהיה מנוע זיהוי דיבור טוב יותר? אפשר לקחת אותו לקצה? ולגבי הקול של כרמית…
 * תטפל בהכל ותיקח את החוויה הזאת לקצה היכולת."*
 *
 * Two jobs, and nothing else:
 *   · HEAR — a few seconds of her voice (16-bit mono WAV) → the words she said. The words go back to
 *     the phone, where the CLOSED GRAMMAR decides what they mean (`domain/voiceGrammar`). This file
 *     never interprets an answer and never writes anything: a model here can only mis-hear, exactly
 *     as the on-device ear can, and the echo on the phone is what catches it.
 *   · SAY — one line of the coach's Hebrew → a WAV of a natural voice. The phone caches it for good
 *     (`platform/voice/neuralVoice`), so a line she hears every workout is fetched once.
 *
 * Why the keys are here and not in the app: the same reason as the coach (`worker.ts` header).
 * ⛔ ONE PROVIDER (founder, 2026-09-28: *"בוא נשתמש רק ב-OPEN AI עבור כל המטרות שלנו"*): the ear is
 * OpenAI's `gpt-transcribe` (its recommended speech-to-text), the mouth its `gpt-4o-mini-tts` (its one
 * steerable voice model) in `marin` — the most natural of its voices. Measure with
 * `server/voiceBakeoff.cjs` after the first credit. With `PROBE === '1'` a preview version accepts
 * `x-probe-ear` / `x-probe-voice` so candidates run through this exact code.
 *
 * The mouth is not asked once and believed (2026-10-12): see ONE VOICE, MEASURED above `say`, and
 * `server/voiceDrift.cjs` — the instrument that showed why, and that reads the result after a deploy.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { wavPitch, type ClipPitch } from './voicePitch.ts';

export interface VoiceKeys {
  OPENAI_API_KEY?: string;
}

/** What the question on the phone expects — steers the recognizer toward the few things she can say. */
export interface HearContext {
  /** 'ready' (the loading dialogue), 'reps' (a number of reps), 'confirm', 'resume', 'set' (a set under way), 'any'. */
  expect?: string;
  /** 'he' | 'en'. */
  lang?: string;
}

export type HearResult = { ok: true; text: string; model: string; ms: number } | { ok: false; why: string; ms: number };
export type SayResult =
  | {
      ok: true;
      wav: Uint8Array;
      /** The model as the app names it — the tail of the voice id it asked for, unchanged. */
      model: string;
      voice: string;
      ms: number;
      /** The dated version that actually spoke (`PINNED_MODEL`). */
      spoke: string;
      /** How many takes this one was chosen from, and its own pitch (0 = too short to measure). */
      takes: number;
      hz: number;
    }
  | { ok: false; why: string; ms: number };

/** The ear and the voice the app gets unless a probe asks otherwise. OpenAI's, by the founder's ruling. */
export const DEFAULT_EAR = 'openai:gpt-transcribe';
export const DEFAULT_VOICE = 'openai:gpt-4o-mini-tts:marin';

/**
 * The voices she may choose in her profile (`ProfileSheet` → "קול המאמן"). All female: the coach
 * speaks of herself in the feminine ("אני מקשיבה", "למדתי"), so a male voice would contradict every
 * other line. A voice not on this list is never synthesized — the app cannot pick an arbitrary model.
 * `marin` first: OpenAI names it (with `cedar`, a male voice) its most natural.
 */
export const VOICES: readonly string[] = [
  'openai:gpt-4o-mini-tts:marin',
  'openai:gpt-4o-mini-tts:coral',
  'openai:gpt-4o-mini-tts:sage',
  'openai:gpt-4o-mini-tts:shimmer',
  'openai:gpt-4o-mini-tts:nova',
];

/** A line the voice will say — never more (the longest real line, a first-time loading dialogue, is ~260). */
export const MAX_SAY_CHARS = 400;
/** Twenty seconds of 16 kHz mono 16-bit audio, base64 — a question's window is at most a few seconds of her. */
export const MAX_HEAR_BASE64 = 900_000;

const HE_WORDS = [
  'מוכן', 'מוכנה', 'כן', 'לא', 'סיימתי', 'זהו', 'עוד רגע', 'כמו שכתוב', 'קל יותר', 'כבד יותר', 'לא יודע',
  'דלג', 'תפוס', 'עצור', 'המשך', 'קילו', 'חזרות', 'וחצי', 'ורבע',
  'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע', 'עשר', 'אחת עשרה', 'שתים עשרה',
  'שלוש עשרה', 'ארבע עשרה', 'חמש עשרה', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'מאה',
];

/** The recognizer's brief — who is speaking, where, and what the answer can be. */
function hearPrompt(ctx: HearContext): string {
  const he = (ctx.lang ?? 'he').startsWith('he');
  if (!he) {
    return 'A lifter in a noisy gym answers a voice coach with a short phrase: "ready", "yes", "no", "done", "as written", a number of reps, or a weight and reps ("sixty, ten"). Write numbers as digits.';
  }
  const expect =
    ctx.expect === 'ready' ? 'המאמן אמר לו לטעון את המוט ולהגיד "מוכן", או משקל אחר.'
    : ctx.expect === 'reps' ? 'המאמן שאל "כמה חזרות עשית?" — התשובה היא בדרך כלל מספר, לפעמים משקל ואז חזרות.'
    : ctx.expect === 'confirm' ? 'המאמן שאל "נכון?" — התשובה היא "כן", "לא", או מספר.'
    : ctx.expect === 'resume' ? 'האימון מושהה — התשובה היא "המשך".'
    : ctx.expect === 'set' ? 'המתאמן באמצע סט או בסופו. אם הוא פונה למאמן הוא אומר "מוכן", "סיימתי", או את מספר החזרות שעשה. נשימות, מאמץ, מוזיקה ואנשים אחרים אינם דיבור: אם לא נאמר משפט ברור, החזר טקסט ריק.'
    : 'התשובה קצרה: מילה או מספר.';
  return `מתאמן בחדר כושר רועש עונה למאמן קולי בעברית, במשפט קצר. ${expect} כתוב מספרים בספרות. אל תוסיף מילים שלא נאמרו.`;
}

/** base64 → bytes, in a Worker (no Buffer). */
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

/** A 24 kHz (or any rate) 16-bit mono PCM buffer, wrapped in a RIFF header. */
export function pcmToWav(pcm: Uint8Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const put = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); put(8, 'WAVE');
  put(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  put(36, 'data'); v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

const isWav = (b: Uint8Array) => b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46;

async function timed<T extends { ms: number }>(f: () => Promise<Omit<T, 'ms'>>): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await f();
    return { ...r, ms: Date.now() - t0 } as T;
  } catch (e) {
    return { ok: false, why: String((e as Error)?.message ?? e).slice(0, 160), ms: Date.now() - t0 } as unknown as T;
  }
}

// ── HEAR ──────────────────────────────────────────────────────────────────────────────────────────

export async function hear(keys: VoiceKeys, wavBase64: string, ctx: HearContext, ear = DEFAULT_EAR, deadlineMs = 6_000): Promise<HearResult> {
  const [provider, model] = ear.split(':');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    if (provider === 'openai') return await hearOpenAI(keys, wavBase64, ctx, model, controller.signal);
    return { ok: false, why: 'unknown_ear', ms: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function hearOpenAI(keys: VoiceKeys, wavBase64: string, ctx: HearContext, model: string, signal: AbortSignal): Promise<HearResult> {
  return timed<HearResult>(async () => {
    if (!keys.OPENAI_API_KEY) return { ok: false, why: 'no_key' };
    const form = new FormData();
    form.append('file', new Blob([fromBase64(wavBase64) as unknown as BlobPart], { type: 'audio/wav' }), 'answer.wav');
    form.append('model', model);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    const lang = (ctx.lang ?? 'he').startsWith('he') ? 'he' : 'en';
    if (model === 'gpt-transcribe') {
      form.append('languages[]', lang);
      form.append('prompt', hearPrompt(ctx));
      for (const k of lang === 'he' ? HE_WORDS : []) form.append('keywords[]', k);
    } else {
      form.append('language', lang);
      form.append('prompt', hearPrompt(ctx));
    }
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${keys.OPENAI_API_KEY}` },
      body: form,
      signal,
    });
    if (!res.ok) return { ok: false, why: `http_${res.status}:${(await res.text().catch(() => '')).slice(0, 120)}` };
    const body = (await res.json()) as { text?: string };
    return { ok: true, text: String(body.text ?? '').trim(), model };
  });
}

// ── SAY ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * How the coach sounds. One sentence of direction, the same for every line, so a workout is one
 * voice — clear before warm.
 *
 * ⛔ A COACH'S PACE, NOT A NARRATOR'S (2026-10-05). The direction asked for "slightly slow", and the
 * voice took it at its word: eleven seconds for the first workout's opening, eight for a lift's.
 * The founder's verdict on the workout was that the talking was the friction. Brisk and natural now;
 * the one thing still asked to be distinct is a number.
 */
const STYLE_HE = 'מאמנת כושר אישית ישראלית באמצע אימון: ברורה, בטוחה ועניינית, חמה אבל לא מתלהבת. קצב דיבור טבעי וזריז, בלי הפסקות ארוכות בין המשפטים; מספרים נאמרים בבירור.';
const SPEED = 1.15;
const STYLE_EN = 'A personal trainer mid-workout in a gym: clear, confident and to the point, warm but not excited. A natural, brisk pace with no long pauses between sentences; numbers said clearly.';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ ONE VOICE, MEASURED — NOT ONE VOICE, ASKED FOR (founder's phone, build 79, 2026-10-12)
 *
 *   > *"זה בוודאות לא נאמר באותו הקול. היה גם פעם אחת את הקול של כרמית ופעם אחת את הקול של נקבה של
 *   > OpenAI ופעם אחת היה קול של גבר ונראה לי גם הוא מ-OpenAI."*
 *
 * He was right three times, and each was measured the same evening (`server/voiceDrift.cjs`, 175
 * clips of `marin` through this Worker; the pitch is `voicePitch.ts`):
 *
 *   · CARMIT. The phone waits four seconds for a line and then says it itself. 18–39% of requests
 *     to the model's unversioned name hung until the twelve-second deadline here; asked in the same
 *     minutes, its dated version answered 18 of 18 in 1.3 s. → `PINNED_MODEL`.
 *   · ANOTHER WOMAN. One named voice, the same word: "קדימה." between 166 and 250 Hz. The model does
 *     not hold a voice from one request to the next, and a short line gives it least to hold on to
 *     (a long line stays within about a tenth). → a short line is asked for THREE times at once and
 *     the take nearest the voice's own pitch is the line (`VOICE_PITCH_HZ`). On the measured clips
 *     that brings "קדימה." from 175–235 Hz down to 179–198.
 *   · A MAN. One clip in 175 came back at a steady 95 Hz from a woman's voice. → a take that far
 *     from the voice is REFUSED, and no line at all is better than that one: the phone keeps every
 *     clip for good, so a bad take of "נרשם." is not heard once — it is heard after every set.
 *
 * And a request that says nothing is not waited on alone: past `HEDGE_*` with nothing in hand,
 * one more is sent, and whichever answers is the line.
 *
 * What this cannot do is hear a timbre. It measures pitch — the largest part of "another woman" by
 * the numbers, and the only part of it a Worker can afford. If two women are still heard after
 * this, the next question is the style direction below (reports say it makes the drift worse), and
 * that one is settled by ears, not by this file.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** OpenAI's unversioned name → the dated version this Worker asks for. The app's ids do not change. */
export const PINNED_MODEL: Readonly<Record<string, string>> = { 'gpt-4o-mini-tts': 'gpt-4o-mini-tts-2025-12-15' };

/**
 * Each offered voice's own pitch, Hz — the median over real coach lines on the pinned model, read
 * with `voicePitch.ts` (2026-10-12). A voice not here (a probe's candidate) is never refused, and
 * the middle take of its three is the line.
 */
export const VOICE_PITCH_HZ: Readonly<Record<string, number>> = {
  marin: 191, // 226 clips
  coral: 201, // 24 clips each from here down — enough for a middle, and re-measured with `voiceDrift.cjs`
  sage: 181,
  shimmer: 154,
  nova: 169,
};

/** A line this short is asked for three times; a longer one holds its voice and is asked for once. */
export const SHORT_LINE_CHARS = 40;
const TAKES_SHORT = 3;
/** Asks beyond the first ones — a refused take, a dead answer, or a silence past the hedge. */
const EXTRA_ASKS = 2;
/**
 * Not her. Of 322 clips of the five voices, every reading of `marin`, `sage`, `shimmer` and `nova`
 * sat between 0.83 and 1.33 of the voice's own pitch; the man sat at 0.49, and two takes of `coral`
 * saying "קדימה." at 1.5 — half as high again as herself, and refused with him.
 */
const NOT_HER_BELOW = 0.75;
const NOT_HER_ABOVE = 1.45;
/** Fewer voiced frames than this (20 ms each) and a clip is too short to judge — and is never refused for it. */
const MIN_VOICED = 8;
/** With a take in hand, the others are waited on this long and no longer. */
const SETTLE_MS = 2_200;
/** With nothing in hand after this long — longer for a longer line — one more request is sent. */
const HEDGE_BASE_MS = 2_500;
const HEDGE_PER_CHAR_MS = 10;

/** For tests: the two waits, shortened. */
export interface SayTuning {
  settleMs?: number;
  hedgeMs?: number;
}

type Reply = { ok: true; wav: Uint8Array } | { ok: false; why: string };
/** A result before `timed` stamps it — each arm of the union without its `ms`. */
type Unstamped = SayResult extends infer R ? (R extends unknown ? Omit<R, 'ms'> : never) : never;

async function oneTake(keys: VoiceKeys, text: string, lang: string, model: string, voiceName: string, signal: AbortSignal): Promise<Reply> {
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${keys.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        input: text,
        voice: voiceName,
        instructions: lang.startsWith('he') ? `דבר בעברית ישראלית טבעית, במבטא ישראלי. ${STYLE_HE}` : STYLE_EN,
        response_format: 'wav',
        speed: SPEED,
      }),
      signal,
    });
    if (!res.ok) return { ok: false, why: `http_${res.status}:${(await res.text().catch(() => '')).slice(0, 160)}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    // The phone plays and caches exactly this file — anything but a RIFF WAV is not a line.
    if (!isWav(bytes)) return { ok: false, why: 'not_wav' };
    return { ok: true, wav: bytes };
  } catch (e) {
    return { ok: false, why: String((e as Error)?.message ?? e).slice(0, 160) };
  }
}

interface Take {
  wav: Uint8Array;
  pitch: ClipPitch;
}

const measured = (p: ClipPitch) => p.voiced >= MIN_VOICED && p.hz > 0;
/** How far a clip is from a pitch — by its WORSE reading (`voicePitch.ts` says why there are two). */
const farFrom = (p: ClipPitch, hz: number) => Math.max(Math.abs(p.hz - hz), Math.abs(p.strong - hz));
/** A clip that can be heard, and is not this voice. */
function notHer(p: ClipPitch, hers: number): boolean {
  if (!hers || !measured(p)) return false;
  return Math.min(p.hz, p.strong) < hers * NOT_HER_BELOW || Math.max(p.hz, p.strong) > hers * NOT_HER_ABOVE;
}

/** The take that is the line: nearest her pitch — or, for a voice with no pitch on file, the middle one. */
function chosen(takes: readonly Take[], hers: number): Take {
  const heard = takes.filter((t) => measured(t.pitch));
  if (heard.length === 0) return takes[0];
  if (hers) return heard.reduce((best, t) => (farFrom(t.pitch, hers) < farFrom(best.pitch, hers) ? t : best));
  return [...heard].sort((a, b) => a.pitch.hz - b.pitch.hz)[Math.floor(heard.length / 2)];
}

/** A refused take, a reply that was no WAV, a provider's own fault: worth one more ask. A 4xx is not. */
const worthAnother = (why: string) => why === 'not_her_voice' || why === 'not_wav' || /^http_5/.test(why);

export function say(keys: VoiceKeys, text: string, lang: string, voice = DEFAULT_VOICE, deadlineMs = 12_000, tune: SayTuning = {}): Promise<SayResult> {
  const [provider, model, voiceName] = voice.split(':');
  return timed<SayResult>(async () => {
    if (provider !== 'openai') return { ok: false, why: 'unknown_voice' };
    if (!keys.OPENAI_API_KEY) return { ok: false, why: 'no_key' };
    const spoke = PINNED_MODEL[model] ?? model;
    const hers = VOICE_PITCH_HZ[voiceName] ?? 0;
    const want = text.length <= SHORT_LINE_CHARS ? TAKES_SHORT : 1;
    const settleMs = tune.settleMs ?? SETTLE_MS;
    const hedgeMs = tune.hedgeMs ?? HEDGE_BASE_MS + HEDGE_PER_CHAR_MS * text.length;
    const stop = new AbortController();

    return await new Promise<Unstamped>((resolve) => {
      const good: Take[] = [];
      let asks = 0;
      let back = 0;
      let settled = false;
      let over = false;
      let why = 'timeout';
      let again = false;
      const timers: ReturnType<typeof setTimeout>[] = [];
      const end = (r: Unstamped) => {
        if (over) return;
        over = true;
        for (const t of timers) clearTimeout(t);
        stop.abort(); // whatever is still on its way is not waited on, and not paid attention to
        resolve(r);
      };
      const line = () => {
        const take = chosen(good, hers);
        end({ ok: true, wav: take.wav, model, voice: voiceName, spoke, takes: good.length, hz: measured(take.pitch) ? take.pitch.hz : 0 });
      };
      const weigh = () => {
        if (over) return;
        if (back < asks) {
          // Some are still out: with a take in hand they are waited on until `settleMs`, and no longer.
          if (settled && good.length > 0) line();
          return;
        }
        if (good.length > 0) return line();
        if (again && asks < want + EXTRA_ASKS) {
          again = false;
          return ask();
        }
        end({ ok: false, why });
      };
      const ask = () => {
        asks += 1;
        void oneTake(keys, text, lang, spoke, voiceName, stop.signal).then((r) => {
          back += 1;
          if (over) return;
          if (r.ok) {
            const pitch = wavPitch(r.wav);
            if (notHer(pitch, hers)) {
              why = 'not_her_voice';
              again = true;
            } else {
              good.push({ wav: r.wav, pitch });
            }
          } else {
            why = r.why;
            if (worthAnother(r.why)) again = true;
          }
          weigh();
        });
      };
      for (let i = 0; i < want; i++) ask();
      timers.push(
        setTimeout(() => {
          settled = true;
          weigh();
        }, settleMs),
      );
      // Nothing in hand and at least one request still silent: it is not waited on alone.
      timers.push(
        setTimeout(() => {
          if (!over && good.length === 0 && back < asks && asks < want + EXTRA_ASKS) ask();
        }, hedgeMs),
      );
      timers.push(setTimeout(() => (good.length > 0 ? line() : end({ ok: false, why: back < asks ? 'timeout' : why })), deadlineMs));
    });
  });
}

export { toBase64 };
