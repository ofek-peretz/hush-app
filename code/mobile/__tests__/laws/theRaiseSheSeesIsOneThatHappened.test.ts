// @ts-nocheck
// 
import { progressedLiftCount } from '@/state/stores/sessionStore';
import type { Step } from '@/state/stores/sessionStore';
import type { SetLog } from '@/data/local/models';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * "LIFTS RAISED THIS SESSION" IS A RAISE THAT ACTUALLY HAPPENED THIS SESSION.
 *
 * ⛔ FOUND IN THE 2026-08-04 AUDIT — the sixth surface still reading the deterministic engine after
 * the coach became the decider, and the one that reaches the WRIST and the LOCK SCREEN.
 *
 * It counted `target.reasonType === 'increase'`, a field `buildPlanFromCoach` never writes. Every
 * coach-built workout closed with **0 lifts raised** on both surfaces, whatever had happened.
 *
 * ⚠️ AND IT WAS THE WRONG FIELD EVEN BEFORE THE COACH. `reasonType` is the WEEKLY decision — a load
 * raised days earlier, before she walked in. The label has always read "this session". The only
 * thing that raises a load mid-session is Loop 1, which rewrites the remaining steps in place.
 *
 * So the measure is now the one the label always described, and it does not care which engine wrote
 * the plan: an exercise whose prescribed load ENDS the session higher than it started it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const step = (ex: string, i: number, load: number | null): Step => ({
  exerciseId: ex,
  globalIndex: i,
  exerciseSetIndex: i,
  totalSetsInExercise: 3,
  ...(load == null ? {} : { target: { exerciseId: ex, setIndex: i, recommendedWeight: load, recommendedReps: 8 } }),
  lastSetOfExercise: false,
  lastSetOfSession: false,
});
const logged = (ex: string): SetLog =>
  ({ exerciseId: ex, setIndex: 0, recommendedWeight: 40, recommendedReps: 8, actualWeight: 40, actualReps: 8, edited: false } as SetLog);

describe('a raise is measured, not read off a field', () => {
  it('⛔ counts a lift Loop 1 raised mid-session — on a COACH plan, which has no reasonType', () => {
    // The exact state that reported 0: nothing in this plan carries an engine reason.
    const plan = [step('bb_bench_press', 0, 40), step('bb_bench_press', 1, 42.5), step('bb_bench_press', 2, 42.5)];
    expect(progressedLiftCount(plan, [logged('bb_bench_press')])).toBe(1);
  });

  it('does not count a lift whose load never moved', () => {
    const plan = [step('db_row', 0, 22), step('db_row', 1, 22)];
    expect(progressedLiftCount(plan, [logged('db_row')])).toBe(0);
  });

  it('⚠️ does not count a lift that was EASED', () => {
    // A drop is a decision too, and it is not a raise. The founder's direction law is emphatic that
    // down and up are never the same thing.
    const plan = [step('bb_squat', 0, 60), step('bb_squat', 1, 55)];
    expect(progressedLiftCount(plan, [logged('bb_squat')])).toBe(0);
  });

  it('⚠️ counts only what she actually TRAINED', () => {
    // An early finish leaves raised steps she never reached. Reporting those would credit her with
    // work she did not do, on the screen that exists to tell her what she did.
    const plan = [step('bb_bench_press', 0, 40), step('bb_bench_press', 1, 45), step('lat_pulldown', 2, 30), step('lat_pulldown', 3, 35)];
    expect(progressedLiftCount(plan, [logged('bb_bench_press')])).toBe(1);
  });

  it('counts each exercise once, however many sets it raised across', () => {
    const plan = [step('x', 0, 40), step('x', 1, 42.5), step('x', 2, 45)];
    expect(progressedLiftCount(plan, [logged('x')])).toBe(1);
  });

  it('ignores a bodyweight lift, which has no load to raise', () => {
    const plan = [step('pull_up', 0, null), step('pull_up', 1, null)];
    expect(progressedLiftCount(plan, [logged('pull_up')])).toBe(0);
  });
});
