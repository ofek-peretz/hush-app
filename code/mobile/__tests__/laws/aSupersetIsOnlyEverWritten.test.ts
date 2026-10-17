// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A SUPERSET IS ONLY EVER WRITTEN — NEVER MADE BY MOVING A LIFT (founder, 2026-10-13)
 *
 *   > *"יש משהו מוזר — לפעמים במסך זה פתאום מציג סופרסט בזמן האימון. למשל בתוכנית האחרונה של האימון
 *   > האחרון לא היה סופרסט בתוכנית ופתאום הופיע במהלך האימון דרישה לסופרסט."*
 *
 * The screens read a superset off the STEPS, not off a label (`domain/supersetView`): two different
 * lifts with no rest between them are a round. That is the right rule, and it had one false witness.
 * `planRun` ends every session by writing "no rest" onto its last step — *"nothing follows the last
 * step, so nothing is being rested FOR"* — and the session carried that zero as if it were a fact
 * about the SET. It is a fact about the POSITION. Every verb that moves lifts mid-workout re-derived
 * which step is last and carried the zero along:
 *
 *   · "תפוס" on the lift before the last one — the last lift comes forward, zero and all;
 *   · starting the last lift from the session map, or dragging it up the order;
 *   · leaving a lift after two sets — its remainder goes to the END, behind the old last step;
 *   · "+1 סט" on the last lift.
 *
 * In every one of them the old last set now had a lift after it and "no rest" before that lift: the
 * rest was skipped and the stage announced a superset of two lifts nobody ever coupled.
 *
 * So the zero is no longer carried: the last step holds the rest it would have had anywhere else
 * (`buildPlanFromCoach`), and "nothing follows" stays where it always was — `lastSetOfSession`.
 * This file runs every verb, and a thousand random walks of them, over a session with no couple in
 * it, and over one with a real couple, which must come through exactly as it was written.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import {
  addWorkingSet,
  aheadExercisesFrom,
  bringForward,
  buildPlanFromCoach,
  deferCurrentExercise,
  flowsStraightOn,
  movableExercisesFrom,
  reorderAheadOf,
  restAfterStep,
  sessionSupersetAt,
  type Step,
} from '@/state/stores/sessionStore';
import { REST_SKIP_THRESHOLD_S } from '@/state/machines/sessionState';
import type { PlannedItem, PlannedSession } from '@/domain/coachPlan';

const lift = (ex: string, load = 40): PlannedItem => ({ kind: 'reps', ex, reps: [8, 12], load });
const LIFTS = ['bb_bench_press', 'db_row', 'lateral_raise', 'bb_back_squat', 'cable_triceps_pushdown'];

/** A day as every week is written: one lift a block, no rest stated, no couple anywhere. */
const plain = (sets = 3): PlannedSession => ({ name: 'Day', blocks: LIFTS.map((ex) => ({ rounds: sets, items: [lift(ex)] })) });
/** The same day with ONE couple the coach did write — the second and third lifts. */
const coupled = (): PlannedSession => ({
  name: 'Day',
  blocks: [
    { rounds: 3, items: [lift(LIFTS[0])] },
    { rounds: 3, restS: 90, items: [lift(LIFTS[1]), lift(LIFTS[2])] },
    { rounds: 3, items: [lift(LIFTS[3])] },
    { rounds: 3, items: [lift(LIFTS[4])] },
  ],
});

/** Every couple the steps describe, as "a+b" — what the stage, the rest card and the wrist would announce. */
const couples = (plan: Step[]): string[] => [
  ...new Set(plan.map((_, i) => sessionSupersetAt(plan, i)).filter(Boolean).map((s) => s.exerciseIds.join('+'))),
];
/** Steps the machine would run straight out of with no rest screen — and that are not the end of the workout. */
const restless = (plan: Step[]): string[] =>
  plan.filter((st) => !st.lastSetOfSession && restAfterStep(st) <= REST_SKIP_THRESHOLD_S).map((st) => `${st.exerciseId}#${st.exerciseSetIndex}`);
const firstOf = (plan: Step[], ex: string) => plan.findIndex((st) => st.exerciseId === ex);
const last = LIFTS[LIFTS.length - 1];
const beforeLast = LIFTS[LIFTS.length - 2];

describe('⛔ a day with no couple has none — whatever she does with the order', () => {
  const plan = buildPlanFromCoach(plain());

  it('as written: no couple, and a rest after every set but the last of the workout', () => {
    expect(couples(plan)).toEqual([]);
    expect(restless(plan)).toEqual([]);
    expect(plan.filter((st) => st.lastSetOfSession).length).toBe(1);
  });

  it('"תפוס" on the lift before the last: the last lift comes forward — and is still followed by a rest', () => {
    const at = firstOf(plan, beforeLast);
    const moved = bringForward(plan, at, last); // `markEquipmentOccupied`: the next lift, brought to the boundary
    expect(moved.slice(at, at + 3).every((st) => st.exerciseId === last)).toBe(true);
    expect(couples(moved)).toEqual([]);
    expect(restless(moved)).toEqual([]);
    // the very step that used to say "no rest": the old last set, now in the middle of the workout
    const oldLast = moved[at + 2];
    expect([oldLast.exerciseId, oldLast.lastSetOfSession, flowsStraightOn(oldLast)]).toEqual([last, false, false]);
    // …and the same through the older verb the coach's "defer" still uses
    expect(couples(deferCurrentExercise(plan, at))).toEqual([]);
    expect(restless(deferCurrentExercise(plan, at))).toEqual([]);
  });

  it('starting the last lift from the map, at the first set of the workout or in the middle of it', () => {
    for (const boundary of [0, 1, 4, 7]) {
      const moved = bringForward(plan, boundary, last);
      expect(couples(moved)).toEqual([]);
      expect(restless(moved)).toEqual([]);
    }
  });

  it('leaving a lift after two sets: its remainder waits at the end — after a rest, not as half of a couple', () => {
    const boundary = firstOf(plan, LIFTS[1]) + 2; // two sets of the second lift done; she walks to the third
    const moved = bringForward(plan, boundary, LIFTS[2], { remainderToEnd: true });
    expect(moved[moved.length - 1].exerciseId).toBe(LIFTS[1]); // the remainder is the last thing now
    expect(couples(moved)).toEqual([]);
    expect(restless(moved)).toEqual([]);
  });

  it('dragging the last lift up the order', () => {
    for (let to = 0; to < LIFTS.length - 1; to++) {
      const moved = reorderAheadOf(plan, 0, last, to);
      expect(couples(moved)).toEqual([]);
      expect(restless(moved)).toEqual([]);
    }
  });

  it('"+1 סט" on the last lift: the set she adds is rested for like any other', () => {
    const grown = addWorkingSet(plan, firstOf(plan, last) + 2, last);
    expect(grown.length).toBe(plan.length + 1);
    expect(restless(grown)).toEqual([]);
    expect(grown[grown.length - 1].lastSetOfSession).toBe(true);
  });

  it('⛔ a thousand random workouts — every verb, any order, any moment — and never a couple, never a skipped rest', () => {
    let seed = 20261013;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let run = 0; run < 1000; run++) {
      let p = buildPlanFromCoach(plain(2 + rnd(3)));
      let boundary = 0;
      for (let move = 0; move < 8; move++) {
        boundary = Math.min(p.length - 1, boundary + rnd(4));
        const ahead = [...new Set(p.slice(boundary).map((st) => st.exerciseId))];
        const pick = ahead[rnd(ahead.length)];
        const verb = rnd(5);
        if (verb === 0) p = bringForward(p, boundary, pick);
        else if (verb === 1) p = bringForward(p, boundary, pick, { remainderToEnd: true });
        else if (verb === 2) p = deferCurrentExercise(p, boundary);
        else if (verb === 3) {
          const movable = movableExercisesFrom(p, boundary);
          if (movable.length > 1) p = reorderAheadOf(p, boundary, movable[rnd(movable.length)], rnd(movable.length));
        } else p = addWorkingSet(p, boundary, p[boundary].exerciseId);
        const found = couples(p);
        if (found.length || restless(p).length) throw new Error(`run ${run}, move ${move} (verb ${verb}): couples ${JSON.stringify(found)}, no rest after ${JSON.stringify(restless(p))}`);
        expect(p.filter((st) => st.lastSetOfSession).length).toBe(1);
        expect(p[p.length - 1].lastSetOfSession).toBe(true);
      }
    }
  });
});

describe('a couple the coach DID write comes through exactly as written — and stays the only one', () => {
  const plan = buildPlanFromCoach(coupled());
  const pair = `${LIFTS[1]}+${LIFTS[2]}`;

  it('is one couple of three rounds: no rest inside a round, the coach’s rest between rounds', () => {
    expect(couples(plan)).toEqual([pair]);
    const at = firstOf(plan, LIFTS[1]);
    expect(sessionSupersetAt(plan, at)).toMatchObject({ exerciseIds: [LIFTS[1], LIFTS[2]], position: 1, round: 1, rounds: 3 });
    expect(plan.slice(at, at + 6).map((st) => restAfterStep(st) <= REST_SKIP_THRESHOLD_S)).toEqual([true, false, true, false, true, false]);
  });

  it('…and moving the lifts around it makes no second couple', () => {
    const moves = [
      bringForward(plan, 0, last),
      bringForward(plan, 1, last),
      bringForward(plan, 2, LIFTS[3], { remainderToEnd: true }),
      reorderAheadOf(plan, 0, last, 0),
      deferCurrentExercise(plan, firstOf(plan, LIFTS[3])),
      addWorkingSet(plan, firstOf(plan, last) + 2, last),
    ];
    for (const moved of moves) expect(couples(moved)).toEqual([pair]);
  });

  it('a couple that ENDS the workout still ends it — the last step is the last step, and nothing is rested for', () => {
    const ending: PlannedSession = { name: 'Day', blocks: [{ rounds: 3, items: [lift(LIFTS[0])] }, { rounds: 2, restS: 60, items: [lift(LIFTS[1]), lift(LIFTS[2])] }] };
    const p = buildPlanFromCoach(ending);
    expect(couples(p)).toEqual([pair]);
    expect(p[p.length - 1].lastSetOfSession).toBe(true);
    expect(flowsStraightOn(p[p.length - 1])).toBe(false); // nothing to flow into
  });

  /*
   * ⛔ AND THE COUPLE ITSELF MOVES AS ONE (found the same day, walking the fix above on the glass).
   * With a real couple in the plan, "start this now" on one of its lifts brought forward that lift's
   * FIRST SET ALONE — in a superset a run is one set — and it arrived saying "straight on to my
   * partner" with a stranger behind it. `stationOrder` has said it since the day it was written:
   * blocks move, never items.
   */

  /** Every step that runs straight on must be the couple's first lift going to its second — and nothing else. */
  const tornOrMade = (p: Step[]): string[] =>
    p.flatMap((st, i) =>
      !st.lastSetOfSession && restAfterStep(st) <= REST_SKIP_THRESHOLD_S && !(st.exerciseId === LIFTS[1] && p[i + 1]?.exerciseId === LIFTS[2])
        ? [`${st.exerciseId}→${p[i + 1]?.exerciseId}`]
        : [],
    );
  const whole = (p: Step[]) => {
    expect(couples(p)).toEqual([pair]);
    expect(tornOrMade(p)).toEqual([]);
  };

  it('starting EITHER of its lifts from the map brings every round of it, in its own order', () => {
    for (const tapped of [LIFTS[1], LIFTS[2]]) {
      const moved = bringForward(plan, 0, tapped);
      expect(moved.slice(0, 6).map((st) => st.exerciseId)).toEqual([LIFTS[1], LIFTS[2], LIFTS[1], LIFTS[2], LIFTS[1], LIFTS[2]]);
      whole(moved);
      expect(sessionSupersetAt(moved, 0)).toMatchObject({ position: 1, round: 1, rounds: 3 });
    }
  });

  it('standing on it, its other lift is not "another station" — and "taken" steps the whole couple aside', () => {
    const at = firstOf(plan, LIFTS[1]);
    expect(aheadExercisesFrom(plan, at)).toEqual([LIFTS[3], LIFTS[4]]);
    expect(bringForward(plan, at, LIFTS[2])).toBe(plan); // the partner IS what is next
    const aside = bringForward(plan, at, aheadExercisesFrom(plan, at)[0]); // the wrist's "taken"
    expect(aside.slice(at, at + 3).every((st) => st.exerciseId === LIFTS[3])).toBe(true);
    expect(aside.slice(at + 3, at + 9).map((st) => st.exerciseId)).toEqual([LIFTS[1], LIFTS[2], LIFTS[1], LIFTS[2], LIFTS[1], LIFTS[2]]);
    whole(aside);
    // the coach's "defer" makes the same move
    expect(deferCurrentExercise(plan, at).map((st) => st.exerciseId)).toEqual(aside.map((st) => st.exerciseId));
    // …and a lift BEFORE the couple steps past all of it, not past its first set
    const past = deferCurrentExercise(plan, 0);
    expect(past.slice(0, 6).map((st) => st.exerciseId)).toEqual([LIFTS[1], LIFTS[2], LIFTS[1], LIFTS[2], LIFTS[1], LIFTS[2]]);
    whole(past);
  });

  it('nothing lands inside a round she has begun: mid-round, the lift she starts comes after her second half', () => {
    const at = firstOf(plan, LIFTS[1]) + 1; // the first lift of round 1 is logged; she is on its partner
    const moved = bringForward(plan, at, last);
    expect(moved[at].exerciseId).toBe(LIFTS[2]); // still the second half of the round
    expect(moved[at + 1].exerciseId).toBe(last); // …and THEN the lift she asked for
    whole(moved);
    // the rounds she stepped away from come back numbered as they were written — 2 of 3, not 1 of 2
    const back = moved.findIndex((st, i) => i > at + 1 && st.exerciseId === LIFTS[1]);
    expect(sessionSupersetAt(moved, back)).toMatchObject({ position: 1, round: 2, rounds: 3 });
  });

  it('leaving it after two rounds: the round that is left waits at the end — still a couple, still round 3 of 3', () => {
    const at = firstOf(plan, LIFTS[1]) + 4; // two rounds done; the third is next
    const moved = bringForward(plan, at, LIFTS[3], { remainderToEnd: true });
    expect(moved.slice(-2).map((st) => st.exerciseId)).toEqual([LIFTS[1], LIFTS[2]]);
    whole(moved);
    expect(sessionSupersetAt(moved, moved.length - 2)).toMatchObject({ position: 1, round: 3, rounds: 3 });
  });

  it('"+1 סט" does not exist inside a superset — there a set is a round of two', () => {
    const lastRound = firstOf(plan, LIFTS[1]) + 4;
    expect(addWorkingSet(plan, lastRound, LIFTS[1])).toBe(plan);
    expect(addWorkingSet(plan, lastRound + 1, LIFTS[2])).toBe(plan);
  });

  it('⛔ a thousand random workouts over a day WITH a couple: never torn, never joined by a stranger, no set lost', () => {
    let seed = 13102026;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    const census = (p: Step[]) => JSON.stringify(LIFTS.map((ex) => p.filter((st) => st.exerciseId === ex).length));
    for (let run = 0; run < 1000; run++) {
      let p = buildPlanFromCoach(coupled());
      let boundary = 0;
      for (let move = 0; move < 8; move++) {
        boundary = Math.min(p.length - 1, boundary + rnd(4));
        const ahead = [...new Set(p.slice(boundary).map((st) => st.exerciseId))];
        const pick = ahead[rnd(ahead.length)];
        const before = census(p);
        const verb = rnd(4);
        if (verb === 0) p = bringForward(p, boundary, pick);
        else if (verb === 1) p = bringForward(p, boundary, pick, { remainderToEnd: true });
        else if (verb === 2) p = deferCurrentExercise(p, boundary);
        else {
          const movable = movableExercisesFrom(p, boundary);
          if (movable.length > 1) p = reorderAheadOf(p, boundary, movable[rnd(movable.length)], rnd(movable.length));
        }
        const bad = tornOrMade(p);
        if (bad.length || census(p) !== before) throw new Error(`run ${run}, move ${move} (verb ${verb}, ${pick} at ${boundary}): ${JSON.stringify(bad)} ${before} → ${census(p)}`);
        expect(couples(p)).toEqual([pair]);
        expect(p.filter((st) => st.lastSetOfSession).length).toBe(1);
      }
    }
  });
});
