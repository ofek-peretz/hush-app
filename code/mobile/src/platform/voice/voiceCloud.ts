/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE VOICE'S CLOUD HALF, FROM THE PHONE (2026-09-27) — `server/voice.ts` behind the coach Worker.
 *
 * Founder: *"אפשר לעשות שיהיה מנוע זיהוי דיבור טוב יותר? … ולגבי הקול של כרמית … תטפל בהכל ותיקח את
 * החוויה הזאת לקצה היכולת."*
 *
 * Two calls: HEAR (a window's audio → the words, for `cloudEar`) and SAY (a line → a natural voice's
 * WAV, for `neuralVoice`). Both are OPTIONAL by construction: no network in a basement gym, an
 * exhausted budget, a slow answer — every one of them is `{ ok: false }` with its reason, and the
 * caller carries on with the on-device ear and Carmit exactly as before. Nothing here decides what
 * she meant: the words go through the closed grammar like any other sentence.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { identitySessionToken } from '@/platform/circleClient';
import { deviceContext } from '@/platform/deviceContext';

/* Direct `process.env.EXPO_PUBLIC_*` reads — the only form the bundler inlines. */
const COACH_URL = (process.env.EXPO_PUBLIC_COACH_URL || '').replace(/\/+$/, '');
const COACH_TOKEN = process.env.EXPO_PUBLIC_COACH_TOKEN || '';

let installIdCache: string | null = null;
async function installId(): Promise<string> {
  if (installIdCache != null) return installIdCache;
  try {
    installIdCache = (await deviceContext()).device_id;
  } catch {
    installIdCache = '';
  }
  return installIdCache;
}

export function voiceCloudReachable(): boolean {
  return COACH_URL.length > 0 && COACH_TOKEN.length > 0;
}

export type CloudFail = { ok: false; why: string };

/** Why the last call to each door failed — null after one that answered. Read by the profile's voice row. */
const lastWhy: { hear: string | null; say: string | null } = { hear: null, say: null };
export function voiceCloudLastFailure(): { hear: string | null; say: string | null } {
  return { ...lastWhy };
}

/*
 * ⛔ A WORKOUT IS NOT SIGNED IN BY CONSTRUCTION (2026-10-05). This returned `signed_out` without
 * calling whenever the Keychain held no session — and half of all installs train their first workout
 * before they have an account (`signInAfterFirstWorkout`), a session is minted by one fire-and-forget
 * request at sign-in, and a native sign-in that fails degrades to a local stub. On the founder's
 * first workout with the voice no session existed at all: every line was Carmit ("כמו סירי"), the
 * strong ear heard nothing, and nothing said why. The call is now made either way: with her session
 * when she has one, and by the install otherwise — the Worker serves that from its own, smaller pool.
 */
async function post<T>(door: 'hear' | 'say', route: string, body: Record<string, unknown>, timeoutMs: number): Promise<({ ok: true } & T) | CloudFail> {
  const fail = (why: string): CloudFail => {
    lastWhy[door] = why;
    return { ok: false, why };
  };
  if (!voiceCloudReachable()) return fail('unconfigured');
  const session = await identitySessionToken().catch(() => null);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${COACH_URL}${route}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hush-token': COACH_TOKEN,
        'x-hush-install': await installId(),
        ...(session ? { authorization: `Bearer ${session}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return fail(`http_${res.status}`);
    const json = (await res.json()) as T;
    lastWhy[door] = null;
    return { ok: true, ...json };
  } catch (e) {
    return fail((e as Error)?.name === 'AbortError' ? 'timeout' : 'offline');
  } finally {
    clearTimeout(timer);
  }
}

/** What the open question expects — steers the cloud recognizer (`server/voice.ts` `hearPrompt`). */
/** `set`: a set is under way (or about to be) — she may say "מוכן", or report it herself. */
export type HearExpect = 'ready' | 'reps' | 'confirm' | 'resume' | 'set' | 'any';

export async function cloudHear(wavBase64: string, expect: HearExpect, lang: string, timeoutMs: number): Promise<{ ok: true; text: string } | CloudFail> {
  const r = await post<{ text?: string }>('hear', '/voice/hear', { audio: wavBase64, expect, lang: lang.startsWith('he') ? 'he' : 'en' }, timeoutMs);
  if (!r.ok) return r;
  return { ok: true, text: String(r.text ?? '').trim() };
}

export async function cloudSay(text: string, lang: string, voice: string, timeoutMs: number): Promise<{ ok: true; audio: string; voice: string } | CloudFail> {
  const r = await post<{ audio?: string; voice?: string }>('say', '/voice/say', { text, lang: lang.startsWith('he') ? 'he' : 'en', voice }, timeoutMs);
  if (!r.ok) return r;
  if (typeof r.audio !== 'string' || r.audio.length < 100) return { ok: false, why: 'no_audio' };
  return { ok: true, audio: r.audio, voice: String(r.voice ?? voice) };
}
