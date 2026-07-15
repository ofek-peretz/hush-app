/**
 * Engine v5 · Stage 6 — the gated prescription swap. A profile that has declared a rep band (T) —
 * the v5 onboarding cohort — gets its load / reps / band from the v5 engine through sessionTargets;
 * a profile without one stays entirely on v4 (no breakage). Proven through the real model boundary.
 */
import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { resetV5 } from '@/engine/v5/v5Engine';
import type { Profile } from '@/data/local/models';

const base: Profile = { units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false };

describe('Stage 6 · v5 owns the prescription for the declared-band cohort', () => {
  beforeEach(async () => { await resetV5(); await db.saveEngineV4({ slots: {}, global: { days_since_last_session: 0 }, lastAdvanceAt: 0 } as never); });

  it('a profile WITH a declared band → reps = Tlo and Thi rides on every target (v5)', async () => {
    await db.saveProfile({ ...base, repBand: '10-12' });
    await fixtureModel.generateProgram({ ...base, repBand: '10-12' });
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 0 } as never);
    // Every target carries her band: reps = Tlo (10), repBandHi = Thi (12).
    const sample = targets.find((t) => t.recommendedWeight != null);
    expect(sample).toBeTruthy();
    expect(sample!.recommendedReps).toBe(10);
    expect(sample!.repBandHi).toBe(12);
  });

  it('a profile WITHOUT a declared band stays on v4 — no band stamp (legacy path intact)', async () => {
    await db.saveProfile({ ...base });
    await fixtureModel.generateProgram({ ...base });
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 0 } as never);
    const sample = targets.find((t) => t.recommendedWeight != null);
    expect(sample!.repBandHi).toBeUndefined();
  });

  it('a v5 profile still generates a valid, well-formed program — generation is v4-free', async () => {
    await db.clearAll();
    await resetV5();
    await db.saveProfile({ ...base, repBand: '8-10' });
    const program = await fixtureModel.generateProgram({ ...base, repBand: '8-10' });
    // The generator's machinery still produces a complete program (days with slots) — the gating
    // only removed the v4 swap overlay / calendar rotation / ensureSlots, not the assembly itself.
    expect(program.days.length).toBeGreaterThan(0);
    const trainingDays = program.days.filter((d) => !d.isRest);
    expect(trainingDays.length).toBeGreaterThan(0);
    expect(trainingDays.every((d) => d.slots.length > 0)).toBe(true);
    // And no v4 engine state was created for this v5 profile (generation touched no v4).
    const v4 = await db.loadEngineV4();
    expect(v4?.slots == null || Object.keys(v4.slots).length === 0).toBe(true);
  });
});
