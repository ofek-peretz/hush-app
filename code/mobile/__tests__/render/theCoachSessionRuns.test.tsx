/**
 * ════ SHE PRESSES START AND DOES WHAT THE COACH WROTE ════
 *
 * The last hop. The coach decides, the plan is stored whole, `coachWeek` reads it — and none of
 * that has reached her hands until the session machine will actually run one.
 *
 * `buildPlanFromCoach` had existed, fully tested, with NO caller in `src` for a whole build. That
 * is the failure mode this file guards: a pipe with no outlet, green all the way along.
 *
 * ── WHY A SECOND DOOR INSTEAD OF ONE ────────────────────────────────────────────────────────────
 * `start(day, targets)` composes a plan AROUND the engine's per-set targets, from a `ProgramDay`.
 * A coach session has neither. Its loads are already decided and sit in the items, and three of its
 * four shapes cannot be written as a `ProgramDay` at all. Making one door serve both would mean
 * inventing a `ProgramDay` for a 400 m repeat, which is the conversion this layer exists to refuse.
 */
// @ts-nocheck

// 

import { buildPlanFromCoach } from '@/state/stores/sessionStore';
import { parseCoachPlan } from '@/domain/coachPlan';
import { coachSession, coachWorkoutId } from '@/domain/coachWeek';
import { db } from '@/data/local/db';

const REPLY = JSON.stringify({
  say: 'Here is your week.',
  sessions: [{
    name: 'Intervals & Core',
    blocks: [
      { rounds: 4, restS: 60, items: [
        { kind: 'distance', ex: 'run_outdoor', metres: 400, say: 'Faster than conversation pace.' },
        { kind: 'time', ex: 'walk_outdoor', seconds: 90 },
      ] },
      { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'bb_back_squat', reps: [8, 12], load: 40 }] },
    ],
  }],
});

beforeEach(async () => { await db.clearAll(); });

/** The whole way through: a reply, stored, read back, and turned into steps. */
async function land() {
  const parsed = parseCoachPlan(REPLY);
  if (!parsed.ok) throw new Error(`fixture must parse, got ${parsed.reason}`);
  await db.recordCoachAnswer(parsed.answer, '2026-08-01T09:00:00.000Z');
  return db.loadCoachPlan();
}

describe('the coach session reaches her hands', () => {
  it('runs the stored plan, in the coach’s order, with every shape intact', async () => {
    const plan = await land();
    const session = coachSession(plan, coachWorkoutId(0))!;
    const steps = buildPlanFromCoach(session);

    // 4 rounds × 2 items, then 3 rounds × 1.
    expect(steps.map((s) => s.item?.kind)).toEqual([
      'distance', 'time', 'distance', 'time', 'distance', 'time', 'distance', 'time',
      'reps', 'reps', 'reps',
    ]);
    // The instruction survives all the way to the step she is looking at while she does it.
    expect(steps[0].item?.say).toBe('Faster than conversation pace.');
  });

  it('carries a target ONLY on the shape that has one', async () => {
    // The rest of the machine drives a load off `target`. A run has no load to drive, and giving it
    // an empty one would put a weight column on a 400 m repeat.
    const steps = buildPlanFromCoach(coachSession(await land(), coachWorkoutId(0))!);
    expect(steps.filter((s) => s.target).map((s) => s.item?.kind)).toEqual(['reps', 'reps', 'reps']);
    expect(steps.find((s) => s.target)!.target).toMatchObject({
      recommendedWeight: 40, repBandLo: 8, repBandHi: 12,
    });
  });

  it('numbers the rounds as the athlete experiences them', async () => {
    // A set, a lap and a circuit round are one idea — `rounds` is the only count there is.
    const steps = buildPlanFromCoach(coachSession(await land(), coachWorkoutId(0))!);
    const runs = steps.filter((s) => s.exerciseId === 'run_outdoor');
    expect(runs.map((s) => s.exerciseSetIndex)).toEqual([0, 1, 2, 3]);
    expect(runs.every((s) => s.totalSetsInExercise === 4)).toBe(true);
  });

  it('rests BETWEEN rounds, never between the items of one', async () => {
    // The 90-second walk follows the run inside a round; the 60-second rest closes the round. Resting
    // after the run would turn an interval session into eight separate efforts.
    const steps = buildPlanFromCoach(coachSession(await land(), coachWorkoutId(0))!);
    expect(steps[0].restAfterS).toBe(0);   // run → walk, same round
    expect(steps[1].restAfterS).toBe(60);  // walk → next round
  });

  it('marks the end, so the machine knows when the workout is over', async () => {
    const steps = buildPlanFromCoach(coachSession(await land(), coachWorkoutId(0))!);
    expect(steps.filter((s) => s.lastSetOfSession)).toHaveLength(1);
    expect(steps.at(-1)!.lastSetOfSession).toBe(true);
  });
});
