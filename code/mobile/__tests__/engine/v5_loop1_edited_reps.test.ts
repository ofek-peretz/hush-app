/**
 * REGRESSION (founder manual QA, Build #33) — Loop 1 must read the athlete's DECLARED band, not the
 * reps she just logged. On the phone the only way to log reps ≠ target is the edit wheel, which
 * overwrites `target.recommendedReps` with the performed reps (sessionStore.editCurrentSet). If Loop 1
 * derives its band from `recommendedReps`, the band tracks her input and every set is "in band" → the
 * load never moves, no matter how many reps she enters. The immutable Tlo lives in `repBandLo`.
 */
// @ts-nocheck

// 

import { applyLoop1, type LiveStep } from '@/engine/v5/liveSession';

// A machine lift, band [8,10]. Three working sets at 34 kg. After an edit, set 0's recommendedReps has
// been CLOBBERED to the performed reps (what editCurrentSet does), but repBandLo/repBandHi stand.
const editedPlan = (performed: number): LiveStep[] =>
  [0, 1, 2].map((g) => ({
    exerciseId: 'machine_chest_press',
    globalIndex: g,
    target: {
      recommendedWeight: 34,
      recommendedReps: g === 0 ? performed : 8, // set 0 was edited to her actual reps
      repBandLo: 8,
      repBandHi: 10,
    },
  }));

describe('Loop 1 reads the declared band, not the edited actual reps', () => {
  it('30 reps (edited) at band [8,10] → the remaining sets go UP', () => {
    const r = applyLoop1(editedPlan(30), 0, 34, 30, 0);
    expect(r.corrected).toBe(true);
    expect(r.direction).toBe('up');
    expect(r.plan[1].target!.recommendedWeight!).toBeGreaterThan(34);
  });

  it('2 reps (edited) at band [8,10] → the remaining sets go DOWN', () => {
    const r = applyLoop1(editedPlan(2), 0, 34, 2, 0);
    expect(r.corrected).toBe(true);
    expect(r.direction).toBe('down');
    expect(r.plan[1].target!.recommendedWeight!).toBeLessThan(34);
  });

  it('a set inside the declared band still leaves the plan untouched', () => {
    const r = applyLoop1(editedPlan(9), 0, 34, 9, 0);
    expect(r.corrected).toBe(false);
    expect(r.plan[1].target!.recommendedWeight).toBe(34);
  });
});
