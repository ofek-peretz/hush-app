/**
 * Replacement logic (UX §1). Swaps are scoped to the slot's MUSCLE group (a subset of
 * its fixed capability): search is in-group and forgiving; Recommended is capped;
 * no-results is a clean dead-end; recents stay in-group; no cross-muscle option ever.
 */
import { searchExercises, recommended, recentsForSlot, allByEquipment } from '@/domain/replacement';
import { exercisesForMuscle, muscleOf, exerciseById } from '@/data/exercises';

describe('search stays in the muscle group and is forgiving', () => {
  it('only ever returns exercises of the current exercise muscle group', () => {
    const res = searchExercises('bb_bench_press', '');
    expect(res.every((e) => e.muscle === 'Chest')).toBe(true);
    expect(res.some((e) => e.id === 'bb_bench_press')).toBe(false); // current excluded
  });

  it('matches synonyms (e.g. "RDL" finds Romanian Deadlift)', () => {
    const res = searchExercises('bb_deadlift', 'rdl');
    expect(res.some((e) => e.id === 'bb_rdl')).toBe(true);
  });

  it('is forgiving of spacing/case ("db press")', () => {
    const res = searchExercises('bb_bench_press', 'DB Press');
    expect(res.some((e) => e.id === 'db_bench_press')).toBe(true);
  });

  it('returns nothing for a query that matches no valid option', () => {
    expect(searchExercises('bb_bench_press', 'zzzznotathing')).toEqual([]);
  });

  it('never offers a cross-muscle option (no squat → calf raise)', () => {
    const res = searchExercises('bb_back_squat', '');
    expect(res.every((e) => e.muscle === 'Quads')).toBe(true);
    expect(res.some((e) => e.id === 'standing_calf_raise')).toBe(false);
  });

  it('keeps every swap inside the slot capability (muscle ⊂ capability)', () => {
    const cap = exerciseById('bb_bench_press')!.capability;
    expect(searchExercises('bb_bench_press', '').every((e) => e.capability === cap)).toBe(true);
  });
});

describe('recommended', () => {
  it('returns at most three, excluding the current exercise', () => {
    const recs = recommended('bb_bench_press');
    expect(recs.length).toBeLessThanOrEqual(3);
    expect(recs.some((e) => e.id === 'bb_bench_press')).toBe(false);
  });
});

describe('recents (Your exercises) stay in-group and exclude current', () => {
  it('filters a mixed recents list to the slot muscle group', () => {
    const recents = ['db_row', 'db_bench_press', 'machine_chest_press', 'bb_bench_press'];
    const yours = recentsForSlot(recents, 'bb_bench_press');
    expect(yours.every((e) => e.muscle === 'Chest')).toBe(true);
    expect(yours.some((e) => e.id === 'bb_bench_press')).toBe(false);
    expect(yours.some((e) => e.id === 'db_row')).toBe(false); // wrong group filtered out
  });
});

describe('all-by-equipment grouping', () => {
  it('covers every in-group alternative across families', () => {
    const muscle = muscleOf('bb_bench_press')!;
    const groups = allByEquipment('bb_bench_press');
    const flat = groups.flatMap((g) => g.exercises.map((e) => e.id));
    const expected = exercisesForMuscle(muscle).filter((e) => e.id !== 'bb_bench_press').map((e) => e.id);
    expect(flat.sort()).toEqual(expected.sort());
  });
});
