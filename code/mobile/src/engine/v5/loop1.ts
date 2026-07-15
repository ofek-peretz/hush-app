/**
 * Hush Engine v5 — Loop 1, the Set loop (in-session, ~90s). S-11/12/13/14/15.
 *
 * The prescription is a contract: N sets, at load L, landing in her band [Tlo, Thi]. After each set
 * the reps are a fact. If the fact breaks the contract, the load is corrected FOR THE NEXT SET,
 * immediately — by as many rungs as her own reps-per-rung says the miss is worth (B-5: one cautious
 * rung until fitted). At most 2 corrections per exercise per session, never after the last set (S-13).
 * A bodyweight lift has no load axis, so Loop 1 never corrects it (S-51).
 */

import type { Band, ExerciseMeta } from './types';
import { moveRungs, snapDown } from './grid';
import { rungsForHeadroom } from './repsPerRung';

const MAX_CORRECTIONS = 2; // S-13

export interface Loop1Input {
  currentLoad: number | null; // the load THIS set was done at
  band: Band;
  repsJustDone: number;
  correctionsSoFar: number; // corrections already applied this exercise this session
  isLastSet: boolean;
  meta: ExerciseMeta;
  /** Her measured reps-per-rung on this lift, or null → one cautious rung (B-5). */
  perRung: number | null;
}

export interface Loop1Result {
  /** The load to prescribe for the NEXT set (unchanged when no correction). */
  nextLoad: number | null;
  corrected: boolean;
  direction: 'up' | 'down' | 'none';
}

/** Decide the next set's load from the set just performed. Pure. */
export function correctInSession(inp: Loop1Input): Loop1Result {
  const { currentLoad, band, repsJustDone, correctionsSoFar, isLastSet, meta, perRung } = inp;
  const none: Loop1Result = { nextLoad: currentLoad, corrected: false, direction: 'none' };

  // S-51: bodyweight has no load to correct. S-13: no correction after the last set, or past the cap.
  if (meta.bodyweight || currentLoad == null) return none;
  if (isLastSet || correctionsSoFar >= MAX_CORRECTIONS) return none;

  if (repsJustDone > band.hi) {
    // S-11 / S-14: above Thi → the load is too light; raise it (as many rungs as the overshoot is worth).
    const n = rungsForHeadroom(repsJustDone - band.hi, perRung);
    const raised = snapDown(moveRungs(currentLoad, n, meta.equipment, meta.observedLoads), meta.equipment, meta.observedLoads);
    return { nextLoad: raised, corrected: raised !== currentLoad, direction: 'up' };
  }
  if (repsJustDone < band.lo) {
    // S-12 / S-15: below Tlo → drop, so the remaining sets can meet the contract.
    const n = rungsForHeadroom(band.lo - repsJustDone, perRung);
    const dropped = snapDown(moveRungs(currentLoad, -n, meta.equipment, meta.observedLoads), meta.equipment, meta.observedLoads);
    return { nextLoad: dropped, corrected: dropped !== currentLoad, direction: 'down' };
  }
  // Inside the band — exactly right.
  return none;
}
