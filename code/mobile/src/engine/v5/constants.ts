/**
 * Hush Engine v5 — the declared constants (the Part 6 ledger, in code).
 *
 * There are exactly two kinds of number here, and NOTHING else:
 *   • BOOTSTRAPS (B-*) — starting values, each overwritten by her own data within the first
 *     sessions. They are theory-laden by nature and acceptable ONLY because a fact of hers replaces
 *     them fast (L2). None survives into a standing decision.
 *   • FORM CONSTANTS (F-*) — they shape a set count, a filter, a tie-break, or an estimator's
 *     algorithm. None SETS a working load.
 *
 * If a number is not one of these, it does not belong in the engine. See
 * docs/canonical/ENGINE_V5_SITUATION_REGISTER.md Part 6. Retired constants (F-3/F-5/F-6/F-7/F-10,
 * B-7) are gone — the features they served were cut in Rev 6.
 */

import type { Equipment } from '@/engine/catalog';

// ── Form constants (F-*) ──────────────────────────────────────────────────

/** F-1 — sets per exercise stay in [3, 5]. */
export const SETS_MIN = 3;
export const SETS_MAX = 5;

/** F-4 — the athlete may place at most this many emphasis marks on the body map. */
export const EMPHASIS_BUDGET = 2;

/**
 * F-8 — the recency window. A measured statistic (reps-per-rung, N, the rest median, the rail)
 * reads only the athlete's most recent sessions of a lift; older history is not "her number today."
 * A raw completed load used only to SEED a prescription (S-9) is exempt — a weight she lifted is a
 * fact whatever its age; what catches a stale seed is Loop 1, from set 1 (S-38, Rev 8).
 */
export const RECENCY_WINDOW_SESSIONS = 12;

/**
 * F-11 — the rest-band width (seconds). Two sets are "like-for-like" for the reps-per-rung fit only
 * when their `restBeforeS` differ by no more than this (L3). A set whose rest is unknown, or which
 * sits outside the band relative to the set it would be compared with, is excluded from the fit.
 */
export const REST_BAND_WIDTH_S = 45;

/**
 * F-12 — the minimum number of like-for-like (load, reps) pairs at DISTINCT loads before the fitted
 * reps-per-rung slope (F-13) replaces the cautious single-rung bootstrap (B-5).
 */
export const MIN_PAIRS_FOR_SLOPE = 4;

/** F-13 — N's percentile: nearest-rank at this fraction (one named method, stable on small n). */
export const N_PERCENTILE = 0.75;

/**
 * F-14 (Revision 7) — K, the learned-swap adoption threshold (register Part 9). The number of
 * CONSECUTIVE same-target in-workout swaps before a standing replacement is adopted (S-69). An
 * evidence gate (the F-12 / N family), not a load mover. Deliberately small: the engine reacts fast,
 * and the original is offered first ever after (S-70), so a wrong adoption is cheap to undo.
 */
export const ADOPT_THRESHOLD = 2;

/**
 * F-9 — the canonical muscle order: the final tie-break for a contested set (S-32 #3) and, reversed,
 * for the donor (S-37). It repeatedly allocates real volume, so it is a declared form constant.
 * Mirrors the v4 `PATTERNS` enum order (push → pull → legs), extended to every muscle group. Never
 * reordered — determinism depends on it (I-24).
 */
export const CANONICAL_MUSCLE_ORDER: readonly string[] = [
  'Chest',
  'Shoulders',
  'Triceps',
  'Back',
  'Biceps',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
] as const;

// B-4 (day-one per-set cost) lives where assembly prices a day — `fixtureModel`'s
// COMPOUND_SET_MIN / ISOLATION_SET_MIN + SET_EXEC_SECONDS — replaced by her measured rest (S-17)
// and set durations (learnedExecS) the moment she has them. A second copy of those numbers used to
// sit HERE (`STARTING_SET_SECONDS`, unwired, and disagreeing with the live ones): one declared
// constant, one home — it is gone.

/**
 * B-2 — starting weekly sets per muscle, before earned/cut volume (Loop 3) takes over. `base` for a
 * normal muscle; an emphasised muscle starts with `base + emphasisBonus` (its first claim on volume,
 * S-4). Both are overwritten within a few weeks by S-32/S-34.
 */
export const STARTING_WEEKLY_SETS = { base: 10, emphasisBonus: 6 } as const;

/** Which region a muscle group belongs to — drives session shape (the assembler groups by region so
 *  a day is a coherent session). Structure is an OUTPUT of volume, never an input (register Part 3). */
export const MUSCLE_REGION: Record<string, 'upper' | 'lower'> = {
  Chest: 'upper',
  Shoulders: 'upper',
  Triceps: 'upper',
  Back: 'upper',
  Biceps: 'upper',
  Core: 'upper', // trained across upper days (assembler-preferred), never its own day
  Quads: 'lower',
  Hamstrings: 'lower',
  Glutes: 'lower',
  Calves: 'lower',
};

// ── Bootstraps (B-*) ──────────────────────────────────────────────────────

/**
 * B-6 — the starting loadable increment per equipment class, assumed before she has touched the
 * equipment so day-one loads are real. Her performed loads (`observedLoads`) refine this into the
 * real grid (F-2); this is only the fallback when no grid is known yet. Mirrors v4's LOAD_INCREMENT.
 */
export const STARTING_INCREMENT: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 1.0,
  machine: 2.5,
  cable: 2.5,
  bodyweight: 0,
};

/**
 * S-55 / F-2 — **THE EMPTY BAR.** The floor under every barbell load, because it is a fact of the
 * room, not a statistic: "a prescription may never fall to or below zero, or below the lightest
 * weight that physically exists (the empty bar, the smallest dumbbell, the first pin)."
 *
 * It lives HERE, beside B-6, because it is the same kind of thing — what the equipment physically
 * offers — and because it must have exactly ONE home. It previously sat in `engine/loadMath`, which
 * `engine/v5/grid` then imported while `loadMath` imported the grid back: a cycle, and worse, an
 * invitation for the two to hold different numbers. `loadMath` re-exports it for its consumers.
 */
export const BAR_KG = 20;

/**
 * B-3 — attempts-to-clear before she has a history on the lift. The most conservative value: assume
 * she clears each load first try, so a single missed occurrence does not read as a stall. Replaced
 * by her own statistic (S-25) as soon as she has cleared a load or two.
 */
export const ATTEMPTS_TO_CLEAR_SEED = 1;

/**
 * B-5 — before F-12 like-for-like pairs exist, an in-session or between-session load move steps by
 * exactly ONE rung. Not a guessed slope — a cautious single step, tested by the next set (L2). Once
 * the slope is fitted from her data, moves size themselves to her measured reps-per-rung.
 */
export const BOOTSTRAP_RUNGS_PER_MOVE = 1;

