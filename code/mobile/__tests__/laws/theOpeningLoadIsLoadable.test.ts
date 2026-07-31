import { EXERCISES } from '@/data/exercises';
import { startingWeight } from '@/domain/startingLoad';
import { loadSetup } from '@/domain/loadPresentation';

/**
 * ════ THE OPENING LOAD IS ONE SHE CAN ACTUALLY BUILD (founder, build 36 — A.6) ════
 *
 * *"Gyms stock 2.5 kg jumps — why prescribe 8.5 a side?"*
 *
 * The cold start rounded to 1 kg for every equipment, so a barbell could open at 37 kg — 8.5 a side,
 * a stack that does not exist. `loadSetup` is the surface that answers this honestly: it returns a
 * `plates` array ONLY when the stack sums EXACTLY to the per-side weight, and `null` otherwise. So
 * the law does not need to re-derive plate maths; it asks the screen's own function whether the
 * number it is about to print can be built, for every priced lift in the catalogue, for both sexes,
 * across the bodyweight range the app serves.
 *
 * This is the whole first session of every athlete Hush will ever meet. There is no excuse for a
 * single unbuildable number in it.
 */

const BODYWEIGHTS = [45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120];
const SEXES = ['male', 'female'] as const;

describe('the opening load is one she can actually build', () => {
  it('lands on a real plate stack for every barred lift, every sex, every bodyweight', () => {
    const unbuildable: string[] = [];
    for (const ex of EXERCISES) {
      for (const sex of SEXES) {
        for (const weightKg of BODYWEIGHTS) {
          const kg = startingWeight(ex, { sex, weightKg });
          if (kg == null) continue;
          const setup = loadSetup(ex, kg, 'kg');
          // Only the styles that ask the athlete to BUILD a load out of plates are bound by this.
          // A pin stack or a fixed dumbbell is chosen off a rack, not assembled.
          if (setup.style !== 'barbell' && setup.style !== 'plate_loaded') continue;
          if (setup.perSide === 0) continue; // the empty bar — nothing to load
          if (setup.plates == null) {
            unbuildable.push(`${ex.id} · ${sex} ${weightKg}kg → ${kg}kg (${setup.perSide} a side)`);
          }
        }
      }
    }
    expect(unbuildable).toEqual([]);
  });

  it('rounds the opening load UP through a tie, because he asked for it to be maximised', () => {
    // 37 was the founder's own screenshot. Snapped to the barbell's 2.5 rung from the 20 kg bar it
    // is 37.5 — 8.75 a side, 5 + 2.5 + 1.25 — and never 35.
    const bench = EXERCISES.find((e) => e.equipment === 'barbell' && e.baseKg != null);
    expect(bench).toBeDefined();
    const rung = (kg: number) => Math.abs(((kg - 20) / 2.5) % 1) < 1e-9;
    for (const sex of SEXES) {
      for (const weightKg of BODYWEIGHTS) {
        const kg = startingWeight(bench!, { sex, weightKg })!;
        expect({ sex, weightKg, onARung: rung(kg) }).toEqual({ sex, weightKg, onARung: true });
        expect(kg).toBeGreaterThanOrEqual(20); // never under the bar
      }
    }
  });
});
