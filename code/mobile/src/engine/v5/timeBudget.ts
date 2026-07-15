/**
 * Hush Engine v5 — the time budget (S-64), computed from her MEASURED rest.
 *
 * `Σ sets × (work + her measured rest) ≤ her declared minutes.` It is a CEILING, never a target
 * (S-64) — volume still only grows by being earned (Loop 3), so a fast rester is credited with more
 * work but the plan still climbs one set at a time and is cut the moment she can't finish it.
 *
 * This fixes v4's `estimateSessionMinutes`, which ignored rest entirely and so measured a workout
 * nobody ever had. Rest here is a FACT (the median of her recorded `restBeforeS`, S-17), not a
 * constant.
 */

import { median } from './stats';

/**
 * Her learned rest for a lift (or a workout) — the median of the rests she actually took (S-17).
 * Unknown rests are excluded (L3). Returns null when she has no rest data yet; the caller then uses
 * the day-one bootstrap (B-4) until real data exists.
 */
export function learnedRestS(restSamples: (number | null | undefined)[]): number | null {
  const known = restSamples.filter((r): r is number => typeof r === 'number' && r >= 0);
  if (known.length === 0) return null;
  return median(known);
}

/** Minutes a block of `sets` takes: sets × (work + rest), in minutes. Rest is her measured rest. */
export function setsToMinutes(sets: number, workSecPerSet: number, restSec: number): number {
  return (sets * (workSecPerSet + restSec)) / 60;
}

/**
 * The most working sets that fit in `budgetMin` minutes at a given work+rest cost — the S-64 ceiling.
 * Floors at 0. A shorter measured rest raises this; the plan still only grows into it by earning.
 */
export function maxSetsInBudget(budgetMin: number, workSecPerSet: number, restSec: number): number {
  const perSetSec = workSecPerSet + restSec;
  if (perSetSec <= 0) return 0;
  return Math.max(0, Math.floor((budgetMin * 60) / perSetSec));
}

/** Does a planned set total fit within her declared minutes? (S-64 — a hard ceiling.) */
export function fitsBudget(sets: number, budgetMin: number, workSecPerSet: number, restSec: number): boolean {
  return setsToMinutes(sets, workSecPerSet, restSec) <= budgetMin + 1e-9;
}
