/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A PROGRAMME SHE ALREADY HAS — read, matched, and reported on. Never corrected.
 *
 * ⛔ FOUNDER, 2026-08-11: *"נצטרך שהמנוע לא יחתוך למתאמן וישמר לו את התוכנית ורק ינהל אותה."* And on
 * why it has to be airtight: *"זה הפתח גם למסלול המאמנים שיוצרים תוכנית עבור המתאמן שלהם."*
 *
 * This module does three things and refuses a fourth:
 *
 *   1. MATCH  — her exercise names onto catalogue ids, deterministically.
 *   2. BUILD  — a `Program` stamped `authored: 'athlete_or_coach'`, which `engineMayRebuild` then
 *               protects for ever.
 *   3. REPORT — everything about her week that breaks a Hush rule, as a list she reads.
 *
 * It does NOT fix any of it. A 74-minute Monday stays 74 minutes; a muscle under MEV stays under it.
 * The report is shown, she chooses, and if she keeps her week then nothing in the engine may touch
 * its shape again. That is the whole promise, and `aWeekSheBroughtIsNotOursToRewrite` enforces it.
 *
 * ── WHY THE MATCHING IS DETERMINISTIC AND THE AI IS THE FALLBACK ────────────────────────────────
 * The obvious build is "send the whole programme to a model and get ids back". It is the wrong way
 * round. Most of what an athlete writes is `Bench Press 4x8` — a name this catalogue already knows,
 * under its own name or one of its synonyms. Matching that locally is instant, free, works on the
 * underground with no signal, and cannot hallucinate a lift she did not write.
 *
 * So the model is asked ONLY about the leftovers, which is the founder's standing rule for AI in
 * this app: it does the one job the engine genuinely cannot, and nothing else.
 *
 * ⚠️ AND A WRONG MATCH IS WORSE THAN NO MATCH. If this guesses `leg curl` for "nordic" it has
 * changed her programme silently, which is the exact thing the whole feature exists to prevent. So
 * matching is CONSERVATIVE: an exact hit on the id, the name, or a declared synonym, or a token
 * containment where every word she wrote appears in the catalogue entry. Anything less confident is
 * returned as unmatched and becomes a question, never an answer.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { EXERCISES, exerciseById, muscleOf, type Exercise } from '@/data/exercises';
import { estimateSessionMinutes } from '@/data/api/fixtureModel';
import { SESSION_MAX, SETS_MIN, SETS_MAX, WEEKLY_SETS_FLOOR, CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import type { Program, ProgramDay, Slot } from '@/data/local/models';

/** One lift exactly as she wrote it, before anything is decided about it. */
export interface ImportedLift {
  /** Her words: "Barbell Bench Press", "bench", "incline db press", "לחיצת חזה". */
  name: string;
  /**
   * The same lift's ordinary English name, when the reader recognised it — see `IMPORT_READ_SCHEMA`.
   *
   * ⛔ THIS IS WHAT MAKES A HEBREW SHEET WORK. The catalogue ships English names only, by product
   * rule, so `matchLift` has no Hebrew in its vocabulary. Without this every line of a Hebrew
   * programme would miss locally and fall through to the model — slower, costlier, and it hands the
   * matching to the one component that can be wrong about it.
   *
   * ⚠️ HER WORDS STILL WIN EVERYWHERE ELSE. `name` is what the review quotes back to her.
   */
  nameEn?: string;
  /** How many working sets her plan says. Missing → the review asks; never guessed. */
  sets?: number;
}

export interface ImportedSession {
  name: string;
  lifts: ImportedLift[];
}

/** Her week as given — the input to everything below. */
export interface ImportedWeek {
  title?: string;
  sessions: ImportedSession[];
}

/*
 * ⛔ THE ABBREVIATIONS EVERY LIFTER WRITES, AND NOTHING ELSE.
 *
 * These are expansions, not guesses: `bb` is barbell wherever it appears in a gym, and no catalogue
 * entry means anything else by it. Deliberately short — the moment this table starts holding
 * judgement calls ("posterior" → hamstrings?) it stops being a normaliser and becomes the fuzzy
 * matcher this module exists to avoid.
 */
const ABBREVIATIONS: Record<string, string> = {
  bb: 'barbell',
  db: 'dumbbell',
  kb: 'kettlebell',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  sldl: 'romanian deadlift',
  bw: 'bodyweight',
  ez: 'barbell',
  lat: 'lat',
  pulldowns: 'pulldown',
  raises: 'raise',
  curls: 'curl',
  rows: 'row',
  presses: 'press',
  extensions: 'extension',
  squats: 'squat',
  dips: 'dip',
};

/** Her words, reduced to comparable tokens: lower case, no punctuation, abbreviations expanded. */
export function normaliseLiftName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .map((w) => ABBREVIATIONS[w] ?? w)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/*
 * ⛔ EVERY WORD THE CATALOGUE ITSELF USES — the only vocabulary this module trusts.
 *
 * It exists for one job: plurals. A lifter writes "pull ups", "curls", "dips"; the catalogue says
 * "Pull-up", "Curl", "Dip". Stripping a trailing `s` unconditionally is how "press" becomes "pres"
 * and "triceps" becomes "tricep", so it is stripped only when the SINGULAR is a word the catalogue
 * actually uses and the plural is not. That makes the rule self-maintaining: it follows the
 * catalogue rather than a list of English exceptions someone has to remember to update.
 */
const CATALOGUE_WORDS: Set<string> = new Set();

const singularise = (w: string): string => {
  if (!w.endsWith('s') || w.length < 3) return w; // 'ups' is three letters and still a plural
  if (CATALOGUE_WORDS.has(w)) return w; // "triceps", "press" — the plural IS the word
  const one = w.slice(0, -1);
  return CATALOGUE_WORDS.has(one) ? one : w;
};

const tokens = (s: string) =>
  new Set(normaliseLiftName(s).split(' ').filter(Boolean).map(singularise));

/** Every string the catalogue itself offers for a lift — its id, its name, its declared synonyms. */
function namesOf(ex: Exercise): string[] {
  return [ex.id.replace(/_/g, ' '), ex.name, ...(ex.synonyms ?? [])];
}

// Seed the vocabulary from the catalogue's own words, before any matching happens.
for (const ex of EXERCISES) {
  for (const n of namesOf(ex)) {
    for (const w of normaliseLiftName(n).split(' ')) if (w) CATALOGUE_WORDS.add(w);
  }
}

export interface LiftMatch {
  /** The catalogue id, or null when nothing matched confidently enough to be an answer. */
  id: string | null;
  /** How it was found — surfaced in the review so she can see WHY we chose a lift. */
  how: 'exact' | 'synonym' | 'contained' | 'unmatched';
}

/**
 * Her name → a catalogue id, or `null`.
 *
 * Three tiers, each stricter than a fuzzy score and each explainable in one sentence to the athlete:
 *
 *   exact      every word she wrote IS the catalogue's name for it (after normalising)
 *   synonym    the catalogue declares her exact phrase as another name for the lift
 *   contained  every word she wrote appears in one catalogue entry, and in exactly ONE — so
 *              "incline dumbbell press" finds `incline_db_press` while "press" finds nothing,
 *              because "press" is contained in a dozen of them and an ambiguous match is not a match
 *
 * ⚠️ NO EDIT DISTANCE, NO SCORING, NO "CLOSEST". Those turn a typo into a different exercise, and
 * this module's whole reason for existing is that her programme comes back as she wrote it.
 */
export function matchLift(raw: string): LiftMatch {
  const want = normaliseLiftName(raw);
  if (!want) return { id: null, how: 'unmatched' };

  const canon = (x: string) => [...normaliseLiftName(x).split(' ').filter(Boolean).map(singularise)].join(' ');
  const wantCanon = canon(raw);
  for (const ex of EXERCISES) {
    if (namesOf(ex).some((n) => normaliseLiftName(n) === want || canon(n) === wantCanon)) {
      return { id: ex.id, how: ex.name.toLowerCase() === raw.trim().toLowerCase() ? 'exact' : 'synonym' };
    }
  }

  const wanted = tokens(raw);
  const hits = EXERCISES.filter((ex) =>
    namesOf(ex).some((n) => {
      const have = tokens(n);
      return [...wanted].every((w) => have.has(w));
    }),
  );
  // Exactly one, or it is ambiguous and therefore a question rather than an answer.
  if (hits.length === 1) return { id: hits[0].id, how: 'contained' };
  return { id: null, how: 'unmatched' };
}

export interface MatchedLift extends ImportedLift {
  match: LiftMatch;
}

export interface MatchedWeek {
  title?: string;
  sessions: { name: string; lifts: MatchedLift[] }[];
  /** The names nothing in the catalogue answered — the ONLY thing the AI is asked about. */
  unmatched: string[];
}

/** Match every lift in her week, and collect what is left over for the model to look at. */
export function matchWeek(week: ImportedWeek): MatchedWeek {
  const unmatched: string[] = [];
  const sessions = week.sessions.map((s) => ({
    name: s.name,
    lifts: s.lifts.map((l) => {
      /*
       * Her words first — a sheet in English matches on them and the second reading is never used.
       * Only when her own words miss does the reader's English rendering get a turn, which is what
       * lets a Hebrew programme resolve locally instead of going to the model line by line.
       */
      let match = matchLift(l.name);
      if (!match.id && l.nameEn) match = matchLift(l.nameEn);
      if (!match.id && !unmatched.includes(l.name)) unmatched.push(l.name);
      return { ...l, match };
    }),
  }));
  return { ...(week.title ? { title: week.title } : {}), sessions, unmatched };
}

/**
 * Her week as a `Program` the app can run.
 *
 * ⚠️ `authored: 'athlete_or_coach'` IS THE POINT OF THIS FUNCTION. It is what `engineMayRebuild`
 * reads, and it is why none of `trimV5ToBudget`, `enforceTimeCap`, `raiseToWeeklyFloor` or
 * `growEmphasised` will ever run over this week. Building the same days without that stamp would
 * produce a programme the engine rewrites on her next profile edit.
 *
 * ⚠️ SET COUNTS ARE COPIED, NOT CLAMPED. F-1 says a Hush block is three to five sets. Her coach's
 * six-set block is not a Hush block, and clamping it here would be the silent correction this whole
 * module refuses. `sessionTargets` already sizes its emission from the programme's largest slot, so
 * a six-set block arrives fully loaded. A lift with NO set count is the one thing that cannot be
 * carried — a session cannot run "some" sets — so it falls back to F-1's floor and is reported.
 */
export const SETS_WHEN_UNSTATED = SETS_MIN;

export function toProgram(matched: MatchedWeek, id = `imported-${Date.now()}`): Program {
  const days: ProgramDay[] = matched.sessions.map((s, i) => {
    const slots: Slot[] = s.lifts
      .filter((l) => l.match.id)
      .map((l) => {
        const ex = exerciseById(l.match.id as string)!;
        return {
          // The slot's capability is the LIFT's — read from the catalogue, never inferred from her
          // session's name. A day she calls "Push" that holds a row is still a row.
          capability: ex.capability,
          exerciseId: ex.id,
          setCount: l.sets && l.sets > 0 ? Math.floor(l.sets) : SETS_WHEN_UNSTATED,
          supplemental: false,
        };
      });
    return {
      id: `${id}-d${i + 1}`,
      name: s.name,
      // The metadata line every day carries, taken from what her session actually trains.
      muscleGroups: [...new Set(slots.map((sl) => muscleOf(sl.exerciseId)).filter(Boolean) as string[])],
      isRest: false,
      slots,
    };
  });
  return {
    id,
    frequency: days.length,
    days,
    authored: 'athlete_or_coach',
    ...(matched.title ? { title: matched.title } : {}),
  } as Program;
}

/* ─────────────────────────── what we found, and never fixed ─────────────────────────── */

export type FindingKind =
  | 'unmatched_lift'
  | 'sets_unstated'
  | 'session_over_hour'
  | 'muscle_under_dose'
  | 'sets_above_ceiling'
  | 'muscle_once_a_week';

export interface Finding {
  kind: FindingKind;
  /** The day, muscle or lift the finding is about — whatever the sentence needs to name. */
  subject: string;
  /** The number that made it a finding: minutes, weekly sets, set count. */
  value?: number;
}

/**
 * Everything about her week that a Hush week would not do.
 *
 * ⛔ THIS IS A REPORT, AND THE ORDER OF THESE CHECKS IS THE ORDER SHE SHOULD READ THEM. What she
 * cannot act on without us (a lift we could not find) comes before what she can decide for herself
 * (a long session). Nothing here changes a single slot — the caller renders it, she chooses, and if
 * she keeps her week every one of these findings simply stands.
 *
 * ⚠️ IT IS DELIBERATELY THE SAME CONSTANTS THE ENGINE USES, not a second opinion. If `SESSION_MAX`
 * moves, what we tell her about her own programme moves with it, and there is no second definition
 * of "too long" to drift out of step.
 */
export function reviewFindings(matched: MatchedWeek, program: Program): Finding[] {
  const out: Finding[] = [];

  for (const name of matched.unmatched) out.push({ kind: 'unmatched_lift', subject: name });

  for (const s of matched.sessions)
    for (const l of s.lifts) {
      if (l.match.id && (l.sets == null || l.sets <= 0)) {
        out.push({ kind: 'sets_unstated', subject: l.name, value: SETS_WHEN_UNSTATED });
      }
    }

  for (const d of program.days) {
    if (d.isRest || d.slots.length === 0) continue;
    const min = estimateSessionMinutes(d);
    if (min > SESSION_MAX) out.push({ kind: 'session_over_hour', subject: d.name, value: Math.round(min) });
    for (const slot of d.slots) {
      if (slot.setCount > SETS_MAX) {
        out.push({ kind: 'sets_above_ceiling', subject: slot.exerciseId, value: slot.setCount });
      }
    }
  }

  const weekly: Record<string, number> = {};
  const daysOf: Record<string, Set<string>> = {};
  for (const d of program.days)
    for (const slot of d.slots) {
      const m = muscleOf(slot.exerciseId);
      if (!m) continue;
      weekly[m] = (weekly[m] ?? 0) + slot.setCount;
      (daysOf[m] ??= new Set()).add(d.id);
    }
  for (const m of CANONICAL_MUSCLE_ORDER) {
    const n = weekly[m];
    if (n == null) continue; // a muscle her programme does not train is her choice, not a finding
    if (m === 'Core') continue; // supplemental everywhere in this engine
    if (n < WEEKLY_SETS_FLOOR) out.push({ kind: 'muscle_under_dose', subject: m, value: n });
    else if ((daysOf[m]?.size ?? 0) < 2) out.push({ kind: 'muscle_once_a_week', subject: m, value: 1 });
  }

  return out;
}

/** Whether her week can be run at all — the one thing a report is not enough for. */
export function isRunnable(program: Program): boolean {
  return program.days.some((d) => !d.isRest && d.slots.length > 0);
}
