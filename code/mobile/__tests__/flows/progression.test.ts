/**
 * Equipment-aware double progression (founder-directed 2026-06-23). A prescription is a pure
 * function of the athlete's logged history + the catalog: own the top of the rep range across
 * all working sets → add ONE equipment-appropriate step; two failed sessions → deload one step;
 * bodyweight climbs reps toward a ceiling, then surfaces a harder variation.
 */
import { prescribe } from '@/data/progression';
import type { Session } from '@/data/local/models';

function sess(exerciseId: string, weight: number | null, reps: number[]): Session {
  return {
    id: 's',
    programDayId: 'd',
    startedAt: '2026-01-01T00:00:00.000Z',
    state: 'SAVED',
    earlyFinish: false,
    sets: reps.map((r, i) => ({
      exerciseId,
      setIndex: i,
      recommendedWeight: weight,
      recommendedReps: 8,
      actualWeight: weight,
      actualReps: r,
      edited: false,
      persistedAt: '2026-01-01T00:00:00.000Z',
    })),
  };
}

describe('cold start (no history) is the static seed', () => {
  it('returns the seed weight and the goal rep target, no change', () => {
    expect(prescribe('bb_bench_press', 60, 8, [])).toMatchObject({
      weight: 60,
      reps: 8,
      increased: false,
      decreased: false,
    });
  });
});

describe('load increase is earned by owning the top of the range, and is equipment-appropriate', () => {
  it('barbell steps 2.5kg', () => {
    const p = prescribe('bb_bench_press', 60, 8, [sess('bb_bench_press', 60, [10, 10, 10])]);
    expect(p).toMatchObject({ weight: 62.5, reps: 8, increased: true, deltaKg: 2.5 });
  });
  it('dumbbell steps 2kg', () => {
    const p = prescribe('db_bench_press', 20, 8, [sess('db_bench_press', 20, [10, 10])]);
    expect(p).toMatchObject({ weight: 22, increased: true, deltaKg: 2 });
  });
  it('machine steps 5kg', () => {
    const p = prescribe('leg_press', 100, 8, [sess('leg_press', 100, [10, 10, 10])]);
    expect(p).toMatchObject({ weight: 105, increased: true, deltaKg: 5 });
  });
  it('cable steps 5kg', () => {
    const p = prescribe('triceps_pushdown', 20, 12, [sess('triceps_pushdown', 20, [15, 15])]);
    expect(p).toMatchObject({ weight: 25, increased: true, deltaKg: 5 });
  });
});

describe('hold and deload', () => {
  it('holds the load mid-range (not every set reached the top)', () => {
    const p = prescribe('bb_bench_press', 60, 8, [sess('bb_bench_press', 60, [10, 9, 8])]);
    expect(p).toMatchObject({ weight: 60, increased: false, decreased: false });
  });
  it('a single failed session holds (does not deload yet)', () => {
    const p = prescribe('bb_bench_press', 60, 8, [sess('bb_bench_press', 60, [6, 6])]);
    expect(p).toMatchObject({ weight: 60, decreased: false });
  });
  it('two failed sessions deload one step', () => {
    const p = prescribe('bb_bench_press', 60, 8, [
      sess('bb_bench_press', 60, [6, 6]),
      sess('bb_bench_press', 60, [7, 6]),
    ]);
    expect(p).toMatchObject({ weight: 57.5, decreased: true, deltaKg: 2.5 });
  });
});

describe('bodyweight progresses reps, then surfaces a harder variation', () => {
  it('adds a rep toward the ceiling, no phantom load', () => {
    const p = prescribe('chin_up', null, 8, [sess('chin_up', null, [9, 9])]);
    expect(p).toMatchObject({ weight: null, reps: 10, increased: false });
  });
  it('at the rep ceiling, hints the harder variation', () => {
    const p = prescribe('chin_up', null, 8, [sess('chin_up', null, [12, 12])]);
    expect(p).toMatchObject({ weight: null, reps: 12, variationHint: 'pull_up' });
  });
});
