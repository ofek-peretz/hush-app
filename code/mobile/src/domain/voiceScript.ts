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
 * What she DOES, in the equipment's own terms, then the range. A bar is said by what goes on each
 * side and nothing else — "עשרה קילו בכל צד. שמונה עד עשר חזרות." (founder, 2026-10-05: *"אני לא בטוח
 * שצריך להגיד את סך המשקל הכולל. אלא רק כמה בכל צד"* — the total is on every screen she can glance
 * at; the ear gets the one number her hands need). Dumbbells say "in each hand"; a machine says its
 * total; bodyweight says "no weight". Numbers are words in Hebrew (`domain/hebrewNumbers`) and digits
 * in English.
 *
 * ── ⛔ SHORT (founder, 2026-10-05, after training with it) ───────────────────────────────────────
 *   > *"היא מדברת משפטים ארוכים וזה הכי גרוע כי זה צריך להיות כמה שפחות חיכוך. אי אפשר להתאמן ככה."*
 * The first script said everything every time: a lift's opening was fourteen seconds of speech (the
 * bar's own weight, the plates one by one, "when the bar is loaded, say: ready", "if you want a
 * different weight, say it") and every set was read its load and its range again. A line now says
 * what CHANGED and what she must DO, once. How the dialogue works ("say ready", "say a different
 * weight") is taught in the first workout's opening and never repeated; a set at the same load is
 * only its number; the echo is the reps she said, and the load only when it was not the plan's.
 *
 * Pure: no timers, no audio, no store. Tested line by line in `theVoiceSaysWhatTheSpecSays`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { exerciseDisplayName, loadStyleOf } from '@/data/exercises';
import { displayWeight } from '@/domain/schedule';
import type { Units } from '@/data/local/models';
import { loadSetup } from '@/domain/loadPresentation';
import { englishDuration, hebrewDuration, hebrewKilos, hebrewOrdinal, hebrewReps, hebrewWhole, spokenNumber } from '@/domain/hebrewNumbers';
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

/** Is the lift loaded with plates — a bar, or a machine with a horn on each side? */
function platesOn(exerciseId: string | null): boolean {
  const style = loadStyleOf(exerciseId);
  return style === 'barbell' || style === 'plate_loaded';
}

/** "עשרה קילו בכל צד" / "המוט בלבד" — a plate-loaded lift by what goes on each side. Null for any other equipment. */
function sideLine(exerciseId: string | null, kg: number, l: VoiceLocale): string | null {
  if (!platesOn(exerciseId)) return null;
  const side = loadSetup(exerciseId, displayWeight(kg, l.units), l.units)?.perSide ?? 0;
  if (side <= 0) return tg(loadStyleOf(exerciseId) === 'barbell' ? 'voice.loadBarOnly' : 'voice.loadBodyweight');
  return tg('voice.loadPerSide', { side: spokenDisplay(side, l) });
}

/**
 * ════ THE LOAD, AS AN INSTRUCTION (spec §2) ════
 * A bar by what goes on each side; everything else by its own figure. `loadSetup` does the plate
 * maths in display units; this only says it.
 *
 * ⛔ NOT THE TOTAL, NOT THE BAR'S OWN WEIGHT, NOT THE PLATES ONE BY ONE, NOT WHERE THE PIN GOES
 * (2026-10-05). "ארבעים קילו: המוט עשרים קילו, ועשרה קילו בכל צד: …" was five seconds for the one fact
 * her hands need (ten a side), and "ארבעים קילו: תשים את הפין על ארבעים" said one number twice.
 */
export function loadLine(exerciseId: string | null, kg: number | null, l: VoiceLocale): string {
  if (kg == null) return tg(loadStyleOf(exerciseId) === 'band' ? 'voice.loadBand' : 'voice.loadBodyweight');
  const total = spokenLoad(kg, l);
  const style = loadStyleOf(exerciseId);
  switch (style) {
    case 'barbell':
    case 'plate_loaded':
      return sideLine(exerciseId, kg, l)!;
    case 'dumbbell':
      return tg('voice.loadDumbbell', { perHand: total });
    case 'kettlebell':
      return tg('voice.loadKettlebell', { bell: total });
    case 'selectorized':
    case 'cable':
      return total;
    case 'fixed_barbell':
      return tg('voice.loadFixedBar', { total });
    case 'band':
      return tg('voice.loadBand');
    case 'bodyweight':
      // Added load on a bodyweight lift (a belt, a vest): the figure, said as what it is.
      return kg > 0 ? tg('voice.loadBodyweightPlus', { total }) : tg('voice.loadBodyweight');
  }
}

/**
 * What to move on a BAR to go from `fromKg` to `toKg` — "תוסיף קילו ורבע בכל צד". Empty for every
 * other kind of equipment: there the new total IS the instruction ("עולים לחמישה עשר קילו בכל יד"),
 * and saying it again as "take fifteen kilos in each hand" said one number twice.
 */
export function deltaLine(exerciseId: string | null, fromKg: number, toKg: number, l: VoiceLocale): string {
  const style = loadStyleOf(exerciseId);
  if (style !== 'barbell' && style !== 'plate_loaded') return '';
  // Said in display units directly (2026-09-27): converted back to kilos and re-rounded, a 5 lb
  // jump came out as "three pounds on each side".
  const diff = Math.abs((displayWeight(toKg, l.units) ?? toKg) - (displayWeight(fromKg, l.units) ?? fromKg)) / 2;
  const amount = spokenDisplay(diff, l);
  return toKg > fromKg ? tg('voice.deltaAddSide', { amount }) : tg('voice.deltaRemoveSide', { amount });
}

/**
 * A load that moved, said once, as the one thing to do. On a bar that is what to move — "תוסיף קילו
 * ורבע בכל צד." — and the direction is in the verb; anywhere else it is where the load goes: "עולים
 * לחמישה עשר קילו בכל יד." / "יורדים לארבעים קילו."
 */
function changeLine(exerciseId: string, fromKg: number, toKg: number, l: VoiceLocale): string {
  const delta = deltaLine(exerciseId, fromKg, toKg, l);
  if (delta) return `${delta}.`;
  const total = spokenLoad(toKg, l);
  const load = loadStyleOf(exerciseId) === 'dumbbell' ? tg('voice.loadDumbbell', { perHand: total }) : total;
  return tg(toKg > fromKg ? 'voice.verdictUp' : 'voice.verdictDown', { load });
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
 * "סט שני מתוך ארבעה" / "חימום ראשון מתוך שניים" — and the last working set of a lift is "סט אחרון"
 * (2026-09-27): the one number of the set a coach never reads out is the one she most wants to hear.
 *
 * ⛔ A SET IS MASCULINE, AND IT IS COUNTED AS ONE (2026-10-05; founder: *"היא לא מדברת בעברית
 * תקינה"*). The label was "סט שתיים מתוך ארבע" — feminine counting on a masculine noun — and its
 * first set "סט ראשון מתוך ארבע", an ordinal and a cardinal of two genders in four words. Hebrew says
 * a set by its ordinal and the total in the noun's gender; English keeps "Set 2 of 4".
 */
export function setLabelLine(n: number, m: number, warmup: boolean, l: VoiceLocale): string {
  if (m <= 1) return tg(warmup ? 'voice.warmupOnly' : 'voice.setLabelOnly');
  if (!warmup && n === m) return tg('voice.setLabelLast');
  const params = isHe(l) ? { n: hebrewOrdinal(n), m: hebrewWhole(m, 'm') } : { n: String(n), m: String(m) };
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
    case 'barbell':
    case 'plate_loaded':
      return sideLine(exerciseId, kg, l);
    default:
      return spokenLoad(kg, l);
  }
}


/**
 * "עשר חזרות" — the figures of a set as they are said back; "ארבעים קילו, עשר חזרות" when the load
 * is worth saying. ⛔ THE LOAD IS SAID ONLY WHEN IT IS NEWS (2026-10-05): pass the plan's load as
 * `plannedKg` and a set done at it is echoed by its reps alone — the load was said at the bar and is
 * on the bar; reading it back after every set was half of every echo. A load she changed, a load
 * with no plan to compare (`plannedKg` omitted) and a correction are said in full.
 */
export function figuresLine(kg: number | null, reps: number, l: VoiceLocale, plannedKg?: number | null): string {
  const r = spokenReps(reps, l);
  if (kg == null || (plannedKg !== undefined && plannedKg === kg)) return r;
  return tg('voice.figures', { load: spokenLoad(kg, l), reps: r });
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
  return loadStyleOf(exerciseId) === 'band'
    ? tg('voice.loadBandLift', { exercise: name(exerciseId), load: loadLine(exerciseId, null, l), range })
    : tg('voice.loadBodyweightLift', { exercise: name(exerciseId), range });
}

// ── The lines, one function per spoken moment ───────────────────────────────────────────────────

export const voiceScript = {
  /**
   * Said once in a lifetime — and it is where the dialogue is TAUGHT (2026-10-05): "say ready before a
   * set, your reps after it, a different weight if this one is wrong". Every lift's opening used to
   * repeat all three; now none of them does.
   */
  openFirstSession: () => tg('voice.openFirstSession'),
  /** The same sentence when the workout holds no microphone (2026-10-10): a set is marked, not said. */
  openFirstSessionMark: () => tg('voice.openFirstSessionMark'),
  /** The day in one breath. The first lift is not named here — its own opening names it a moment later. */
  openSession: (workout: string, lifts: number, minutes: number, l: VoiceLocale) =>
    tg('voice.openSession', { workout: spokenName(workout, l), lifts: liftsPhrase(lifts, l), minutes: minutesPhrase(minutes, l) }),

  /** Spec §3.2 — the loading dialogue's opening line: the lift, its load, its range. Nothing else. */
  loadCalibrated: (exerciseId: string, kg: number | null, lo: number, hi: number, l: VoiceLocale) =>
    kg == null ? noLoadOpening(exerciseId, lo, hi, l) : tg('voice.loadCalibrated', { exercise: name(exerciseId), load: loadLine(exerciseId, kg, l), range: rangeLine(lo, hi, kg, l, exerciseId) }),
  /** A lift met for the first time: the same line, with the load named for what it is — a start. */
  loadFirstTime: (exerciseId: string, kg: number | null, lo: number, hi: number, l: VoiceLocale) =>
    kg == null ? noLoadOpening(exerciseId, lo, hi, l) : tg('voice.loadFirstTime', { exercise: name(exerciseId), load: loadLine(exerciseId, kg, l), range: rangeLine(lo, hi, kg, l, exerciseId) }),
  /**
   * A warm-up's opening (2026-09-27, the script audit): the lift, which ramp step, the load, and the
   * COUNT — a warm-up has no band, and the old line invented one ("שמונה עד שתים עשרה").
   */
  warmupStart: (exerciseId: string, kg: number | null, reps: number, setN: number, setM: number, l: VoiceLocale) =>
    tg('voice.warmupStart', {
      exercise: name(exerciseId),
      setLabel: setLabelLine(setN, setM, true, l),
      load: loadLine(exerciseId, kg, l),
      reps: spokenReps(reps, l),
    }),
  /**
   * The set after a load moved: its number and what the equipment should now hold — each side of a
   * bar, the total of anything else. What to move was said when it moved, at the start of the rest
   * (`verdictUp`); this is the check that she moved it.
   */
  loadChanged: (exerciseId: string, toKg: number, setN: number, setM: number, warmup: boolean, l: VoiceLocale) =>
    tg('voice.loadChanged', { setLabel: setLabelLine(setN, setM, warmup, l), load: loadLine(exerciseId, toKg, l) }),
  /**
   * A load SHE named, said back. On a bar it is said both ways — "חמישים קילו, חמישה עשר קילו בכל צד."
   * — the one place the total is spoken: a number she says may be the bar's total or one side of it
   * (`voiceConductor` reads it both ways), and only both figures show her which was understood.
   */
  loadEcho: (exerciseId: string, kg: number | null, l: VoiceLocale) => {
    const load = loadLine(exerciseId, kg, l);
    const both = kg != null && platesOn(exerciseId) ? tg('voice.figures', { load: spokenLoad(kg, l), reps: load }) : load;
    return tg('voice.loadEcho', { load: both });
  },
  calibrationStart: (exerciseId: string, kg: number, l: VoiceLocale) => tg('voice.calibrationStart', { load: loadLine(exerciseId, kg, l) }),
  skippedLift: (exerciseId: string, kg: number | null, lo: number, hi: number, l: VoiceLocale) =>
    tg('voice.skippedLift', { exercise: name(exerciseId), load: loadLine(exerciseId, kg, l), range: rangeLine(lo, hi, kg, l, exerciseId) }),
  go: () => tg('voice.go'),
  readyPrompt: () => tg('voice.readyPrompt'),
  readyFallback: () => tg('voice.readyFallback'),
  /** The loading window ran out with no "מוכן": the question will still come — she may have started without it. */
  readyNotHeard: () => tg('voice.readyNotHeard'),

  /** Spec §3.9, amended 2026-09-27 — a hold the voice counts: its start, its end, her word. */
  holdLoading: (label: string, seconds: number, l: VoiceLocale) =>
    tg('voice.holdLoading', { name: spokenName(label, l), duration: spokenDuration(seconds, l) }),
  /** The hold's time is up: one word and the question. Its length was said when it began. */
  askDoneHold: () => tg('voice.askDoneHold'),
  askDoneHoldAgain: () => tg('voice.askDoneHoldAgain'),
  holdNotHeard: () => tg('voice.holdNotHeard'),
  /** The hold, said back: the time she held — which is the one thing she may want to correct. */
  holdEcho: (seconds: number, l: VoiceLocale) => tg('voice.holdEcho', { duration: spokenDuration(seconds, l) }),
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

  /**
   * Spec §3.5 — the echo and the verdict. `plannedKg` is the load the plan held for the set: at it,
   * the echo is her reps alone (see `figuresLine`).
   */
  echo: (kg: number | null, reps: number, l: VoiceLocale, plannedKg?: number | null) => tg('voice.echo', { figures: figuresLine(kg, reps, l, plannedKg) }),
  confirmHeard: (kg: number | null, reps: number, l: VoiceLocale, plannedKg?: number | null) =>
    tg('voice.confirmHeard', { figures: figuresLine(kg, reps, l, plannedKg) }),
  /**
   * The verdict is the MOVE, and nothing about the range she already knows she beat or missed
   * (2026-10-05): "עולים לארבעים ושתיים וחצי קילו: תוסיף קילו ורבע בכל צד."
   */
  verdictUp: (exerciseId: string, fromKg: number, toKg: number, l: VoiceLocale) => changeLine(exerciseId, fromKg, toKg, l),
  verdictDown: (exerciseId: string, fromKg: number, toKg: number, l: VoiceLocale) => changeLine(exerciseId, fromKg, toKg, l),
  verdictHold: () => tg('voice.verdictHold'),
  /** The calibration set taught the load — the same one line: where the next set goes. */
  verdictCalibrated: (exerciseId: string, fromKg: number, toKg: number, l: VoiceLocale) => changeLine(exerciseId, fromKg, toKg, l),

  /** Spec §3.6 — the rest. */
  rest: (seconds: number, l: VoiceLocale) => tg('voice.rest', { duration: spokenRest(seconds, l) }),
  tenSeconds: () => tg('voice.tenSeconds'),
  /**
   * Sets 2+ at the same load: "סט שני מתוך ארבעה." — its number, and nothing she already has
   * (2026-10-05). The load is on the bar and the range was said at the lift's opening; reading both
   * again before every set was five seconds, four times a lift.
   */
  setStart: (setN: number, setM: number, warmup: boolean, l: VoiceLocale) => `${setLabelLine(setN, setM, warmup, l)}.`,
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
  /** Rounds 2+ of a superset or a circuit: the round's number — its lifts were named when it was loaded. */
  roundStart: (setN: number, setM: number, l: VoiceLocale) => `${setLabelLine(setN, setM, false, l)}.`,
  /** The round's echo: each lift's reps, in order — its load was said at the bar and did not change. */
  echoRound: (items: readonly { exerciseId: string; kg: number | null; reps: number }[], l: VoiceLocale) =>
    tg('voice.echoRound', { parts: items.map((i) => tg('voice.echoPart', { exercise: name(i.exerciseId), figures: spokenReps(i.reps, l) })).join('. ') }),

  /** Spec §3.7 / §3.8 — the crossing and the end. */
  /**
   * The crossing: the next lift AND its load — she fetches the dumbbells or loads the bar during
   * this rest, not after it (2026-09-27) — and "התרגיל האחרון" when it is the day's last. The lift
   * she has just finished is not named (2026-10-05): she knows which one it was.
   */
  liftDone: (nextId: string, nextKg: number | null, nextIsLast: boolean, restS: number, l: VoiceLocale) => {
    const load = nextLoadPhrase(nextId, nextKg, l);
    return tg(nextIsLast ? 'voice.liftDoneLast' : 'voice.liftDone', {
      next: load ? name(nextId) + ', ' + load : name(nextId),
      duration: spokenRest(restS, l),
    });
  },
  sessionDone: (lifts: number, minutes: number, records: number, l: VoiceLocale) =>
    tg('voice.sessionDone', { lifts: liftsPhrase(lifts, l), minutes: minutesPhrase(minutes, l), records: recordsPhrase(records, l) }),
  back: () => tg('voice.back'),
};
