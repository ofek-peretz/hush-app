/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE MEASUREMENT — WHAT ONLY HER PHONE CAN SAY ABOUT THE COACH OVER HER MUSIC. (2026-10-06)
 *
 * Founder, after an afternoon in which two things were built on a guess:
 *   > *"אתה לא יכול לבדוק את זה באינטרנט או בכלי חיפוש כלשהו אם זה אמור או יכול לעבוד והאם יש תקדים
 *   > לזה שהצליחו? אנחנו ממש צריכים לבדוק את זה במקום שכל פעם ישר תקפוץ ותעבוד בשעה ובסוף יש פתרון
 *   > אלגנטי ונכון בהרבה יותר משאתה עושה. אני לא רוצה שישר תתחיל לעשות מבלי לתכנן לפני מה עושים ואיך
 *   > עושים לפרטי פרטים. אנחנו בונים פה סטארטאפ לא צעצוע."*
 *
 * THE CONFLICT the search found, in Apple's own words. The coach hears her from a pocket only
 * because the microphone was opened on glass and is never closed ("Apple strictly prevents apps from
 * initiating an AVAudioSession for recording from a completely backgrounded state"). And her music is
 * lowered for a line only by `.duckOthers`, which "begins when you activate your app's audio session
 * and ends when you deactivate the session" — and deactivating closes the microphone. So he could not
 * hear the coach: *"המתאמן שומע בפול ווליום את המוזיקה ולא שומעים את המאמן"*.
 *
 * No page settles the way out, and no app was found that documents it (a coach that speaks over
 * lowered music exists — Waze, Strava, Flaims; a voice log exists — SaySet, SayLift, tap first, phone
 * in hand; both at once, from a locked phone in a pocket, does not). So the phone is asked. One run,
 * about three minutes, earbuds in and music on; the phone goes into her pocket twice.
 *
 *   HALF ONE — the workout's own ear (the phone's microphone, held):
 *     · where the coach is heard from (the route, as iOS names it — and question 1, by ear)
 *     · how far over the room her voice is on the phone's microphone, and what the strong ear heard
 *     · `.duckOthers` put on and off the LIVE session (questions 2–3) — built into the workout for
 *       one afternoon on a guess; Apple's page says it should do nothing
 *     · the held engine moved to the earbuds' microphone from the pocket, her voice measured there,
 *       and moved back — the other guess; nothing Apple has written says a locked phone may
 *   ON GLASS — voice processing can only be opened there
 *   HALF TWO — Apple's voice processing (what a call uses), the candidate:
 *     · what it does to the route: voice processing allows the earbuds' call profile by itself, and
 *       on Bluetooth that is her music at phone-call quality. Is the music profile kept when the
 *       phone's own microphone is asked for? (the ports and the sample rate, and question 4)
 *     · its own lowering of other apps (iOS 17): most for a line and back (5–6), and "only while
 *       someone speaks" (7)
 *     · her voice on the processed microphone
 *
 * The decision each answer makes is written in `docs/canonical/FERROX_VOICE_SCREENPLAY.md` §10,
 * before the answers exist.
 *
 * ⛔ Nothing here is a workout's. The flow takes a `MeasurePhone` so that `theMeasurementAsksThePhone`
 * can walk it over a phone that refuses each step in turn: it always ends, and it always leaves the
 * phone as it found it — no microphone held, the option off, the silent loop released.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { AppState } from 'react-native';

import { audioSession, type EarClip, type SessionReport } from '@/platform/voice/audioSession';
import { cloudEar } from '@/platform/voice/cloudEar';
import { coachVoice } from '@/platform/voice/coachVoice';
import { neuralVoice } from '@/platform/voice/neuralVoice';
import { recognizerLang } from '@/platform/voice/voiceCapture';

/** Time to lock the phone and pocket it after being told to. */
export const LOCK_MS = 10_000;
/** How long a number is listened for. */
export const LISTEN_MS = 6_000;
/** How long the music is held lowered after the line that asks about it. */
export const HOLD_MS = 2_500;
/** How long the music is given to come back before the line that asks whether it did. */
export const RETURN_MS = 2_500;
/** A Bluetooth profile changing, an engine restarting: waited out before the route is read. */
export const ROUTE_MS = 1_800;
/** Between closing the workout's ear and opening the processed one (the unduck's own delay is 700 ms). */
export const SWITCH_MS = 1_200;
/** The silence in which "only while someone speaks" either gives the music back, or does not. */
export const SILENCE_MS = 4_000;
/** How long the flow waits for the phone to be taken out and unlocked between the halves. */
export const GLASS_MS = 120_000;

/** What a window heard: the loudest and the quietest tenth of a second, and the strong ear's reading. */
export interface Heard {
  peakDb: number | null;
  floorDb: number | null;
  text: string | null;
  why: string | null;
}

/** One thing the phone reported, as it is printed on the profile and written in the voice journal. */
export interface MeasureFact {
  step: string;
  [key: string]: string | number | boolean | null;
}

/** The questions only her ears can answer — asked aloud by number, answered on the screen afterwards. */
export type MeasureAsk = 'q1' | 'q2' | 'q3' | 'earbuds' | 'q4' | 'q5' | 'q6' | 'q7';

export interface MeasureLines {
  lock: string;
  q1: string;
  number: string;
  heard(text: string): string;
  nothing: string;
  q2: string;
  q3: string;
  numberEarbuds: string;
  half: string;
  lockAgain: string;
  q4: string;
  q5: string;
  q6: string;
  q7: string;
  numberAgain: string;
  done: string;
}

/** Every line the measurement can say that is known before it starts — fetched in the natural voice first. */
export function fixedLines(l: MeasureLines): string[] {
  return [l.lock, l.q1, l.number, l.nothing, l.q2, l.q3, l.numberEarbuds, l.half, l.lockAgain, l.q4, l.q5, l.q6, l.q7, l.numberAgain, l.done];
}

export interface MeasurePhone {
  wait(ms: number): Promise<void>;
  onGlass(): boolean;
  /** True as soon as the app is on glass; false when `ms` pass first. */
  untilOnGlass(ms: number): Promise<boolean>;
  report(): SessionReport | null;
  /** The lines in the natural voice, on the phone before the first is needed. How many are ready. */
  prepare(lines: string[]): Promise<number>;
  hold(): Promise<void>;
  release(): Promise<void>;

  // The workout's own ear.
  open(): Promise<string | null>;
  close(): Promise<void>;
  alive(): boolean;
  /** A line as the workout says it: duck, the line, unduck. */
  say(line: string): Promise<void>;
  /** A line with nothing done to the session around it. */
  speak(line: string): Promise<void>;
  listen(ms: number): Promise<Heard>;
  liveDuck(on: boolean): void;
  duck(): Promise<void>;
  unduck(): Promise<void>;
  reroute(to: 'headset' | 'phone'): Promise<string | null>;

  // Apple's voice processing.
  processedOpen(): Promise<string | null>;
  processedClose(): Promise<void>;
  processedAlive(): boolean;
  processedDuck(level: 0 | 10 | 20 | 30, advanced: boolean): string;
  /** The line played through the processed output; false when it could not be. */
  processedSay(line: string): Promise<boolean>;
  processedListen(ms: number): Promise<Heard>;
  preferPhoneMic(): string;
  restate(): string;
}

export interface MeasureOutcome {
  /** How it ended: `done`, or the step that stopped it. */
  ended: 'done' | 'no microphone' | 'phone not opened' | 'no voice processing' | 'threw';
  /** The questions that were actually put to her ears, in the order they were asked. */
  asked: MeasureAsk[];
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
const port = (p: string | undefined): string => (p ? (PORTS[p] ?? p) : 'none');

/**
 * What her music is being played at, read off the route: `full` on the earbuds' music profile (or a
 * wire), `call` on their call profile — mono, narrow, the thing this measurement is about — and
 * `speaker` when the sound has left the earbuds altogether.
 */
export function musicQuality(r: SessionReport | null): 'full' | 'call' | 'speaker' | 'unknown' {
  if (!r || r.outputs.length === 0) return 'unknown';
  if (r.outputs.includes('BluetoothA2DPOutput') || r.outputs.includes('Headphones')) return 'full';
  if (r.outputs.includes('BluetoothHFP')) return 'call';
  if (r.outputs.includes('BluetoothLE')) return r.rate >= 32_000 ? 'full' : 'call';
  if (r.outputs.includes('Speaker') || r.outputs.includes('Receiver')) return 'speaker';
  return 'unknown';
}

function routeFact(step: string, r: SessionReport | null, alive: boolean): MeasureFact {
  if (!r) return { step, route: 'unreadable', alive };
  return {
    step,
    in: port(r.inputs[0]),
    out: port(r.outputs[0]),
    khz: Math.round(r.rate / 100) / 10,
    mode: r.mode.replace('AVAudioSessionMode', ''),
    call: r.hfpAllowed,
    music: musicQuality(r),
    alive,
  };
}

const round = (n: number | null): number | null => (n == null || !Number.isFinite(n) ? null : Math.round(n));

function heardFact(step: string, h: Heard): MeasureFact {
  const over = h.peakDb != null && h.floorDb != null ? Math.round(h.peakDb - h.floorDb) : null;
  return { step, over, voice: round(h.peakDb), room: round(h.floorDb), heard: h.text, why: h.why };
}

/** One fact as one line: `step · key=value key=value`. */
export function factLine(f: MeasureFact): string {
  const cells = Object.entries(f)
    .filter(([k, v]) => k !== 'step' && v != null && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'boolean' ? (v ? 'yes' : 'no') : v}`);
  return cells.length > 0 ? `${f.step} · ${cells.join(' ')}` : f.step;
}

export async function runMeasure(phone: MeasurePhone, lines: MeasureLines, note: (fact: MeasureFact) => void): Promise<MeasureOutcome> {
  const asked: MeasureAsk[] = [];
  let processedVoice = true;
  /** A line in the second half: through the processed output, or — said so once — by the plain voice. */
  const processedLine = async (line: string): Promise<void> => {
    if (await phone.processedSay(line)) return;
    if (processedVoice) note({ step: 'line not through processing', alive: phone.processedAlive() });
    processedVoice = false;
    await phone.speak(line);
  };
  await phone.hold();
  try {
    const ready = await phone.prepare(fixedLines(lines));
    note({ step: 'natural voice', ready, of: fixedLines(lines).length });

    // ── HALF ONE: the workout's own ear ─────────────────────────────────────────────────────────
    const refused = await phone.open();
    note({ step: 'microphone', held: !refused, error: refused });
    if (refused) return { ended: 'no microphone', asked };
    note(routeFact('route', phone.report(), phone.alive()));
    note({ step: 'her music', playing: phone.report()?.otherAudio ?? null });
    await phone.say(lines.lock);
    await phone.wait(LOCK_MS);
    note({ step: 'pocket', glass: phone.onGlass(), alive: phone.alive() });

    // 1 · Where the coach is heard from — the route as iOS names it, and her ears.
    await phone.say(lines.q1);
    note(routeFact('coach heard on', phone.report(), phone.alive()));
    asked.push('q1');

    // Her voice on the phone's microphone — if the pocket has left it running (the fact above says).
    if (phone.alive()) {
      await phone.say(lines.number);
      const onPhone = await phone.listen(LISTEN_MS);
      note(heardFact('phone mic', onPhone));
      await phone.say(onPhone.text ? lines.heard(onPhone.text) : lines.nothing);
    }

    // 2–3 · `.duckOthers` put on and off the live session, the microphone held throughout.
    if (phone.alive()) {
      phone.liveDuck(true);
      await phone.duck();
      note({ step: 'live duck on', option: phone.report()?.ducking ?? null, alive: phone.alive() });
      await phone.speak(lines.q2);
      await phone.wait(HOLD_MS);
      await phone.unduck();
      await phone.wait(RETURN_MS);
      phone.liveDuck(false);
      note({ step: 'live duck off', option: phone.report()?.ducking ?? null, alive: phone.alive() });
      await phone.speak(lines.q3);
      asked.push('q2', 'q3');
    }

    // The held engine moved to the earbuds' microphone from here, her voice measured there, and back.
    if (phone.alive()) {
      const t1 = Date.now();
      const there = await phone.reroute('headset');
      note({ ...routeFact('to earbuds mic', phone.report(), phone.alive()), ok: !there, error: there, ms: Date.now() - t1 });
      if (!there && phone.alive()) {
        await phone.wait(ROUTE_MS);
        await phone.say(lines.numberEarbuds);
        const onEarbuds = await phone.listen(LISTEN_MS);
        note(heardFact('earbuds mic', onEarbuds));
        const t2 = Date.now();
        const back = await phone.reroute('phone');
        note({ ...routeFact('back to phone mic', phone.report(), phone.alive()), ok: !back, error: back, ms: Date.now() - t2 });
        await phone.say(onEarbuds.text ? lines.heard(onEarbuds.text) : lines.nothing);
        asked.push('earbuds');
      }
    }
    note({ step: 'half one over', alive: phone.alive() });

    // ── ON GLASS: voice processing can only be opened there ─────────────────────────────────────
    await phone.say(lines.half);
    const opened = await phone.untilOnGlass(GLASS_MS);
    await phone.close();
    if (!opened) {
      note({ step: 'phone not opened', waited: GLASS_MS / 1000 });
      return { ended: 'phone not opened', asked };
    }
    await phone.wait(SWITCH_MS);

    // ── HALF TWO: Apple's voice processing ──────────────────────────────────────────────────────
    const noProcessing = await phone.processedOpen();
    note({ step: 'voice processing', open: !noProcessing, error: noProcessing });
    if (noProcessing) {
      await phone.say(lines.done);
      return { ended: 'no voice processing', asked };
    }
    await phone.wait(ROUTE_MS);
    let route = phone.report();
    note(routeFact('processed route', route, phone.processedAlive()));
    // Voice processing allows the earbuds' call profile by itself. Two things are asked of the live
    // session to get the music profile back, in order, each only if the one before did not.
    if (musicQuality(route) === 'call' || musicQuality(route) === 'speaker') {
      const result = phone.preferPhoneMic();
      await phone.wait(ROUTE_MS);
      route = phone.report();
      note({ ...routeFact('asked for phone mic', route, phone.processedAlive()), result });
    }
    if (musicQuality(route) === 'call' || musicQuality(route) === 'speaker') {
      const result = phone.restate();
      await phone.wait(ROUTE_MS);
      route = phone.report();
      note({ ...routeFact('category restated', route, phone.processedAlive()), result });
    }
    const least = phone.processedDuck(10, false);
    note({ step: 'lowering set to least', result: least });
    await processedLine(lines.lockAgain);
    await phone.wait(LOCK_MS);
    note({ step: 'pocket', glass: phone.onGlass(), alive: phone.processedAlive() });

    // 4 · Her music under voice processing, before anything is lowered on purpose.
    await processedLine(lines.q4);
    note(routeFact('music under processing', phone.report(), phone.processedAlive()));
    asked.push('q4');

    if (least === 'ok') {
      // 5–6 · The most, for a line, and back to the least.
      note({ step: 'lowering set to most', result: phone.processedDuck(30, false) });
      await processedLine(lines.q5);
      await phone.wait(HOLD_MS);
      note({ step: 'lowering set to least', result: phone.processedDuck(10, false) });
      await phone.wait(RETURN_MS);
      await processedLine(lines.q6);
      // 7 · Lowered only while someone speaks — and given back in the silence after.
      note({ step: 'lowering by voice', result: phone.processedDuck(30, true) });
      await phone.wait(RETURN_MS);
      await processedLine(lines.q7);
      await phone.wait(SILENCE_MS);
      phone.processedDuck(10, false);
      asked.push('q5', 'q6', 'q7');
    }

    // Her voice on the processed microphone.
    await processedLine(lines.numberAgain);
    const processed = await phone.processedListen(LISTEN_MS);
    note(heardFact('phone mic processed', processed));
    await processedLine(processed.text ? lines.heard(processed.text) : lines.nothing);

    note({ ...routeFact('at the end', phone.report(), phone.processedAlive()) });
    await processedLine(lines.done);
    return { ended: 'done', asked };
  } catch (e) {
    note({ step: 'threw', error: e instanceof Error ? e.message : String(e) });
    return { ended: 'threw', asked };
  } finally {
    // The phone as it was found, whatever happened: the option off, no microphone held, the loop let go.
    phone.liveDuck(false);
    await phone.processedClose().catch(() => {});
    await phone.close().catch(() => {});
    await phone.release().catch(() => {});
  }
}

/** A native call that never answers is not waited on for ever. */
function within<T>(p: Promise<T>, ms: number, late: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(late), ms))]);
}

/** The real phone under the measurement. */
export function measurePhone(locale: string): MeasurePhone {
  const lang = recognizerLang(locale);
  // Far from any window the workout numbers: a late sentence of the phone's own recognizer is never
  // taken for an answer anywhere else.
  let token = 900_000;
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const hear = async (clip: EarClip | null): Promise<Heard> => {
    if (!clip) return { peakDb: null, floorDb: null, text: null, why: 'no audio kept' };
    const r = await cloudEar.hearNow(clip, 'reps', locale);
    return { peakDb: clip.peakDb, floorDb: clip.floorDb, text: r.text, why: r.why };
  };
  return {
    wait,
    onGlass: () => AppState.currentState === 'active',
    untilOnGlass: (ms) =>
      new Promise<boolean>((resolve) => {
        if (AppState.currentState === 'active') return resolve(true);
        let timer: ReturnType<typeof setTimeout> | null = null;
        const sub = AppState.addEventListener('change', (s) => {
          if (s !== 'active') return;
          if (timer) clearTimeout(timer);
          sub.remove();
          resolve(true);
        });
        timer = setTimeout(() => {
          sub.remove();
          resolve(false);
        }, ms);
      }),
    report: () => audioSession.sessionReport(),
    prepare: async (lines) => {
      if (!neuralVoice.enabled()) return 0;
      let ready = 0;
      // Three at a time: the first run fetches every line, and the voice endpoint is not a firehose.
      for (let i = 0; i < lines.length; i += 3) {
        const got = await Promise.all(lines.slice(i, i + 3).map((l) => neuralVoice.clip(l, locale, 8_000)));
        ready += got.filter((p) => p != null).length;
      }
      return ready;
    },
    hold: () => audioSession.holdKeepAlive('voiceTest'),
    release: () => audioSession.releaseKeepAlive('voiceTest'),
    open: () => within(audioSession.earOpen('phone'), 8_000, 'timed out'),
    close: () => audioSession.earClose(),
    alive: () => audioSession.earRunning(),
    say: async (line) => {
      await audioSession.duck();
      await coachVoice.say(line, locale);
      await audioSession.unduck();
    },
    speak: (line) => coachVoice.say(line, locale),
    listen: async (ms) => {
      token += 1;
      const mine = token;
      const refused = await within(audioSession.earListen(lang, mine), 5_000, 'timed out');
      if (refused) return { peakDb: null, floorDb: null, text: null, why: refused };
      await wait(ms);
      const clip = await audioSession.earClip(mine, ms / 1000);
      await within(audioSession.earStopListening(), 5_000, undefined);
      return hear(clip);
    },
    liveDuck: (on) => audioSession.setDuckUnderEar(on),
    duck: () => audioSession.duck(),
    unduck: () => audioSession.unduck(),
    reroute: (to) => within(audioSession.earReroute(to), 10_000, 'timed out'),
    processedOpen: () => within(audioSession.processedOpen(), 8_000, 'timed out'),
    processedClose: () => audioSession.processedClose(),
    processedAlive: () => audioSession.processedAlive(),
    processedDuck: (level, advanced) => audioSession.processedDuck(level, advanced),
    processedSay: async (line) => {
      const path = await neuralVoice.clip(line, locale, 6_000);
      return path ? within(audioSession.processedSay(path), 30_000, false) : false;
    },
    processedListen: async (ms) => {
      audioSession.processedKeep();
      await wait(ms);
      return hear(await audioSession.processedClip());
    },
    preferPhoneMic: () => audioSession.processedPreferPhoneMic(),
    restate: () => audioSession.processedRestate(),
  };
}
