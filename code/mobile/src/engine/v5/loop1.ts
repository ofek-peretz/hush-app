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
import { rungsForHeadroom, rungOutOfReach, bootstrapPerRung } from './repsPerRung';

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
  /**
   * L11 — the rail, as a concrete ceiling for THIS lift: one rung above the heaviest load she has
   * completed at `Tlo` reps (her settled history plus what she has already completed this session).
   * `null`/absent = the rail is INACTIVE (a lift with no completed set inside the recency window),
   * which is the one condition L11 names, and there the athlete's own eyes are the guard (S-49).
   *
   * S-11 says a raise is "always inside the rail" and S-14 says the rail is absolute — but the live
   * loop never applied it, so a single implausible rep count (a 30-rep set on a light dumbbell, a
   * mis-keyed 40 typed as 4 reps' worth of headroom) could size a correction to a load she has never
   * come near, mid-workout, with nothing underneath it. Loop 2 clamped; Loop 1 did not. It does now.
   */
  railCeiling?: number | null;
}

export interface Loop1Result {
  /** The load to prescribe for the NEXT set (unchanged when no correction). */
  nextLoad: number | null;
  corrected: boolean;
  direction: 'up' | 'down' | 'none';
}

/** Decide the next set's load from the set just performed. Pure. */
export function correctInSession(inp: Loop1Input): Loop1Result {
  const { currentLoad, band, repsJustDone, correctionsSoFar, isLastSet, meta, perRung, railCeiling } = inp;
  const none: Loop1Result = { nextLoad: currentLoad, corrected: false, direction: 'none' };

  // S-51: bodyweight has no load to correct. S-13: no correction after the last set, or past the cap.
  if (meta.bodyweight || currentLoad == null) return none;
  if (isLastSet || correctionsSoFar >= MAX_CORRECTIONS) return none;

  if (repsJustDone > band.hi) {
    // S-28 · the same law, on the in-session door. If the next rung is a big jump (no micro-loading)
    // and her measured reps-per-rung says it lands her under Tlo, the load may not move — "T is hers,
    // so the engine may not quietly raise it." Leaving Loop 1 free to prescribe the unreachable rung
    // would simply re-open the oscillation Loop 2 now refuses; the register is explicit that ONE
    // measured fact governs the problem, and a law that holds on one path and not its neighbour is
    // how every defect in this engine's audit got in.
    if (rungOutOfReach(currentLoad, band, perRung, meta, repsJustDone)) {
      return none;
    }
    // S-11 / S-14: above Thi → the load is too light; raise it (as many rungs as the overshoot is
    // worth — her fitted slope if she has one, else B-5's modelled price of a rep at THIS load).
    const n = rungsForHeadroom(repsJustDone - band.hi, perRung, 'up', bootstrapPerRung(currentLoad, band.hi, meta));
    let raised = snapDown(moveRungs(currentLoad, n, meta.equipment, meta.observedLoads), meta.equipment, meta.observedLoads);
    // L11 — the rail is the one hard stop, and it binds here exactly as it binds Loop 2 (S-11/S-14).
    // Never below the load she is on: the rail only ever cancels a raise, it never causes a drop.
    if (railCeiling != null && raised > railCeiling) raised = Math.max(currentLoad, railCeiling);
    return { nextLoad: raised, corrected: raised !== currentLoad, direction: 'up' };
  }
  if (repsJustDone < band.lo) {
    // S-12 / S-15: below Tlo → drop, so the remaining sets can meet the contract. `'down'` is not
    // decoration: a drop that lands short leaves her under the weight that just beat her, with at
    // most one correction left to escape it, so the rounding goes the other way (see the note on
    // `rungsForHeadroom`).
    const n = rungsForHeadroom(band.lo - repsJustDone, perRung, 'down', bootstrapPerRung(currentLoad, band.lo, meta));
    const dropped = snapDown(moveRungs(currentLoad, -n, meta.equipment, meta.observedLoads), meta.equipment, meta.observedLoads);
    return { nextLoad: dropped, corrected: dropped !== currentLoad, direction: 'down' };
  }
  // Inside the band — exactly right.
  return none;
}
