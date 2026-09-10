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

/**
 * B-4's OTHER half — her measured **set duration** (the working seconds, not the rest).
 *
 * B-4 declares the day-one per-set cost and names both things that replace it: *"Her measured rest
 * (built, Stage 0) **and her set durations (timestamps)**."* The rest half shipped; the work half
 * did not, so a fixed `SET_EXEC_SECONDS` was still standing in for a fact the app has been recording
 * all along. A set that takes her 20 seconds and one that takes her 70 are not the same set, and the
 * time budget (S-64) was pricing both at the same number.
 *
 * The fact is already on disk: two consecutive sets of the SAME exercise in the SAME session carry
 * `persistedAt` timestamps, and the second carries the `restBeforeS` that separated them. What is
 * left is the work.
 *
 *     exec = (persistedAt[i] − persistedAt[i−1]) − restBeforeS[i]
 *
 * Only same-exercise, same-session, consecutive pairs count, and only when the rest is KNOWN (L3 —
 * an unknown rest would silently become "work"). Implausible values are dropped rather than
 * clamped: a negative means the two facts disagree, and a gap longer than the pair's own rest plus
 * an hour means she put the phone down mid-exercise — neither is a set duration. Returns null until
 * she has one real pair, and the caller then uses the B-4 bootstrap.
 */
export interface ExecSample {
  exerciseId: string;
  sessionId: string;
  atMs: number;
  restBeforeS?: number;
}

export function learnedExecS(samples: ExecSample[]): number | null {
  const execs: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (cur.sessionId !== prev.sessionId || cur.exerciseId !== prev.exerciseId) continue;
    if (typeof cur.restBeforeS !== 'number') continue; // unknown rest is never read as zero (L3)
    if (!Number.isFinite(cur.atMs) || !Number.isFinite(prev.atMs)) continue;
    const exec = (cur.atMs - prev.atMs) / 1000 - cur.restBeforeS;
    if (exec <= 0 || exec > 3600) continue; // the two facts disagree, or she walked away mid-lift
    execs.push(exec);
  }
  if (execs.length === 0) return null;
  return median(execs);
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
