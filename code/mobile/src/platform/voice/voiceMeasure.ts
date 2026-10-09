/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE MEASUREMENT — WHICH ACT STOPS HER MUSIC, ASKED OF THE PHONE ONE ACT AT A TIME. (2026-10-10)
 *
 * The standing rule (founder, 2026-10-06): *"אתה לא יכול לבדוק את זה באינטרנט … אם זה אמור או יכול
 * לעבוד והאם יש תקדים לזה שהצליחו? … אני לא רוצה שישר תתחיל לעשות מבלי לתכנן לפני … אנחנו בונים פה
 * סטארטאפ לא צעצוע."* What a search cannot settle is asked of his phone, once, with the decision each
 * answer makes written down before the answers exist (`docs/canonical/FERROX_VOICE_SCREENPLAY.md` §10).
 *
 * THE FIRST MEASUREMENT (build 77) asked three ways to lower his music while the microphone is
 * held. His phone answered something more basic: a locked phone refused to change its session at
 * all, Apple's voice processing threw the sound out of the earbuds — and his music was not lowered
 * by any of it, because it had STOPPED at the coach's first word. Then, from a workout:
 *   > *"התחלתי אימון והמוזיקה נעצרה … איך שהמאמנת התחילה לדבר המוזיקה שוב נעצרה לגמרי."*
 * and from the profile's one-line test, where no microphone is held:
 *   > *"לחצתי על בדיקת קול המוזיקה נחלשה."*
 *
 * So the workout holds no microphone now (`workoutMicrophone`), and THIS measurement asks the one
 * thing that decides whether it ever can again: which act stops Spotify, and whether any way of
 * holding the microphone does not.
 *
 *   PART ONE — ten trials, on glass, nobody speaking and nothing in a pocket. Each opens the session
 *   one way, makes one soft tone, and lets go; after each act the phone itself is asked whether
 *   another app is still playing. Letting go is what made Spotify resume by itself last time, so
 *   the next trial starts when it has (and if it has not, she is asked to press Play).
 *   PART TWO — the workout's own duck, with the silent loop a workout runs: one line of the coach,
 *   and two questions only ears can answer (lowered? given back?). In the profile's test it works;
 *   inside a workout nobody has ever checked.
 *
 * ⛔ Nothing here is a workout's. The flow takes a `MeasurePhone` so `theMeasurementAsksThePhone` can
 * walk it over phones that behave each way: it always ends, and it always leaves the phone as it
 * found it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { audioSession, type DuckReport, type TrialFacts } from '@/platform/voice/audioSession';
import { coachVoice } from '@/platform/voice/coachVoice';
import { neuralVoice } from '@/platform/voice/neuralVoice';

/**
 * The trials, in the order they are run — by the names `HushSessionTrial.swift` knows them by.
 * The control first (her music must survive it, or the instrument itself is wrong); the workout's
 * own way of holding the microphone before its variations; voice processing last, because its tone
 * is the one she is asked about by ear.
 */
export const TRIALS = [
  'playback',
  'mic only',
  'mic + line',
  'mic + restate + line',
  'mic + line through engine',
  'mic fresh + line',
  'mic, no speaker option + line',
  'mic + duck option + line',
  'record session, no mic + line',
  'voice processing + line',
] as const;
export type TrialName = (typeof TRIALS)[number];

/** How long her music is given to come back by itself after a trial lets go. */
export const RESUME_MS = 8_000;
/** How long she is given to start it again by hand. */
export const HAND_MS = 40_000;
/** A breath of music between two trials — so each begins from music that is really playing. */
export const SETTLE_MS = 1_200;
/** The silent loop runs this long before the duck, as it has in a workout. */
export const WARM_MS = 1_500;
/** After the line: the music's time to come back before the phone is asked. */
export const AFTER_MS = 3_000;
const POLL_MS = 400;

/** One thing the phone reported, as it is printed on the profile and written in the voice journal. */
export interface MeasureFact {
  step: string;
  [key: string]: string | number | boolean | null | undefined;
}

/** What only her ears can answer — asked on the screen afterwards. */
export type MeasureAsk = 'last' | 'during' | 'after';

export interface MeasureLines {
  /** The coach's one line, long enough to hear what her music does under it. */
  duckLine: string;
}

export interface MeasurePhone {
  wait(ms: number): Promise<void>;
  onGlass(): boolean;
  /** Is another app's audio playing, as iOS says? Null when the phone cannot say. */
  music(): boolean | null;
  /** The screen stays lit: a phone that locks itself mid-way refuses every act that follows. */
  keepAwake(on: boolean): void;
  /** She is shown (or no longer shown) that her music has to be started again by hand. */
  askForMusic(on: boolean): void;
  trial(name: TrialName): Promise<TrialFacts>;
  hold(): Promise<void>;
  release(): Promise<void>;
  duck(): Promise<void>;
  unduck(): Promise<void>;
  duckReport(): DuckReport | null;
  /** The coach's line on the phone before it is needed: nothing is fetched while her music is lowered. */
  prepare(line: string): Promise<void>;
  /** The coach's line, with nothing done to the session around it. */
  speak(line: string): Promise<void>;
}

export interface MeasureOutcome {
  ended: 'done' | 'no music' | 'left the screen' | 'threw';
  asked: MeasureAsk[];
  /** The trials after whose sound another app was still playing — the ways that live with her music. */
  lives: TrialName[];
  /** …and those after which it was not. */
  stops: TrialName[];
}

/** A port in the words the answer is read in. Anything not named here is printed as iOS named it. */
const PORTS: Record<string, string> = {
  MicrophoneBuiltIn: 'phone mic',
  BluetoothHFP: 'earbuds CALL',
  BluetoothA2DPOutput: 'earbuds MUSIC',
  BluetoothLE: 'earbuds LE',
  Speaker: 'PHONE SPEAKER',
  Receiver: 'phone earpiece',
  Headphones: 'wired',
  HeadsetMicrophone: 'wired mic',
};
const port = (p: string | undefined): string | undefined => (p == null ? undefined : (PORTS[p] ?? p));
/** Said only when it is not the expected "ok". */
const unlessOk = (v: string | undefined): string | undefined => (v == null || v === 'ok' ? undefined : v);

/**
 * A trial as one fact. `open` / `restated` / `sound` are the same question at three moments — is
 * her music still playing? — and `back` is whether it was playing again after the trial let go.
 */
export function trialFact(t: TrialFacts, back: boolean): MeasureFact {
  return {
    step: t.name,
    open: t.open,
    restated: t.restated,
    sound: t.sound,
    back,
    in: port(t.in),
    out: port(t.out),
    khz: t.rate != null ? Math.round(t.rate / 100) / 10 : undefined,
    mix: t.mixing,
    first: port(t.first),
    restate: unlessOk(t.restate),
    lowering: unlessOk(t.lowering),
    played: unlessOk(t.played === 'none' ? 'ok' : t.played),
    released: unlessOk(t.released),
    error: t.error,
  };
}

/** One fact as one line: `step · key=value key=value`. A "no" is printed loud — it is the finding. */
export function factLine(f: MeasureFact): string {
  const cells = Object.entries(f)
    .filter(([k, v]) => k !== 'step' && v != null && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'boolean' ? (v ? 'yes' : 'NO') : v}`);
  return cells.length > 0 ? `${f.step} · ${cells.join(' ')}` : f.step;
}

async function untilMusic(phone: MeasurePhone, ms: number): Promise<boolean> {
  for (let waited = 0; waited < ms; waited += POLL_MS) {
    if (phone.music() === true) return true;
    await phone.wait(POLL_MS);
  }
  return phone.music() === true;
}

export async function runMeasure(phone: MeasurePhone, lines: MeasureLines, note: (fact: MeasureFact) => void): Promise<MeasureOutcome> {
  const asked: MeasureAsk[] = [];
  const lives: TrialName[] = [];
  const stops: TrialName[] = [];
  let ended: MeasureOutcome['ended'] = 'done';
  let held = false;
  phone.keepAwake(true);
  try {
    await phone.prepare(lines.duckLine);
    // ── PART ONE: each way of holding the session, alone ────────────────────────────────────────
    let playing = await untilMusic(phone, RESUME_MS);
    for (const name of TRIALS) {
      if (!phone.onGlass()) {
        // A locked phone refuses to change its session: every trial after this would only say so.
        ended = 'left the screen';
        note({ step: 'stopped', before: name, why: 'the app left the screen' });
        break;
      }
      if (!playing) {
        phone.askForMusic(true);
        playing = await untilMusic(phone, HAND_MS);
        phone.askForMusic(false);
        note({ step: 'music started by hand', ok: playing });
        if (!playing) {
          ended = 'no music';
          break;
        }
        await phone.wait(SETTLE_MS);
      }
      const facts = await phone.trial(name);
      playing = await untilMusic(phone, RESUME_MS);
      note(trialFact(facts, playing));
      if (!facts.error) (facts.sound === true ? lives : stops).push(name);
      if (name === 'voice processing + line' && !facts.error) asked.push('last');
      if (playing) await phone.wait(SETTLE_MS);
    }
    if (ended === 'done') note({ step: 'her music lives with', trials: lives.join(' | ') || 'none' });
    if (ended === 'done') note({ step: 'her music stops with', trials: stops.join(' | ') || 'none' });

    // ── PART TWO: the workout's own duck, under the workout's own silent loop ───────────────────
    if (ended === 'done' && phone.onGlass()) {
      if (!playing) {
        phone.askForMusic(true);
        playing = await untilMusic(phone, HAND_MS);
        phone.askForMusic(false);
        note({ step: 'music started by hand', ok: playing });
      }
      if (playing) {
        await phone.hold();
        held = true;
        await phone.wait(WARM_MS);
        await phone.duck();
        const d = phone.duckReport();
        note({ step: 'workout duck', letGo: d?.letGo, taken: d?.taken, option: d?.option, music: phone.music() });
        await phone.speak(lines.duckLine);
        note({ step: 'as the line ended', music: phone.music() });
        await phone.unduck();
        await phone.wait(AFTER_MS);
        note({ step: 'after the line', music: phone.music() });
        asked.push('during', 'after');
      }
    }
    return { ended, asked, lives, stops };
  } catch (e) {
    note({ step: 'threw', error: e instanceof Error ? e.message : String(e) });
    return { ended: 'threw', asked, lives, stops };
  } finally {
    // The phone as it was found, whatever happened.
    phone.askForMusic(false);
    if (held) await phone.release().catch(() => {});
    phone.keepAwake(false);
  }
}

const AWAKE = 'ferrox-measure';

/** The real phone under the measurement. */
export function measurePhone(locale: string, askForMusic: (on: boolean) => void): MeasurePhone {
  return {
    wait: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    onGlass: () => AppState.currentState === 'active',
    music: () => audioSession.sessionReport()?.otherAudio ?? null,
    keepAwake: (on) => {
      if (on) void activateKeepAwakeAsync(AWAKE).catch(() => {});
      else void Promise.resolve(deactivateKeepAwake(AWAKE)).catch(() => {});
    },
    askForMusic,
    trial: (name) =>
      // A trial that never answers is not waited on for ever: the longest takes about seven seconds.
      Promise.race([audioSession.sessionTrial(name), new Promise<TrialFacts>((r) => setTimeout(() => r({ name, error: 'timed out' }), 20_000))]),
    hold: () => audioSession.holdKeepAlive('voiceTest'),
    release: () => audioSession.releaseKeepAlive('voiceTest'),
    duck: () => audioSession.duck(),
    unduck: () => audioSession.unduck(),
    duckReport: () => audioSession.duckReport(),
    prepare: async (line) => {
      // Her chosen voice, fetched now if this is the first time the line is said.
      if (neuralVoice.enabled()) await neuralVoice.clip(line, locale, 8_000);
    },
    speak: (line) => coachVoice.say(line, locale),
  };
}
