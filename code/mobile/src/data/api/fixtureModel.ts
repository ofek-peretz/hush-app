/**
 * Local fixture model — the runnable program engine for the app today (every signed-in
 * user runs on this until a backend session/token exchange exists; see selectModel).
 *
 * It builds best-practice, market-standard programs and personalized cold-start loads:
 *  - generateProgram: a recognized split chosen by (sex × daysPerWeek) — Full Body,
 *    Upper/Lower, or Push/Pull/Legs — built from the curated catalog. Every weekly plan
 *    covers ALL major muscle groups (core included; calves in the MEN's splits only —
 *    founder 2026-07-10); women's splits carry the lower-body / glute emphasis they
 *    typically train for.
 *  - sessionTargets: starting weights personalized by sex × bodyweight × experience × age
 *    (conservative — "weights start light, deliberate"); reps AND set counts by
 *    goal × exercise tier × age.
 *
 * Category coverage (hermetic — every athlete gets a complete, quality program):
 *    sex ∈ {male, female} · age (load taper + masters-friendly volume/reps) ·
 *    bodyweight (load scaling) · experience {beginner|intermediate|advanced} (load) ·
 *    goal {get_stronger|build_muscle|general_fitness|toning} (reps + sets) ·
 *    daysPerWeek 1–6 (split).
 *
 * The progression MATH (week-over-week change) still belongs to the real model; the
 * ADVISORY_DECISION block keeps the post-calibration voice surfaces exercisable.
 */
import type {
  Capability,
  Goal,
  PortraitSnapshot,
  Profile,
  Program,
  ProgramDay,
  SetTarget,
  Slot,
  WeeklyVolume,
} from '@/data/local/models';
import { EXERCISES, exerciseById, exercisesForMuscle, isSwapOnly, patternFamily, type Exercise, type MuscleGroup } from '@/data/exercises';
import { swapScore } from '@/domain/swapPool';
import { startingWeight } from '@/domain/startingLoad';
import { computePortrait } from '@/data/progression';
import { bandFor } from '@/engine/v5/repBand';
import { advanceV5, currentV5Targets, getVolumeTargetsV5, recordStructuralChangeV5, type V5Target } from '@/engine/v5/v5Engine';
import { assembleV5DayLists } from '@/engine/v5/programAssembly';
import { chooseDonor, type VolumeCandidate } from '@/engine/v5/volumeAllocation';
import { CANONICAL_MUSCLE_ORDER, SETS_MIN as V5_SETS_MIN } from '@/engine/v5/constants';
import { resolveEngineEnactments } from '@/domain/engineChanges';
import { enginePattern, type Pattern, type Equipment } from '@/engine/catalog';
import { epley, normalizeLoad } from '@/engine/loadMath';
import { displayWeekNumber } from '@/domain/weekCadence';
import { db, EMPTY_PREFERENCES, type OwnedPreferences } from '@/data/local/db';
import type { Session } from '@/data/local/models';
import { track } from '@/platform/telemetry';
import type { ActualSet, ModelClient } from './modelClient';

// Hard ceiling on sets per exercise (founder 2026-07-09: max 4 for EVERY lift). setsFor clamps to
// this, and sessionTargets emits this many per-set targets per exercise so a slot's setCount is
// ALWAYS fully covered (a slot never falls through to the default-weight fallback).
const MAX_SETS = 4;

// ───────────────────────────── split library (market-standard) ─────────────────────────────
// Each day = a recognized session built from the catalog. Days are ordered big→small
// (compound first, isolation/finisher last). Every weekly plan covers all major groups,
// with core worked across the week. Men's and women's pools differ: men keep calves on
// lower/full-body sessions; women's days spend those slots on the lower-body / glute
// emphasis (hip thrust, RDL, split squat, glute bridge, pull-through, abduction,
// kickback) typical of how women train — calves are OUT of the women's splits
// (founder 2026-07-10).

// Only blueprints referenced by a split below are kept (dead, never-referenced blueprints
// were removed 2026-06-23). Core is NOT listed here — it is supplemental work added once per
// week by addWeeklyCore() (3 sets, last, upper-preferred), never a primary slot in the split.
// Each day lists compounds first; dayFromBlueprint also enforces compound-before-isolation.
const MEN: Record<string, string[]> = {
  'Full Body A': ['bb_back_squat', 'bb_rdl', 'bb_bench_press', 'bb_row', 'bb_overhead_press'],
  'Upper A': ['bb_bench_press', 'bb_row', 'bb_overhead_press', 'lat_pulldown', 'bb_curl', 'triceps_pushdown'],
  // Upper B (P1, approved 2026-07-06): the 4-day athlete's ADDED day must complement the week,
  // never replay it — the old 4th day (Upper A) repeated six Push A / Pull A lifts. Second chest
  // angle, second row pattern, delts twice, arms on different implements; zero overlap with
  // Push A / Pull A.
  'Upper B': ['incline_bb_press', 'cable_row', 'db_shoulder_press', 'rear_delt_fly', 'hammer_curl', 'overhead_triceps_ext'],
  'Lower A': ['bb_back_squat', 'bb_rdl', 'leg_press', 'leg_curl', 'standing_calf_raise'],
  'Push A': ['bb_bench_press', 'bb_overhead_press', 'incline_db_press', 'lateral_raise', 'triceps_pushdown'],
  // Conventional deadlift is the canonical hip-hinge — programmed on the pull day (standard PPL).
  'Pull A': ['bb_deadlift', 'bb_row', 'lat_pulldown', 'face_pull', 'bb_curl'],
  'Legs A': ['bb_back_squat', 'bb_rdl', 'leg_press', 'leg_curl', 'standing_calf_raise'],
  'Push B': ['incline_bb_press', 'db_shoulder_press', 'chest_dip', 'cable_lateral_raise', 'overhead_triceps_ext'],
  // P2 (approved 2026-07-06): the week already rows five ways with a third horizontal row here —
  // preacher curl gives the 5-day athlete the second arms slot instead of a redundant row.
  'Pull B': ['pull_up', 't_bar_row', 'preacher_curl', 'rear_delt_fly', 'hammer_curl'],
  'Legs B': ['front_squat', 'hip_thrust', 'hack_squat', 'walking_lunge', 'seated_calf_raise'],
};

// Calves are OUT of the women's splits (founder 2026-07-10) — the slot goes to the
// glute / lower-body emphasis women's programming is built around instead (kickback /
// abduction / machine quad work). Calf work stays in the catalog + men's splits.
const WOMEN: Record<string, string[]> = {
  'Full Body A': ['bb_back_squat', 'hip_thrust', 'db_bench_press', 'lat_pulldown', 'leg_curl', 'cable_kickback'],
  'Upper A': ['db_bench_press', 'lat_pulldown', 'db_shoulder_press', 'cable_row', 'lateral_raise'],
  'Upper B': ['incline_db_press', 'cable_row', 'lateral_raise', 'face_pull', 'bb_curl'],
  'Lower A': ['hip_thrust', 'bb_back_squat', 'bb_rdl', 'leg_curl', 'cable_pull_through', 'hip_abduction'],
  'Lower B': ['bulgarian_split_squat', 'hip_thrust', 'leg_press', 'leg_curl', 'hip_abduction', 'cable_kickback'],
  // Legs A (P3, approved 2026-07-06): the 4-day athlete's ADDED lower day was half of Lower A
  // re-run (hip thrust ×3/week, squat + RDL duplicated). Same glute-focused identity, now
  // genuinely distinct: bridge + DB hinge + machine quad work — the week's three lower days
  // become barbell-hinge / unilateral+machine / bridge+machine-quad.
  'Legs A': ['glute_bridge', 'db_rdl', 'hack_squat', 'cable_kickback', 'hip_abduction', 'leg_extension'],
  'Legs B': ['bulgarian_split_squat', 'glute_bridge', 'walking_lunge', 'leg_extension', 'cable_pull_through', 'cable_kickback'],
};

// daysPerWeek → ordered day names. The frequency philosophy is founder-directed
// (2026-06-21):
//   MEN  — legs exactly ONCE per week (except a 6-day split), the rest of the week
//          leaning into chest/back/shoulders/arms. So 2d→Upper/Lower, 3d+→PPL with a
//          single Legs day plus extra upper sessions; only 6d adds a second Legs day.
//   WOMEN — the mirror: lower-body / glute / posterior-chain emphasis at every
//          frequency (lower sessions ≥ upper sessions), since that's what they train for.
const MEN_SPLITS: Record<number, string[]> = {
  1: ['Full Body A'],
  2: ['Upper A', 'Lower A'],
  3: ['Push A', 'Pull A', 'Legs A'],
  4: ['Push A', 'Pull A', 'Legs A', 'Upper B'],
  5: ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B'],
  6: ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B'],
};
const WOMEN_SPLITS: Record<number, string[]> = {
  1: ['Full Body A'],
  2: ['Lower A', 'Upper A'],
  3: ['Lower A', 'Upper A', 'Lower B'],
  4: ['Lower A', 'Upper A', 'Lower B', 'Upper B'],
  5: ['Lower A', 'Upper A', 'Lower B', 'Upper B', 'Legs A'],
  6: ['Lower A', 'Upper A', 'Lower B', 'Upper B', 'Legs A', 'Legs B'],
};

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
function orderForFlow(list: Exercise[]): Exercise[] {
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
  // order stations: the one with the earliest compound leads (main lift first); iso-only stations trail
  return [...stations.values()]
    .map((g) => {
      const firstCompound = g.find((e) => tierRank(e) === 0);
      return { g, key: firstCompound ? idx.get(firstCompound)! : Number.POSITIVE_INFINITY, first: Math.min(...g.map((e) => idx.get(e)!)) };
    })
    .sort((a, b) => a.key - b.key || a.first - b.first)
    .flatMap((x) => x.g);
}

function dayFromBlueprint(
  index: number,
  name: string,
  exerciseIds: string[],
  goal: Goal,
  age?: number,
  volume: WeeklyVolume = 'moderate',
  /** v5 Loop 3: the LEARNED per-exercise set count (distributeMuscleSets). Absent → the day-one
   *  `setsFor`, so a muscle still on its day-one shape (and the whole legacy cohort) is untouched. */
  setCounts?: Record<string, number>,
): ProgramDay {
  const dayKey = String(index);
  // STABLE engine-slot id per blueprint exercise: pattern occurrence in the CANONICAL blueprint
  // order (exerciseIds as written), NOT the display order below. Keyed by the workout's NAME (e.g.
  // "Push A"), NOT its index — the name is a workout's true identity, stable when the athlete
  // changes FREQUENCY (day_3 is Upper B at 4 days but Push B at 5), so per-slot state (load,
  // progression, swaps) carries across a frequency change on the shared workouts and never leaks
  // between two different workouts that happen to share an index. Survives equipment clustering and
  // engine swaps/graduations too (findings 2 / V1).
  const patternOcc = new Map<Pattern, number>();
  const engineIdByExercise = new Map<string, string>();
  for (const id of exerciseIds) {
    const p = enginePattern(id);
    if (p == null) continue; // core / unmapped — never engine-managed, no stable id needed
    const occ = patternOcc.get(p) ?? 0;
    patternOcc.set(p, occ + 1);
    engineIdByExercise.set(id, `${name}:${p}#${occ}`);
  }
  const exercises = orderForFlow(
    exerciseIds.map((exerciseId) => exerciseById(exerciseId)).filter((e): e is Exercise => !!e),
  );
  const slots: Slot[] = exercises.map((ex) => {
    const engineSlotId = engineIdByExercise.get(ex.id);
    return {
      capability: ex.capability,
      exerciseId: ex.id,
      setCount: setCounts?.[ex.id] ?? setsFor(ex.tier, goal, age, volume),
      ...(engineSlotId ? { engineSlotId } : {}),
    };
  });
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
// Per-set minutes ≈ rest + execution; compounds rest longer than isolation.
const COMPOUND_SET_MIN = 3;
const ISOLATION_SET_MIN = 2;
const MAX_SESSION_MIN = 60;

function isCompound(exerciseId: string): boolean {
  return exerciseById(exerciseId)?.tier === 'compound';
}

/** Estimated prescribed-work minutes for a day (work sets only). */
export function estimateSessionMinutes(day: ProgramDay): number {
  return day.slots.reduce(
    (m, s) => m + s.setCount * (isCompound(s.exerciseId) ? COMPOUND_SET_MIN : ISOLATION_SET_MIN),
    0,
  );
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
function enforceTimeCap(day: ProgramDay, budgetMin: number = MAX_SESSION_MIN): void {
  const isoIdx = day.slots.map((_s, i) => i).filter((i) => !isCompound(day.slots[i].exerciseId));
  for (let k = isoIdx.length - 1; k >= 0 && estimateSessionMinutes(day) > budgetMin; k--) {
    const slot = day.slots[isoIdx[k]];
    if (!slot.supplemental && slot.setCount > 3) slot.setCount = 3;
  }
  for (let i = day.slots.length - 1; i >= 0 && estimateSessionMinutes(day) > budgetMin; i--) {
    if (day.slots.length <= 4) break;
    const ex = exerciseById(day.slots[i].exerciseId);
    if (ex && ex.tier === 'isolation' && !day.slots[i].supplemental && ex.muscle !== 'Calves' && ex.muscle !== 'Core') {
      day.slots.splice(i, 1);
    }
  }
  const compoundIdx = day.slots.map((_s, i) => i).filter((i) => isCompound(day.slots[i].exerciseId));
  for (let k = compoundIdx.length - 1; k >= 1 && estimateSessionMinutes(day) > budgetMin; k--) {
    const slot = day.slots[compoundIdx[k]];
    if (slot.setCount > 3) slot.setCount = 3;
  }
  // Step 4 — the last resort. Recompute the per-muscle exercise count each pass and drop the trailing
  // compound whose muscle keeps another lift; stop when nothing qualifies (S-3, cannot fit honestly).
  for (let guard = 0; guard < day.slots.length && estimateSessionMinutes(day) > budgetMin; guard++) {
    const countByMuscle: Record<string, number> = {};
    for (const s of day.slots) {
      if (s.supplemental) continue;
      const m = exerciseById(s.exerciseId)?.muscle;
      if (m) countByMuscle[m] = (countByMuscle[m] ?? 0) + 1;
    }
    let dropped = false;
    for (let i = day.slots.length - 1; i >= 0; i--) {
      const s = day.slots[i];
      if (s.supplemental || !isCompound(s.exerciseId)) continue;
      const m = exerciseById(s.exerciseId)?.muscle;
      if (!m || countByMuscle[m] <= 1) continue; // never a muscle's ONLY exercise (S-35)
      day.slots.splice(i, 1);
      dropped = true;
      break;
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
export function trimV5ToBudget(day: ProgramDay, bodyMap: Profile['bodyMap'], budgetMin: number): void {
  const muscleOfSlot = (i: number) => exerciseById(day.slots[i].exerciseId)?.muscle;
  const isEmphasis = (m: string | undefined) => !!m && bodyMap?.[m as MuscleGroup] === 'emphasis';
  let guard = 0;
  while (estimateSessionMinutes(day) > budgetMin && guard++ < 200) {
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
    if (trimAt != null) {
      day.slots[trimAt].setCount -= 1;
    } else if (exCountByMuscle[donor.muscle] > 1 && isoIdx.length > 0) {
      day.slots.splice(isoIdx[isoIdx.length - 1], 1);
    } else {
      break; // the donor's only exercise — protected; the safety net takes over
    }
  }
}

// ── Athlete-owned customizations honored at (re)generation (Program Ownership Contract) ──
// Pins are muscle-keyed (swaps are muscle-scoped → the muscle is the durable slot identity).
// A pin is applied to the FIRST slot of its muscle, never duplicating an exercise the day
// already contains, and only within the slot's own capability — so structure stays valid.
function applyPins(day: ProgramDay, pinsByMuscle: Record<string, string>): void {
  const present = new Set(day.slots.map((s) => s.exerciseId));
  const consumedMuscle = new Set<string>();
  day.slots = day.slots.map((slot) => {
    const ex = exerciseById(slot.exerciseId);
    if (!ex) return slot;
    const pinId = pinsByMuscle[ex.muscle];
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
 *  in the list (e.g. a freshly pinned lift, or the supplemental core) keep their order AFTER the
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

/** Append the week's single supplemental core slot to its host session (mutates in place). */
function addWeeklyCore(days: ProgramDay[], daysPerWeek: number): void {
  if (!days.length || !CORE_POOL.length) return;
  const coreId = CORE_POOL[(Math.max(1, daysPerWeek) - 1) % CORE_POOL.length];
  const ex = exerciseById(coreId);
  if (!ex) return;
  const host = days[coreHostIndex(days)];
  host.slots.push({ capability: ex.capability, exerciseId: ex.id, setCount: CORE_SETS, supplemental: true });
  if (!host.muscleGroups.includes(ex.muscle)) host.muscleGroups.push(ex.muscle);
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

const HYPERTROPHY_REP_TARGET = 8; // goal is hypertrophy for everyone (founder 2026-07-09)

/**
 * Smart starting load for a lift (founder 2026-07-09): a swap / new exercise must ADAPT to the
 * athlete's PROVEN strength, not restart from a beginner cold-start (a year-trained bencher moving
 * to the chest-press machine must not begin at ~half their real pushing load). Priority:
 *   1. the lift's OWN demonstrated e1RM (already trained it) → working load at the rep target;
 *   2. else the athlete's best e1RM on the SAME engine pattern, scaled by the two lifts' baseKg
 *      ratio (relative difficulty) → a strength transfer onto the new lift;
 *   3. else the conservative cold-start seed (a genuinely new pattern / the first program).
 * Bodyweight lifts have no external load. The result still enters CALIBRATING, which fine-tunes it.
 * Injected into the engine as `seedFor`; discarded at calibration exit (C-8, §4.4).
 */
function smartSeed(
  id: string,
  profile: Pick<Profile, 'sex' | 'weightKg' | 'experience' | 'age'>,
  history: Session[],
): number | null {
  const ex = exerciseById(id);
  if (!ex) return null;
  if (ex.bodyweight || ex.baseKg == null) return startingWeight(ex, profile); // null for bodyweight
  const toWorking = (e1rm: number) => normalizeLoad(e1rm / (1 + HYPERTROPHY_REP_TARGET / 30), ex.equipment as Equipment);
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
 * Working sets by goal × tier × VOLUME, then age-adjusted. Moderate (the default) is the
 * historical scheme — strength/hypertrophy carry an extra compound set, lighter goals stay at 3.
 * The volume lever then shifts every exercise: LOW floors to the minimum effective 3, HIGH adds
 * one set. Clamped to [3, MAX_SETS] so the rep-min holds and sessionTargets always covers a slot.
 * Absent volume ⇒ 'moderate' ⇒ byte-identical to the prior behavior (parity-preserving).
 */
function setsFor(tier: Tier, goal: Goal, age?: number, volume: WeeklyVolume = 'moderate'): number {
  const compound = tier === 'compound';
  let sets = 3;
  if (compound && (goal === 'get_stronger' || goal === 'build_muscle')) sets = 4; // moderate base
  if (volume === 'high') sets += 1;
  if (volume === 'low') sets = 3;
  if (age != null && age >= 65 && compound) sets = Math.max(sets - 1, 3);
  return Math.min(Math.max(sets, 3), MAX_SETS);
}

async function loadProfileSafe(): Promise<Pick<Profile, 'sex' | 'weightKg' | 'experience' | 'goal' | 'age' | 'memberSince' | 'repBand' | 'repBandByMuscle'>> {
  try {
    const p = await db.loadProfile();
    if (p) return p;
  } catch {
    /* offline/test — fall through to a sensible default */
  }
  return { sex: 'male', weightKg: 75, experience: 'intermediate', goal: 'build_muscle' };
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
    // WEEKLY-PROGRAM model: a bucket of exactly N workouts (any order; Rest only after all
    // N are done). The split is the market-standard one for this athlete's sex + frequency.
    const n = Math.min(Math.max(profile.daysPerWeek, 1), 6);
    const goal = profile.goal ?? 'build_muscle';
    const volume = profile.volume ?? 'moderate';
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
    let dayLists = assembleV5DayLists(profile.bodyMap, n, prefs.pinsByMuscle, prefs.substitutes, learnedVolume);
    // Safety net: everything-off (S-3) is prevented by the body-map screen (validateMap), but if a map
    // ever yields no workout, fall back to an ALL-NORMAL map (never a demographic shelf) so a workout
    // always exists. Unreachable in practice.
    if (dayLists.length === 0) dayLists = assembleV5DayLists(undefined, n, prefs.pinsByMuscle, prefs.substitutes, learnedVolume);
    const days: ProgramDay[] = dayLists.map((dl, i) => dayFromBlueprint(i, dl.name, dl.exerciseIds, goal, profile.age, volume, dl.setCounts));

    // Unify same-exercise slots (founder 2026-07-09): when a lift appears in more than one workout
    // (e.g. women's hip thrust across two lower days), ALL its occurrences share ONE engine
    // progression — keyed to the first occurrence's stable id — so it gets a single consistent
    // load fed by EVERY session, never two identical-but-independent slots that could drift apart.
    const canonicalEngineId = new Map<string, string>();
    for (const d of days) {
      for (const slot of d.slots) {
        if (!slot.engineSlotId) continue;
        const canon = canonicalEngineId.get(slot.exerciseId);
        if (canon == null) canonicalEngineId.set(slot.exerciseId, slot.engineSlotId);
        else slot.engineSlotId = canon; // later occurrence → share the first's engine slot
      }
    }

    // Generation touches NO engine state: v5 does no engine-initiated swap here (a learned substitute
    // is already applied inside the assembler, C1), and the 3-week CALENDAR rotation is deleted
    // (register Part 5 — variety comes from a measured stall, not a schedule). Per-exercise state is
    // created lazily by advanceV5 in sessionTargets.
    for (const d of days) applyPins(d, prefs.pinsByMuscle); // a pinned lift leads its muscle (S-30/S-71)
    addWeeklyCore(days, n); // one supplemental core block, last, upper-preferred
    const budgetMin = profile.workoutMinutes ?? MAX_SESSION_MIN; // her declared ceiling (S-64), default 60
    // D4: resolve an over-budget day by DONATING from the muscle that can best spare it (S-37, emphasis
    // protected) BEFORE the positional safety net.
    for (const d of days) trimV5ToBudget(d, profile.bodyMap, budgetMin);
    for (const d of days) enforceTimeCap(d, budgetMin); // prescribed work ≤ her minutes (warm-ups excluded)
    for (const d of days) applyExerciseOrder(d, prefs.exerciseOrderByWorkout[d.key ?? '']); // athlete order
    const ordered = applyWorkoutOrder(days, prefs.workoutOrder); // athlete-owned workout order
    return { id: 'program_v1', frequency: n, days: ordered };
  },

  async sessionTargets({ programDayId }): Promise<SetTarget[]> {
    void programDayId; // targets are keyed by exercise; the screen picks the day's slots
    const profile = await loadProfileSafe();
    const goal = profile.goal ?? 'build_muscle';
    const history = await loadHistorySafe();
    const out: SetTarget[] = [];

    const program = await db.loadProgram();
    const seedFor = (id: string) => smartSeed(id, profile, history);
    const prefs = await loadPreferencesSafe();
    // The bucket the athlete is actually executing (null pre-upgrade). The engine advances WITH it,
    // never ahead of it — a mid-week signup's extended first bucket must not get a mid-plan load
    // change (weekCadence.firstBucketOpen).
    const bucketOpenMs = (await db.loadWeekOpen().catch(() => null)) ?? undefined;
    // Reason lines (finding 4): from WEEK 2 on, surface the engine's per-lift decision — did the load
    // go up or down vs the athlete's last logged weight — so the WHY sheet, Home's "lifts up", and
    // Well Done reflect what Hush actually did. WEEK 1 is the learning week: silent. displayWeekNumber
    // (not the raw calendar count): a mid-week signup's extended first bucket is still week 1.
    const week = displayWeekNumber(profile.memberSince, bucketOpenMs ?? null, Date.now());
    const lastLogged = new Map<string, number>();
    for (const sess of history) for (const set of sess.sets) if (set.actualWeight != null && !lastLogged.has(set.exerciseId)) lastLogged.set(set.exerciseId, set.actualWeight);

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
      // pinned lift is never taken away) and flagging rotations (S-71/S-72). Pure — the write below only
      // enacts what the resolver returns.
      const enacted = resolveEngineEnactments(changes, prefs.pinsByMuscle, history);
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
      v5targets = await currentV5Targets(history).catch((e): Record<string, V5Target> => {
        void track('engine_error', { op: 'currentV5Targets', message: String(e) });
        return {};
      });
    }
    for (const ex of EXERCISES) {
      const v5t = v5targets[ex.id];
      // v5 owns every managed exercise; an unmanaged / swap-only lift falls back to the seed + her band.
      const weight = v5t ? v5t.weight : smartSeed(ex.id, profile, history);
      const reps = v5t ? v5t.reps : bandOf(ex.id).lo;
      const repBandHi = v5t ? v5t.bandHi : bandOf(ex.id).hi;
      let reasonType: SetTarget['reasonType'];
      let reasonDelta: number | undefined;
      if (week >= 2 && weight != null) {
        const prev = lastLogged.get(ex.id);
        if (prev != null && prev !== weight) {
          reasonType = weight > prev ? 'increase' : 'decrease';
          reasonDelta = Math.round((weight - prev) * 10) / 10;
        }
      }
      // S-60: the FIRST set of a v5 lift with no recent fact is an approach measurement.
      const approachFirst = v5t?.isApproach ? true : undefined;
      for (let s = 0; s < MAX_SETS; s++)
        out.push({ exerciseId: ex.id, setIndex: s, recommendedWeight: weight, recommendedReps: reps, repBandHi, isApproach: s === 0 ? approachFirst : undefined, reasonType: s === 0 ? reasonType : undefined, reasonDelta: s === 0 ? reasonDelta : undefined });
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
