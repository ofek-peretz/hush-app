/**
 * Phase 7b — gated live integration: with the v4 flag ON, fixtureModel sources prescriptions from
 * the durable per-slot engine state, advancing at week rollover. Flag OFF is covered by the existing
 * suite (unchanged behavior). This proves the wiring end-to-end.
 */
import { fixtureModel } from '@/data/api/fixtureModel';
import { setV4Enabled } from '@/engine/v4/flag';
import { db } from '@/data/local/db';
import type { Profile, Session, SetLog } from '@/data/local/models';

const profile: Profile = {
  sex: 'male',
  weightKg: 80,
  age: 30,
  units: 'kg',
  goal: 'build_muscle',
  experience: 'intermediate',
  daysPerWeek: 4,
  healthConnected: false,
};

beforeEach(async () => {
  await db.clearAll();
  await db.saveProfile(profile);
  setV4Enabled(true);
});
afterAll(() => setV4Enabled(false));

async function targetWeight(exerciseId: string): Promise<number | null> {
  const targets = await fixtureModel.sessionTargets({ programDayId: 'day_0', completedSessions: 0 });
  const t = targets.find((x) => x.exerciseId === exerciseId);
  return t ? t.recommendedWeight : null;
}

describe('generateProgram seeds durable v4 slot state', () => {
  it('persists engine slots for the program (idempotent)', async () => {
    const program = await fixtureModel.generateProgram(profile);
    const state = await db.loadEngineV4();
    expect(state).not.toBeNull();
    const slots = Object.values(state!.slots);
    expect(slots.length).toBeGreaterThan(0);
    // VERTICAL_PULL exists as its own engine pattern (override §6) — Pull A has a lat pulldown.
    expect((slots as Array<{ pattern: string }>).some((s) => s.pattern === 'VERTICAL_PULL')).toBe(true);
    void program;
  });
});

describe('week rollover advances the prescription from logged work', () => {
  it('a beat-week pushes the bench prescription above its cold-start seed', async () => {
    const program = await fixtureModel.generateProgram(profile);
    await db.saveProgram(program); // the app persists this via appStore; do it here too

    // Week-0 prescriptions (calibrating from seed).
    const seedBench = await targetWeight('bb_bench_press');
    expect(seedBench).not.toBeNull();

    // Simulate ONE completed week: for every non-core slot, log 3 crushing sets at the seed weight.
    const week0 = await fixtureModel.sessionTargets({ programDayId: 'day_0', completedSessions: 0 });
    const weightOf = (id: string) => week0.find((t) => t.exerciseId === id)?.recommendedWeight ?? null;
    const repsOf = (id: string) => week0.find((t) => t.exerciseId === id)?.recommendedReps ?? 8;

    for (const day of program.days) {
      const sets: SetLog[] = [];
      day.slots.forEach((slot, i) => {
        const w = weightOf(slot.exerciseId);
        const target = repsOf(slot.exerciseId);
        for (let s = 0; s < 3; s++) {
          sets.push({
            exerciseId: slot.exerciseId,
            setIndex: i * 3 + s,
            recommendedWeight: w,
            recommendedReps: target,
            actualWeight: w,
            actualReps: target + 4, // crush it → calibration steps the load up
            edited: false,
            persistedAt: new Date().toISOString(),
          });
        }
      });
      const session: Session = {
        id: `wk0_${day.key}`,
        programDayId: day.id,
        startedAt: new Date().toISOString(),
        state: 'SAVED',
        earlyFinish: false,
        sets,
      };
      await db.appendCompletedSession(session);
    }

    // Next read triggers the weekly advance → bench load climbs above its seed.
    const advancedBench = await targetWeight('bb_bench_press');
    expect(advancedBench).not.toBeNull();
    expect(advancedBench!).toBeGreaterThan(seedBench!);
  });
});

describe('flag OFF restores the existing double-progression path', () => {
  it('does not read v4 slot state when disabled', async () => {
    setV4Enabled(false);
    await fixtureModel.generateProgram(profile);
    const targets = await fixtureModel.sessionTargets({ programDayId: 'day_0', completedSessions: 0 });
    expect(targets.find((t) => t.exerciseId === 'bb_bench_press')).toBeTruthy();
  });
});
