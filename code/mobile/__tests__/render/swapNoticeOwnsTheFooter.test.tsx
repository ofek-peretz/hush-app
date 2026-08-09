/**
 * A NOTICE OWNS THE FOOTER — ON THE REST SCREEN TOO (founder, build 36 — C.12).
 *
 * He photographed the transition rest with the swap confirmation sitting ON the controls:
 * "✓ Swapped to Dumbbell Shoulder Press | +15 sec | Another option | Undo" — the toast's own
 * actions interleaved with the screen's, which is unusable as well as ugly.
 *
 * The law it breaks was ratified on 2026-07-13 and is written into this screen: *"when the
 * swapped-to badge appears it should cover the WHOLE start-of-exercise part"*. For the seconds a
 * notice is up it IS the footer — the buttons stand down, invisible and untouchable, still holding
 * their space so nothing jumps.
 *
 * `ActiveSet` obeyed it. This drives the REST screen, which is where the swap the founder used
 * actually lives (`onSwap` there is `startQuickSwap('next')`), and holds it to the same rule.
 */
// @ts-nocheck

// 

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, View, StyleSheet } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { AppContext } from '@/state/stores/appStore';
import { SessionContext } from '@/state/stores/sessionStore';
import { ToastProvider } from '@/components/ds';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { initI18n, tg } from '@/i18n';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const noop = () => {};
const asyncNoop = async () => {};

/** A TRANSITION rest — the beat the founder was on: one lift finished, the next one up. */
const restSession = {
  active: true,
  phase: 'REST_TRANSITION',
  displayPhase: 'REST_TRANSITION',
  paused: false,
  currentExercise: { id: 'bb_bench_press', name: 'Bench Press', muscle: 'Chest', equipment: 'barbell' },
  currentExerciseId: 'bb_bench_press',
  sessionExerciseIds: ['bb_bench_press', 'db_shoulder_press'],
  /* ⚠️ Two sets already logged, so the set row draws filled slots — an absent array
     would make every fixture on the stage look like set 1 of a lift never done. */
  setsSoFar: [9, 8],
    loadsSoFar: [34, 34],
  currentTarget: { exerciseId: 'bb_bench_press', setIndex: 3, recommendedWeight: 34, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
  nextExerciseId: 'db_shoulder_press',
  nextExercise: { id: 'db_shoulder_press', name: 'Dumbbell Shoulder Press', muscle: 'Shoulders', equipment: 'dumbbell' },
  nextTarget: { exerciseId: 'db_shoulder_press', setIndex: 0, recommendedWeight: 14, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
  setLabel: { n: 4, m: 4 },
  emphases: [],
  reviseToday: () => 0,
  lastTime: null,
  nextSetLabel: { n: 1, m: 3 },
  globalProgress: { index: 4, total: 24 },
  exerciseProgress: { index: 0, total: 6 },
  restSeconds: 95,
  restExtraSeconds: 0,
  watchLoggedSet: null,
  startedAtMs: Date.now() - 200_000,
  toLoad: false,
  canMarkOccupied: false,
  endResult: null,
  correction: null,
  start: asyncNoop,
  loadResumable: async () => null,
  resumeSaved: async () => false,
  completeSet: asyncNoop,
  editCurrentSet: noop,
  endRest: noop,
  extendRest: noop,
  pause: noop,
  resume: noop,
  finishEarly: asyncNoop,
  swapNextExercise: noop,
  swapCurrentExercise: noop,
  markEquipmentOccupied: noop,
  publishWatchLobby: noop,
  setWatchHomeActions: noop,
  clearEndResult: noop,
  clearCorrection: noop,
} as unknown as React.ContextType<typeof SessionContext>;

const appFixture = {
  booted: true,
  profile: { id: 'p1', name: 'Erez', sex: 'male', units: 'kg', weightKg: 78, bodyMap: {}, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  model: { replaceBlock: asyncNoop },
  modeState: { completedSessions: 0 },
  refreshProgram: asyncNoop,
} as unknown as React.ContextType<typeof AppContext>;

const nav = { navigate: noop, goBack: noop, push: noop, pop: noop, replace: noop, setOptions: noop, addListener: () => noop, canGoBack: () => true };

function draw(): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AppContext.Provider value={appFixture}>
          <SessionContext.Provider value={restSession}>
            <ToastProvider>
              {React.createElement(SessionFlow as never, { navigation: nav, route: { key: 'k', name: 'SessionFlow', params: {} } } as never)}
            </ToastProvider>
          </SessionContext.Provider>
        </AppContext.Provider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}

function press(r: ReactTestRenderer, label: string): void {
  const target = r.root.find(
    (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
  act(() => target.props.onPress());
}

const has = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').length > 0;

/** The footer that holds "Start …" and "+15 sec", found by the control inside it. */
function footerOf(r: ReactTestRenderer) {
  const plus = r.root.find(
    (n) => n.props.accessibilityLabel === tg('workout.addSeconds') && typeof n.props.onPress === 'function',
  );
  // Walk up to the View that declares the stood-down state.
  let node = plus.parent;
  while (node && !(StyleSheet.flatten(node.props?.style) as { paddingBottom?: number })?.paddingBottom) {
    node = node.parent;
  }
  return node;
}

describe('the swap notice owns the rest screen’s footer', () => {
  it('the +15 sec control is reachable before a swap', () => {
    const r = draw();
    expect(has(r, tg('workout.addSeconds'))).toBe(true);
  });

  it('and stands down the moment the swap confirmation appears', async () => {
    const r = draw();

    // The swap the founder used: the rest screen's own Swap, which targets the NEXT lift.
    press(r, tg('workout.swapAction'));
    await act(async () => {
      await Promise.resolve();
    });

    const footer = footerOf(r);
    expect(footer).toBeTruthy();
    // Untouchable — the toast's actions are the only ones on the glass.
    expect(footer!.props.pointerEvents).toBe('none');
    // …and out of VoiceOver's reach too, or the screen reads as two competing action sets.
    expect(footer!.props.accessibilityElementsHidden).toBe(true);
    // Invisible, but still holding its space so nothing jumps.
    const st = StyleSheet.flatten(footer!.props.style) as { opacity?: number };
    expect(st.opacity).toBe(0);
  });

  it('AND STAYS DOWN on a SECOND swap — the case that actually shipped broken', async () => {
    /*
     * The first notice always worked; this is the one the founder photographed.
     *
     * The route matters. Going through the toast's own "Another option" is SAFE — that handler
     * calls `dismiss()` before it re-notifies, so the order is false-then-true and true wins. The
     * broken route is the screen's own Swap button, which lives in the up-next card and is
     * therefore NOT part of the footer that stood down: it stays reachable while the toast is up.
     * Tapping it re-enters `notify` with the old toast still live, so `setNotice(true)` is queued
     * and then `toast.show` synchronously fires the OLD notice's `setNotice(false)` — and false
     * wins. Tap Swap, dislike the result, tap Swap again: the footer comes back under a live toast.
     */
    const r = draw();

    press(r, tg('workout.swapAction'));
    await act(async () => {
      await Promise.resolve();
    });

    // Not the toast's action — the screen's own Swap, still reachable behind the notice.
    press(r, tg('workout.swapAction'));
    await act(async () => {
      await Promise.resolve();
    });

    const footer = footerOf(r);
    expect(footer).toBeTruthy();
    expect(footer!.props.pointerEvents).toBe('none');
    expect(footer!.props.accessibilityElementsHidden).toBe(true);
    expect((StyleSheet.flatten(footer!.props.style) as { opacity?: number }).opacity).toBe(0);
  });
});
