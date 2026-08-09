/**
 * Replacement logic (UX §1). Recommended is the muscle-scoped, capped substitute list:
 * in-group only (a subset of the slot capability) and never the current exercise.
 */
// @ts-nocheck

// 

import { recommended, inWorkoutLadder } from '@/domain/replacement';
import { exerciseById } from '@/data/exercises';

describe('recommended', () => {
  it('returns at most three, excluding the current exercise', () => {
    const recs = recommended('bb_bench_press');
    expect(recs.length).toBeLessThanOrEqual(3);
    expect(recs.some((e) => e.id === 'bb_bench_press')).toBe(false);
  });

  it('only ever offers in-group (same-muscle) options', () => {
    expect(recommended('bb_bench_press').every((e) => e.muscle === 'Chest')).toBe(true);
  });

  it('keeps every swap inside the slot capability (muscle ⊂ capability)', () => {
    const cap = exerciseById('bb_bench_press')!.capability;
    expect(recommended('bb_bench_press').every((e) => e.capability === cap)).toBe(true);
  });
});

describe('a swap never offers a lift already in the workout (no duplicate)', () => {
  it('excludes every exercise in the session', () => {
    const full = inWorkoutLadder('bb_bench_press', { sessionExerciseIds: [] });
    expect(full.length).toBeGreaterThan(0);
    const other = full[0]; // a real same-muscle alternative
    const filtered = inWorkoutLadder('bb_bench_press', { sessionExerciseIds: ['bb_bench_press', other] });
    expect(filtered).not.toContain(other);
    expect(full).toContain(other); // sanity: it WOULD be offered without the exclusion
  });

  it('matches the session in the ENGINE id space too', () => {
    // The plan can carry the engine's bare ids ('back_squat') where the catalog uses
    // 'bb_back_squat'. Comparing the two id spaces naively excludes NOTHING — and silently
    // re-offers the lift the athlete just finished.
    const ladder = inWorkoutLadder('leg_press', { sessionExerciseIds: ['leg_press', 'back_squat'] });
    expect(ladder).not.toContain('bb_back_squat');
  });
});
