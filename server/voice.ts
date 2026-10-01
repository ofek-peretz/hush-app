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
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface VoiceKeys {
  OPENAI_API_KEY?: string;
}

/** What the question on the phone expects — steers the recognizer toward the few things she can say. */
export interface HearContext {
  /** 'ready' (the loading dialogue), 'reps' (a number of reps), 'confirm', 'resume', 'any'. */
  expect?: string;
  /** 'he' | 'en'. */
  lang?: string;
}

export type HearResult = { ok: true; text: string; model: string; ms: number } | { ok: false; why: string; ms: number };
export type SayResult = { ok: true; wav: Uint8Array; model: string; voice: string; ms: number } | { ok: false; why: string; ms: number };

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
 * voice — clear before warm, and never rushed (numbers said slowly enough to act on).
 */
const STYLE_HE = 'מאמנת כושר אישית ישראלית: ברורה, רגועה ובטוחה, חמה אבל לא מתלהבת; קצב מעט איטי, ומספרים נאמרים בבירור.';
const STYLE_EN = 'A personal trainer in a gym: clear, calm and confident, warm but not excited; slightly slow, numbers said clearly.';

export async function say(keys: VoiceKeys, text: string, lang: string, voice = DEFAULT_VOICE, deadlineMs = 12_000): Promise<SayResult> {
  const [provider, model, voiceName] = voice.split(':');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    if (provider === 'openai') return await sayOpenAI(keys, text, lang, model, voiceName, controller.signal);
    return { ok: false, why: 'unknown_voice', ms: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function sayOpenAI(keys: VoiceKeys, text: string, lang: string, model: string, voiceName: string, signal: AbortSignal): Promise<SayResult> {
  return timed<SayResult>(async () => {
    if (!keys.OPENAI_API_KEY) return { ok: false, why: 'no_key' };
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${keys.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        input: text,
        voice: voiceName,
        instructions: lang.startsWith('he') ? `דבר בעברית ישראלית טבעית, במבטא ישראלי. ${STYLE_HE}` : STYLE_EN,
        response_format: 'wav',
      }),
      signal,
    });
    if (!res.ok) return { ok: false, why: `http_${res.status}:${(await res.text().catch(() => '')).slice(0, 160)}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    // The phone plays and caches exactly this file — anything but a RIFF WAV is not a line.
    if (!isWav(bytes)) return { ok: false, why: 'not_wav' };
    return { ok: true, wav: bytes, model, voice: voiceName };
  });
}

export { toBase64 };
