/**
 * Local fixture model — runnable stand-in for the real backend (implementation/
 * api) during client development. It honors the product rules the app depends
 * on (conservative calibration loads, no reason/forecast during calibration)
 * but its internal cleverness is intentionally minimal: the model owns real
 * progression; this only lets the client loop run end-to-end offline.
 *
 * Swap this for an HTTP client that targets the backend without touching any
 * screen — both satisfy `ModelClient`.
 */
import type {
  Capability,
  PortraitSnapshot,
  ProgramChange,
  Profile,
  Program,
  ProgramDay,
  SetTarget,
  Slot,
} from '@/data/local/models';
import { EXERCISES, exerciseById } from '@/data/exercises';
import type { ActualSet, ModelClient } from './modelClient';

const CALIBRATION_SESSIONS = 7;

// In ADVISORY, a small demonstrative set of per-exercise decisions so every voice
// surface is exercisable: an increase (with forecast), a decrease, and a hard-no
// hold (with a dated forecast). Others stay silent (unchanged). The real model
// computes these; this only makes the client loop show them.
const ADVISORY_DECISION: Record<
  string,
  { kind: 'increase' | 'decrease' | 'hold'; delta?: number; weeks?: number }
> = {
  bb_bench_press: { kind: 'increase', delta: 2.5 },
  bb_back_squat: { kind: 'decrease', delta: 5 },
  bb_overhead_press: { kind: 'hold', weeks: 2 },
};

// Conservative seed loads per capability (kg) — "weights start light, deliberate".
const SEED_LOAD: Record<string, number> = {
  bb_bench_press: 40,
  bb_row: 40,
  bb_overhead_press: 25,
  bb_back_squat: 50,
  bb_rdl: 50,
};
const SEED_REPS = 8;

function trainingDay(id: string, name: string, muscleGroups: string[], exerciseIds: string[]): ProgramDay {
  const slots: Slot[] = exerciseIds.map((exerciseId) => {
    const ex = exerciseById(exerciseId)!;
    return { capability: ex.capability, exerciseId, setCount: 3 };
  });
  return { id, name, muscleGroups, isRest: false, slots };
}

function restDay(id: string, afterName: string): ProgramDay {
  return { id, name: afterName, muscleGroups: [], isRest: true, slots: [] };
}

export const fixtureModel: ModelClient = {
  async getProfile() {
    // No server identity in the fixture; the dev/offline path uses About You.
    return {};
  },

  async sessionsCompleted() {
    return null; // no backend — the client's local count is authoritative in dev
  },

  async generateProgram(profile: Profile): Promise<Program> {
    // Two full-body templates rotated across the week (V1 barbell gym scope).
    const fullA = ['bb_bench_press', 'bb_row', 'bb_back_squat'];
    const fullB = ['bb_overhead_press', 'bb_rdl', 'bb_row'];
    const templates = [
      trainingDay('day_a', 'Full A', ['Chest', 'Back', 'Legs'], fullA),
      trainingDay('day_b', 'Full B', ['Shoulders', 'Hamstrings', 'Back'], fullB),
    ];

    const days: ProgramDay[] = [];
    const n = Math.min(Math.max(profile.daysPerWeek, 1), 6);
    let lastName = 'Full A';
    for (let i = 0; i < 7; i++) {
      const trainingSoFar = days.filter((d) => !d.isRest).length;
      // Spread training days across the week, fill the rest with rest days.
      const shouldTrain = trainingSoFar < n && (i % 2 === 0 || 7 - i <= n - trainingSoFar);
      if (shouldTrain) {
        const tpl = templates[trainingSoFar % templates.length];
        // Workout key = the template index (athlete-owned workout-ordering identity).
        days.push({ ...tpl, id: `${tpl.id}_${i}`, key: String(trainingSoFar % templates.length) });
        lastName = tpl.name;
      } else {
        days.push(restDay(`rest_${i}`, lastName));
      }
    }
    return { id: 'program_v1', frequency: n, days };
  },

  async sessionTargets({ programDayId, completedSessions }): Promise<SetTarget[]> {
    void programDayId; // reserved for the real model
    const advisory = completedSessions >= CALIBRATION_SESSIONS;
    const out: SetTarget[] = [];
    for (const ex of EXERCISES) {
      const seed = SEED_LOAD[ex.id] ?? 40;
      const decision = advisory ? ADVISORY_DECISION[ex.id] : undefined;
      for (let s = 0; s < 3; s++) {
        // During calibration (or unchanged exercises): conservative seed, NO
        // reason/forecast (suppressed by the model AND the client mode gate).
        const t: SetTarget = { exerciseId: ex.id, setIndex: s, recommendedWeight: seed, recommendedReps: SEED_REPS };

        // Reason + forecast appear on the first working set of a changed exercise.
        if (decision && s === 0) {
          if (decision.kind === 'increase') {
            t.recommendedWeight = seed + (decision.delta ?? 2.5);
            t.reasonType = 'increase';
            t.reasonDelta = decision.delta ?? 2.5;
            // Every increase carries a forecast (§5.3 R11): "You'll get all N."
            t.forecast = {
              type: 'increase',
              capability: ex.capability,
              predictedValue: t.recommendedWeight,
              predictedReps: SEED_REPS,
              dueSessionOrDate: 'same-session',
            };
          } else if (decision.kind === 'decrease') {
            t.recommendedWeight = seed - (decision.delta ?? 5);
            t.reasonType = 'decrease';
            t.reasonDelta = decision.delta ?? 5;
            // Decreases carry NO forecast (§5.3 R11).
          } else if (decision.kind === 'hold') {
            // Hard-no: hold the weight, reason it, and make a HORIZONLESS forecast
            // (no timing — "You'll pass it.").
            t.reasonType = 'hold';
            t.forecast = {
              type: 'hold',
              capability: ex.capability,
              predictedValue: seed,
              predictedReps: SEED_REPS,
              dueSessionOrDate: 'open',
            };
          }
        }
        // Subsequent sets of a changed exercise inherit the new load, no reason.
        if (decision && s > 0) {
          if (decision.kind === 'increase') t.recommendedWeight = seed + (decision.delta ?? 2.5);
          if (decision.kind === 'decrease') t.recommendedWeight = seed - (decision.delta ?? 5);
        }
        out.push(t);
      }
    }
    return out;
  },

  async recordSession(_args: { programDayId: string; sets: ActualSet[]; earlyFinish: boolean }) {
    // No-op in the fixture; the real backend ingests actuals here.
  },

  async replaceBlock(_args: { blockId: string; fromExercise: string; toExercise?: string }) {
    // No-op in the fixture; the real backend persists the preference (R18).
  },

  async portraitSnapshot({ completedSessions }): Promise<PortraitSnapshot> {
    // Two deterministic reference points so the Portrait + Compare + threshold
    // flows are exercisable. The real model supplies real per-capability scores.
    const baseline = completedSessions < 7;
    // Baseline: hip hinge is the weakest of the five. Unlock: hip hinge has
    // become the strongest and horizontal pull is the weakest ACTIONABLE one —
    // so the commitment reads "hip hinge strongest, horizontal pull most
    // untapped" and the eight-week forecast binds to horizontal pull.
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
    // Calibration shows NO change line (silence, §5.5 R7).
    if (completedSessions < CALIBRATION_SESSIONS) return [];
    const now = new Date().toISOString();
    return [
      // Capability/load language over body-part shorthand (ratified).
      { id: 'pc_load', kind: 'load', capabilityOrTarget: 'chest load', appliedAt: now },
      { id: 'pc_frame', kind: 'frame', capabilityOrTarget: 'hip hinge', appliedAt: now },
    ];
  },
  // C5: program-change responses are recorded as trust-measurement events (telemetry →
  // athlete_event), never as model mutations — so there is no undo/veto model method.

  // Program Ownership Contract: the fixture has no backend preference log; the local program
  // edit (appStore) is the dev source of truth, so these are no-ops here. The HTTP client
  // persists them to the append-only server log.
  async setExercisePreference(_args: { capability: Capability; fromExercise: string; toExercise: string; reason?: string }) {},
  async restoreExercisePreference(_args: { capability: Capability }) {},
  async setSubstitute(_args: { primaryExercise: string; substituteExercise?: string; remove?: boolean }) {},
  async setBackup(_args: { primaryExercise: string; backupExercise?: string; remove?: boolean }) {},
  async setOrder(_args: { scope: 'exercise' | 'workout'; order: string[]; capability?: Capability }) {},
  async markEquipmentOccupied(_args: { blockId: string }) {},
  async weeklyRest() {
    return false; // dev/offline — the local program is always trainable
  },
};
