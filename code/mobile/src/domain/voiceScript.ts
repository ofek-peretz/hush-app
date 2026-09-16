/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SCRIPT — every line the voice coach says, built from facts the session already holds.
 *
 * docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md is the contract; this file is that document as
 * functions. Each builder takes the session's own numbers (kilograms, a band, a rest in seconds,
 * an exercise id) and returns ONE spoken line in the athlete's language and gender (`tg` carries
 * the gender as i18next context, exactly as the notifications do). Nothing here decides anything;
 * the conductor (`platform/voice/voiceConductor`) chooses which line and when.
 *
 * ── THE ONE RULE OF THE LOAD LINE (spec §2) ─────────────────────────────────────────────────────
 * The total first, then how to build it, then the range. "ארבעים קילו: המוט עשרים, ועשרה קילו בכל
 * צד. שמונה עד עשר חזרות." A machine says where to put the pin; dumbbells say "in each hand";
 * bodyweight says "no weight". Numbers are words in Hebrew (`domain/hebrewNumbers`) and digits in
 * English. The founder's own reading of the first draft: *"צריך להיות הכי ברור ומובן שיש… לצאת
 * בהנחה שהמשתמש הוא טיפש ולא מהנדס."*
 *
 * Pure: no timers, no audio, no store. Tested line by line in `theVoiceSaysWhatTheSpecSays`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { exerciseDisplayName, loadStyleOf } from '@/data/exercises';
import { displayWeight } from '@/domain/schedule';
import type { Units } from '@/data/local/models';
import { loadSetup } from '@/domain/loadPresentation';
import { englishDuration, hebrewDuration, hebrewKilos, hebrewReps, hebrewWhole, spokenNumber } from '@/domain/hebrewNumbers';
import { tg } from '@/i18n';

export interface VoiceLocale {
  locale: string;
  units: Units;
}

const isHe = (l: VoiceLocale) => l.locale.startsWith('he');

/** "ארבעים קילו" / "40 kilos" — a figure with its unit word, in display units. */
export function spokenLoad(kg: number, l: VoiceLocale): string {
  const v = displayWeight(kg, l.units) ?? kg;
  if (isHe(l)) return l.units === 'kg' ? hebrewKilos(v) : `${spokenNumber(v, 'm', l.locale)} פאונד`;
  return `${spokenNumber(v, 'm', l.locale)} ${l.units === 'kg' ? 'kilos' : 'pounds'}`;
}

/** "שמונה חזרות" / "8 reps". */
export function spokenReps(reps: number, l: VoiceLocale): string {
  if (isHe(l)) return hebrewReps(reps);
  return `${reps} ${reps === 1 ? 'rep' : 'reps'}`;
}

/** "דקה וחצי" / "a minute and a half". */
export function spokenDuration(seconds: number, l: VoiceLocale): string {
  return isHe(l) ? hebrewDuration(seconds) : englishDuration(seconds);
}

/** A count BEFORE a masculine noun in Hebrew ("שישה תרגילים", "שני תרגילים") — digits in English. */
function countM(n: number, l: VoiceLocale): string {
  if (!isHe(l)) return String(n);
  return n === 2 ? 'שני' : hebrewWhole(n, 'm');
}
/** A count that stands alone or follows its noun ("סט שתיים מתוך ארבע", "שמונה עד עשר") — digits in English. */
function countF(n: number, l: VoiceLocale): string {
  return isHe(l) ? hebrewWhole(n, 'f') : String(n);
}
/** A count BEFORE a feminine noun ("שתי דקות", "ארבעים דקות") — the construct form for two. */
function countFNoun(n: number, l: VoiceLocale): string {
  if (!isHe(l)) return String(n);
  return n === 2 ? 'שתי' : hebrewWhole(n, 'f');
}

/**
 * ════ THE LOAD, AS AN INSTRUCTION (spec §2) ════
 * Total, then how to build it. `loadSetup` does the plate maths in display units; this only says it.
 */
export function loadLine(exerciseId: string | null, kg: number | null, l: VoiceLocale): string {
  if (kg == null) return tg(loadStyleOf(exerciseId) === 'band' ? 'voice.loadBand' : 'voice.loadBodyweight');
  const total = spokenLoad(kg, l);
  const setup = loadSetup(exerciseId, displayWeight(kg, l.units), l.units);
  const style = loadStyleOf(exerciseId);
  const unit = (v: number) => (isHe(l) ? (l.units === 'kg' ? hebrewKilos(v) : `${spokenNumber(v, 'm', l.locale)} פאונד`) : `${spokenNumber(v, 'm', l.locale)}`);
  switch (style) {
    case 'barbell': {
      const side = setup?.perSide ?? 0;
      const bar = setup?.barKg ?? 0;
      if (side <= 0) return tg('voice.loadBarOnly', { total });
      const plates = setup?.plates && setup.plates.length > 1 ? setup.plates.map((p) => unit(p)).join(tg('voice.platesJoin')) : null;
      const params = { total, bar: unit(bar), side: unit(side) };
      return plates ? tg('voice.loadBarbellPlates', { ...params, plates }) : tg('voice.loadBarbell', params);
    }
    case 'plate_loaded':
      return tg('voice.loadPlateLoaded', { total, side: unit(setup?.perSide ?? 0) });
    case 'dumbbell':
      return tg('voice.loadDumbbell', { perHand: total });
    case 'kettlebell':
      return tg('voice.loadKettlebell', { bell: total });
    case 'selectorized':
    case 'cable':
      return tg('voice.loadPin', { total, pin: spokenNumber(displayWeight(kg, l.units) ?? kg, 'f', l.locale) /* a bare number — abstract counting, feminine */ });
    case 'fixed_barbell':
      return tg('voice.loadFixedBar', { total });
    case 'band':
      return tg('voice.loadBand');
    case 'bodyweight':
      // Added load on a bodyweight lift (a belt, a vest): the figure, said as what it is.
      return kg > 0 ? tg('voice.loadBodyweightPlus', { total }) : tg('voice.loadBodyweight');
  }
}

/** "כשהמוט טעון" / "When the bar is loaded" — the ready condition, per equipment. */
export function readyWhen(exerciseId: string | null, kg: number | null): string {
  if (kg == null) return tg(loadStyleOf(exerciseId) === 'band' ? 'voice.readyBand' : 'voice.readyBodyweight');
  switch (loadStyleOf(exerciseId)) {
    case 'barbell': return tg('voice.readyBarbell');
    case 'fixed_barbell': return tg('voice.readyFixed');
    case 'dumbbell': return tg('voice.readyDumbbell');
    case 'kettlebell': return tg('voice.readyKettlebell');
    case 'selectorized':
    case 'cable': return tg('voice.readyPin');
    case 'plate_loaded': return tg('voice.readyPlate');
    case 'band': return tg('voice.readyBand');
    case 'bodyweight': return tg('voice.readyBodyweight');
  }
}

/**
 * What to change on the equipment to go from `fromKg` to `toKg` — "תוסיף אחד ורבע קילו בכל צד".
 * The instruction is in the equipment's own terms, never a bare total.
 */
export function deltaLine(exerciseId: string | null, fromKg: number, toKg: number, l: VoiceLocale): string {
  const style = loadStyleOf(exerciseId);
  const total = spokenLoad(toKg, l);
  const dispTo = displayWeight(toKg, l.units) ?? toKg;
  switch (style) {
    case 'barbell':
    case 'plate_loaded': {
      const diff = Math.abs((displayWeight(toKg, l.units) ?? toKg) - (displayWeight(fromKg, l.units) ?? fromKg)) / 2;
      const amount = spokenLoad(l.units === 'kg' ? diff : diff / 2.20462, l);
      return toKg > fromKg ? tg('voice.deltaAddSide', { amount }) : tg('voice.deltaRemoveSide', { amount });
    }
    case 'dumbbell':
      return tg('voice.deltaDumbbell', { perHand: total });
    case 'kettlebell':
      return tg('voice.deltaKettlebell', { bell: total });
    case 'selectorized':
    case 'cable':
      return tg('voice.deltaPin', { pin: spokenNumber(dispTo, 'f', l.locale) });
    case 'fixed_barbell':
      return tg('voice.deltaFixed', { total });
    case 'band':
    case 'bodyweight':
      return '';
  }
}

/** "שמונה עד עשר חזרות" — always the range, never a lone number (spec §0.7). */
export function rangeLine(lo: number, hi: number, kg: number | null, l: VoiceLocale): string {
  const params = { lo: countF(lo, l), hi: countF(hi, l) };
  return kg == null ? tg('voice.rangeBodyweight', params) : tg('voice.range', params);
}

/** "סט שתיים מתוך ארבע" / "חימום, אחת מתוך אחת". */
export function setLabelLine(n: number, m: number, warmup: boolean, l: VoiceLocale): string {
  const params = { n: countF(n, l), m: countF(m, l) };
  return warmup ? tg('voice.warmupLabel', params) : tg('voice.setLabel', params);
}

/** "ארבעים קילו, עשר חזרות" — the figures of a set, load first; bodyweight says the reps alone. */
export function figuresLine(kg: number | null, reps: number, l: VoiceLocale): string {
  const r = spokenReps(reps, l);
  return kg == null ? r : tg('voice.figures', { load: spokenLoad(kg, l), reps: r });
}

export const name = (exerciseId: string) => exerciseDisplayName(exerciseId);

/**
 * The loading dialogue's opening for a lift with NO load (2026-09-10, found wiring the band family).
 *
 * Both weighted openings offer her a different weight — "the weight is a suggestion: no weight. If it
 * looks too light or too heavy, say a different weight" — and a push-up or a band curl has no weight
 * to change. Every load-less lift was opened with an instruction she could not follow. A band names
 * itself ("with the band"); a bodyweight lift lets its range say "no weight" once, not twice.
 */
function noLoadOpening(exerciseId: string, lo: number, hi: number, l: VoiceLocale): string {
  const range = rangeLine(lo, hi, null, l);
  const ready = readyWhen(exerciseId, null);
  return loadStyleOf(exerciseId) === 'band'
    ? tg('voice.loadBandLift', { exercise: name(exerciseId), load: loadLine(exerciseId, null, l), range, readyWhen: ready })
    : tg('voice.loadBodyweightLift', { exercise: name(exerciseId), range, readyWhen: ready });
}

// ── The lines, one function per spoken moment ───────────────────────────────────────────────────

export const voiceScript = {
  openFirstSession: () => tg('voice.openFirstSession'),
  openSession: (workout: string, lifts: number, minutes: number, firstExerciseId: string, l: VoiceLocale) =>
    tg('voice.openSession', { workout, lifts: countM(lifts, l), minutes: countFNoun(minutes, l), first: name(firstExerciseId) }),

  /** Spec §3.2 — the loading dialogue's opening line, in its three forms. */
  loadCalibrated: (exerciseId: string, kg: number | null, lo: number, hi: number, l: VoiceLocale) =>
    kg == null ? noLoadOpening(exerciseId, lo, hi, l) : tg('voice.loadCalibrated', { exercise: name(exerciseId), load: loadLine(exerciseId, kg, l), range: rangeLine(lo, hi, kg, l), readyWhen: readyWhen(exerciseId, kg) }),
  loadFirstTime: (exerciseId: string, kg: number | null, lo: number, hi: number, l: VoiceLocale) =>
    kg == null ? noLoadOpening(exerciseId, lo, hi, l) : tg('voice.loadFirstTime', { exercise: name(exerciseId), load: loadLine(exerciseId, kg, l), range: rangeLine(lo, hi, kg, l), readyWhen: readyWhen(exerciseId, kg) }),
  loadChanged: (exerciseId: string, fromKg: number, toKg: number, setN: number, setM: number, warmup: boolean, l: VoiceLocale) =>
    tg('voice.loadChanged', {
      setLabel: setLabelLine(setN, setM, warmup, l),
      direction: toKg > fromKg ? tg('voice.up') : tg('voice.down'),
      load: spokenLoad(toKg, l),
      delta: deltaLine(exerciseId, fromKg, toKg, l),
      readyWhen: readyWhen(exerciseId, toKg),
    }),
  loadEcho: (exerciseId: string, kg: number | null, l: VoiceLocale) =>
    tg('voice.loadEcho', { load: loadLine(exerciseId, kg, l), readyWhen: readyWhen(exerciseId, kg) }),
  calibrationStart: (exerciseId: string, kg: number, l: VoiceLocale) =>
    tg('voice.calibrationStart', { load: loadLine(exerciseId, kg, l), readyWhen: readyWhen(exerciseId, kg) }),
  skippedLift: (exerciseId: string, kg: number | null, lo: number, hi: number, l: VoiceLocale) =>
    tg('voice.skippedLift', { exercise: name(exerciseId), load: loadLine(exerciseId, kg, l), range: rangeLine(lo, hi, kg, l), readyWhen: readyWhen(exerciseId, kg) }),
  go: () => tg('voice.go'),
  readyPrompt: () => tg('voice.readyPrompt'),
  readyFallback: () => tg('voice.readyFallback'),

  /** Spec §3.4 — the done question and its follow-ups. */
  askDone: () => tg('voice.askDone'),
  askDoneLast: () => tg('voice.askDoneLast'),
  askDoneWarmup: () => tg('voice.askDoneWarmup'),
  askDoneSuperset: (firstId: string, secondId: string) => tg('voice.askDoneSuperset', { first: name(firstId), second: name(secondId) }),
  askRepsSecond: (secondId: string) => tg('voice.askRepsSecond', { second: name(secondId) }),
  askReps: () => tg('voice.askReps'),
  okWait: () => tg('voice.okWait'),
  askAgainSoon: () => tg('voice.askAgainSoon'),
  sayDoneWhenDone: () => tg('voice.sayDoneWhenDone'),
  /** Two silences (spec §3.4, amended 2026-09-09): nothing is written — the set stays open, and she is told where "done" lives. */
  notHeard: () => tg('voice.notHeard'),
  didntGet: () => tg('voice.didntGet'),
  skippedSet: () => tg('voice.skippedSet'),
  finishOnPhone: () => tg('voice.finishOnPhone'),
  paused: () => tg('voice.paused'),
  resumed: () => tg('voice.resumed'),

  /** Spec §3.5 — the echo and the verdict. */
  echo: (kg: number | null, reps: number, l: VoiceLocale) => tg('voice.echo', { figures: figuresLine(kg, reps, l) }),
  confirmHeard: (kg: number | null, reps: number, l: VoiceLocale) => tg('voice.confirmHeard', { figures: figuresLine(kg, reps, l) }),
  verdictUp: (exerciseId: string, fromKg: number, toKg: number, l: VoiceLocale) =>
    tg('voice.verdictUp', { load: spokenLoad(toKg, l), delta: deltaLine(exerciseId, fromKg, toKg, l) }),
  verdictDown: (exerciseId: string, fromKg: number, toKg: number, l: VoiceLocale) =>
    tg('voice.verdictDown', { load: spokenLoad(toKg, l), delta: deltaLine(exerciseId, fromKg, toKg, l) }),
  verdictHold: () => tg('voice.verdictHold'),
  nextTimeStart: (kg: number, l: VoiceLocale) => tg('voice.nextTimeStart', { load: spokenLoad(kg, l) }),
  nextTimeLearned: (kg: number, l: VoiceLocale) => tg('voice.nextTimeLearned', { load: spokenLoad(kg, l) }),

  /** Spec §3.6 — the rest. */
  rest: (seconds: number, l: VoiceLocale) => tg('voice.rest', { duration: spokenDuration(seconds, l) }),
  tenSeconds: () => tg('voice.tenSeconds'),
  setStart: (exerciseId: string, kg: number | null, lo: number, hi: number, setN: number, setM: number, warmup: boolean, l: VoiceLocale) =>
    tg('voice.setStart', { setLabel: setLabelLine(setN, setM, warmup, l), load: loadLine(exerciseId, kg, l), range: rangeLine(lo, hi, kg, l) }),
  supersetStart: (setN: number, setM: number, firstId: string, secondId: string, l: VoiceLocale) =>
    tg('voice.supersetStart', { setLabel: setLabelLine(setN, setM, false, l), first: name(firstId), second: name(secondId) }),
  holdItem: (label: string, seconds: number, l: VoiceLocale) => tg('voice.holdItem', { name: label, duration: spokenDuration(seconds, l) }),

  /** Spec §3.7 / §3.8 — the crossing and the end. */
  liftDone: (exerciseId: string, nextId: string, restS: number, l: VoiceLocale) =>
    tg('voice.liftDone', { exercise: name(exerciseId), next: name(nextId), duration: spokenDuration(restS, l) }),
  sessionDone: (lifts: number, minutes: number, l: VoiceLocale) => tg('voice.sessionDone', { lifts: countM(lifts, l), minutes: countFNoun(minutes, l) }),
  back: () => tg('voice.back'),
};
