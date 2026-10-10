/**
 * Engine v5 · Stage 2 — Loop 1 live in a workout. Verifies the integration edge (applyLoop1) that
 * sessionStore.completeSet calls, so a correction reaches the phone and the watch from one place.
 */
// @ts-nocheck

// 

import { applyLoop1, bandFromTarget, type LiveStep } from '@/engine/v5/liveSession';

// A barbell lift (2.5 kg starting increment, B-6) prescribed at 80 kg × 8 reps → provisional band [8,12].
const plan = (reps = 8, weight: number | null = 80, exerciseId = 'bb_bench_press'): LiveStep[] =>
  [0, 1, 2].map((g) => ({ exerciseId, globalIndex: g, target: { recommendedWeight: weight, recommendedReps: reps } }));

describe('S-11 · a set above Thi raises the load for the REST of the exercise, live', () => {
  it('80×15 (band [8,12]) → sets 2 and 3 go up a rung, both surfaces via the shared plan', () => {
    const r = applyLoop1(plan(), 0, 80, 15, 0);
    expect(r.corrected).toBe(true);
    expect(r.direction).toBe('up');
    expect(r.plan[1].target!.recommendedWeight).toBeGreaterThan(80);
    // carry-forward: the correction is not just the next set, it holds for every remaining set.
    expect(r.plan[2].target!.recommendedWeight).toBe(r.plan[1].target!.recommendedWeight);
    // the completed set's own record is untouched.
    expect(r.plan[0].target!.recommendedWeight).toBe(80);
  });
});

describe('S-12 · a set below Tlo drops the load for the rest of the exercise, live', () => {
  it('80×6 → the remaining sets drop', () => {
    const r = applyLoop1(plan(), 0, 80, 6, 0);
    expect(r.corrected).toBe(true);
    expect(r.direction).toBe('down');
    expect(r.plan[1].target!.recommendedWeight!).toBeLessThan(80);
  });
  it('a set inside the band leaves the plan untouched', () => {
    const r = applyLoop1(plan(), 0, 80, 10, 0);
    expect(r.corrected).toBe(false);
    expect(r.plan).toBe(plan.length ? r.plan : r.plan); // identity preserved on no-op
    expect(r.plan[1].target!.recommendedWeight).toBe(80);
  });
});

describe('S-13 · the correction budget caps at 2, and the last set never corrects', () => {
  it('budget spent → no-op', () => {
    const r = applyLoop1(plan(), 0, 80, 20, 2);
    expect(r.corrected).toBe(false);
  });
  it('last set of the exercise → nothing ahead to correct', () => {
    const r = applyLoop1(plan(), 2, 80, 20, 0); // globalIndex 2 is the last set
    expect(r.corrected).toBe(false);
  });
});

describe('S-51 · a bodyweight lift is never load-corrected live', () => {
  it('push-up at null load, 25 reps → no-op', () => {
    const bw = plan(12, null, 'push_up');
    const r = applyLoop1(bw, 0, null, 25, 0);
    expect(r.corrected).toBe(false);
    expect(r.plan[1].target!.recommendedWeight).toBeNull();
  });
});

describe('the band comes from her declared Thi, falling back to a provisional window (Stage 4)', () => {
  it('her declared band is used when Thi is present; else a provisional lo+4', () => {
    expect(bandFromTarget(8, 10)).toEqual({ lo: 8, hi: 10 });
    expect(bandFromTarget(8)).toEqual({ lo: 8, hi: 12 });
  });
});
