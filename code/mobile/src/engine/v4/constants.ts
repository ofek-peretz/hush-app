/**
 * Hush Training Engine v4 — constants (Frozen Spec §12 / Handoff Artifact 2.2).
 *
 * These are the EXACT values from the frozen spec. They are the only tunable surface of the
 * engine; nothing else modulates a decision. There is deliberately NO aggression dial, NO
 * fatigue/readiness scalar, and NO trajectory/ceiling parameter — those concepts were removed
 * by evidence and must never reappear (Handoff §1.2, invariants I-30..I-41).
 *
 * Product overrides in force (approved 2026-06-24, see HUSH_V4_MIGRATION_PLAN.md §6):
 *   • VERTICAL_PULL is a first-class engine pattern (the engine progresses 6 patterns).
 *   • CORE is an ASSEMBLER-level accessory, NOT an engine pattern — it has no progression
 *     state, reprice, calibration, swap, miss-streak, or e1RM tracking. The CORE rep-range
 *     and volume figures below are consumed only by the assembler, never by the engine core.
 *   • workout_count spans 1..6 (the split library), not v4's reference 2..4.
 */

/** The SIX movement patterns the v4 engine progresses (CORE is excluded — accessory only). */
export type Pattern =
  | 'HORIZONTAL_PUSH'
  | 'HORIZONTAL_PULL'
  | 'VERTICAL_PUSH'
  | 'VERTICAL_PULL'
  | 'KNEE_DOMINANT'
  | 'HIP_DOMINANT';

/** Canonical pattern order — the deterministic final tie-break for volume allocation (I-5b)
 *  and assembler ordering (I-43). Never reorder. */
export const PATTERNS: readonly Pattern[] = [
  'HORIZONTAL_PUSH',
  'HORIZONTAL_PULL',
  'VERTICAL_PUSH',
  'VERTICAL_PULL',
  'KNEE_DOMINANT',
  'HIP_DOMINANT',
] as const;

/** v4 training age (the app's `experience` maps beginner→novice). */
export type TrainingAge = 'novice' | 'intermediate' | 'advanced';

/** v4 internal goal (the user-facing goal maps onto this — see goal map). */
export type EngineGoal = 'strength' | 'hypertrophy' | 'general_fitness';

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';

/** A stall lever, applied at most one per slot per week, in this order (Handoff rule 8). */
export type LeverTag = 'vol' | 'load' | 'range';

export interface Constants {
  TREND_BAND: number;
  ADHERENCE_MIN: number;
  ABSENCE_DAYS: number;
  STALL_WINDOW: Record<TrainingAge, number>;
  MISS_ESCALATE: number;
  RAIL_HEADROOM: number;
  SESSION_SET_CAP: number;
  DELOAD_LOAD: number;
  DELOAD_SETS: number;
  LOAD_STEP_CAP: number;
  PATIENT_PROBE_EVERY: number;
  SWAP_MIN_TENURE: number;
  /** Weeks an unused exercise must wait before it can be re-selected as a swap target. */
  SWAP_REUSE_WEEKS: number;
  /** Weeks a slot must wait after a swap before another swap is allowed. */
  SWAP_COOLDOWN_WEEKS: number;
  VOL_FLOOR: Record<TrainingAge, number>;
  VOL_CEIL: Record<TrainingAge, number>;
  STARTING_VOL_MAJOR: Record<TrainingAge, number>;
  /** History records retained per slot. */
  HISTORY_KEEP: number;
}

export const DEFAULTS: Constants = {
  TREND_BAND: 0.02,
  ADHERENCE_MIN: 0.67,
  ABSENCE_DAYS: 10,
  STALL_WINDOW: { novice: 2, intermediate: 4, advanced: 6 },
  MISS_ESCALATE: 3,
  RAIL_HEADROOM: 0.03, // rail allows implied e1RM up to +3% beyond best demonstrated (one step)
  SESSION_SET_CAP: 22, // max working sets/session ≈ 60-65 min
  DELOAD_LOAD: 0.85,
  DELOAD_SETS: 0.5,
  LOAD_STEP_CAP: 0.1, // a single load jump may not exceed 10% of current load
  PATIENT_PROBE_EVERY: 4,
  SWAP_MIN_TENURE: 4, // weeks an unlocked exercise must run before it can be replaced
  SWAP_REUSE_WEEKS: 8,
  SWAP_COOLDOWN_WEEKS: 4,
  VOL_FLOOR: { novice: 4, intermediate: 6, advanced: 8 },
  VOL_CEIL: { novice: 12, intermediate: 18, advanced: 22 },
  STARTING_VOL_MAJOR: { novice: 8, intermediate: 10, advanced: 12 },
  HISTORY_KEEP: 6,
};

/** Rep range and starting rep_target per goal (Frozen Spec §4.2). */
export const REP_RANGE_BY_GOAL: Record<EngineGoal, { range: [number, number]; target: number }> = {
  strength: { range: [3, 6], target: 5 },
  hypertrophy: { range: [8, 12], target: 8 },
  general_fitness: { range: [6, 12], target: 8 },
};

/** Alternate range for the §8 range-change variety lever: [8,12]↔[4,6], [5,8]↔[8,12]. */
export const RANGE_ALTERNATE: Array<{ from: [number, number]; to: [number, number] }> = [
  { from: [8, 12], to: [4, 6] },
  { from: [4, 6], to: [8, 12] },
  { from: [5, 8], to: [8, 12] },
];

// ── Accessory-only (CORE) — consumed by the assembler, NEVER by the engine core ──
/** CORE accessory rep range (Frozen Spec §4.2 CORE [10,15]@12). Assembler display only. */
export const CORE_REP_RANGE: { range: [number, number]; target: number } = { range: [10, 15], target: 12 };
/** CORE accessory set count band (Frozen Spec §4.1 CORE 6/8/10, §7 ceil 12/16/20). Assembler only. */
export const CORE_SETS_DEFAULT = 3; // product override: 3–4 sets, accessory finisher
