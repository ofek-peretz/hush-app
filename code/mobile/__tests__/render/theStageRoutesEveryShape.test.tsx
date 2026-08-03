/**
 * ════ THE WORKOUT SCREEN BRANCHES — AND THAT WAS THE MISSING LINE ════
 *
 * `theStageRunsEveryShape` mounts `TimeStage`, `DistanceStage` and `OpenStage` directly and proves
 * each one works. Every one of those tests passed for a whole build while the three screens were
 * UNREACHABLE: `SessionFlow` rendered `ActiveSet` for every step of every session, so a plank
 * arrived at the set stage — a set with no weight and no rep band — in the middle of a workout. The
 * only importer of `ItemStage` in the entire app was the gallery.
 *
 * A test that mounts the destination cannot see a missing road. This one goes through the screen.
 *
 * (`everyShapeTheCoachWritesIsRunAndRecorded` is the other half: it drives the real store and
 * asserts the record. This half asserts what the athlete is looking at.)
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
import type { PlannedItem } from '@/domain/coachPlan';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeAll(async () => { await initI18n(); });
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { while (mounted.length) mounted.pop()!.unmount(); }); });

const noop = () => {};
const asyncNoop = async () => ({ ended: false, unlockedPortrait: false, correction: null });

/** The step she is standing in front of — a lift when `item` is reps or absent, a movement otherwise. */
function makeSession(item: PlannedItem | null, completeItem = jest.fn(asyncNoop)) {
  const isSet = !item || item.kind === 'reps';
  return {
    active: true,
    phase: 'SET_PRESENTED',
    displayPhase: 'SET_PRESENTED',
    paused: false,
    currentExercise: isSet ? { id: 'bb_bench_press', name: 'Bench Press', muscle: 'Chest', equipment: 'barbell' } : null,
    currentExerciseId: isSet ? 'bb_bench_press' : item!.ex,
    sessionExerciseIds: ['bb_bench_press'],
    currentTarget: isSet ? { exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: 32.5, recommendedReps: 8, repBandLo: 8, repBandHi: 10 } : null,
    currentItem: item,
    nextItem: null,
    nextExerciseId: null,
    setLabel: { n: 1, m: 3 },
    emphases: [],
    nextSetLabel: { n: 2, m: 3 },
    globalProgress: { index: 0, total: 12 },
    exerciseProgress: { index: 0, total: 4 },
    nextExercise: null,
    nextTarget: null,
    restSeconds: 60,
    restExtraSeconds: 0,
    watchLoggedSet: null,
    startedAtMs: Date.now() - 100_000,
    toLoad: false,
    canMarkOccupied: false,
    endResult: null,
    correction: null,
    start: asyncNoop,
    startCoach: asyncNoop,
    loadResumable: async () => null,
    resumeSaved: async () => false,
    completeSet: asyncNoop,
    completeItem,
    reportEffort: noop,
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
  profile: { id: 'p1', name: 'Maya', sex: 'female', units: 'kg', weightKg: 62, bodyMap: {}, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  model: {},
  modeState: { completedSessions: 4 },
  refreshProgram: async () => {},
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
  return r.root.findAllByType(Text).map((n) => {
    const c = n.props.children;
    return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
  }).join('\n');
}

const labels = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.props?.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);

const PLANK = { kind: 'time', ex: 'plank', seconds: 45, say: 'Ribs down.' } as const;
const CARRY = { kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24 } as const;
const MOBILITY = { kind: 'open', ex: 'mobility', say: 'Whatever your hips need.' } as const;

describe('a step that is not a set never reaches the set stage', () => {
  // The act's KEY, resolved inside the test: the table is built before `initI18n` has run.
  it.each([
    ['a hold', PLANK as PlannedItem, 'workout.itemStart'],
    ['a distance', CARRY as PlannedItem, 'workout.itemDone'],
    ['an open item', MOBILITY as PlannedItem, 'workout.itemDone'],
  ])('%s draws its own stage, with its own one act', (_name, item, actKey) => {
    const r = draw(makeSession(item));
    expect(labels(r)).toContain(tg(actKey));
    // The set stage's act is the tell: "Complete set" on a plank means she is looking at a set with
    // no weight and no reps in it.
    expect(labels(r)).not.toContain(tg('workout.completeSet'));
  });

  it('states the item, and says what the coach said about it', () => {
    expect(textOf(draw(makeSession(PLANK as PlannedItem)))).toContain('0:45');
    expect(textOf(draw(makeSession(PLANK as PlannedItem)))).toContain('Ribs down.');
    expect(textOf(draw(makeSession(CARRY as PlannedItem))).toUpperCase()).toContain('40');
  });

  it('names the movement, rather than humanising its id', () => {
    // `run_outdoor` came out of the id humaniser as "Run Outdoor" — a catalogue we ship, spelled by
    // a fallback, on the screen she trains from.
    const run = { kind: 'distance', ex: 'run_outdoor', metres: 5000 } as PlannedItem;
    expect(textOf(draw(makeSession(run))).toUpperCase()).toContain('RUN');
    expect(textOf(draw(makeSession(run))).toUpperCase()).not.toContain('RUN OUTDOOR');
  });

  it('offers neither door: there is no film of a run and no synonym for a plank', () => {
    const r = draw(makeSession(PLANK as PlannedItem));
    expect(labels(r)).not.toContain(tg('workout.form'));
    expect(labels(r)).not.toContain(tg('workout.swapAction'));
    // The way out is never withdrawn — the chrome law: pause and the elapsed clock are the
    // WORKOUT's, and the workout is running on every one of these screens.
    expect(labels(r)).toContain(tg('workout.pauseAction'));
  });

  it('ends the step through the door that knows its shape', () => {
    const completeItem = jest.fn(asyncNoop);
    const r = draw(makeSession(PLANK as PlannedItem, completeItem));
    const start = r.root.find((n) => n.props?.accessibilityLabel === tg('workout.itemStart') && typeof n.props.onPress === 'function');
    act(() => start.props.onPress());
    act(() => { jest.advanceTimersByTime(20_000); });
    const stop = r.root.find((n) => n.props?.accessibilityLabel === tg('workout.itemStop') && typeof n.props.onPress === 'function');
    act(() => stop.props.onPress());
    // What she actually held, not what was asked — a plank stopped at 20 is a 20-second plank.
    expect(completeItem).toHaveBeenCalledWith({ seconds: 20 });
  });
});

describe('a set is still a set', () => {
  it.each([
    ['a reps item', { kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 32.5 } as PlannedItem],
    ['a step with no item at all (an engine-built plan)', null],
  ])('%s draws the set stage, untouched', (_name, item) => {
    const r = draw(makeSession(item));
    expect(labels(r)).toContain(tg('workout.completeSet'));
    expect(labels(r)).not.toContain(tg('workout.itemStart'));
  });
});
