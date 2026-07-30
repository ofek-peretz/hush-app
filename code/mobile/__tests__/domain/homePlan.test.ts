/**
 * THE PLAN LIST DOES NOT STAND DOWN WHEN THE SELECTION CHANGES (founder A.12 — "tapping the chips
 * flickers", build 36).
 *
 * The chip tap was not flickering the chip. It was flickering the SIX ROWS UNDER IT: `plan` was
 * null until the engine's `sessionTargets` promise landed, so every tap collapsed the list into an
 * empty 168 px box and grew it back a frame later, walking the Begin button up and down the page
 * with it.
 *
 * The law underneath is about what is a FACT and when. A lift's name and its set count belong to
 * the programme day and are known synchronously; only the load and the band are the engine's read.
 * So the rows stand immediately and only the figures wait — and a row whose figure has not landed
 * says `pending`, because `load: null` already means BODYWEIGHT and a blank column may never be
 * read as "this lift carries no weight".
 */
import { homePlanRows, settledPlanRows } from '@/screens/home/homePlan';
import type { SetTarget } from '@/data/local/models';

const DAY = {
  slots: [
    { exerciseId: 'bb_bench_press', setCount: 4 },
    { exerciseId: 'pull_up', setCount: 3 },
  ],
};

const target = (over: Partial<SetTarget>): SetTarget =>
  ({ exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: 60, recommendedReps: 8, repBandLo: 8, repBandHi: 10, ...over }) as SetTarget;

describe('the rows are the day’s; only the figures are the engine’s', () => {
  it('a selected day has its full list of rows BEFORE any target has been read', () => {
    const rows = homePlanRows(DAY, null);
    expect(rows).toHaveLength(2); // ← the whole of A.12: it used to be null, i.e. an empty box
    expect(rows!.map((r) => r.exerciseId)).toEqual(['bb_bench_press', 'pull_up']);
    // The name and the set count are the day's own facts and are already right.
    expect(rows![0].sets).toBe(4);
    expect(rows![0].name).toBeTruthy();
    expect(rows![0].name).not.toMatch(/undefined/);
  });

  it('a row with no target yet is PENDING — never a bodyweight lift', () => {
    const rows = homePlanRows(DAY, null)!;
    // `load: null` is the app's word for bodyweight, so the pending row must be flagged as well.
    expect(rows.every((r) => r.pending)).toBe(true);
  });

  it('when the targets land, the pending flag goes with them', () => {
    const rows = homePlanRows(DAY, [target({})])!;
    expect(rows.some((r) => r.pending)).toBe(false);
    expect(rows[0].load).toBe(60);
    expect(rows[0].band).toEqual([8, 10]);
    // The lift the read did not cover is a genuine bodyweight row — null load, not pending.
    expect(rows[1].load).toBeNull();
    expect(rows[1].pending).toBeUndefined();
  });

  it('the row keeps its SHAPE across the landing — only the figure changes', () => {
    const before = homePlanRows(DAY, null)!;
    const after = homePlanRows(DAY, [target({})])!;
    expect(after.map((r) => r.exerciseId)).toEqual(before.map((r) => r.exerciseId));
    expect(after.map((r) => r.sets)).toEqual(before.map((r) => r.sets));
    expect(after.map((r) => r.name)).toEqual(before.map((r) => r.name));
  });

  it('no day, no rows — the section is genuinely empty, not pending', () => {
    expect(homePlanRows(null, null)).toBeNull();
    expect(homePlanRows(undefined, [target({})])).toBeNull();
  });

  it('the engine’s direction rides along, and only for the lifts it moved', () => {
    const rows = homePlanRows(DAY, [target({})], { bb_bench_press: 'up' })!;
    expect(rows[0].changed).toBe('up');
    expect(rows[1].changed).toBeUndefined();
  });
});

describe('a pending load is never quoted off the plan table', () => {
  /**
   * Welcome-back names two lifts and the weights waiting on them. A pending row's load is null,
   * and null is bodyweight — so quoting one would put Hush's own voice behind "the bar is empty".
   */
  it('settledPlanRows withholds the whole list until every figure is real', () => {
    expect(settledPlanRows(homePlanRows(DAY, null))).toBeNull();
    expect(settledPlanRows(homePlanRows(DAY, [target({})]))).toHaveLength(2);
    expect(settledPlanRows(null)).toBeNull();
  });
});
