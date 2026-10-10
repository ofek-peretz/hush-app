/**
 * NO BARBELL LIFT IS LIGHTER THAN THE BAR.
 *
 * ── The bug ──────────────────────────────────────────────────────────────────────────────────
 * `startingLoad` floored barbell lifts at the empty bar — but only `tier === 'compound'`. The bar
 * does not know what tier the lift is. The catalogue holds two barbell ISOLATION lifts, `bb_curl`
 * and `skullcrusher`, both `baseKg: 20`, and both fell straight through that clause:
 *
 *   male beginner    20 × 1.00 × 0.78 = 15.6 → **16 kg**
 *   female beginner  20 × 0.62 × 0.78 =  9.7 → **10 kg**
 *
 * You cannot put 10 kg on a 20 kg bar. EVERY beginner with biceps on their body map was handed an
 * impossible prescription on their first workout, and the stage printed it in 96pt — then offered
 * no way to build it, because the per-side maths resolved to `max(0, (10−20)/2) = 0` and the
 * instruction chip degraded to a bare, contentless "Load".
 *
 * The same door was open on the way DOWN: a Loop 1 correction ("too heavy — ease it") runs through
 * `normalizeLoad`, which snapped to a 2.5 kg increment and would happily walk 20 → 17.5 → 15.
 *
 * ── The fix ──────────────────────────────────────────────────────────────────────────────────
 * `BAR_KG` lives at the choke point every prescribed load passes through, and the floor asks about
 * the EQUIPMENT, never the tier. `loadPresentation`'s plate maths reads the same constant, so the
 * number that decides what is loadable and the number that builds it cannot drift apart.
 */
// @ts-nocheck

// 

import { normalizeLoad, BAR_KG, FIXED_BAR_KG, LOAD_INCREMENT } from '@/engine/loadMath';
import { startingWeight } from '@/domain/startingLoad';
import { loadSetup } from '@/domain/loadPresentation';
import { EXERCISES, exerciseById } from '@/data/exercises';

const beginner = (sex: 'male' | 'female') =>
  ({ sex, weightKg: 75, age: 28 }) as const;

describe('the bar is the floor', () => {
  it('every BARBELL lift in the catalogue starts at or above the bar — isolation included', () => {
    const impossible: string[] = [];
    for (const ex of EXERCISES) {
      if (ex.equipment !== 'barbell' || ex.bodyweight || ex.baseKg == null) continue;
      for (const sex of ['male', 'female'] as const) {
        const kg = startingWeight(ex, beginner(sex));
        if (kg != null && kg < BAR_KG) impossible.push(`${ex.id} (${ex.tier}, ${sex}): ${kg} kg`);
      }
    }
    expect({ lighterThanAnEmptyBar: impossible }).toEqual({ lighterThanAnEmptyBar: [] });
  });

  it('the two lifts this was found on now carry the FIXED bar and its own floor (F-19)', () => {
    // The regression was found on `bb_curl` and `skullcrusher` when they wore `equipment:
    // 'barbell'`. On 2026-08-25 (founder gym finding #11) they moved to the `fixed_barbell`
    // family: a curl is done on a pre-weighted fixed bar whose set starts at 10 kg, so flooring
    // it at an Olympic bar was the OPPOSITE over-correction — a beginner woman's curl was forced
    // up to 20. The floor is still a fact of the iron; the iron is just different.
    for (const id of ['bb_curl', 'skullcrusher', 'reverse_curl']) {
      const ex = exerciseById(id)!;
      expect(ex.equipment).toBe('fixed_barbell');
      const m = startingWeight(ex, beginner('male'));
      const f = startingWeight(ex, beginner('female'));
      expect(m).toBeGreaterThanOrEqual(FIXED_BAR_KG);
      expect(f).toBeGreaterThanOrEqual(FIXED_BAR_KG);
      // and the whole point: a beginner woman is no longer forced onto an Olympic bar
      expect(f).toBeLessThan(BAR_KG);
    }
  });

  it('a correction cannot walk a fixed bar under the lightest bar in the rack', () => {
    expect(LOAD_INCREMENT.fixed_barbell).toBe(2.5);
    expect(normalizeLoad(7.5, 'fixed_barbell')).toBe(FIXED_BAR_KG);
    expect(normalizeLoad(0, 'fixed_barbell')).toBe(FIXED_BAR_KG);
    expect(normalizeLoad(12.5, 'fixed_barbell')).toBe(12.5); // 12.5 exists in a fixed set — untouched
  });

  it('a correction cannot walk a barbell under the bar on the way down', () => {
    // Loop 1 easing a load that was too heavy: without the floor this steps 20 → 17.5 by the
    // 2.5 kg increment, which is a weight that does not exist on a bar.
    expect(LOAD_INCREMENT.barbell).toBe(2.5); // the step that used to walk under it
    expect(normalizeLoad(17.5, 'barbell')).toBe(BAR_KG);
    expect(normalizeLoad(5, 'barbell')).toBe(BAR_KG);
    expect(normalizeLoad(0, 'barbell')).toBe(BAR_KG);
  });

  it('the floor is a BARBELL fact — it never touches the other equipment', () => {
    // A 5 kg dumbbell curl and a 5 kg cable fly are perfectly real. Flooring them at 20 would be a
    // far worse bug than the one being fixed.
    expect(normalizeLoad(5, 'dumbbell')).toBe(5);
    expect(normalizeLoad(5, 'cable')).toBe(5);
    expect(normalizeLoad(5, 'machine')).toBe(5);
  });

  it('above the bar, nothing changes — the floor is a floor, not a rule', () => {
    expect(normalizeLoad(60, 'barbell')).toBe(60);
    expect(normalizeLoad(62.5, 'barbell')).toBe(62.5);
    // …and her learned grid still wins above it (the snap the floor must not disturb).
    expect(normalizeLoad(61, 'barbell', [20, 60, 62.5])).toBe(60);
  });

  it('the plate maths and the floor read the SAME bar — a shared constant, not two copies', () => {
    // `loadPresentation` computes per-side as (load − bar) / 2. If its bar and the engine's floor
    // ever disagreed, the lightest legal load would render with a negative or phantom per-side.
    const atTheFloor = loadSetup('bb_bench_press', BAR_KG, 'kg')!;
    expect(atTheFloor.barKg).toBe(BAR_KG);
    expect(atTheFloor.perSide).toBe(0); // an empty bar: nothing on either end, and nothing invented
  });
});
