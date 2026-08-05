/**
 * THE STAGE BAR'S CENTRE IS ACTUALLY CENTRED (founder, build 36 — A.6).
 *
 * *"The clock and LIFT n/m are not centred."*
 *
 * `stageBar` lays out `space-between` over three children, which centres the middle one only when
 * the outer two are the same width — and they are not. The left holds ONE disc (pause, 38 px); the
 * right holds up to TWO (swap + form, 38 + 8 + 38 = 84 px). Measured in the browser on the first
 * set of a lift, where the swap is offered: **the centre group sat 23 px left of the axis.** On set
 * 2 the swap is gone, the sides match, and it self-corrects to 0 — which is why it read as
 * "sometimes off" rather than as a bug, and why no fixture had ever shown it (gallery 2.2 sits on
 * set 2; 2.2e was added for exactly this state).
 *
 * The assertion is STRUCTURAL: react-test-renderer has no layout engine, so the honest thing to
 * check is that both sides declare the same flex — which is what makes the centring hold for one
 * disc, two, or none.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet, View } from 'react-native';
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

/** `setN` decides whether the swap is offered, and therefore whether the sides are uneven. */
function makeSession(setN: number) {
  return {
    active: true,
    phase: 'SET_PRESENTED',
    displayPhase: 'SET_PRESENTED',
    paused: false,
    currentExercise: { id: 'bb_bench_press', name: 'Bench Press', muscle: 'Chest', equipment: 'barbell' },
    currentExerciseId: 'bb_bench_press',
    sessionExerciseIds: ['bb_bench_press'],
    /* ⚠️ Two sets already logged, so the set row draws filled slots — an absent array
       would make every fixture on the stage look like set 1 of a lift never done. */
    setsSoFar: [9, 8],
    loadsSoFar: [34, 34],
    currentTarget: { exerciseId: 'bb_bench_press', setIndex: setN - 1, recommendedWeight: 34, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    nextExerciseId: 'bb_bench_press',
    setLabel: { n: setN, m: 4 },
    emphases: [],
    reviseToday: () => 0,
    lastTime: null,
    nextSetLabel: { n: setN + 1, m: 4 },
    globalProgress: { index: setN, total: 24 },
    exerciseProgress: { index: 0, total: 6 },
    nextExercise: null,
    nextTarget: null,
    restSeconds: 90,
    restExtraSeconds: 0,
    watchLoggedSet: null,
    startedAtMs: Date.now() - 100_000,
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
}

const appFixture = {
  booted: true,
  profile: { id: 'p1', name: 'Erez', sex: 'male', units: 'kg', weightKg: 78, bodyMap: {}, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  model: {},
  modeState: { completedSessions: 0 },
  refreshProgram: asyncNoop,
} as unknown as React.ContextType<typeof AppContext>;

const nav = { navigate: noop, goBack: noop, push: noop, pop: noop, replace: noop, setOptions: noop, addListener: () => noop, canGoBack: () => true };

function draw(setN: number): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AppContext.Provider value={appFixture}>
          <SessionContext.Provider value={makeSession(setN)}>
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

const flat = (s: unknown) => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;

/**
 * The bar's two side groups. Found by their own shape rather than by walking up from a disc —
 * `StageDisc` is a composite, so the tree has an extra level and the walk is fragile.
 */
function sideGroups(r: ReactTestRenderer) {
  return r.root.findAll((n) => {
    if (n.type !== View) return false;
    const st = flat(n.props.style);
    return st.flexDirection === 'row' && st.gap === 8 && 'flex' in st;
  });
}

describe('the stage bar centres its middle group', () => {
  it('⛔ carries the swap disc again — offered on set 1, absent on set 2', () => {
    /*
     * ⛔ THIS TEST USED TO ASSERT THE OPPOSITE: a swap disc present on set 1 and absent on set 2,
     * which was the state that made the bar's centring intermittent (the sides carried different
     * numbers of discs).
     *
     * FOUNDER, 2026-08-02: *"add an AI window and remove SWAP."* It was removed, and folded into
     * the coach window as a chip.
     *
     * ⛔ FOUNDER, 2026-08-03, after the device: *"in the workout, bring back the SWAP."* A swap is
     * the commonest thing she does at the rack, and two taps and a sheet made the fastest action in
     * the product slower than it was. The chip STAYS — the window must still answer "swap this" in
     * words — but the one-tap door is a control again.
     *
     * So this file is back to watching the state that made the bar's centring intermittent: the end
     * side carries two discs on set 1 and one on set 2.
     */
    expect(
      draw(1).root.findAll((n) => n.props.accessibilityLabel === tg('workout.swapAction')).length,
    ).toBeGreaterThan(0);
    expect(
      draw(2).root.findAll((n) => n.props.accessibilityLabel === tg('workout.swapAction')).length,
    ).toBe(0);
  });

  it('opens the coach from the bar, on every set', () => {
    // What replaced it, and unlike the swap it does NOT come and go — what she can ask does not
    // depend on which set she is on.
    for (const setN of [1, 2]) {
      expect(
        draw(setN).root.findAll((n) => n.props.accessibilityLabel === tg('sessionCoach.open')).length,
      ).toBeGreaterThan(0);
    }
  });

  it('gives both side groups the same flex, so the centre holds whatever they carry', () => {
    for (const setN of [1, 2]) {
      const sides = sideGroups(draw(setN));
      // Both sides must declare a flex, and it must be the SAME on each — that equality is the
      // whole fix. A side sized only by its contents is what put the clock 23 px off centre.
      expect({ setN, sides: sides.length }).toEqual({ setN, sides: 2 });
      const flexes = sides.map((v) => flat(v.props.style).flex);
      expect({ setN, distinctFlexValues: new Set(flexes).size }).toEqual({ setN, distinctFlexValues: 1 });
      expect(flexes[0]).toBe(1);
    }
  });
});
