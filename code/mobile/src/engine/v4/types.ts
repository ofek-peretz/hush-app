/**
 * Hush v4 engine — data structures, enums, defaults, validators (Handoff Artifact 2.2).
 *
 * The engine is a deterministic PURE function of (profile, slot states, global state, completed
 * week, library, constants) → (next slot prescriptions, updated state, explanations). It holds NO
 * subjective/affective state and reads NO wall-clock, RNG, or external state (invariants I-24/I-25,
 * I-41). The only time-based fact is `days_since_last_session`.
 *
 * STATE GRANULARITY (approved C-1, 2026-06-24): v4 state is keyed per program SLOT, not per
 * exercise id. The slot is the durable progression entity — replacing the exercise inside it keeps
 * the slot's continuity (id, pattern, order, lock) while the exercise-scoped fields (load, e1RM
 * history, rep_target, calibrating, tenure, miss_streak …) re-initialize, because demonstrated
 * capability is physically per-exercise and a swapped lift starts CALIBRATING (Frozen Spec §8).
 */
import type { Goal as AppGoal, Experience as AppExperience } from '@/data/local/models';
import type { Pattern, TrainingAge, EngineGoal, Equipment, LeverTag } from './constants';
import { REP_RANGE_BY_GOAL } from './constants';

export type { Pattern, TrainingAge, EngineGoal, Equipment, LeverTag } from './constants';

// ───────────────────────────── Profile (engine view) ─────────────────────────────
// Immutable within a planning cycle. variety_preference & gym_busyness are ASSEMBLER/UX inputs
// only (Handoff 2.2) — they must not enter any progression/safety decision.
export interface EngineProfile {
  sex: 'male' | 'female';
  age: number; // 13–100
  bodyweight_kg: number; // 30–300
  training_age: TrainingAge;
  goal: EngineGoal;
  variety_preference: 'low' | 'medium' | 'high';
  workout_count: number; // product override: 1–6
  available_equipment: Equipment[];
  gym_busyness: 'low' | 'medium' | 'high';
}

// ───────────────────────────── Per-slot state ─────────────────────────────
export interface SetRecord {
  load: number | null; // null = bodyweight
  reps: number;
  failed: boolean;
}

export interface WeekRecord {
  week: number;
  sets: SetRecord[];
  e1rm_week: number;
  volume_load: number;
  completed_sets: number;
  prescribed_sets: number;
}

export interface SlotState {
  // ── slot-durable: survive a swap (C-1) ──
  slotId: string;
  pattern: Pattern;
  order_index: number;
  locked: boolean;

  // ── exercise-scoped: re-initialized on swap (C-1, Frozen Spec §8) ──
  current_exercise_id: string;
  current_load_kg: number | null; // null = bodyweight
  current_sets: number; // this slot's prescribed sets (pattern volume is the sum across slots — C-2)
  rep_target: number;
  rep_range: [number, number];
  tenure_weeks: number;
  flat_weeks: number;
  miss_streak: number;
  levers_tried: LeverTag[];
  hold_mode: boolean;
  weeks_since_swap: number;
  calibrating: boolean;
  calib_weeks: number;
  history: WeekRecord[]; // newest first; kept to HISTORY_KEEP
}

// ───────────────────────────── Global state ─────────────────────────────
// FORBIDDEN fields (must never exist — Handoff 2.2): any fatigue, readiness, aggression,
// trajectory, ceiling, maintenance, block_week, stored seed, satisfaction_history,
// engagement_mode, human_review_flag. injury_flag is an athlete-reported FACT, not an inference.
export interface GlobalState {
  days_since_last_session: number;
  injury_flag?: boolean;
}

// ───────────────────────────── Inputs: the completed week ─────────────────────────────
export interface SlotResult {
  slotId: string;
  pattern: Pattern;
  exercise_id: string;
  sets: SetRecord[];
  sessions_completed: number;
  sessions_planned: number;
}

// ───────────────────────────── Output ─────────────────────────────
export interface PlanSlot {
  slotId: string;
  pattern: Pattern;
  exercise_id: string;
  load_kg: number | null;
  sets: number;
  rep_target: number;
  rep_range: [number, number];
  order_index: number;
}

/** Every emitted change carries {observation, conclusion, action} + rendered text (I-26). */
export interface Explanation {
  slotId: string;
  pattern: Pattern;
  observation: string;
  conclusion: string;
  action: string;
  text: string;
}

export interface PlanResult {
  /** Per-slot prescription for the next week. The assembler (split library) maps these into the
   *  athlete's workouts; the pure engine never owns workout assembly. */
  next_slots: PlanSlot[];
  updated_slots: SlotState[];
  updated_global: GlobalState;
  explanations: Explanation[];
}

// ───────────────────────────── A single per-slot decision ─────────────────────────────
export type DecisionType =
  | 'calibrate'
  | 'progress_reps'
  | 'progress_load'
  | 'reprice'
  | 'lever_vol'
  | 'lever_load'
  | 'lever_range'
  | 'patient_hold'
  | 'hold'
  | 'deload'
  | 'adherence_hold'
  | 'absence'
  | 'swap';

export interface SlotDecision {
  slotId: string;
  pattern: Pattern;
  type: DecisionType;
  exercise_id: string;
  load_kg: number | null;
  sets: number;
  rep_target: number;
  rep_range: [number, number];
  /** Step applied on a load move (for explanation copy). */
  deltaKg?: number;
}

// ───────────────────────────── Goal / training-age mapping (C-3, C-8) ─────────────────────────────
/** User-facing goal → v4 engine goal. `toning` maps to hypertrophy (approved 2026-06-24). */
export function toEngineGoal(goal: AppGoal): EngineGoal {
  switch (goal) {
    case 'get_stronger':
      return 'strength';
    case 'general_fitness':
      return 'general_fitness';
    case 'toning':
    case 'build_muscle':
    default:
      return 'hypertrophy';
  }
}

/** App experience → v4 training age (beginner→novice). Unknown → novice (most conservative). */
export function toTrainingAge(exp: AppExperience | undefined): TrainingAge {
  switch (exp) {
    case 'intermediate':
      return 'intermediate';
    case 'advanced':
      return 'advanced';
    case 'beginner':
    default:
      return 'novice';
  }
}

// ───────────────────────────── Validation (Handoff 5.4 F-cases) ─────────────────────────────
export class EngineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineValidationError';
  }
}

const EQUIPMENT: ReadonlySet<Equipment> = new Set<Equipment>([
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
]);

/** F-invalid-profile: reject age/bodyweight/goal/equipment out of range. */
export function validateProfile(p: EngineProfile): void {
  if (p.sex !== 'male' && p.sex !== 'female') throw new EngineValidationError(`bad sex: ${p.sex}`);
  if (!Number.isFinite(p.age) || p.age < 13 || p.age > 100) throw new EngineValidationError(`age out of range: ${p.age}`);
  if (!Number.isFinite(p.bodyweight_kg) || p.bodyweight_kg < 30 || p.bodyweight_kg > 300)
    throw new EngineValidationError(`bodyweight out of range: ${p.bodyweight_kg}`);
  if (!['novice', 'intermediate', 'advanced'].includes(p.training_age))
    throw new EngineValidationError(`bad training_age: ${p.training_age}`);
  if (!['strength', 'hypertrophy', 'general_fitness'].includes(p.goal))
    throw new EngineValidationError(`bad goal: ${p.goal}`);
  if (!Number.isInteger(p.workout_count) || p.workout_count < 1 || p.workout_count > 6)
    throw new EngineValidationError(`workout_count out of range (1–6): ${p.workout_count}`);
  if (!Array.isArray(p.available_equipment) || p.available_equipment.length === 0)
    throw new EngineValidationError('available_equipment must be a non-empty list');
  for (const e of p.available_equipment) if (!EQUIPMENT.has(e)) throw new EngineValidationError(`bad equipment: ${e}`);
}

/** F-rep_target outside rep_range: the slot's rep_target must lie within its range. */
export function validateSlotState(s: SlotState): void {
  const [lo, hi] = s.rep_range;
  if (lo > hi) throw new EngineValidationError(`rep_range inverted: [${lo},${hi}]`);
  if (s.rep_target < lo || s.rep_target > hi)
    throw new EngineValidationError(`rep_target ${s.rep_target} outside range [${lo},${hi}] (slot ${s.slotId})`);
  if (s.current_load_kg != null && s.current_load_kg <= 0)
    throw new EngineValidationError(`non-positive load on slot ${s.slotId}`);
}

/** F-negative reps / negative load: reject impossible completed sets. */
export function validateSlotResult(r: SlotResult): void {
  for (const set of r.sets) {
    if (!Number.isFinite(set.reps) || set.reps < 0) throw new EngineValidationError(`negative reps in result ${r.slotId}`);
    if (set.load != null && set.load <= 0) throw new EngineValidationError(`non-positive load in result ${r.slotId}`);
  }
  if (r.sessions_planned < 0 || r.sessions_completed < 0)
    throw new EngineValidationError(`negative session counts in result ${r.slotId}`);
}

/** Convenience: the goal's starting range/target (used by cold-start seed + goal-change, C4-1). */
export function repScheme(goal: EngineGoal): { range: [number, number]; target: number } {
  return REP_RANGE_BY_GOAL[goal];
}
