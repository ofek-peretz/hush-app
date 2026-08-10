/**
 * Local fixture model — the runnable program engine for the app today (every signed-in
 * user runs on this until a backend session/token exchange exists; see selectModel).
 *
 * It builds the athlete's programme and personalized cold-start loads:
 *  - generateProgram: the programme is ASSEMBLED from her body map (engine v5, register Part 3) —
 *    `assembleV5DayLists` turns the map (off / normal / emphasis per muscle) + days into the week's
 *    day-lists, and the shared generator (dayFromBlueprint → orderForFlow / set counts / the time cap)
 *    builds each day. The demographic split (MEN_SPLITS / WOMEN_SPLITS) is DELETED (register Part 5);
 *    structure is an OUTPUT of volume, never a shelf chosen by sex × days.
 *  - sessionTargets: the v5 engine (exercise-keyed, facts only) owns load, progression and the band;
 *    a cold-start seed (HER SEX + BODYWEIGHT only, register B-1) opens a never-performed lift, and
 *    Loop 1 corrects it from her very first set (Rev 8 — there is no approach set).
 *
 * One goal: hypertrophy (register Part 9 §A) — goal and experience are no longer engine inputs.
 */
// @ts-nocheck

// 

import type {
  Capability,
  MuscleStance,
  PortraitSnapshot,
  Profile,
  Program,
  ProgramDay,
  SetTarget,
  Slot,
} from '@/data/local/models';
import { EXERCISES, exerciseById, exercisesForMuscle, isSwapOnly, patternFamily, type Exercise, type MuscleGroup } from '@/data/exercises';
import { swapScore } from '@/domain/swapPool';
import { startingWeight } from '@/domain/startingLoad';
import { computePortrait } from '@/data/progression';
import { bandFor } from '@/engine/v5/repBand';
import { chooseDonor, type VolumeCandidate } from '@/engine/v5/volumeAllocation';
import { advanceV5, currentV5Targets, getVolumeTargetsV5, recordStructuralChangeV5, perRungForV5, getSessionEarnedV5, getSessionForwardV5, type V5Target } from '@/engine/v5/v5Engine';
import type { Explanation } from '@/engine/weeklyView';
import { assembleV5DayLists, ESSENTIAL_PATTERNS } from '@/engine/v5/programAssembly';
import { learnedRestS, learnedExecS, type ExecSample } from '@/engine/v5/timeBudget';
import { learnedTransitionRestS, REST_TRANSITION_S } from '@/domain/restPrescription';
import { CANONICAL_MUSCLE_ORDER, MUSCLE_VOLUME_SHARE, EMPHASIS_FRACTION, WEEKLY_SETS_FLOOR, SETS_MIN as V5_SETS_MIN, SETS_MAX as V5_SETS_MAX } from '@/engine/v5/constants';
import { resolveEngineEnactments } from '@/domain/engineChanges';
import { enginePattern, type Pattern, type Equipment } from '@/engine/catalog';
import { epley, normalizeLoad } from '@/engine/loadMath';
import { db, EMPTY_PREFERENCES, type OwnedPreferences } from '@/data/local/db';
import type { Session } from '@/data/local/models';
import { track } from '@/platform/telemetry';
import type { ActualSet, ModelClient } from './modelClient';

// F-1 — sets per exercise live in [3, 5], and that is the ONLY ceiling. A v4-era "max 4 for EVERY
// lift" constant used to sit here and clamp `setsFor`, while Loop 3's `distributeMuscleSets` was
// already handing a grown muscle 5 (SETS_MAX). Two different ceilings inside one engine; the
// register names one. `sessionTargets` emits at least this many per-set targets per exercise so a
// slot's setCount is ALWAYS fully covered (a slot never falls through to the default-weight
// fallback).
const MAX_SETS = V5_SETS_MAX;

// ───────────────────────────── programme assembly ─────────────────────────────
// The demographic split (MEN_SPLITS / WOMEN_SPLITS, and the MEN / WOMEN day pools they drew from) is
// DELETED (register Part 5): the programme is assembled from her body map by assembleV5DayLists, not
// chosen by sex × days from a shelf. Core is not a structural muscle here — it is supplemental work
// added once per week by addWeeklyCore(), which honours the map's Core stance (off → none; emphasis →
// a second core movement). Each day lists compounds first; dayFromBlueprint enforces the same.

/**
 * Order a day's exercises for gym flow — the athlete works ONE piece of equipment to the end and
 * NEVER leaves and returns to it (founder 2026-07-09: critical in a packed gym; a taken station on
 * return is the worst experience). This is the hard constraint, so it wins over strict global
 * compounds-first: exercises are grouped by EQUIPMENT (every same-station lift is contiguous), and
 * WITHIN each station compounds come before isolation (never pre-fatigue the station's main lift).
 * Stations are ordered so the one holding the earliest COMPOUND leads — the day's main lift stays
 * first — and isolation-only stations trail. The only price vs the old rule is that a station's
 * isolation can precede another station's compound; grouping equipment is worth it.
 */
export function orderForFlow(list: Exercise[]): Exercise[] {
  const tierRank = (e: Exercise) => (e.tier === 'compound' ? 0 : 1);
  const idx = new Map<Exercise, number>(list.map((e, i) => [e, i]));
  /*
   * ════ EQUIPMENT FAMILY IS NOT A STATION (founder 2026-08-08) ════
   *
   * Founder: *"מה שהמנוע עשה זה פשוט ליצור כמעט את כל האימון עם אותו הציוד וזה ברור שזה לא מה
   * שרציתי. גם לא רציתי מבודד לפני מורכב."*
   *
   * This grouped by `e.equipment`, and that field has FIVE values — barbell, dumbbell, machine,
   * cable, bodyweight. "One station, fully, before moving on" therefore meant "every barbell lift
   * together, then every machine lift together", which cuts a day into three or four huge blocks
   * and reads as a session done on one thing. It does not even save the walk it was written for: a
   * leg press, a chest press, a lat pulldown and a leg curl are all `machine` and stand in four
   * corners of the room.
   *
   * And it bought that with the training order. The old note admitted the price — *"a station's
   * isolation can precede another station's compound; grouping equipment is worth it"* — which is
   * the second half of what he said he did not want.
   *
   * ── THE THREE RULES, IN HIS ORDER ─────────────────────────────────────────────────────────────
   *   1. The programme is not touched. Selection already happened; this only orders it.
   *   2. COMPOUNDS BEFORE ISOLATIONS, globally and without exception. Never traded for a shorter
   *      walk — which also delivers "a compound before an isolation on the same equipment", since
   *      every compound is already ahead of every isolation.
   *   3. INSIDE each of those two phases, save the walk: chain to a lift on the SAME PHYSICAL
   *      station first (catalogue `station` — the leg press and its calf raise), then to one in the
   *      same equipment family, then to whatever catalogue order offers next. Equipment family is a
   *      tie-break here, never a grouping key.
   *
   * Deterministic: every preference falls back to the incoming order, which is catalogue order.
   */
  const chain = (phase: Exercise[]): Exercise[] => {
    const out: Exercise[] = [];
    const left = [...phase];
    while (left.length) {
      const prev = out[out.length - 1];
      let pick = 0; // catalogue order is the floor
      if (prev) {
        const sameStation = prev.station ? left.findIndex((e) => e.station === prev.station) : -1;
        const sameFamily = left.findIndex((e) => e.equipment === prev.equipment);
        pick = sameStation >= 0 ? sameStation : sameFamily >= 0 ? sameFamily : 0;
      }
      out.push(left[pick]);
      left.splice(pick, 1);
    }
    return out;
  };
  const byOrder = (a: Exercise, b: Exercise) => idx.get(a)! - idx.get(b)!;
  /*
   * ⛔ THE ONE EXCEPTION TO "COMPOUNDS FIRST", AND IT IS A PHYSICAL FACT, NOT A PREFERENCE.
   *
   * `leg_press` and `leg_press_calf_raise` are the SAME MACHINE — the catalogue says so with
   * `station`. Compounds-first puts every isolation behind every compound, which sends her to the
   * leg press, away, and back to the leg press for calves: the exact "left and returned" this whole
   * function exists to prevent, and the case the old station test pinned.
   *
   * So an isolation that shares a physical station with a compound rides directly behind it. This is
   * the only thing allowed past the compounds-first line, it is never a whole equipment FAMILY (that
   * coarseness is the bug being fixed), and it only fires where two catalogue lifts genuinely share
   * one piece of equipment.
   */
  const compounds = chain([...list].filter((e) => tierRank(e) === 0).sort(byOrder));
  const isolations = chain([...list].filter((e) => tierRank(e) === 1).sort(byOrder));
  const ordered: Exercise[] = [];
  const pulled = new Set<Exercise>();
  for (const c of compounds) {
    ordered.push(c);
    if (!c.station) continue;
    for (const i of isolations) if (!pulled.has(i) && i.station === c.station) { ordered.push(i); pulled.add(i); }
  }
  for (const i of isolations) if (!pulled.has(i)) ordered.push(i);
  return ordered;
}


/**
 * Re-run the gym-flow ordering on a day whose slots were EDITED AFTER assembly. `applyLeaveIts`
 * can replace a slot's exercise with one on DIFFERENT equipment (a leave-it is same-muscle, not
 * same-machine) — planting, say, a barbell lift in the middle of the machine block, which breaks
 * the one law this ordering exists for ("enter a station once, leave it finished"). Slots keep
 * their identity (setCount, supplemental) — only their order moves; ids are unique within a day.
 */
export function reflowDayForStations(day: ProgramDay): void {
  const nonSupp = day.slots.filter((s) => !s.supplemental);
  const supp = day.slots.filter((s) => s.supplemental); // core trails, always
  const bySlotEx = new Map(nonSupp.map((s) => [s.exerciseId, s]));
  const ordered = orderForFlow(nonSupp.map((s) => exerciseById(s.exerciseId)).filter((e): e is Exercise => !!e));
  const reordered = ordered.map((e) => bySlotEx.get(e.id)).filter((s): s is Slot => !!s);
  // A slot whose id resolves to no catalog entry (impossible today) keeps its place at the front.
  if (reordered.length === nonSupp.length) day.slots = [...reordered, ...supp];
}

function dayFromBlueprint(
  index: number,
  name: string,
  exerciseIds: string[],
  /** v5 Loop 3: the LEARNED per-exercise set count (distributeMuscleSets). Absent → the day-one
   *  `setsFor`, so a muscle still on its day-one shape is untouched. */
  setCounts?: Record<string, number>,
  /** Muscles she marked `emphasis` (S-4) — each of their lifts carries one extra set. */
  emphasised: ReadonlySet<string> = new Set(),
): ProgramDay {
  const dayKey = String(index);
  // NO ENGINE SLOT ID. v5 keys every decision to the EXERCISE — "State is keyed to the exercise,
  // never to a slot" (Loop 2) — and S-29 deletes the `canonicalEngineId` unification that was the
  // only consumer of the per-slot pattern-occurrence key this used to compute. A slot key in an
  // engine with no slot state is v4 furniture; it is gone.
  const exercises = orderForFlow(
    exerciseIds.map((exerciseId) => exerciseById(exerciseId)).filter((e): e is Exercise => !!e),
  );
  const slots: Slot[] = exercises.map((ex) => ({
    capability: ex.capability,
    exerciseId: ex.id,
    setCount: setCounts?.[ex.id] ?? (emphasised.has(ex.muscle) ? Math.min(V5_SETS_MAX, setsFor(ex.tier) + 1) : setsFor(ex.tier)),
  }));
  // Display the precise muscle groups the session trains (e.g. Quads · Hamstrings ·
  // Calves · Core), in catalog order, deduplicated.
  const muscleGroups = [...new Set(exercises.map((ex) => ex.muscle))];
  return { id: `day_${index}`, name, muscleGroups, isRest: false, slots, key: dayKey, completed: false };
}

// ───────────────────────────── supplemental core (founder rules 2026-06-23) ─────────────────────────────
// Core is supplemental, NOT a primary progression target. Exactly ONE core exercise per
// week, 3 sets, placed LAST, preferring an upper-body session over a lower one. Rotated by
// frequency so every core movement is reachable through generation (not just via swaps).
// Generation pool = accessible core only (cable/machine crunch). The advanced movements
// (hanging leg raise, ab wheel) are swap-only: a first-week athlete is never assigned a
// movement that requires strength they don't have yet; anyone can swap into them.
const CORE_POOL = EXERCISES.filter((e) => e.muscle === 'Core' && !isSwapOnly(e.id)).map((e) => e.id);
const CORE_SETS = 3;

/** The session a weekly core block attaches to: upper-preferred, then full-body, then first. */
function coreHostIndex(days: ProgramDay[]): number {
  const upper = days.findIndex((d) => /^(Upper|Push|Pull)/.test(d.name));
  if (upper >= 0) return upper;
  const full = days.findIndex((d) => /^Full Body/.test(d.name));
  return full >= 0 ? full : 0;
}

// ── Session duration cap (founder rule 2026-06-23: the prescribed work must fit ≤ 1 hour) ──
// Prescribed WORK SETS only — warm-ups, walks and setup are the athlete's, never counted.
// Per-set minutes ≈ rest + execution; compounds rest longer than isolation. These are the DAY-ONE
// bootstrap, used until she has rest data — then her MEASURED rest replaces the rest portion (S-64).
const COMPOUND_SET_MIN = 3;
const ISOLATION_SET_MIN = 2;
const MAX_SESSION_MIN = 60;
// B-4, the WORK half — the active seconds of a set before she has performed any. B-4 names BOTH
// facts that replace this bootstrap: "her measured rest (built, Stage 0) AND HER SET DURATIONS
// (timestamps)". Both are wired now (`learnedRestS` / `learnedExecS`); this is only what stands in
// until each exists. Tuned so exec + a typical rest ≈ COMPOUND/ISOLATION_SET_MIN above, keeping the
// transition smooth (rest ~135s compound / ~90s isolation reproduces 3 / 2 minutes).
const SET_EXEC_SECONDS = { compound: 45, isolation: 30 } as const;

function isCompound(exerciseId: string): boolean {
  return exerciseById(exerciseId)?.tier === 'compound';
}

/**
 * Per-set MINUTES for a slot — **both halves of the cost, each measured when she has it** (B-4/S-64):
 * her set DURATION (`execSecFor`, from set timestamps) plus her REST (`restSecFor`, the median of her
 * recorded `restBeforeS`, S-17). Either one absent falls back to the day-one bootstrap for that half,
 * so a lift she has never performed still prices honestly and a lift she has prices from facts.
 */
function perSetMinutes(
  exerciseId: string,
  restSecFor?: (id: string) => number | null,
  execSecFor?: (id: string) => number | null,
): number {
  const compound = isCompound(exerciseId);
  const rest = restSecFor?.(exerciseId) ?? null;
  const exec = execSecFor?.(exerciseId) ?? null;
  // No rest fact at all → the whole-set bootstrap (it already bundles work + rest).
  if (rest == null) return compound ? COMPOUND_SET_MIN : ISOLATION_SET_MIN;
  return ((exec ?? SET_EXEC_SECONDS[compound ? 'compound' : 'isolation']) + rest) / 60;
}

/** Estimated prescribed-work minutes for a day (work sets only) — her measured set duration + her
 *  measured rest (S-64 from FACTS, not v4's rest-blind fixed estimate).
 *
 *  `transitionSec` — the between-exercises rest (her pooled median, else the declared 120 s). The
 *  FIRST set of every lift follows the TRANSITION, not the inter-set rest, so each slot's cost is
 *  adjusted by (transition − inter) once. Only applied when the lift HAS a measured inter rest —
 *  the day-one bootstrap (COMPOUND/ISOLATION_SET_MIN) already bundles the whole walk. Omitted →
 *  the old pricing, unchanged (every existing caller and test). This keeps the budget pricing the
 *  SAME seconds the timers actually run (S-17/S-64 — one answer, both surfaces). */
export function estimateSessionMinutes(
  day: ProgramDay,
  restSecFor?: (id: string) => number | null,
  execSecFor?: (id: string) => number | null,
  transitionSec?: number | null,
): number {
  return day.slots.reduce((m, s) => {
    let mins = s.setCount * perSetMinutes(s.exerciseId, restSecFor, execSecFor);
    const rest = restSecFor?.(s.exerciseId) ?? null;
    if (rest != null && transitionSec != null) mins += (transitionSec - rest) / 60;
    return m + mins;
  }, 0);
}

/**
 * Keep a day's prescribed work at or under MAX_SESSION_MIN. Quality-preserving and ordered —
 * compound work is NEVER sacrificed before isolation work (founder, 2026-07-06):
 *   1) trim isolation bonus sets back to the 3-set minimum (high-volume weeks), last backward;
 *   2) then drop a trailing NON-core isolation slot, never going below 4 slots and never
 *      dropping calves/core (coverage guarantees hold);
 *   3) only then trim the bonus set off compounds (4→3) from the LAST compound backward —
 *      never the first (the day's main lift keeps its full scheme), never below 3;
 *   4) LAST RESORT (S-35): still over budget with only compounds to give → drop the trailing
 *      compound whose muscle keeps ANOTHER exercise — never a muscle's ONLY lift, so a normal /
 *      emphasis muscle is never silently stopped. If none qualifies, the day genuinely cannot fit
 *      her minutes (S-3) and is left as-is rather than starving a muscle.
 */
// `budgetMin` is her declared time budget (S-64) — profile.workoutMinutes, defaulting to the
// 60-minute ceiling.
/**
 * ════ THE FLOOR UNDER A SESSION — the mirror of the time cap (founder 2026-08-08) ════
 *
 * `enforceTimeCap` has always trimmed a day DOWN to her minutes. Nothing ever filled one UP, so
 * `MAX_SESSION_MIN` was a ceiling with no floor beneath it and a session could come out at 24
 * minutes without a single check complaining. The sweep across 1,455 programmes counted 335 of them
 * under 45; scaling volume with frequency and with the muscles left on the map took it to 184, and
 * the rest are days the DEAL left thin rather than days the volume left small.
 *
 * So the floor is enforced where the ceiling is: give the day's existing lifts more sets, largest
 * gap first, until it reaches `MIN_SESSION_MIN` or nothing can legally grow.
 *
 * ⛔ IT ADDS SETS, NEVER EXERCISES. An exercise is a training decision — which muscle, which
 * pattern, which equipment — and that belongs to the assembler, which has her map and her volume
 * targets. This has neither. Adding a set to a lift she is already doing is the one move that
 * cannot change what the session IS. F-1's [3,5] still bounds every slot, and a supplemental core
 * block is never grown (it is a finisher, not the work).
 */
const MIN_SESSION_MIN = 45;

function fillToSessionFloor(
  day: ProgramDay,
  floorMin: number = MIN_SESSION_MIN,
  restSecFor?: (id: string) => number | null,
  execSecFor?: (id: string) => number | null,
  transitionSec?: number | null,
): void {
  const minutes = () => estimateSessionMinutes(day, restSecFor, execSecFor, transitionSec);
  // Compounds grow first (S-35 — the compound keeps the fullest scheme), then isolations; catalogue
  // order inside each. Deterministic, and it never exceeds F-1's ceiling.
  const growable = () =>
    day.slots
      .filter((s) => !s.supplemental && s.setCount < V5_SETS_MAX)
      .sort((a, b) => (isCompound(b.exerciseId) ? 1 : 0) - (isCompound(a.exerciseId) ? 1 : 0));
  for (let guard = 0; guard < day.slots.length * V5_SETS_MAX && minutes() < floorMin; guard++) {
    const next = growable()[0];
    if (!next) break; // every lift is at the ceiling — the day is as long as it can honestly be
    next.setCount += 1;
  }
}

function enforceTimeCap(
  day: ProgramDay,
  budgetMin: number = MAX_SESSION_MIN,
  restSecFor?: (id: string) => number | null,
  /** B-4 — her measured set duration (timestamps), the work half of the per-set cost. */
  execSecFor?: (id: string) => number | null,
  /** Her learned LEAVE-ITS (S-71). A leave-it binds WHICH exercise, never whether it appears (L6) —
   *  so the budget still cuts, but a leave-it is cut LAST (S-59 / Part 3 #5). */
  protectedIds: ReadonlySet<string> = new Set(),
  /** The between-exercises rest (her pooled median, S-17) — prices each lift's first set honestly. */
  transitionSec?: number | null,
  /** Muscles she marked `emphasis` (S-4). Their claim on the day is raised so the cap never quietly
   *  undoes the mark — the same rule `chooseDonor` already applies inside `trimV5ToBudget`. */
  emphasised: ReadonlySet<string> = new Set(),
  /*
   * ⛔ MUSCLES THIS WEEK TRAINS ON MORE THAN ONE DAY — the scope S-35 actually meant.
   *
   * "Never a muscle's ONLY lift" exists so the cap cannot silently turn off a muscle she left on.
   * It was written when every day was upper or lower, where a muscle's one lift on its day WAS its
   * week. Full-body days broke that reading: at three days every muscle holds exactly one lift per
   * session, so the guard fired on every slot, no drop was ever legal, and a Full Body A of eight
   * lifts sat at 63 minutes with the cap out of moves.
   *
   * A muscle trained on Monday and Thursday does not go dark because Monday gives up its lift. So
   * the guard asks the WEEK, not the day. Empty (the default, and every older caller) → the strict
   * per-day reading, unchanged.
   */
  trainedOnOtherDays: ReadonlySet<string> = new Set(),
): void {
  const over = () => estimateSessionMinutes(day, restSecFor, execSecFor, transitionSec) > budgetMin;
  /** How many non-supplemental exercises each muscle currently keeps on this day. Recomputed on every
   *  pass, because dropping a slot is what changes the answer. */
  const exCountByMuscle = (): Record<string, number> => {
    const n: Record<string, number> = {};
    for (const s of day.slots) {
      if (s.supplemental) continue;
      const m = exerciseById(s.exerciseId)?.muscle;
      if (m) n[m] = (n[m] ?? 0) + 1;
    }
    return n;
  };
  /*
   * ════ A DROP MAY NOT ORPHAN AN ESSENTIAL PATTERN (founder 2026-08-08) ════
   *
   * `ESSENTIAL_PATTERNS` made the SELECTOR always choose a vertical pull for Back. The audit still
   * printed male 4× and 5× as a row plus a rear delt fly, because this function then removed it: the
   * two passes below know about leave-its (S-59) and about a muscle's only exercise (S-35), and
   * nothing else. A pulldown with a row beside it looked exactly like spare volume.
   *
   * Losing the last pulldown is not the same kind of loss as losing a second row. The muscle still
   * has lifts, so S-35 stays quiet, and the day silently drops a movement the muscle cannot be
   * trained without. So the same pair the selector guarantees, the trim now refuses to orphan —
   * per DAY, which is the unit this function owns.
   */
  const lastOfEssentialPattern = (slot: Slot): boolean => {
    const ex = exerciseById(slot.exerciseId);
    if (!ex) return false;
    const essential = ESSENTIAL_PATTERNS[ex.muscle];
    if (!essential?.includes(ex.pattern)) return false;
    const sameOnDay = day.slots.filter((s) => {
      const e = exerciseById(s.exerciseId);
      return !s.supplemental && e?.muscle === ex.muscle && e.pattern === ex.pattern;
    });
    return sameOnDay.length <= 1;
  };
  /*
   * ════ THE CAP GIVES UP SETS THE WAY chooseDonor DOES (founder 2026-08-09) ════
   *
   * Both drop passes below walk the day BACKWARDS and take the first slot that qualifies, so the
   * muscle they take from is whichever sits late in `CANONICAL_MUSCLE_ORDER` — an ordering built as
   * a tie-break, never as a priority. `MUSCLE_VOLUME_SHARE` gave the back the largest weekly target
   * and the cap handed it straight back: the back sits fourth of five upper muscles, so it was cut
   * first, and the printed week still read Back 8 · Calves 6. Scaling day-one SET counts to match
   * the share made it worse for the same reason — a longer day just means a harder cut.
   *
   * `trimV5ToBudget` has always known the right rule (S-37 / `chooseDonor`: never an emphasis
   * muscle, never one at its floor, otherwise whoever can best spare it). This is that rule, in the
   * blunt pass, expressed as an ORDER rather than a veto: sort the candidates by how far each
   * muscle's sets on this day exceed its share of the day, and take from the most over-served.
   * Ties fall back to the incoming position, so it stays deterministic.
   */
  // An EMPHASIS mark raises a muscle's claim here exactly as it raises its weekly target (S-4), so
  // the cap cannot quietly undo what she asked for. Without this, `chooseDonor` protected an
  // emphasised chest and then this pass cut it back to the same size as an unmarked one.
  const claimOf = (m: string) =>
    (MUSCLE_VOLUME_SHARE[m] ?? 1) * (emphasised.has(m) ? 1 + EMPHASIS_FRACTION : 1);
  const overServed = (): Map<number, number> => {
    const sets: Record<string, number> = {};
    for (const s of day.slots) {
      if (s.supplemental) continue;
      const m = exerciseById(s.exerciseId)?.muscle;
      if (m) sets[m] = (sets[m] ?? 0) + s.setCount;
    }
    const shareTotal = Object.keys(sets).reduce((n, m) => n + claimOf(m), 0) || 1;
    const total = Object.values(sets).reduce((n, v) => n + v, 0) || 1;
    const score = new Map<number, number>();
    day.slots.forEach((s, i) => {
      const m = exerciseById(s.exerciseId)?.muscle;
      if (!m) return;
      const deserved = (total * claimOf(m)) / shareTotal;
      score.set(i, (sets[m] ?? 0) - deserved); // > 0 → this muscle has more than its share today
    });
    return score;
  };
  /** Slot indices, most over-served muscle first; ties keep the trailing-first order. */
  const dropOrder = (): number[] => {
    const score = overServed();
    return day.slots
      .map((_s, i) => i)
      .sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || b - a);
  };
  const isoIdx = day.slots.map((_s, i) => i).filter((i) => !isCompound(day.slots[i].exerciseId));
  for (let k = isoIdx.length - 1; k >= 0 && over(); k--) {
    const slot = day.slots[isoIdx[k]];
    if (!slot.supplemental && slot.setCount > 3) slot.setCount = 3;
  }
  // 2) Drop a trailing NON-core isolation slot.
  //
  // THE TWO LIFTS A DROP MAY NEVER TAKE (register S-35, and S-63's promise) were missing here: this
  // pass would happily remove the ONLY exercise of a muscle — silently turning `off` a muscle she
  // never turned off, and breaking the "an emphasis muscle is guaranteed at least one exercise"
  // guarantee. Step 4 below had the guard; this earlier, more eager pass did not, so in practice the
  // guard almost never got a say. Leave-its were ignored too, though Part 3 #5 says they are cut
  // LAST — hence the two passes: everything else first, only then a leave-it (S-59).
  // S-35 names exactly TWO lifts a drop may never take, and the only-exercise guard below is both
  // of them. A v4-era `slots.length <= 4` floor and a by-name Calves/Core exemption used to sit here
  // as well; neither is in the register, and neither does anything the named guard does not already
  // do (a generated core block is `supplemental`, and calves are always their muscle's only lift).
  // The order is recomputed after every removal: dropping a slot changes which muscle is now the
  // most over-served, and it also invalidates every index computed before the splice.
  for (const allowLeaveIt of [false, true]) {
    for (let guard = 0; guard < day.slots.length * 2 && over(); guard++) {
      const i = dropOrder().find((j) => {
        const slot = day.slots[j];
        const ex = slot && exerciseById(slot.exerciseId);
        if (!ex || slot.supplemental || ex.tier !== 'isolation') return false;
        if (!allowLeaveIt && protectedIds.has(slot.exerciseId)) return false; // S-59: leave-its are cut last
        // S-35/S-63: never a muscle's only lift — unless the WEEK trains it on another day too.
        if ((exCountByMuscle()[ex.muscle] ?? 0) <= 1 && !trainedOnOtherDays.has(ex.muscle)) return false;
        if (lastOfEssentialPattern(slot)) return false; // never the day's last row / pulldown
        return true;
      });
      if (i === undefined) break;
      day.slots.splice(i, 1);
    }
  }
  const compoundIdx = day.slots.map((_s, i) => i).filter((i) => isCompound(day.slots[i].exerciseId));
  for (let k = compoundIdx.length - 1; k >= 1 && over(); k--) {
    const slot = day.slots[compoundIdx[k]];
    if (slot.setCount > 3) slot.setCount = 3;
  }
  // Step 4 — the last resort. Recompute the per-muscle exercise count each pass and drop the trailing
  // compound whose muscle keeps another lift; unpinned first (S-59). Stop when nothing qualifies —
  // the day genuinely cannot fit her minutes (S-3), and the engine says so rather than starve a muscle.
  for (let guard = 0; guard < day.slots.length * 2 && over(); guard++) {
    const counts = exCountByMuscle();
    let dropped = false;
    for (const allowLeaveIt of [false, true]) {
      for (let i = day.slots.length - 1; i >= 0; i--) {
        const s = day.slots[i];
        if (s.supplemental || !isCompound(s.exerciseId)) continue;
        if (!allowLeaveIt && protectedIds.has(s.exerciseId)) continue; // S-59
        const m = exerciseById(s.exerciseId)?.muscle;
        if (!m || (counts[m] <= 1 && !trainedOnOtherDays.has(m))) continue; // S-35, read across the week
        if (lastOfEssentialPattern(s)) continue; // never the day's last row / pulldown
        day.slots.splice(i, 1);
        dropped = true;
        break;
      }
      if (dropped) break;
    }
    if (!dropped) break; // only single-exercise muscles remain → the day cannot fit (S-3)
  }
  /*
   * Step 5 — SHAVE A SET rather than lose a lift.
   *
   * Every pass above either caps a set count at the floor or removes a whole exercise, and all of
   * them stop when the only candidates left are protected: a muscle's last lift, a leave-it, the
   * day's last row or pulldown. An emphasised muscle carries an extra set (`setsForEmphasised`), and
   * that alone put an Upper A at 63 minutes with nothing legal left to drop — the day was three
   * minutes over and the cap had run out of moves that were not forbidden.
   *
   * Taking one set off the most over-served muscle is strictly gentler than any of them: the lift
   * stays, the muscle stays, and F-1's floor of three still holds. It is last because a set is the
   * cheapest thing to lose and should therefore be the last thing tried, not the first.
   */
  for (let guard = 0; guard < day.slots.length * V5_SETS_MAX && over(); guard++) {
    const i = dropOrder().find((j) => {
      const s = day.slots[j];
      return s && !s.supplemental && s.setCount > V5_SETS_MIN;
    });
    if (i === undefined) break; // every lift is at the floor — the day genuinely cannot fit (S-3)
    day.slots[i].setCount -= 1;
  }
}

/**
 * v5 · D4 — the emphasis-aware trim (register S-37 / the protected-lifts rule). When the LEARNED
 * volume (Loop 3) makes a day exceed her minutes, the set to give up is chosen by chooseDonor: NEVER
 * an emphasis muscle, never one at its floor, and among the rest the muscle with the MOST sets this
 * day (the one that can best spare it) — the exact mirror of S-32's give-rule, so the two never
 * disagree. A set is shaved from that muscle's LAST isolation slot (a compound is never sacrificed
 * before an isolation, S-35); once its isolations are at the floor, its trailing isolation exercise
 * is dropped — but never a muscle's ONLY exercise (S-35: an emphasis muscle keeps its one lift, and a
 * `normal` muscle is never silently turned `off`). Whatever residual remains is left to the shared
 * enforceTimeCap safety net. Legacy is untouched — this runs for the v5 cohort only.
 */
export function trimV5ToBudget(
  day: ProgramDay,
  bodyMap: Profile['bodyMap'],
  budgetMin: number,
  restSecFor?: (id: string) => number | null,
  /** B-4 — her measured set duration (timestamps), the work half of the per-set cost. */
  execSecFor?: (id: string) => number | null,
  /** S-59 — a leave-it is cut LAST. Trimming a SET off it is fine (a leave-it binds WHICH exercise,
   *  not how many sets, L6); DROPPING it is what it forbids while anything else can give. */
  protectedIds: ReadonlySet<string> = new Set(),
  /** The between-exercises rest (her pooled median, S-17) — prices each lift's first set honestly. */
  transitionSec?: number | null,
): void {
  const muscleOfSlot = (i: number) => exerciseById(day.slots[i].exerciseId)?.muscle;
  const isEmphasis = (m: string | undefined) => !!m && bodyMap?.[m as MuscleGroup] === 'emphasis';
  let guard = 0;
  while (estimateSessionMinutes(day, restSecFor, execSecFor, transitionSec) > budgetMin && guard++ < 200) {
    const setsByMuscle: Record<string, number> = {};
    const exCountByMuscle: Record<string, number> = {};
    for (const s of day.slots) {
      if (s.supplemental) continue;
      const m = exerciseById(s.exerciseId)?.muscle;
      if (!m) continue;
      setsByMuscle[m] = (setsByMuscle[m] ?? 0) + s.setCount;
      exCountByMuscle[m] = (exCountByMuscle[m] ?? 0) + 1;
    }
    // A muscle can donate only through a droppable ISOLATION slot: trim a bonus set (>floor), or —
    // when its isolations are all at the floor — drop a whole isolation exercise, but only if the
    // muscle keeps at least one lift (never its only exercise).
    const canDonate = (m: string): boolean =>
      day.slots.some((s, i) => {
        if (s.supplemental || muscleOfSlot(i) !== m) return false;
        if (isCompound(s.exerciseId)) return false;
        return s.setCount > V5_SETS_MIN || exCountByMuscle[m] > 1;
      });
    const candidates: VolumeCandidate[] = Object.keys(setsByMuscle)
      .filter(canDonate)
      .map((m) => ({ muscle: m, isEmphasis: isEmphasis(m), weeklySets: setsByMuscle[m], atFloor: setsByMuscle[m] <= V5_SETS_MIN }));
    const donor = chooseDonor(candidates, CANONICAL_MUSCLE_ORDER);
    if (!donor) break; // nothing may donate (all emphasis / floored) → the safety net finishes the job
    const isoIdx = day.slots
      .map((_s, i) => i)
      .filter((i) => !day.slots[i].supplemental && muscleOfSlot(i) === donor.muscle && !isCompound(day.slots[i].exerciseId));
    // Prefer shaving a bonus set from the donor's LAST isolation; else drop its trailing isolation.
    const trimAt = [...isoIdx].reverse().find((i) => day.slots[i].setCount > V5_SETS_MIN);
    // Which isolation to DROP: one without a leave-it if there is one, a leave-it only when nothing
    // else is left to give (S-59 — cut last, never exempt).
    /*
     * ⛔ AND NEVER THE DAY'S LAST ESSENTIAL PATTERN.
     *
     * `enforceTimeCap` learned this on 2026-08-08; this pass, which runs FIRST, did not — so the
     * protection was being applied to a day the earlier trim had already taken the lift from. With
     * Back off, the audit read Quads 20 weekly sets against Hamstrings 7: the hamstring's knee
     * flexion is an isolation on every machine in the catalogue, so this loop took it as the donor's
     * "trailing isolation" while the quad, whose work is squats, lost almost nothing.
     */
    const wouldOrphan = (i: number): boolean => {
      const ex = exerciseById(day.slots[i].exerciseId);
      const essential = ex && ESSENTIAL_PATTERNS[ex.muscle];
      if (!ex || !essential?.includes(ex.pattern)) return false;
      return day.slots.filter((s) => {
        const e = exerciseById(s.exerciseId);
        return !s.supplemental && e?.muscle === ex.muscle && e.pattern === ex.pattern;
      }).length <= 1;
    };
    const droppable = isoIdx.filter((i) => !wouldOrphan(i));
    const dropAt = [...droppable].reverse().find((i) => !protectedIds.has(day.slots[i].exerciseId)) ?? droppable[droppable.length - 1];
    if (trimAt != null) {
      day.slots[trimAt].setCount -= 1;
    } else if (exCountByMuscle[donor.muscle] > 1 && droppable.length > 0 && dropAt != null) {
      day.slots.splice(dropAt, 1);
    } else {
      break; // the donor's only exercise — protected; the safety net takes over
    }
  }
}

// ── Athlete-owned customizations honored at (re)generation (Program Ownership Contract) ──
// Her learned LEAVE-ITS (S-71) are muscle-keyed, and applied to the FIRST slot of their muscle —
// never duplicating an exercise the day already contains, and only within the slot's own capability,
// so structure stays valid. There is no PIN: every entry here was earned by swapping back twice to a
// lift the engine tried to rotate away (K=2), never placed by hand.
function applyLeaveIts(day: ProgramDay, leaveItsByMuscle: Record<string, string>): void {
  const present = new Set(day.slots.map((s) => s.exerciseId));
  const consumedMuscle = new Set<string>();
  day.slots = day.slots.map((slot) => {
    const ex = exerciseById(slot.exerciseId);
    if (!ex) return slot;
    const pinId = leaveItsByMuscle[ex.muscle];
    const pex = pinId ? exerciseById(pinId) : undefined;
    if (
      pex &&
      pinId !== slot.exerciseId &&
      pex.capability === slot.capability &&
      !present.has(pinId) &&
      !consumedMuscle.has(ex.muscle)
    ) {
      consumedMuscle.add(ex.muscle);
      return { ...slot, exerciseId: pinId };
    }
    return slot;
  });
}

/** Reorder a day's slots to the athlete's saved within-workout order (by exerciseId); slots not
 *  in the list (e.g. a freshly applied leave-it, or the supplemental core) keep their order AFTER the
 *  listed ones — so the athlete owns order while core still trails. Empty/absent => model order. */
function applyExerciseOrder(day: ProgramDay, order?: string[]): void {
  if (!order || !order.length) return;
  const rank = new Map(order.map((id, i) => [id, i]));
  day.slots = day.slots
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (rank.get(a.s.exerciseId) ?? order.length) - (rank.get(b.s.exerciseId) ?? order.length) || a.i - b.i)
    .map((x) => x.s);
}

/** Reorder the week's workouts to the athlete's saved order (by stable day key); unlisted days
 *  keep their relative order after the listed ones. */
function applyWorkoutOrder(days: ProgramDay[], order: string[]): ProgramDay[] {
  if (!order.length) return days;
  const rank = new Map(order.map((k, i) => [k, i]));
  return days
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (rank.get(a.d.key ?? '') ?? order.length) - (rank.get(b.d.key ?? '') ?? order.length) || a.i - b.i)
    .map((x) => x.d);
}

/**
 * Append the week's supplemental core work to its host session (mutates in place). Core is a muscle on
 * the body map like any other (register S-50), so this HONOURS her Core stance:
 *   • `off`      → no core at all (S-2 — an off muscle never appears; the map is the only "off" lever).
 *   • `normal`   → one core movement (3 sets, last, upper-preferred).
 *   • `emphasis` → a SECOND distinct core movement (S-4 — first claim on volume; the mark is not wasted).
 * It stays SUPPLEMENTAL (a finisher, not a structural region day) per the founder's standing rule; the
 * map decides whether and how much, Loop 3 is not run on it.
 */
function addWeeklyCore(days: ProgramDay[], daysPerWeek: number, coreStance: MuscleStance = 'normal'): void {
  if (!days.length || !CORE_POOL.length || coreStance === 'off') return;
  const host = days[coreHostIndex(days)];
  const count = coreStance === 'emphasis' ? Math.min(2, CORE_POOL.length) : 1;
  const start = (Math.max(1, daysPerWeek) - 1) % CORE_POOL.length; // rotate the entry point by frequency
  for (let k = 0; k < count; k++) {
    const ex = exerciseById(CORE_POOL[(start + k) % CORE_POOL.length]);
    if (!ex || host.slots.some((s) => s.exerciseId === ex.id)) continue; // skip a duplicate movement
    host.slots.push({ capability: ex.capability, exerciseId: ex.id, setCount: CORE_SETS, supplemental: true });
    if (!host.muscleGroups.includes(ex.muscle)) host.muscleGroups.push(ex.muscle);
  }
}

// ───────────────────────────── cold-start starting weights ─────────────────────────────
// `startingWeight` now lives in domain/startingLoad — unchanged, but no longer private to the
// model: the milestone ladders anchor on the very load Hush prescribed on day one, and there must
// be exactly ONE opinion in this product about how strong an athlete probably is (founder
// 2026-07-13). The engine's use of it is untouched.

/**
 * Best demonstrated e1RM across the athlete's history for a given engine PATTERN, plus the baseKg
 * of the lift that produced it — the substrate for the smart swap seed. Weighted lifts only.
 */
function bestPatternE1rm(pattern: Pattern, history: Session[]): { e1rm: number; baseKg: number } {
  let e1rm = 0;
  let baseKg = 0;
  for (const s of history) {
    for (const log of s.sets) {
      if (log.actualWeight == null || log.actualReps <= 0) continue;
      const ex = exerciseById(log.exerciseId);
      if (!ex || ex.baseKg == null || enginePattern(log.exerciseId) !== pattern) continue;
      const e = epley(log.actualWeight, log.actualReps);
      if (e > e1rm) {
        e1rm = e;
        baseKg = ex.baseKg;
      }
    }
  }
  return { e1rm, baseKg };
}

/** The e1RM→working-load conversion's DEFAULT rep count — the default band's Tlo. Callers that know
 *  her declared band pass its real Tlo instead, so a 12-15 athlete's transfer is priced at 12 reps,
 *  not at a number she never chose ("the band she has IS the target", register Part 1). */
const DEFAULT_SEED_REP_TARGET = 8;

/**
 * Smart starting load for a lift (founder 2026-07-09, B-1/S-9): a swap / new exercise must ADAPT to
 * the athlete's PROVEN strength, not restart from a beginner cold-start (a year-trained bencher
 * moving to the chest-press machine must not begin at ~half their real pushing load). Priority:
 *   1. the lift's OWN demonstrated e1RM (already trained it) → working load at HER Tlo;
 *   2. else the athlete's best e1RM on the SAME engine pattern, scaled by the two lifts' baseKg
 *      ratio (relative difficulty) → a strength transfer onto the new lift;
 *   3. else the conservative cold-start seed (a genuinely new pattern / the first program).
 * Bodyweight lifts have no external load. The seed is a suggestion she can see and edit (F-2), and
 * Loop 1 corrects it from her very first working set (Rev 8 — there is no approach set).
 */
export function smartSeed(
  id: string,
  profile: Pick<Profile, 'sex' | 'weightKg'>,
  history: Session[],
  /** Her Tlo for this lift's muscle — what a "working load" means to HER (default: the 8-10 band's). */
  repTarget: number = DEFAULT_SEED_REP_TARGET,
): number | null {
  const ex = exerciseById(id);
  if (!ex) return null;
  if (ex.bodyweight || ex.baseKg == null) return startingWeight(ex, profile); // null for bodyweight
  const toWorking = (e1rm: number) => normalizeLoad(e1rm / (1 + repTarget / 30), ex.equipment as Equipment);
  // 1. the lift's own demonstrated capability.
  let own = 0;
  for (const s of history)
    for (const log of s.sets)
      if (log.exerciseId === id && log.actualWeight != null && log.actualReps > 0) own = Math.max(own, epley(log.actualWeight, log.actualReps));
  if (own > 0) return toWorking(own);
  // 2. transfer from the best SAME-PATTERN lift, scaled by relative difficulty (baseKg ratio).
  const pattern = enginePattern(id);
  if (pattern) {
    const best = bestPatternE1rm(pattern, history);
    if (best.e1rm > 0 && best.baseKg > 0) return toWorking(best.e1rm * (ex.baseKg / best.baseKg));
  }
  // 3. conservative cold-start.
  return startingWeight(ex, profile);
}

type Tier = Exercise['tier'];

/**
 * DAY-ONE sets per exercise — the sibling of B-8, and the last number this layer owns.
 *
 * The register hands the integration layer exactly one granularity decision: *"the register fixes
 * the CONSTRAINTS (Part 3), but not the sets→exercises granularity"* (B-8). B-8 turns a muscle's
 * starting weekly target into an exercise COUNT; this turns it into a per-exercise SET count, until
 * Loop 3 has learned the muscle's real volume and `distributeMuscleSets` takes over. It is bounded
 * by F-1 ([3, 5]) and by nothing else.
 *
 * **Three v4 inputs were removed (2026-07-21), because none of them is in the register:**
 *   · **`goal`** — Part 5 deletes the goal fork outright: *"there is one goal: hypertrophy."*
 *   · **`age`** — a −1 set penalty at 65+. Nowhere in the register; the same guess S-42 refuses.
 *   · **`volume`** (`low`/`moderate`/`high`) — an athlete-declared volume LEVER, ±1 set on every
 *     exercise. It contradicts the whole of Loop 3: in v5 volume is **earned** from facts (S-32) and
 *     **cut** from facts (S-34), starting from B-2. A dial that sets it by declaration is v4.
 */
function setsFor(tier: Tier, muscle?: string): number {
  /*
   * ════ THE MUSCLE'S SHARE REACHES THE SET COUNT, NOT ONLY THE EXERCISE COUNT ════
   *
   * `MUSCLE_VOLUME_SHARE` gives the back the largest weekly target and the calves the smallest, and
   * on its own that changed almost nothing: a 60-minute upper day holds about six lifts and there
   * are five upper muscles, so every muscle gets ONE slot whatever its target says. The share had no
   * room to express itself in exercise COUNT, and the printed week still read Back 8 · Calves 6.
   *
   * So it expresses itself here instead. A muscle that owns a large share of the week carries the
   * fuller scheme on the lift it does get; a small one carries the leaner. Everything stays inside
   * F-1's [3, 5] — this widens the day-one spread within the law, it does not reach past it.
   *
   * Loop 3 still overwrites all of it from her own facts within weeks (S-32/S-34). This is the
   * day-one guess, and it is now a guess that knows a back is not a calf.
   */
  /*
   * ⛔ MEASURED AND REVERTED, 2026-08-09 — kept as a note because the next reader will try it too.
   *
   * Scaling the day-one set count by the muscle's share (5 sets for a big compound, 3 for a small
   * one) is the obvious way to let `MUSCLE_VOLUME_SHARE` reach a day that only has room for one lift
   * per muscle. Measured over the 1,455-programme sweep it was NET NEGATIVE: it lengthened every day,
   * so `enforceTimeCap` cut harder — and the cap drops by POSITION, not by share, so the muscles it
   * took from were whichever sat late in canonical order. Back fell from 8 weekly sets to 6 at four
   * days, 557 large-vs-small inversions remained, and the 45-minute floor broke in the bargain.
   *
   * The blocker is not this function. It is that the cap is share-blind: until it gives up sets the
   * way `chooseDonor` does — from whoever can best spare them — a longer day just means a harder cut.
   */
  void muscle;
  // Compounds lead a day and carry the fuller scheme (Part 3 #4); both sit inside F-1.
  return tier === 'compound' ? 4 : V5_SETS_MIN;
}

/**
 * ════ AN EMPHASIS MARK ADDS A SET, NOT A DOOMED EXERCISE (founder 2026-08-09) ════
 *
 * Emphasis reached the programme only through `weeklyTargets`, which raised the muscle's target and
 * therefore its EXERCISE count — and a 60-minute day cannot hold the extra lifts, so the cap removed
 * them again. Measured end to end: an emphasised chest came out at ELEVEN weekly sets against twelve
 * for an unmarked one. Asking for more returned less, which is the non-monotonicity `distributeMuscleSets`
 * already has its own guard against.
 *
 * A set is the unit the day can actually absorb. It rides with the lift through the ordering, it is
 * bounded by F-1's ceiling of five, and the cap now knows an emphasised muscle has a larger claim
 * (`claimOf`), so it is not the first thing cut back off.
 */
/**
 * ════ THE WEEKLY FLOOR UNDER A MUSCLE (founder 2026-08-10) ════
 *
 * There is a floor under a SESSION (`fillToSessionFloor`) and a ceiling over it (`enforceTimeCap`),
 * and nothing at all under a MUSCLE. So a muscle could come out of the week at three weekly sets —
 * one lift at F-1's floor — while the day it sat in was a perfectly legal sixty minutes. The audit
 * found three: Triceps at 3 on a three-day week with Back off, Calves at 3 on a four-day week with
 * Quads off, and Shoulders at 6 on a plain four-day week.
 *
 * Six is the minimum effective dose the evidence supports (`WEEKLY_SETS_FLOOR`), and it is a WEEKLY
 * quantity, so the check has to be weekly too. Below it a muscle is being maintained rather than
 * grown, which is not what she asked for when she left it on.
 *
 * ⛔ IT ADDS SETS TO LIFTS SHE ALREADY HAS, and only where the day has room under her ceiling. It
 * never adds an exercise (that is the assembler's decision, made with her map), never exceeds F-1's
 * five, and never pushes a day past `budgetMin`. Where the clock genuinely has no room the muscle
 * stays short — that is an honest limit, and `everyAthleteTheEngineCanMeet` asserts which muscles it
 * can happen to rather than letting it pass silently.
 */
function raiseToWeeklyFloor(
  days: ProgramDay[],
  floorSets: number,
  budgetMin: number,
  restSecFor?: (id: string) => number | null,
  execSecFor?: (id: string) => number | null,
  transitionSec?: number | null,
): void {
  const weekly = (): Record<string, number> => {
    const n: Record<string, number> = {};
    for (const d of days)
      for (const s of d.slots) {
        if (s.supplemental) continue;
        const m = exerciseById(s.exerciseId)?.muscle;
        if (m) n[m] = (n[m] ?? 0) + s.setCount;
      }
    return n;
  };
  for (let guard = 0; guard < 200; guard++) {
    const sets = weekly();
    const short = Object.entries(sets)
      .filter(([, n]) => n < floorSets)
      .sort((a, b) => a[1] - b[1]) // the thinnest muscle first
      .map(([m]) => m);
    if (short.length === 0) return;
    let grew = false;
    for (const m of short) {
      for (const d of days) {
        const slot = d.slots.find((s) => !s.supplemental && s.setCount < V5_SETS_MAX && exerciseById(s.exerciseId)?.muscle === m);
        if (!slot) continue;
        slot.setCount += 1;
        if (estimateSessionMinutes(d, restSecFor, execSecFor, transitionSec) > budgetMin) {
          slot.setCount -= 1; // the hour wins
          continue;
        }
        grew = true;
        break;
      }
      if (grew) break;
    }
    if (grew) continue;
    /*
     * The clock has no room left, so TRANSFER instead of adding: take a set from a muscle that is
     * comfortably clear of the floor and give it to one that is under, on the same day. The day's
     * length does not move, so nothing downstream has to be re-checked.
     *
     * This is what makes the last cases reachable at all: a muscle at three weekly sets is usually
     * alone on a full day, where growing it is impossible and taking from a neighbour costs that
     * neighbour a set it can spare. The donor must stay clear of the floor itself and inside F-1, so
     * a transfer can never create the problem it is solving.
     */
    let moved = false;
    for (const m of short) {
      for (const d of days) {
        const taker = d.slots.find((s) => !s.supplemental && s.setCount < V5_SETS_MAX && exerciseById(s.exerciseId)?.muscle === m);
        if (!taker) continue;
        const giver = d.slots.find((s) => {
          if (s.supplemental || s === taker || s.setCount <= V5_SETS_MIN) return false;
          const gm = exerciseById(s.exerciseId)?.muscle;
          return !!gm && gm !== m && (sets[gm] ?? 0) - 1 >= floorSets;
        });
        if (!giver) continue;
        giver.setCount -= 1;
        taker.setCount += 1;
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) return; // every short muscle is boxed in by the clock, by F-1, or by its neighbours
  }
}

function growEmphasised(
  day: ProgramDay,
  emphasised: ReadonlySet<string>,
  budgetMin: number,
  restSecFor?: (id: string) => number | null,
  execSecFor?: (id: string) => number | null,
  transitionSec?: number | null,
  /** Weekly sets per muscle across the whole programme — a donor may not drop below the floor. */
  weeklySets: Record<string, number> = {},
): void {
  if (emphasised.size === 0) return;
  const minutes = () => estimateSessionMinutes(day, restSecFor, execSecFor, transitionSec);
  /** Sets this day gives each muscle — used to spread growth across BOTH marks, not just the first. */
  const onDay = (): Record<string, number> => {
    const n: Record<string, number> = {};
    for (const s of day.slots) {
      if (s.supplemental) continue;
      const m = exerciseById(s.exerciseId)?.muscle;
      if (m) n[m] = (n[m] ?? 0) + s.setCount;
    }
    return n;
  };
  for (let guard = 0; guard < day.slots.length * V5_SETS_MAX; guard++) {
    /*
     * The THINNEST marked muscle grows first. Taking the first slot in day order instead meant that
     * with two marks the earlier one took everything: Chest+Back came out with Back at 18 weekly
     * sets and Chest unchanged at 8 — one of her two marks silently doing nothing. F-4 allows two,
     * so two have to be served.
     */
    const have = onDay();
    const slot = day.slots
      .filter((s) => {
        const m = exerciseById(s.exerciseId)?.muscle;
        return !s.supplemental && m && emphasised.has(m) && s.setCount < V5_SETS_MAX;
      })
      .sort((a, b) => (have[exerciseById(a.exerciseId)!.muscle] ?? 0) - (have[exerciseById(b.exerciseId)!.muscle] ?? 0))[0];
    if (!slot) return; // her marked muscles are already at F-1's ceiling on this day
    slot.setCount += 1;
    if (minutes() <= budgetMin) continue;
    slot.setCount -= 1;
    /*
     * The hour is full, so TRANSFER rather than give up. Reading the marked programmes showed the
     * cost of giving up: marking Calves changed the week not at all — six weekly sets before and
     * after — and so did marking Biceps, Triceps or Shoulders. Their days were already at sixty
     * minutes, so there was nothing to add, and a mark she can place and not see is worse than no
     * mark at all.
     *
     * The donor is an UNMARKED muscle that stays clear of the weekly floor without the set, on the
     * same day, so the session's length does not move. If no such donor exists the mark genuinely
     * costs nothing here, and it says so by stopping rather than by breaking her hour.
     */
    // …and the donor may not fall below the effective dose itself. Without this, marking Chest and
    // Back took a four-day week's Glutes to 4 weekly sets and Calves to 3: a mark she placed on one
    // muscle is not permission to stop training another she left on.
    const giver = day.slots.find((s) => {
      if (s.supplemental || s === slot || s.setCount <= V5_SETS_MIN) return false;
      const gm = exerciseById(s.exerciseId)?.muscle;
      return !!gm && !emphasised.has(gm) && (weeklySets[gm] ?? 0) - 1 >= WEEKLY_SETS_FLOOR;
    });
    if (!giver) return;
    giver.setCount -= 1;
    slot.setCount += 1;
  }
}

// `goal` and `experience` are NOT read here: Part 5 deletes the goal fork ("there is one goal:
// hypertrophy") and Part 9 §A deletes `experience` from the decision path. `age` survives only for
// the age-based rep guidance outside the engine, never for a load or a set count.
async function loadProfileSafe(): Promise<Pick<Profile, 'sex' | 'weightKg' | 'age' | 'memberSince' | 'repBand' | 'repBandByMuscle'>> {
  try {
    const p = await db.loadProfile();
    if (p) return p;
  } catch {
    /* offline/test — fall through to a sensible default */
  }
  return { sex: 'male', weightKg: 75 };
}

/** Completed-session history (newest first), the substrate for real progression. Never throws
 *  — an empty history yields cold-start (seed) prescriptions. */
async function loadHistorySafe(): Promise<Session[]> {
  try {
    return await db.loadHistory();
  } catch {
    return [];
  }
}

async function loadPreferencesSafe(): Promise<OwnedPreferences> {
  try {
    return await db.loadPreferences();
  } catch {
    return { ...EMPTY_PREFERENCES };
  }
}

/** Mutate the saved preferences atomically (load → edit → save). */
async function editPreferences(edit: (p: OwnedPreferences) => void): Promise<void> {
  const prefs = await loadPreferencesSafe();
  edit(prefs);
  try {
    await db.savePreferences(prefs);
  } catch {
    /* offline/test — the in-memory edit already applied for this session */
  }
}

/**
 * Run the engine's fold — every completed-but-unfolded occurrence gets decided, in order.
 *
 * Extracted from `sessionTargets` on 2026-07-17. It used to live only there, which meant the fold
 * was LAZY: the decisions a workout earned were not computed until the athlete opened the NEXT
 * workout. The engine's contract has never been lazy — v5 decides at the end of every occurrence
 * (register L7) and every changeLog entry is stamped with the occurrence that produced it — but
 * nothing ASKED it to until the next session started. That gap is why the Complete screen could
 * only ever point at Saturday: at the moment it rendered, the decision genuinely did not exist yet.
 *
 * Now `sessionEarned` calls this at the whistle, so the app and the engine move in one breath.
 *
 * Idempotent and cursor-driven (`lastFoldedAt`): calling it twice folds nothing the second time,
 * so the extra call at completion costs one no-op pass on the next session start.
 */
async function foldEngine(
  program: Program,
  profile: Awaited<ReturnType<typeof loadProfileSafe>>,
  history: Session[],
  prefs: OwnedPreferences,
  bucketOpenMs: number | undefined,
): Promise<void> {
  // Per-muscle T (register Part 9): each exercise reads the band of its primary muscle, falling back
  // to her single declared band, then the '8-10' default.
  const bandOf = (exId: string) => {
    const m = exerciseById(exId)?.muscle;
    return bandFor((m ? profile.repBandByMuscle?.[m] : undefined) ?? profile.repBand);
  };
  // The seed's working-load conversion is priced at HER Tlo for the lift's muscle (S-9/S-43 — no
  // invented rep count sizes a load once she has declared a band).
  const seedFor = (id: string) => smartSeed(id, profile, history, bandOf(id).lo);
  const engineExerciseIds = [...new Set(program.days.flatMap((d) => d.slots.filter((s) => !s.supplemental).map((s) => s.exerciseId)))];
  // Loop 3 (D) reads the (time-trimmed) prescribed sets to know whether she COMPLETED a muscle this
  // occurrence (per exercise) and to seed/cap its learned volume at what actually fit — from the
  // FINAL programme (post enforceTimeCap). The volume is a WEEKLY figure, so a muscle's whole-week
  // total (summed across EVERY day it appears — chest often sits on two upper days) seeds and caps
  // it; a per-occurrence figure would silently halve a multi-day muscle at the next regeneration.
  const prescribedByEx: Record<string, number> = {};
  const weeklyByMuscle: Record<string, number> = {};
  for (const d of program.days) for (const s of d.slots) {
    if (s.supplemental) continue;
    prescribedByEx[s.exerciseId] = s.setCount;
    const m = exerciseById(s.exerciseId)?.muscle;
    if (m) weeklyByMuscle[m] = (weeklyByMuscle[m] ?? 0) + s.setCount;
  }
  const changes = await advanceV5(engineExerciseIds, bandOf, history, seedFor, Date.now(), bucketOpenMs, (id) => prescribedByEx[id] ?? 0, weeklyByMuscle).catch(
    (e): Record<string, 'graduate' | 'rotate'> => {
      void track('engine_error', { op: 'advanceV5', message: String(e) });
      return {};
    },
  );
  // Enact engine-initiated exercise changes (S-52 graduate / S-25.2 rotate): resolve each target
  // and write it to `substitutes` (which the assembler honours, C1). These are ENGINE changes, not
  // athlete swaps (S-72) — written straight to substitutes, never through the learned counter, so a
  // rotation never reads as a preference. Enacted at the next regeneration (the weekly roll).
  // Resolve the wanted changes to concrete substitutions, honouring leave-it pins (S-30/S-71: a
  // lift with a leave-it is never taken away) and flagging rotations (S-71/S-72). Pure — the write below only
  // enacts what the resolver returns.
  const enacted = resolveEngineEnactments(changes, prefs.leaveItsByMuscle, history, profile);
  if (enacted.length) {
    await editPreferences((p) => {
      for (const e of enacted) {
        p.substitutes[e.from] = e.to;
        // S-71: mark an engine ROTATION so a later swap-back to it is read as RESISTANCE, not a fresh
        // preference (S-72 keeps the two apart). A graduation is not a rotation → not marked.
        if (e.rotated) (p.engineRotated ??= {})[e.from] = e.to;
      }
    }).catch((e) => void track('engine_error', { op: 'enactEngineChange', message: String(e) }));
    // S-45: let the Saturday mirror name what Hush did (graduate/rotate write substitutes, not the
    // load changeLog). Idempotent per week — a re-enacted standing change is not logged twice.
    for (const e of enacted)
      await recordStructuralChangeV5(e.from, e.to, e.kind).catch((err) => void track('engine_error', { op: 'recordStructuralChangeV5', message: String(err) }));
  }
}

export const fixtureModel: ModelClient = {
  async getProfile() {
    return {};
  },

  async recordConsent() {},

  async eraseAccount() {},

  async sessionsCompleted() {
    return null;
  },

  async setWeeklyFrequency() {
    // No-op: generateProgram already honors profile.daysPerWeek directly.
  },

  async generateProgram(profile: Profile): Promise<Program> {
    // WEEKLY-PROGRAM model: a bucket of exactly N workouts (any order; Rest only after all N are
    // done). The programme is ASSEMBLED from her body map (register Part 3), never a shelf split.
    // Frequency is 2..6 — one workout a week is not a programme, so it is not offered (onboarding wheel
    // is min 2), and clamping to 2 keeps the region split coherent (a single day can't cover a body).
    const n = Math.min(Math.max(profile.daysPerWeek, 2), 6);
    // One goal: hypertrophy (register Part 9 §A — the goal question is deleted; toning/strength are
    // gone), so no goal is read anywhere. The weekly VOLUME lever (low/moderate/high) is gone too: in
    // v5 volume is earned and cut from facts (Loop 3, S-32/S-34) starting from B-2, never set by a dial.
    const prefs = await loadPreferencesSafe();

    // The programme is GENERATED from the body map (register Part 3) — an `off` muscle never appears,
    // emphasis earns more, and the region days fall out of where the volume is. The demographic split
    // (MEN_SPLITS/WOMEN_SPLITS) is DELETED (S-58). Loop 3 (D): the LEARNED per-muscle volume reshapes
    // the programme at every regeneration — a muscle that earned sets grows an exercise / fuller
    // schemes, a trimmed one shrinks. Empty until she has trained, so the day-one shape is untouched
    // for a fresh athlete.
    const learnedVolume = await getVolumeTargetsV5().catch((e): Record<string, number> => {
      void track('engine_error', { op: 'getVolumeTargetsV5', message: String(e) });
      return {};
    });
    let dayLists = assembleV5DayLists(profile.bodyMap, n, prefs.leaveItsByMuscle, prefs.substitutes, learnedVolume, profile);
    // Safety net: everything-off (S-3) is prevented by the body-map screen (validateMap), but if a map
    // ever yields no workout, fall back to an ALL-NORMAL map (never a demographic shelf) so a workout
    // always exists. Unreachable in practice.
    if (dayLists.length === 0) dayLists = assembleV5DayLists(undefined, n, prefs.leaveItsByMuscle, prefs.substitutes, learnedVolume, profile);
    const emphasisedMuscles = new Set(
      Object.entries(profile.bodyMap ?? {}).filter(([, v]) => v === 'emphasis').map(([m]) => m),
    );
    const days: ProgramDay[] = dayLists.map((dl, i) => dayFromBlueprint(i, dl.name, dl.exerciseIds, dl.setCounts, emphasisedMuscles));

    // S-29 · "The same exercise in two workouts in one week. **One progression, fed by both
    // sessions** — automatic under exercise-keying. The `canonicalEngineId` unification hack is
    // deleted." It was still here, computing slot ids nothing reads: v5 keys every decision to the
    // EXERCISE, so two occurrences of one lift already share one progression by construction.

    // Generation touches NO engine state: v5 does no engine-initiated swap here (a learned substitute
    // is already applied inside the assembler, C1), and the 3-week CALENDAR rotation is deleted
    // (register Part 5 — variety comes from a measured stall, not a schedule). Per-exercise state is
    // created lazily by advanceV5 in sessionTargets.
    for (const d of days) applyLeaveIts(d, prefs.leaveItsByMuscle); // a leave-it leads its muscle (S-30/S-71)
    // A leave-it may sit on different EQUIPMENT than the slot it replaced — re-run the station
    // ordering so the block law survives the substitution (Part 3 #3; runs before core is appended).
    for (const d of days) reflowDayForStations(d);
    // Core rides as supplemental work, but its SIZE follows the body map (S-50/S-2/S-4): off → none,
    // emphasis → a second movement. Never a shelf default that ignores what she declared.
    addWeeklyCore(days, n, (profile.bodyMap?.['Core'] as MuscleStance | undefined) ?? 'normal');
    const budgetMin = profile.workoutMinutes ?? MAX_SESSION_MIN; // her declared ceiling (S-64), default 60
    // S-64 from FACTS: the time budget uses HER MEASURED REST (the median of her recorded restBeforeS
    // per lift, S-17), not v4's rest-blind fixed estimate. No rest data yet → the day-one bootstrap.
    const history = await loadHistorySafe();
    const restCache = new Map<string, number | null>();
    const restSecFor = (id: string): number | null => {
      let r = restCache.get(id);
      if (r === undefined) {
        const rests: (number | null | undefined)[] = [];
        // INTER samples only (setIndex > 0): a first-set rest is the TRANSITION — priced separately
        // below, and it must not drag this lift's between-sets median up (S-17, one clean fact each).
        for (const s of history) for (const l of s.sets) if (l.exerciseId === id && !l.isApproach && l.setIndex > 0) rests.push(l.restBeforeS);
        r = learnedRestS(rests);
        restCache.set(id, r);
      }
      return r;
    };
    // B-4's other half: her measured SET DURATION, from the timestamps already on every logged set.
    // Only consecutive same-exercise sets inside one session can yield it (see learnedExecS).
    const execCache = new Map<string, number | null>();
    const execSecFor = (id: string): number | null => {
      let e = execCache.get(id);
      if (e === undefined) {
        const samples: ExecSample[] = [];
        for (const s of history) for (const l of s.sets) {
          if (l.exerciseId !== id || l.isApproach) continue;
          samples.push({ exerciseId: l.exerciseId, sessionId: s.id, atMs: Date.parse(l.persistedAt), restBeforeS: l.restBeforeS });
        }
        samples.sort((a, b) => a.atMs - b.atMs);
        e = learnedExecS(samples);
        execCache.set(id, e);
      }
      return e;
    };
    // D4: resolve an over-budget day by DONATING from the muscle that can best spare it (S-37, emphasis
    // protected) BEFORE the positional safety net.
    // S-59 / Part 3 #5 — her learned leave-its (S-71) are cut LAST by both trims.
    const leaveIts = new Set(Object.values(prefs.leaveItsByMuscle));
    // The between-exercises rest: her pooled transition median, else the declared 120 s — the SAME
    // seconds the transition timer actually runs (S-17), so the budget prices the workout she has.
    const transitionS = learnedTransitionRestS(history) ?? REST_TRANSITION_S;
    for (const d of days) trimV5ToBudget(d, profile.bodyMap, budgetMin, restSecFor, execSecFor, leaveIts, transitionS);
    /*
     * Which muscles the week STILL trains on more than one day — the scope S-35's only-lift guard
     * means, recomputed before every day.
     *
     * ⛔ Computing it once is a race with itself: Monday gives up its only calf lift "because
     * Thursday has one", then Thursday gives up its own "because Monday had one", and the muscle is
     * silently off — the exact outcome S-35 exists to prevent. Reading the CURRENT slots each time
     * means the last day holding a muscle can never be the one that drops it.
     */
    const stillTrainedTwice = (): ReadonlySet<string> => {
      const n: Record<string, number> = {};
      for (const d of days)
        for (const m of new Set(d.slots.map((s) => exerciseById(s.exerciseId)?.muscle).filter(Boolean)))
          n[m as string] = (n[m as string] ?? 0) + 1;
      /*
       * A drop must leave the muscle at TWICE a week — the dose the full-body restructure exists to
       * buy, and the best-supported number in the literature. So it needs three days to give one up.
       *
       * ⛔ EXCEPT IN A TWO-DAY WEEK, where that promise cannot be kept by anyone. Two sessions hold
       * about fourteen lifts between them and there are nine muscles; something has to be trained
       * once. Refusing the drop there does not buy a muscle a second session — it just puts the day
       * over her hour, which is the one thing she actually feels. The compounds still cover the big
       * muscles twice; what falls to once is the small isolation work, which is the right thing to
       * lose and what any coach writing a two-day programme also loses.
       */
      const floor = days.length <= 2 ? 1 : 2;
      return new Set(Object.entries(n).filter(([, c]) => c > floor).map(([m]) => m));
    };
    for (const d of days) enforceTimeCap(d, budgetMin, restSecFor, execSecFor, leaveIts, transitionS, emphasisedMuscles, stillTrainedTwice()); // work ≤ her minutes
    // …and ≥ the floor. The cap runs first so the fill never has to undo it, and the fill can only
    // reach `budgetMin - 1` worth of sets before the next set would put the day back over.
    for (const d of days) fillToSessionFloor(d, Math.min(MIN_SESSION_MIN, budgetMin), restSecFor, execSecFor, transitionS);
    // …and only THEN does an emphasis mark buy its extra set, out of whatever room is left under her
    // ceiling. Added before the cap it was simply cut off again, or it pushed a full-body day to 63
    // minutes with every other slot already at F-1's floor and no legal drop remaining.
    const weeklyByMuscleNow = (): Record<string, number> => {
      const n: Record<string, number> = {};
      for (const d of days)
        for (const s of d.slots) {
          if (s.supplemental) continue;
          const m = exerciseById(s.exerciseId)?.muscle;
          if (m) n[m] = (n[m] ?? 0) + s.setCount;
        }
      return n;
    };
    for (const d of days) growEmphasised(d, emphasisedMuscles, budgetMin, restSecFor, execSecFor, transitionS, weeklyByMuscleNow());
    // …and no muscle she left ON leaves the week below the minimum effective dose, where the clock
    // has room to prevent it (B-2's WEEKLY_SETS_FLOOR).
    raiseToWeeklyFloor(days, WEEKLY_SETS_FLOOR, budgetMin, restSecFor, execSecFor, transitionS);
    // S-3 — "If honouring both leaves nothing else to cut, the workout genuinely cannot fit her
    // minutes: that is S-3, and the engine says so rather than quietly starving a muscle." A day can
    // now finish over budget, and that is the CORRECT outcome when every trained muscle is down to
    // its last lift (S-35's two protected drops).
    //
    // TODO(screens · S-3) — THE ENGINE HALF IS DONE; THE SENTENCE IS NOT. The register says the
    // engine "says so", and today it only says so to telemetry. She should be told, in words, that
    // this workout does not fit the minutes she declared and what her options are (more minutes, or
    // a muscle off). Held deliberately for the founder's redesign of the programme surfaces —
    // 2026-07-21. The engine emits everything the copy needs: the day, its real minutes, her budget.
    //
    // TODO(screens · S-59) — the other half of the same family. "Her leave-its do not fit inside her
    // declared minutes": the ASSEMBLY rule is built (a leave-it is cut last, here and in
    // trimV5ToBudget), and Rev 10 deleted the old prompt because a declarative pin no longer exists.
    // If the redesign wants to surface anything here, it is the same S-3 sentence, not a question.
    for (const d of days) {
      // Priced with BOTH measured halves (rest + exec) — the same estimate the trims enforce, so the
      // report can never disagree with the enforcement about whether a day fits.
      const mins = estimateSessionMinutes(d, restSecFor, execSecFor, transitionS);
      if (mins > budgetMin + 1e-9) {
        // S-3 — carry the verdict onto the day so the surface can SAY it (Home), not only telemetry.
        // Same estimate the trims enforced, so the sentence can never disagree with the enforcement.
        d.overBudget = true;
        void track('engine_cannot_fit_budget', { day: d.name, minutes: Math.round(mins), budgetMin, slots: d.slots.length });
      }
    }
    for (const d of days) applyExerciseOrder(d, prefs.exerciseOrderByWorkout[d.key ?? '']); // athlete order
    const ordered = applyWorkoutOrder(days, prefs.workoutOrder); // athlete-owned workout order
    return { id: 'program_v1', frequency: n, days: ordered };
  },

  /**
   * WHAT THIS WORKOUT EARNED — folded at the whistle, then read back.
   *
   * The brief's promise is "at the end of a workout, next time's weights are already decided — and
   * it says so, THEN." Before this, they were decided lazily at the next session start, so Complete
   * had nothing true to show and pointed at Saturday instead. Folding here makes the promise real.
   *
   * `[]` is a real and common answer — a workout where every lift held (S-24) changed nothing, and
   * the screen must say so rather than invent a change (R7 / S-16).
   */
  async sessionEarned({ startedAtMs }): Promise<Explanation[]> {
    const program = await db.loadProgram();
    if (!program) return [];
    const profile = await loadProfileSafe();
    const history = await loadHistorySafe();
    const prefs = await loadPreferencesSafe();
    const bucketOpenMs = (await db.loadWeekOpen().catch(() => null)) ?? undefined;
    await foldEngine(program, profile, history, prefs, bucketOpenMs);
    return getSessionEarnedV5(startedAtMs).catch((e): Explanation[] => {
      void track('engine_error', { op: 'sessionEarned', message: String(e) });
      return [];
    });
  },

  /**
   * The absolute next load per lift one occurrence set (v7 3.3b Record badges). Folds first — so the
   * most recent whistle is decided before we read it back — then reads the stamped changeLog. A lift
   * that held has no entry; the screen reads its absence as "holds at what she lifted".
   */
  async sessionForward({ startedAtMs }): Promise<Record<string, { loadFrom: number | null; loadTo: number | null }>> {
    const program = await db.loadProgram();
    if (!program) return {};
    const profile = await loadProfileSafe();
    const history = await loadHistorySafe();
    const prefs = await loadPreferencesSafe();
    const bucketOpenMs = (await db.loadWeekOpen().catch(() => null)) ?? undefined;
    await foldEngine(program, profile, history, prefs, bucketOpenMs);
    return getSessionForwardV5(startedAtMs).catch((e): Record<string, { loadFrom: number | null; loadTo: number | null }> => {
      void track('engine_error', { op: 'sessionForward', message: String(e) });
      return {};
    });
  },

  async sessionTargets({ programDayId }): Promise<SetTarget[]> {
    void programDayId; // targets are keyed by exercise; the screen picks the day's slots
    const profile = await loadProfileSafe();
    const history = await loadHistorySafe();
    const out: SetTarget[] = [];

    const program = await db.loadProgram();
    const prefs = await loadPreferencesSafe();
    // The bucket the athlete is actually executing (null pre-upgrade). The engine advances WITH it,
    // never ahead of it — a mid-week signup's extended first bucket must not get a mid-plan load
    // change (weekCadence.firstBucketOpen).
    const bucketOpenMs = (await db.loadWeekOpen().catch(() => null)) ?? undefined;
    // ════ THE REASON ARROW IS THE ENGINE'S DECISION, NOT A DIFF AGAINST HER HISTORY ════
    //
    // "↑ 2.5" beside a load is Hush claiming, in its own voice, that it raised her. It used to be
    // computed by comparing the new prescription to the LAST WEIGHT SHE LOGGED — and those are not
    // the same question, because **Loop 1 moves the load mid-session**. Her last logged weight is
    // wherever Loop 1 left her, not the load Loop 2 stepped from.
    //
    // The failure is not exotic; a six-week simulation produced it on an ordinary lift. Loop 1 eased
    // her hammer curl to 2 kg late in the session; Loop 2 then decided the occurrence's real move,
    // **4 → 3 — a cut** — and the stage compared 3 against the 2 she last logged and drew an **UP
    // arrow**. Hush announced a raise on the very occurrence it took weight off the bar.
    //
    // The engine already stamps exactly this, per occurrence, in the changeLog: `loadFrom → loadTo`,
    // the number the Complete screen and the Saturday mirror both read (`getSessionForwardV5`). So
    // the stage reads the same record instead of re-deriving a rival one.
    //
    // R7 / S-16 · **a hold says nothing.** The arrow belongs to the lift's MOST RECENT occurrence, so
    // an entry is only news while no later session has trained that lift — once she trains it again
    // and it holds, the engine decided nothing and the stage falls silent, rather than re-announcing
    // a move from a fortnight ago every time she opens the workout.
    //
    // The v4 "WEEK 1 is the learning week: silent" gate stays REMOVED (L7 — a decision is told at
    // the moment it is born, never on a calendar). In her first week there is simply no stamped
    // decision yet, so the reason stays silent from a FACT rather than from the calendar.
    const engineState = await db.loadEngineV5().catch(() => null);
    const lastTrainedAt = new Map<string, number>();
    for (const sess of history) {
      const at = Date.parse(sess.startedAt);
      if (!Number.isFinite(at)) continue;
      for (const set of sess.sets) {
        if (set.isApproach) continue;
        lastTrainedAt.set(set.exerciseId, Math.max(lastTrainedAt.get(set.exerciseId) ?? 0, at));
      }
    }
    /** exerciseId → the load move the engine made at that lift's most recent occurrence. */
    const decided = new Map<string, { from: number; to: number }>();
    for (const c of engineState?.changeLog ?? []) {
      if (c.kind != null || c.loadFrom == null || c.loadTo == null) continue; // structural/volume news is not an arrow
      if (c.at !== lastTrainedAt.get(c.exerciseId)) continue; // superseded by a later occurrence → a hold
      decided.set(c.exerciseId, { from: c.loadFrom, to: c.loadTo });
    }

    // The v5 engine — exercise-keyed, facts only — owns load, progression AND the band (S-6). It
    // advances per workout and its prescription drives every exercise it manages; unmanaged / swap-only
    // exercises fall back to the seed. The Weekly Update reads from v5 too (domain/weeklyUpdate), so a
    // v5 athlete's load, progression and narration all come from one engine.
    // Per-muscle T (register Part 9): each exercise reads the band of its primary muscle, falling back
    // to her single declared band, then the '8-10' default.
    const bandOf = (exId: string) => {
      const m = exerciseById(exId)?.muscle;
      return bandFor((m ? profile.repBandByMuscle?.[m] : undefined) ?? profile.repBand);
    };
    let v5targets: Record<string, V5Target> = {};
    if (program) {
      await foldEngine(program, profile, history, prefs, bucketOpenMs);
      v5targets = await currentV5Targets(history).catch((e): Record<string, V5Target> => {
        void track('engine_error', { op: 'currentV5Targets', message: String(e) });
        return {};
      });
    }
    // Cover EVERY renderable set with a real target. A slot's setCount can exceed MAX_SETS once Loop 3
    // has LEARNED a muscle's volume — distributeMuscleSets assigns up to SETS_MAX (5, F-1) to a single
    // lift, so a grown compound can be a 5-set slot. buildPlan renders slot.setCount sets and falls back
    // to a null-weight/reps-8 neutral target for any set with no match, so emitting a fixed 4 would leave
    // that 5th set uncovered (her load and band silently dropped). Emit up to the real max setCount in the
    // programme (never fewer than MAX_SETS) so the "sessionTargets always covers a slot" invariant holds.
    const maxSetCount = program
      ? Math.max(MAX_SETS, ...program.days.flatMap((d) => d.slots.map((s) => s.setCount)))
      : MAX_SETS;
    for (const ex of EXERCISES) {
      const v5t = v5targets[ex.id];
      // v5 owns every managed exercise; an unmanaged / swap-only lift falls back to the seed + her band.
      const weight = v5t ? v5t.weight : smartSeed(ex.id, profile, history, bandOf(ex.id).lo);
      const reps = v5t ? v5t.reps : bandOf(ex.id).lo;
      const repBandHi = v5t ? v5t.bandHi : bandOf(ex.id).hi;
      let reasonType: SetTarget['reasonType'];
      let reasonDelta: number | undefined;
      // The engine's own stamped move for this lift's last occurrence — never a diff against the
      // weight Loop 1 happened to leave her on. `to !== weight` means something changed the
      // prescription since (a band change, an edit): the stamped entry is no longer what she is
      // being asked for, and Hush says nothing rather than something stale.
      const move = decided.get(ex.id);
      if (weight != null && move != null && move.to === weight && move.from !== move.to) {
        reasonType = move.to > move.from ? 'increase' : 'decrease';
        reasonDelta = Math.round((move.to - move.from) * 10) / 10;
      }
      // No approach / warm-up set (founder ruling, 2026-07-16): every set is the working weight from
      // set 1, and Loop 1 responds to her performance from the first set (as v4 did).
      // Loop 1 (F-13): her fitted reps-per-rung, computed where history lives and stamped on the target
      // so the live loop sizes a correction to HER number (null → one cautious rung, B-5).
      const perRung = v5t ? perRungForV5(ex.id, history) ?? undefined : undefined;
      for (let s = 0; s < maxSetCount; s++)
        out.push({ exerciseId: ex.id, setIndex: s, recommendedWeight: weight, recommendedReps: reps, repBandLo: reps, repBandHi, perRung, reasonType: s === 0 ? reasonType : undefined, reasonDelta: s === 0 ? reasonDelta : undefined });
    }
    return out;
  },

  async recordSession(_args: { programDayId: string; sets: ActualSet[]; earlyFinish: boolean }) {
    // The completed session is persisted to local history by the session flow (db.append
    // CompletedSession); progression reads that history on the next sessionTargets call.
  },

  async replaceBlock(_args: { blockId: string; fromExercise: string; toExercise?: string }) {},

  async portraitSnapshot({ completedSessions }): Promise<PortraitSnapshot> {
    void completedSessions; // confidence now derives from per-capability DATA, not a raw count
    const profile = await loadProfileSafe();
    const history = await loadHistorySafe();
    // REAL portrait: relative strength per capability from the athlete's best logged e1RM vs a
    // sex/bodyweight-scaled benchmark; confidence rises with sessions of real data per capability.
    return { timestamp: new Date().toISOString(), ...computePortrait(history, profile) };
  },

  // The programme-edit swap (setExercisePreference / restoreExercisePreference, S-31) and the slot
  // lock (setSlotLock, S-30) are DELETED (Rev 7, S-73). Selection is learned from the in-workout swap
  // (S-69), the body map (S-56), and the learned leave-it against a rotation (S-71).
  async setSubstitute({ primaryExercise, substituteExercise, remove }: { primaryExercise: string; substituteExercise?: string; remove?: boolean }) {
    await editPreferences((p) => {
      if (remove || !substituteExercise) delete p.substitutes[primaryExercise];
      else p.substitutes[primaryExercise] = substituteExercise;
    });
  },
  async setBackup({ primaryExercise, backupExercise, remove }: { primaryExercise: string; backupExercise?: string; remove?: boolean }) {
    await editPreferences((p) => {
      if (remove || !backupExercise) delete p.backups[primaryExercise];
      else p.backups[primaryExercise] = backupExercise;
    });
  },
  async setOrder({ scope, order, workoutKey }: { scope: 'exercise' | 'workout'; order: string[]; capability?: Capability; workoutKey?: string }) {
    // Both scopes are durable across regen: workout order by day key, exercise order keyed by the
    // day's stable key (so a fresh week re-applies the athlete's within-workout sequence).
    await editPreferences((p) => {
      if (scope === 'workout') p.workoutOrder = order;
      else if (workoutKey) p.exerciseOrderByWorkout[workoutKey] = order;
    });
  },
  async markEquipmentOccupied(_args: { blockId: string }) {},
};
