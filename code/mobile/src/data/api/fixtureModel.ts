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
  ProgramChange,
  Profile,
  Program,
  ProgramDay,
  SetTarget,
  Slot,
} from '@/data/local/models';
import { EXERCISES, exerciseById, type Exercise } from '@/data/exercises';
import { db } from '@/data/local/db';
import type { ActualSet, ModelClient } from './modelClient';

const CALIBRATION_SESSIONS = 7;
// The most sets any (goal × tier × age) scheme can prescribe. sessionTargets emits this
// many per-set targets per exercise so a slot's setCount is ALWAYS fully covered (a slot
// never falls through to the default-weight fallback).
const MAX_SETS = 5;

// Post-calibration demonstrative decisions so every voice surface is exercisable: an
// increase (with forecast), a decrease, and a hard-no hold (with a dated forecast).
const ADVISORY_DECISION: Record<
  string,
  { kind: 'increase' | 'decrease' | 'hold'; delta?: number; weeks?: number }
> = {
  bb_bench_press: { kind: 'increase', delta: 1 },
  bb_back_squat: { kind: 'decrease', delta: 2 },
  bb_overhead_press: { kind: 'hold', weeks: 2 },
};

// ───────────────────────────── split library (market-standard) ─────────────────────────────
// Each day = a recognized session built from the catalog. Days are ordered big→small
// (compound first, isolation/finisher last). Every weekly plan covers all major groups,
// with calves on every lower/full-body session and core worked across the week. Men's and
// women's pools differ: women's days carry the lower-body / glute emphasis (hip thrust,
// RDL, split squat, glute bridge, pull-through, abduction, kickback) typical of how women
// train.

const MEN: Record<string, string[]> = {
  'Full Body A': ['bb_back_squat', 'bb_bench_press', 'bb_row', 'bb_overhead_press', 'standing_calf_raise', 'hanging_leg_raise'],
  'Full Body B': ['bb_deadlift', 'incline_bb_press', 'lat_pulldown', 'db_shoulder_press', 'leg_extension', 'cable_crunch'],
  'Full Body C': ['front_squat', 'db_bench_press', 'cable_row', 'lateral_raise', 'bb_curl', 'triceps_pushdown'],
  'Upper A': ['bb_bench_press', 'bb_row', 'bb_overhead_press', 'lat_pulldown', 'bb_curl', 'triceps_pushdown'],
  'Lower A': ['bb_back_squat', 'bb_rdl', 'leg_press', 'leg_curl', 'standing_calf_raise', 'hanging_leg_raise'],
  'Upper B': ['incline_bb_press', 'cable_row', 'db_shoulder_press', 'pull_up', 'hammer_curl', 'skullcrusher'],
  'Lower B': ['bb_deadlift', 'hack_squat', 'walking_lunge', 'leg_curl', 'seated_calf_raise', 'cable_crunch'],
  'Push A': ['bb_bench_press', 'bb_overhead_press', 'incline_db_press', 'lateral_raise', 'triceps_pushdown'],
  'Pull A': ['bb_row', 'lat_pulldown', 'cable_row', 'face_pull', 'bb_curl'],
  'Legs A': ['bb_back_squat', 'bb_rdl', 'leg_press', 'leg_curl', 'standing_calf_raise', 'hanging_leg_raise'],
  'Push B': ['incline_bb_press', 'db_shoulder_press', 'chest_dip', 'cable_lateral_raise', 'overhead_triceps_ext'],
  'Pull B': ['pull_up', 't_bar_row', 'cable_row', 'rear_delt_fly', 'hammer_curl'],
  'Legs B': ['front_squat', 'hip_thrust', 'hack_squat', 'walking_lunge', 'seated_calf_raise', 'ab_wheel'],
};

const WOMEN: Record<string, string[]> = {
  'Full Body A': ['bb_back_squat', 'hip_thrust', 'db_bench_press', 'lat_pulldown', 'leg_curl', 'standing_calf_raise'],
  'Full Body B': ['bb_rdl', 'bulgarian_split_squat', 'db_shoulder_press', 'cable_row', 'glute_bridge', 'hanging_leg_raise'],
  'Full Body C': ['hip_thrust', 'goblet_squat', 'incline_db_press', 'lat_pulldown', 'hip_abduction', 'cable_crunch'],
  'Upper A': ['db_bench_press', 'lat_pulldown', 'db_shoulder_press', 'cable_row', 'lateral_raise', 'hanging_leg_raise'],
  'Upper B': ['incline_db_press', 'cable_row', 'lateral_raise', 'face_pull', 'bb_curl', 'cable_crunch'],
  'Lower A': ['hip_thrust', 'bb_back_squat', 'bb_rdl', 'leg_curl', 'cable_pull_through', 'standing_calf_raise'],
  'Lower B': ['bulgarian_split_squat', 'hip_thrust', 'leg_press', 'leg_curl', 'hip_abduction', 'seated_calf_raise'],
  'Legs A': ['hip_thrust', 'bb_rdl', 'bb_back_squat', 'cable_kickback', 'hip_abduction', 'standing_calf_raise'],
  'Legs B': ['bulgarian_split_squat', 'glute_bridge', 'walking_lunge', 'leg_extension', 'cable_pull_through', 'seated_calf_raise'],
  'Push': ['db_bench_press', 'db_shoulder_press', 'incline_db_press', 'lateral_raise', 'triceps_pushdown'],
  'Pull': ['lat_pulldown', 'cable_row', 'face_pull', 'bb_curl', 'rear_delt_fly'],
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

function dayFromBlueprint(
  index: number,
  name: string,
  exerciseIds: string[],
  goal: Goal,
  age?: number,
): ProgramDay {
  const exercises = exerciseIds
    .map((exerciseId) => exerciseById(exerciseId))
    .filter((e): e is Exercise => !!e);
  const slots: Slot[] = exercises.map((ex) => ({
    capability: ex.capability,
    exerciseId: ex.id,
    setCount: setsFor(ex.tier, goal, age),
  }));
  // Display the precise muscle groups the session trains (e.g. Quads · Hamstrings ·
  // Calves · Core), in catalog order, deduplicated.
  const muscleGroups = [...new Set(exercises.map((ex) => ex.muscle))];
  return { id: `day_${index}`, name, muscleGroups, isRest: false, slots, key: String(index), completed: false };
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
 * Working sets by goal × tier, then age-adjusted. Strength/hypertrophy carry an extra
 * compound set; lighter goals stay at 3. Age 65+ trims one compound set for recovery.
 * Always ≤ MAX_SETS, so sessionTargets fully covers every slot.
 */
function setsFor(tier: Tier, goal: Goal, age?: number): number {
  const compound = tier === 'compound';
  let sets = 3;
  if (compound && (goal === 'get_stronger' || goal === 'build_muscle')) sets = 4;
  if (age != null && age >= 65 && compound) sets = Math.max(sets - 1, 3);
  return Math.min(sets, MAX_SETS);
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
    const days = plan.map((name, i) => dayFromBlueprint(i, name, pool[name] ?? [], goal, profile.age));
    return { id: 'program_v1', frequency: n, days };
  },

  async sessionTargets({ programDayId, completedSessions }): Promise<SetTarget[]> {
    void programDayId; // targets are keyed by exercise; the screen picks the day's slots
    const advisory = completedSessions >= CALIBRATION_SESSIONS;
    const profile = await loadProfileSafe();
    const goal = profile.goal ?? 'build_muscle';
    const out: SetTarget[] = [];

    for (const ex of EXERCISES) {
      const seed = startingWeight(ex, profile);
      const reps = repsFor(ex.tier, goal, profile.age);
      const decision = advisory ? ADVISORY_DECISION[ex.id] : undefined;

      // Emit MAX_SETS targets per exercise so any slot's setCount is fully covered,
      // regardless of the goal/age set scheme the program was built with.
      for (let s = 0; s < MAX_SETS; s++) {
        const t: SetTarget = { exerciseId: ex.id, setIndex: s, recommendedWeight: seed, recommendedReps: reps };

        // Reason + forecast on the first working set of a changed exercise (post-calibration).
        if (decision && seed != null && s === 0) {
          if (decision.kind === 'increase') {
            t.recommendedWeight = seed + (decision.delta ?? 1);
            t.reasonType = 'increase';
            t.reasonDelta = decision.delta ?? 1;
            t.forecast = {
              type: 'increase',
              capability: ex.capability,
              predictedValue: t.recommendedWeight,
              predictedReps: reps,
              dueSessionOrDate: 'same-session',
            };
          } else if (decision.kind === 'decrease') {
            t.recommendedWeight = seed - (decision.delta ?? 2);
            t.reasonType = 'decrease';
            t.reasonDelta = decision.delta ?? 2;
          } else if (decision.kind === 'hold') {
            t.reasonType = 'hold';
            t.forecast = {
              type: 'hold',
              capability: ex.capability,
              predictedValue: seed,
              predictedReps: reps,
              dueSessionOrDate: 'open',
            };
          }
        }
        if (decision && seed != null && s > 0) {
          if (decision.kind === 'increase') t.recommendedWeight = seed + (decision.delta ?? 1);
          if (decision.kind === 'decrease') t.recommendedWeight = seed - (decision.delta ?? 2);
        }
        out.push(t);
      }
    }
    return out;
  },

  async recordSession(_args: { programDayId: string; sets: ActualSet[]; earlyFinish: boolean }) {},

  async replaceBlock(_args: { blockId: string; fromExercise: string; toExercise?: string }) {},

  async portraitSnapshot({ completedSessions }): Promise<PortraitSnapshot> {
    const baseline = completedSessions < 7;
    const per: Record<Capability, number> = baseline
      ? { horizontal_push: 0.40, horizontal_pull: 0.38, vertical_push: 0.35, knee_dominant: 0.42, hip_dominant: 0.30 }
      : { horizontal_push: 0.62, horizontal_pull: 0.40, vertical_push: 0.30, knee_dominant: 0.55, hip_dominant: 0.82 };
    const confidence: Record<Capability, number> = baseline
      ? { horizontal_push: 45, horizontal_pull: 45, vertical_push: 45, knee_dominant: 45, hip_dominant: 45 }
      : { horizontal_push: 85, horizontal_pull: 75, vertical_push: 22, knee_dominant: 80, hip_dominant: 90 };
    const stillLearning: Record<Capability, boolean> = {
      horizontal_push: confidence.horizontal_push < 30,
      horizontal_pull: confidence.horizontal_pull < 30,
      vertical_push: confidence.vertical_push < 30,
      knee_dominant: confidence.knee_dominant < 30,
      hip_dominant: confidence.hip_dominant < 30,
    };
    return { timestamp: new Date().toISOString(), perCapability: per, confidence, stillLearning };
  },

  async programChanges({ completedSessions }): Promise<ProgramChange[]> {
    if (completedSessions < CALIBRATION_SESSIONS) return [];
    const now = new Date().toISOString();
    return [
      { id: 'pc_load', kind: 'load', capabilityOrTarget: 'chest load', appliedAt: now },
      { id: 'pc_frame', kind: 'frame', capabilityOrTarget: 'hip hinge', appliedAt: now },
    ];
  },

  async setExercisePreference(_args: { capability: Capability; fromExercise: string; toExercise: string; reason?: string }) {},
  async restoreExercisePreference(_args: { capability: Capability }) {},
  async setSubstitute(_args: { primaryExercise: string; substituteExercise?: string; remove?: boolean }) {},
  async setBackup(_args: { primaryExercise: string; backupExercise?: string; remove?: boolean }) {},
  async setOrder(_args: { scope: 'exercise' | 'workout'; order: string[]; capability?: Capability }) {},
  async markEquipmentOccupied(_args: { blockId: string }) {},
  async weeklyRest() {
    return false;
  },
};
