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
import { toEngineProfile, ensureSlots, maybeAdvance, currentTargets, currentSlots, type V4SlotView } from '@/engine/v4/v4Engine';
import { enginePattern } from '@/engine/v4/catalogAdapter';
import { epley, normalizeLoad } from '@/engine/v4/reads';
import { displayWeekNumber, trainingWeekNumber } from '@/domain/weekCadence';
import type { Pattern, Equipment } from '@/engine/v4/types';
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

/**
 * Re-cluster a day's slots for equipment flow AFTER an engine overlay may have changed an
 * exercise's equipment (founder: use a station to the end, then move on). Reuses orderForFlow so
 * the ordering law is identical to first generation; the supplemental core stays last, and every
 * slot keeps its durable engineSlotId / setCount / lock. Idempotent on an already-clustered day.
 */
function reclusterDaySlots(slots: Slot[]): Slot[] {
  const supplemental = slots.filter((s) => s.supplemental);
  const primary = slots.filter((s) => !s.supplemental);
  const exs = primary.map((s) => exerciseById(s.exerciseId)).filter((e): e is Exercise => !!e);
  const ordered = orderForFlow(exs);
  const slotByExercise = new Map(primary.map((s) => [s.exerciseId, s]));
  const orderedPrimary = ordered.map((e) => slotByExercise.get(e.id)).filter((s): s is Slot => !!s);
  const placed = new Set(orderedPrimary.map((s) => s.exerciseId));
  const leftover = primary.filter((s) => !placed.has(s.exerciseId)); // safety (unresolved exercise)
  return [...orderedPrimary, ...leftover, ...supplemental];
}

function dayFromBlueprint(
  index: number,
  name: string,
  exerciseIds: string[],
  goal: Goal,
  age?: number,
  volume: WeeklyVolume = 'moderate',
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
      setCount: setsFor(ex.tier, goal, age, volume),
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
 *      never the first (the day's main lift keeps its full scheme), never below 3.
 */
function enforceTimeCap(day: ProgramDay): void {
  const isoIdx = day.slots.map((_s, i) => i).filter((i) => !isCompound(day.slots[i].exerciseId));
  for (let k = isoIdx.length - 1; k >= 0 && estimateSessionMinutes(day) > MAX_SESSION_MIN; k--) {
    const slot = day.slots[isoIdx[k]];
    if (!slot.supplemental && slot.setCount > 3) slot.setCount = 3;
  }
  for (let i = day.slots.length - 1; i >= 0 && estimateSessionMinutes(day) > MAX_SESSION_MIN; i--) {
    if (day.slots.length <= 4) break;
    const ex = exerciseById(day.slots[i].exerciseId);
    if (ex && ex.tier === 'isolation' && !day.slots[i].supplemental && ex.muscle !== 'Calves' && ex.muscle !== 'Core') {
      day.slots.splice(i, 1);
    }
  }
  const compoundIdx = day.slots.map((_s, i) => i).filter((i) => isCompound(day.slots[i].exerciseId));
  for (let k = compoundIdx.length - 1; k >= 1 && estimateSessionMinutes(day) > MAX_SESSION_MIN; k--) {
    const slot = day.slots[compoundIdx[k]];
    if (slot.setCount > 3) slot.setCount = 3;
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
 * Working reps by goal × tier, then age-adjusted. Each goal trains a distinct quality:
 *   get_stronger    → heavy, low reps        (compound 5  · isolation 8)
 *   build_muscle    → classic hypertrophy    (compound 8  · isolation 12)
 *   general_fitness → lighter, moderate reps (compound 10 · isolation 12)
 *   toning          → definition / endurance (compound 12 · isolation 15)
 * Age 60+ gets a joint-friendly floor (no maximal low-rep work).
 */
function repsFor(tier: Tier, goal: Goal, age?: number): number {
  const compound = tier === 'compound';
  let reps: number;
  switch (goal) {
    case 'get_stronger':
      reps = compound ? 5 : 8;
      break;
    case 'general_fitness':
      reps = compound ? 10 : 12;
      break;
    case 'toning':
      reps = compound ? 12 : 15;
      break;
    case 'build_muscle':
    default:
      reps = compound ? 8 : 12;
      break;
  }
  if (age != null && age >= 60) reps = Math.max(reps, compound ? 8 : 12);
  return reps;
}

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

async function loadProfileSafe(): Promise<Pick<Profile, 'sex' | 'weightKg' | 'experience' | 'goal' | 'age' | 'memberSince'>> {
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

// ───────────────────────────── periodic refresh (founder 2026-07-09) ─────────────────────────────
/** Every N training weeks, ONE non-pinned lift per workout rotates to a fresh variation. */
const REFRESH_CYCLE_WEEKS = 3;

/**
 * Pick ONE lift in `day` to rotate out this cycle and swap it for a fresh same-muscle + same-tier
 * variation. Selection: the most-STALLED non-pinned lift (tie → longest tenure → stable order), so
 * a plateau is broken while a working lift is left alone. The replacement is the next one the slot
 * has NOT used recently — walking the WHOLE pool with NO ping-pong (repeats only once the pool is
 * exhausted). PINNed lifts, core, and swap-only lifts are never touched; a duplicate in the workout
 * is never introduced. Mutates prefs (`rotations` + `rotationUsed`) and records the rotated slotId.
 */
function rotateOneInDay(
  day: ProgramDay,
  engView: Record<string, { flatWeeks: number; tenure: number }>,
  prefs: OwnedPreferences,
  rotatedIds: Set<string>,
): void {
  const rotatable = day.slots.filter((s) => {
    if (!s.engineSlotId || s.supplemental || rotatedIds.has(s.engineSlotId)) return false;
    const ex = exerciseById(s.exerciseId);
    return !!ex && !prefs.pinsByMuscle[ex.muscle]; // never rotate a lift whose muscle the athlete pinned
  });
  if (!rotatable.length) return;
  const chosen = rotatable
    .map((s, i) => ({ s, i, eng: s.engineSlotId ? engView[s.engineSlotId] : undefined }))
    .sort((a, b) => (b.eng?.flatWeeks ?? 0) - (a.eng?.flatWeeks ?? 0) || (b.eng?.tenure ?? 0) - (a.eng?.tenure ?? 0) || a.i - b.i)[0].s;
  const slotId = chosen.engineSlotId!;
  const cur = exerciseById(chosen.exerciseId);
  if (!cur) return;
  const inDay = new Set(day.slots.map((sl) => sl.exerciseId));
  // A ROTATION IS NOT A SWAP — and conflating the two is a mistake worth naming (2026-07-12).
  //
  //   A SWAP answers "the station is busy, I still need to do THIS slot's work right now", so it
  //   must be a synonym: the closest possible substitute (domain/swapPool). Handing the athlete a
  //   different movement there silently rewrites the workout they came to do.
  //
  //   A ROTATION is the ENGINE deliberately re-designing the slot for a fresh stimulus every third
  //   cycle. Alternating a flat bench with an incline over months is not drift — it IS the point,
  //   it is announced in the weekly update, and it is why the pool stays "same muscle, same tier".
  //
  // So the pool keeps its breadth. Two things it now inherits from the swap law:
  //   • the FAMILY gate — no cycle may ever turn a hip ABduction slot into an ADduction one, which
  //     the old "same muscle, same tier" filter would happily have done.
  //   • fidelity ORDER — it reaches for the nearest variation first and only drifts further out as
  //     it walks the pool, instead of picking whatever sat highest in the catalog file.
  const pool = exercisesForMuscle(cur.muscle)
    .filter(
      (e) =>
        e.tier === cur.tier &&
        patternFamily(e.pattern) === patternFamily(cur.pattern) &&
        !isSwapOnly(e.id) &&
        !inDay.has(e.id) &&
        e.id !== chosen.exerciseId,
    )
    .sort((a, b) => swapScore(cur, a) - swapScore(cur, b));
  if (!pool.length) return; // no real alternative — leave this workout unchanged this cycle
  let used = prefs.rotationUsed[slotId] ?? [];
  let fresh = pool.filter((e) => !used.includes(e.id));
  if (!fresh.length) {
    // The whole pool has been cycled → start over. But NOT from a blank slate: the last entry in
    // `used` is the lift this slot held one cycle ago, and wiping it lets the very next choice
    // land back on it — an A → B → A bounce across the reset boundary.
    //
    // The old code got away with a blank reset only because the pool happened to be in catalog
    // order; re-ordering it by fidelity exposed the latent bug immediately. Carry the most recent
    // lift across the reset so a lift can never return until at least two others have been used.
    const previous = used[used.length - 1];
    used = previous ? [previous] : [];
    fresh = pool.filter((e) => !used.includes(e.id));
    if (!fresh.length) {
      used = []; // a pool of exactly one — nothing else to alternate with
      fresh = pool;
    }
  }
  const next = fresh[0].id; // deterministic → the refresh is reproducible + testable
  prefs.rotations[slotId] = next;
  prefs.rotationUsed[slotId] = [...used, chosen.exerciseId]; // remember the outgoing lift
  rotatedIds.add(slotId);
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
    const female = profile.sex === 'female';
    const pool = female ? WOMEN : MEN;
    const plan = (female ? WOMEN_SPLITS : MEN_SPLITS)[n] ?? (female ? WOMEN_SPLITS : MEN_SPLITS)[3];
    const goal = profile.goal ?? 'build_muscle';
    const volume = profile.volume ?? 'moderate';
    const prefs = await loadPreferencesSafe();
    const days = plan.map((name, i) => dayFromBlueprint(i, name, pool[name] ?? [], goal, profile.age, volume));

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

    // Engine decisions → the program (finding 2): BEFORE pins + ensureSlots, each engine-managed
    // slot adopts the engine's CURRENT exercise (a stall swap or a bodyweight graduation). Doing it
    // HERE — not after ensureSlots — is what stops ensureSlots from mistaking the engine's own swap
    // for a manual replacement and RESETTING it: the program now already carries the engine's
    // exercise, so they agree. Athlete pins run AFTER, so an explicit pin still overrides the engine.
    // Only the exercise is overlaid; set count stays owned by the assembler (setsFor + the 60-min
    // cap), which a volume/goal change must be free to re-derive. Fresh / un-swapped slots: no-op.
    const engSlots = await currentSlots().catch((e): Record<string, V4SlotView> => {
      void track('engine_error', { op: 'currentSlots', message: String(e) });
      return {};
    });
    const swappedDays = new Set<string>();
    for (const day of days) {
      for (const slot of day.slots) {
        const eng = slot.engineSlotId ? engSlots[slot.engineSlotId] : undefined;
        if (eng && eng.exerciseId !== slot.exerciseId) {
          slot.exerciseId = eng.exerciseId;
          swappedDays.add(day.id);
        }
      }
    }

    // PERIODIC REFRESH: at a NEW 3-week cycle, rotate ONE non-pinned lift per workout (variety +
    // plateau-breaking). Then APPLY the durable rotations on top of the blueprint — the final word on
    // a rotated slot's exercise (an athlete pin, applied next, still wins; ensureSlots then calibrates
    // the fresh lift from the smart seed, so proven strength carries). Runs every generation but only
    // COMPUTES a new rotation once per cycle (stable within the 3 weeks).
    const refreshWeek = trainingWeekNumber(profile.memberSince, Date.now());
    const cycleIndex = Math.floor((refreshWeek - 1) / REFRESH_CYCLE_WEEKS);
    if (prefs.lastRotationCycle < 0) {
      // First program: the opening 3-week cycle IS the blueprint — establish the baseline without
      // rotating; the first refresh lands at the next cycle boundary (~week 4).
      prefs.lastRotationCycle = cycleIndex;
      await db.savePreferences(prefs).catch(() => {});
    } else if (cycleIndex > prefs.lastRotationCycle) {
      const rotatedIds = new Set<string>();
      for (const d of days) rotateOneInDay(d, engSlots, prefs, rotatedIds);
      prefs.lastRotationCycle = cycleIndex;
      await db.savePreferences(prefs).catch(() => {});
    }
    for (const day of days) {
      for (const slot of day.slots) {
        const rotated = slot.engineSlotId ? prefs.rotations[slot.engineSlotId] : undefined;
        const ex = exerciseById(slot.exerciseId);
        if (rotated && ex && !prefs.pinsByMuscle[ex.muscle] && rotated !== slot.exerciseId) {
          slot.exerciseId = rotated;
          swappedDays.add(day.id);
        }
      }
    }

    for (const d of days) applyPins(d, prefs.pinsByMuscle); // athlete pin overrides the rotation + blueprint
    addWeeklyCore(days, n); // one supplemental core block, last, upper-preferred
    // A swap may have changed a lift's equipment → re-cluster THAT day so the athlete still works one
    // station to the end (founder); recompute its muscle line. Un-swapped days keep their order.
    for (const d of days) {
      if (swappedDays.has(d.id)) {
        d.slots = reclusterDaySlots(d.slots);
        d.muscleGroups = [...new Set(d.slots.map((s) => exerciseById(s.exerciseId)?.muscle).filter((m): m is MuscleGroup => !!m))];
      }
    }
    for (const d of days) enforceTimeCap(d); // prescribed work ≤ 60 min (warm-ups excluded)
    for (const d of days) applyExerciseOrder(d, prefs.exerciseOrderByWorkout[d.key ?? '']); // athlete order
    const ordered = applyWorkoutOrder(days, prefs.workoutOrder); // athlete-owned workout order
    const program = { id: 'program_v1', frequency: n, days: ordered };
    // v4: ensure durable per-slot engine state exists for this program (idempotent; preserves state
    // across regen). The locked set is the source of truth for slot.locked (Lock System).
    const lockedSet = new Set(prefs.lockedSlots);
    const eprofile = toEngineProfile({ ...profile, goal, daysPerWeek: n });
    const history = await loadHistorySafe();
    await ensureSlots(program, eprofile, history, (id) => smartSeed(id, profile, history), lockedSet).catch((e) =>
      // Finding 8: a persisted-state failure must be OBSERVABLE, not silent — otherwise the slot
      // state silently desyncs from the program and the next read cold-starts with no signal.
      void track('engine_error', { op: 'ensureSlots', message: String(e) }),
    );
    // Lock System: annotate each slot's lock by its durable engineSlotId (stable across the overlay +
    // re-cluster). Core / unmapped slots have no engineSlotId and stay unlocked.
    for (const day of program.days) {
      for (const slot of day.slots) {
        if (slot.engineSlotId != null) slot.locked = lockedSet.has(slot.engineSlotId);
      }
    }
    return program;
  },

  async sessionTargets({ programDayId }): Promise<SetTarget[]> {
    void programDayId; // targets are keyed by exercise; the screen picks the day's slots
    const profile = await loadProfileSafe();
    const goal = profile.goal ?? 'build_muscle';
    const history = await loadHistorySafe();
    const out: SetTarget[] = [];

    // v4: advance the engine for any completed weeks, then source the prescription from the
    // durable per-slot state. Exercises without an engine slot (swap-only) fall back to the seed.
    const program = await db.loadProgram();
    const eprofile = toEngineProfile({ ...profile, goal, daysPerWeek: program?.frequency ?? 4 });
    const seedFor = (id: string) => smartSeed(id, profile, history);
    const prefs = await loadPreferencesSafe(); // Lock System: locked slots gate engine swaps at rollover
    // The bucket the athlete is actually executing (null pre-upgrade). The engine advances WITH it,
    // never ahead of it — a mid-week signup's extended first bucket must not get a mid-plan load
    // change (weekCadence.firstBucketOpen).
    const bucketOpenMs = (await db.loadWeekOpen().catch(() => null)) ?? undefined;
    if (program)
      await maybeAdvance(program, eprofile, history, seedFor, new Set(prefs.lockedSlots), Date.now(), bucketOpenMs).catch((e) =>
        void track('engine_error', { op: 'maybeAdvance', message: String(e) }),
      );
    // Finding 8: currentTargets failing means EVERY exercise silently falls back to cold-start
    // below. Keep the safe fallback (never crash a workout), but emit telemetry so the cold-start
    // is observable rather than an invisible full reset.
    const targets = await currentTargets().catch((e): Record<string, { weight: number | null; reps: number }> => {
      void track('engine_error', { op: 'currentTargets', message: String(e) });
      return {};
    });
    // Reason lines (finding 4): from WEEK 2 on, surface the engine's per-lift decision — did the load
    // go up or down vs the athlete's last logged weight — so the WHY sheet, Home's "lifts up", and
    // Well Done reflect what Hush actually did. WEEK 1 is the learning week: silent (the WHY sheet
    // shows the learning note instead). Attached to the first set only (the ratified convention).
    // displayWeekNumber (not the raw calendar count): a mid-week signup's extended first bucket is
    // still week 1 — the same gate the WHY sheet uses, so the two can never disagree.
    const week = displayWeekNumber(profile.memberSince, bucketOpenMs ?? null, Date.now());
    const lastLogged = new Map<string, number>();
    for (const sess of history) for (const set of sess.sets) if (set.actualWeight != null && !lastLogged.has(set.exerciseId)) lastLogged.set(set.exerciseId, set.actualWeight);

    for (const ex of EXERCISES) {
      const t = targets[ex.id];
      const weight = t ? t.weight : smartSeed(ex.id, profile, history);
      const reps = t ? t.reps : repsFor(ex.tier, goal, profile.age);
      let reasonType: SetTarget['reasonType'];
      let reasonDelta: number | undefined;
      if (week >= 2 && weight != null) {
        const prev = lastLogged.get(ex.id);
        if (prev != null && prev !== weight) {
          reasonType = weight > prev ? 'increase' : 'decrease';
          reasonDelta = Math.round((weight - prev) * 10) / 10;
        }
      }
      for (let s = 0; s < MAX_SETS; s++)
        out.push({ exerciseId: ex.id, setIndex: s, recommendedWeight: weight, recommendedReps: reps, reasonType: s === 0 ? reasonType : undefined, reasonDelta: s === 0 ? reasonDelta : undefined });
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

  async setExercisePreference({ toExercise }: { capability: Capability; fromExercise: string; toExercise: string; reason?: string }) {
    // Pin the athlete's choice by MUSCLE (swaps are muscle-scoped), so a weekly regeneration
    // honors it. The slot's capability is preserved automatically (muscle ⊂ capability).
    const muscle = exerciseById(toExercise)?.muscle;
    if (!muscle) return;
    await editPreferences((p) => {
      p.pinsByMuscle[muscle] = toExercise;
    });
  },
  async restoreExercisePreference({ capability }: { capability: Capability }) {
    await editPreferences((p) => {
      for (const muscle of Object.keys(p.pinsByMuscle)) {
        if (exercisesForMuscle(muscle as MuscleGroup)[0]?.capability === capability) delete p.pinsByMuscle[muscle];
      }
    });
  },
  async setSlotLock({ slotId, locked }: { slotId: string; locked: boolean }) {
    // Lock System: the lock belongs to the durable engine slotId, so it survives weekly
    // regeneration and manual replacement. ensureSlots reconciles the engine state from this set.
    await editPreferences((p) => {
      const set = new Set(p.lockedSlots);
      if (locked) set.add(slotId);
      else set.delete(slotId);
      p.lockedSlots = [...set];
    });
  },
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
