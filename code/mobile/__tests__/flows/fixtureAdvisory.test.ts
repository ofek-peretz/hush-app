/**
 * The model stand-in emits advisory decisions ONLY after calibration, and shows
 * no program-change line during calibration (spec §5.5 R7, §5.6 R20).
 */
import { fixtureModel } from '@/data/api/fixtureModel';

describe('sessionTargets gating', () => {
  it('attaches NO reason/forecast during calibration', async () => {
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 3 });
    expect(targets.every((t) => t.reasonType === undefined && t.forecast === undefined)).toBe(true);
  });

  it('attaches reason+forecast on changed exercises in ADVISORY', async () => {
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 7 });
    const benchSet0 = targets.find((t) => t.exerciseId === 'bb_bench_press' && t.setIndex === 0)!;
    expect(benchSet0.reasonType).toBe('increase');
    expect(benchSet0.forecast?.type).toBe('increase');

    const ohpSet0 = targets.find((t) => t.exerciseId === 'bb_overhead_press' && t.setIndex === 0)!;
    expect(ohpSet0.reasonType).toBe('hold');
    expect(ohpSet0.forecast?.type).toBe('hold');

    const squatSet0 = targets.find((t) => t.exerciseId === 'bb_back_squat' && t.setIndex === 0)!;
    expect(squatSet0.reasonType).toBe('decrease');
    expect(squatSet0.forecast).toBeUndefined(); // decreases carry no forecast (R11)

    // Unchanged exercises stay silent.
    const rowSet0 = targets.find((t) => t.exerciseId === 'bb_row' && t.setIndex === 0)!;
    expect(rowSet0.reasonType).toBeUndefined();
  });

  it('only the first set of a changed exercise carries the reason line', async () => {
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 7 });
    const benchSet1 = targets.find((t) => t.exerciseId === 'bb_bench_press' && t.setIndex === 1)!;
    expect(benchSet1.reasonType).toBeUndefined();
  });
});

describe('programChanges gating', () => {
  it('returns no changes during calibration (silence)', async () => {
    expect(await fixtureModel.programChanges({ completedSessions: 4 })).toEqual([]);
  });

  it('returns an applied load change and a vetoable frame change in ADVISORY', async () => {
    const changes = await fixtureModel.programChanges({ completedSessions: 7 });
    expect(changes.some((c) => c.kind === 'load')).toBe(true);
    expect(changes.some((c) => c.kind === 'frame')).toBe(true);
  });
});
