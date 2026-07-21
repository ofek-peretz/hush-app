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
  /** LEGACY Build-#33 approach-set mark (Rev 8 deleted the mechanism; nothing writes it any more).
   *  Kept so those on-device histories stay excluded from every decision. */
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
  /** VESTIGIAL — kept for the ExerciseState shape but not the source of truth for the prescription.
   *  Volume is owned per-MUSCLE by Loop 3 (`EngineV5.volumeByMuscle`) and distributed onto the
   *  programme's slot.setCount; this per-EXERCISE field stays at its init value. Reads that need the
   *  real set count use the programme slot, never this. (A full removal would ripple through Loop2Result
   *  + the changeLog; it earns nothing, so it is documented rather than torn out.) */
  sets: number;
  /** Newest-first; kept to the recency window (F-8) plus a little slack for the rail. */
  history: SessionRecord[];
}

/** The kind of decision Loop 2 reached — for explanation + tests. */
export type Loop2Decision =
  | 'progress' // S-22: all sets met Tlo → load up
  | 'hold' // S-24: not every set met Tlo → hold at anchor
  | 'rung_out_of_reach' // S-28: the next rung is a big jump — hold the load, add reps, and say so
  | 'stall_backoff' // S-25.1: back off and re-climb
  | 'stall_rotate' // S-25.2: rotate the exercise
  | 'graduate' // S-52: bodyweight too easy / stalled → harder variation
  | 'ambiguous'; // S-16: nothing usable → hold

export interface Loop2Result {
  decision: Loop2Decision;
  /** Next occurrence's prescribed load; null = bodyweight. */
  load: number | null;
  band: Band;
  sets: number;
  /** Set when decision === 'graduate' / 'stall_rotate': the exercise to move to (id resolved upstream). */
  wantsChange?: 'graduate' | 'rotate';
}
