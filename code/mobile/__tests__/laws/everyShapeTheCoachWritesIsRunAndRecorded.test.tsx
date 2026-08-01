/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY SHAPE THE COACH WRITES IS RUN, AND EVERY ONE OF THEM IS RECORDED.
 *
 * The coach can prescribe four shapes. `coachPlan` parsed all four, `planRun` expanded all four,
 * `buildPlanFromCoach` carried all four onto the plan, `ItemStage` drew three of them and
 * `ItemResult` was designed to record them — and **the session store could only end a set**. Three
 * of the four shapes had no way through the workout at all: a plank arrived at the set stage as a
 * set with no weight and no reps, mid-session, and nothing could write it down afterwards.
 *
 * Every layer was green. The chain had no outlet.
 *
 * ── WHAT THIS FILE ASSERTS ──────────────────────────────────────────────────────────────────────
 * It drives the REAL store — `SessionProvider`, `startCoach`, the real machine, the real database —
 * through a session that holds all four shapes, and asks the questions that were unanswerable:
 *
 *   · can she finish a step that is not a set at all?
 *   · does the record say what she actually did, in the shape she did it?
 *   · does a session made entirely of intervals and holds COUNT as a workout?
 *
 * The last one is not a detail. `sessionTrained` and the not-started guard both counted `SetLog`s,
 * so a runner's whole week — finished to the last repeat — read as a session she never started, and
 * was deleted at the end of it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { db } from '@/data/local/db';
import type { PlannedSession } from '@/domain/coachPlan';

jest.mock('@/platform/coach/afterSession', () => ({
  // The post-session call is fire-and-forget by design; a test must not reach the network for it.
  askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })),
}));

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

/** A handle on the live store, so a test can act as the screens do. */
function harness(): { view: () => SessionView } {
  let current: SessionView | null = null;
  function Probe() {
    current = useSession();
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
  return {
    view: () => {
      if (!current) throw new Error('the session store never mounted');
      return current;
    },
  };
}

/** Finish the step she is on, whichever shape it is, and walk through any rest that follows. */
async function finishStep(h: { view: () => SessionView }, done?: { seconds?: number }): Promise<void> {
  const v = h.view();
  await act(async () => {
    if (v.currentItem && v.currentItem.kind !== 'reps') await v.completeItem(done);
    else await v.completeSet();
  });
  // A rest is a screen, not a state of the record — walk it the way the countdown does at zero.
  while (h.view().displayPhase !== 'SET_PRESENTED' && h.view().active) {
    await act(async () => h.view().endRest());
  }
}

beforeEach(async () => {
  await db.clearAll();
});

describe('a session of every shape', () => {
  const MIXED: PlannedSession = {
    name: 'Everything',
    blocks: [
      { rounds: 1, restS: 30, items: [{ kind: 'open', ex: 'warm_up', say: 'Loose, not tired.' }] },
      { rounds: 2, restS: 60, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 32.5 }] },
      { rounds: 1, restS: 45, items: [{ kind: 'time', ex: 'plank', seconds: 45, say: 'Ribs down.' }] },
      { rounds: 1, items: [{ kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24 }] },
    ],
  };

  it('runs every step, and the record holds each one in its own shape', async () => {
    const h = harness();
    await act(async () => h.view().startCoach(MIXED, 'coach_0'));

    expect(h.view().currentItem?.kind).toBe('open');
    await finishStep(h);
    expect(h.view().currentItem?.kind).toBe('reps');
    await finishStep(h);
    await finishStep(h);
    expect(h.view().currentItem?.kind).toBe('time');
    await finishStep(h, { seconds: 30 }); // she stopped early — that IS the measurement
    expect(h.view().currentItem?.kind).toBe('distance');
    await finishStep(h);

    const [saved] = await db.loadHistory();
    expect(saved.items?.map((i) => i.kind)).toEqual(['open', 'reps', 'reps', 'time', 'distance']);
    // A plank is never written as zero reps at zero kilograms — the whole reason `items` exists.
    expect(saved.sets.map((s) => s.exerciseId)).toEqual(['bb_bench_press', 'bb_bench_press']);
    const held = saved.items!.find((i) => i.kind === 'time')!;
    expect(held).toMatchObject({ kind: 'time', seconds: 30, askedSeconds: 45, ex: 'plank' });
    const carried = saved.items!.find((i) => i.kind === 'distance')!;
    expect(carried).toMatchObject({ kind: 'distance', metres: 40, askedMetres: 40 });
  });

  it('says where each step sat, so the coach reads it back as the session she was given', async () => {
    const h = harness();
    await act(async () => h.view().startCoach(MIXED, 'coach_0'));
    for (let i = 0; i < 5; i++) await finishStep(h);

    const [saved] = await db.loadHistory();
    expect(saved.items!.map((i) => [i.block, i.round, i.position])).toEqual([
      [1, 1, 1], [2, 1, 1], [2, 2, 1], [3, 1, 1], [4, 1, 1],
    ]);
  });

  it('writes a reps step to BOTH views, so neither reader is missing work', async () => {
    // `sets` is what the engine, History and the mirror still read; `items` is what the coach is
    // sent. A record that held only the planks would tell the coach she had stopped lifting.
    const h = harness();
    await act(async () => h.view().startCoach(MIXED, 'coach_0'));
    for (let i = 0; i < 5; i++) await finishStep(h);

    const [saved] = await db.loadHistory();
    const reps = saved.items!.filter((i) => i.kind === 'reps');
    expect(reps).toHaveLength(saved.sets.length);
    expect(reps[0]).toMatchObject({ load: 32.5, reps: 8 });
  });
});

describe('a session with no sets in it at all', () => {
  const INTERVALS: PlannedSession = {
    name: 'Intervals',
    blocks: [
      { rounds: 1, items: [{ kind: 'time', ex: 'warm_up', seconds: 600 }] },
      { rounds: 3, restS: 90, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 400, say: 'Hard.' }] },
    ],
  };

  it('is a workout — it is saved, and it counts as trained', async () => {
    // It logs no `SetLog` at all. The not-started guard deleted such a session as "never started",
    // and `sessionTrained` measured it against a prescription in a unit it could never reach.
    const h = harness();
    await act(async () => h.view().startCoach(INTERVALS, 'coach_0'));
    for (let i = 0; i < 4; i++) await finishStep(h);

    const history = await db.loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].sets).toHaveLength(0);
    expect(history[0].items).toHaveLength(4);
    expect(history[0].trained).toBe(true);
  });
});

describe('the two doors refuse each other', () => {
  it('a set is not endable as an item, and an item is not loggable as a set', async () => {
    const h = harness();
    await act(async () => {
      h.view().startCoach(
        {
          name: 'Two shapes',
          blocks: [
            { rounds: 1, restS: 60, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
            { rounds: 1, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 30 }] },
          ],
        },
        'coach_0',
      );
    });

    // On the plank: `completeSet` has no target to log and must not write a set of undefined reps.
    await act(async () => { await h.view().completeSet(); });
    expect(h.view().currentItem?.kind).toBe('time');

    await finishStep(h);
    expect(h.view().currentItem?.kind).toBe('reps');
    // On the bench: `completeItem` must not write a reps step as a shapeless "done".
    await act(async () => { await h.view().completeItem(); });
    expect(h.view().active).toBe(true);
    expect(h.view().currentItem?.kind).toBe('reps');
  });

  it('never records one step twice, however many times the stage asks', async () => {
    const h = harness();
    await act(async () => {
      h.view().startCoach(
        { name: 'Hold', blocks: [{ rounds: 2, restS: 30, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] }] },
        'coach_0',
      );
    });
    const v = h.view();
    await act(async () => {
      await Promise.all([v.completeItem({ seconds: 45 }), v.completeItem({ seconds: 45 })]);
    });
    // Two mouths can be open at once (a phone tap and the timer reaching zero), exactly as they can
    // on the set path — one step, one row.
    expect((await db.loadActiveSession())!.items).toHaveLength(1);

    // …and again a beat later, which is the path that actually happens: the machine sits ON the
    // completed step for the whole rest that follows it, so a late timer, a re-mounted stage or a
    // second tap arrives with the cursor unmoved and every guard except this one satisfied.
    expect(h.view().displayPhase).not.toBe('SET_PRESENTED');
    await act(async () => { await h.view().completeItem({ seconds: 45 }); });
    expect((await db.loadActiveSession())!.items).toHaveLength(1);
  });
});
