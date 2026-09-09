/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * NO SET IS WRITTEN BY TIME.
 *
 * ⛔ FOUNDER, 2026-09-09, after a workout on build 71: *"הסט האוטומטי עדיין קיים אפילו שאמרתי לך
 * לבטל אותו לגמרי."* The store-level proof: the real `SessionProvider`, a coach plan, and the wall
 * clock driven by hand through the one door the pocket uses — the app coming back to the
 * foreground. A set on stage is hers however long it stands; the app ASKS (the pocket's note, the
 * stage's line) and writes nothing. What time still does: a rest SHE started ends on the wall
 * clock and presents the next set at its own instant, so a pocketed phone is never behind.
 *
 * This replaces `theSessionRunsItself` (2026-09-07 → 09), which pinned the opposite.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
//
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { db } from '@/data/local/db';
import { nudgeAfterS } from '@/domain/setDwell';
import type { PlannedSession } from '@/domain/coachPlan';

jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => true,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/setNudge', () => ({
  setNudge: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/coach/afterSession', () => ({
  askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })),
}));

const BENCH = 'bb_bench_press';
const PRESS = 'bb_overhead_press';
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
    { rounds: 2, items: [{ kind: 'reps', ex: PRESS, load: 22.5, reps: [8, 10] }] },
  ],
};

/** The wall clock, in our hands. */
let now = 1_800_000_000_000;
const clock = jest.spyOn(Date, 'now');
/** The app's foreground listener — the pocket's one door into the clock. */
let wake: ((s: string) => void) | null = null;

const { setNudge: nudge } = jest.requireMock('@/platform/setNudge') as { setNudge: { arm: jest.Mock; disarm: jest.Mock } };
const { restHaptics: alerts } = jest.requireMock('@/platform/restHaptics') as { restHaptics: { arm: jest.Mock; disarm: jest.Mock } };

beforeEach(async () => {
  await db.clearAll();
  now = 1_800_000_000_000;
  clock.mockImplementation(() => now);
  wake = null;
  nudge.arm.mockClear();
  nudge.disarm.mockClear();
  alerts.arm.mockClear();
  alerts.disarm.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type: string, cb: (s: string) => void) => {
    wake = cb;
    return { remove() {} } as never;
  });
});
afterAll(() => clock.mockRestore());

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

/** Move the wall clock and let the app notice, the way a phone coming out of a pocket does. */
async function later(ms: number) {
  now += ms;
  await act(async () => {
    wake?.('active');
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** The instant the app ASKS about the set on stage — `domain/setDwell`, the prescription's own number. */
const askMs = (view: () => SessionView) => {
  const step = view().livePlan[view().globalProgress!.index] as never as { exerciseId: string; target?: { repBandLo?: number; recommendedReps: number } };
  return nudgeAfterS(step.exerciseId, step.target?.repBandLo ?? step.target?.recommendedReps ?? 8) * 1000;
};

describe('⛔ no set is written by time', () => {
  it('a set whose expected duration ran out — and an hour, and a day — is still on stage, unwritten', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    expect(view().displayPhase).toBe('SET_PRESENTED');
    const ask = askMs(view);
    await later(ask + 30_000);
    expect(view().loggedSets).toHaveLength(0);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    await later(60 * 60 * 1000);
    await later(24 * 60 * 60 * 1000);
    expect(view().loggedSets).toHaveLength(0);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(view().setLabel).toEqual({ n: 1, m: 3 });
    expect(view().active).toBe(true);
  });

  it('the pocket ASKS about every set — the OS note is armed at the set\'s ask instant, and no rest-over alert is armed from a set', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    const step = view().livePlan[0] as never as { exerciseId: string; target?: { repBandLo?: number; recommendedReps: number } };
    expect(nudge.arm).toHaveBeenCalledWith(nudgeAfterS(step.exerciseId, step.target?.repBandLo ?? 8));
    expect(alerts.arm).not.toHaveBeenCalled(); // a set has no presumed rest to announce — there is no presumption
    expect(alerts.disarm).toHaveBeenCalled(); // and none left over from the rest before it
    // Her tap spends the ask.
    nudge.disarm.mockClear();
    await act(async () => await view().completeSet());
    expect(nudge.disarm).toHaveBeenCalled();
    // The next set, presented on her word, is asked about in its turn.
    nudge.arm.mockClear();
    await later(view().restSeconds * 1000 + 1_000);
    expect(view().setLabel).toEqual({ n: 2, m: 3 });
    expect(nudge.arm).toHaveBeenCalled();
  });

  it('her tap writes the set at HER instant; the rest she started ends on the wall clock and presents the next set at ITS instant', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await later(40_000);
    await act(async () => await view().completeSet());
    const row = view().loggedSets[0];
    expect(row.presumed).toBeUndefined();
    expect(row.actualReps).toBe(8);
    expect(Date.parse(row.persistedAt)).toBe(now);
    expect(view().displayPhase).toBe('REST_INTER');
    const rest = view().restSeconds;
    // The phone sleeps through the rest and twenty minutes more; one look presents set 2 — from the rest's end.
    await later(rest * 1000 + 20 * 60 * 1000);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(view().setLabel).toEqual({ n: 2, m: 3 });
    expect(view().loggedSets).toHaveLength(1); // set 2 was NOT written by the twenty minutes
    // Her rest was hers: banked for the set that follows, at its prescribed length.
    await act(async () => await view().completeSet());
    expect(view().loggedSets[1].restBeforeS).toBe(rest);
  });

  it('⛔ the last set of the session is hers to finish — three hours later nothing is saved', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    for (let i = 0; i < 4; i++) {
      await act(async () => await view().completeSet());
      await later(view().restSeconds * 1000 + 1_000);
    }
    expect(view().livePlan[view().globalProgress!.index].lastSetOfSession).toBe(true);
    expect(view().currentExerciseId).toBe(PRESS);
    await later(3 * 60 * 60 * 1000);
    expect(view().active).toBe(true);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(view().loggedSets).toHaveLength(4);
    expect(await db.loadHistory()).toHaveLength(0);
    // …and when SHE finishes it, it is saved under her word, with every set hers.
    await act(async () => await view().completeSet());
    const [saved] = await db.loadHistory();
    expect(saved.finishedByAthlete).toBe(true);
    expect(saved.sets).toHaveLength(5);
    expect(saved.sets.every((s) => s.presumed === undefined)).toBe(true);
  });

  it('a second tap during her own rest is refused, quietly — the set is written once', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => await view().completeSet());
    expect(view().displayPhase).toBe('REST_INTER');
    await act(async () => await view().completeSet());
    expect(view().loggedSets).toHaveLength(1);
    expect(view().displayPhase).toBe('REST_INTER');
  });

  it('a paused workout is frozen — nothing moves however long it waits', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => await view().completeSet());
    await act(async () => view().pause());
    await later(60 * 60 * 1000);
    expect(view().loggedSets).toHaveLength(1);
    expect(view().paused).toBe(true);
    await act(async () => view().resume());
    expect(view().displayPhase).toBe('REST_INTER'); // the rest she paused, not the set after it
  });
});
