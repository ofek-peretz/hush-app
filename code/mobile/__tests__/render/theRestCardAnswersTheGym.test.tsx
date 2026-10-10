/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE REST CARD ANSWERS THE GYM — the founder's 2026-08-25 session, pinned.
 *
 * He trained a full session with the product and came back with a list. Three of its findings are
 * screen facts, and each is a law here so it cannot quietly regress:
 *
 *   #2 · *"היה כתוב בזמן מנוחה 30 קילו אבל לא כמה לשים בכל צד"* — the crossing card now carries
 *        the equipment-native loading line (plates a side), the same voice as the set stage.
 *   #9 · *"הייתי רוצה לראות איזה עוד תרגילים נותרו לי… אין לי שום דרך לדעת זאת"* — first answered
 *        with two names at the card's foot; the founder struck that line on 2026-08-29 (*"רשום
 *        תרגילים שאי אפשר לראות בכלל בלחיצה על זה"*) because it read as a door and was a caption.
 *        The guarantee below is the same finding, one generation on: the SESSION MAP is reachable
 *        from the rest, by a control, on every beat.
 *  #10 · *"לחיצה על החזרות לא פותחת את עריכת הסט"* — first answered with a door; since the
 *        2026-08-26 redesign the figures ARE the dials, and the block below guards that instead.
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

function makeSession(over = {}) {
  return {
    active: true,
    phase: 'SET_PRESENTED',
    displayPhase: 'SET_PRESENTED',
    paused: false,
    currentExercise: { id: 'bb_bench_press', name: 'Bench Press', muscle: 'Chest', equipment: 'barbell' },
    currentExerciseId: 'bb_bench_press',
    sessionExerciseIds: ['bb_bench_press', 'db_row', 'lat_pulldown', 'leg_press'],
    sessionSetCounts: { bb_bench_press: 4, db_row: 3, lat_pulldown: 3, leg_press: 4 },
    setsSoFar: [9, 8],
    loadsSoFar: [34, 34],
    currentTarget: { exerciseId: 'bb_bench_press', setIndex: 1, recommendedWeight: 34, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    nextExerciseId: 'bb_bench_press',
    setLabel: { n: 2, m: 4 },
    emphases: [],
    reviseToday: () => 0,
    lastTime: null,
    nextSetLabel: { n: 3, m: 4 },
    globalProgress: { index: 2, total: 24 },
    exerciseProgress: { index: 0, total: 4 },
    nextExercise: null,
    nextTarget: null,
    restSeconds: 150,
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
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    const node = n as { children?: unknown };
    if (node.children) walk(node.children);
  };
  walk(r.toJSON());
  return out.join(' ');
}

describe('finding #2 · the crossing card says what to put on each side', () => {
  it('a barbell next-lift carries its plate line on the transition rest', () => {
    const said = textOf(
      draw(
        makeSession({
          phase: 'REST_TRANSITION',
          displayPhase: 'REST_TRANSITION',
          nextExerciseId: 'bb_row',
          nextExercise: { id: 'bb_row', name: 'Barbell Row', muscle: 'Back', equipment: 'barbell' },
          nextTarget: { exerciseId: 'bb_row', setIndex: 0, recommendedWeight: 60, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
          nextSetLabel: { n: 1, m: 4 },
        }),
      ),
    );
    // 60 kg on a 20 kg bar → one 20 a side, in the stage's own voice (upper-cased suffix).
    expect(said).toContain('20');
    expect(said.toUpperCase()).toContain(tg('load.aSide').toUpperCase());
  });
});

describe('finding #9 · what is still ahead is reachable, and it is a control', () => {
  /* The map disc lives on the stage bar, so it is the SAME door on a set, a rest and a crossing.
     A finding about "I have no way to know" is only answered if the way is there when she looks. */
  const opensTheMap = (r: ReactTestRenderer) =>
    r.root.findAll(
      (n) => n.props?.accessibilityRole === 'button' && n.props?.accessibilityLabel === tg('workout.sessionMap'),
      { deep: true },
    );

  for (const [what, over] of [
    ['a rest between sets', { phase: 'REST_INTER', displayPhase: 'REST_INTER' }],
    ['a crossing to the next lift', { phase: 'REST_TRANSITION', displayPhase: 'REST_TRANSITION', nextExerciseId: 'db_row', nextExercise: { id: 'db_row', name: 'Dumbbell Row', muscle: 'Back', equipment: 'dumbbell' }, nextSetLabel: { n: 1, m: 4 } }],
    ['a live set', {}],
  ] as const) {
    it(`${what} carries a door into the session map`, () => {
      expect(opensTheMap(draw(makeSession(over))).length).toBeGreaterThan(0);
    });
  }

  it('the struck caption is gone from the rest card in both directions', () => {
    /* The keys themselves were deleted with the row, so the assertion is on the SHAPE that
       replaced it: no clipped list of names sits on the card any more. */
    const said = textOf(draw(makeSession({ phase: 'REST_INTER', displayPhase: 'REST_INTER' })));
    expect(said).not.toContain('Dumbbell Row · Lat Pulldown');
  });

  it('the map lists every lift of the session, not two of them', () => {
    const r = draw(makeSession({ phase: 'REST_INTER', displayPhase: 'REST_INTER' }));
    act(() => {
      opensTheMap(r)[0].props.onPress();
    });
    const said = textOf(r);
    for (const name of ['Bench Press', 'Dumbbell Row', 'Lat Pulldown', 'Leg Press']) {
      expect(said).toContain(name);
    }
  });
});

describe('finding #10 · the rep band is an instrument', () => {
  /*
   * Finding #10 (gym, 2026-08-25) was "tapping the reps did nothing" — the band became a door to
   * the editor. The 2026-08-26 redesign went further: the editor room was deleted and both figures
   * WERE the dials, standing on the stage. The 2026-08-31 pass moved the dials one step back again,
   * into the athlete's slot, so the figure could be the hero of the screen.
   *
   * ⛔ THE GUARANTEE IS THE SAME ONE THROUGH ALL THREE, and it is the only thing this block has ever
   * been about: **the numbers are never dead glass.** Whatever the composition, a figure on the
   * stage must be reachable, must lead to an instrument, and that instrument must announce the band.
   * What changes generation to generation is how many taps that is; what may never change is
   * whether it is possible.
   */
  it('both figures are live, and pressing one opens the pad that fills it', () => {
    const r = draw(makeSession());
    const cell = (heading: string) =>
      r.root.find(
        (n) =>
          n.props?.accessibilityRole === 'button' &&
          String(n.props?.accessibilityLabel ?? '').startsWith(heading) &&
          typeof n.props?.onPress === 'function',
      );
    /* Both are pressable with no tap at all — neither number is a caption. The load names itself by
       the EQUIPMENT's word now ("a side" on a bar), not by "weight": founder, 2026-08-31. */
    expect(cell(tg('load.aSide'))).toBeTruthy();
    const reps = cell(tg('workout.repsUnit'));
    expect(reps).toBeTruthy();

    act(() => reps.props.onPress());
    const keys = r.root.findAll(
      (n) => n.props?.accessibilityRole === 'button' && /^[0-9]$/.test(String(n.props?.accessibilityLabel ?? '')),
      { deep: false },
    );
    expect(keys.length).toBe(10); // ten digits, all of them live
  });
});
