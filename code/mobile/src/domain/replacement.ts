/**
 * Replacement logic (UX §1).
 *
 * As of 2026-07-12 this file holds NO ranking of its own. Choosing a substitute is ONE decision
 * with ONE law (`domain/swapPool`), and every surface — the phone's in-workout quick swap, the
 * watch mirror, the program editor's sheet, the weekly rotation — asks the same function. Four
 * independent pools is precisely what let the watch quietly offer a lift the athlete had already
 * finished that day, while the phone (which happened to remember to exclude it) did not.
 *
 * Kept as the domain-facing name the screens already import.
 */
// @ts-nocheck

// 

import { swapCandidates, swapLadder as poolLadder, type SwapContext } from '@/domain/swapPool';
import type { Exercise } from '@/data/exercises';

export { defaultBackup, swapCandidates, swapLadder, bestSwap, swapScore } from '@/domain/swapPool';
export type { SwapContext, SwapPrefs } from '@/domain/swapPool';

/**
 * Up to three ranked substitutes for a PROGRAM slot (no live session, so nothing to exclude).
 * Closest-first: the athlete is choosing a standing replacement, and the slot's training intent is
 * what must survive the choice.
 */
export function recommended(currentId: string): Exercise[] {
  return swapCandidates(currentId, { sessionExerciseIds: [] }).slice(0, 3);
}

/**
 * The in-workout ladder (S4, approved 2026-07-06): Hush decides — the athlete never evaluates a
 * list mid-workout. "Try another" walks it; "Undo" restores the original.
 *
 * `ctx.sessionExerciseIds` is REQUIRED and must be every lift in today's session. Offering a lift
 * the athlete has already done is the exact bug this module exists to prevent.
 */
export function inWorkoutLadder(currentId: string, ctx: SwapContext): string[] {
  return poolLadder(currentId, ctx);
}
