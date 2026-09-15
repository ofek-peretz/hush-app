/**
 * F-18 · the per-set fit — one e1RM per POSITION in the exercise.
 *
 * ⚠️ THE MODULE IS NOT WIRED (see its header): wiring it measured worse, because L10's anchor is the
 * median of the loads that met Tlo and a descending ramp drags that median down one rung a session.
 * These tests exist so the fit itself is proven correct BEFORE the Loop 2 change that will let it
 * run — the next attempt should be able to trust this half completely.
 */
// @ts-nocheck

//

import { e1rmAtPosition, decayFactors, rampedLoads } from '@/engine/v5/perSetShape';
import { MIN_PER_SET_SAMPLES } from '@/engine/v5/constants';
import { epley } from '@/engine/loadMath';

/** One occurrence: every set at `load`, with the reps she got at each position. */
const occ = (load: number, reps: number[]) => ({ load, sets: reps.map((r) => ({ load, reps: r, restBeforeS: 90 })) });

describe('her e1RM at one position in the exercise', () => {
  it('is the median of that position across occurrences — one sample per occurrence', () => {
    const h = [occ(60, [10, 9, 8]), occ(60, [10, 9, 8]), occ(60, [12, 9, 8])];
    expect(e1rmAtPosition(h, 0)).toBeCloseTo(epley(60, 10), 6); // median of 10, 10, 12 reps
    expect(e1rmAtPosition(h, 2)).toBeCloseTo(epley(60, 8), 6);
  });

  it('⛔ FALLS with position — that IS the fatigue, and it is measured, never modelled', () => {
    const h = [occ(60, [10, 9, 8, 7]), occ(60, [10, 9, 8, 7])];
    const e = [0, 1, 2, 3].map((i) => e1rmAtPosition(h, i));
    expect(e[0]).toBeGreaterThan(e[1]);
    expect(e[1]).toBeGreaterThan(e[2]);
    expect(e[2]).toBeGreaterThan(e[3]);
  });

  it('⚠️ …and does NOT fall when she was never near failure — the RIR question, answered by the log', () => {
    // 10/10/10/10 at one load is a set of easy sets. Nothing was asked of her to learn this.
    const h = [occ(60, [10, 10, 10, 10]), occ(60, [10, 10, 10, 10])];
    expect(e1rmAtPosition(h, 0)).toBeCloseTo(e1rmAtPosition(h, 3)!, 6);
  });

  it('is null when the position was never reached', () => {
    expect(e1rmAtPosition([], 0)).toBeNull();
  });

  it('is null for a position that occurrence never reached', () => {
    const h = [occ(60, [10, 9]), occ(60, [10, 9])];
    expect(e1rmAtPosition(h, 3)).toBeNull();
  });
});

describe('⛔ the shape is ONE pooled rate, not k free parameters', () => {
  const band = { lo: 8, hi: 10 };
  const bb = { equipment: 'barbell', bodyweight: false };
  const occ2 = (load, reps) => ({ load, sets: reps.map((r) => ({ load, reps: r, restBeforeS: 90 })) });

  it(`is flat below ${MIN_PER_SET_SAMPLES} samples (F-18) — and a sample is a POSITION, not a session`, () => {
    // One occurrence of a three-set lift is two samples, not one — and still under the gate.
    expect(decayFactors([occ2(60, [10, 9, 8])], 3)).toEqual([1, 1, 1]);
    expect(decayFactors([], 3)).toEqual([1, 1, 1]);
  });

  it('descends, and its MEAN is 1 — so the ramp redistributes `base` instead of cutting it', () => {
    const h = [occ2(60, [12, 11, 10, 9]), occ2(60, [12, 11, 10, 9])];
    const f = decayFactors(h, 4);
    expect(f[0]).toBeGreaterThan(1); // set 1 is asked for MORE than the flat number
    expect(f[3]).toBeLessThan(1); // …and the last set for less
    const mean = f.reduce((a, b) => a + b, 0) / f.length;
    expect(mean).toBeCloseTo(1, 6);
  });

  it('⚠️ a wild single set cannot set the shape — that is what the pooling buys', () => {
    // The exact failure a per-position fit produced: one mis-corrected set at a third of the load.
    const clean = [occ2(60, [12, 11, 10, 9]), occ2(60, [12, 11, 10, 9]), occ2(60, [12, 11, 10, 9])];
    const withWild = [
      { load: 60, sets: [{ load: 60, reps: 12 }, { load: 20, reps: 25 }, { load: 60, reps: 10 }, { load: 60, reps: 9 }] },
      ...clean,
    ];
    const a = decayFactors(clean, 4);
    const b = decayFactors(withWild, 4);
    for (let i = 0; i < 4; i += 1) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.02);
  });

  it('the ramp it produces lands on real rungs and averages to `base`', () => {
    const f = decayFactors([occ2(60, [12, 11, 10, 9]), occ2(60, [12, 11, 10, 9])], 4);
    const loads = rampedLoads(60, f, bb);
    for (const l of loads) expect(Math.round(l * 4) / 4).toBe(l);
    const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
    expect(Math.abs(mean - 60)).toBeLessThan(2.5); // within one rung of centre
  });

  it('never rises across the exercise — fatigue has a direction', () => {
    const f = decayFactors([occ2(60, [9, 11, 12, 13]), occ2(60, [9, 11, 12, 13])], 4);
    for (let i = 1; i < 4; i += 1) expect(f[i]).toBeLessThanOrEqual(f[i - 1]);
  });
});
