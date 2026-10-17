/**
 * ════ THE BUILDER'S ALGEBRA — every operation, both sides of every boundary ════
 *
 * The draft is a `Program` and every edit returns a fresh one; the original is never mutated
 * (React state law). Sealing stamps `authored: 'athlete_or_coach'` — the imported week's own
 * passport — which is what makes the whole feature ride the proven rails: `engineMayRebuild`
 * refuses it, the coach-path runner runs it, `smartSeed` loads it, Loop 2 progresses it.
 */
// @ts-nocheck

import {
  addDay, addLift, blankDraft, blankDay, builderAdvice, builderMinutes, canAddLift,
  draftFromProgram, moveDay, moveLift, removeDay, removeLift, renameDay, reorderDayForStations,
  replaceLift, sealAuthored, setLiftSets, BUILDER_SETS_MAX, BUILDER_SETS_MIN,
} from '@/domain/planBuilder';
import { engineMayRebuild } from '@/state/stores/appStore';
import { estimateSessionMinutes } from '@/data/api/fixtureModel';

const draft = () => {
  let p = blankDraft('t1');
  p = addLift(p, 0, 'bb_bench_press');
  p = addLift(p, 0, 'db_row');
  p = addLift(p, 0, 'triceps_pushdown');
  return p;
};

describe('the draft algebra', () => {
  it('a blank draft opens with one empty day, and days grow lettered names', () => {
    let p = blankDraft('t1');
    expect(p.days).toHaveLength(1);
    expect(p.days[0].slots).toEqual([]);
    p = addDay(p);
    expect(p.days.map((d) => d.name)).toEqual(['Workout A', 'Workout B']);
  });

  it('every operation returns a NEW program and leaves the input untouched', () => {
    const before = draft();
    const snapshot = JSON.stringify(before);
    addLift(before, 0, 'bb_back_squat');
    removeLift(before, 0, 0);
    setLiftSets(before, 0, 0, 5);
    moveLift(before, 0, 0, 2);
    renameDay(before, 0, 'Push');
    reorderDayForStations(before, 0);
    sealAuthored(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('adding a lift takes its capability from the catalogue and refuses duplicates and strangers', () => {
    const p = draft();
    expect(p.days[0].slots[0]).toMatchObject({ exerciseId: 'bb_bench_press', capability: 'horizontal_push', setCount: 3 });
    expect(canAddLift(p, 0, 'bb_bench_press')).toBe(false); // already in the day
    expect(canAddLift(p, 0, 'no_such_lift')).toBe(false); // not a lift
    expect(addLift(p, 0, 'bb_bench_press')).toBe(p); // a refused add is a no-op, not a throw
    expect(addLift(p, 9, 'bb_back_squat')).toBe(p); // no such day
  });

  it('the day carries its muscles, derived and de-duped, in slot order', () => {
    const p = draft();
    expect(p.days[0].muscleGroups).toEqual(['Chest', 'Back', 'Triceps']);
    const fewer = removeLift(p, 0, 1);
    expect(fewer.days[0].muscleGroups).toEqual(['Chest', 'Triceps']);
  });

  it('set counts are hers, clamped to [1..8] — wider than the engine writes, on purpose', () => {
    const p = draft();
    expect(setLiftSets(p, 0, 0, 8).days[0].slots[0].setCount).toBe(BUILDER_SETS_MAX);
    expect(setLiftSets(p, 0, 0, 99).days[0].slots[0].setCount).toBe(BUILDER_SETS_MAX);
    expect(setLiftSets(p, 0, 0, 0).days[0].slots[0].setCount).toBe(BUILDER_SETS_MIN);
    expect(setLiftSets(p, 0, 0, 6).days[0].slots[0].setCount).toBe(6); // above F-1's 5 — legal HERE
  });

  it('lifts reorder and days reorder, both bounded', () => {
    const p = draft();
    expect(moveLift(p, 0, 0, 2).days[0].slots.map((s) => s.exerciseId)).toEqual(['db_row', 'triceps_pushdown', 'bb_bench_press']);
    expect(moveLift(p, 0, 0, 9)).toBe(p);
    let two = addDay(p);
    two = renameDay(two, 1, 'Legs');
    expect(moveDay(two, 1, 0).days.map((d) => d.name)).toEqual(['Legs', 'Workout A']);
  });

  it('replacing a lift keeps the seat and the set count, updates the capability, refuses a duplicate', () => {
    let p = draft();
    p = setLiftSets(p, 0, 0, 5);
    const swapped = replaceLift(p, 0, 0, 'db_bench_press');
    expect(swapped.days[0].slots[0]).toMatchObject({ exerciseId: 'db_bench_press', setCount: 5 });
    expect(replaceLift(p, 0, 0, 'db_row')).toBe(p); // db_row already sits at seat 1
  });

  it('the station order runs ON HER TAP and keeps every lift', () => {
    // pushdown (isolation) sits before nothing it should — after the tap compounds lead.
    let p = blankDraft('t2');
    p = addLift(p, 0, 'triceps_pushdown');
    p = addLift(p, 0, 'bb_bench_press');
    const ordered = reorderDayForStations(p, 0);
    expect(ordered.days[0].slots.map((s) => s.exerciseId)).toEqual(['bb_bench_press', 'triceps_pushdown']);
    expect(ordered.days[0].slots).toHaveLength(p.days[0].slots.length);
  });
});

describe('the steward stays on duty', () => {
  it('the clock is the engine\'s own arithmetic, bridges included', () => {
    const p = draft();
    expect(builderMinutes(p.days[0])).toBe(Math.round(estimateSessionMinutes(p.days[0])));
    expect(builderMinutes(p.days[0])).toBeGreaterThan(0);
  });

  it('a single leg day is ADVISED about, never blocked — the founder\'s own case', () => {
    let p = draft(); // one day: chest/back/triceps — legs appear once when she adds them
    p = addLift(p, 0, 'bb_back_squat');
    p = addDay(p);
    p = addLift(p, 1, 'db_bench_press');
    p = addLift(p, 1, 'machine_row');
    p = addDay(p);
    p = addLift(p, 2, 'bb_overhead_press');
    p = addLift(p, 2, 'lat_pulldown');
    const advice = builderAdvice(p, {});
    // Quads are trained on one day of a 3-day week: the judge SAYS so…
    expect(advice.some((f) => f.rule === 'trained_once' && f.subject === 'Quads')).toBe(true);
    // …and nothing anywhere refuses the draft: it seals.
    expect(sealAuthored(p)).not.toBeNull();
  });
});

describe('sealing', () => {
  it('stamps the imported week\'s own passport, and the engine may not rebuild it', () => {
    const sealed = sealAuthored(draft());
    expect(sealed!.authored).toBe('athlete_or_coach');
    expect(engineMayRebuild(sealed)).toBe(false);
  });

  it('prunes empty days, counts frequency from what remains, and refuses an empty week', () => {
    let p = draft();
    p = addDay(p); // empty scaffold day
    const sealed = sealAuthored(p);
    expect(sealed!.days).toHaveLength(1);
    expect(sealed!.frequency).toBe(1);
    expect(sealAuthored(blankDraft('t3'))).toBeNull();
  });

  it('a draft opened FROM the engine\'s programme drops its rest-day placeholders', () => {
    const engineish = {
      id: 'e1',
      frequency: 2,
      days: [
        { ...blankDay(0), slots: [{ capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 4 }] },
        { ...blankDay(1), isRest: true },
      ],
    };
    expect(draftFromProgram(engineish).days).toHaveLength(1);
  });
});
