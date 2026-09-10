/**
 * AN ORDINARY SET GETS NO CEREMONY (founder, build 36 — C.13).
 *
 * The capture beat held the stage after every logged set to say "✓ SET 2 OF 4 LOGGED / 14 kg × 8 /
 * Set recorded." — a leftover from the previous app. It restated the set she had just performed and
 * then handed over to rest, which is where she was going anyway. *"Just remove this screen, because
 * the one that comes after it is the one that matters — whether she landed inside or outside her
 * band."*
 *
 * NOBODY COULD SEE IT. The gallery's 2.3 mounts `Logged` **with a correction** — the correction
 * form. The plain form had no entry at all, which is exactly why it survived a whole rebuild
 * unnoticed. Same blind spot as the decimal load in C.9, and the same fix: it is drivable now.
 *
 * The beat keeps the two things it earns:
 *   · a CORRECTION — the set moved the next load
 *   · the LAST SET of a lift — finishing a lift is a thing that happened
 */
// @ts-nocheck

// 

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
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
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const noop = () => {};
const asyncNoop = async () => {};

type Result = { ended: boolean; unlockedPortrait: boolean; correction: unknown };

/** A live set. `setN`/`setM` place it inside its lift; `result` is what the engine hands back. */
function makeSession(setN: number, setM: number, result: Result) {
  return {
    active: true,
    phase: 'SET_PRESENTED',
    displayPhase: 'SET_PRESENTED',
    paused: false,
    currentExercise: { id: 'db_shoulder_press', name: 'Dumbbell Shoulder Press', muscle: 'Shoulders', equipment: 'dumbbell' },
    currentExerciseId: 'db_shoulder_press',
    sessionExerciseIds: ['db_shoulder_press'],
    /* ⚠️ Two sets already logged, so the set row draws filled slots — an absent array
       would make every fixture on the stage look like set 1 of a lift never done. */
    setsSoFar: [9, 8],
    loadsSoFar: [34, 34],
    currentTarget: { exerciseId: 'db_shoulder_press', setIndex: setN - 1, recommendedWeight: 14, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    nextExerciseId: 'db_shoulder_press',
    setLabel: { n: setN, m: setM },
    emphases: [],
    reviseToday: () => 0,
    lastTime: null,
    nextSetLabel: { n: setN + 1, m: setM },
    globalProgress: { index: setN, total: 24 },
    exerciseProgress: { index: 1, total: 6 },
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
    completeSet: async () => result,
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

function textOf(r: ReactTestRenderer): string {
  return r.root
    .findAllByType(Text)
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
    })
    .join('\n');
}

/**
 * Press Complete set and stop AT THE BEAT — before any dwell elapses.
 *
 * This is the only honest moment to look. The effect clears `confirm` as soon as completion
 * resolves ("the stage must return to the athlete, saved or not"), so an assertion taken after the
 * timers have run sees no beat whether one was drawn or not — the leftover screen would simply have
 * flashed past. Asserting here is what makes the test able to fail.
 */

/**
 * ⛔ A SET CANNOT BE LOGGED WITHOUT A REP COUNT ANY MORE (founder, 2026-08-31: *"ובחזרות להשאיר
 * ריק"*). The count starts empty on every set, and pressing the act with it empty opens the field
 * rather than writing a number nobody said. So a test that logs a set has to do what an athlete
 * does: say how many reps, then finish. That extra step IS the feature.
 */
function enterReps(r: ReactTestRenderer, n: string): void {
  const cell = r.root.find(
    (x) =>
      x.props?.accessibilityRole === 'button' &&
      String(x.props?.accessibilityLabel ?? '').startsWith(tg('workout.repsUnit')) &&
      typeof x.props?.onPress === 'function',
  );
  act(() => cell.props.onPress());
  for (const d of n.split('')) {
    const key = r.root.find(
      (x) => x.props?.accessibilityRole === 'button' && x.props?.accessibilityLabel === d && typeof x.props?.onPress === 'function',
    );
    act(() => key.props.onPress());
  }
}

function pressCompleteSet(r: ReactTestRenderer): void {
  enterReps(r, '8');
  const btn = r.root.find(
    (n) => n.props.accessibilityLabel === tg('workout.completeSet') && typeof n.props.onPress === 'function',
  );
  act(() => btn.props.onPress());
}

/** …and then let the beat finish, for the cases that need what completion hands back. */
async function settle(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();
  });
}

const NO_CORRECTION: Result = { ended: false, unlockedPortrait: false, correction: null };

describe('an ordinary set gets the capture — and only the capture', () => {
  /* 2026-08-26: the founder's logger ruling. Every working set now gets ONE beat — the set she
     wrote, at stage size — and nothing else: no band verdict, no correction reveal, no promise
     about the next set. The old leftover "Set recorded" readback stays dead. */
  it('logging set 2 of 4 shows the capture — and none of the dead ceremonies', async () => {
    const r = draw(makeSession(2, 4, NO_CORRECTION));
    pressCompleteSet(r);

    const read = textOf(r);
    expect(read.toUpperCase()).toContain(tg('workout.setCaptured', { n: 2 }).toUpperCase());
    expect(read).not.toContain(tg('workout.recorded'));
    expect(read).not.toMatch(/SET 2 OF 4 LOGGED/i);
    expect(read).not.toMatch(/landed|band|holds for/i);
  });

  it('⚠️ the LAST set of a lift is a beat, and it ASKS NOTHING', async () => {
    /*
     * ⛔ REVERSED BY THE FOUNDER, 2026-08-02, on build 39:
     *
     *   > *"Take it off completely. The AI should give the athlete instructions according to their
     *   > goal. And what about someone who just trains for fun? We already had this conversation
     *   > and you left this screen in."*
     *
     * This used to assert the opposite — that the beat closing a lift asks "how did that go?" with
     * three answers. It held the stage for six seconds mid-workout and, because it HOLDS rather
     * than ends, it read as a finish screen that then put her back on the set.
     *
     * What survives is the half that was never a question: every pip filled, the lift is spent.
     */
    const r = draw(makeSession(4, 4, NO_CORRECTION));
    pressCompleteSet(r);
    const read = textOf(r).toUpperCase();
    for (const key of ['workout.effortAsk', 'workout.effortHadMore', 'workout.effortAboutRight', 'workout.effortNothingLeft']) {
      expect({ key, shown: read.includes(tg(key).toUpperCase()) }).toEqual({ key, shown: false });
    }
  });

  it('⛔ even a result CLAIMING a correction cannot resurrect the reveal — the beat stays the capture', async () => {
    /* The store returns correction: null forever (the 2026-08-26 ruling), but the stage must not
       depend on the store's good manners: hand it a poisoned result and the reveal stays dead. */
    const correction = {
      exerciseId: 'db_shoulder_press',
      direction: 'up',
      from: 14,
      to: 16,
      reps: 12,
      band: [8, 10],
    };
    const r = draw(makeSession(2, 4, { ended: false, unlockedPortrait: false, correction }));
    pressCompleteSet(r);
    await settle();
    expect(textOf(r)).not.toMatch(/BAND/i);
    expect(textOf(r).toUpperCase()).toContain(tg('workout.setCaptured', { n: 2 }).toUpperCase());
  });

  it('a single-set lift is not treated as a finished lift', async () => {
    // `m > 1` guards this: with one prescribed set, n >= m is true on the very first log, and
    // "the lift is done" would fire for what is really an ordinary set.
    const r = draw(makeSession(1, 1, NO_CORRECTION));
    pressCompleteSet(r);
    expect(textOf(r)).not.toContain(tg('workout.recorded'));
  });
});
