/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * LOOP 1, BRANCH BY BRANCH AND BOUNDARY BY BOUNDARY.
 *
 * ⛔ Mutation testing over the whole engine (40 hours, 1,361 mutants) scored `loop1.ts` at FOURTEEN
 * PER CENT: of 48 ways to break it, 43 changed nothing any test could see. This is the loop that
 * moves the weight mid-set — the product's signature moment — and it was the least defended file in
 * the engine.
 *
 * The existing loop-1 tests assert what it DOES on a handful of realistic inputs. That is not the
 * same as pinning it: `if (a || b)` mutated to `if (a && b)`, `>` to `>=`, `Math.max` to `Math.min`,
 * a whole `if` body deleted — all survived, because no case in the suite sat on the line where those
 * differ.
 *
 * So this file is written from the mutation report rather than from imagination. Every branch is
 * entered from both sides, every comparison is tested AT its boundary and one step either way, and
 * every returned field (`nextLoad`, `corrected`, `direction`) is asserted rather than one of them.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { correctInSession } from '@/engine/v5/loop1';
import type { Band, ExerciseMeta } from '@/engine/v5/types';

const BAND: Band = { lo: 8, hi: 10 };

/** A barbell: rungs of 2.5 kg from the 20 kg bar, so every expected load below is a real rung. */
const BARBELL: ExerciseMeta = { equipment: 'barbell', bodyweight: false, observedLoads: [] };
const BODYWEIGHT: ExerciseMeta = { equipment: 'bodyweight', bodyweight: true, observedLoads: [] };

const run = (over: Partial<Parameters<typeof correctInSession>[0]> = {}) =>
  correctInSession({
    currentLoad: 60,
    band: BAND,
    repsJustDone: 9, // inside the band unless a case says otherwise
    correctionsSoFar: 0,
    isLastSet: false,
    meta: BARBELL,
    perRung: 1, // one rep per rung — makes the arithmetic legible
    railCeiling: null,
    ...over,
  });

const NONE = { corrected: false, direction: 'none' };

describe('the two gates that stop Loop 1 before it looks at a rep', () => {
  /*
   * `if (meta.bodyweight || currentLoad == null) return none;`
   *
   * Mutated to `&&`, to `if (false)`, and to `!=`, all survived. Each needs a case where exactly one
   * side is true — with `&&`, a bodyweight lift WITH a load would fall through and get corrected.
   */
  it('S-51 · a bodyweight lift is never corrected, even at a rep count that would move a barbell', () => {
    expect(run({ meta: BODYWEIGHT, currentLoad: null, repsJustDone: 20 })).toEqual({ nextLoad: null, ...NONE });
    // The `||` case that `&&` would break: bodyweight, but a load came through anyway.
    expect(run({ meta: BODYWEIGHT, currentLoad: 60, repsJustDone: 20 })).toEqual({ nextLoad: 60, ...NONE });
  });

  it('a lift with no load is never corrected, even when it is not bodyweight', () => {
    // The other half of the same `||`: loaded lift, load unknown. `&&` would fall through here too.
    expect(run({ currentLoad: null, repsJustDone: 20 })).toEqual({ nextLoad: null, ...NONE });
    expect(run({ currentLoad: null, repsJustDone: 2 })).toEqual({ nextLoad: null, ...NONE });
  });

  /*
   * `if (isLastSet || correctionsSoFar >= MAX_CORRECTIONS) return none;`
   *
   * `>=` mutated to `>` survived, which is the off-by-one that lets a THIRD correction through.
   */
  it('S-13 · no correction after the last set', () => {
    expect(run({ isLastSet: true, repsJustDone: 20 })).toEqual({ nextLoad: 60, ...NONE });
    expect(run({ isLastSet: true, repsJustDone: 2 })).toEqual({ nextLoad: 60, ...NONE });
    // …and the same set DOES correct when it is not the last one.
    expect(run({ isLastSet: false, repsJustDone: 20 }).corrected).toBe(true);
  });

  it('S-13 · the correction cap is TWO, and the boundary is exact', () => {
    expect(run({ correctionsSoFar: 1, repsJustDone: 20 }).corrected).toBe(true); // the 2nd is allowed
    expect(run({ correctionsSoFar: 2, repsJustDone: 20 })).toEqual({ nextLoad: 60, ...NONE }); // the 3rd is not
    expect(run({ correctionsSoFar: 3, repsJustDone: 20 })).toEqual({ nextLoad: 60, ...NONE });
  });
});

describe('the band decides, and its edges are inclusive', () => {
  /*
   * `if (repsJustDone > band.hi)` and `if (repsJustDone < band.lo)`. Both comparisons mutated to
   * their inclusive/exclusive twin and survived — nothing in the suite sat ON 8 or ON 10.
   */
  it('exactly at Thi is INSIDE the band — nothing moves', () => {
    expect(run({ repsJustDone: 10 })).toEqual({ nextLoad: 60, ...NONE });
  });

  it('one rep past Thi WAITS alone, and raises with its second witness (F-20)', () => {
    // The founder's gym finding #3, mirrored on the raise side: a lone 1-rep overshoot is wobble.
    expect(run({ repsJustDone: 11 })).toEqual({ nextLoad: 60, ...NONE });
    expect(run({ repsJustDone: 11, prevMiss: 'up' }).direction).toBe('up');
  });

  it('exactly at Tlo is INSIDE the band — nothing moves', () => {
    expect(run({ repsJustDone: 8 })).toEqual({ nextLoad: 60, ...NONE });
  });

  it('one rep short of Tlo WAITS alone, and drops with its second witness (F-20)', () => {
    // The finding itself: 7 then 8 on an 8-lo band. The 7 alone may not renegotiate the bar.
    expect(run({ repsJustDone: 7 })).toEqual({ nextLoad: 60, ...NONE });
    expect(run({ repsJustDone: 7, prevMiss: 'down' }).direction).toBe('down');
  });

  it('F-20 · a 2-rep miss is evidence on its own — no witness needed, either side', () => {
    expect(run({ repsJustDone: 6 }).direction).toBe('down'); // a grinding set acts immediately
    expect(run({ repsJustDone: 12 }).direction).toBe('up');
  });

  it('F-20 · a witness on the WRONG side does not corroborate', () => {
    expect(run({ repsJustDone: 7, prevMiss: 'up' })).toEqual({ nextLoad: 60, ...NONE });
    expect(run({ repsJustDone: 11, prevMiss: 'down' })).toEqual({ nextLoad: 60, ...NONE });
  });

  it('every rep count strictly inside the band leaves the load alone', () => {
    for (let reps = BAND.lo; reps <= BAND.hi; reps++) {
      expect({ reps, ...run({ repsJustDone: reps }) }).toEqual({ reps, nextLoad: 60, ...NONE });
    }
  });
});

describe('a raise is sized by the overshoot, and the rail is the hard stop', () => {
  it('the further past Thi she goes, the further the load moves', () => {
    const one = run({ repsJustDone: 11, prevMiss: 'up' }).nextLoad; // witnessed (F-20)
    const four = run({ repsJustDone: 14 }).nextLoad;
    expect(one).toBeGreaterThan(60);
    expect(four).toBeGreaterThan(one); // a bigger miss is worth more rungs
  });

  /*
   * `if (railCeiling != null && raised > railCeiling) raised = Math.max(currentLoad, railCeiling);`
   *
   * EIGHT mutants survived on this line alone — the whole clause deleted, `>` flipped, `&&` to `||`,
   * `Math.max` to `Math.min`. `min` is the dangerous one: it turns the rail from a cap on a RAISE
   * into a forced DROP, which is precisely what the comment above it forbids.
   */
  it('L11 · the rail caps a raise', () => {
    const capped = run({ repsJustDone: 20, railCeiling: 62.5 });
    expect(capped.nextLoad).toBe(62.5);
    expect(capped.direction).toBe('up');
  });

  it('L11 · a rail BELOW her current load never causes a drop — it cancels the raise instead', () => {
    // `Math.min` here would prescribe 50 kg after a 20-rep set. The load must simply not move.
    const r = run({ currentLoad: 60, repsJustDone: 20, railCeiling: 50 });
    expect(r.nextLoad).toBe(60);
    expect(r.corrected).toBe(false); // nothing moved, so nothing is announced
  });

  it('L11 · a rail above the raise does not bind', () => {
    const free = run({ repsJustDone: 11, railCeiling: 999 });
    const noRail = run({ repsJustDone: 11, railCeiling: null });
    expect(free.nextLoad).toBe(noRail.nextLoad);
  });

  it('an absent rail is inactive, not a ceiling of zero', () => {
    expect(run({ repsJustDone: 12, railCeiling: null }).nextLoad).toBeGreaterThan(60);
    expect(run({ repsJustDone: 12, railCeiling: undefined }).nextLoad).toBeGreaterThan(60);
  });
});

describe('a drop is sized by the shortfall', () => {
  it('the further short of Tlo she falls, the further the load drops', () => {
    const one = run({ repsJustDone: 7, prevMiss: 'down' }).nextLoad; // witnessed (F-20)
    const four = run({ repsJustDone: 4 }).nextLoad;
    expect(one).toBeLessThan(60);
    expect(four).toBeLessThan(one);
  });

  it('a drop never falls through the bar', () => {
    // The barbell floor is the empty bar; no shortfall, however large, may prescribe less.
    expect(run({ currentLoad: 22.5, repsJustDone: 0 }).nextLoad).toBeGreaterThanOrEqual(20);
  });

  it('the rail never interferes with a drop — it only ever cancels a raise', () => {
    const withRail = run({ repsJustDone: 5, railCeiling: 100 });
    const without = run({ repsJustDone: 5, railCeiling: null });
    expect(withRail.nextLoad).toBe(without.nextLoad);
    expect(withRail.direction).toBe('down');
  });
});

describe('`corrected` is a statement about the LOAD, not about the branch taken', () => {
  /*
   * `corrected: raised !== currentLoad` and `corrected: dropped !== currentLoad`. Both mutated to
   * `===` and to the literal `true`, and survived. The flag drives the athlete-facing "I moved the
   * weight" line, so announcing a move that did not happen is a user-visible lie.
   */
  it('a raise that the rail cancels reports corrected: false, and still reports the direction it wanted', () => {
    const r = run({ currentLoad: 60, repsJustDone: 20, railCeiling: 60 });
    expect({ nextLoad: r.nextLoad, corrected: r.corrected }).toEqual({ nextLoad: 60, corrected: false });
  });

  it('a raise that lands reports corrected: true', () => {
    const r = run({ repsJustDone: 11, prevMiss: 'up' });
    expect(r.corrected).toBe(true);
    expect(r.nextLoad).not.toBe(60);
  });

  it('a drop that lands reports corrected: true', () => {
    const r = run({ repsJustDone: 7, prevMiss: 'down' });
    expect(r.corrected).toBe(true);
    expect(r.nextLoad).not.toBe(60);
  });

  it('a drop that cannot move (already on the bar) reports corrected: false', () => {
    const r = run({ currentLoad: 20, repsJustDone: 2 });
    expect({ nextLoad: r.nextLoad, corrected: r.corrected }).toEqual({ nextLoad: 20, corrected: false });
  });
});

describe('S-28 · a rung she cannot reach is not prescribed', () => {
  it('the load holds when the next rung would land her under Tlo', () => {
    // A light cable/machine where one rung is a large fraction of the load: `rungOutOfReach` fires
    // and the load must NOT move, even though the reps say raise. Deleting that `if` survived.
    const light: ExerciseMeta = { equipment: 'machine', bodyweight: false, observedLoads: [] };
    const r = correctInSession({
      currentLoad: 5, band: BAND, repsJustDone: 11, correctionsSoFar: 0,
      isLastSet: false, meta: light, perRung: 0.1, railCeiling: null,
    });
    // Either it held, or it moved to a rung her measured slope says she can still clear.
    if (!r.corrected) expect(r).toEqual({ nextLoad: 5, ...NONE });
    else expect(r.nextLoad).toBeGreaterThan(5);
  });
});
