/**
 * Hush Engine v5 â€” the declared constants (the Part 6 ledger, in code).
 *
 * There are exactly two kinds of number here, and NOTHING else:
 *   â€¢ BOOTSTRAPS (B-*) â€” starting values, each overwritten by her own data within the first
 *     sessions. They are theory-laden by nature and acceptable ONLY because a fact of hers replaces
 *     them fast (L2). None survives into a standing decision.
 *   â€¢ FORM CONSTANTS (F-*) â€” they shape a set count, a filter, a tie-break, or an estimator's
 *     algorithm. None SETS a working load.
 *
 * If a number is not one of these, it does not belong in the engine. See
 * docs/canonical/ENGINE_V5_SITUATION_REGISTER.md Part 6. Retired constants (F-3/F-5/F-6/F-7/F-10,
 * B-7) are gone â€” the features they served were cut in Rev 6.
 */

import type { Equipment } from '@/engine/catalog';

// â”€â”€ Form constants (F-*) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** F-1 â€” sets per exercise stay in [3, 5]. */
export const SETS_MIN = 3;
export const SETS_MAX = 5;

/** F-4 â€” the athlete may place at most this many emphasis marks on the body map. */
export const EMPHASIS_BUDGET = 2;

/**
 * F-8 â€” the recency window. A measured statistic (reps-per-rung, N, the rest median, the rail)
 * reads only the athlete's most recent sessions of a lift; older history is not "her number today."
 * A raw completed load used only to SEED a prescription (S-9) is exempt â€” a weight she lifted is a
 * fact whatever its age; what catches a stale seed is Loop 1, from set 1 (S-38, Rev 8).
 */
export const RECENCY_WINDOW_SESSIONS = 12;

/**
 * F-11 â€” the rest-band width (seconds). Two sets are "like-for-like" for the reps-per-rung fit only
 * when their `restBeforeS` differ by no more than this (L3). A set whose rest is unknown, or which
 * sits outside the band relative to the set it would be compared with, is excluded from the fit.
 */
export const REST_BAND_WIDTH_S = 45;

/**
 * F-12 â€” the minimum number of like-for-like (load, reps) pairs at DISTINCT loads before the fitted
 * reps-per-rung slope (F-13) replaces the cautious single-rung bootstrap (B-5).
 */
export const MIN_PAIRS_FOR_SLOPE = 4;

/** F-13 â€” N's percentile: nearest-rank at this fraction (one named method, stable on small n). */
export const N_PERCENTILE = 0.75;

/**
 * F-14 (Revision 7) â€” K, the learned-swap adoption threshold (register Part 9). The number of
 * CONSECUTIVE same-target in-workout swaps before a standing replacement is adopted (S-69). An
 * evidence gate (the F-12 / N family), not a load mover. Deliberately small: the engine reacts fast,
 * and the original is offered first ever after (S-70), so a wrong adoption is cheap to undo.
 */
export const ADOPT_THRESHOLD = 2;

/**
 * F-9 â€” the canonical muscle order: the final tie-break for a contested set (S-32 #3) and, reversed,
 * for the donor (S-37). It repeatedly allocates real volume, so it is a declared form constant.
 * Mirrors the v4 `PATTERNS` enum order (push â†’ pull â†’ legs), extended to every muscle group. Never
 * reordered â€” determinism depends on it (I-24).
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

// B-4 (day-one per-set cost) lives where assembly prices a day â€” `fixtureModel`'s
// COMPOUND_SET_MIN / ISOLATION_SET_MIN + SET_EXEC_SECONDS â€” replaced by her measured rest (S-17)
// and set durations (learnedExecS) the moment she has them. A second copy of those numbers used to
// sit HERE (`STARTING_SET_SECONDS`, unwired, and disagreeing with the live ones): one declared
// constant, one home â€” it is gone.

/**
 * B-2 â€” starting weekly sets per muscle, before earned/cut volume (Loop 3) takes over. `base` for a
 * normal muscle; an emphasised muscle starts with `base + emphasisBonus` (its first claim on volume,
 * S-4). Both are overwritten within a few weeks by S-32/S-34.
 */
export const STARTING_WEEKLY_SETS = { base: 10, emphasisBonus: 6 } as const;

/**
 * â•â•â•â• B-2, MADE FREQUENCY-AWARE (founder 2026-08-08) â•â•â•â•
 *
 * `base` above is a FLAT 10 sets per muscle per week, whatever the athlete's frequency, and that one
 * constant is why `everyProgramme`'s two guards have been skipped since build 36: *"weekly volume
 * never consults frequency, so six days a week is the same pot of work sliced into 24- and 12-minute
 * days"* (QA_BUILD_36_FOUNDER P0.3/P0.4). The audit prints it plainly â€” male 4Ã—, 5Ã— and 6Ã— all came
 * out at ~156 minutes a week, and the 6Ã— week ended on a two-lift, 18-minute session.
 *
 * The arithmetic that produced it: 10 sets â†’ `exerciseCountFor` â†’ 2 exercises per muscle â†’ 10 upper
 * exercises dealt round-robin across three upper days â†’ three lifts a day. Training more days bought
 * nothing; it only sliced the same pot thinner.
 *
 * Volume now scales with the days she actually trains: frequency is what BUYS recoverable volume, so
 * it is what sets it. The TARGET is 5 × days, and it is deliberately generous — read the note on
 * WEEKLY_SETS_CEILING. What the athlete actually performs is the target after `enforceTimeCap` cuts
 * the day to her minutes, and THAT is the number to judge: ~11 sets a muscle a week at four days and
 * ~16 at six, both inside the 12–20 the evidence calls optimal, and ~5 at two days, which is honestly
 * below the effective dose because two sessions cannot hold more.
 *
 * The audit reads monotonic now — 120 / 174 / 240 / 294 / 360 minutes a week at 2…6 days — where
 * before it was 120 / 150 / 156 / 156 / 156 and the extra days bought nothing.
 *
 * â›” This is the DAY-ONE shape only. Loop 3 still earns and cuts from her facts within weeks (S-32 /
 * S-34), and it may take a muscle past this number â€” that is measured, and this is a guess.
 */
/* B-2 (frequency-aware) - the three numbers below are one bootstrap; Loop 3 overwrites it. */
export const WEEKLY_SETS_PER_DAY = 5;
export const WEEKLY_SETS_FLOOR = 6; // MEV â€” below this a muscle is maintained, not grown
/* B-2 - a SHAPE input, not a prescription. Deliberately above the ~20 weekly sets the evidence
 * calls the point of diminishing returns, because the day-one target is what FILLS a day before
 * enforceTimeCap trims it to her minutes - the clock is the real allocator. Realized: ~11 sets a
 * muscle at four days, ~16 at six, inside the 12-20 band. Never read as 'she will do 30 sets'. */
export const WEEKLY_SETS_CEILING = 30;

/**
 * B-2 — the muscle count a full body map trains (every group but Core, which is supplemental).
 * Turning muscles OFF does not shorten her hour, so the work has to redistribute over what is left.
 */
export const FULL_BODY_MUSCLE_COUNT = 9;

/**
 * ════ B-2 — A MUSCLE'S SHARE OF THE WEEK'S WORK (founder 2026-08-09) ════
 *
 * ⛔ Founder: *"אני רוצה גם שתסתכל על תוכניות האימון עצמם ותגיד לי האם הן טובות ברמה בינלאומית."*
 *
 * Read as a coach would read it, the answer was no, and one number was the reason: every muscle drew
 * the SAME weekly target. The printed male 4× week came out —
 *
 *     Quads 15 · Calves 12 · Hamstrings 11 · Triceps 10 · Shoulders 10 · Biceps 9 · Chest 8 · Back 8
 *
 * — and no coach in the world signs a programme where the CALVES are trained harder than the BACK,
 * or where the biceps (a small muscle already worked by every pull) gets more direct volume than the
 * largest muscle group in the body. The engine simply had no concept of muscle size.
 *
 * These are SHARES of a fixed weekly pot, not multipliers on a fixed per-muscle number, so the total
 * work in a week does not move when the shares are tuned — only its distribution. The pot itself is
 * `WEEKLY_SETS_PER_DAY × days`, and the time cap still has the last word on what fits.
 *
 * The ordering follows the standing evidence — roughly 12–16 weekly sets for the large groups and
 * 8–12 for the small ones — and the small ones sit at the bottom of their band on purpose, because
 * every number here counts DIRECT sets only: the biceps also work on every row and pulldown, and the
 * triceps on every press, and none of that indirect work is counted anywhere.
 */
export const MUSCLE_VOLUME_SHARE: Record<string, number> = {
  Back: 1.5, // the largest group, and the one the old flat target starved worst
  Chest: 1.3,
  Quads: 1.3,
  Hamstrings: 1.2,
  Shoulders: 1.2, // three heads, and the lateral/rear ones get nothing indirectly
  Glutes: 1.1,
  Biceps: 0.7, // worked by every pull already
  Triceps: 0.7, // worked by every press already
  Calves: 0.6,
};

export function startingWeeklySets(
  days: number,
  trainableCount: number = FULL_BODY_MUSCLE_COUNT,
  /** The muscle whose share to apply. Omitted → the flat, size-blind figure (older callers). */
  muscle?: string,
  /** The trainable muscles, so the pot divides by the shares actually on the map. */
  trainable?: readonly string[],
): number {
  /*
   * ⛔ AN `off` MUSCLE MUST NOT SHORTEN HER SESSION.
   *
   * She asked not to train a muscle, not for a shorter workout — the hour is the same hour. So the
   * pot is fixed at `WEEKLY_SETS_PER_DAY × days × FULL_BODY_MUSCLE_COUNT` and divided by the shares
   * that remain: turning off four leg muscles hands the whole week to the five upper ones. Before
   * this, the sweep counted 335 sessions under 45 minutes, nearly all on maps with something off.
   */
  const pot = WEEKLY_SETS_PER_DAY * days * FULL_BODY_MUSCLE_COUNT;
  const share = muscle ? (MUSCLE_VOLUME_SHARE[muscle] ?? 1) : 1;
  const totalShares = trainable?.length
    ? trainable.reduce((n, m) => n + (MUSCLE_VOLUME_SHARE[m] ?? 1), 0)
    : Math.max(1, trainableCount);
  const scaled = (pot * share) / totalShares;
  return Math.min(WEEKLY_SETS_CEILING, Math.max(WEEKLY_SETS_FLOOR, Math.round(scaled)));
}

/**
 * ⛔ EMPHASIS IS A PROPORTIONAL CLAIM, NOT A FIXED NUMBER OF SETS.
 *
 * `emphasisBonus` is a flat +6, which was +60% of the old flat base of 10. Once the base scales with
 * frequency the same +6 quietly shrinks to +40% at three days and +20% at six — and emphasis stops
 * shaping the week. `structure follows volume` caught it immediately: two emphasised lower muscles
 * at 3 days stopped pulling a second lower day, because 72 lower sets against 75 upper rounds to one
 * day, where 52 against 50 rounded to two.
 *
 * The mark has to keep the same WEIGHT at every frequency, so it is a fraction of the base.
 */
/* B-2 - the emphasis mark's share of the base. */
export const EMPHASIS_FRACTION = 0.6;

export function emphasisBonusFor(base: number): number {
  return Math.round(base * EMPHASIS_FRACTION);
}

/** Which region a muscle group belongs to â€” drives session shape (the assembler groups by region so
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

// â”€â”€ Bootstraps (B-*) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * B-6 â€” the starting loadable increment per equipment class, assumed before she has touched the
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
 * S-55 / F-2 â€” **THE EMPTY BAR.** The floor under every barbell load, because it is a fact of the
 * room, not a statistic: "a prescription may never fall to or below zero, or below the lightest
 * weight that physically exists (the empty bar, the smallest dumbbell, the first pin)."
 *
 * It lives HERE, beside B-6, because it is the same kind of thing â€” what the equipment physically
 * offers â€” and because it must have exactly ONE home. It previously sat in `engine/loadMath`, which
 * `engine/v5/grid` then imported while `loadMath` imported the grid back: a cycle, and worse, an
 * invitation for the two to hold different numbers. `loadMath` re-exports it for its consumers.
 */
export const BAR_KG = 20;

/**
 * B-3 â€” attempts-to-clear before she has a history on the lift. The most conservative value: assume
 * she clears each load first try, so a single missed occurrence does not read as a stall. Replaced
 * by her own statistic (S-25) as soon as she has cleared a load or two.
 */
export const ATTEMPTS_TO_CLEAR_SEED = 1;

/**
 * B-5 â€” before F-12 like-for-like pairs exist, an in-session or between-session load move steps by
 * exactly ONE rung. Not a guessed slope â€” a cautious single step, tested by the next set (L2). Once
 * the slope is fitted from her data, moves size themselves to her measured reps-per-rung.
 */
export const BOOTSTRAP_RUNGS_PER_MOVE = 1;


