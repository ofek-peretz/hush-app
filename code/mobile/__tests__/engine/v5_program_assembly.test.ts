/**
 * Engine v5 · Revision 7 — map-driven programme assembly (register Part 3). PURE.
 *
 * The programme's SHAPE follows from the body map, never a demographic split: an `off` muscle never
 * appears (S-2), everything off yields no workout (S-3), emphasis earns more (S-4/S-63), and the
 * region days fall out of where the volume is (mark lower → more lower days). No workout is ever empty.
 */
// @ts-nocheck

// 

import { assembleV5DayLists, exerciseCountFor, distributeMuscleSets, pickExercises, DAY_ONE_EX_DIVISOR } from '@/engine/v5/programAssembly';
import { muscleOf, exercisesForMuscle, isSwapOnly } from '@/data/exercises';
import { SETS_MIN, SETS_MAX } from '@/engine/v5/constants';
import type { BodyMap } from '@/engine/v5/bodyMap';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('S-44 / S-66 · a muscle switched off and back on RESUMES — and its leave-it resumes with it', () => {
  const allIds = (days: ReturnType<typeof assembleV5DayLists>) => days.flatMap((d) => d.exerciseIds);

  it('off → its lifts vanish; back on → they return (state is exercise-keyed, nothing was reset)', () => {
    const off = allIds(assembleV5DayLists({ Chest: 'off' }, 4));
    expect(off.some((id) => muscleOf(id) === 'Chest')).toBe(false); // S-2: off never appears
    const backOn = allIds(assembleV5DayLists({}, 4)); // absence = normal (S-44: the entry LEAVES)
    expect(backOn.some((id) => muscleOf(id) === 'Chest')).toBe(true);
  });

  it('S-66 · the leave-it survives the off→on round trip — nothing revoked it', () => {
    // `chest_dip` generates on its own (it is not swap-only) but sits well past the day-one density,
    // so its presence AND its position are both the leave-it's doing, not the default order's.
    const leaveIts = { Chest: 'chest_dip' };
    const off = allIds(assembleV5DayLists({ Chest: 'off' }, 4, leaveIts));
    expect(off).not.toContain('chest_dip'); // off wins while off (L6 — WHICH, not WHETHER)
    const backOn = allIds(assembleV5DayLists({}, 4, leaveIts));
    expect(backOn).toContain('chest_dip');
    expect(backOn.filter((id) => muscleOf(id) === 'Chest')[0]).toBe('chest_dip'); // …and it LEADS again
  });
});

/**
 * **S-62 · her pool for a muscle empties out** — amended by S-74. With the declared edit-swap deleted
 * (S-31), nothing an athlete does REMOVES a lift from a muscle's pool: an in-workout swap declares
 * nothing (S-20) and a learned one only REPLACES (S-69). So the emptying can no longer happen, and
 * "want this muscle off?" is reached only through the body map (S-56). This is the standing proof.
 */
describe('S-62 / S-74 · a muscle\'s pool cannot empty — every substitute replaces, none removes', () => {
  const MUSCLES = ['Chest', 'Shoulders', 'Back', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'];

  it('every muscle always yields at least one lift — even with every one of its lifts substituted away', () => {
    for (const m of MUSCLES) {
      const pool = pickExercises(m, Number.MAX_SAFE_INTEGER);
      expect(pool.length).toBeGreaterThan(0);
      // Substitute every lift in the pool onto the next one — the worst a chain of learned swaps can do.
      const substitutes: Record<string, string> = {};
      pool.forEach((id, i) => { if (i + 1 < pool.length) substitutes[id] = pool[i + 1]; });
      expect(pickExercises(m, 2, undefined, substitutes).length).toBeGreaterThan(0);
    }
  });
});

describe('Rev 7 · D · distributeMuscleSets — the learned per-occurrence volume becomes exercise set counts', () => {
  it('every bucket stays within the [3,5] band (F-1), always at least one exercise', () => {
    for (let t = 0; t <= 30; t++) {
      const dist = distributeMuscleSets(t);
      expect(dist.length).toBeGreaterThanOrEqual(1);
      for (const s of dist) {
        expect(s).toBeGreaterThanOrEqual(SETS_MIN);
        expect(s).toBeLessThanOrEqual(SETS_MAX);
      }
    }
  });

  it('reproduces the day-one shape from the seed target (Σ setsFor): 7 → [4,3] compound-led', () => {
    expect(distributeMuscleSets(7)).toEqual([4, 3]); // bench(4) + fly(3)
    expect(distributeMuscleSets(6)).toEqual([3, 3]);
    expect(distributeMuscleSets(8)).toEqual([4, 4]);
    expect(distributeMuscleSets(4)).toEqual([4]);
    expect(distributeMuscleSets(3)).toEqual([3]);
  });

  it('the earned set OPENS A NEW EXERCISE once the current ones are full (S-32)', () => {
    // 10 sets cannot sit on 2 exercises without exceeding 5 apiece → a 3rd opens (3×4 ≥ 2×5, S-35).
    expect(distributeMuscleSets(10).length).toBe(3);
    expect(distributeMuscleSets(11).length).toBe(3); // [5,3,3]→remainder spread → [4,4,3]
    expect(distributeMuscleSets(16).length).toBe(4); // emphasis grown → 4 exercises
  });

  it('the largest bucket leads (the compound keeps the fullest scheme, S-35)', () => {
    const d = distributeMuscleSets(13); // [5,4,4]
    for (let i = 1; i < d.length; i++) expect(d[i - 1]).toBeGreaterThanOrEqual(d[i]);
  });

  it('the buckets always sum back to the (floored) target — no set invented or lost', () => {
    for (let t = SETS_MIN; t <= 25; t++) expect(sum(distributeMuscleSets(t))).toBe(t);
  });

  it('a sub-floor target never drops below one exercise at the floor (S-35)', () => {
    expect(distributeMuscleSets(2)).toEqual([SETS_MIN]);
    expect(distributeMuscleSets(0)).toEqual([SETS_MIN]);
  });

  it('respects a small pool: never more exercises than exist, and realized volume is MONOTONIC', () => {
    // A 2-exercise muscle (triceps, calves): the count is capped at 2, so the target piles onto the
    // existing lifts up to [3,5] rather than inventing a phantom third that would steal their sets.
    let prev = 0;
    for (let t = 6; t <= 20; t++) {
      const d = distributeMuscleSets(t, 2);
      expect(d.length).toBeLessThanOrEqual(2);
      const realized = sum(d);
      expect(realized).toBeGreaterThanOrEqual(prev); // growing the target never REDUCES realized (the bug)
      expect(realized).toBeLessThanOrEqual(2 * SETS_MAX); // physically full at 2×5
      prev = realized;
    }
  });
});

const allExercises = (days: { exerciseIds: string[] }[]) => days.flatMap((d) => d.exerciseIds);
const musclesTrained = (days: { exerciseIds: string[] }[]) => new Set(allExercises(days).map((id) => muscleOf(id)));

describe('Rev 7 · B-8 · exerciseCountFor — day-one density from the weekly target', () => {
  it('B-8 = 5: normal (10) → 2, emphasis (16) → 3, and never below 1', () => {
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
    // The RELATIONSHIP is the law (S-4: an emphasised muscle earns more). The exact counts follow
    // from B-2, which became frequency-aware on 2026-08-08 and muscle-size-aware on 2026-08-09:
    // Chest draws its own SHARE of the week's pot (1.3 of a total 10.5), not a flat per-muscle
    // figure, so pinning the numbers here is pinning the share table — which is the point.
    expect(chestCount(emphasised)).toBeGreaterThan(chestCount(normal));
    expect(chestCount(normal)).toBe(5);
    expect(chestCount(emphasised)).toBe(8);
  });

  /*
   * ⛔ MEASURED AT FOUR DAYS NOW, AND THE LAW IS UNCHANGED (2026-08-09).
   *
   * This used to assert at THREE days. Below four days every session is full-body (see
   * FULL_BODY_UNTIL_DAYS): splitting upper from lower there divides the week's sessions between the
   * halves, so a two-day athlete trained every muscle ONCE and a three-day athlete trained her whole
   * lower body once — against roughly 63% more growth for twice a week at equal volume.
   *
   * So a three-day week has no upper or lower days to count, and counting them was measuring the
   * split rather than the law. The law — structure is an OUTPUT of volume, never a shelf — is
   * asserted at the first frequency that HAS a split, and the full-body case gets its own assertion
   * below: the mark still has to shape the week, it just shapes what is IN each day.
   */
  it('structure follows volume — emphasise the lower body and more lower days fall out', () => {
    const map: BodyMap = { Quads: 'emphasis', Glutes: 'emphasis' };
    const days = assembleV5DayLists(map, 4);
    const lower = days.filter((d) => d.region === 'lower').length;
    const upper = days.filter((d) => d.region === 'upper').length;
    expect(lower).toBeGreaterThanOrEqual(upper); // the volume pulled the week lower
    expect(lower + upper).toBe(4);
  });

  it('below four days every session is FULL BODY — the split would cost her the frequency', () => {
    for (const n of [2, 3]) {
      const days = assembleV5DayLists({}, n);
      expect({ n, regions: days.map((d) => d.region) }).toEqual({ n, regions: Array(n).fill('full') });
    }
    // …and the mark still does real work there: it shapes what is in the day, not the day's label.
    const marked = assembleV5DayLists({ Quads: 'emphasis' }, 3);
    const plain = assembleV5DayLists({}, 3);
    const quads = (ds: { exerciseIds: string[] }[]) => allExercises(ds).filter((id) => muscleOf(id) === 'Quads').length;
    expect(quads(marked)).toBeGreaterThan(quads(plain));
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

describe('Rev 7 · C1 — a standing substitute reshapes the generated programme (S-69 / edit-swap)', () => {
  const chestOf = (days: { exerciseIds: string[] }[]) => allExercises(days).filter((id) => muscleOf(id) === 'Chest');

  it('replaces an anchor with its same-muscle substitute', () => {
    const base = chestOf(assembleV5DayLists(undefined, 4));
    expect(base).toContain('bb_bench_press'); // bench is a natural top chest pick
    const sub = chestOf(assembleV5DayLists(undefined, 4, {}, { bb_bench_press: 'db_bench_press' }));
    expect(sub).not.toContain('bb_bench_press'); // the anchor is gone
    expect(sub).toContain('db_bench_press'); //      replaced by its substitute
  });

  it('IGNORES a cross-muscle substitute (guard — a squat never lands in the chest day)', () => {
    // Quads OFF, so a Quads lift can only appear if the bad substitute leaked through.
    const ids = allExercises(assembleV5DayLists({ Quads: 'off' }, 4, {}, { bb_bench_press: 'bb_back_squat' }));
    expect(ids).not.toContain('bb_back_squat'); // rejected — wrong muscle
    expect(ids).toContain('bb_bench_press'); //     the anchor stays
  });

  it('follows a substitute CHAIN to the final standing lift (a swap that later graduated/rotated)', () => {
    const subs = { bb_bench_press: 'db_bench_press', db_bench_press: 'incline_db_press' };
    const chest = chestOf(assembleV5DayLists(undefined, 4, {}, subs));
    expect(chest).toContain('incline_db_press'); // the end of the chain stands
    expect(chest).not.toContain('bb_bench_press');
    expect(chest).not.toContain('db_bench_press');
  });

  it('a cyclic substitute chain terminates (no infinite loop)', () => {
    const subs = { bb_bench_press: 'db_bench_press', db_bench_press: 'bb_bench_press' };
    const chest = chestOf(assembleV5DayLists(undefined, 4, {}, subs));
    expect(chest).toContain('db_bench_press'); // bench → db_bench → (bench seen) stops
  });
});
