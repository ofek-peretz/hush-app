/**
 * Hush Engine v5 — the pure core's data model.
 *
 * The engine is a deterministic pure function of (exercise state, the completed session's sets,
 * the equipment grid) → (next prescription, updated state). It reads no wall-clock as a TRIGGER and
 * no RNG (I-24/25). `T` is the athlete's chosen rep band `[Tlo, Thi]`; progression is keyed to the
 * EXERCISE, never to a slot. See docs/canonical/ENGINE_V5_SITUATION_REGISTER.md.
 */

/** The athlete's chosen rep band. `lo` is the target (met = reps ≥ lo); `hi` is the "too light" mark. */
export interface Band {
  lo: number;
  hi: number;
}

/** One performed set — the fact the engine reads. `load` null = bodyweight. */
export interface SetPerf {
  load: number | null;
  reps: number;
  /** Seconds rested immediately before this set (L3). Absent = unknown, never zero. */
  restBeforeS?: number;
  /** The engine marked this a measurement, not work (S-60). Excluded from every decision. */
  isApproach?: boolean;
}

/** One past session's working sets on a lift, newest-first in history. */
export interface SessionRecord {
  /** The prescribed load this session ran at (the starting rung); null = bodyweight. Used by the
   *  stall read (S-25) to count occurrences spent at a load before clearing it. */
  load?: number | null;
  /** Working sets only (approach + warm-up already excluded upstream). */
  sets: SetPerf[];
}

/** How a load moves (or does not). */
export type Region = 'upper' | 'lower';

/** Exercise-scoped meta the pure core needs. */
export interface ExerciseMeta {
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';
  bodyweight: boolean;
  /** The loads she has actually performed on THIS lift — the learned grid (F-2). */
  observedLoads?: number[];
}

/** The durable, exercise-keyed progression state. */
export interface ExerciseState {
  exerciseId: string;
  /** Current prescribed load; null = bodyweight. */
  load: number | null;
  band: Band;
  /** Prescribed working-set count for this lift (Loop 3 owns changes; clamped to F-1). */
  sets: number;
  /** Newest-first; kept to the recency window (F-8) plus a little slack for the rail. */
  history: SessionRecord[];
}

/** The kind of decision Loop 2 reached — for explanation + tests. */
export type Loop2Decision =
  | 'progress' // S-22: all sets met Tlo → load up
  | 'hold' // S-24: not every set met Tlo → hold at anchor
  | 'stall_backoff' // S-25.1: back off and re-climb
  | 'stall_rotate' // S-25.2: rotate the exercise
  | 'approach' // S-60: no recent fact → measure
  | 'graduate' // S-52: bodyweight too easy / stalled → harder variation
  | 'ambiguous'; // S-16: nothing usable → hold

export interface Loop2Result {
  decision: Loop2Decision;
  /** Next occurrence's prescribed load; null = bodyweight. */
  load: number | null;
  band: Band;
  sets: number;
  /** True when this prescription is an approach set (measurement, not work). */
  isApproach?: boolean;
  /** Set when decision === 'graduate' / 'stall_rotate': the exercise to move to (id resolved upstream). */
  wantsChange?: 'graduate' | 'rotate';
}
