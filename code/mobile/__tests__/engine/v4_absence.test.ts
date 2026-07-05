/**
 * Extended absence wiring (I-6, 2026-07-05) — days_since_last_session is a WALL-CLOCK read of the
 * newest completed session, applied on RETURN (any prescription read), not at week rollover: an
 * absent athlete completes no weeks, so the rollover path alone could never reach the engine's
 * absence order. The ease (all loads ×0.90, volume kept) fires ONCE per gap (keyed to the last
 * pre-gap session id) and surfaces explanations for the Weekly Update / Why.
 */
import { fixtureModel } from '@/data/api/fixtureModel';
import { getWeeklyUpdate } from '@/engine/v4/v4Engine';
import type { SlotState } from '@/engine/v4/types';
import { db } from '@/data/local/db';
import type { Profile, Session, SetLog } from '@/data/local/models';

const profile: Profile = {
  sex: 'male',
  weightKg: 80,
  age: 30,
  units: 'kg',
  goal: 'build_muscle',
  experience: 'intermediate',
  daysPerWeek: 4, // 1 logged session < freq → the weekly loop stays quiet; only the gap acts
  healthConnected: false,
};

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await db.clearAll();
  await db.saveProfile(profile);
});

async function benchSlot(): Promise<SlotState> {
  const state = await db.loadEngineV4();
  const slots = Object.values(state!.slots) as SlotState[];
  return slots.find((s) => s.current_exercise_id === 'bb_bench_press')!;
}

async function logSessionDaysAgo(daysAgo: number, benchLoad: number): Promise<Session> {
  const startedAt = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  const sets: SetLog[] = [0, 1, 2].map((s) => ({
    exerciseId: 'bb_bench_press',
    setIndex: s,
    recommendedWeight: benchLoad,
    recommendedReps: 8,
    actualWeight: benchLoad,
    actualReps: 8,
    edited: false,
    persistedAt: startedAt,
  }));
  const session: Session = {
    id: `gap_${daysAgo}`,
    programDayId: 'day_0',
    startedAt,
    state: 'SAVED',
    earlyFinish: false,
    sets,
  };
  await db.appendCompletedSession(session);
  return session;
}

describe('extended absence eases loads once per gap', () => {
  it('>ABSENCE_DAYS since the last session → all loads ×0.90 on the next read; idempotent', async () => {
    const program = await fixtureModel.generateProgram(profile);
    await db.saveProgram(program);
    const seeded = await benchSlot();
    const seed = seeded.current_load_kg!;
    expect(seed).toBeGreaterThan(0);

    await logSessionDaysAgo(20, seed); // trained once, 20 days ago → a real gap

    await fixtureModel.sessionTargets({ programDayId: 'day_0', completedSessions: 1 });
    const eased = await benchSlot();
    // ×0.90 then grid/increment floor — strictly below the seed, never below 0.9×seed − one step.
    expect(eased.current_load_kg!).toBeLessThan(seed);
    expect(eased.current_load_kg!).toBeGreaterThanOrEqual(seed * 0.9 - 2.5);

    // The ease is surfaced (the athlete returns to visibly adjusted loads with a Why).
    const update = await getWeeklyUpdate();
    expect(update).not.toBeNull();
    expect(update!.explanations.length).toBeGreaterThan(0);

    // Re-opening the app during the same gap must NOT re-ease.
    await fixtureModel.sessionTargets({ programDayId: 'day_0', completedSessions: 1 });
    const again = await benchSlot();
    expect(again.current_load_kg).toBe(eased.current_load_kg);
  });

  it('a recent session (no gap) never triggers the ease', async () => {
    const program = await fixtureModel.generateProgram(profile);
    await db.saveProgram(program);
    const seed = (await benchSlot()).current_load_kg!;

    await logSessionDaysAgo(2, seed); // trained the day before yesterday

    await fixtureModel.sessionTargets({ programDayId: 'day_0', completedSessions: 1 });
    const after = await benchSlot();
    expect(after.current_load_kg).toBe(seed); // untouched — one session is not a week, no gap
  });
});
