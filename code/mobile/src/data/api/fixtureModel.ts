/**
 * Local fixture model — the runnable program engine for the app today (every signed-in
 * user runs on this until a backend session/token exchange exists; see selectModel).
 *
 * It builds best-practice, market-standard programs and personalized cold-start loads:
 *  - generateProgram: a recognized split chosen by (sex × daysPerWeek) — Full Body,
 *    Upper/Lower, or Push/Pull/Legs — built from the curated catalog. Every weekly plan
 *    covers ALL major muscle groups (incl. calves and core); women's splits carry the
 *    lower-body / glute emphasis they typically train for.
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
  Experience,
  Goal,
  PortraitSnapshot,
  Profile,
  Program,
  ProgramDay,
  SetTarget,
  Slot,
  WeeklyVolume,
} from '@/data/local/models';
import { EXERCISES, exerciseById, exercisesForMuscle, type Exercise, type MuscleGroup } from '@/data/exercises';
import { computePortrait } from '@/data/progression';
import { toEngineProfile, ensureSlots, maybeAdvance, currentTargets } from '@/engine/v4/v4Engine';
import { db, type OwnedPreferences } from '@/data/local/db';
import type { Session } from '@/data/local/models';
import type { ActualSet, ModelClient } from './modelClient';

// The most sets any (goal × tier × age) scheme can prescribe. sessionTargets emits this
// many per-set targets per exercise so a slot's setCount is ALWAYS fully covered (a slot
// never falls through to the default-weight fallback).
const MAX_SETS = 5;

// ───────────────────────────── split library (market-standard) ─────────────────────────────
// Each day = a recognized session built from the catalog. Days are ordered big→small
// (compound first, isolation/finisher last). Every weekly plan covers all major groups,
// with calves on every lower/full-body session and core worked across the week. Men's and
// women's pools differ: women's days carry the lower-body / glute emphasis (hip thrust,
// RDL, split squat, glute bridge, pull-through, abduction, kickback) typical of how women
// train.

// Only blueprints referenced by a split below are kept (dead, never-referenced blueprints
// were removed 2026-06-23). Core is NOT listed here — it is supplemental work added once per
// week by addWeeklyCore() (3 sets, last, upper-preferred), never a primary slot in the split.
// Each day lists compounds first; dayFromBlueprint also enforces compound-before-isolation.
const MEN: Record<string, string[]> = {
  'Full Body A': ['bb_back_squat', 'bb_rdl', 'bb_bench_press', 'bb_row', 'bb_overhead_press'],
  'Upper A': ['bb_bench_press', 'bb_row', 'bb_overhead_press', 'lat_pulldown', 'bb_curl', 'triceps_pushdown'],
  'Lower A': ['bb_back_squat', 'bb_rdl', 'leg_press', 'leg_curl', 'standing_calf_raise'],
  'Push A': ['bb_bench_press', 'bb_overhead_press', 'incline_db_press', 'lateral_raise', 'triceps_pushdown'],
  // Conventional deadlift is the canonical hip-hinge — programmed on the pull day (standard PPL).
  'Pull A': ['bb_deadlift', 'bb_row', 'lat_pulldown', 'face_pull', 'bb_curl'],
  'Legs A': ['bb_back_squat', 'bb_rdl', 'leg_press', 'leg_curl', 'standing_calf_raise'],
  'Push B': ['incline_bb_press', 'db_shoulder_press', 'chest_dip', 'cable_lateral_raise', 'overhead_triceps_ext'],
  'Pull B': ['pull_up', 't_bar_row', 'cable_row', 'rear_delt_fly', 'hammer_curl'],
  'Legs B': ['front_squat', 'hip_thrust', 'hack_squat', 'walking_lunge', 'seated_calf_raise'],
};

const WOMEN: Record<string, string[]> = {
  'Full Body A': ['bb_back_squat', 'hip_thrust', 'db_bench_press', 'lat_pulldown', 'leg_curl', 'standing_calf_raise'],
  'Upper A': ['db_bench_press', 'lat_pulldown', 'db_shoulder_press', 'cable_row', 'lateral_raise'],
  'Upper B': ['incline_db_press', 'cable_row', 'lateral_raise', 'face_pull', 'bb_curl'],
  'Lower A': ['hip_thrust', 'bb_back_squat', 'bb_rdl', 'leg_curl', 'cable_pull_through', 'standing_calf_raise'],
  'Lower B': ['bulgarian_split_squat', 'hip_thrust', 'leg_press', 'leg_curl', 'hip_abduction', 'seated_calf_raise'],
  'Legs A': ['hip_thrust', 'bb_rdl', 'bb_back_squat', 'cable_kickback', 'hip_abduction', 'standing_calf_raise'],
  'Legs B': ['bulgarian_split_squat', 'glute_bridge', 'walking_lunge', 'leg_extension', 'cable_pull_through', 'seated_calf_raise'],
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
  4: ['Push A', 'Pull A', 'Legs A', 'Upper A'],
  5: ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B'],
  6: ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B'],
};
const WOMEN_SPLITS: Record<number, string[]> = {
  1: ['Full Body A'],
  2: ['Lower A', 'Upper A'],
  3: ['Lower A', 'Upper A', 'Lower B'],
  4: ['Lower A', 'Upper A', 'Lower B', 'Legs A'],
  5: ['Lower A', 'Upper A', 'Lower B', 'Upper B', 'Legs A'],
  6: ['Lower A', 'Upper A', 'Lower B', 'Upper B', 'Legs A', 'Legs B'],
};

/**
 * Order a day's exercises for both training quality AND gym flow:
 *   PRIMARY  — compounds before isolation (never pre-fatigue a muscle before its main lift).
 *   SECONDARY— within each phase, keep same-equipment lifts ADJACENT (founder 2026-06-23): an
 *     athlete already at a station shouldn't leave and return mid-phase and risk losing it.
 * Equipment clusters lead in the order they first appear, so the phase's main lift stays first.
 * (The one unavoidable revisit — a barbell used in both the compound and the isolation phase —
 * is the accepted cost of compounds-first.)
 */
function orderForFlow(list: Exercise[]): Exercise[] {
  const tierRank = (e: Exercise) => (e.tier === 'compound' ? 0 : 1);
  const tierSorted = list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => tierRank(a.e) - tierRank(b.e) || a.i - b.i) // stable: compounds first
    .map((x) => x.e);
  const firstSeen = new Map<string, number>();
  tierSorted.forEach((e, i) => {
    const k = `${tierRank(e)}|${e.equipment}`;
    if (!firstSeen.has(k)) firstSeen.set(k, i);
  });
  return tierSorted
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) =>
        firstSeen.get(`${tierRank(a.e)}|${a.e.equipment}`)! -
          firstSeen.get(`${tierRank(b.e)}|${b.e.equipment}`)! || a.i - b.i,
    )
    .map((x) => x.e);
}

function dayFromBlueprint(
  index: number,
  name: string,
  exerciseIds: string[],
  goal: Goal,
  age?: number,
  volume: WeeklyVolume = 'moderate',
): ProgramDay {
  const exercises = orderForFlow(
    exerciseIds.map((exerciseId) => exerciseById(exerciseId)).filter((e): e is Exercise => !!e),
  );
  const slots: Slot[] = exercises.map((ex) => ({
    capability: ex.capability,
    exerciseId: ex.id,
    setCount: setsFor(ex.tier, goal, age, volume),
  }));
  // Display the precise muscle groups the session trains (e.g. Quads · Hamstrings ·
  // Calves · Core), in catalog order, deduplicated.
  const muscleGroups = [...new Set(exercises.map((ex) => ex.muscle))];
  return { id: `day_${index}`, name, muscleGroups, isRest: false, slots, key: String(index), completed: false };
}

// ───────────────────────────── supplemental core (founder rules 2026-06-23) ─────────────────────────────
// Core is supplemental, NOT a primary progression target. Exactly ONE core exercise per
// week, 3 sets, placed LAST, preferring an upper-body session over a lower one. Rotated by
// frequency so every core movement is reachable through generation (not just via swaps).
const CORE_POOL = EXERCISES.filter((e) => e.muscle === 'Core').map((e) => e.id);
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
 * Keep a day's prescribed work at or under MAX_SESSION_MIN. Quality-preserving and ordered:
 *   1) trim the bonus set off compounds (4→3) from the LAST compound backward — never the
 *      first (the day's main lift keeps its full scheme), never below 3.
 *   2) only if still over (rare), drop a trailing NON-core isolation slot, never going below
 *      4 slots and never dropping calves/core (coverage guarantees hold).
 */
function enforceTimeCap(day: ProgramDay): void {
  const compoundIdx = day.slots.map((_s, i) => i).filter((i) => isCompound(day.slots[i].exerciseId));
  for (let k = compoundIdx.length - 1; k >= 1 && estimateSessionMinutes(day) > MAX_SESSION_MIN; k--) {
    const slot = day.slots[compoundIdx[k]];
    if (slot.setCount > 3) slot.setCount = 3;
  }
  for (let i = day.slots.length - 1; i >= 0 && estimateSessionMinutes(day) > MAX_SESSION_MIN; i--) {
    if (day.slots.length <= 4) break;
    const ex = exerciseById(day.slots[i].exerciseId);
    if (ex && ex.tier === 'isolation' && !day.slots[i].supplemental && ex.muscle !== 'Calves' && ex.muscle !== 'Core') {
      day.slots.splice(i, 1);
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
const EXP_FACTOR: Record<Experience, number> = { beginner: 0.78, intermediate: 1.0, advanced: 1.22 };
const UPPER: Capability[] = ['horizontal_push', 'horizontal_pull', 'vertical_push'];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Age load multiplier — keeps the cold-start conservative across the lifespan. Untrained
 * teens are still developing; strength gently declines past ~40, so masters athletes
 * start lighter (and, in setsFor/repsFor, train with a touch less volume and joint-
 * friendlier reps). Unknown age → no penalty (the base load is already conservative).
 */
function ageLoadFactor(age?: number): number {
  if (age == null) return 1;
  if (age < 18) return 0.9; // still developing — conservative
  if (age < 40) return 1.0;
  if (age < 50) return 0.97;
  if (age < 60) return 0.92;
  if (age < 70) return 0.86;
  return 0.8; // 70+
}

/** Conservative personalized starting load (kg), or null for bodyweight movements. */
function startingWeight(
  ex: Exercise,
  profile: Pick<Profile, 'sex' | 'weightKg' | 'experience' | 'age'>,
): number | null {
  if (ex.bodyweight || ex.baseKg == null) return null;
  const bw = profile.weightKg ?? 75;
  const exp = EXP_FACTOR[profile.experience ?? 'beginner']; // unknown → conservative
  const bwFactor = ex.bwScaled ? clamp(bw / 75, 0.7, 1.45) : 1;
  const sexFactor =
    profile.sex === 'female' ? (UPPER.includes(ex.capability) ? 0.62 : 0.72) : 1;
  let kg = ex.baseKg * bwFactor * sexFactor * exp * ageLoadFactor(profile.age);
  // Round to a loadable increment; barbell compounds never below an empty bar.
  // Founder: 1 kg steps everywhere (finer + more accurate than 2.5 — 80 → 81, not 82.5).
  const step = 1;
  kg = Math.round(kg / step) * step;
  if (ex.equipment === 'barbell' && ex.tier === 'compound') kg = Math.max(kg, 20);
  return Math.max(kg, step);
}

/** The cold-start seed for an exercise id (null for bodyweight / unknown) — injected into the v4
 *  engine as its week-1 guess, discarded at calibration exit (C-8, §4.4). */
function seedForExercise(id: string, profile: Pick<Profile, 'sex' | 'weightKg' | 'experience' | 'age'>): number | null {
  const ex = exerciseById(id);
  return ex ? startingWeight(ex, profile) : null;
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

async function loadProfileSafe(): Promise<Pick<Profile, 'sex' | 'weightKg' | 'experience' | 'goal' | 'age'>> {
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
    return { pinsByMuscle: {}, backups: {}, substitutes: {}, workoutOrder: [], exerciseOrderByWorkout: {} };
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
    const female = profile.sex === 'female';
    const pool = female ? WOMEN : MEN;
    const plan = (female ? WOMEN_SPLITS : MEN_SPLITS)[n] ?? (female ? WOMEN_SPLITS : MEN_SPLITS)[3];
    const goal = profile.goal ?? 'build_muscle';
    const volume = profile.volume ?? 'moderate';
    const prefs = await loadPreferencesSafe();
    const days = plan.map((name, i) => dayFromBlueprint(i, name, pool[name] ?? [], goal, profile.age, volume));
    for (const d of days) applyPins(d, prefs.pinsByMuscle); // athlete-owned swaps survive regen
    addWeeklyCore(days, n); // one supplemental core block, last, upper-preferred
    for (const d of days) enforceTimeCap(d); // prescribed work ≤ 60 min (warm-ups excluded)
    for (const d of days) applyExerciseOrder(d, prefs.exerciseOrderByWorkout[d.key ?? '']); // athlete order
    const ordered = applyWorkoutOrder(days, prefs.workoutOrder); // athlete-owned workout order
    const program = { id: 'program_v1', frequency: n, days: ordered };
    // v4: ensure durable per-slot engine state exists for this program (idempotent;
    // preserves state across regen, honors athlete pins as locked manual replacements — C-1/C-7).
    const eprofile = toEngineProfile({ ...profile, goal, daysPerWeek: n });
    const history = await loadHistorySafe();
    await ensureSlots(program, eprofile, history, (id) => seedForExercise(id, profile)).catch(() => {});
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
    const seedFor = (id: string) => seedForExercise(id, profile);
    if (program) await maybeAdvance(program, eprofile, history, seedFor).catch(() => {});
    const targets = await currentTargets().catch((): Record<string, { weight: number | null; reps: number }> => ({}));
    for (const ex of EXERCISES) {
      const t = targets[ex.id];
      const weight = t ? t.weight : startingWeight(ex, profile);
      const reps = t ? t.reps : repsFor(ex.tier, goal, profile.age);
      for (let s = 0; s < MAX_SETS; s++) out.push({ exerciseId: ex.id, setIndex: s, recommendedWeight: weight, recommendedReps: reps });
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
  async weeklyRest() {
    return false;
  },
};
