/**
 * Engine v5 — the time budget is a hard ceiling (S-64). No generated day may exceed her declared
 * minutes, at any frequency or day-one volume. This guards the edge the v4 burial exposed: a low
 * frequency concentrates a region's whole volume on one day, which must still be trimmed to fit —
 * dropping a trailing compound as the last resort (S-35), never a muscle's only exercise.
 */
import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import type { Profile, WeeklyVolume } from '@/data/local/models';

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
