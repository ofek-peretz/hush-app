/**
 * Replacement logic (UX §1). Search is in-class only and forgiving; Recommended
 * is capped; no-results is a clean dead-end; recents stay in-class.
 */
import { searchExercises, recommended, recentsForSlot, allByEquipment } from '@/domain/replacement';
import { exercisesForCapability } from '@/data/exercises';

describe('search stays in-class and is forgiving', () => {
  it('only ever returns exercises of the slot capability', () => {
    const res = searchExercises('horizontal_push', 'bb_bench_press', '');
    expect(res.every((e) => e.capability === 'horizontal_push')).toBe(true);
    expect(res.some((e) => e.id === 'bb_bench_press')).toBe(false); // current excluded
  });

  it('matches synonyms (e.g. "RDL" finds Romanian Deadlift)', () => {
    const res = searchExercises('hip_dominant', 'back_extension', 'rdl');
    expect(res.some((e) => e.id === 'bb_rdl')).toBe(true);
  });

  it('is forgiving of spacing/case ("db press")', () => {
    const res = searchExercises('horizontal_push', 'bb_bench_press', 'DB Press');
    expect(res.some((e) => e.id === 'db_bench_press')).toBe(true);
  });

  it('returns nothing for a query that matches no valid option', () => {
    expect(searchExercises('horizontal_push', 'bb_bench_press', 'zzzznotathing')).toEqual([]);
  });
});

describe('recommended', () => {
  it('returns at most three, excluding the current exercise', () => {
    const recs = recommended('horizontal_push', 'bb_bench_press');
    expect(recs.length).toBeLessThanOrEqual(3);
    expect(recs.some((e) => e.id === 'bb_bench_press')).toBe(false);
  });
});

describe('recents (Your exercises) stay in-class and exclude current', () => {
  it('filters a mixed recents list to the slot capability', () => {
    const recents = ['db_row', 'db_bench_press', 'machine_chest_press', 'bb_bench_press'];
    const yours = recentsForSlot(recents, 'horizontal_push', 'bb_bench_press');
    expect(yours.every((e) => e.capability === 'horizontal_push')).toBe(true);
    expect(yours.some((e) => e.id === 'bb_bench_press')).toBe(false);
    expect(yours.some((e) => e.id === 'db_row')).toBe(false); // wrong class filtered out
  });
});

describe('all-by-equipment grouping', () => {
  it('covers every in-class alternative across families', () => {
    const groups = allByEquipment('horizontal_push', 'bb_bench_press');
    const flat = groups.flatMap((g) => g.exercises.map((e) => e.id));
    const expected = exercisesForCapability('horizontal_push').filter((e) => e.id !== 'bb_bench_press').map((e) => e.id);
    expect(flat.sort()).toEqual(expected.sort());
  });
});
