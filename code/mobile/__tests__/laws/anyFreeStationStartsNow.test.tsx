/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ANY FREE STATION STARTS NOW — the board, not the script.
 *
 * ⛔ FOUNDER, 2026-09-07: *"מה קורה בחדר כושר עמוס שזה כבר לא מקרה קצה… ברוב המקרים האימון משתנה
 * ולא לפי התוכנית."* The session is a ledger of what she still owes; whatever station is free is the
 * next thing. This pins `bringForward` (pure) and `startExerciseNow` (the store), the swap on every
 * set, and the busy verb at any set.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
//
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppContext } from '@/state/stores/appStore';
import {
  SessionProvider, useSession, bringForward, aheadExercisesFrom, reorderBoundary, type SessionView, type Step,
} from '@/state/stores/sessionStore';
import { projectSessionMirror, type MirrorStep } from '@/platform/sessionMirror';
import { initialSessionMachine } from '@/state/machines/sessionState';
import { db } from '@/data/local/db';
import type { PlannedSession } from '@/domain/coachPlan';

jest.mock('@/platform/coach/afterSession', () => ({
  askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })),
}));

const step = (exerciseId: string, i: number, n: number, g: number): Step => ({
  exerciseId,
  globalIndex: g,
  exerciseSetIndex: i,
  totalSetsInExercise: n,
  target: { exerciseId, setIndex: i, recommendedWeight: 60, recommendedReps: 8 },
  lastSetOfExercise: i === n - 1,
  lastSetOfSession: false,
});
/** Bench ×3, Row ×2, Curl ×2 — flattened, the last step flagged. */
function plan(): Step[] {
  const p = [step('bench', 0, 3, 0), step('bench', 1, 3, 1), step('bench', 2, 3, 2), step('row', 0, 2, 3), step('row', 1, 2, 4), step('curl', 0, 2, 5), step('curl', 1, 2, 6)];
  p[p.length - 1].lastSetOfSession = true;
  return p;
}
const ids = (p: Step[]) => p.map((s) => `${s.exerciseId}${s.exerciseSetIndex}`);

describe('⛔ bringForward — the ledger, re-sequenced', () => {
  it('a lift still ahead becomes the next thing; what was in front of it slides after, in order', () => {
    const out = bringForward(plan(), 0, 'curl');
    expect(ids(out)).toEqual(['curl0', 'curl1', 'bench0', 'bench1', 'bench2', 'row0', 'row1']);
    expect(out.map((s) => s.globalIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(out.filter((s) => s.lastSetOfSession).map((s) => ids([s])[0])).toEqual(['row1']);
  });

  it('⛔ MID-LIFT: the logged sets stay in the record; the REMAINDER of the lift she is on follows the new lift', () => {
    // She is on bench set 2 (index 1) — set 1 is a record. Start the row now.
    const out = bringForward(plan(), 1, 'row');
    expect(ids(out)).toEqual(['bench0', 'row0', 'row1', 'bench1', 'bench2', 'curl0', 'curl1']);
    // …and when she comes back it is still "set 2 of 3" — the split lift keeps its numbering.
    expect(out[3]).toMatchObject({ exerciseId: 'bench', exerciseSetIndex: 1, totalSetsInExercise: 3 });
  });

  /*
   * ⛔ x SETS, NOT y (founder, 2026-09-09): *"אם עשיתי x סטים בתרגיל כאשר x שונה מאחד, זרוק אותו לסוף
   * האימון בסדר התרגילים כי כנראה שאני מעדיף לעשות x סטים מאשר y הסטים שהתוכנית נתנה."*
   */
  it('⛔ with `remainderToEnd`, the remainder of the lift at the boundary waits at the END of the order', () => {
    // She is on bench set 3 (index 2) — two sets are the record. Start the row now, and the bench waits last.
    const out = bringForward(plan(), 2, 'row', { remainderToEnd: true });
    expect(ids(out)).toEqual(['bench0', 'bench1', 'row0', 'row1', 'curl0', 'curl1', 'bench2']);
    expect(out.map((s) => s.globalIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(out.filter((s) => s.lastSetOfSession).map((s) => ids([s])[0])).toEqual(['bench2']);
    // Only the lift AT the boundary moves last; a lift merely in front of the new one keeps its place.
    const far = bringForward(plan(), 2, 'curl', { remainderToEnd: true });
    expect(ids(far)).toEqual(['bench0', 'bench1', 'curl0', 'curl1', 'row0', 'row1', 'bench2']);
  });

  it('`remainderToEnd` is inert where no lift stands at the boundary (a transition rest) — the same as a plain call', () => {
    expect(ids(bringForward(plan(), 3, 'curl', { remainderToEnd: true }))).toEqual(ids(bringForward(plan(), 3, 'curl')));
  });

  it('the lift that is already next, or one not ahead at all, changes nothing — the same plan back', () => {
    const p = plan();
    expect(bringForward(p, 0, 'bench')).toBe(p);
    expect(bringForward(p, 3, 'bench')).toBe(p); // bench is behind the boundary: a record
    expect(bringForward(p, 0, 'deadlift')).toBe(p);
  });

  it('the lifts she could start now are every run still ahead, the very next one excluded', () => {
    expect(aheadExercisesFrom(plan(), 0)).toEqual(['row', 'curl']);
    expect(aheadExercisesFrom(plan(), 1)).toEqual(['row', 'curl']);
    expect(aheadExercisesFrom(plan(), 3)).toEqual(['curl']);
    expect(aheadExercisesFrom(plan(), 6)).toEqual([]);
  });

  it('the boundary is the cursor on a set and the cursor + 1 on a rest (a rest still points at the set it earned)', () => {
    const m = initialSessionMachine(false);
    expect(reorderBoundary(m)).toBe(0);
    expect(reorderBoundary({ ...m, phase: 'REST_INTER' })).toBe(1);
  });
});

/* ───────────────────────────── the store ───────────────────────────── */

const BENCH = 'bb_bench_press';
const ROW = 'bb_row';
const CURL = 'db_curl';
const appFixture = {
  booted: true,
  profile: { id: 'p1', name: 'Maya', sex: 'female', units: 'kg', weightKg: 62, bodyMap: {}, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  model: {},
  modeState: { completedSessions: 0 },
  recordSessionCompleted: async () => ({ unlockedPortrait: false }),
  markWorkoutCompleted: async () => {},
  refreshProgram: async () => {},
} as unknown as React.ContextType<typeof AppContext>;
const PLAN: PlannedSession = {
  name: 'Upper A',
  blocks: [
    { rounds: 3, items: [{ kind: 'reps', ex: BENCH, load: 60, reps: [8, 10] }] },
    { rounds: 2, items: [{ kind: 'reps', ex: ROW, load: 40, reps: [8, 10] }] },
    { rounds: 2, items: [{ kind: 'reps', ex: CURL, load: 10, reps: [8, 10] }] },
  ],
};
function harness() {
  let view: SessionView | null = null;
  function Probe() {
    view = useSession();
    return null;
  }
  act(() => {
    renderer.create(
      <AppContext.Provider value={appFixture}>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </AppContext.Provider>,
    );
  });
  return () => view!;
}
beforeEach(async () => {
  await db.clearAll();
});

describe("⛔ startExerciseNow — the board's verb, in the live store", () => {
  it('from a live set, mid-lift: the tapped lift presents now, and the bench comes back as "set 2 of 3" with its set kept', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => await view().completeSet()); // bench set 1, hers
    while (view().displayPhase !== 'SET_PRESENTED') await act(async () => view().endRest());
    expect(view().setLabel).toEqual({ n: 2, m: 3 });
    expect(view().aheadExerciseIds).toEqual([ROW, CURL]);
    await act(async () => view().startExerciseNow(CURL));
    expect(view().currentExerciseId).toBe(CURL);
    expect(view().setLabel).toEqual({ n: 1, m: 2 });
    expect(view().displayPhase).toBe('SET_PRESENTED');
    // The record is untouched, and the bench is owed: two sets, later.
    expect(view().loggedSets.map((s) => s.exerciseId)).toEqual([BENCH]);
    expect(view().livePlan.map((s) => s.exerciseId)).toEqual([BENCH, CURL, CURL, BENCH, BENCH, ROW, ROW]);
    // Play the curls through and the bench returns where it was left.
    for (let i = 0; i < 2; i++) {
      await act(async () => await view().completeSet());
      while (view().displayPhase !== 'SET_PRESENTED') await act(async () => view().endRest());
    }
    expect(view().currentExerciseId).toBe(BENCH);
    expect(view().setLabel).toEqual({ n: 2, m: 3 });
    expect(view().setsSoFar).toEqual([8]); // her first bench set, still hers
  });

  it("from a rest: the rest is cut and the tapped lift's first set presents", async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => await view().completeSet());
    expect(view().displayPhase).toBe('REST_INTER');
    await act(async () => view().startExerciseNow(ROW));
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(view().currentExerciseId).toBe(ROW);
    expect(view().setLabel).toEqual({ n: 1, m: 2 });
  });

  it('⛔ the last set of the session follows the plan: starting the last lift early never leaves the flag on a set that is not last', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => view().startExerciseNow(CURL));
    expect(view().livePlan.filter((s) => s.lastSetOfSession).map((s) => s.exerciseId)).toEqual([ROW]);
    // Two curls, then the bench and the row — she is never saved out early.
    for (let i = 0; i < 2; i++) {
      await act(async () => await view().completeSet());
      while (view().displayPhase !== 'SET_PRESENTED' && view().active) await act(async () => view().endRest());
    }
    expect(view().active).toBe(true);
    expect(view().currentExerciseId).toBe(BENCH);
  });

  it('⛔ x sets, not y: after TWO logged sets, starting another lift sends the remainder to the END of the order', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    for (let i = 0; i < 2; i++) {
      await act(async () => await view().completeSet());
      while (view().displayPhase !== 'SET_PRESENTED') await act(async () => view().endRest());
    }
    expect(view().setLabel).toEqual({ n: 3, m: 3 });
    await act(async () => view().startExerciseNow(ROW));
    expect(view().currentExerciseId).toBe(ROW);
    // The bench's last set waits behind everything, not behind the row.
    expect(view().livePlan.map((s) => s.exerciseId)).toEqual([BENCH, BENCH, ROW, ROW, CURL, CURL, BENCH]);
    expect(view().livePlan[view().livePlan.length - 1]).toMatchObject({ exerciseId: BENCH, exerciseSetIndex: 2, lastSetOfSession: true });
    expect(view().loggedSets).toHaveLength(2);
  });

  it('…and from the rest after the second set, the same — the rest is cut and the remainder waits last', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => await view().completeSet());
    while (view().displayPhase !== 'SET_PRESENTED') await act(async () => view().endRest());
    await act(async () => await view().completeSet());
    expect(view().displayPhase).toBe('REST_INTER');
    await act(async () => view().startExerciseNow(CURL));
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(view().currentExerciseId).toBe(CURL);
    expect(view().livePlan.map((s) => s.exerciseId)).toEqual([BENCH, BENCH, CURL, CURL, ROW, ROW, BENCH]);
  });

  it('one set is an interruption, not a decision: the remainder returns right after the new lift (as before)', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => await view().completeSet());
    while (view().displayPhase !== 'SET_PRESENTED') await act(async () => view().endRest());
    await act(async () => view().startExerciseNow(ROW));
    expect(view().livePlan.map((s) => s.exerciseId)).toEqual([BENCH, ROW, ROW, BENCH, BENCH, CURL, CURL]);
  });

  it("busy at ANY set: the lift's remainder goes one run later, the logged sets stay", async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => await view().completeSet());
    while (view().displayPhase !== 'SET_PRESENTED') await act(async () => view().endRest());
    expect(view().canMarkOccupied).toBe(true); // on set 2 — not only set 1 any more
    await act(async () => view().markEquipmentOccupied());
    expect(view().currentExerciseId).toBe(ROW);
    expect(view().livePlan.map((s) => s.exerciseId)).toEqual([BENCH, ROW, ROW, BENCH, BENCH, CURL, CURL]);
    expect(view().loggedSets).toHaveLength(1);
  });

  it('the wrist mirror offers the swap and the busy verb on every set — phone parity', () => {
    const steps: MirrorStep[] = [0, 1, 2].map((i) => ({
      exerciseName: 'Bench', exerciseGroup: 'Chest', setIndexInExercise: i, totalSetsInExercise: 3, globalIndex: i,
      targetWeight: 60, targetReps: 8, swapOptions: [{ id: 'x', name: 'X' }],
    }));
    steps.push({ exerciseName: 'Row', exerciseGroup: 'Back', setIndexInExercise: 0, totalSetsInExercise: 1, globalIndex: 3, targetWeight: 40, targetReps: 8, swapOptions: [] });
    const at = (setIndex: number) =>
      projectSessionMirror({
        steps, total: 4, machine: { ...initialSessionMachine(false), setIndex }, restInterS: 90, restTransitionS: 120, restStartedAtMs: null, nowMs: 0,
      })!;
    expect(at(0).canMarkBusy).toBe(true);
    expect(at(1).canMarkBusy).toBe(true); // set 2, still a later lift to go to
    expect(at(1).swapOptions).toHaveLength(1);
    expect(at(3).canMarkBusy).toBe(false); // the last lift has nothing to defer to
  });
});
