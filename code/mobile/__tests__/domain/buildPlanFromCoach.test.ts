import { buildPlanFromCoach, type Step } from '@/state/stores/sessionStore';
import type { PlannedSession } from '@/domain/coachPlan';

/**
 * ════ A COACH'S SESSION, AS THE MACHINE RUNS IT ════
 *
 * The machine has one plan type. `buildPlan` makes it from a `ProgramDay`; this makes it from what
 * the coach wrote. Everything downstream — the cursor, the rest timer, the crash salvage, the watch
 * mirror, the record — keeps working precisely because it cannot tell which builder ran.
 *
 * The load-bearing assertion is about the ABSENCE of a target on every shape that is not reps. That
 * absence is what makes a plank visible as something other than a set, all the way down: the wrist
 * refuses to mirror it, Loop 1 steps over it, and `completeSet` will not log it. A filler target of
 * zeros would have made every one of those quietly wrong instead.
 */

const bench = (load: number | null = 40) => ({ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load } as const);

describe('a straight block is indistinguishable from the old builder', () => {
  const session: PlannedSession = {
    name: 'Upper A',
    blocks: [{ rounds: 4, restS: 120, items: [bench(32.5)] }],
  };

  it('produces one step per set, numbered the way the machine already counts', () => {
    const plan = buildPlanFromCoach(session);
    expect(plan.length).toBe(4);
    expect(plan.map((s) => s.exerciseSetIndex)).toEqual([0, 1, 2, 3]);
    expect(plan.every((s) => s.totalSetsInExercise === 4)).toBe(true);
    expect(plan.map((s) => s.globalIndex)).toEqual([0, 1, 2, 3]);
  });

  it('gives every reps step a real prescription, band included', () => {
    const t = buildPlanFromCoach(session)[0].target!;
    expect({ w: t.recommendedWeight, reps: t.recommendedReps, lo: t.repBandLo, hi: t.repBandHi })
      .toEqual({ w: 32.5, reps: 8, lo: 8, hi: 12 });
    // Tlo is the band FLOOR and is held immutably — the edit wheel overwrites `recommendedReps`,
    // and a band read from there would make every set sit in band and freeze the load (Build #33).
    expect(t.repBandLo).toBe(t.recommendedReps);
  });

  it('marks the last set of the exercise and of the session', () => {
    const plan = buildPlanFromCoach(session);
    expect(plan.map((s) => s.lastSetOfExercise)).toEqual([false, false, false, true]);
    expect(plan.map((s) => s.lastSetOfSession)).toEqual([false, false, false, true]);
  });
});

describe('every shape that is not reps carries NO target', () => {
  const session: PlannedSession = {
    name: 'Mixed',
    blocks: [
      { rounds: 1, items: [bench(40)] },
      { rounds: 3, restS: 45, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
      { rounds: 1, items: [{ kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24 }] },
      { rounds: 1, items: [{ kind: 'open', ex: 'mobility', say: 'Whatever your hips need.' }] },
    ],
  };

  it('is the only signal anything downstream needs', () => {
    const plan = buildPlanFromCoach(session);
    const withTarget = plan.filter((s) => s.target != null);
    expect(withTarget.length).toBe(1);
    expect(withTarget[0].exerciseId).toBe('bb_bench_press');
    // A plank with a filler target of zeros would be mirrored to her wrist as "0 kg x 0", carried
    // forward by Loop 1, and logged as a set. Absence is what prevents all three.
    for (const step of plan.filter((s) => s.item?.kind !== 'reps')) {
      expect({ ex: step.exerciseId, target: step.target }).toEqual({ ex: step.exerciseId, target: undefined });
    }
  });

  it('carries the coach\'s item and instruction through untouched', () => {
    const plan = buildPlanFromCoach(session);
    const open = plan.find((s) => s.item?.kind === 'open')!;
    expect(open.item).toEqual({ kind: 'open', ex: 'mobility', say: 'Whatever your hips need.' });
    const carry = plan.find((s) => s.item?.kind === 'distance')!;
    expect(carry.item).toMatchObject({ metres: 40, load: 24 });
  });

  it('says where each step sat, so the record can put it back', () => {
    const planks = buildPlanFromCoach(session).filter((s) => s.exerciseId === 'plank');
    expect(planks.map((s) => s.where)).toEqual([
      { block: 2, round: 1, position: 1 },
      { block: 2, round: 2, position: 1 },
      { block: 2, round: 3, position: 1 },
    ]);
  });

  it('carries the prescribed rest, and none after the final step', () => {
    const plan = buildPlanFromCoach(session);
    expect(plan.map((s) => s.restAfterS)).toEqual([0, 45, 45, 0, 0, 0]);
    expect(plan.at(-1)!.lastSetOfSession).toBe(true);
  });
});

describe('a circuit', () => {
  const session: PlannedSession = {
    name: 'Conditioning',
    blocks: [{
      rounds: 3,
      restS: 120,
      items: [bench(40), { kind: 'time', ex: 'plank', seconds: 30 }],
    }],
  };

  it('interleaves the items and counts laps as sets of each', () => {
    const plan = buildPlanFromCoach(session);
    expect(plan.map((s) => s.exerciseId)).toEqual([
      'bb_bench_press', 'plank', 'bb_bench_press', 'plank', 'bb_bench_press', 'plank',
    ]);
    // Three laps = three "sets" of each, which is the count the machine already speaks.
    expect(plan.filter((s) => s.exerciseId === 'plank').map((s) => s.exerciseSetIndex)).toEqual([0, 1, 2]);
  });

  it('ends an exercise when the NEXT step is a different one — not when the round ends', () => {
    // In a circuit every step is the last of its exercise for that lap. Getting this wrong would
    // fire the end-of-lift beat six times in a two-exercise circuit.
    const plan = buildPlanFromCoach(session);
    expect(plan.map((s) => s.lastSetOfExercise)).toEqual([true, true, true, true, true, true]);
  });

  it('rests between laps and not between the exercises of a lap', () => {
    expect(buildPlanFromCoach(session).map((s) => s.restAfterS)).toEqual([0, 120, 0, 120, 0, 0]);
  });
});

describe('edges', () => {
  it('returns an empty plan for an empty session rather than throwing', () => {
    expect(buildPlanFromCoach({ name: 'Empty', blocks: [] })).toEqual([] as Step[]);
  });

  it('keeps a bodyweight reps item with a null load, never a zero', () => {
    const plan = buildPlanFromCoach({
      name: 'D', blocks: [{ rounds: 2, items: [{ kind: 'reps', ex: 'pull_up', reps: [5, 8], load: null }] }],
    });
    expect(plan[0].target!.recommendedWeight).toBeNull();
  });
});
