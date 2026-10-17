/**
 * Hush Engine v5 — Loop 3, the Muscle loop (end of every occurrence). Volume, on facts only.
 *
 * S-32 (completed every set AND a lift advanced → +1), S-32b (completed but nothing advanced →
 * hold — more volume breaking a stall is a theory, L1), S-33 (unfinished → hold), S-34 (unfinished
 * twice → −1), S-35 (never below the floor — drop an exercise instead), S-36 (can't finish even at
 * the floor → stop cutting, look at the LOAD). Bounds come from the caller: the floor is F-1, the
 * ceiling is her time budget (S-64) — never a made-up MRV constant.
 *
 * Pure. Operates on the muscle's set total for one occurrence-slot in the split.
 */

export type VolumeDecision =
  | 'progress' // +1 set earned
  | 'hold' // no change (S-32b / S-33)
  | 'capped' // earned a set but the time budget is full → held, not grown
  | 'cut' // −1 set (S-34)
  | 'at_floor'; // would cut below the floor → assembly drops an exercise / looks at load (S-35/36)

export interface VolumeInput {
  /** Current prescribed set total for this muscle on this day. */
  sets: number;
  /** Floor (F-1 · SETS_MIN aggregated) and ceiling (from the time budget, S-64). */
  minSets: number;
  maxSets: number;
  /** Did she complete every prescribed set for this muscle this occurrence? */
  completedAll: boolean;
  /** Did at least one of the muscle's lifts advance (Loop 2 'progress')? */
  anyAdvanced: boolean;
  /** Consecutive occurrences (incl. this one) left unfinished. */
  unfinishedStreak: number;
}

export interface VolumeResult {
  sets: number;
  decision: VolumeDecision;
}

export function decideVolume(inp: VolumeInput): VolumeResult {
  const { sets, minSets, maxSets, completedAll, anyAdvanced, unfinishedStreak } = inp;

  if (completedAll && anyAdvanced) {
    /*
     * S-32: earn a set — unless the time budget is already full (S-64 ceiling).
     *
     * ⛔ AND A TOTAL ALREADY ABOVE THE CEILING IS BROUGHT BACK TO IT. This only ever refused to
     * GROW, and `sets` is her PERSISTED total while `maxSets` is recomputed from the current week —
     * so the two can start out of order, and nothing here could ever restore them:
     *
     *     she trains 6 days, Loop 3 climbs Back to 30 · she switches to 3 days · maxSets is now 16
     *     → every occurrence for ever after returned { sets: 30, 'capped' }
     *
     * Thirty is then what `distributeMuscleSets` is handed on every regeneration, and the clock
     * has to cut it back by hand each time. The header's claim — *"the ceiling is her time budget
     * (S-64)"* — is unenforceable if the state is allowed to sit above it, and `capped` said "you
     * earned a set and the clock is full" on a week where she had earned nothing.
     *
     * A drop to the ceiling is not a punishment and not a cut: `maxSets` IS what her minutes hold.
     */
    if (sets > maxSets) return { sets: maxSets, decision: 'capped' };
    if (sets + 1 > maxSets) return { sets, decision: 'capped' };
    return { sets: sets + 1, decision: 'progress' };
  }

  if (completedAll && !anyAdvanced) {
    // S-32b: completed everything but nothing advanced → hold. The stall belongs to Loop 2.
    return { sets, decision: 'hold' };
  }

  // Not completed.
  if (unfinishedStreak >= 2) {
    /*
     * S-34: cut a set, but never below the floor (S-35).
     *
     * ⛔ THE FLOOR CLAMP USED TO *RAISE* VOLUME ON A FAILED WEEK. It read
     * `if (sets - 1 < minSets) return { sets: minSets }`, and that condition is true for every
     * `sets <= minSets` — including `sets < minSets`, where returning `minSets` is an INCREASE:
     *
     *     sets 1, minSets 3, she failed to finish twice  →  { sets: 3, 'at_floor' }
     *
     * Two failed occurrences bought her two extra sets, and because `v5Engine` logs any move
     * (`res.sets !== current`), the Saturday mirror then narrated "I added a set" about a week she
     * could not finish. `sets` starts below the floor whenever a muscle's whole-week prescription
     * does — a muscle the clock has squeezed to one or two sets, which is exactly the muscle least
     * able to absorb more.
     *
     * The floor is a floor, not a target: never go under it, and never climb to it on a failure.
     */
    if (sets <= minSets) return { sets, decision: 'at_floor' }; // S-35/36: assembly acts — never up to the floor
    return { sets: sets - 1, decision: 'cut' };
  }

  // S-33: first unfinished occurrence → hold.
  return { sets, decision: 'hold' };
}
