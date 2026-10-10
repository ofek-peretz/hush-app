/**
 * A PAUSED REST HOLDS ITS CLOCK — and a rest mounted mid-way draws what REMAINS (sync audit,
 * 2026-09-15).
 *
 * The store knew the truth; the phone's ring did not show it. Pausing clears the store's rest
 * anchor, that change re-ran the ring's anchor effect, and the effect read the missing end as "a
 * rest with no anchor yet" — painting `now + restSeconds`, a FULL rest, for the whole pause. The
 * wrist and the lock card never drew that number, so for as long as she stood still the phone was
 * the one surface telling a different time.
 *
 * This mounts the real stage over a hand-held session, the way `anOrdinarySetGetsNoCeremony` does,
 * and reads the ring's own props — the numbers it draws.
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { AppContext } from '@/state/stores/appStore';
import { SessionContext } from '@/state/stores/sessionStore';
import { RestRing, ToastProvider } from '@/components/ds';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { initI18n } from '@/i18n';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));
jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => true,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(1_900_000_000_000);
});
afterEach(() => jest.useRealTimers());

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const noop = () => {};
const asyncNoop = async () => {};

/** A rest ninety seconds long, `served` seconds in. */
function resting(served: number, over: Record<string, unknown> = {}) {
  const startedAt = Date.now() - served * 1000;
  return {
    active: true,
    phase: 'REST_INTER',
    displayPhase: 'REST_INTER',
    paused: false,
    currentExercise: { id: 'db_shoulder_press', name: 'Dumbbell Shoulder Press', muscle: 'Shoulders', equipment: 'dumbbell' },
    currentExerciseId: 'db_shoulder_press',
    sessionExerciseIds: ['db_shoulder_press'],
    setsSoFar: [9],
    loadsSoFar: [14],
    currentTarget: { exerciseId: 'db_shoulder_press', setIndex: 0, recommendedWeight: 14, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    nextExerciseId: 'db_shoulder_press',
    setLabel: { n: 1, m: 3 },
    emphases: [],
    reviseToday: () => 0,
    lastTime: null,
    nextSetLabel: { n: 2, m: 3 },
    globalProgress: { index: 1, total: 12 },
    exerciseProgress: { index: 1, total: 4 },
    nextExercise: null,
    nextTarget: { exerciseId: 'db_shoulder_press', setIndex: 1, recommendedWeight: 14, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    restSeconds: 90,
    restExtraSeconds: 0,
    restStartedAtMs: startedAt,
    restEndsAtMs: startedAt + 90_000,
    restFrozenRemainingS: null,
    restAlert: null,
    watchLoggedSet: null,
    startedAtMs: Date.now() - 600_000,
    toLoad: false,
    canMarkOccupied: false,
    endResult: null,
    correction: null,
    start: asyncNoop,
    loadResumable: async () => null,
    resumeSaved: async () => false,
    completeSet: async () => ({ ended: false, unlockedPortrait: false, correction: null }),
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
    ...over,
  } as unknown as React.ContextType<typeof SessionContext>;
}

const appFixture = {
  booted: true,
  profile: { id: 'p1', name: 'Erez', sex: 'male', units: 'kg', weightKg: 78, bodyMap: {}, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  model: {},
  modeState: { completedSessions: 3 },
  refreshProgram: asyncNoop,
} as unknown as React.ContextType<typeof AppContext>;

const nav = { navigate: noop, goBack: noop, push: noop, pop: noop, replace: noop, setOptions: noop, addListener: () => noop, canGoBack: () => true };

const tree = (session: React.ContextType<typeof SessionContext>) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <AppContext.Provider value={appFixture}>
      <SessionContext.Provider value={session}>
        <ToastProvider>
          {React.createElement(SessionFlow as never, { navigation: nav, route: { key: 'k', name: 'SessionFlow', params: {} } } as never)}
        </ToastProvider>
      </SessionContext.Provider>
    </AppContext.Provider>
  </SafeAreaProvider>
);

function draw(session: React.ContextType<typeof SessionContext>): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(tree(session));
  });
  mounted.push(r);
  return r;
}

const ring = (r: ReactTestRenderer) => r.root.findByType(RestRing).props as { remaining: number; total: number };

describe('the phone’s ring tells the time every other surface tells', () => {
  it('a rest mounted fifty seconds in draws forty seconds of a NINETY-second ring', () => {
    const r = draw(resting(50));
    expect(ring(r).remaining).toBe(40);
    expect(ring(r).total).toBe(90);
  });

  it('⛔ PAUSED, it holds the frozen remainder — it does not repaint a full rest', () => {
    const live = resting(50);
    const r = draw(live);
    expect(ring(r).remaining).toBe(40);
    // What the store hands over the instant the workout freezes: no anchor, no end — and the remainder.
    act(() => {
      r.update(tree({ ...live, phase: 'PAUSED', paused: true, restStartedAtMs: null, restEndsAtMs: null, restFrozenRemainingS: 40 }));
    });
    expect(ring(r).remaining).toBe(40);
    expect(ring(r).total).toBe(90);
    // Standing still for five minutes changes nothing.
    act(() => {
      jest.advanceTimersByTime(5 * 60_000);
    });
    expect(ring(r).remaining).toBe(40);
  });

  it('…and on resume it counts to the STORE’S end, the one the wrist and the lock card resume to', () => {
    const live = resting(50);
    const r = draw(live);
    act(() => {
      r.update(tree({ ...live, phase: 'PAUSED', paused: true, restStartedAtMs: null, restEndsAtMs: null, restFrozenRemainingS: 40 }));
    });
    act(() => {
      jest.advanceTimersByTime(3 * 60_000);
    });
    // Resume: the store moved the anchor forward by exactly the time stood still.
    const anchor = Date.now() - 50_000;
    act(() => {
      r.update(tree({ ...live, restStartedAtMs: anchor, restEndsAtMs: anchor + 90_000 }));
    });
    expect(ring(r).remaining).toBe(40);
    // A second at a time: the ring's tick re-arms itself on each commit, as it does on a device.
    for (let i = 0; i < 10; i++) {
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
    }
    expect(ring(r).remaining).toBe(30);
  });
});
