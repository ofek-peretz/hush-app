/**
 * Replacement logic (UX §1). Recommended is the muscle-scoped, capped substitute list:
 * in-group only (a subset of the slot capability) and never the current exercise.
 */
import { recommended, swapLadder } from '@/domain/replacement';
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

describe('swapLadder never offers a lift already in the workout (no duplicate)', () => {
  it('excludes exercises passed in the exclude set', () => {
    const full = swapLadder('bb_bench_press');
    expect(full.length).toBeGreaterThan(0);
    const other = full[0]; // a real same-muscle alternative
    const filtered = swapLadder('bb_bench_press', undefined, [other]);
    expect(filtered).not.toContain(other);
    expect(full).toContain(other); // sanity: it WOULD be offered without the exclusion
  });
});
