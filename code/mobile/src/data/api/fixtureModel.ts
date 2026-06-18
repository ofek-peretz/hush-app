/**
 * Local fixture model — the runnable program engine for the app today (every signed-in
 * user runs on this until a backend session/token exchange exists; see selectModel).
 *
 * It builds best-practice, market-standard programs and personalized cold-start loads:
 *  - generateProgram: a recognized split chosen by (sex × daysPerWeek) — Full Body,
 *    Upper/Lower, or Push/Pull/Legs — built from the curated catalog. Women's splits
 *    carry the lower-body / glute emphasis they typically train for.
 *  - sessionTargets: starting weights personalized by sex × bodyweight × experience
 *    (conservative — "weights start light, deliberate"), reps by goal × exercise tier.
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
const SETS_PER_EXERCISE = 3;

// Post-calibration demonstrative decisions so every voice surface is exercisable: an
// increase (with forecast), a decrease, and a hard-no hold (with a dated forecast).
const ADVISORY_DECISION: Record<
  string,
  { kind: 'increase' | 'decrease' | 'hold'; delta?: number; weeks?: number }
> = {
  bb_bench_press: { kind: 'increase', delta: 2.5 },
  bb_back_squat: { kind: 'decrease', delta: 5 },
  bb_overhead_press: { kind: 'hold', weeks: 2 },
};

// ───────────────────────────── split library (market-standard) ─────────────────────────────
// Each day = a recognized session built from the catalog. Men's and women's pools differ:
// women's days carry the lower-body / glute emphasis (hip thrust, RDL, split squat, glute
// bridge, pull-through) typical of how women train.

const MEN: Record<string, string[]> = {
  'Full Body A': ['bb_back_squat', 'bb_bench_press', 'bb_row', 'bb_overhead_press', 'leg_curl'],
  'Full Body B': ['bb_deadlift', 'incline_db_press', 'lat_pulldown', 'db_shoulder_press', 'leg_extension'],
  'Full Body C': ['front_squat', 'db_bench_press', 'cable_row', 'lateral_raise', 'bb_curl', 'triceps_pushdown'],
  'Upper A': ['bb_bench_press', 'bb_row', 'bb_overhead_press', 'lat_pulldown', 'bb_curl', 'triceps_pushdown'],
  'Lower A': ['bb_back_squat', 'bb_rdl', 'leg_press', 'leg_curl', 'leg_extension'],
  'Upper B': ['incline_bb_press', 'cable_row', 'db_shoulder_press', 'pull_up', 'hammer_curl', 'overhead_triceps_ext'],
  'Lower B': ['bb_deadlift', 'hack_squat', 'walking_lunge', 'leg_curl', 'leg_extension'],
  'Push A': ['bb_bench_press', 'bb_overhead_press', 'incline_db_press', 'lateral_raise', 'triceps_pushdown'],
  'Pull A': ['bb_row', 'lat_pulldown', 'cable_row', 'face_pull', 'bb_curl'],
  'Legs A': ['bb_back_squat', 'bb_rdl', 'leg_press', 'leg_curl', 'leg_extension'],
  'Push B': ['incline_bb_press', 'db_shoulder_press', 'chest_dip', 'cable_lateral_raise', 'overhead_triceps_ext'],
  'Pull B': ['pull_up', 't_bar_row', 'cable_row', 'rear_delt_fly', 'hammer_curl'],
  'Legs B': ['front_squat', 'hip_thrust', 'hack_squat', 'walking_lunge', 'leg_curl'],
};

const WOMEN: Record<string, string[]> = {
  'Full Body A': ['bb_back_squat', 'hip_thrust', 'db_bench_press', 'lat_pulldown', 'leg_curl'],
  'Full Body B': ['bb_rdl', 'bulgarian_split_squat', 'db_shoulder_press', 'cable_row', 'glute_bridge'],
  'Full Body C': ['hip_thrust', 'goblet_squat', 'incline_db_press', 'lat_pulldown', 'leg_extension'],
  'Upper A': ['db_bench_press', 'lat_pulldown', 'db_shoulder_press', 'cable_row', 'lateral_raise'],
  'Upper B': ['incline_db_press', 'cable_row', 'lateral_raise', 'face_pull', 'bb_curl'],
  'Lower A': ['hip_thrust', 'bb_back_squat', 'bb_rdl', 'leg_curl', 'cable_pull_through'],
  'Lower B': ['bulgarian_split_squat', 'hip_thrust', 'leg_press', 'leg_curl', 'glute_bridge'],
  'Lower C': ['bb_rdl', 'hip_thrust', 'walking_lunge', 'leg_extension', 'cable_pull_through'],
  'Push': ['db_bench_press', 'db_shoulder_press', 'incline_db_press', 'lateral_raise', 'triceps_pushdown'],
  'Pull': ['lat_pulldown', 'cable_row', 'face_pull', 'bb_curl', 'rear_delt_fly'],
  'Legs A': ['hip_thrust', 'bb_rdl', 'bb_back_squat', 'leg_curl', 'cable_pull_through'],
  'Legs B': ['bulgarian_split_squat', 'leg_press', 'hip_thrust', 'walking_lunge', 'leg_extension'],
};

// daysPerWeek → ordered day names. Men favor PPL at high frequency; women carry an extra
// lower/glute day (the split they typically prefer).
const MEN_SPLITS: Record<number, string[]> = {
  1: ['Full Body A'],
  2: ['Full Body A', 'Full Body B'],
  3: ['Full Body A', 'Full Body B', 'Full Body C'],
  4: ['Upper A', 'Lower A', 'Upper B', 'Lower B'],
  5: ['Push A', 'Pull A', 'Legs A', 'Upper A', 'Lower A'],
  6: ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B'],
};
const WOMEN_SPLITS: Record<number, string[]> = {
  1: ['Lower A'],
  2: ['Lower A', 'Upper A'],
  3: ['Lower A', 'Upper A', 'Lower B'],
  4: ['Lower A', 'Upper A', 'Lower B', 'Upper B'],
  5: ['Lower A', 'Upper A', 'Lower B', 'Upper B', 'Legs A'],
  6: ['Lower A', 'Upper A', 'Lower B', 'Upper B', 'Legs A', 'Legs B'],
};

const CAP_MUSCLE: Record<Capability, string> = {
  horizontal_push: 'Chest',
  horizontal_pull: 'Back',
  vertical_push: 'Shoulders',
  knee_dominant: 'Quads',
  hip_dominant: 'Glutes',
};

function dayFromBlueprint(key: string, index: number, name: string, exerciseIds: string[]): ProgramDay {
  const slots: Slot[] = exerciseIds
    .map((exerciseId) => exerciseById(exerciseId))
    .filter((e): e is Exercise => !!e)
    .map((ex) => ({ capability: ex.capability, exerciseId: ex.id, setCount: SETS_PER_EXERCISE }));
  const muscleGroups = [...new Set(slots.map((s) => CAP_MUSCLE[s.capability]))];
  return { id: `day_${index}`, name, muscleGroups, isRest: false, slots, key: String(index), completed: false };
}

// ───────────────────────────── cold-start starting weights ─────────────────────────────
const EXP_FACTOR: Record<Experience, number> = { beginner: 0.78, intermediate: 1.0, advanced: 1.22 };
const UPPER: Capability[] = ['horizontal_push', 'horizontal_pull', 'vertical_push'];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Conservative personalized starting load (kg), or null for bodyweight movements. */
function startingWeight(ex: Exercise, profile: Pick<Profile, 'sex' | 'weightKg' | 'experience'>): number | null {
  if (ex.bodyweight || ex.baseKg == null) return null;
  const bw = profile.weightKg ?? 75;
  const exp = EXP_FACTOR[profile.experience ?? 'beginner']; // unknown → conservative
  const bwFactor = ex.bwScaled ? clamp(bw / 75, 0.7, 1.45) : 1;
  const sexFactor =
    profile.sex === 'female' ? (UPPER.includes(ex.capability) ? 0.62 : 0.72) : 1;
  let kg = ex.baseKg * bwFactor * sexFactor * exp;
  // Round to a loadable increment; barbell compounds never below an empty bar.
  const step = kg >= 20 ? 2.5 : 1;
  kg = Math.round(kg / step) * step;
  if (ex.equipment === 'barbell' && ex.tier === 'compound') kg = Math.max(kg, 20);
  return Math.max(kg, step);
}

function repsFor(ex: Exercise, goal: Goal): number {
  if (ex.tier === 'isolation') return goal === 'get_stronger' ? 8 : 12;
  return goal === 'get_stronger' ? 5 : 8; // build_muscle / general_fitness
}

async function loadProfileSafe(): Promise<Pick<Profile, 'sex' | 'weightKg' | 'experience' | 'goal'>> {
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
    const days = plan.map((name, i) => dayFromBlueprint(name, i, name, pool[name] ?? []));
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
      const reps = repsFor(ex, goal);
      const decision = advisory ? ADVISORY_DECISION[ex.id] : undefined;

      for (let s = 0; s < SETS_PER_EXERCISE; s++) {
        const t: SetTarget = { exerciseId: ex.id, setIndex: s, recommendedWeight: seed, recommendedReps: reps };

        // Reason + forecast on the first working set of a changed exercise (post-calibration).
        if (decision && seed != null && s === 0) {
          if (decision.kind === 'increase') {
            t.recommendedWeight = seed + (decision.delta ?? 2.5);
            t.reasonType = 'increase';
            t.reasonDelta = decision.delta ?? 2.5;
            t.forecast = {
              type: 'increase',
              capability: ex.capability,
              predictedValue: t.recommendedWeight,
              predictedReps: reps,
              dueSessionOrDate: 'same-session',
            };
          } else if (decision.kind === 'decrease') {
            t.recommendedWeight = seed - (decision.delta ?? 5);
            t.reasonType = 'decrease';
            t.reasonDelta = decision.delta ?? 5;
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
          if (decision.kind === 'increase') t.recommendedWeight = seed + (decision.delta ?? 2.5);
          if (decision.kind === 'decrease') t.recommendedWeight = seed - (decision.delta ?? 5);
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
