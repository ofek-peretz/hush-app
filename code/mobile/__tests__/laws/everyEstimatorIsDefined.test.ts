/**
 * EVERY ESTIMATOR IS DEFINED ON THE INPUT IT WILL ACTUALLY GET.
 *
 * ── Why this register exists ──────────────────────────────────────────────────────────────────
 * `loadLawsHoldOnEveryPath` was built for ONE mechanism — the load — and it earned its keep: it
 * failed on its first run against code nobody suspected, and it found two real defects. Then it
 * stayed a register of one. This is the same idea applied to the engine's other class of function:
 * the ESTIMATORS, the handful of places where Hush turns her history into a number.
 *
 * An estimator that throws, or returns `NaN`/`Infinity`/a negative where the caller expects a
 * measurement, does not fail loudly — it prices a rest at NaN, a budget at infinity, or a load move
 * at zero rungs, and the athlete simply gets a wrong workout. So every member of the register makes
 * the same three promises, and they are checked mechanically rather than remembered:
 *
 *   1. it does not throw on empty, single-sample, or degenerate (all-identical) input;
 *   2. it returns either `null` or a FINITE number — never NaN, never Infinity;
 *   3. where it claims to measure something physical, the number is not negative.
 *
 * "Degenerate" is the case that matters. A real athlete's first week IS degenerate: one session, one
 * load, every set identical. Every estimator here meets that input before it ever meets a rich one.
 */
// @ts-nocheck

// 

import { median, percentileNearestRank, theilSenSlope } from '@/engine/v5/stats';
import { repsPerRung, rungsForHeadroom } from '@/engine/v5/repsPerRung';
import { learnedRestS, learnedExecS, setsToMinutes, maxSetsInBudget } from '@/engine/v5/timeBudget';
import type { SetPerf, SessionRecord, ExerciseMeta } from '@/engine/v5/types';

const bb: ExerciseMeta = { equipment: 'barbell', bodyweight: false };
const S = (load: number, reps: number, rest = 90): SetPerf => ({ load, reps, restBeforeS: rest, isApproach: false });
const rec = (sets: SetPerf[]): SessionRecord => ({ load: sets[0]?.load ?? null, sets });

/** A finite number, or null. Never NaN, never ±Infinity — the two values that travel silently. */
function measured(v: number | null): void {
  if (v === null) return;
  expect(Number.isFinite(v)).toBe(true);
}

/**
 * THE REGISTER. One entry per estimator: how to call it with nothing, with one sample, and with a
 * degenerate sample. Adding an estimator to the engine means adding a row here.
 */
const ESTIMATORS: { name: string; empty: () => number | null; single: () => number | null; degenerate: () => number | null; nonNegative?: boolean }[] = [
  {
    name: 'median',
    empty: () => median([]),
    single: () => median([7]),
    degenerate: () => median([3, 3, 3, 3]),
  },
  {
    name: 'percentileNearestRank',
    empty: () => percentileNearestRank([], 0.75),
    single: () => percentileNearestRank([7], 0.75),
    degenerate: () => percentileNearestRank([3, 3, 3], 0.75),
  },
  {
    name: 'theilSenSlope',
    // `minPairs` was omitted at all three call sites, so `slopes.length < undefined` was always
    // false and the guard it exists to test was never reached. 1 is the smallest honest value:
    // one usable pair.
    empty: () => theilSenSlope([], 1),
    single: () => theilSenSlope([{ x: 1, y: 2 }], 1),
    // Every x identical — every pair is a vertical line, and a slope through one is not a number.
    degenerate: () => theilSenSlope([{ x: 1, y: 2 }, { x: 1, y: 5 }, { x: 1, y: 9 }], 1),
  },
  {
    name: 'repsPerRung',
    empty: () => repsPerRung([], [], bb),
    single: () => repsPerRung([], [rec([S(60, 8)])], bb),
    // Her real first week: one load, one rep count, every set the same.
    degenerate: () => repsPerRung([], [rec([S(60, 8)]), rec([S(60, 8)]), rec([S(60, 8)])], bb),
    nonNegative: true,
  },
  {
    name: 'learnedRestS',
    empty: () => learnedRestS([]),
    single: () => learnedRestS([90]),
    degenerate: () => learnedRestS([90, 90, 90, 90]),
    nonNegative: true,
  },
  {
    name: 'learnedExecS',
    empty: () => learnedExecS([]),
    single: () => learnedExecS([{ exerciseId: 'a', sessionId: 's', atMs: 0, restBeforeS: 60 }]),
    // Two writes at the same instant — the offline batch, and the clock disagreeing with itself.
    degenerate: () =>
      learnedExecS([
        { exerciseId: 'a', sessionId: 's', atMs: 1000, restBeforeS: 60 },
        { exerciseId: 'a', sessionId: 's', atMs: 1000, restBeforeS: 60 },
      ]),
    nonNegative: true,
  },
];

describe('every estimator survives the input a real first week produces', () => {
  for (const e of ESTIMATORS) {
    it(`${e.name} · empty · single · degenerate → finite or null, never NaN`, () => {
      for (const call of [e.empty, e.single, e.degenerate]) {
        let v: number | null = null;
        expect(() => {
          v = call();
        }).not.toThrow();
        measured(v);
        if (e.nonNegative && v !== null) expect(v).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

describe('the arithmetic that spends those estimates cannot produce nonsense', () => {
  it('setsToMinutes is finite and non-negative on every honest input', () => {
    for (const [sets, work, rest] of [[0, 0, 0], [1, 45, 90], [40, 20, 300]]) {
      const m = setsToMinutes(sets, work, rest);
      expect(Number.isFinite(m)).toBe(true);
      expect(m).toBeGreaterThanOrEqual(0);
    }
  });

  it('maxSetsInBudget floors at zero and never returns Infinity — a zero-cost set is not infinite work', () => {
    // The failure that matters: if work + rest is ever 0, a naive divide hands back Infinity and the
    // time cap stops capping. She would be prescribed a day with no end.
    for (const [budget, work, rest] of [[60, 0, 0], [0, 45, 90], [60, 45, 90], [-5, 45, 90]]) {
      const n = maxSetsInBudget(budget, work, rest);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });

  it('rungsForHeadroom always moves at least one rung, whatever it is handed', () => {
    for (const [headroom, perRung] of [[0, null], [9, null], [0.2, 1], [-4, 2], [1e9, 0.0001]]) {
      const n = rungsForHeadroom(headroom as number, perRung as number | null);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
    }
  });
});
