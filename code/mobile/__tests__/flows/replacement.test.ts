/**
 * Replacement logic (UX §1). The offered menu is muscle-scoped and capped: in-group only (a subset
 * of the slot capability) and never the current exercise.
 *
 * ⚠️ REPOINTED 2026-08-16, WHEN `domain/replacement` WAS DELETED. It had become a file of pure
 * re-exports plus two functions no screen imported — `recommended` and `inWorkoutLadder`, the
 * latter a one-line alias for `swapLadder` documenting an S4 one-tap ladder the swap sheet
 * replaced. Both were alive only in these tests, which is the quietest way for dead code to look
 * maintained. The assertions were worth keeping and are now made against the functions that SHIP:
 * `swapChoices` (what she is actually offered) and `swapLadder`.
 */
// @ts-nocheck

//

import { swapChoices, swapLadder } from '@/domain/swapPool';
import { exerciseById } from '@/data/exercises';

const offered = (id: string) => swapChoices(id, { sessionExerciseIds: [] }).map((c) => c.exercise);

describe('the offered menu', () => {
  it('returns at most three, excluding the current exercise', () => {
    const recs = offered('bb_bench_press');
    expect(recs.length).toBeLessThanOrEqual(3);
    expect(recs.some((e) => e.id === 'bb_bench_press')).toBe(false);
  });

  it('only ever offers in-group (same-muscle) options', () => {
    expect(offered('bb_bench_press').every((e) => e.muscle === 'Chest')).toBe(true);
  });

  it('keeps every swap inside the slot capability (muscle ⊂ capability)', () => {
    const cap = exerciseById('bb_bench_press')!.capability;
    expect(offered('bb_bench_press').every((e) => e.capability === cap)).toBe(true);
  });
});

describe('a swap never offers a lift already in the workout (no duplicate)', () => {
  it('excludes every exercise in the session', () => {
    const full = swapLadder('bb_bench_press', { sessionExerciseIds: [] });
    expect(full.length).toBeGreaterThan(0);
    const other = full[0]; // a real same-muscle alternative
    const filtered = swapLadder('bb_bench_press', { sessionExerciseIds: ['bb_bench_press', other] });
    expect(filtered).not.toContain(other);
    expect(full).toContain(other); // sanity: it WOULD be offered without the exclusion
  });

  it('matches the session in the ENGINE id space too', () => {
    // The plan can carry the engine's bare ids ('back_squat') where the catalog uses
    // 'bb_back_squat'. Comparing the two id spaces naively excludes NOTHING — and silently
    // re-offers the lift the athlete just finished.
    const ladder = swapLadder('leg_press', { sessionExerciseIds: ['leg_press', 'back_squat'] });
    expect(ladder).not.toContain('bb_back_squat');
  });
});
