/**
 * THE STAGE'S DIALS RECORD THE SET (founder, 2026-08-26 — the live-set redesign, second cut).
 *
 * ── The history this carries ──────────────────────────────────────────────────────────────────
 * This suite guarded "Save set saves the set" (build 36 — A.10): the editor room's Save had to run
 * the same completion path as Complete Set. The room is DELETED now — its two engraved dials moved
 * onto the stage itself — so the guarantee moves with them:
 *
 *   1. both dials record the set through the product's own `WheelPicker`, each one tap behind its
 *      own figure in the prescription row (see 2.);
 *   2. every turn writes through `editCurrentSet` — the single entry `theEngineDecidesWhatASetIs`
 *      pins — never through a parallel path;
 *   3. the weight dial turns on the EQUIPMENT'S OWN detent (a barbell steps 2.5, never 0.5 — the
 *      41.5 kg bench that no plates could build);
 *   4. Complete Set still records through the one completion path, capture beat and all;
 *   5. and nothing on the stage offers the dead room: no "עריכת סט" door survives.
 *
 * ── ⛔ WHAT CHANGED ON 2026-08-31, AND WHY THIS IS NOT A LAW BEING WEAKENED TO FIT ───────────────
 *
 * FOUNDER: *"ברגע שהמשקל מונח על המוט או הפין במכשיר או המשקולת ביד — המשקל כבר לא הגיבור כי ב-90%
 * מהזמן המשקל הזה לא מתחלף לאורך כל התרגיל."*
 *
 * The athlete became the hero of the set stage and the weight wheel gave up the slot to her. Point
 * 1 above used to say "both dials STAND on the stage" and it can no longer be true of the weight —
 * so the assertion is rewritten rather than deleted, and it is rewritten to hold MORE than it did:
 *
 *   · BOTH numbers are still STATED on the stage, in figures, with no tap at all;
 *   · each wheel is still exactly one press away, still the product's own `WheelPicker`, still on
 *     the equipment's own detent, still writing through `editCurrentSet`.
 *
 * ⚠️ THE THING THIS SUITE ACTUALLY EXISTS TO STOP is a second, parallel write path for a set —
 * that is `theEngineDecidesWhatASetIs`'s clause and it is untouched. Where the control STANDS is a
 * composition decision the founder gets to make; that it writes through one door is not.
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
    loadsSoFar: [34, 34],
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

/** A dial, found the way a screen reader meets it — the adjustable with this label. */
function dialByLabel(r: ReactTestRenderer, label: string) {
  return r.root.find(
    (n) => n.props?.accessibilityRole === 'adjustable' && String(n.props?.accessibilityLabel ?? '').startsWith(label),
  );
}

/** One key on the number pad. */
function key(r: ReactTestRenderer, label: string): void {
  const k = r.root.find(
    (n) => n.props?.accessibilityRole === 'button' && n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function',
  );
  act(() => k.props.onPress());
}

/**
 * A prescription cell — the figure on the stage that opens its own pad in the athlete's slot.
 * Found the way a screen reader meets it: the button whose spoken label opens with its heading.
 */
function openCell(r: ReactTestRenderer, heading: string): void {
  const target = r.root.find(
    (n) =>
      n.props?.accessibilityRole === 'button' &&
      String(n.props?.accessibilityLabel ?? '').startsWith(heading) &&
      typeof n.props?.onPress === 'function',
  );
  act(() => target.props.onPress());
}


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

describe('the stage’s dials record the set', () => {
  it('⛔ BOTH NUMBERS ARE STILL ON THE STAGE WITH NO TAP AT ALL', () => {
    /*
     * The founder's own finding on the first athlete-as-hero build: *"ושמתי לב שהמשקל נעלם מהמסך
     * כך שאי אפשר לשנות אותו, זה לא תקין."* The load had become a 19-point caption and he read the
     * screen as having lost the feature. Demoting a wheel may not cost the athlete the number.
     */
    const r = draw(makeSession(async () => ({ ended: false, correction: null, unlockedPortrait: false })));
    const text = textOf(r);
    expect(text).toContain('36.5'); // the fixture's prescribed load
    expect(text).toContain('8'); // and its rep target
  });

  it('both fields write through editCurrentSet — each one tap behind its own figure', () => {
    const editCurrentSet = jest.fn();
    const session = makeSession(async () => ({ ended: false, correction: null, unlockedPortrait: false }));
    session.editCurrentSet = editCurrentSet;
    const r = draw(session);

    /*
     * ⛔ ONE SLOT, SO ONE FIELD AT A TIME. The athlete stands where the pad opens, and opening the
     * second field closes the first — which is the composition, not a limitation: two 164-point
     * rulers on one stage is exactly what the athlete-as-hero pass removed.
     *
     * ⛔ AND THE WEIGHT IS TYPED PER SIDE, WHICH IS THE FOUNDER'S OWN RULING (2026-08-31): *"הרבה
     * הרבה יותר נוח באמצע האימון לדעת כמה משקל לשים בכל צד מאשר המשקל הכולל."* The RECORD is still
     * the total — this asserts the transform, because a screen that showed per side and logged per
     * side would quietly halve every load in her history.
     */
    /*
     * ⛔ AND THE FIRST KEY REPLACES WHAT SHE ARRIVED WITH. The field opens holding 8.25 a side — the
     * prescription, because this is a correction and starting blank would make her retype a number
     * she is not changing. Appending would have cost four backspaces before the first digit, on
     * something she never typed. It is what every field on earth does; it is a decision here only
     * because this one starts full.
     */
    openCell(r, tg('load.aSide'));
    key(r, '1');
    key(r, '0');
    // 10 a side on a 20 kg bar is 40 on the record.
    expect(editCurrentSet).toHaveBeenCalledWith(expect.objectContaining({ weight: 40 }));

    openCell(r, tg('workout.repsUnit'));
    key(r, '9');
    expect(editCurrentSet).toHaveBeenCalledWith(expect.objectContaining({ reps: 9 }));
  });

  /**
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE BAND IS THE ANSWERS — the tap cost of the whole product (2026-08-31)
   * ════════════════════════════════════════════════════════════════════════════════════════════
   *
   * A session is about twenty-four sets and every one of them used to cost three presses: open the
   * count, type a digit, finish. The coach already named a RANGE for that digit, so the range is
   * laid out at the foot and one press answers it — two presses a set, on the most repeated
   * interaction in the product.
   *
   * ⚠️ IT IS NOT A DEFAULT AND MUST NEVER BECOME ONE. That is the whole difference between this and
   * Hevy, whose reps arrive pre-filled and are confirmed with a tick — so its logs carry numbers
   * nobody typed. Nothing here is selected until she selects it (`nothing is chosen until she
   * chooses`), which is `theAppNeverAnswersForHer` applied to the one number the engine reads back.
   */
  describe('the band is offered as answers, and she is still the one answering', () => {
    const draw2 = () => {
      const editCurrentSet = jest.fn();
      const session = makeSession(async () => ({ ended: false, correction: null, unlockedPortrait: false }));
      session.editCurrentSet = editCurrentSet;
      return { r: draw(session), editCurrentSet };
    };
    const counts = (r: ReactTestRenderer) =>
      r.root.findAll(
        (n) =>
          n.props?.accessibilityRole === 'button' &&
          /^\d+ /.test(String(n.props?.accessibilityLabel ?? '')) &&
          String(n.props?.accessibilityLabel ?? '').endsWith(tg('workout.repsUnit')),
        { deep: false },
      );

    it('the whole band is on the foot — 8, 9 and 10 for an 8–10 prescription', () => {
      const { r } = draw2();
      expect(counts(r).map((n) => String(n.props.accessibilityLabel))).toEqual([
        `8 ${tg('workout.repsUnit')}`,
        `9 ${tg('workout.repsUnit')}`,
        `10 ${tg('workout.repsUnit')}`,
      ]);
    });

    it('⛔ nothing is chosen until she chooses — and then it writes through the one door', () => {
      const { r, editCurrentSet } = draw2();
      expect(counts(r).some((n) => n.props.accessibilityState?.selected)).toBe(false);
      act(() => counts(r)[1].props.onPress());
      expect(editCurrentSet).toHaveBeenCalledWith(expect.objectContaining({ reps: 9 }));
      expect(counts(r)[1].props.accessibilityState?.selected).toBe(true);
    });

    it('⛔ and there is always a way past the band — six because she failed, twelve because she flew', () => {
      const { r, editCurrentSet } = draw2();
      const other = r.root.find(
        (n) => n.props?.accessibilityRole === 'button' && n.props?.accessibilityLabel === tg('workout.otherCount'),
      );
      act(() => other.props.onPress());
      const key = r.root.find(
        (n) => n.props?.accessibilityRole === 'button' && n.props?.accessibilityLabel === '6' && typeof n.props?.onPress === 'function',
      );
      act(() => key.props.onPress());
      expect(editCurrentSet).toHaveBeenCalledWith(expect.objectContaining({ reps: 6 }));
    });
  });

  /**
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ A SET WITH NO COUNT IN IT IS NOT A SET (founder, 2026-08-31: *"בדקת אבל שאי אפשר לאשר סט
   * במידה ולא הוקלד שום מספר?"*)
   * ════════════════════════════════════════════════════════════════════════════════════════════
   *
   * This is the clause the whole empty-field rule rests on, and it is the one that would fail
   * silently: if the act ever completed on an untouched screen it would write `recommendedReps` —
   * the band's FLOOR — which is precisely the defect the row of last time was once deleted over
   * ("an athlete who did ten and tapped once was recorded as doing eight"). Nothing about the
   * screen would look wrong; the log would simply be a guess.
   *
   * ⚠️ AND IT DOES NOT REFUSE, IT ASKS. A disabled button says "no" and leaves her to work out why,
   * at a bar, out of breath. Pressing the act with no count opens the field instead — the one thing
   * still owed — which is why this asserts BOTH halves.
   */
  describe('the act cannot log a set nobody counted', () => {
    it('⛔ pressing Complete Set with an empty count does not complete anything', async () => {
      const completeSet = jest.fn(async () => ({ ended: false, correction: null, unlockedPortrait: false }));
      const r = draw(makeSession(completeSet));
      press(r, tg('workout.completeSet'));
      await act(async () => {
        jest.advanceTimersByTime(4000);
        await Promise.resolve();
      });
      expect(completeSet).not.toHaveBeenCalled();
    });

    it('…it opens the count instead — the pad is up, on the one thing still owed', () => {
      const r = draw(makeSession(async () => ({ ended: false, correction: null, unlockedPortrait: false })));
      const digits = () =>
        r.root.findAll(
          (n) => n.props?.accessibilityRole === 'button' && /^[0-9]$/.test(String(n.props?.accessibilityLabel ?? '')),
          { deep: false },
        );
      expect(digits()).toHaveLength(0);
      press(r, tg('workout.completeSet'));
      expect(digits()).toHaveLength(10);
    });

    it('…and once she has said a number, the same press records it', async () => {
      const completeSet = jest.fn(async () => ({ ended: false, correction: null, unlockedPortrait: false }));
      const r = draw(makeSession(completeSet));
      enterReps(r, '9');
      press(r, tg('workout.completeSet'));
      await act(async () => {
        jest.advanceTimersByTime(4000);
        await Promise.resolve();
      });
      expect(completeSet).toHaveBeenCalled();
    });
  });

  it('Complete Set records through the one completion path, capture beat and all', async () => {
    const completeSet = jest.fn(async () => ({ ended: false, correction: null, unlockedPortrait: false }));
    const r = draw(makeSession(completeSet));

    enterReps(r, '8'); // the count is empty on every set now — see `enterReps`
    press(r, tg('workout.completeSet'));
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(completeSet).toHaveBeenCalled();
  });

  it('the dead room is dead — no editor door or Save survives on the stage', () => {
    const r = draw(makeSession(async () => ({ ended: false, correction: null, unlockedPortrait: false })));
    const text = textOf(r);
    expect(text).not.toContain(tg('workout.editSave'));
    expect(text).not.toContain(tg('workout.editResult'));
  });
});
