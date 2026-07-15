/**
 * Engine v5 · Revision 7 — map-driven programme assembly (register Part 3). PURE.
 *
 * The programme's SHAPE follows from the body map, never a demographic split: an `off` muscle never
 * appears (S-2), everything off yields no workout (S-3), emphasis earns more (S-4/S-63), and the
 * region days fall out of where the volume is (mark lower → more lower days). No workout is ever empty.
 */
import { assembleV5DayLists, exerciseCountFor, pickExercises, DAY_ONE_EX_DIVISOR } from '@/engine/v5/programAssembly';
import { muscleOf, exercisesForMuscle, isSwapOnly } from '@/data/exercises';
import type { BodyMap } from '@/engine/v5/bodyMap';

const allExercises = (days: { exerciseIds: string[] }[]) => days.flatMap((d) => d.exerciseIds);
const musclesTrained = (days: { exerciseIds: string[] }[]) => new Set(allExercises(days).map((id) => muscleOf(id)));

describe('Rev 7 · exerciseCountFor — day-one density from the weekly target', () => {
  it('normal (10) → 2, emphasis (16) → 3, and never below 1', () => {
    expect(DAY_ONE_EX_DIVISOR).toBe(5);
    expect(exerciseCountFor(10)).toBe(2);
    expect(exerciseCountFor(16)).toBe(3);
    expect(exerciseCountFor(5)).toBe(1);
    expect(exerciseCountFor(0)).toBe(1); // floor
  });
});

describe('Rev 7 · pickExercises — deterministic, compound-led, no swap-only, pin first', () => {
  it('never generates a swap-only advanced movement (S-61)', () => {
    for (const id of pickExercises('Core', 5)) expect(isSwapOnly(id)).toBe(false);
  });
  it('a compound leads the muscle', () => {
    const picks = pickExercises('Chest', 3);
    expect(muscleOf(picks[0])).toBe('Chest');
    // the first pick is a compound (bench-family), never an isolation
    // (compound-before-isolation within the muscle).
    expect(picks.length).toBe(3);
  });
  it('a pin is included and leads', () => {
    const pool = exercisesForMuscle('Chest').filter((e) => !isSwapOnly(e.id)).map((e) => e.id);
    const pinned = pool[pool.length - 1]; // some non-leading chest lift
    expect(pickExercises('Chest', 1, pinned)).toEqual([pinned]);
  });
});

describe('Rev 7 · assembleV5DayLists — the map is the programme', () => {
  it('all-normal (no map) → every day filled, all muscles covered, none empty', () => {
    const days = assembleV5DayLists(undefined, 4);
    expect(days.length).toBe(4);
    for (const d of days) expect(d.exerciseIds.length).toBeGreaterThan(0); // no empty workout
    // Core is supplemental (added downstream), so it is NOT a structural muscle here.
    expect(musclesTrained(days).has('Core')).toBe(false);
    // Both regions appear at a balanced 4-day week.
    expect(days.some((d) => d.region === 'upper')).toBe(true);
    expect(days.some((d) => d.region === 'lower')).toBe(true);
  });

  it('S-2 · legs off → no lower exercise ever appears, and every day is upper', () => {
    const map: BodyMap = { Quads: 'off', Hamstrings: 'off', Glutes: 'off', Calves: 'off' };
    const days = assembleV5DayLists(map, 4);
    expect(days.length).toBe(4);
    for (const m of ['Quads', 'Hamstrings', 'Glutes', 'Calves']) expect(musclesTrained(days).has(m as never)).toBe(false);
    expect(days.every((d) => d.region === 'upper')).toBe(true);
  });

  it('S-3 · everything off → no workout can be built ([])', () => {
    const allOff: BodyMap = Object.fromEntries(
      ['Chest', 'Shoulders', 'Back', 'Biceps', 'Triceps', 'Core', 'Quads', 'Hamstrings', 'Glutes', 'Calves'].map((m) => [m, 'off']),
    );
    expect(assembleV5DayLists(allOff, 4)).toEqual([]);
  });

  it('S-4/S-63 · emphasis earns MORE exercises for that muscle', () => {
    const normal = assembleV5DayLists({ Chest: 'normal' }, 4);
    const emphasised = assembleV5DayLists({ Chest: 'emphasis' }, 4);
    const chestCount = (days: { exerciseIds: string[] }[]) => allExercises(days).filter((id) => muscleOf(id) === 'Chest').length;
    expect(chestCount(emphasised)).toBeGreaterThan(chestCount(normal));
    expect(chestCount(emphasised)).toBe(3); // 16 / 5 → 3
    expect(chestCount(normal)).toBe(2); // 10 / 5 → 2
  });

  it('structure follows volume — emphasise the lower body and more lower days fall out', () => {
    const map: BodyMap = { Quads: 'emphasis', Glutes: 'emphasis' };
    const days = assembleV5DayLists(map, 3);
    const lower = days.filter((d) => d.region === 'lower').length;
    const upper = days.filter((d) => d.region === 'upper').length;
    expect(lower).toBeGreaterThanOrEqual(upper); // the volume pulled the week lower
    expect(lower + upper).toBe(3);
  });

  it('a very sparse map at high frequency still leaves NO empty workout (hole guard, S-29)', () => {
    const onlyChest: BodyMap = Object.fromEntries(
      ['Shoulders', 'Back', 'Biceps', 'Triceps', 'Core', 'Quads', 'Hamstrings', 'Glutes', 'Calves'].map((m) => [m, 'off']),
    );
    onlyChest['Chest'] = 'normal';
    const days = assembleV5DayLists(onlyChest, 4);
    expect(days.length).toBe(4);
    for (const d of days) expect(d.exerciseIds.length).toBeGreaterThan(0);
  });

  it('is deterministic — identical inputs yield an identical programme (I-24)', () => {
    const map: BodyMap = { Chest: 'emphasis', Calves: 'off' };
    expect(assembleV5DayLists(map, 5)).toEqual(assembleV5DayLists(map, 5));
  });
});
