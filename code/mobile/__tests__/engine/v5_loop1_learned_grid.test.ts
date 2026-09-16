/**
 * Live Loop 1 snaps a mid-session correction to her LEARNED real grid (founder, 2026-07-16): the next
 * set lands on a weight that physically exists at her gym (a 2 kg dumbbell jump), not the equipment
 * default increment (1.0 kg for a dumbbell) which could ask her to "grab 17 kg" that don't exist.
 */
// @ts-nocheck

// 

import { applyLoop1, type LiveStep } from '@/engine/v5/liveSession';

// A DUMBBELL lift, band [8,10], performed at 16 kg. Default dumbbell increment is 1.0 kg.
const plan = (): LiveStep[] =>
  [0, 1, 2].map((g) => ({
    exerciseId: 'db_bench_press',
    globalIndex: g,
    target: { recommendedWeight: 16, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
  }));

/*
 * ⚠️ THE REP COUNTS HERE ARE DELIBERATELY JUST OUTSIDE THE BAND (11 and 7, not 15 and 3).
 *
 * This file's subject is WHERE a correction lands — her learned grid versus the equipment default —
 * and that is only legible when the move is exactly one rung. Since B-5 was derived (2026-08-16) a
 * big miss moves SEVERAL rungs, so the old 15- and 3-rep fixtures were measuring two things at once:
 * 15 reps at 16 kg is now a two-rung raise (18 kg on the default increment, which is the same number
 * the learned grid gives, and the test would have passed while proving nothing). A one-rep miss
 * isolates the snap. The magnitude itself is covered in `v5_reps_per_rung` and `v5_loop1_every_branch`.
 *
 * Since F-20 (2026-08-25) a lone 1-rep miss WAITS for a second witness, so every case here passes
 * `prevReps` that missed the same way — the witness is present, and the snap stays the subject.
 */
describe('live Loop 1 uses the learned grid', () => {
  it('with NO grid → steps by the default increment (16 → 17, which may not exist)', () => {
    const r = applyLoop1(plan(), 0, 16, 11, 0, undefined, null, 11); // 1 over, witnessed (F-20)
    expect(r.corrected).toBe(true);
    expect(r.plan[1].target!.recommendedWeight).toBe(17);
  });

  it('with her real grid [14,16,18,20] → snaps to the real next rung (16 → 18)', () => {
    const r = applyLoop1(plan(), 0, 16, 11, 0, [14, 16, 18, 20], null, 11);
    expect(r.corrected).toBe(true);
    expect(r.plan[1].target!.recommendedWeight).toBe(18); // the weight that actually exists, not 17
  });

  it('dropping snaps to the real rung below (16 → 14, not 15)', () => {
    const r = applyLoop1(plan(), 0, 16, 7, 0, [14, 16, 18, 20], null, 7); // 1 short, witnessed (F-20)
    expect(r.corrected).toBe(true);
    expect(r.direction).toBe('down');
    expect(r.plan[1].target!.recommendedWeight).toBe(14);
  });
});
