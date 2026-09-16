/**
 * ════ WHAT IS DONE STAYS DONE — the session map's reorder (founder, 2026-09-07) ════
 *
 * *"במהלך האימון יש פקד שמציג את התרגילים — אני רוצה שיהיה אפשרות להחליף את סדר התרגילים שם. רק
 * תוודא שמה שבוצע אי אפשר להחליף."*
 *
 * The second sentence is the law. `reorderAheadOf` may move whole runs of a live plan among the
 * seats that are still ahead of her, and it may not touch — or let anything land in — a seat she
 * has done or is standing on. This file pins the boundary on both sides of a rest, the superset
 * lock, and the renumbering that keeps the machine's cursor honest.
 */

import { movableExercisesFrom, reorderAheadOf, reorderBoundary } from '@/state/stores/sessionStore';
import type { SessionMachine } from '@/state/machines/sessionState';

type Step = Parameters<typeof reorderAheadOf>[0][number];

/** A plan of runs: `[['a', 3], ['b', 2], …]` → 3 sets of a, then 2 of b. */
function plan(runs: [string, number][]): Step[] {
  const out: Step[] = [];
  for (const [ex, n] of runs) {
    for (let i = 0; i < n; i++) {
      out.push({
        exerciseId: ex,
        globalIndex: out.length,
        exerciseSetIndex: i,
        totalSetsInExercise: n,
        lastSetOfExercise: i === n - 1,
        lastSetOfSession: false,
      } as Step);
    }
  }
  out[out.length - 1] = { ...out[out.length - 1], lastSetOfSession: true };
  return out;
}

const order = (p: Step[]) => [...new Set(p.map((s) => s.exerciseId))];
const machine = (over: Partial<SessionMachine>): SessionMachine => ({
  phase: 'SET_PRESENTED', resumePhase: null, setIndex: 0, isLastSetOfSession: false, earlyFinish: false, ...over,
});

describe('the boundary', () => {
  it('⛔ on a live set the cursor itself is the boundary — the lift under it is fixed once it has begun', () => {
    const p = plan([['a', 3], ['b', 2], ['c', 2], ['d', 2]]);
    // Standing on a's SECOND set: a has begun and is a record; b, c, d may move.
    expect(movableExercisesFrom(p, 1)).toEqual(['b', 'c', 'd']);
    // Standing on b's FIRST set, nothing logged for b yet: b may still move — the busy-equipment rule.
    expect(movableExercisesFrom(p, 3)).toEqual(['b', 'c', 'd']);
  });

  it('⛔ during a rest the boundary is one past the cursor — the set she just logged is a record', () => {
    const p = plan([['a', 3], ['b', 2], ['c', 2]]);
    // Rest after a's last set: the cursor still points at a's last set; b is next and movable.
    expect(reorderBoundary(machine({ phase: 'REST_TRANSITION', setIndex: 2 }))).toBe(3);
    expect(movableExercisesFrom(p, 3)).toEqual(['b', 'c']);
    // Rest between a's sets: a is mid-run and stays fixed either way.
    expect(reorderBoundary(machine({ phase: 'REST_INTER', setIndex: 1 }))).toBe(2);
    expect(movableExercisesFrom(p, 2)).toEqual(['b', 'c']);
    // Paused inside a rest reads the frozen phase, not PAUSED.
    expect(reorderBoundary(machine({ phase: 'PAUSED', resumePhase: 'REST_TRANSITION', setIndex: 2 }))).toBe(3);
  });

  it('⛔ a superset is locked — a lift with two runs interleaves with a partner and cannot be moved', () => {
    const p = plan([['a', 1], ['b', 1], ['a', 1], ['b', 1], ['c', 3]]);
    expect(movableExercisesFrom(p, 0)).toEqual(['c']);
  });
});

describe('the move', () => {
  it('moves a whole run and renumbers, leaving the fixed prefix byte-for-byte', () => {
    const p = plan([['a', 3], ['b', 2], ['c', 2], ['d', 2]]);
    const next = reorderAheadOf(p, 3, 'd', 0); // d to the first movable seat
    expect(order(next)).toEqual(['a', 'd', 'b', 'c']);
    expect(next.slice(0, 3)).toEqual(p.slice(0, 3));
    expect(next.map((s) => s.globalIndex)).toEqual(next.map((_, i) => i));
    expect(next.filter((s) => s.lastSetOfSession).map((s) => s.exerciseId)).toEqual(['c']);
    expect(next.length).toBe(p.length);
  });

  it('⛔ refuses to move a done or live lift, and refuses a position that is not movable', () => {
    const p = plan([['a', 3], ['b', 2], ['c', 2]]);
    expect(reorderAheadOf(p, 3, 'a', 1)).toBe(p); // a is done
    expect(reorderAheadOf(p, 1, 'a', 1)).toBe(p); // a is live, mid-run
    expect(reorderAheadOf(p, 3, 'zzz', 0)).toBe(p); // not in the plan
    expect(reorderAheadOf(p, 3, 'b', 0)).toBe(p); // already there — nothing to do
  });

  it('⛔ a locked run between movable ones keeps its seat', () => {
    // a done; b/c/d ahead but b and d are a superset pair → only c and e may move.
    const p = plan([['a', 2], ['b', 1], ['c', 2], ['b', 1], ['e', 2]]);
    expect(movableExercisesFrom(p, 2)).toEqual(['c', 'e']);
    const next = reorderAheadOf(p, 2, 'e', 0);
    expect(next.map((s) => s.exerciseId)).toEqual(['a', 'a', 'b', 'e', 'e', 'b', 'c', 'c']);
  });

  it('the position is clamped to the movable seats — dropping past the end lands last', () => {
    const p = plan([['a', 1], ['b', 1], ['c', 1], ['d', 1]]);
    expect(order(reorderAheadOf(p, 0, 'a', 99))).toEqual(['b', 'c', 'd', 'a']);
    expect(order(reorderAheadOf(p, 0, 'd', -5))).toEqual(['d', 'a', 'b', 'c']);
  });
});

describe('the chain', () => {
  const fs = require('fs');
  const path = require('path');
  const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');

  it('⛔ the store publishes which lifts may move, and the map draws its grips from that answer alone', () => {
    const store = src('state/stores/sessionStore.tsx');
    expect(store).toContain('movableExerciseIds: movableExercisesFrom(plan, reorderBoundary(machine))');
    expect(store).toMatch(/reorderAhead\(exerciseId, toPosition\) \{\s*const newPlan = reorderAheadOf\(plan, reorderBoundary\(machine\), exerciseId, toPosition\);/);
    const stage = src('screens/session/SessionFlow.tsx');
    expect(stage).toContain("movable: (session.movableExerciseIds ?? []).includes(id)");
    expect(stage).toContain('session.reorderAhead?.(ids[from], position)');
  });

  it('⛔ and the pre-workout card’s drag edits the week on disk by day id, gated like its swap', () => {
    const card = src('screens/plan/PreWorkoutScreen.tsx');
    expect(card).toMatch(/onReorder=\{\s*doneIds\.includes\(workout\.id\) \|\| !program\s*\? undefined/);
    expect(card).toContain('app.reorderExercise(day.id, from, to)');
    const store = src('state/stores/appStore.tsx');
    expect(store).toContain('const next = moveLift(program, di, fromIndex, toIndex);');
  });

  it('⛔ a swap edits the seats holding the lift she named — it never regenerates the week', () => {
    const store = src('state/stores/appStore.tsx');
    const body = store
      .slice(store.indexOf('async declareSwap('), store.indexOf('async saveLibrary('))
      .replace(/\/\*[\s\S]*?\*\//g, '') // the docblock names the rebuild it replaced; the CODE may not
      .replace(/\/\/[^\n]*/g, '');

    expect(body).not.toContain('generateProgram');
    expect(body).toContain('replaceLift(next, di, si, toExerciseId)');
  });
});
