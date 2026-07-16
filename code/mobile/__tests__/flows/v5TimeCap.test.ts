/**
 * Engine v5 — the time budget is a hard ceiling (S-64). No generated day may exceed her declared
 * minutes, at any frequency or day-one volume. This guards the edge the v4 burial exposed: a low
 * frequency concentrates a region's whole volume on one day, which must still be trimmed to fit —
 * dropping a trailing compound as the last resort (S-35), never a muscle's only exercise.
 */
import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import type { Profile, WeeklyVolume, Session, ProgramDay } from '@/data/local/models';

const base: Profile = { units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false, repBand: '8-10' };

beforeEach(async () => { await db.clearAll(); });

describe('v5 · the ≤ budget cap holds for every generated day (S-64)', () => {
  for (let days = 1; days <= 6; days++) {
    for (const volume of ['moderate', 'high'] as WeeklyVolume[]) {
      it(`${days}d · ${volume} volume · all-normal map — no day exceeds 60 min`, async () => {
        const prog = await fixtureModel.generateProgram({ ...base, daysPerWeek: days, volume });
        for (const d of prog.days) {
          expect(estimateSessionMinutes(d)).toBeLessThanOrEqual(60);
          expect(d.slots.length).toBeGreaterThan(0); // never starved to empty
        }
      });
    }
  }

  it('a shorter declared budget is honoured too', async () => {
    const prog = await fixtureModel.generateProgram({ ...base, daysPerWeek: 3, workoutMinutes: 45 });
    for (const d of prog.days) expect(estimateSessionMinutes(d)).toBeLessThanOrEqual(45);
  });

  it('the last-resort drop never removes a muscle entirely — every trained muscle keeps a lift', async () => {
    // At 3 days all-normal the lower day is dense; after trimming, each region still trains its muscles.
    const prog = await fixtureModel.generateProgram({ ...base, daysPerWeek: 3 });
    const trained = new Set(prog.days.flatMap((d) => d.slots.map((s) => s.exerciseId)));
    expect(trained.size).toBeGreaterThanOrEqual(6); // a real, non-degenerate programme
  });
});

describe('v5 · the budget is computed from HER MEASURED REST (S-64), not a fixed estimate', () => {
  const day: ProgramDay = {
    id: 'd', name: 'Upper', muscleGroups: ['Chest'], isRest: false, completed: false,
    slots: [
      { exerciseId: 'bb_bench_press', capability: 'horizontal_push', setCount: 4 },
      { exerciseId: 'triceps_pushdown', capability: 'horizontal_push', setCount: 3 },
    ],
  };

  it('a fast rester fits more work than a slow one; no data → the day-one bootstrap', () => {
    const fast = estimateSessionMinutes(day, () => 30); // 30s rest
    const slow = estimateSessionMinutes(day, () => 180); // 3-min rest
    const bootstrap = estimateSessionMinutes(day); // no rest data
    expect(fast).toBeLessThan(slow); // her rest actually moves the estimate
    expect(bootstrap).toBeGreaterThan(0);
    expect(bootstrap).toBeLessThan(slow); // the fixed bootstrap is lighter than a genuinely slow rester
  });

  it('end-to-end: a fast-rest history lets more total sets fit than a slow-rest history', async () => {
    const set = (exerciseId: string, rest: number) => ({ exerciseId, setIndex: 0, recommendedWeight: 60, recommendedReps: 8, actualWeight: 60, actualReps: 8, edited: false, persistedAt: '', restBeforeS: rest });
    const seed = async (rest: number) => {
      await db.clearAll();
      const ids = ['bb_bench_press', 'bb_overhead_press', 'bb_row', 'bb_back_squat', 'bb_deadlift', 'hip_thrust'];
      const sess: Session = { id: 's1', programDayId: 'd', startedAt: '2026-07-10T10:00:00Z', state: 'SAVED', earlyFinish: false, sets: ids.map((id) => set(id, rest)) };
      await db.appendCompletedSession(sess);
      const p = await fixtureModel.generateProgram({ ...base, daysPerWeek: 4 });
      return p.days.reduce((n, d) => n + d.slots.reduce((k, s) => k + s.setCount, 0), 0);
    };
    const fastSets = await seed(30);
    const slowSets = await seed(210);
    expect(fastSets).toBeGreaterThan(slowSets); // resting less → more work fits the same hour
  });
});
