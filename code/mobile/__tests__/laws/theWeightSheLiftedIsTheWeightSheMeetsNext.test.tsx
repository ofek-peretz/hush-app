/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEIGHT SHE LIFTED IS THE WEIGHT SHE MEETS NEXT — founder question, 2026-08-31.
 *
 *   > *"ובדקת שכל שמירת משקל זה נשאר על המשקל שנשמר מהסט הקודם?"*
 *
 * ── WHY IT IS ASKED LIVE AND NOT AS A PURE FUNCTION ─────────────────────────────────────────────
 * `carryWeightForward` is tested thoroughly on its own, and the founder's ruling behind it is
 * settled (2026-07-16): *an equipment-reality edit sticks instead of reverting to the prescription
 * each set*. What was NOT covered is the path an athlete actually walks — the real store, the real
 * plan, the cursor moving — and that path grew a new branch on 2026-08-30 when the warm-up became
 * something she presses for. A bridge carries the same `exerciseId` as the working sets it precedes,
 * and `carryWeightForward` matches on exactly that, so the question "does the weight stick" now has
 * a second half: **the bridge's weight must never stick to anything.**
 *
 * Four things, in the order she meets them:
 *   1 · an edited set carries onto the REST of that lift, and does not revert;
 *   2 · it does not leak across the crossing into the next lift, which has its own prescription;
 *   3 · ⛔ a WARM-UP bridge carries nothing — 30 kg on the ramp leaves the 60 kg working sets alone;
 *   4 · and a set logged exactly as prescribed changes nothing at all.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { db } from '@/data/local/db';
import type { PlannedSession } from '@/domain/coachPlan';

jest.mock('@/platform/coach/afterSession', () => ({
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

/** Bench at 60 for three, then a shoulder press at 22.5 — two lifts, so the crossing is real. */
const PLAN: PlannedSession = {
  name: 'Upper A',
  blocks: [
    { rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', load: 60, reps: [8, 10] }] },
    { rounds: 3, items: [{ kind: 'reps', ex: 'bb_overhead_press', load: 22.5, reps: [8, 10] }] },
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

/** Walk out of whatever rest follows, the way the countdown does at zero. */
async function throughTheRest(view: () => SessionView) {
  while (view().displayPhase !== 'SET_PRESENTED' && view().active) {
    await act(async () => view().endRest());
  }
}

beforeEach(async () => {
  await db.clearAll();
});

describe('1 · what she lifted is what the rest of the lift asks for', () => {
  it('⛔ she reaches for the 65s where 60 was written, and set 2 opens at 65', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    expect(view().currentTarget?.recommendedWeight).toBe(60);

    // The stage's wheel writes through `editCurrentSet`; Complete Set is the only thing that logs.
    await act(async () => view().editCurrentSet({ weight: 65, reps: 8 }));
    await act(async () => await view().completeSet());
    await throughTheRest(view);

    expect(view().currentTarget?.recommendedWeight).toBe(65); // …and not back to 60
    expect(view().setLabel).toEqual({ n: 2, m: 3 });
  });

  it('…and it keeps sticking — set 3 does not revert either', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => view().editCurrentSet({ weight: 65, reps: 8 }));
    await act(async () => await view().completeSet());
    await throughTheRest(view);
    await act(async () => await view().completeSet()); // set 2, taken as it now stands
    await throughTheRest(view);
    expect(view().currentTarget?.recommendedWeight).toBe(65);
  });

  it('a set logged exactly as prescribed changes nothing', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => await view().completeSet());
    await throughTheRest(view);
    expect(view().currentTarget?.recommendedWeight).toBe(60);
  });
});

describe('2 · and it does not cross into the next lift', () => {
  it('⛔ 65 kg of bench does not become 65 kg of shoulder press', async () => {
    /* The lift ahead has its own decided prescription, on its own equipment. A weight that walked
       across the crossing would be the *"a bench 60 kg must never ride onto a machine pin"* fault
       the swap path has its own guard against. */
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => view().editCurrentSet({ weight: 65, reps: 8 }));
    for (let i = 0; i < 3; i++) {
      await act(async () => await view().completeSet());
      await throughTheRest(view);
    }
    expect(view().currentExerciseId).toBe('bb_overhead_press');
    expect(view().currentTarget?.recommendedWeight).toBe(22.5);
  });
});

describe('3 · ⛔ AND A WARM-UP BRIDGE CARRIES NOTHING', () => {
  it('30 kg on the ramp leaves the 60 kg working sets exactly where they were', async () => {
    /*
     * ⛔ THIS BRANCH IS NEW SINCE 2026-08-30, when the founder made the warm-up something she
     * PRESSES for. A bridge carries the same `exerciseId` as the working sets it precedes, and
     * `carryWeightForward` matches on precisely that — so without the `current.warmup` guard in
     * `completeSet`, tapping through a half-weight bridge would rewrite her whole bench down to it.
     * The guard predates the opt-in ramp; what is new is how easy this is to reach.
     */
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    expect(view().warmupOffered).toBeGreaterThan(0); // a loaded compound at the start of the day
    await act(async () => view().addWarmup());

    expect(view().setLabel?.warmup).toBe(true);
    const bridge = view().currentTarget?.recommendedWeight;
    expect(bridge).toBeGreaterThan(0);
    expect(bridge).toBeLessThan(60);

    // Walk the whole ramp, logging each bridge exactly as offered.
    while (view().setLabel?.warmup) {
      await act(async () => await view().completeSet());
      await throughTheRest(view);
    }

    // …and the working set is untouched.
    expect(view().setLabel).toEqual({ n: 1, m: 3 });
    expect(view().currentTarget?.recommendedWeight).toBe(60);
  });

  it('…and an edit on the working set STILL carries, with the ramp behind her', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => view().addWarmup());
    while (view().setLabel?.warmup) {
      await act(async () => await view().completeSet());
      await throughTheRest(view);
    }
    await act(async () => view().editCurrentSet({ weight: 62.5, reps: 8 }));
    await act(async () => await view().completeSet());
    await throughTheRest(view);
    expect(view().currentTarget?.recommendedWeight).toBe(62.5);
  });
});
