/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A RUN THE COACH PRESCRIBED IS MEASURED, NOT CONFIRMED.
 *
 * Founder, 2026-08-02:
 *
 *   > *"Why does she need a Done button? The GPS can tell us she finished. And we can use our
 *   > existing cardio screen for these cases, no?"*
 *
 * Both right, and the first build of the item stage did neither: a "5 km" step inside a session drew
 * the figure and a button, and asked her to confirm a distance the phone was already able to
 * measure — while the real cardio stage, with the map, the pace, the splits and the heart rate, sat
 * one route away and unused.
 *
 * THE DIVIDING LINE IS THE MOVEMENT, not the shape. A 40 m farmer's carry is a distance with nothing
 * to track: she does it and says so, which is exactly what `DistanceStage` was built for. A run
 * outdoors is `gps: true` in the catalogue, and for those the phone knows.
 *
 * ── THE HALF THAT IS EASY TO GET WRONG ──────────────────────────────────────────────────────────
 * Coming back. She can open the cardio stage, look at the sky, and walk back in — `cardioPerformed`
 * writes nothing for that, so there is no activity, and the step must still be hers to do. The
 * guard is the activity's own start instant: only a run that began AFTER she left this screen can
 * be the run the step is waiting for.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { AppContext } from '@/state/stores/appStore';
import { SessionContext } from '@/state/stores/sessionStore';
import { ToastProvider } from '@/components/ds';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { db } from '@/data/local/db';
import { initI18n, tg } from '@/i18n';
import { isOutdoorMovement, isTrackedMovement } from '@/data/movements';
import type { PlannedItem } from '@/domain/coachPlan';
import type { CardioActivity } from '@/data/local/models';

/*
 * ⚠️ THE SCREEN IS NOT UNMOUNTED WHILE SHE RUNS, and the harness has to honour that.
 *
 * `CardioLive` is PUSHED on top of the session — SessionFlow stays mounted underneath, keeps the
 * instant she left in a ref, and `useFocusEffect` fires again when the stage is popped. A test that
 * re-mounted the screen would be testing a different app: a fresh instance has a fresh ref and
 * could never adopt the run. So the mock keeps the registered callbacks and the test re-focuses.
 */
const focusCbs: (() => void | (() => void))[] = [];
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const R = require('react') as typeof import('react');
    R.useEffect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__focusCbs.push(cb);
      return cb();
    }, [cb]);
  },
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__focusCbs = focusCbs;
/** Come back to the session screen, the way popping the cardio stage does. */
async function refocus(): Promise<void> {
  await act(async () => {
    for (const cb of focusCbs) cb();
    await Promise.resolve();
    await Promise.resolve();
  });
}

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeAll(async () => { await initI18n(); });
beforeEach(async () => { await db.clearAll(); focusCbs.length = 0; });
afterEach(() => { act(() => { while (mounted.length) mounted.pop()!.unmount(); }); });
const mounted: ReactTestRenderer[] = [];

const noop = () => {};
const asyncNoop = async () => ({ ended: false, unlockedPortrait: false, correction: null });

const RUN = { kind: 'distance', ex: 'run_outdoor', metres: 5000, say: 'Conversation pace.' } as PlannedItem;
const CARRY = { kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24 } as PlannedItem;

function makeSession(item: PlannedItem, completeItem: jest.Mock) {
  return {
    active: true, phase: 'SET_PRESENTED', displayPhase: 'SET_PRESENTED', paused: false,
    currentExercise: null, currentExerciseId: (item as { ex: string }).ex, sessionExerciseIds: [],
    currentTarget: null, currentItem: item, nextItem: null, nextExerciseId: null,
    setLabel: { n: 1, m: 1 }, nextSetLabel: null, globalProgress: { index: 0, total: 4 },
    emphases: [],
    reviseToday: () => 0,
    lastTime: null,
    exerciseProgress: { index: 0, total: 3 }, nextExercise: null, nextTarget: null,
    restSeconds: 60, restExtraSeconds: 0, watchLoggedSet: null, startedAtMs: Date.now() - 60_000,
    toLoad: false, canMarkOccupied: false, endResult: null, correction: null,
    start: asyncNoop, startCoach: asyncNoop, loadResumable: async () => null, resumeSaved: async () => false,
    completeSet: asyncNoop, completeItem, reportEffort: noop, editCurrentSet: noop, endRest: noop,
    extendRest: noop, pause: noop, resume: noop, finishEarly: asyncNoop, swapNextExercise: noop,
    swapCurrentExercise: noop, markEquipmentOccupied: noop, publishWatchLobby: noop,
    setWatchHomeActions: noop, clearEndResult: noop, clearCorrection: noop,
  } as unknown as React.ContextType<typeof SessionContext>;
}

const appFixture = {
  booted: true,
  profile: { id: 'p1', name: 'Maya', sex: 'female', units: 'kg', weightKg: 62, bodyMap: {}, repBandByMuscle: {} },
  program: null, sessions: [], entitlement: { status: 'trial', sessionsUsed: 0 }, model: {},
  modeState: { completedSessions: 4 }, refreshProgram: async () => {},
} as unknown as React.ContextType<typeof AppContext>;

function draw(item: PlannedItem, completeItem = jest.fn(asyncNoop)) {
  const navigate = jest.fn();
  const nav = { navigate, goBack: noop, push: noop, pop: noop, replace: noop, setOptions: noop, addListener: () => noop, canGoBack: () => true };
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AppContext.Provider value={appFixture}>
          <SessionContext.Provider value={makeSession(item, completeItem)}>
            <ToastProvider>
              {React.createElement(SessionFlow as never, { navigation: nav, route: { key: 'k', name: 'SessionFlow', params: {} } } as never)}
            </ToastProvider>
          </SessionContext.Provider>
        </AppContext.Provider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  const press = (label: string) => {
    const btn = r.root.find((n) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');
    act(() => btn.props.onPress());
  };
  const labels = () => r.root.findAll((n) => typeof n.props?.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);
  return { navigate, completeItem, press, labels, r };
}

/** A run on disk, started `agoMs` ago. */
function ran(agoMs: number, distanceKm = 5.02, durationSec = 1620): CardioActivity {
  return {
    kind: 'cardio', id: 'cardio_1', gait: 'run',
    startedAt: new Date(Date.now() - agoMs).toISOString(),
    durationSec, distanceKm, avgPaceSec: Math.round(durationSec / distanceKm), splits: [],
  };
}

describe('the catalogue decides who measures', () => {
  /*
   * ⛔ SPLIT IN TWO 2026-08-12, because one flag was answering two questions and had started
   * getting one of them wrong (founder: *"אמרת שקרדיו זה קרדיו כולל אז אני לא מבין"*).
   *
   *   `measuresDistance`     WHETHER the phone can measure it — true indoors and out, since the
   *                          treadmill path reads Core Motion.
   *   `isOutdoorMovement`    BY WHAT — the satellite, or the phone's own motion.
   *
   * The old `isGpsMovement` was being asked the first question and answering the second, so a
   * coach's "5 km on the treadmill" fell to the unmeasured branch: a Done button asking her to
   * confirm a distance the phone was already counting.
   */
  it('a run outdoors is the SATELLITE’S; a treadmill run is the phone’s; a carry is neither', () => {
    expect(isOutdoorMovement('run_outdoor')).toBe(true);
    expect(isOutdoorMovement('run_treadmill')).toBe(false);
    expect(isOutdoorMovement('farmer_carry')).toBe(false);

    // …and BOTH runs are tracked. This is the line that was wrong.
    expect(isTrackedMovement('run_outdoor')).toBe(true);
    expect(isTrackedMovement('run_treadmill')).toBe(true);
    /*
     * ⛔ AND A CARRY IS NOT — the regression this predicate was rewritten for. Its catalogue entry
     * measures in DISTANCE, so a first attempt read "has a distance" as "the phone counts it" and
     * sent a 40-metre farmer's carry to the live cardio stage. Tracked is a property of the
     * movement, and the catalogue says so.
     */
    expect(isTrackedMovement('farmer_carry')).toBe(false);
    expect(isTrackedMovement('plank')).toBe(false);
  });

  it('⚠️ walk and run differ in NAME only — nothing branches on the gait half of an id', () => {
    /*
     * The founder's question, asserted rather than argued: if walk-vs-run were a real fork there
     * would be two of something. There is one — the same source, the same maths, the same screen —
     * and `kcalPerKgKm` prices each SEGMENT on its own pace regardless of what the movement is
     * called. The four ids are labels a coach can write.
     */
    for (const pair of [['run_outdoor', 'walk_outdoor'], ['run_treadmill', 'walk_treadmill']]) {
      const [a, b] = pair;
      expect({ pair, sameSource: isOutdoorMovement(a) === isOutdoorMovement(b) }).toEqual({ pair, sameSource: true });
      expect({ pair, bothTracked: isTrackedMovement(a) === isTrackedMovement(b) }).toEqual({ pair, bothTracked: true });
    }
  });

  it('a carry keeps its one act — she does it and says so', () => {
    const c = draw(CARRY);
    expect(c.labels()).toContain(tg('workout.itemDone'));
    c.press(tg('workout.itemDone'));
    expect(c.completeItem).toHaveBeenCalled();
    expect(c.navigate).not.toHaveBeenCalled();
  });

  it('⚠️ a prescribed run STARTS the cardio stage instead of confirming a distance', () => {
    const c = draw(RUN);
    // Not "Done": there is nothing for her to confirm yet.
    expect(c.labels()).toContain(tg('workout.itemStart'));
    expect(c.labels()).not.toContain(tg('workout.itemDone'));
    c.press(tg('workout.itemStart'));
    // The real stage — map, pace, splits — carrying the coach's distance as its target, which is
    // what lets it end the run without asking.
    // `ex` rides along so the run's KEY POINTS sheet can NAME the exercise its point is about —
    // without it every cardio point would be titled "run_outdoor", including a row, a bike and a walk.
    /*
     * ⚠️ AND `indoor` RIDES WITH IT (2026-08-12). It is the SOURCE, not a second screen: the same
     * stage, the same maths, the same record — a satellite outdoors, the phone's own motion on a
     * belt. Read off the movement, so a coach's treadmill session selects it and nobody is asked.
     */
    expect(c.navigate).toHaveBeenCalledWith('CardioLive', {
      target: { metres: 5000, ex: 'run_outdoor', say: 'Conversation pace.' },
      indoor: false,
    });
    // And nothing is recorded on the way out. She has not run yet.
    expect(c.completeItem).not.toHaveBeenCalled();
  });
});

describe('and the record picks the run up when she comes back', () => {
  it('closes the step from what was MEASURED, not from what was asked', async () => {
    const c = draw(RUN);
    c.press(tg('workout.itemStart'));
    // She leaves, the stage stamps its start, and 27 minutes later the run is on disk. What is
    // compared is the run's START against the instant she left — not when it finished.
    await act(async () => { await db.appendCardioActivity(ran(0)); });
    await refocus();
    expect(c.completeItem).toHaveBeenCalledWith({ metres: 5020, seconds: 1620, activityId: 'cardio_1' });
  });

  it('⚠️ records NOTHING when she came back without running', async () => {
    // The stage opens, she looks at the weather and walks back in. `cardioPerformed` writes no
    // activity for that, so the step is still hers to do — it must not close itself.
    const c = draw(RUN);
    c.press(tg('workout.itemStart'));
    await refocus();
    expect(c.completeItem).not.toHaveBeenCalled();
  });

  it('⚠️ never adopts a run she did BEFORE this step — the start instant is the guard', async () => {
    // Yesterday's run is in the same list. Without the instant check, opening the stage and coming
    // straight back would close the step with a run from another day.
    await act(async () => { await db.appendCardioActivity({ ...ran(26 * 3600_000), id: 'cardio_old' }); });
    const c = draw(RUN);
    c.press(tg('workout.itemStart'));
    await refocus();
    expect(c.completeItem).not.toHaveBeenCalled();
  });
});
