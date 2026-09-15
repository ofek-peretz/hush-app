/**
 * ════ ⛔ THE STAGE SAYS WHAT IS TRUE — the founder's four, 2026-09-15 ════
 *
 *   1. "תרגיל 1 / 9" over a session map of five, and the fraction read right-to-left.
 *      A superset's alternation was counted as lifts; the fraction had no direction of its own.
 *   2. "האנימציה לא אהבתי בכלל… לא ברור מה זה האיור הזה" — the phone-in-hand pose a long set
 *      swapped in for her lift.
 *   3. Set 1 of a whole workout, running long, asked "זה היה הסט האחרון. סיימת?".
 *   4. Returning to the stage announced "the voice coach needs earbuds" again — and a notice owns
 *      the footer, so the set's act stood down.
 */
// @ts-nocheck

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { AppContext } from '@/state/stores/appStore';
import { SessionContext, exerciseProgressOf } from '@/state/stores/sessionStore';
import { ToastProvider } from '@/components/ds';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { initI18n, tg } from '@/i18n';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));
const voiceState = { silentBecause: null };
jest.mock('@/platform/voice/useVoiceCoach', () => ({ useVoiceCoach: () => voiceState }));

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  jest.useFakeTimers();
  voiceState.silentBecause = null;
});
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
  jest.useRealTimers();
});

const noop = () => {};
const asyncNoop = async () => {};
const step = (exerciseId, globalIndex, lastSetOfSession = false) => ({ exerciseId, globalIndex, exerciseSetIndex: 0, lastSetOfSession });

function makeSession(over = {}) {
  return {
    active: true,
    phase: 'SET_PRESENTED',
    displayPhase: 'SET_PRESENTED',
    paused: false,
    currentExercise: { id: 'db_shoulder_press', name: 'Dumbbell Shoulder Press', muscle: 'Shoulders', equipment: 'dumbbell' },
    currentExerciseId: 'db_shoulder_press',
    sessionExerciseIds: ['db_shoulder_press'],
    setsSoFar: [],
    loadsSoFar: [],
    currentTarget: { exerciseId: 'db_shoulder_press', setIndex: 0, recommendedWeight: 14, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    nextExerciseId: 'db_shoulder_press',
    setLabel: { n: 1, m: 4 },
    emphases: [],
    reviseToday: () => 0,
    lastTime: null,
    nextSetLabel: { n: 2, m: 4 },
    globalProgress: { index: 0, total: 20 },
    livePlan: [step('db_shoulder_press', 0), step('db_shoulder_press', 1, true)],
    loggedSets: [],
    exerciseProgress: { index: 0, total: 5 },
    nextExercise: null,
    nextTarget: null,
    restSeconds: 90,
    restExtraSeconds: 0,
    watchLoggedSet: null,
    startedAtMs: 1_000,
    setRunningLong: false,
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

function draw(session): ReactTestRenderer {
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
const texts = (r: ReactTestRenderer) =>
  r.root.findAllByType(Text).map((n) => [].concat(n.props.children).filter((c) => typeof c === 'string').join(''));

describe('1 · the count is the map’s own list', () => {
  it('⛔ a superset alternating set by set is two lifts, not six', () => {
    const plan = [
      step('bench', 0), step('bench', 1),
      step('incline', 2), step('fly', 3),
      step('curl', 4), step('pushdown', 5), step('curl', 6), step('pushdown', 7), step('curl', 8), step('pushdown', 9, true),
    ];
    expect(exerciseProgressOf(plan, plan[0])).toEqual({ index: 0, total: 5 });
    expect(exerciseProgressOf(plan, plan[7])).toEqual({ index: 4, total: 5 });
    expect(exerciseProgressOf(plan, plan[8])).toEqual({ index: 3, total: 5 });
  });
  it('the store derives the stage’s count through it', () => {
    expect(read('src/state/stores/sessionStore.tsx')).toContain('exerciseProgress: current ? exerciseProgressOf(plan, current) : null,');
  });
  it('⛔ in Hebrew the fraction is an LTR island — "1 / 9", never "9 / 1"', () => {
    const he = JSON.parse(read('src/i18n/locales/he.json'));
    expect(he.workout.exerciseCount).toBe('תרגיל ⁦{{n}} / {{N}}⁩');
  });
});

describe('2 · the stage keeps showing her lift', () => {
  it('⛔ no phone-in-hand pose swaps in when a set runs long', () => {
    const flow = read('src/screens/session/SessionFlow.tsx');
    expect(flow).not.toMatch(/\bloggingRig\b/);
    expect(flow).toContain('const rig = lift;');
  });
});

describe('3 · "that was the last set" only on the last set', () => {
  it('⛔ set 1 of a workout, running long, says it is running long — not that it was the last', () => {
    const r = draw(makeSession({ setRunningLong: true, globalProgress: { index: 0, total: 20 } }));
    const all = texts(r);
    expect(all).toContain(tg('workout.setRunningLong'));
    expect(all).not.toContain(tg('workout.finishAsk'));
  });
  it('the last set of the session, running long, asks for the finish', () => {
    const r = draw(makeSession({ setRunningLong: true, globalProgress: { index: 1, total: 2 } }));
    expect(texts(r)).toContain(tg('workout.finishAsk'));
  });
});

describe('4 · the silent-voice notice is said once per workout, before it begins', () => {
  it('⛔ once per workout — coming back to the stage does not say it again', () => {
    voiceState.silentBecause = 'no_headset';
    const first = draw(makeSession({ startedAtMs: 42_000 }));
    expect(texts(first)).toContain(tg('workout.voiceSilentNoHeadset'));
    act(() => {
      first.unmount();
      mounted.splice(mounted.indexOf(first), 1);
    });
    const again = draw(makeSession({ startedAtMs: 42_000 }));
    expect(texts(again)).not.toContain(tg('workout.voiceSilentNoHeadset'));
  });
  it('⛔ a workout already under way never hears it', () => {
    voiceState.silentBecause = 'no_headset';
    const r = draw(makeSession({ startedAtMs: 77_000, loggedSets: [{ exerciseId: 'db_shoulder_press' }] }));
    expect(texts(r)).not.toContain(tg('workout.voiceSilentNoHeadset'));
  });
  it('⛔ the gate starts unknown — earbuds in never flash "needs earbuds" while it is read', () => {
    const hook = read('src/platform/voice/useVoiceCoach.ts');
    expect(hook).toContain('useState<VoiceSilence>(null)');
    expect(hook).toMatch(/\} else if \(!connected\) \{\s*if \(c\.isOn\(\)\) c\.disable\(\);\s*setSilentBecause\('no_headset'\);/);
  });
});
