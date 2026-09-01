/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CORRECTION LEAVES A TRACE — Loop 1, read back out of a finished session.
 *
 * ⛔ THE GAP, NAMED PLAINLY. Moving the iron mid-lift is the one thing this product does that no
 * competitor does — the register's own closing argument is about it (*"this engine is inside the
 * set, sees the number, and moves the iron in ninety seconds"*). And it lived for **2.2 seconds**
 * and then existed nowhere: the finish ledger reports LOOP 2 (what the next occurrence gets), the
 * Saturday letter mirrors the week's decisions, and the session record printed her sets as flat
 * `weight×reps` chips. **The signature mechanic left no trace in the record of the session it
 * happened in.**
 *
 * ── ⚠️ AND IT NEEDED NO NEW STORED FIELD, WHICH IS WHY IT IS A READ AND NOT A WRITE ─────────────
 * Every set already carries what it was PRESCRIBED (`recommendedWeight`) and what she PERFORMED
 * (`actualWeight`). The store's order is documented and ratified (Rev 8, `sessionStore.completeSet`):
 *
 *   1. `carryWeightForward(plan, idx, performedWeight)` — the weight she actually lifted becomes the
 *      baseline for the rest of the exercise. *"A set completed at exactly the prescription is a
 *      true no-op."*
 *   2. `applyLoop1` **on top**, so an out-of-band rep count corrects FROM the load she actually
 *      lifted rather than from the old prescription.
 *
 * So the next set's prescription is *her performed weight, plus whatever Loop 1 did to it* — and the
 * difference between the two is Loop 1, exactly. **A change she made herself is subtracted before
 * the engine is credited with anything**, which is the whole reason this is a module with tests
 * rather than three lines in a screen: a record that told her the engine moved a weight she moved
 * would be worse than a record that said nothing.
 *
 * Pure & I/O-free — same history in, same corrections out, on any device, for ever.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { SetLog } from '@/data/local/models';

export interface LoggedCorrection {
  /** The lift it happened on. */
  exerciseId: string;
  /**
   * Position of the set the engine moved the load INTO, counting from 1 within that lift's sets in
   * this session. Set 1 can never carry one: there is no set before it to have been read.
   */
  position: number;
  /** The load the set would have been prescribed had Loop 1 not acted — in KILOGRAMS. */
  from: number;
  /** What it was prescribed instead — in KILOGRAMS. */
  to: number;
  direction: 'up' | 'down';
}

/**
 * ⚠️ TWO WEIGHTS ARE THE SAME WEIGHT AT TWO DECIMALS. Loads come out of plate maths, unit
 * conversion and the learned grid, so two figures that are the same rung can differ by 1e-13 — and
 * a phantom "↑0" on the record would be a claim about her training. The same rounding `loadNews`
 * uses before it compares, for the same reason.
 */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Every mid-lift correction inside one session.
 *
 * `sets` is the session's whole log, in the order it was written. Grouping happens here rather than
 * at the call site so a screen cannot accidentally compare the last set of one lift against the
 * first set of the next — which is not a correction at all, and would be reported on every single
 * exercise transition of every workout.
 */
export function correctionsIn(sets: readonly SetLog[]): LoggedCorrection[] {
  const out: LoggedCorrection[] = [];
  const byLift = new Map<string, SetLog[]>();
  for (const s of sets) {
    /*
     * WORKING sets only (2026-08-24). A warm-up bridge (`isApproach`) climbs 50% → 75% → work by
     * PRESCRIPTION — read into this derivation, every one of those planned jumps would be drawn
     * as a Loop 1 arrow, crediting the engine with moves it never made. Loop 1 itself never runs
     * on a bridge (sessionStore steps over it), so the working-set sequence is the whole story.
     * Positions stay aligned with every chip row, which filters the same way.
     */
    if (s.isApproach) continue;
    const got = byLift.get(s.exerciseId);
    if (got) got.push(s);
    else byLift.set(s.exerciseId, [s]);
  }

  for (const [exerciseId, lifts] of byLift) {
    for (let i = 1; i < lifts.length; i += 1) {
      const prev = lifts[i - 1];
      const cur = lifts[i];
      /*
       * ⚠️ THE BASIS IS WHAT SHE PERFORMED, NOT WHAT SHE WAS ASKED FOR. That is the carry-forward
       * (step 1 above), and subtracting it is what keeps her own edit off the engine's account: she
       * reached for a heavier dumbbell, the next set was prescribed at the heavier dumbbell, and
       * NOTHING was corrected. `actualWeight` falls back to the prescription only for a set with no
       * performed weight recorded — a bodyweight lift, or a legacy row.
       */
      const basis = prev.actualWeight ?? prev.recommendedWeight;
      const to = cur.recommendedWeight;
      /*
       * ⚠️ A BODYWEIGHT LIFT HAS NO LOAD AXIS AND THEREFORE NO CORRECTION. `null` is the absence of
       * a weight, never zero — the same rule the whole engine keeps (S-55, and `lastTimeOn` carrying
       * a bodyweight lift as null rather than 0).
       */
      if (basis == null || to == null) continue;
      if (round2(basis) === round2(to)) continue;
      out.push({
        exerciseId,
        position: i + 1,
        from: basis,
        to,
        direction: to > basis ? 'up' : 'down',
      });
    }
  }
  return out;
}

/**
 * The corrections of one lift, keyed by the POSITION they landed on — what a row of set chips needs
 * to mark the right chip. Built from the same derivation, so a screen can never mark a set the
 * report above it did not count.
 */
export function correctionsByPosition(
  sets: readonly SetLog[],
  exerciseId: string,
): Map<number, LoggedCorrection> {
  const m = new Map<number, LoggedCorrection>();
  for (const c of correctionsIn(sets)) {
    if (c.exerciseId === exerciseId) m.set(c.position, c);
  }
  return m;
}
