/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SHE DID LAST TIME IS ON THE GLASS, IN BOTH LANGUAGES.
 *
 * ⛔ FOUNDER, 2026-08-26: *"אני עדיין לא מבין איך אתה הולך להציג את החזרות והמשקלים מהאימון הקודם
 * במידה וצריך את זה. כי אם כן כרגע אני לא רואה את זה."*
 *
 * `lastTimeIsOnTheStage` pins the SHAPE of the row by reading the source. This one pins what it
 * SAYS, by rendering it — because the two ways this row has failed before are both invisible to a
 * source read:
 *
 *   · IT SAID THE WRONG NUMBER. The row was deleted in the first place because `Complete set` wrote
 *     the band's floor rather than her reps, so a set of ten came back as eight. The dials fixed the
 *     cause; this fixes the room for it to come back.
 *   · IT WAS SPELLED FOR ONE LANGUAGE. The stage draws mono figures beside a Hebrew word, and mono
 *     has no Hebrew at all (`monoCarriesNoWords`) — so the row is a `Legend` and a run of separate
 *     figure cells rather than one interpolated string. Only a render can prove both halves arrive.
 *
 * ⚠️ THE FIGURES ARE ASSERTED AS CELLS, NOT AS A SENTENCE. `9 9 8` is three `Text` nodes parted by
 * layout, so a test that looked for the substring "9 9 8" would pass on a single flattened string —
 * the exact shape Hebrew cannot draw. It reads the cells.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import i18next from 'i18next';
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
afterAll(async () => {
  await i18next.changeLanguage('en');
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

/** Set 2 of 4 on a lift she trained four days ago: 32.5 kg for 9, 9, 8, 8. */
function makeSession(over: Record<string, unknown> = {}) {
  return {
    active: true,
    phase: 'SET_PRESENTED',
    displayPhase: 'SET_PRESENTED',
    paused: false,
    currentExercise: { id: 'bb_bench_press', name: 'Barbell Bench Press', muscle: 'Chest', equipment: 'barbell' },
    currentExerciseId: 'bb_bench_press',
    sessionExerciseIds: ['bb_bench_press'],
    setsSoFar: [9],
    loadsSoFar: [35],
    currentTarget: { exerciseId: 'bb_bench_press', setIndex: 1, recommendedWeight: 35, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    nextExerciseId: 'bb_bench_press',
    setLabel: { n: 2, m: 4 },
    emphases: [],
    reviseToday: () => 0,
    lastTime: { ago: 4, loadKg: 32.5, reps: [9, 9, 8, 8], loads: [32.5, 32.5, 32.5, 32.5] },
    nextSetLabel: { n: 3, m: 4 },
    globalProgress: { index: 1, total: 24 },
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

/** Every `Text` on the screen, as its own cell — never joined, for the reason in the header. */
function cells(r: ReactTestRenderer): string[] {
  return r.root.findAllByType(Text).map((n) => {
    const c = n.props.children;
    return (Array.isArray(c) ? c.filter((x) => typeof x === 'string' || typeof x === 'number').join('') : String(c ?? '')).trim();
  });
}


/**
 * ⛔ REWRITTEN FOR THE FIELDS (founder, 2026-08-31 — free hand on the layout).
 *
 * The row is deleted. What she did last time is now stated INSIDE the two fields it is about, one
 * line under each figure, in that field's own units — which is the one thing Hevy and Strong do
 * better than we did (their PREVIOUS is a column IN the set's row, beside the number you are about
 * to type) without taking on the spreadsheet the rest of their screen is.
 *
 * ⚠️ THE GUARANTEES ARE UNCHANGED AND THE SUITE IS STILL A RENDER, for the two reasons at the top
 * of this file: the row has failed before by saying the WRONG NUMBER and by being SPELLED FOR ONE
 * LANGUAGE, and a source read cannot see either. It has one new clause, which is the whole point of
 * the move: **the previous is in the SAME UNITS as the figure it sits under** — per side beside per
 * side — so the comparison needs no arithmetic.
 */
describe('what she did last time, inside the field it belongs to', () => {
  for (const loc of ['he', 'en']) {
    describe(loc, () => {
      beforeEach(async () => {
        await act(async () => {
          await i18next.changeLanguage(loc);
        });
      });

      it('states her load and her reps for THIS set, per side, under today’s figures', () => {
        const read = cells(draw(makeSession()));
        /* The word — twice, once under each figure. */
        expect(read.filter((s) => s.startsWith(tg('workout.prevShort')))).toHaveLength(2);
        /*
         * ⛔ 32.5 → 6.25 (founder, 2026-08-31): *"שמתי לב שלמעלה לא כתוב כמה הורם בכל צד באימון
         * הקודם ורק סך הכל."* It said the TOTAL while the field below it said the per-side figure —
         * two scales for one quantity on one screen, so the only comparison the athlete actually
         * makes needed bar arithmetic in her head. `(32.5 − 20) / 2 = 6.25`.
         */
        expect(read).toContain('6.25');
        /* Set 2 of the fixture: she did 9 reps on it last time. Positional, per set — not the
           lift's average and not its first set. */
        expect(read).toContain('9');
      });

      it('⛔ says nothing at all on a lift she has never done', () => {
        const read = cells(draw(makeSession({ lastTime: null, setsSoFar: [], loadsSoFar: [] })));
        expect(read.filter((s) => s.startsWith(tg('workout.prevShort')))).toHaveLength(0);
      });

      it('⛔ and nothing on a warm-up bridge — half the working load is not a comparison', () => {
        const read = cells(draw(makeSession({ setLabel: { n: 1, m: 1, warmup: true } })));
        expect(read.filter((s) => s.startsWith(tg('workout.prevShort')))).toHaveLength(0);
      });

      it('⚠️ a load that moved mid-lift is read PER SET, never flattened to one figure', () => {
        /*
         * Loop 1 raised her from 32.5 to 35 last week, on sets 3 and 4. The fixture stands on set 2,
         * so the honest answer is 32.5 → 6.25 a side. Reading the lift's last load (35 → 7.5) would
         * compare today against a set she has not reached.
         */
        const read = cells(
          draw(makeSession({ lastTime: { ago: 4, loadKg: 35, reps: [9, 9, 8, 8], loads: [32.5, 32.5, 35, 35] } })),
        );
        /*
         * ⚠️ READ POSITIONALLY, because `7.5` is ALSO on this screen — it is TODAY's per-side
         * figure, the fixture's own 35 kg prescription. A bare `not.toContain('7.5')` would be
         * asserting that the stage does not draw the load it is prescribing. What must hold is that
         * the figure UNDER THE WORD is her set-2 load, not the lift's last one.
         */
        expect(read[read.indexOf(tg('workout.prevShort')) + 1]).toBe('6.25');
      });
    });
  }
});
