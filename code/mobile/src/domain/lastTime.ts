/**
 * lastTime — what the athlete ACTUALLY did on this lift, last time she met it.
 *
 * ════ WHY THIS EXISTS, AND WHY IT IS ONLY THE REPS (founder mandate 2026-08-26) ════
 *
 * The one thing a tracker like Strong gives an athlete at the bar that Hush did not is the
 * "Previous" column — the proof, mid-set, that today asks more than yesterday delivered. Hush's
 * stage already carries the LOAD half of that comparison: the hero wears `↑1.5` in the direction's
 * colour, and the founder deleted the absolute "LAST TIME · 57.5 KG" restatement under it
 * (2026-08-04) precisely because the delta says it better. That deletion stands.
 *
 * What was never on the stage is the EVIDENCE: the reps she actually left in the book. "12 · 9 · 8"
 * is the number she races when she decides whether the set has one more in it — measured, hers,
 * and impossible to derive from a delta. R7-clean: when the lift has no history, this returns
 * null and the stage says nothing.
 *
 * Working sets only: `isApproach` (which every fold reader filters, and which the warm-up ramp
 * writes) is excluded — a bridge is not a performance. Freeform sessions are excluded too: the
 * record keeps them whole, but a fun max at a friend's gym is not "last time" for THIS
 * programme's bar (the same seal `folds none of it` promises the engine).
 */

//

import type { Session } from '@/data/local/models';

/** The reps the athlete performed on her most recent coached meeting with `exerciseId`,
 *  in set order — or null when the record holds none. */
export function lastTimeReps(history: readonly Session[], exerciseId: string): number[] | null {
  // `db.loadHistory` documents its order: NEWEST FIRST. The first qualifying session is the answer.
  for (const s of history) {
    if (s.freeform) continue;
    const reps = s.sets
      .filter((l) => l.exerciseId === exerciseId && !l.isApproach && !l.isWarmup)
      .sort((a, b) => a.setIndex - b.setIndex)
      .map((l) => l.actualReps);
    if (reps.length > 0) return reps;
  }
  return null;
}
