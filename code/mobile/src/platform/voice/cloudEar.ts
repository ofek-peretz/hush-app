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
/**
 * How long a stretch only the strong ear can answer waits for it.
 *
 * ⛔ FOUR SECONDS, AND WHY IT IS A NUMBER AT ALL (founder, 2026-10-05: *"למה דווקא כאשר עבר 2.6 שניות…
 * למה דווקא מספר השניות הזה"*). The stretch always reaches the strong ear; this is only how long the
 * phone waits for the words to come back before it stops waiting — some bound is needed, or one
 * dead connection would hold the coach silent for ever. 2.6 was a desk guess from the day the strong
 * ear was the SECOND opinion and the phone's own sentence stood ready behind it. It is the first ear
 * now, and on many phones there is nothing behind it: a late answer is worth more than a fast "I did
 * not hear you". Measured through the Worker it answers in 0.4–1.4 s; four leaves a gym's network
 * room, and is the same patience the coach's own voice is given (`coachVoice` NEURAL_WAIT_MS).
 */
export const RESCUE_MS = 4_000;
/** The audio heard again with a sentence — the utterance just finished, and a little before it. */
export const CHECK_SECONDS = 4;
/** Inside a long window, how often a stretch the phone understood nothing in is heard again. */
export const LISTEN_EVERY_MS = 4_000;
/** The louder part of a stretch over its quietest, in dB, before it is taken for a voice clearly above the room. */
export const VOICED_DB = 10;
/** …and before the room is taken to have stirred at all. Under this it is flat: a hum, an empty room. */
export const STIRRED_DB = 5;

/** Did the stretch hear a voice clearly above the room? */
export function voiced(clip: EarClip | null): clip is EarClip {
  return !!clip && clip.seconds >= 0.3 && clip.peakDb - clip.floorDb >= VOICED_DB;
}

/** Did anything at all happen in the stretch — or was the room flat from end to end? */
export function stirred(clip: EarClip | null): clip is EarClip {
  return !!clip && clip.seconds >= 0.3 && clip.peakDb - clip.floorDb >= STIRRED_DB;
}

/**
 * ════ ⛔ THE PHONE'S LOUDNESS METER DECIDES HOW EARLY SHE IS HEARD — NEVER WHETHER (2026-10-05) ════
 *
 *   > founder: *"ובדקת בקוד שזה אמור לעבוד? הכל אמור לעבוד חלק?"*
 *
 * It was checked, and this is what the check found. Every stretch had to be "voiced" — its loudest
 * tenth of a second ten decibels over its quietest — before the strong ear was sent it at all. Ten
 * was a desk guess. Measured the same day (forty clips: "עשר", "מוכן", "שתים עשרה", "סיימתי" under
 * a steady room and under a beat, the word from 15 dB over the room down to 5 dB UNDER it; twelve
 * more of the room alone):
 *
 *     the strong ear heard the word right      39 of 40 — every one down to the room's own level,
 *                                              7 of 8 with the room five decibels LOUDER than her
 *     the phone would have sent it             25 of 40 — never once the room was as loud as she was
 *     the room alone (hum, beat, breath,       twelve of twelve came back empty: no answer invented
 *     plates), sent anyway
 *
 * So in a loud gym the ear that hears her was never asked, by a meter that cannot tell her from the
 * room — and his own report of that kind of workout was *"אני מדבר ואין מענה בכלל"*. Loudness cannot
 * make this decision; the recognizer can. What the level is still good for is being EARLY (it finds
 * where she stopped — `voiceCapture`'s endpoint) and for not sending an empty room:
 *
 *   · `spoken` — the level found her stopping. Sent as it is: it is not judged a second time, by a
 *     different quietest moment than the one that found it.
 *   · a window in which the coach is WAITING for her word (a question's end, the long window's own
 *     listen) — sent unless the room was flat from end to end (`stirred`). Flat is an empty room or
 *     a hum; a word in it is far over five decibels, and under a hum that loud nobody hears it.
 *   · a PATIENT window — nobody is waiting on a clock for her word: a set under way (she is
 *     lifting, and the question that follows is her other way to say it), a pause past its first
 *     minute. Only a voice clearly above the room is sent (`voiced`), and never on a timer.
 */
export function worthHearing(clip: EarClip | null, patient: boolean, moment: 'end' | 'during' | 'spoken'): clip is EarClip {
  if (!clip || clip.seconds < 0.3) return false;
  if (moment === 'spoken') return true;
  return patient ? voiced(clip) : stirred(clip);
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

/*
 * ════ ⛔ AN EAR THAT CANNOT BE REACHED IS NOT HER SILENCE (2026-10-05) ════
 *
 *   > founder: *"חייב לבדוק את כל מקרי הקצה ולוודא שהשמע עובד בהכל."*
 *
 * A basement gym, a dead corner, a day's budget spent: the strong ear does not answer. Until today
 * that was indistinguishable from her saying nothing — the window ran out as a `timeout`, the coach
 * asked again, said "לא שמעתי", and did it all over at the next set, for the whole workout, while he
 * answered every time. On a phone with a recognizer of its own that one still hears; on every other
 * phone nothing can.
 *
 * So the ear keeps count of answers it could not give because it could not be REACHED (offline, a
 * timeout, a refusal from the Worker) — never of the ones where it simply heard no words. Two in a
 * row and it is `deaf` for `DEAF_RETRY_MS`; `voiceCapture` ends such a window as `deaf`, the coach
 * says ONCE that she cannot hear and where to mark the sets, and no window is opened into the
 * void. After the wait one window is tried again (`useVoiceCoach` lets the ear listen): reached,
 * and she hears as before; not reached, and it waits again — in silence, it has been said.
 */
export const DEAF_AFTER = 2;
export const DEAF_RETRY_MS = 45_000;
let unreached = 0;
let deafUntilMs = 0;
function note(r: { ok: true } | { ok: false; why: string }): void {
  if (r.ok) {
    unreached = 0;
    return;
  }
  if (r.why !== 'offline' && r.why !== 'timeout' && !r.why.startsWith('http_')) return;
  unreached += 1;
  if (unreached >= DEAF_AFTER) deafUntilMs = Date.now() + DEAF_RETRY_MS;
}

export const cloudEar = {
  /** Her switch (profile) — on unless she turned it off. */
  setEnabled(on: boolean): void {
    enabled = on;
  },
  available(): boolean {
    return enabled && voiceCloudReachable();
  },
  /** The strong ear could not be reached, twice running, moments ago: until it is tried again, it hears nothing. */
  deaf(): boolean {
    return unreached >= DEAF_AFTER && Date.now() < deafUntilMs;
  },
  /** A new workout: a network that failed last time is tried again at once. */
  reset(): void {
    unreached = 0;
    deafUntilMs = 0;
  },

  /** A sentence the phone heard, as the strong ear heard the same audio — or the phone's, unchanged. */
  async check(token: number, device: string, expect: HearExpect, locale: string): Promise<string> {
    if (!cloudEar.available()) return device;
    const clip = await audioSession.earClip(token, CHECK_SECONDS);
    if (!clip) return device;
    const r = await cloudHear(clip.wav, expect, locale, STRONG_WAIT_MS);
    note(r);
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

  /**
   * A stretch of the window as the strong ear heard it: the utterance she has just finished (`spoken`
   * — the strong ear's own turn, 2026-10-05), or a stretch the phone understood nothing in (`end` of a
   * window, `during` a long one). Which stretches are sent at all: `worthHearing`.
   */
  async rescue(clip: EarClip | null, expect: HearExpect, locale: string, moment: 'end' | 'during' | 'spoken', patient = expect === 'set'): Promise<string | null> {
    if (!cloudEar.available() || !worthHearing(clip, patient, moment)) return null;
    const r = await cloudHear(clip.wav, expect, locale, RESCUE_MS);
    note(r);
    void track('voice_strong_ear', { moment, ok: r.ok, why: r.ok ? null : r.why, strong: r.ok ? r.text.slice(0, 40) : null });
    return r.ok && r.text.length > 0 ? r.text : null;
  },

  /**
   * The profile's measurement hearing one clip (`voiceMeasure`): sent whatever its level — how a
   * microphone's audio reads to the strong ear is the thing being measured — and leaving no mark on
   * the workout's ear (a measurement on a bad network must not make the next workout's ear "deaf").
   */
  async hearNow(clip: EarClip, expect: HearExpect, locale: string, waitMs = 8_000): Promise<{ text: string | null; why: string | null }> {
    if (!voiceCloudReachable()) return { text: null, why: 'unreachable' };
    const r = await cloudHear(clip.wav, expect, locale, waitMs);
    return r.ok ? { text: r.text.length > 0 ? r.text : null, why: null } : { text: null, why: r.why };
  },
};

function sameAnswer(a: string, b: string): boolean {
  return JSON.stringify(parseVoiceAnswer(a)) === JSON.stringify(parseVoiceAnswer(b));
}
