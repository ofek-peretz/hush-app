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
import { currentLocale, tg } from '@/i18n';

export interface VoiceLocale {
  locale: string;
  units: Units;
}

const isHe = (l: VoiceLocale) => l.locale.startsWith('he');

/** A figure the voice can say: to the quarter, never a decimal the Hebrew voice reads digit by digit. */
const toQuarter = (v: number) => Math.round(v * 4) / 4;

/** A value ALREADY in display units, with its unit word — the one place a load becomes words. */
function spokenDisplay(v: number, l: VoiceLocale): string {
  const q = toQuarter(v);
  if (isHe(l)) return l.units === 'kg' ? hebrewKilos(q) : `${spokenNumber(q, 'm', l.locale)} פאונד`;
  const unit = l.units === 'kg' ? (q === 1 ? 'kilo' : 'kilos') : q === 1 ? 'pound' : 'pounds';
  return `${spokenNumber(q, 'm', l.locale)} ${unit}`;
}

/** "ארבעים קילו" / "40 kilos" — a figure with its unit word, in display units. */
export function spokenLoad(kg: number, l: VoiceLocale): string {
  return spokenDisplay(displayWeight(kg, l.units) ?? kg, l);
}

/*
 * ⛔ NO LATIN LETTER AND NO DIGIT REACHES THE HEBREW VOICE (2026-09-27, the script audit). Names are
 * written for eyes — "עליון A", "כפיפת מרפקים במוט EZ", "כפיפות 21 (7·7·7)", "חתירה ב־T־בר" — and the
 * Hebrew voice spells what it cannot read. A name is cleaned for the ear: a lone capital becomes its
 * Hebrew letter, the few Latin words a gym says aloud become how they are said, a parenthesis is a
 * note for the eye and is dropped, and a number is said as words.
 */
const HE_LETTERS: Record<string, string> = { A: 'אלף', B: 'בית', C: 'גימל', D: 'דלת', E: 'הא', F: 'וו', G: 'זין', H: 'חית', I: 'טית', J: 'יוד' };
const HE_SAID: Record<string, string> = { EZ: 'איזי', T: 'טי', V: 'וי', Y: 'וואי', TRX: 'טי אר אקס', RDL: 'אר די אל' };
/* The day's letter in Hebrew ("גוף מלא א׳", `i18n/dayTitle`) is said by its name — "אלף", exactly as the
   Latin "A" it replaced was (2026-09-30). A geresh after one lone letter is a numeral, never a word. */
const HE_LETTER_NAME: Record<string, string> = { א: 'אלף', ב: 'בית', ג: 'גימל', ד: 'דלת', ה: 'הא', ו: 'וו', ז: 'זין', ח: 'חית' };
export function spokenName(text: string, l: VoiceLocale): string {
  // A name written wholly in Latin ("Upper A") is read as it is — lettering half of it Hebrew would
  // make "Upper אלף", which is neither language. Only a Hebrew name carrying Latin is cleaned.
  if (!isHe(l) || !/[א-ת]/.test(text)) return text.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return text
    .replace(/(^|\s)([א-ח])[׳'](?=$|[\s.,!?])/g, (_, lead: string, l: string) => `${lead}${HE_LETTER_NAME[l] ?? l}`)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[־\-–—·]/g, ' ')
    .replace(/[A-Za-z]+/g, (w) => HE_SAID[w.toUpperCase()] ?? (w.length === 1 ? HE_LETTERS[w.toUpperCase()] ?? w : w))
    .replace(/\d+(\.\d+)?/g, (d) => spokenNumber(Number(d), 'f', l.locale))
    .replace(/\s+/g, ' ')
    .trim();
}

/** "שישה תרגילים" / "תרגיל אחד" / "שני תרגילים" — a count WITH its noun, agreeing at one and two. */
export function liftsPhrase(n: number, l: VoiceLocale): string {
  if (!isHe(l)) return `${n} ${n === 1 ? 'exercise' : 'exercises'}`;
  if (n === 1) return 'תרגיל אחד';
  if (n === 2) return 'שני תרגילים';
  return `${hebrewWhole(n, 'm')} תרגילים`;
}

/** ", ושיא אישי חדש" / ", ושני שיאים אישיים חדשים" — the records of the day, or nothing. */
export function recordsPhrase(n: number, l: VoiceLocale): string {
  if (n <= 0) return '';
  if (!isHe(l)) return n === 1 ? ', and a new personal best' : ', and ' + n + ' new personal bests';
  if (n === 1) return ', ושיא אישי חדש';
  if (n === 2) return ', ושני שיאים אישיים חדשים';
  return ', ו' + hebrewWhole(n, 'm') + ' שיאים אישיים חדשים';
}

/** "ארבעים דקות" / "דקה" / "שתי דקות" — minutes said the way a rest is. */
export function minutesPhrase(min: number, l: VoiceLocale): string {
  return spokenDuration(Math.max(1, Math.round(min)) * 60, l);
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

/**
 * A REST, rounded to the quarter minute the way a coach says it (2026-09-27): the learned rest is a
 * median to the second, and "דקה ושלושים ושבע שניות" is a number nobody can hold in the ear.
 */
export function spokenRest(seconds: number, l: VoiceLocale): string {
  const s = seconds >= 45 ? Math.max(15, Math.round(seconds / 15) * 15) : Math.round(seconds / 5) * 5 || seconds;
  return spokenDuration(s, l);
}

/** A count that stands alone or follows its noun ("סט שתיים מתוך ארבע", "שמונה עד עשר") — digits in English. */
function countF(n: number, l: VoiceLocale): string {
  return isHe(l) ? hebrewWhole(n, 'f') : String(n);
}

/** "ארבע מאות מטר" / "קילומטר וחצי" / "400 metres" — a distance, said as a runner says it. */
export function spokenDistance(metres: number, l: VoiceLocale): string {
  const m = Math.max(0, Math.round(metres));
  if (!isHe(l)) return m >= 1000 ? `${Math.round(m / 100) / 10} kilometres` : `${m} metres`;
  if (m >= 1000) {
    // "קילומטר וחצי", "שלושה קילומטר ורבע" — the fraction follows the noun, the way a runner says it.
    const km = Math.round(m / 250) / 4;
    const whole = Math.floor(km);
    const frac = km - whole;
    const head = whole === 1 ? 'קילומטר' : whole === 2 ? 'שני קילומטר' : `${hebrewWhole(whole, 'm')} קילומטר`;
    const tail = frac === 0.5 ? ' וחצי' : frac === 0.25 ? ' ורבע' : frac === 0.75 ? ' ושלושת רבעי' : '';
    return head + tail;
  }
  if (m === 1) return 'מטר אחד';
  if (m === 2) return 'שני מטר';
  return `${hebrewWhole(m, 'm')} מטר`;
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
  const unit = (v: number) => (isHe(l) ? spokenDisplay(v, l) : `${spokenNumber(toQuarter(v), 'm', l.locale)}`);
  switch (style) {
    case 'barbell': {
      const side = setup?.perSide ?? 0;
      const bar = setup?.barKg ?? 0;
      if (side <= 0) return tg('voice.loadBarOnly', { total });
      // The plates are counted, not weighed: "עשרה ושתיים וחצי" — the unit was said once already (spec §2).
      // A plate of one and a quarter is "קילו ורבע" in a gym, never "אחת ורבע" (2026-09-27).
      const plateWord = (p: number) => (isHe(l) && p > 1 && p < 2 ? hebrewKilos(toQuarter(p)) : spokenNumber(toQuarter(p), 'm', l.locale));
      const plates = setup?.plates && setup.plates.length > 1 ? setup.plates.map(plateWord).join(tg('voice.platesJoin')) : null;
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
      // Said in display units directly (2026-09-27): converted back to kilos and re-rounded, a 5 lb
      // jump came out as "three pounds on each side".
      const diff = Math.abs((displayWeight(toKg, l.units) ?? toKg) - (displayWeight(fromKg, l.units) ?? fromKg)) / 2;
      const amount = spokenDisplay(diff, l);
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

/**
 * "שמונה עד עשר חזרות" — always the range (spec §0.7) … unless the coach wrote ONE number, which is
 * said as that number: "חמש חזרות", never "חמש עד חמש חזרות". "בלי משקל" belongs to a bodyweight
 * lift only — a band lift has a load, the band (2026-09-27).
 */
export function rangeLine(lo: number, hi: number, kg: number | null, l: VoiceLocale, exerciseId: string | null = null): string {
  const bodyweight = kg == null && loadStyleOf(exerciseId) !== 'band';
  if (lo === hi) {
    const reps = spokenReps(lo, l);
    return bodyweight ? `${reps}, ${tg('voice.loadBodyweight')}` : reps;
  }
  const params = { lo: countF(lo, l), hi: countF(hi, l) };
  return bodyweight ? tg('voice.rangeBodyweight', params) : tg('voice.range', params);
}

/**
 * "סט שתיים מתוך ארבע" / "חימום, אחת מתוך אחת" — and the last working set of a lift is "סט אחרון"
 * (2026-09-27): the one number of the set a coach never reads out is the one she most wants to hear.
 */
export function setLabelLine(n: number, m: number, warmup: boolean, l: VoiceLocale): string {
  if (!warmup && m > 1 && n === m) return tg('voice.setLabelLast');
  // "סט ראשון מתוך שלוש" — "סט אחת" is a gender no one says (2026-09-27).
  if (!warmup && n === 1 && m > 1) return tg('voice.setLabelFirst', { m: countF(m, l) });
  const params = { n: countF(n, l), m: countF(m, l) };
  return warmup ? tg('voice.warmupLabel', params) : tg('voice.setLabel', params);
}

/**
 * The load of the lift she is walking to, short enough for a rest line (2026-09-27): the total, or
 * what she takes in each hand — the plates are said at the bar, in the loading dialogue. Null for a
 * lift with no load to fetch.
 */
export function nextLoadPhrase(exerciseId: string, kg: number | null, l: VoiceLocale): string | null {
  if (kg == null) return null;
  switch (loadStyleOf(exerciseId)) {
    case 'dumbbell':
      return tg('voice.loadDumbbell', { perHand: spokenLoad(kg, l) });
    case 'kettlebell':
      return tg('voice.loadKettlebell', { bell: spokenLoad(kg, l) });
    case 'band':
      return null;
    case 'bodyweight':
      return kg > 0 ? tg('voice.loadBodyweightPlus', { total: spokenLoad(kg, l) }) : null;
    default:
      return spokenLoad(kg, l);
  }
}


/** "ארבעים קילו, עשר חזרות" — the figures of a set, load first; bodyweight says the reps alone. */
export function figuresLine(kg: number | null, reps: number, l: VoiceLocale): string {
  const r = spokenReps(reps, l);
  return kg == null ? r : tg('voice.figures', { load: spokenLoad(kg, l), reps: r });
}

/** A lift's name for the ear — see `spokenName`. The locale is the app's, as `tg` reads it. */
export const name = (exerciseId: string) => spokenName(exerciseDisplayName(exerciseId), { locale: currentLocale(), units: 'kg' });

/**
 * The loading dialogue's opening for a lift with NO load (2026-09-10, found wiring the band family).
 *
 * Both weighted openings offer her a different weight — "the weight is a suggestion: no weight. If it
 * looks too light or too heavy, say a different weight" — and a push-up or a band curl has no weight
 * to change. Every load-less lift was opened with an instruction she could not follow. A band names
 * itself ("with the band"); a bodyweight lift lets its range say "no weight" once, not twice.
 */
function noLoadOpening(exerciseId: string, lo: number, hi: number, l: VoiceLocale): string {
  const range = rangeLine(lo, hi, null, l, exerciseId);
  const ready = readyWhen(exerciseId, null);
  return loadStyleOf(exerciseId) === 'band'
    ? tg('voice.loadBandLift', { exercise: name(exerciseId), load: loadLine(exerciseId, null, l), range, readyWhen: ready })
    : tg('voice.loadBodyweightLift', { exercise: name(exerciseId), range, readyWhen: ready });
}

// ── The lines, one function per spoken moment ───────────────────────────────────────────────────

export const voiceScript = {
  openFirstSession: () => tg('voice.openFirstSession'),
  openSession: (workout: string, lifts: number, minutes: number, firstExerciseId: string, l: VoiceLocale) =>
    tg('voice.openSession', { workout: spokenName(workout, l), lifts: liftsPhrase(lifts, l), minutes: minutesPhrase(minutes, l), first: name(firstExerciseId) }),

  /** Spec §3.2 — the loading dialogue's opening line, in its three forms. */
  loadCalibrated: (exerciseId: string, kg: number | null, lo: number, hi: number, l: VoiceLocale) =>
    kg == null ? noLoadOpening(exerciseId, lo, hi, l) : tg('voice.loadCalibrated', { exercise: name(exerciseId), load: loadLine(exerciseId, kg, l), range: rangeLine(lo, hi, kg, l, exerciseId), readyWhen: readyWhen(exerciseId, kg) }),
  loadFirstTime: (exerciseId: string, kg: number | null, lo: number, hi: number, l: VoiceLocale) =>
    kg == null ? noLoadOpening(exerciseId, lo, hi, l) : tg('voice.loadFirstTime', { exercise: name(exerciseId), load: loadLine(exerciseId, kg, l), range: rangeLine(lo, hi, kg, l, exerciseId), readyWhen: readyWhen(exerciseId, kg) }),
  /**
   * A warm-up's opening (2026-09-27, the script audit): the lift, which ramp step, the load, and the
   * COUNT — a warm-up has no band, and the old line invented one ("שמונה עד שתים עשרה") and never
   * said "מוכן", while the window waited for it.
   */
  warmupStart: (exerciseId: string, kg: number | null, reps: number, setN: number, setM: number, l: VoiceLocale) =>
    tg('voice.warmupStart', {
      exercise: name(exerciseId),
      setLabel: setLabelLine(setN, setM, true, l),
      load: loadLine(exerciseId, kg, l),
      reps: spokenReps(reps, l),
      readyWhen: readyWhen(exerciseId, kg),
    }),
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
    tg('voice.skippedLift', { exercise: name(exerciseId), load: loadLine(exerciseId, kg, l), range: rangeLine(lo, hi, kg, l, exerciseId), readyWhen: readyWhen(exerciseId, kg) }),
  go: () => tg('voice.go'),
  readyPrompt: () => tg('voice.readyPrompt'),
  readyFallback: () => tg('voice.readyFallback'),
  /** The loading window ran out with no "מוכן": the question will still come — she may have started without it. */
  readyNotHeard: () => tg('voice.readyNotHeard'),

  /** Spec §3.9, amended 2026-09-27 — a hold the voice counts: its start, its end, her word. */
  holdLoading: (label: string, seconds: number, l: VoiceLocale) =>
    tg('voice.holdLoading', { name: spokenName(label, l), duration: spokenDuration(seconds, l) }),
  askDoneHold: (seconds: number, l: VoiceLocale) => tg('voice.askDoneHold', { duration: spokenDuration(seconds, l) }),
  askDoneHoldAgain: () => tg('voice.askDoneHoldAgain'),
  holdNotHeard: () => tg('voice.holdNotHeard'),
  holdEcho: (label: string, seconds: number, l: VoiceLocale) =>
    tg('voice.holdEcho', { name: spokenName(label, l), duration: spokenDuration(seconds, l) }),
  /** An open set, asked about again after the long window went unanswered. */
  remindDone: () => tg('voice.remindDone'),
  /** A record struck on this set (`domain/setRecord` — the same rule as the stage's beat and the poster). */
  record: () => tg('voice.record'),

  /** Spec §3.4 — the done question and its follow-ups. */
  askDone: () => tg('voice.askDone'),
  askDoneLast: () => tg('voice.askDoneLast'),
  askDoneWarmup: () => tg('voice.askDoneWarmup'),
  askDoneSuperset: (firstId: string, secondId: string) => tg('voice.askDoneSuperset', { first: name(firstId), second: name(secondId) }),
  /** A round of three or more (a tri-set, a circuit): one question, the reps in order. */
  askDoneRound: () => tg('voice.askDoneRound'),
  /** After "סיימתי" on a round: the reps, named for a pair, in order for more. */
  askRepsRound: (ids: readonly string[]) =>
    ids.length === 2 ? tg('voice.askRepsRound', { first: name(ids[0]), second: name(ids[1]) }) : tg('voice.askRepsRoundMany'),
  askRepsSecond: (secondId: string) => tg('voice.askRepsSecond', { second: name(secondId) }),
  /** The ear cannot hear her (a locked phone, a refused microphone): said ONCE, then the lines go on. */
  cantHear: () => tg('voice.cantHear'),
  /** The done question when nothing can hear the answer: where to mark the set. */
  markOnLock: () => tg('voice.markOnLock'),
  cantSkip: () => tg('voice.cantSkip'),
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
  /** The calibration set taught the load — it has no range to be over or under. */
  verdictCalibrated: (exerciseId: string, fromKg: number, toKg: number, l: VoiceLocale) =>
    tg('voice.verdictCalibrated', { load: spokenLoad(toKg, l), delta: deltaLine(exerciseId, fromKg, toKg, l) }),
  /**
   * The end of a lift met for the first time. ⛔ Never "בפעם הבאה נתחיל ב…" (2026-09-27): the next
   * workout's load is the engine's fold of all her sets, not the last one, and a coach's promise
   * about next time that the app then breaks is worse than none.
   */
  learnedLift: () => tg('voice.learnedLift'),

  /** Spec §3.6 — the rest. */
  rest: (seconds: number, l: VoiceLocale) => tg('voice.rest', { duration: spokenRest(seconds, l) }),
  tenSeconds: () => tg('voice.tenSeconds'),
  /**
   * Sets 2+ at the same load: "סט שתיים מתוך ארבע. ארבעים קילו, שמונה עד עשר חזרות." — the TOTAL, as
   * spec §3.6 writes it; the plates were said in the loading dialogue and are already on the bar.
   * A lift with no load says its range alone (the range carries "בלי משקל").
   */
  setStart: (exerciseId: string, kg: number | null, lo: number, hi: number, setN: number, setM: number, warmup: boolean, l: VoiceLocale) =>
    kg == null
      ? `${setLabelLine(setN, setM, warmup, l)}. ${rangeLine(lo, hi, kg, l, exerciseId)}.`
      : tg('voice.setStart', { setLabel: setLabelLine(setN, setM, warmup, l), load: spokenLoad(kg, l), range: rangeLine(lo, hi, kg, l, exerciseId) }),
  supersetStart: (setN: number, setM: number, firstId: string, secondId: string, l: VoiceLocale) =>
    tg('voice.supersetStart', { setLabel: setLabelLine(setN, setM, false, l), first: name(firstId), second: name(secondId) }),
  holdItem: (label: string, seconds: number, l: VoiceLocale) => tg('voice.holdItem', { name: spokenName(label, l), duration: spokenDuration(seconds, l) }),
  /** A distance item (a carry, a 400 m repeat) — never "zero seconds" (2026-09-27). */
  distanceItem: (label: string, metres: number, l: VoiceLocale) => tg('voice.distanceItem', { name: spokenName(label, l), distance: spokenDistance(metres, l) }),

  /** Spec §3.9 — a superset or a circuit: the whole round's loading, and its one echo. */
  /**
   * A superset's one loading dialogue (2026-09-27: each name said once, in the order she does them —
   * the first draft named both lifts, then named them again with their loads).
   */
  roundLoading: (steps: readonly { exerciseId: string; kg: number | null; lo: number; hi: number }[], l: VoiceLocale) =>
    tg(steps.length === 2 ? 'voice.roundLoading' : 'voice.roundLoadingMany', {
      lifts: liftsPhrase(steps.length, l),
      parts: steps
        .map((s, i) =>
          tg(i === 0 ? 'voice.roundPartFirst' : i === steps.length - 1 ? 'voice.roundPartLast' : 'voice.roundPartNext', {
            exercise: name(s.exerciseId),
            // A lift with no load says its range alone — the range already carries "בלי משקל".
            what: s.kg == null && loadStyleOf(s.exerciseId) !== 'band'
              ? rangeLine(s.lo, s.hi, s.kg, l, s.exerciseId)
              : loadLine(s.exerciseId, s.kg, l) + ', ' + rangeLine(s.lo, s.hi, s.kg, l, s.exerciseId),
          }),
        )
        .join('. '),
    }),
  roundStart: (setN: number, setM: number, ids: readonly string[], l: VoiceLocale) =>
    ids.length === 2
      ? tg('voice.supersetStart', { setLabel: setLabelLine(setN, setM, false, l), first: name(ids[0]), second: name(ids[1]) })
      : `${setLabelLine(setN, setM, false, l)}: ${tg('voice.roundNamesMany', { names: ids.map((id) => name(id)).join(', ') })}.`,
  /** The round's echo: each lift's reps, in order — its load was said at the bar and did not change. */
  echoRound: (items: readonly { exerciseId: string; kg: number | null; reps: number }[], l: VoiceLocale) =>
    tg('voice.echoRound', { parts: items.map((i) => tg('voice.echoPart', { exercise: name(i.exerciseId), figures: spokenReps(i.reps, l) })).join('. ') }),

  /** Spec §3.7 / §3.8 — the crossing and the end. */
  /**
   * The crossing: the lift done, the next one AND its load — she fetches the dumbbells or loads the
   * bar during this rest, not after it (2026-09-27) — and "התרגיל האחרון" when it is the day's last.
   */
  liftDone: (exerciseId: string, nextId: string, nextKg: number | null, nextIsLast: boolean, restS: number, l: VoiceLocale) => {
    const load = nextLoadPhrase(nextId, nextKg, l);
    return tg(nextIsLast ? 'voice.liftDoneLast' : 'voice.liftDone', {
      exercise: name(exerciseId),
      next: load ? name(nextId) + ', ' + load : name(nextId),
      duration: spokenRest(restS, l),
    });
  },
  sessionDone: (lifts: number, minutes: number, records: number, l: VoiceLocale) =>
    tg('voice.sessionDone', { lifts: liftsPhrase(lifts, l), minutes: minutesPhrase(minutes, l), records: recordsPhrase(records, l) }),
  back: () => tg('voice.back'),
};
