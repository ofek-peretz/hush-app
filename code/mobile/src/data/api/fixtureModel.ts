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
import { currentV5Targets, getVolumeTargetsV5, recordStructuralChangeV5, perRungForV5, getSessionEarnedV5, getSessionForwardV5, type V5Target } from '@/engine/v5/v5Engine';
import type { Explanation } from '@/engine/weeklyView';
import { learnedRestS, learnedExecS, type ExecSample } from '@/engine/v5/timeBudget';
import { learnedTransitionRestS, REST_TRANSITION_S } from '@/domain/restPrescription';
import { CANONICAL_MUSCLE_ORDER, SETS_MIN as V5_SETS_MIN, SETS_MAX as V5_SETS_MAX } from '@/engine/v5/constants';
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
  // group by equipment (one station, fully, before moving on)
  const stations = new Map<string, Exercise[]>();
  for (const e of list) {
    const g = stations.get(e.equipment) ?? [];
    g.push(e);
    stations.set(e.equipment, g);
  }
  // within a station: compounds first, then original order
  for (const g of stations.values()) g.sort((a, b) => tierRank(a) - tierRank(b) || idx.get(a)! - idx.get(b)!);
  // Two lifts on the SAME PHYSICAL station (catalog `station` — the leg press and its calf raise)
  // are pulled back to back, so she finishes the machine before anything else in the class block.
  // Without this, the block's compounds-first order could send her leg press → leg extension →
  // BACK to the leg press for calves — exactly the "left and returned" the law forbids. The class
  // grouping alone cannot see it: each id appears once, so every OTHER machine is naturally visited
  // once; only lifts that genuinely share equipment need the pull. Deterministic (first-seen leads).
  for (const [k, g] of stations) {
    if (!g.some((e) => e.station)) continue;
    const clustered: Exercise[] = [];
    for (const e of g) {
      if (clustered.includes(e)) continue;
      clustered.push(e);
      if (e.station) for (const f of g) if (!clustered.includes(f) && f.station === e.station) clustered.push(f);
    }
    stations.set(k, clustered);
  }
  // order stations: the one with the earliest compound leads (main lift first); iso-only stations trail
  return [...stations.values()]
    .map((g) => {
      const firstCompound = g.find((e) => tierRank(e) === 0);
      return { g, key: firstCompound ? idx.get(firstCompound)! : Number.POSITIVE_INFINITY, first: Math.min(...g.map((e) => idx.get(e)!)) };
    })
    .sort((a, b) => a.key - b.key || a.first - b.first)
    .flatMap((x) => x.g);
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
    setCount: setCounts?.[ex.id] ?? setsFor(ex.tier),
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
  for (const allowLeaveIt of [false, true]) {
    for (let i = day.slots.length - 1; i >= 0 && over(); i--) {
      const slot = day.slots[i];
      const ex = exerciseById(slot.exerciseId);
      if (!ex || slot.supplemental || ex.tier !== 'isolation') continue;
      if (!allowLeaveIt && protectedIds.has(slot.exerciseId)) continue; // S-59: leave-its are cut last
      if ((exCountByMuscle()[ex.muscle] ?? 0) <= 1) continue; // S-35/S-63: never a muscle's ONLY lift
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
        if (!m || counts[m] <= 1) continue; // never a muscle's ONLY exercise (S-35)
        day.slots.splice(i, 1);
        dropped = true;
        break;
      }
      if (dropped) break;
    }
    if (!dropped) break; // only single-exercise muscles remain → the day cannot fit (S-3)
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
    const dropAt = [...isoIdx].reverse().find((i) => !protectedIds.has(day.slots[i].exerciseId)) ?? isoIdx[isoIdx.length - 1];
    if (trimAt != null) {
      day.slots[trimAt].setCount -= 1;
    } else if (exCountByMuscle[donor.muscle] > 1 && isoIdx.length > 0) {
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
function setsFor(tier: Tier): number {
  // Compounds lead a day and carry the fuller scheme (Part 3 #4); both sit inside F-1.
  return tier === 'compound' ? 4 : V5_SETS_MIN;
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
  /*
   * ⛔ THE BETWEEN-SESSION FOLD WAS HERE.
   *
   * It ran `advanceV5` over every session not yet folded — Loop 2 deciding the next load and
   * whether a lift had graduated or should rotate, Loop 3 deciding how many sets a muscle had
   * earned — and then enacted the exercise changes into `substitutes`.
   *
   * All of it is the AI's now, by the founder's ruling: *"the engine decides DURING the workout
   * only."* What used to happen here happens in `platform/coach/afterSession` instead, and what
   * used to be argued from a fold is a sentence the coach wrote and can be read back.
   *
   * `theEngineDecidesNothingBetweenSessions` is the law that keeps it gone.
   */
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

  /*
   * ⛔ `generateProgram` AND `setWeeklyFrequency` WERE HERE, and about 300 lines of assembly with
   * them — the body-map read, the region split, the capability slots, the time-cap trimming.
   *
   * Nothing composes a week now. The coach writes the programme in the intake conversation and
   * re-writes it after every session, from what she actually did rather than from a body map filled
   * in on the day she signed up.
   */
  /*
   * ⛔ `sessionTargets` WAS HERE, and about 100 lines of seeding and per-set target assembly.
   *
   * It resolved a load for every set of a workout out of the engine's own state, and it was also
   * where the between-session fold was triggered from. The coach decides every load now and writes
   * it into the programme, so a load is READ FROM THE PLAN — `coachRows` for the screens,
   * `buildPlanFromCoach` for the machine — and there is nothing left to ask.
   */
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
