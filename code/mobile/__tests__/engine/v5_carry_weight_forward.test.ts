/**
 * Carry-forward of an edited weight (founder ruling, 2026-07-16) — a weight the athlete actually lifts
 * becomes the baseline for the REST of the exercise, up OR down, instead of reverting to the
 * prescription every set. Loop 1's rep-based correction then applies on top of that baseline.
 */
// @ts-nocheck

// 

import { applyLoop1, carryWeightForward, type LiveStep } from '@/engine/v5/liveSession';

// A machine lift, band [8,10], prescribed 34 kg for 4 sets.
const plan = (weight = 34): LiveStep[] =>
  [0, 1, 2, 3].map((g) => ({
    exerciseId: 'machine_chest_press',
    globalIndex: g,
    target: { recommendedWeight: weight, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
  }));

describe('carryWeightForward', () => {
  it('edit DOWN (30 kg loaded) sticks to every remaining set', () => {
    const out = carryWeightForward(plan(34), 0, 30);
    expect(out[1].target!.recommendedWeight).toBe(30);
    expect(out[2].target!.recommendedWeight).toBe(30);
    expect(out[3].target!.recommendedWeight).toBe(30);
    expect(out[0].target!.recommendedWeight).toBe(34); // the completed set's own record is untouched
  });

  it('edit UP (40 kg loaded) sticks to every remaining set', () => {
    const out = carryWeightForward(plan(34), 0, 40);
    expect(out[1].target!.recommendedWeight).toBe(40);
    expect(out[3].target!.recommendedWeight).toBe(40);
  });

  it('completing at exactly the prescription is a true no-op (same reference)', () => {
    const p = plan(34);
    expect(carryWeightForward(p, 0, 34)).toBe(p);
  });

  it('bodyweight (null) and the last set are no-ops', () => {
    const p = plan(34);
    expect(carryWeightForward(p, 0, null)).toBe(p);
    expect(carryWeightForward(p, 3, 30)).toBe(p); // nothing ahead of the last set
  });

  it('only the SAME exercise is carried, not the next lift', () => {
    const mixed: LiveStep[] = [
      { exerciseId: 'machine_chest_press', globalIndex: 0, target: { recommendedWeight: 34, recommendedReps: 8, repBandLo: 8, repBandHi: 10 } },
      { exerciseId: 'machine_chest_press', globalIndex: 1, target: { recommendedWeight: 34, recommendedReps: 8, repBandLo: 8, repBandHi: 10 } },
      { exerciseId: 'lat_pulldown', globalIndex: 2, target: { recommendedWeight: 50, recommendedReps: 8, repBandLo: 8, repBandHi: 10 } },
    ];
    const out = carryWeightForward(mixed, 0, 30);
    expect(out[1].target!.recommendedWeight).toBe(30);
    expect(out[2].target!.recommendedWeight).toBe(50); // the other exercise is untouched
  });
});

describe('carry-forward composed with Loop 1 (the store order: carry, then correct)', () => {
  it('edit DOWN + reps IN band → remaining sets take the edited weight (no correction)', () => {
    const carried = carryWeightForward(plan(34), 0, 30);
    const l1 = applyLoop1(carried, 0, 30, 9, 0); // 9 is inside [8,10]
    expect(l1.corrected).toBe(false);
    expect(l1.plan[1].target!.recommendedWeight).toBe(30);
  });

  it('edit DOWN + reps ABOVE band → Loop 1 raises FROM the edited weight, not the prescription', () => {
    const carried = carryWeightForward(plan(34), 0, 30);
    const l1 = applyLoop1(carried, 0, 30, 15, 0); // too light at 30
    expect(l1.corrected).toBe(true);
    expect(l1.direction).toBe('up');
    expect(l1.plan[1].target!.recommendedWeight!).toBeGreaterThan(30);
    expect(l1.plan[1].target!.recommendedWeight!).toBeLessThan(34); // rose from 30, nowhere near the old 34
  });

  it('edit UP + reps BELOW band → Loop 1 drops FROM the edited weight', () => {
    const carried = carryWeightForward(plan(34), 0, 40);
    const l1 = applyLoop1(carried, 0, 40, 5, 0); // too heavy at 40
    expect(l1.corrected).toBe(true);
    expect(l1.direction).toBe('down');
    expect(l1.plan[1].target!.recommendedWeight!).toBeLessThan(40);
    expect(l1.plan[1].target!.recommendedWeight!).toBeGreaterThan(34); // dropped from 40, still above the old 34
  });
});
