/**
 * Engine v5 · regression — sessionTargets must cover EVERY renderable set.
 *
 * Loop 3 can LEARN a muscle's volume high enough that distributeMuscleSets assigns a single lift
 * SETS_MAX (5, F-1) sets — a grown compound (or a small-pool muscle) becomes a 5-set slot. buildPlan
 * renders slot.setCount sets and falls back to a null-weight / reps-8 neutral target for any set it
 * can't match, so if sessionTargets emitted only a fixed 4 targets per exercise, that 5th set would
 * silently lose her load and her band. This proves the coverage invariant: a target exists (carrying
 * her real prescription) for every set the programme will render, whatever the slot's setCount.
 */
// @ts-nocheck

// 

import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import type { Profile, Program } from '@/data/local/models';

const profile = (over: Partial<Profile>): Profile => ({
  units: 'kg', daysPerWeek: 2, healthConnected: false, ...over,
});

/** A programme with a 5-set bench slot — exactly what distributeMuscleSets emits for a grown muscle. */
const programWith5SetBench = (): Program => ({
  id: 'program_v1',
  frequency: 2,
  days: [
    {
      id: 'day_0', name: 'Upper A', muscleGroups: ['Chest'], isRest: false, key: '0', completed: false,
      slots: [{ capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 5, engineSlotId: 'Upper A:horizontal_push#0' }],
    },
  ],
});

beforeEach(async () => { await db.clearAll(); });

it('every renderable set has a real target even when a slot holds 5 sets (Loop 3 growth)', async () => {
  await db.saveProfile(profile({ repBand: '8-10' }));
  const program = programWith5SetBench();
  await db.saveProgram(program);

  const targets = await fixtureModel.sessionTargets({ programDayId: 'day_0' } as never);

  for (const day of program.days) {
    for (const slot of day.slots) {
      for (let s = 0; s < slot.setCount; s++) {
        const t = targets.find((x) => x.exerciseId === slot.exerciseId && x.setIndex === s);
        // Before the fix, setIndex 4 was never emitted → buildPlan rendered a null-weight / reps-8 set.
        expect(t).toBeDefined();
        expect(t!.recommendedReps).toBe(8); // her band's Tlo, not the coincidental fallback of a MISSING target
      }
    }
  }
  // The 5th set (setIndex 4) specifically is now covered — the crux of the regression.
  expect(targets.some((t) => t.exerciseId === 'bb_bench_press' && t.setIndex === 4)).toBe(true);
});
