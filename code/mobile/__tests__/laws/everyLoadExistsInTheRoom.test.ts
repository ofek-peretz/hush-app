/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY PRESCRIBED LOAD IS A WEIGHT THAT EXISTS IN THE ROOM.
 *
 * ⛔ FOUNDER, 2026-08-21, from a photograph of his own Home screen: **Barbell Bench Press · 41.5 kg**.
 *
 * A 20 kg bar plus 10.75 kg a side. There is no 0.75 plate. She would load 40 or 42.5 and the app
 * would have been wrong in the one place it cannot afford to be — standing at the rack, holding the
 * thing it just told her to lift.
 *
 * ⚠️ AND THE ENGINE ALREADY KNOWS THE GRID. `STARTING_INCREMENT` says a barbell moves in 2.5 and
 * `BAR_KG` says it starts at 20; `snapToStock` lands every seed on `20 + n × 2.5` correctly. So the
 * defect is not the grid — it is a step somewhere AFTER the snap that moves the number off it, and
 * a rounding that reads fine in isolation. This sweep does not care which step: it prices whole
 * programmes the way an athlete receives them and asks one question of every number that comes out.
 *
 * ── WHY A SWEEP AND NOT A UNIT TEST ─────────────────────────────────────────────────────────────
 * The seed is composed — a modelled load, a personal scale, a stock snap, a bar floor — and each
 * part is already tested alone. What was missing is the assertion on the COMPOSITION, which is the
 * only thing the athlete ever sees.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { fixtureModel } from '@/data/api/fixtureModel';
import { exerciseById } from '@/data/exercises';
import { STARTING_INCREMENT, BAR_KG } from '@/engine/v5/constants';
import type { Profile } from '@/data/local/models';

const athlete = (over: Partial<Profile> = {}): Profile => ({
  sex: 'female',
  units: 'kg',
  weightKg: 62,
  startWeightKg: 62,
  heightCm: 168,
  age: 31,
  daysPerWeek: 4,
  repBand: '8-10',
  repBandByMuscle: {},
  experience: 'beginner',
  workoutMinutes: 60,
  memberSince: new Date('2026-01-01').toISOString(),
  ...over,
});

/** The rungs the equipment actually offers: a barbell starts at the bar, everything else at zero. */
function onGrid(kg: number, equipment: string): boolean {
  const inc = STARTING_INCREMENT[equipment] ?? 0;
  if (inc <= 0) return true; // bodyweight — no load axis
  const floor = equipment === 'barbell' ? BAR_KG : 0;
  const rungs = (kg - floor) / inc;
  // A hair of float slop, and nothing more: 41.5 is 8.6 rungs and must fail.
  return kg >= floor && Math.abs(rungs - Math.round(rungs)) < 1e-6;
}

describe('every load the engine prescribes can be loaded', () => {
  it('sits on its own equipment’s grid, for every athlete and every lift in her week', async () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const sex of ['female', 'male']) {
      for (const weightKg of [48, 55, 62, 75, 88, 105]) {
        for (const daysPerWeek of [2, 3, 4, 5, 6]) {
          const profile = athlete({ sex, weightKg, startWeightKg: weightKg, daysPerWeek });
          const program = await fixtureModel.generateProgram(profile);
          for (const day of program.days.filter((d: any) => !d.isRest)) {
            const targets = await fixtureModel.sessionTargets({ programDayId: day.id, completedSessions: 0 });
            for (const t of targets) {
              const ex = exerciseById(t.exerciseId);
              if (!ex || t.recommendedWeight == null) continue;
              checked++;
              if (!onGrid(t.recommendedWeight, ex.equipment)) {
                offenders.push(`${sex} ${weightKg}kg ${daysPerWeek}d · ${ex.name} (${ex.equipment}) → ${t.recommendedWeight}`);
              }
            }
          }
        }
      }
    }
    /*
     * ⛔ THE GUARD ON THE GUARD. `theTestsAreTypechecked` records a law in this repo that passed for
     * its whole life while asserting nothing, because every iteration fell through a `continue`. A
     * sweep that prices no loads is that same green nothing, so it says how many it priced.
     */
    // eslint-disable-next-line no-console
    console.log(`priced ${checked} loads`);
    expect(checked).toBeGreaterThan(200);
    // Report the distinct shapes rather than every instance — one line per broken lift is readable.
    expect([...new Set(offenders)].slice(0, 25)).toEqual([]);
  });
});
