/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE STRONG EAR (2026-09-28) — the best recognizer there is hears EVERY answer; the phone's own is
 * the backup.
 *
 * Founder: *"אם יש מנוע תמלול טוב וחזק יותר ממה שיש לנו כיום עדיף לדעתי יהיה להשתמש בו מאחר וזה הקלט
 * של האימון."* The input of the workout is her voice, so the strongest ear decides what she said:
 *
 *   · EVERY SENTENCE the phone hears (Apple's SpeechAnalyzer, from the pocket) is heard again by the
 *     cloud recognizer (`server/voice.ts`, OpenAI `gpt-transcribe` — built for short phrases, numbers
 *     and loud rooms) on the same audio: the last `CHECK_SECONDS` the microphone kept. Where the strong
 *     ear understood an answer, its words are the ones handed on; where it did not (noise, silence,
 *     no network, a slow answer past `STRONG_WAIT_MS`), the phone's words go on unchanged — so a
 *     basement with no signal is exactly the voice that shipped before.
 *   · A MISS — the phone heard nothing it could finalise, but the microphone heard a voice — is heard
 *     by the strong ear too: at a window's end, and every few seconds inside a long window ("מוכן"
 *     said at the rack is not left waiting ninety seconds).
 *
 * The price is about a second after each answer (the round trip), and a fraction of a cent a workout.
 * What the strong ear returns is only WORDS: they go through the same closed grammar and the same echo
 * as every other sentence — it can mis-hear like any ear, and never writes anything by itself.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { parseVoiceAnswer } from '@/domain/voiceGrammar';
import { track } from '@/platform/telemetry';
import { audioSession, type EarClip } from '@/platform/voice/audioSession';
import { cloudHear, voiceCloudReachable, type HearExpect } from '@/platform/voice/voiceCloud';

/** How long an answer the phone heard waits for the strong ear before the phone's words go on. */
export const STRONG_WAIT_MS = 1_600;
/** How long a missed stretch waits for the strong ear. */
export const RESCUE_MS = 2_600;
/** The audio heard again with a sentence — the utterance just finished, and a little before it. */
export const CHECK_SECONDS = 4;
/** Inside a long window, how often a stretch the phone understood nothing in is heard again. */
export const LISTEN_EVERY_MS = 4_000;
/** The louder part of a stretch over its quietest, in dB, before it is taken for a voice at all. */
export const VOICED_DB = 10;

/** Did the stretch hear a voice, or only the room? (A stretch of noise is never sent.) */
export function voiced(clip: EarClip | null): clip is EarClip {
  return !!clip && clip.seconds >= 0.3 && clip.peakDb - clip.floorDb >= VOICED_DB;
}

/**
 * The phone's words and the strong ear's → the words handed on. The strong ear decides whenever it
 * understood an answer at all; noise, nothing, or no answer from it leaves the phone's sentence.
 */
export function pickHeard(device: string, strong: string | null): string {
  if (!strong) return device;
  return parseVoiceAnswer(strong) != null ? strong : device;
}

let enabled = true;

export const cloudEar = {
  /** Her switch (profile) — on unless she turned it off. */
  setEnabled(on: boolean): void {
    enabled = on;
  },
  available(): boolean {
    return enabled && voiceCloudReachable();
  },

  /** A sentence the phone heard, as the strong ear heard the same audio — or the phone's, unchanged. */
  async check(token: number, device: string, expect: HearExpect, locale: string): Promise<string> {
    if (!cloudEar.available()) return device;
    const clip = await audioSession.earClip(token, CHECK_SECONDS);
    if (!clip) return device;
    const r = await cloudHear(clip.wav, expect, locale, STRONG_WAIT_MS);
    const strong = r.ok ? r.text : null;
    const chosen = pickHeard(device, strong);
    void track('voice_strong_ear', {
      moment: 'answer',
      ok: r.ok,
      why: r.ok ? null : r.why,
      agree: strong != null && sameAnswer(device, strong),
      device: device.slice(0, 40),
      strong: strong ? strong.slice(0, 40) : null,
      used: chosen === device ? 'device' : 'strong',
    });
    return chosen;
  },

  /** A stretch the phone understood nothing in: what the strong ear heard, if the microphone heard a voice. */
  async rescue(clip: EarClip | null, expect: HearExpect, locale: string, moment: 'end' | 'during'): Promise<string | null> {
    if (!cloudEar.available() || !voiced(clip)) return null;
    const r = await cloudHear(clip.wav, expect, locale, RESCUE_MS);
    void track('voice_strong_ear', { moment, ok: r.ok, why: r.ok ? null : r.why, strong: r.ok ? r.text.slice(0, 40) : null });
    return r.ok && r.text.length > 0 ? r.text : null;
  },
};

function sameAnswer(a: string, b: string): boolean {
  return JSON.stringify(parseVoiceAnswer(a)) === JSON.stringify(parseVoiceAnswer(b));
}
