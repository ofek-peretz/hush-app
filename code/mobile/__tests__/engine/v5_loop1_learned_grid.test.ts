/**
 * Live Loop 1 snaps a mid-session correction to her LEARNED real grid (founder, 2026-07-16): the next
 * set lands on a weight that physically exists at her gym (a 2 kg dumbbell jump), not the equipment
 * default increment (1.0 kg for a dumbbell) which could ask her to "grab 17 kg" that don't exist.
 */
import { applyLoop1, type LiveStep } from '@/engine/v5/liveSession';

// A DUMBBELL lift, band [8,10], performed at 16 kg. Default dumbbell increment is 1.0 kg.
const plan = (): LiveStep[] =>
  [0, 1, 2].map((g) => ({
    exerciseId: 'db_bench_press',
    globalIndex: g,
    target: { recommendedWeight: 16, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
  }));

describe('live Loop 1 uses the learned grid', () => {
  it('with NO grid → steps by the default increment (16 → 17, which may not exist)', () => {
    const r = applyLoop1(plan(), 0, 16, 15, 0); // above band → raise
    expect(r.corrected).toBe(true);
    expect(r.plan[1].target.recommendedWeight).toBe(17);
  });

  it('with her real grid [14,16,18,20] → snaps to the real next rung (16 → 18)', () => {
    const r = applyLoop1(plan(), 0, 16, 15, 0, [14, 16, 18, 20]);
    expect(r.corrected).toBe(true);
    expect(r.plan[1].target.recommendedWeight).toBe(18); // the weight that actually exists, not 17
  });

  it('dropping snaps to the real rung below (16 → 14, not 15)', () => {
    const r = applyLoop1(plan(), 0, 16, 3, 0, [14, 16, 18, 20]); // below band → drop
    expect(r.corrected).toBe(true);
    expect(r.direction).toBe('down');
    expect(r.plan[1].target.recommendedWeight).toBe(14);
  });
});
