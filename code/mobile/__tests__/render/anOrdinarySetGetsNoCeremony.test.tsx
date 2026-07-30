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
    currentTarget: { exerciseId: 'db_shoulder_press', setIndex: setN - 1, recommendedWeight: 14, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    nextExerciseId: 'db_shoulder_press',
    setLabel: { n: setN, m: setM },
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
function pressCompleteSet(r: ReactTestRenderer): void {
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

describe('an ordinary set gets no ceremony', () => {
  it('logging set 2 of 4 in the band shows no "Set recorded" beat at all', async () => {
    const r = draw(makeSession(2, 4, NO_CORRECTION));
    pressCompleteSet(r);

    // Read the stage AT the beat — the instant the leftover screen used to own it.
    const read = textOf(r);
    // The leftover beat, in all its parts.
    expect(read).not.toContain(tg('workout.recorded'));
    expect(read).not.toMatch(/SET 2 OF 4 LOGGED/i);
  });

  it('the LAST set of a lift still gets its beat — finishing a lift is a thing that happened', async () => {
    const r = draw(makeSession(4, 4, NO_CORRECTION));
    pressCompleteSet(r);
    // The beat draws it uppercased, so compare on the words rather than the casing.
    expect(textOf(r).toUpperCase()).toContain(tg('workout.loggedNextLift').toUpperCase());
  });

  it('a CORRECTION still takes the whole beat — the set moved the next load', async () => {
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
    await settle(); // the correction is only known once completeSet resolves
    // The band verdict — the screen the founder said is the one that matters.
    expect(textOf(r)).toMatch(/BAND/i);
  });

  it('a single-set lift is not treated as a finished lift', async () => {
    // `m > 1` guards this: with one prescribed set, n >= m is true on the very first log, and
    // "the lift is done" would fire for what is really an ordinary set.
    const r = draw(makeSession(1, 1, NO_CORRECTION));
    pressCompleteSet(r);
    expect(textOf(r)).not.toContain(tg('workout.recorded'));
  });
});
