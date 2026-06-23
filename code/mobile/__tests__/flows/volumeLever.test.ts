/**
 * Weekly volume lever (founder-directed 2026-06-23). The athlete chooses low / moderate / high;
 * it shifts every exercise's working sets within the safe [3, 5] band. Absent volume ⇒ moderate
 * ⇒ byte-identical to the prior behavior (parity), and the ≤60-min cap still bounds the result.
 */
import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import type { Profile, WeeklyVolume } from '@/data/local/models';

const base: Profile = {
  units: 'kg', goal: 'build_muscle', daysPerWeek: 3, healthConnected: false,
  sex: 'male', weightKg: 80, experience: 'intermediate',
};

beforeEach(async () => {
  await db.clearAll();
});

async function totalSets(volume?: WeeklyVolume): Promise<number> {
  const prog = await fixtureModel.generateProgram({ ...base, volume });
  return prog.days.reduce((n, d) => n + d.slots.reduce((m, s) => m + s.setCount, 0), 0);
}

describe('volume shifts total weekly working sets monotonically', () => {
  it('low ≤ moderate ≤ high, and absent === moderate', async () => {
    const low = await totalSets('low');
    const mod = await totalSets('moderate');
    const high = await totalSets('high');
    const absent = await totalSets(undefined);
    expect(low).toBeLessThan(mod);
    expect(high).toBeGreaterThan(mod);
    expect(absent).toBe(mod); // parity: no volume ⇒ moderate
  });

  it('every slot stays within the safe [3,5] set band at any volume', async () => {
    for (const volume of ['low', 'moderate', 'high'] as WeeklyVolume[]) {
      const prog = await fixtureModel.generateProgram({ ...base, volume });
      for (const d of prog.days) {
        for (const s of d.slots) {
          expect(s.setCount).toBeGreaterThanOrEqual(3);
          expect(s.setCount).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it('the ≤60-min cap still holds at high volume', async () => {
    const prog = await fixtureModel.generateProgram({ ...base, volume: 'high' });
    for (const d of prog.days) expect(estimateSessionMinutes(d)).toBeLessThanOrEqual(60);
  });

  it('low volume floors compounds to 3 sets (no strength/hypertrophy bonus set)', async () => {
    const prog = await fixtureModel.generateProgram({ ...base, goal: 'get_stronger', volume: 'low' });
    const firstCompound = prog.days
      .flatMap((d) => d.slots)
      .find((s) => exerciseById(s.exerciseId)!.tier === 'compound')!;
    expect(firstCompound.setCount).toBe(3);
  });
});
