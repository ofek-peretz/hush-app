/**
 * Equipment-aware DOUBLE PROGRESSION (founder-directed 2026-06-23). The live, working
 * replacement for the disconnected score-engine: a prescription is a PURE function of the
 * athlete's own logged history + the catalog. No RIR input is needed — the rep RANGE encodes
 * effort; you add load only once you own the top of the range across all working sets.
 *
 *   • Weighted lifts: stay at a weight until every working set reaches the range TOP, then add
 *     ONE equipment step (barbell 2.5 / dumbbell 2 / machine 5 / cable 5) and reset to the
 *     bottom. Two sessions failing the bottom → deload one step. This progresses in a sensible
 *     time, never gets stuck, and only ever moves by a real, loadable increment.
 *   • Bodyweight lifts: add a rep each session toward the movement's ceiling, then surface a
 *     harder variation (progressionRule.harder) — no phantom load.
 *
 * The bottom of the range is the caller's existing per-goal rep target, so a first session
 * (no history) is byte-identical to the prior static behavior.
 */
import { exerciseById, progressionRule, LOAD_STEP_KG, exercisesForCapability } from './exercises';
import type { Capability, PortraitSnapshot, Profile, Session } from './local/models';

/** Extra reps above the goal's bottom target before a load increase is earned. */
const RANGE_SPREAD = { compound: 2, isolation: 3 } as const;

export interface Prescription {
  weight: number | null; // null = bodyweight
  reps: number; // the working-rep target (the range bottom to clear)
  increased: boolean; // load went UP vs the last session
  decreased: boolean; // load was deloaded
  deltaKg?: number; // the equipment step applied on an increase/decrease
  variationHint?: string; // bodyweight only: a harder exercise once the ceiling is owned
}

interface Performance {
  weight: number | null;
  repsPerSet: number[];
}

/** The athlete's most recent (and prior) logged performances of an exercise, newest first.
 *  `history` is expected newest-first (db.loadHistory). Working sets only — the heaviest load
 *  used that session, with the reps achieved at it (warm-ups, if ever logged, fall away). */
function performances(exerciseId: string, history: Session[]): Performance[] {
  const out: Performance[] = [];
  for (const session of history) {
    const sets = session.sets.filter((s) => s.exerciseId === exerciseId);
    if (!sets.length) continue;
    const weights = sets.map((s) => s.actualWeight);
    const top = weights.every((w) => w == null) ? null : Math.max(...weights.map((w) => w ?? -Infinity));
    const working = top == null ? sets : sets.filter((s) => (s.actualWeight ?? -Infinity) >= top);
    out.push({ weight: top, repsPerSet: working.map((s) => s.actualReps) });
  }
  return out;
}

/**
 * The next prescription for an exercise. `seedWeight` is the cold-start load (null for
 * bodyweight); `bottomReps` is the caller's per-goal working-rep target (the range bottom).
 */
export function prescribe(
  exerciseId: string,
  seedWeight: number | null,
  bottomReps: number,
  history: Session[],
): Prescription {
  const ex = exerciseById(exerciseId);
  const hold = (weight: number | null, reps: number): Prescription => ({
    weight,
    reps,
    increased: false,
    decreased: false,
  });
  if (!ex) return hold(seedWeight, bottomReps);

  const rule = progressionRule(exerciseId);
  const top = bottomReps + RANGE_SPREAD[ex.tier];
  const perfs = performances(exerciseId, history);
  const last = perfs[0];

  // ── Bodyweight: progress reps toward the ceiling, then surface a harder variation ──
  if (rule.mode === 'reps') {
    if (!last) return hold(null, bottomReps);
    const ceiling = rule.repCeiling ?? top;
    const minReps = last.repsPerSet.length ? Math.min(...last.repsPerSet) : bottomReps;
    if (minReps >= ceiling) return { ...hold(null, ceiling), variationHint: rule.harder };
    return hold(null, Math.max(bottomReps, Math.min(ceiling, minReps + 1)));
  }

  // ── Weighted: equipment-aware double progression ──
  const step = rule.loadStepKg ?? LOAD_STEP_KG[ex.equipment];
  if (!last) return hold(seedWeight, bottomReps);
  const lastW = last.weight ?? seedWeight ?? step;

  if (last.repsPerSet.length && last.repsPerSet.every((r) => r >= top)) {
    return { weight: lastW + step, reps: bottomReps, increased: true, decreased: false, deltaKg: step };
  }

  const missedBottom = (p?: Performance) =>
    !!p && p.repsPerSet.length > 0 && p.repsPerSet.some((r) => r < bottomReps);
  if (missedBottom(last) && missedBottom(perfs[1])) {
    return {
      weight: Math.max(step, lastW - step),
      reps: bottomReps,
      increased: false,
      decreased: true,
      deltaKg: step,
    };
  }

  // Mid-range (or a single miss): hold the load and chase the top next time.
  return hold(lastW, bottomReps);
}

// ─────────────────────── Capability Portrait, computed from real history ───────────────────────
// The Portrait's bars are RELATIVE strength (0–1) per capability: the athlete's best estimated
// 1RM (Epley) on that capability's lifts, against a sex/bodyweight-scaled "strong" benchmark.
// Confidence rises with how many sessions of real data back the bar; below 30 the bar is "still
// learning" (an experience-based prior until the athlete's own lifts speak). Pure & I/O-free.
const PORTRAIT_CAPS: Capability[] = [
  'horizontal_push', 'horizontal_pull', 'vertical_push', 'knee_dominant', 'hip_dominant',
];
const UPPER_CAPS = new Set<Capability>(['horizontal_push', 'horizontal_pull', 'vertical_push']);
// "Full-bar" benchmark as a multiple of bodyweight (intermediate-strong male reference).
const STANDARD_RATIO: Record<Capability, number> = {
  horizontal_push: 1.3, horizontal_pull: 1.1, vertical_push: 0.8, knee_dominant: 1.8, hip_dominant: 2.2,
};
const SEED_BAR: Record<string, number> = { beginner: 0.2, intermediate: 0.35, advanced: 0.5 };

const epley1rm = (w: number, r: number): number => w * (1 + r / 30);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export function computePortrait(
  history: Session[],
  profile: Pick<Profile, 'sex' | 'weightKg' | 'experience'>,
): Omit<PortraitSnapshot, 'timestamp'> {
  const bw = profile.weightKg ?? 75;
  const female = profile.sex === 'female';
  const seedBar = SEED_BAR[profile.experience ?? 'beginner'] ?? 0.2;
  const perCapability = {} as Record<Capability, number>;
  const confidence = {} as Record<Capability, number>;
  const stillLearning = {} as Record<Capability, boolean>;

  for (const cap of PORTRAIT_CAPS) {
    const exIds = new Set(exercisesForCapability(cap).map((e) => e.id));
    let best = 0;
    const sessionsTouched = new Set<string>();
    for (const session of history) {
      let touched = false;
      for (const set of session.sets) {
        if (!exIds.has(set.exerciseId) || set.actualWeight == null) continue;
        best = Math.max(best, epley1rm(set.actualWeight, set.actualReps));
        touched = true;
      }
      if (touched) sessionsTouched.add(session.id);
    }
    const sexF = female ? (UPPER_CAPS.has(cap) ? 0.62 : 0.72) : 1;
    const benchmark = bw * STANDARD_RATIO[cap] * sexF;
    const hasData = best > 0 && benchmark > 0;
    const bar = hasData ? clamp01(best / benchmark) : seedBar;
    const conf = hasData ? Math.min(95, sessionsTouched.size * 12) : 10;
    perCapability[cap] = Math.round(bar * 100) / 100;
    confidence[cap] = conf;
    stillLearning[cap] = conf < 30;
  }
  return { perCapability, confidence, stillLearning };
}
