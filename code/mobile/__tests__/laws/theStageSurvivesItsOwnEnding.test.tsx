/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE STAGE SURVIVES ITS OWN ENDING — founder bug, 2026-08-31.
 *
 *   > *"יש גם באג נוסף שבעת יציאה ממסך האימון בתחילת האימון או בזמן שקרוב אליו האפליקציה קורסת."*
 *
 * ── WHAT IT WAS, AND WHY IT ONLY EVER HAPPENED AT THE START ─────────────────────────────────────
 *
 * Leaving a workout before anything has been logged takes the NOT-STARTED branch of `finalize` —
 * *"the athlete entered the workout and left without completing a single step"* — and that branch
 * ends the session on the spot:
 *
 *     dispatch({ type: 'END' })    →  { plan: [], session: null, machine: initialSessionMachine() }
 *     setEndResult(notStarted)     →  the screen's effect navigates to Well Done
 *
 * Both are state updates in one batch, so React RENDERS BEFORE THE EFFECT RUNS. For that one frame
 * `SessionFlow` is standing on an empty plan — and `initialSessionMachine` opens on
 * `SET_PRESENTED`, so the screen draws `ActiveSet`, whose first line is:
 *
 *     const isBodyweight = target.recommendedWeight == null;   // target === null
 *
 * A read of `recommendedWeight` on null, one frame before the navigation that would have saved it.
 * **Later in the session it cannot happen**, because a workout with logged work takes the other
 * branch and reaches Well Done through `SESSION_SAVED` — which is exactly the shape of the
 * founder's report: at the beginning, or close to it.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────────────────────
 * A screen must not draw a set that does not exist. The guard is at the TOP of the stage rather
 * than inside `ActiveSet`, because `Rest` and `ItemStage` stand on the same cursor and would fail
 * the same way the moment one of them is reached in that frame.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { db } from '@/data/local/db';
import { initI18n } from '@/i18n';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { ToastProvider } from '@/components/ds';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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

const PLAN: PlannedSession = {
  name: 'Upper A',
  blocks: [
    { rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', load: 60, reps: [8, 10] }] },
    { rounds: 3, items: [{ kind: 'reps', ex: 'lat_pulldown', load: 45, reps: [8, 10] }] },
  ],
};

/** The screen, mounted for real, with a handle on the store beside it. */
function mountStage() {
  let view: SessionView | null = null;
  function Probe() {
    view = useSession();
    return null;
  }
  /* The screen must run inside a real NavigationContainer — it takes `useFocusEffect`, which reads
     navigation from context and throws without one. `replace` is spied on the live navigator so the
     assertion is about what the SCREEN asked for, not about a hand-written stub. */
  const replace = jest.fn();
  const Stack = createNativeStackNavigator();
  function Stage(props) {
    replace.mockImplementation(() => {});
    return <SessionFlow {...props} navigation={{ ...props.navigation, replace }} />;
  }
  let tree;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        <AppContext.Provider value={appFixture}>
          <SessionProvider>
            <ToastProvider>
              <Probe />
              <NavigationContainer>
                <Stack.Navigator screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="Session" component={Stage} />
                </Stack.Navigator>
              </NavigationContainer>
            </ToastProvider>
          </SessionProvider>
        </AppContext.Provider>
      </SafeAreaProvider>,
    );
  });
  return { tree, nav: { replace }, view: () => view };
}

beforeAll(async () => {
  await initI18n();
});
beforeEach(async () => {
  await db.clearAll();
});

describe('leaving a workout at its very beginning', () => {
  it('⛔ THE FOUNDER’S CRASH — ending before a single set is logged must not take the app down', async () => {
    const h = mountStage();
    await act(async () => {
      await h.view().startCoach(PLAN, 'coach_0');
    });
    expect(h.view().active).toBe(true);
    expect(h.view().currentTarget).not.toBeNull();

    /*
     * The not-started exit. This is the founder's gesture: open the workout, change your mind,
     * leave. `finishEarly` reaches `finalize`, which finds no logged work, dispatches END and sets
     * `endResult` in the same batch — so the stage re-renders on an EMPTY plan before the effect
     * that navigates has had a chance to run.
     */
    await act(async () => {
      await h.view().finishEarly();
    });

    // It survived the frame…
    expect(h.view().active).toBe(false);
    expect(h.view().currentTarget).toBeNull();
    // …and it drew nothing rather than a set that does not exist.
    // …and it asked to go to Well Done, told plainly that this was never a workout.
    expect(h.nav.replace).toHaveBeenCalledWith('WellDone', expect.objectContaining({ notStarted: true }));
  });

  it('a session with work in it still ends through the ordinary door', async () => {
    const h = mountStage();
    await act(async () => {
      await h.view().startCoach(PLAN, 'coach_0');
    });
    await act(async () => {
      await h.view().completeSet();
    });
    await act(async () => {
      await h.view().finishEarly();
    });
    expect(h.nav.replace).toHaveBeenCalledWith('WellDone', expect.objectContaining({ notStarted: undefined }));
  });
});
