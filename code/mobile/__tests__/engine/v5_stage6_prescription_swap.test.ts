/**
 * Engine v5 · Stage 6 — the prescription. Every athlete's load / reps / band come from the v5 engine
 * through sessionTargets; a profile that declared a band uses it, one that didn't falls back to the
 * 8-10 default (there is no v4 cohort any more — S-58). Proven through the real model boundary.
 */
// @ts-nocheck

// 

import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { resetV5 } from '@/engine/v5/v5Engine';
import type { Profile } from '@/data/local/models';

const base: Profile = { units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false };

describe('Stage 6 · v5 owns the prescription', () => {
  beforeEach(async () => { await db.clearAll(); await resetV5(); });

  it('a declared band → reps = Tlo and Thi rides on every target', async () => {
    await db.saveProfile({ ...base, repBand: '10-12' });
    await fixtureModel.generateProgram({ ...base, repBand: '10-12' });
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 0 } as never);
    const sample = targets.find((t) => t.recommendedWeight != null);
    expect(sample).toBeTruthy();
    expect(sample!.recommendedReps).toBe(10); // Tlo
    expect(sample!.repBandHi).toBe(12); // Thi
  });

  it('no declared band → the 8-10 default band still applies (no v4 fallback)', async () => {
    await db.saveProfile({ ...base });
    await fixtureModel.generateProgram({ ...base });
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 0 } as never);
    const sample = targets.find((t) => t.recommendedWeight != null);
    expect(sample!.recommendedReps).toBe(8); // default Tlo
    expect(sample!.repBandHi).toBe(10); // default Thi
  });

  it('generation produces a valid, well-formed program', async () => {
    await db.saveProfile({ ...base, repBand: '8-10' });
    const program = await fixtureModel.generateProgram({ ...base, repBand: '8-10' });
    expect(program.days.length).toBeGreaterThan(0);
    const trainingDays = program.days.filter((d) => !d.isRest);
    expect(trainingDays.length).toBeGreaterThan(0);
    expect(trainingDays.every((d) => d.slots.length > 0)).toBe(true);
  });
});
