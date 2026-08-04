/**
 * 2.2b · "SAVE SET" SAVES THE SET (founder, build 36 — A.10).
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * "When the athlete edits and presses confirm it should CONFIRM — not send them back to the set
 * screen." The dials write the step's target live as she drags, so the button had nothing left to
 * do: it closed the editor and handed her back to press Complete Set. Two presses for one act, and
 * a button reading "Save set" that saved nothing.
 *
 * The fix routes Save through the set screen's OWN `onCompleteSet` — the same single entry point
 * the Complete Set button uses. That matters more than the press count: completion carries the one
 * light tap, the "Set logged" capture beat, the correction reveal when this set moved the next one,
 * the storage-failure notice, and the navigation to Well Done on the last set. A parallel "log it
 * here too" path would have had none of that.
 *
 * The BACK chevron still closes WITHOUT logging — the only way out that does not record.
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

// The capture beat holds the set for CONFIRM_DWELL_MS before completion runs, so the test owns the
// clock — waiting it out in real time would make this suite slow and flaky for no gain.
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

function makeSession(completeSet: () => Promise<unknown>) {
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
    currentTarget: { exerciseId: 'bb_bench_press', setIndex: 1, recommendedWeight: 36.5, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    nextExerciseId: 'bb_bench_press',
    setLabel: { n: 2, m: 4 },
    emphases: [],
    reviseToday: () => 0,
    lastTime: null,
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
    completeSet,
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

function press(r: ReactTestRenderer, label: string): void {
  const target = r.root.find(
    (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
  act(() => target.props.onPress());
}

/** The editor is open when its own title is on the glass. */
const editorIsOpen = (r: ReactTestRenderer) => textOf(r).includes(tg('workout.editTitle'));

/** Open the editor the way the athlete does — by tapping the weight. The hero's own label is
 *  "<load> <unit>" (see the Pressable in ActiveSet). */
function openEditor(r: ReactTestRenderer): void {
  press(r, '36.5 kg');
}

describe('"Save set" saves the set', () => {
  it('records the set through the same path Complete Set uses', async () => {
    const completeSet = jest.fn(async () => ({ ended: false, correction: null, unlockedPortrait: false }));
    const r = draw(makeSession(completeSet));

    openEditor(r);
    expect(editorIsOpen(r)).toBe(true);

    press(r, tg('workout.editSave'));

    // The editor closes AND the set is captured — one press, one act.
    expect(editorIsOpen(r)).toBe(false);
    // Completion runs behind the "Set logged" capture beat, so let its dwell timer through.
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(completeSet).toHaveBeenCalled();
  });

  it('the back chevron still closes WITHOUT recording', async () => {
    const completeSet = jest.fn(async () => ({ ended: false, correction: null, unlockedPortrait: false }));
    const r = draw(makeSession(completeSet));

    openEditor(r);
    press(r, tg('common.back'));

    expect(editorIsOpen(r)).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    // Leaving is not logging: nothing was recorded, and she is back on her set.
    expect(completeSet).not.toHaveBeenCalled();
  });

  it('no longer repeats the dials back as a caption under the button', () => {
    // C.7 — "36.5 kg × 8 — in your band" said what the two dials directly above already say, in
    // smaller type. A caption under a control that speaks for itself steals its job.
    const r = draw(makeSession(async () => ({ ended: false, correction: null, unlockedPortrait: false })));
    openEditor(r);
    expect(textOf(r)).not.toMatch(/in your band|×\s*8/);
  });
});
