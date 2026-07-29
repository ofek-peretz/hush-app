/**
 * THE PAUSE BUTTON MUST NEVER DIE (founder, build 36).
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * On the device: Pause → "something doesn't feel right" → Back landed on the LIVE set, over a
 * workout that was still frozen. And from that moment **the Pause button did nothing at all**, for
 * the rest of the session. No error, no feedback — a dead control mid-workout.
 *
 * One cause, two symptoms. The pain door closed the overlay but deliberately left the session
 * PAUSED (correct — the report happens against a frozen session). The effect that raises the
 * paused stage is edge-triggered on `session.paused`, which never changed, so it never re-raised.
 * Then `PAUSE` on an already-`PAUSED` machine returns the SAME state object (`sessionState.ts`
 * line: `if (s.phase === 'PAUSED' …) return s`), so pressing Pause changed nothing to observe and
 * the effect stayed silent — permanently.
 *
 * This drives the founder's exact sequence through the real screen. It is deliberately a
 * behavioural test, not a snapshot: what matters is that the athlete can always get back to the
 * one screen that lets her resume or end.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { AppContext } from '@/state/stores/appStore';
import { SessionContext } from '@/state/stores/sessionStore';
import { ToastProvider } from '@/components/ds';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { initI18n, tg } from '@/i18n';

/**
 * The only thing SessionFlow wants from the navigator is `useFocusEffect`, via
 * `useFocusedStatusBar` — it drives the status-bar tint on focus and nothing else. Standing up a
 * whole NavigationContainer to satisfy one status-bar call would put the navigator between this
 * test and the behaviour it is about. The screen itself, the stage and every control are real.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => {},
}));

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

/**
 * A live session whose `paused` follows a real machine, so `pause()` on an already-paused session
 * is the no-op the real reducer performs — which is the whole point of the bug.
 */
function makeSession(paused: boolean, onPause: () => void) {
  return {
    active: true,
    phase: paused ? 'PAUSED' : 'SET_PRESENTED',
    displayPhase: 'SET_PRESENTED',
    paused,
    currentExercise: { id: 'bb_bench_press', name: 'Bench Press', muscle: 'Chest', equipment: 'barbell' },
    currentExerciseId: 'bb_bench_press',
    sessionExerciseIds: ['bb_bench_press'],
    currentTarget: { exerciseId: 'bb_bench_press', setIndex: 1, recommendedWeight: 34, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    nextExerciseId: 'bb_bench_press',
    setLabel: { n: 2, m: 4 },
    globalProgress: { index: 1, total: 24 },
    exerciseProgress: { index: 0, total: 6 },
    nextExercise: null,
    nextTarget: null,
    nextSetLabel: { n: 3, m: 4 },
    restSeconds: 147,
    restExtraSeconds: 0,
    watchLoggedSet: null,
    startedAtMs: Date.now() - 60_000,
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
    // The REAL reducer's behaviour: PAUSE on a PAUSED machine is a no-op.
    pause: onPause,
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

const nav = {
  navigate: jest.fn(),
  goBack: noop,
  push: noop,
  pop: noop,
  replace: noop,
  setOptions: noop,
  addListener: () => noop,
  canGoBack: () => true,
};

function draw(session: React.ContextType<typeof SessionContext>): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AppContext.Provider value={appFixture}>
          <SessionContext.Provider value={session}>
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

/** Every string the athlete can read right now. */
function textOf(r: ReactTestRenderer): string {
  return r.root
    .findAllByType(Text)
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
    })
    .join('\n');
}

/** Is the paused stage — the only screen that offers Resume — on the glass? */
const stageIsUp = (r: ReactTestRenderer) => textOf(r).includes(tg('pauseSheet.resume'));

function press(r: ReactTestRenderer, label: string): void {
  const target = r.root.find(
    (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
  act(() => target.props.onPress());
}

describe('the paused stage survives the pain door', () => {
  beforeEach(() => nav.navigate.mockClear());

  it('opening the pain report leaves the stage up, so Back reveals what she left', () => {
    const r = draw(makeSession(true, noop));
    expect(stageIsUp(r)).toBe(true);

    press(r, tg('pain.affordance'));

    // The report was opened…
    expect(nav.navigate).toHaveBeenCalledWith('PainWhere', expect.anything());
    // …and the frozen session's own screen is still underneath it. PainWhere is PUSHED over this
    // screen, so an athlete pressing Back must land here — not on a live set over a frozen workout.
    expect(stageIsUp(r)).toBe(true);
  });

  it('Pause revives the stage even when the machine is already paused', () => {
    // The exact dead-end from the device: the session is frozen but the stage is not showing.
    // `pause()` is the real reducer's no-op — it changes nothing for an effect to observe — so the
    // press itself has to put the stage back, or the button is dead for the rest of the workout.
    const pause = jest.fn();
    const r = draw(makeSession(true, pause));

    press(r, tg('pain.affordance')); // whatever closed the stage
    press(r, tg('workout.pauseAction'));

    expect(pause).toHaveBeenCalled();
    expect(stageIsUp(r)).toBe(true);
  });
});
