/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SHARED STAGE, WALKED — §11.2 on the real screen, not on a fixture of it. (2026-08-31)
 *
 * `domain/sharedSession` proves the arithmetic and `theBarIsSharedAndNothingElseIs` proves the
 * promises across files. Neither of them can answer the founder's actual question, which is
 * *"how does it look, and how does it feel"* — so this mounts the LIVE `SessionFlow` with a partner
 * in the context and reads what is on the screen.
 *
 * Every case here is one an athlete reaches by standing in a gym:
 *   · the bar is hers      → the act says whose turn is ending, and it still logs
 *   · the bar is his       → the act goes back to being an ordinary Complete Set
 *   · he went quiet        → one line, and she trains on
 *   · the wire fell over   → no turn it cannot verify, and the workout carries on
 *   · his number, or not   → the hand-off reads either way
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { AppContext } from '@/state/stores/appStore';
import { SessionContext } from '@/state/stores/sessionStore';
import { PairContext } from '@/state/stores/pairStore';
import { ToastProvider } from '@/components/ds';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { initI18n, tg } from '@/i18n';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

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

/** She is standing at the bench, on set 2 of 4 — the beat §11.2's mock draws. */
const liveSet = {
  active: true,
  phase: 'SET_PRESENTED',
  displayPhase: 'SET_PRESENTED',
  paused: false,
  currentExercise: { id: 'bb_bench_press', name: 'Bench Press', muscle: 'Chest', equipment: 'barbell' },
  currentExerciseId: 'bb_bench_press',
  sessionExerciseIds: ['bb_bench_press', 'cable_row'],
  sessionSetCounts: { bb_bench_press: 4, cable_row: 3 },
  setsSoFar: [9],
  loadsSoFar: [42.5],
  currentTarget: { exerciseId: 'bb_bench_press', setIndex: 1, recommendedWeight: 42.5, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
  currentItem: null,
  nextItem: null,
  straightInto: null,
  nextExerciseId: null,
  nextExercise: null,
  nextTarget: null,
  setLabel: { n: 2, m: 4 },
  nextSetLabel: null,
  lastTime: null,
  nextLiftFact: null,
  globalProgress: { index: 1, total: 7 },
  exerciseProgress: { index: 0, total: 2 },
  restSeconds: 90,
  restExtraSeconds: 0,
  watchLoggedSet: null,
  startedAtMs: Date.now() - 120_000,
  toLoad: false,
  canMarkOccupied: false,
  warmupOffered: 0,
  setRunningLong: false,
  priorPeakKg: null,
  livePlan: [],
  loggedSets: [],
  endResult: null,
  correction: null,
  reviseToday: () => 0,
  start: asyncNoop,
  startCoach: asyncNoop,
  loadResumable: async () => null,
  resumeSaved: async () => false,
  adoptLocalSession: async () => 'refused',
  completeSet: asyncNoop,
  completeItem: asyncNoop,
  editCurrentSet: noop,
  addWarmup: noop,
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

const appFixture = {
  booted: true,
  profile: { id: 'p1', name: 'Erez', sex: 'male', units: 'kg', weightKg: 78, bodyMap: {}, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  model: { replaceBlock: asyncNoop },
  modeState: { completedSessions: 0 },
  refreshProgram: asyncNoop,
} as unknown as React.ContextType<typeof AppContext>;

/** A partner, with everything in it a real frame carries and nothing else. */
const pairFixture = (over = {}) =>
  ({
    ready: true,
    signedIn: true,
    canHandOverLead: false,
    joinedByLink: false,
    stage: 'live',
    link: 'open',
    code: 'K7M2PQ',
    role: 'host',
    partnerName: 'Dana',
    partnerHere: true,
    partnerPresence: 'resting',
    partnerBar: { exerciseId: 'bb_bench_press', kg: 30, reps: 10 },
    plan: { v: 1, lifts: [{ exerciseId: 'bb_bench_press', sets: 4 }, { exerciseId: 'cable_row', sets: 3 }] },
    standing: {
      liftIndex: 0,
      exerciseId: 'bb_bench_press',
      turn: 'host',
      mine: true,
      mineSet: { n: 2, m: 4 },
      theirsSet: { n: 2, m: 4 },
      stale: false,
      behindOnPlan: false,
    },
    atSameStation: true,
    swapAsk: null,
    swapAnswer: null,
    failure: null,
    loadsPrivate: false,
    open: async () => 'K7M2PQ',
    join: async () => null,
    signIn: async () => true,
    invite: async () => {},
    clearJoinedByLink: noop,
    handOverLead: noop,
    leave: noop,
    setLoadsPrivate: noop,
    askSwap: noop,
    answerSwap: noop,
    clearSwapAsk: noop,
    clearSwapAnswer: noop,
    beginAsGuest: async () => 'refused',
    ...over,
  }) as unknown as React.ContextType<typeof PairContext>;

const nav = { navigate: noop, goBack: noop, push: noop, pop: noop, replace: noop, setOptions: noop, addListener: () => noop, canGoBack: () => true };

function draw(pair: unknown, session = liveSet): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AppContext.Provider value={appFixture}>
          <SessionContext.Provider value={session}>
            <PairContext.Provider value={pair as never}>
              <ToastProvider>
                {React.createElement(SessionFlow as never, { navigation: nav, route: { key: 'k', name: 'SessionFlow', params: {} } } as never)}
              </ToastProvider>
            </PairContext.Provider>
          </SessionContext.Provider>
        </AppContext.Provider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}

/**
 * Every string the screen actually draws, flattened — with two real properties of this app removed,
 * because both are correct and neither is what a copy assertion is about:
 *
 *   · BIDI ISOLATES. Every name on this stage goes through `bidi()`, which wraps it in U+2066/2069
 *     so a Hebrew sentence does not reorder a Latin name inside it (`everyDirectionIsDrawnByTheLaw`).
 *   · CASE. `Legend` uppercases; "YOUR TURN" and "Your turn" are one string with one meaning.
 */
const ISOLATES = /[⁦-⁩]/g;
const says = (haystack: string, needle: string) =>
  haystack.replace(ISOLATES, '').toLowerCase().includes(needle.replace(ISOLATES, '').toLowerCase());

function words(r: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n && typeof n === 'object' && 'children' in (n as { children?: unknown })) {
      walk((n as { children: unknown }).children);
    }
  };
  walk(r.toJSON());
  return out.join(' | ');
}

/** A pressable whose label reads as `label` — isolates and case set aside, exactly as `says` does. */
const hasAction = (r: ReactTestRenderer, label: string) =>
  r.root.findAll(
    (n) =>
      typeof n.props.onPress === 'function' &&
      typeof n.props.accessibilityLabel === 'string' &&
      says(n.props.accessibilityLabel, label),
  ).length > 0;

describe('§11.2 · the bar is hers', () => {
  it('⛔ the act says whose turn is ending — and it is still the log button', () => {
    const r = draw(pairFixture());
    expect(says(words(r), tg('pair.logAndPass', { name: 'Dana' }))).toBe(true);
    // …and the ordinary label is NOT also on screen: one act, one sentence.
    expect(says(words(r), tg('workout.completeSet'))).toBe(false);
    // The permission never changed — the button is present and pressable.
    expect(hasAction(r, tg('pair.logAndPass', { name: 'Dana' }))).toBe(true);
  });

  it('the row says YOUR TURN, where he is, and what goes on his bar', () => {
    const w = words(draw(pairFixture()));
    expect(says(w, tg('pair.yourTurn'))).toBe(true);
    expect(says(w, 'Dana')).toBe(true);
    expect(says(w, tg('pair.stateResting'))).toBe(true);
    expect(says(w, tg('pair.setOf', { n: 2, m: 4 }))).toBe(true);
    expect(says(w, '30 kg × 10')).toBe(true);
  });

  it('⛔ his number is drawn only beside the lift it names', () => {
    // He has moved to the row while she is still at the bench: the same number, a different lift.
    const w = words(draw(pairFixture({ partnerBar: { exerciseId: 'cable_row', kg: 30, reps: 10 } })));
    expect(says(w, tg('pair.yourTurn'))).toBe(true); // the hand-off still reads
    expect(says(w, '30 kg × 10')).toBe(false); // …without a weight that belongs to another bar
  });

  it('she kept her weights to herself and the hand-off is unharmed', () => {
    const w = words(draw(pairFixture({ partnerBar: null })));
    expect(says(w, tg('pair.yourTurn'))).toBe(true);
    expect(says(w, tg('pair.setOf', { n: 2, m: 4 }))).toBe(true);
    expect(says(w, '30 kg')).toBe(false);
  });
});

describe('§11.2 · the bar is his', () => {
  const his = pairFixture({
    partnerPresence: 'lifting',
    standing: { liftIndex: 0, exerciseId: 'bb_bench_press', turn: 'guest', mine: false, mineSet: { n: 3, m: 4 }, theirsSet: { n: 2, m: 4 }, stale: false, behindOnPlan: false },
  });

  it('the legend names him, and the act goes back to being an ordinary Complete Set', () => {
    const w = words(draw(his));
    expect(says(w, tg('pair.theirTurn', { name: 'Dana' }))).toBe(true);
    expect(says(w, tg('workout.completeSet'))).toBe(true);
    expect(says(w, tg('pair.logAndPass', { name: 'Dana' }))).toBe(false);
  });

  it('⛔ …and it is never disabled — an athlete who did a set may always write it down', () => {
    expect(hasAction(draw(his), tg('workout.completeSet'))).toBe(true);
  });
});

describe('§11.2 · the ways it comes apart', () => {
  it('he went quiet: one line, and she trains on', () => {
    const w = words(draw(pairFixture({
      standing: { liftIndex: 0, exerciseId: 'bb_bench_press', turn: 'guest', mine: false, mineSet: { n: 3, m: 4 }, theirsSet: { n: 2, m: 4 }, stale: true, behindOnPlan: false },
    })));
    expect(says(w, tg('pair.gone', { name: 'Dana' }))).toBe(true);
    expect(says(w, tg('workout.completeSet'))).toBe(true); // the workout is untouched
  });

  it('⛔ he is on his LAST set — the row says how much longer, not only where', () => {
    const w = words(draw(pairFixture({
      partnerPresence: 'lifting',
      standing: { liftIndex: 0, exerciseId: 'bb_bench_press', turn: 'guest', mine: false, mineSet: { n: 4, m: 4 }, theirsSet: { n: 4, m: 4 }, stale: false, behindOnPlan: false },
    })));
    expect(says(w, tg('pair.lastSet'))).toBe(true);
    // …and it replaces the ordinal rather than sitting beside it — "set 4 of 4 · last set" is one
    // fact said twice, which is the kind of line an athlete stops reading.
    expect(says(w, tg('pair.setOf', { n: 4, m: 4 }))).toBe(false);
  });

  it('she has moved on and he has not: where he is, and that he is nearly done', () => {
    const w = words(draw(pairFixture({
      atSameStation: false,
      partnerPresence: 'lifting',
      standing: { liftIndex: 0, exerciseId: 'bb_bench_press', turn: 'guest', mine: false, mineSet: { n: 4, m: 4 }, theirsSet: { n: 4, m: 4 }, stale: false, behindOnPlan: false },
    })));
    expect(says(w, tg('pair.lastSet'))).toBe(true);
    expect(says(w, tg('pair.yourTurn'))).toBe(false);
  });

  it('the wire fell over: no turn it cannot verify, and no number either', () => {
    const w = words(draw(pairFixture({ link: 'closed' })));
    expect(says(w, tg('pair.linkDown'))).toBe(true);
    expect(says(w, '30 kg × 10')).toBe(false);
  });

  it('they drifted to different lifts: where he is, and nothing about a turn', () => {
    const w = words(draw(pairFixture({
      atSameStation: false,
      standing: { liftIndex: 1, exerciseId: 'cable_row', turn: 'guest', mine: false, mineSet: { n: 1, m: 3 }, theirsSet: { n: 1, m: 3 }, stale: false, behindOnPlan: false },
    })));
    expect(says(w, 'Dana')).toBe(true);
    expect(says(w, tg('pair.yourTurn'))).toBe(false);
    expect(says(w, tg('pair.theirTurn', { name: 'Dana' }))).toBe(false);
  });

  it('⛔ training ALONE draws none of it — the stage is exactly what it was', () => {
    const w = words(draw(pairFixture({ stage: 'idle', standing: null, partnerName: null })));
    expect(says(w, tg('workout.completeSet'))).toBe(true);
    expect(says(w, 'Dana')).toBe(false);
    expect(says(w, tg('pair.yourTurn'))).toBe(false);
  });
});
