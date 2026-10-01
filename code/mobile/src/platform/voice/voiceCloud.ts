/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE VOICE'S CLOUD HALF, FROM THE PHONE (2026-09-27) — `server/voice.ts` behind the coach Worker.
 *
 * Founder: *"אפשר לעשות שיהיה מנוע זיהוי דיבור טוב יותר? … ולגבי הקול של כרמית … תטפל בהכל ותיקח את
 * החוויה הזאת לקצה היכולת."*
 *
 * Two calls: HEAR (a window's audio → the words, for `cloudEar`) and SAY (a line → a natural voice's
 * WAV, for `neuralVoice`). Both are OPTIONAL by construction: no network in a basement gym, a signed-
 * out install, an exhausted budget, a slow answer — every one of them is `{ ok: false }`, and the
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

async function post<T>(route: string, body: Record<string, unknown>, timeoutMs: number): Promise<({ ok: true } & T) | CloudFail> {
  if (!voiceCloudReachable()) return { ok: false, why: 'unconfigured' };
  // The voice's doors are for a signed-in athlete (a workout always is); no session, no call.
  const session = await identitySessionToken().catch(() => null);
  if (!session) return { ok: false, why: 'signed_out' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${COACH_URL}${route}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hush-token': COACH_TOKEN,
        'x-hush-install': await installId(),
        authorization: `Bearer ${session}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, why: `http_${res.status}` };
    const json = (await res.json()) as T;
    return { ok: true, ...json };
  } catch (e) {
    return { ok: false, why: (e as Error)?.name === 'AbortError' ? 'timeout' : 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** What the open question expects — steers the cloud recognizer (`server/voice.ts` `hearPrompt`). */
export type HearExpect = 'ready' | 'reps' | 'confirm' | 'resume' | 'any';

export async function cloudHear(wavBase64: string, expect: HearExpect, lang: string, timeoutMs: number): Promise<{ ok: true; text: string } | CloudFail> {
  const r = await post<{ text?: string }>('/voice/hear', { audio: wavBase64, expect, lang: lang.startsWith('he') ? 'he' : 'en' }, timeoutMs);
  if (!r.ok) return r;
  return { ok: true, text: String(r.text ?? '').trim() };
}

export async function cloudSay(text: string, lang: string, voice: string, timeoutMs: number): Promise<{ ok: true; audio: string; voice: string } | CloudFail> {
  const r = await post<{ audio?: string; voice?: string }>('/voice/say', { text, lang: lang.startsWith('he') ? 'he' : 'en', voice }, timeoutMs);
  if (!r.ok) return r;
  if (typeof r.audio !== 'string' || r.audio.length < 100) return { ok: false, why: 'no_audio' };
  return { ok: true, audio: r.audio, voice: String(r.voice ?? voice) };
}
