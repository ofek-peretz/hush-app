/**
 * The model stand-in progresses load from the athlete's REAL logged history (equipment-aware
 * double progression), and the advisory VOICE (reason + forecast) is gated to ADVISORY
 * (post-calibration), rides only the first working set, and stays silent on unchanged
 * exercises (spec §5.5 R7, §5.6 R20). No demo deltas — every reason is earned by history.
 */
import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import type { Profile, Session } from '@/data/local/models';

const profile: Profile = {
  units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false,
  sex: 'male', weightKg: 80, experience: 'intermediate',
};

function sess(exerciseId: string, weight: number, reps: number[]): Session {
  return {
    id: `s_${exerciseId}_${Math.random()}`,
    programDayId: 'd',
    startedAt: '2026-01-01T00:00:00.000Z',
    state: 'SAVED',
    earlyFinish: false,
    sets: reps.map((r, i) => ({
      exerciseId, setIndex: i, recommendedWeight: weight, recommendedReps: 8,
      actualWeight: weight, actualReps: r, edited: false, persistedAt: '2026-01-01T00:00:00.000Z',
    })),
  };
}

beforeEach(async () => {
  await db.clearAll();
  await db.saveProfile(profile);
});

describe('sessionTargets gating', () => {
  it('attaches NO reason/forecast during calibration, even when a lift earned a change', async () => {
    await db.appendCompletedSession(sess('bb_bench_press', 60, [10, 10, 10])); // would increase
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 3 });
    expect(targets.every((t) => t.reasonType === undefined && t.forecast === undefined)).toBe(true);
  });

  it('attaches a real reason+forecast on a lift that earned an increase (ADVISORY)', async () => {
    // bench: owned the top of the 8–10 range → +2.5kg increase with a forecast.
    await db.appendCompletedSession(sess('bb_bench_press', 60, [10, 10, 10]));
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 7 });

    const benchSet0 = targets.find((t) => t.exerciseId === 'bb_bench_press' && t.setIndex === 0)!;
    expect(benchSet0.recommendedWeight).toBe(62.5);
    expect(benchSet0.reasonType).toBe('increase');
    expect(benchSet0.forecast?.type).toBe('increase');

    // an exercise with no history stays silent.
    const rowSet0 = targets.find((t) => t.exerciseId === 'bb_row' && t.setIndex === 0)!;
    expect(rowSet0.reasonType).toBeUndefined();
  });

  it('a deload (two failed sessions) reads as a decrease with no forecast', async () => {
    await db.appendCompletedSession(sess('bb_back_squat', 100, [6, 6, 6]));
    await db.appendCompletedSession(sess('bb_back_squat', 100, [7, 6, 6]));
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 7 });
    const squatSet0 = targets.find((t) => t.exerciseId === 'bb_back_squat' && t.setIndex === 0)!;
    expect(squatSet0.reasonType).toBe('decrease');
    expect(squatSet0.forecast).toBeUndefined(); // decreases carry no forecast (R11)
  });

  it('only the first set of a changed exercise carries the reason line', async () => {
    await db.appendCompletedSession(sess('bb_bench_press', 60, [10, 10, 10]));
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 7 });
    const benchSet1 = targets.find((t) => t.exerciseId === 'bb_bench_press' && t.setIndex === 1)!;
    expect(benchSet1.reasonType).toBeUndefined();
  });
});

describe('programChanges gating', () => {
  it('returns no changes during calibration (silence)', async () => {
    await db.appendCompletedSession(sess('bb_bench_press', 60, [10, 10, 10]));
    expect(await fixtureModel.programChanges({ completedSessions: 4 })).toEqual([]);
  });

  it('returns the real applied load changes in ADVISORY', async () => {
    await db.appendCompletedSession(sess('bb_bench_press', 60, [10, 10, 10]));
    const changes = await fixtureModel.programChanges({ completedSessions: 7 });
    expect(changes.some((c) => c.kind === 'load')).toBe(true);
  });

  it('returns nothing when no lift earned a change', async () => {
    await db.appendCompletedSession(sess('bb_bench_press', 60, [8, 8, 8])); // mid-range, holds
    const changes = await fixtureModel.programChanges({ completedSessions: 7 });
    expect(changes).toEqual([]);
  });
});
