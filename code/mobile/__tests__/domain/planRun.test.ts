import { runSteps, plannedRestS } from '@/domain/planRun';
import type { PlannedSession, PlannedItem } from '@/domain/coachPlan';

/**
 * Rounds are where a circuit and a straight block stop looking alike, and getting it wrong is
 * silent — the athlete just does a different workout from the one the coach wrote. So the tests
 * below are mostly one question asked four ways: **where does the rest go?**
 */

const reps = (ex: string, load: number | null = 40) =>
  ({ kind: 'reps', ex, reps: [8, 12], load } satisfies PlannedItem);

describe('a straight block — four sets of one lift', () => {
  const session: PlannedSession = {
    name: 'Upper A',
    blocks: [{ rounds: 4, restS: 120, restAfterS: 180, items: [reps('bb_bench_press')] }],
  };

  it('meets the same lift four times, numbered', () => {
    const steps = runSteps(session);
    expect(steps.length).toBe(4);
    expect(steps.map((s) => `${s.round}/${s.rounds}`)).toEqual(['1/4', '2/4', '3/4', '4/4']);
    expect(steps.every((s) => s.name === 'Barbell Bench Press')).toBe(true);
  });

  it('rests between sets, and the block\'s own rest after the last one', () => {
    // 120 after sets 1-3 (between rounds), then 180 after set 4 (after the block) — except this is
    // the whole session, so the tail is dropped. See the next test.
    const steps = runSteps({ ...session, blocks: [...session.blocks, { rounds: 1, items: [reps('bb_row')] }] });
    expect(steps.map((s) => s.restAfterS)).toEqual([120, 120, 120, 180, 0]);
  });

  it('never rests after the last step of the session — nothing is being rested for', () => {
    expect(runSteps(session).map((s) => s.restAfterS)).toEqual([120, 120, 120, 0]);
    expect(runSteps(session).at(-1)!.last).toBe(true);
    expect(runSteps(session).filter((s) => s.last).length).toBe(1);
  });
});

describe('a circuit — three lifts, three times through', () => {
  const session: PlannedSession = {
    name: 'Conditioning',
    blocks: [{
      rounds: 3,
      restS: 120,
      items: [reps('goblet_squat', 16), { kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24 }, { kind: 'time', ex: 'jump_rope', seconds: 60 }],
    }],
  };

  it('goes across the items, then back to the top', () => {
    const steps = runSteps(session);
    expect(steps.length).toBe(9);
    expect(steps.map((s) => s.item.ex)).toEqual([
      'goblet_squat', 'farmer_carry', 'jump_rope',
      'goblet_squat', 'farmer_carry', 'jump_rope',
      'goblet_squat', 'farmer_carry', 'jump_rope',
    ]);
    expect(steps.map((s) => `${s.position}/${s.positions}`).slice(0, 3)).toEqual(['1/3', '2/3', '3/3']);
  });

  it('rests between LAPS and not between the exercises of a lap', () => {
    // This is the whole distinction. Resting 120 s between the exercises of a circuit is a
    // completely different workout from resting 120 s between its laps.
    expect(runSteps(session).map((s) => s.restAfterS)).toEqual([0, 0, 120, 0, 0, 120, 0, 0, 0]);
  });
});

describe('an interval block — six by four hundred', () => {
  const session: PlannedSession = {
    name: 'Intervals',
    blocks: [
      { rounds: 1, items: [{ kind: 'time', ex: 'warm_up', seconds: 600 }] },
      { rounds: 6, restS: 90, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 400, say: 'Hard.' }] },
      { rounds: 1, items: [{ kind: 'time', ex: 'cool_down', seconds: 600 }] },
    ],
  };

  it('is eight steps: a warm-up, six repeats, a cool-down', () => {
    const steps = runSteps(session);
    expect(steps.length).toBe(8);
    expect(steps.map((s) => s.block)).toEqual([1, 2, 2, 2, 2, 2, 2, 3]);
    expect(steps.every((s) => s.blocks === 3)).toBe(true);
  });

  it('walks ninety seconds between repeats and not after the sixth', () => {
    expect(runSteps(session).map((s) => s.restAfterS)).toEqual([0, 90, 90, 90, 90, 90, 0, 0]);
    expect(plannedRestS(session)).toBe(450);
  });

  it('carries the coach\'s instruction through untouched', () => {
    expect(runSteps(session).filter((s) => s.item.say).every((s) => s.item.say === 'Hard.')).toBe(true);
  });
});

describe('edges', () => {
  it('returns nothing for a session with no blocks rather than throwing', () => {
    expect(runSteps({ name: 'Empty', blocks: [] })).toEqual([]);
    expect(plannedRestS({ name: 'Empty', blocks: [] })).toBe(0);
  });

  it('keeps an unresolvable id as its own name rather than dropping the step', () => {
    // `parseCoachPlan` already refuses an id it cannot resolve, so this is unreachable through the
    // front door. If it ever happens, a visible odd name beats a set the athlete never sees and the
    // record cannot explain.
    const steps = runSteps({ name: 'D', blocks: [{ rounds: 1, items: [reps('ghost_lift')] }] });
    expect(steps.map((s) => s.name)).toEqual(['ghost_lift']);
  });

  it('names a movement from the movement list, not only lifts', () => {
    const steps = runSteps({ name: 'D', blocks: [{ rounds: 1, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 5000 }] }] });
    expect(steps[0].name).toBe('Run');
  });
});
