/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHICH SET, OUT OF HOW MANY — AND THE THREE OTHER PLACES THAT ANSWER WAS MISSING.
 *
 * ⛔ FOUNDER, 2026-08-18, on the workout screenshots: *"האיזה סט מתוך כמה היה אמור להופיע בסרגל
 * למעלה אם שמת לב אבל זה לא ברור."*
 *
 * It was supposed to be readable off the rail, and it was not. The rail is one segment per lift
 * with the current lift's segment "opened" into its sets — a real union, and the right idea — drawn
 * as 6-point ticks at `rgba(241,238,229,0.14)` sitting among 3-point strokes at `0.12`. On a phone
 * that is ten near-identical marks in a row: the nesting the whole design rests on was invisible,
 * and the sets she had LEFT were the faintest thing on the screen.
 *
 * Three failures with one cause — a fact that has an owner on paper and no owner on the glass:
 *
 *   · THE RAIL     drew the count and could not be counted.        → a well, pips, and the figure
 *   · THE REST CARD said "UP NEXT · Barbell Bench Press" while she
 *     stood at the bench mid-lift. The up-next law (2026-07-12)
 *     says *"the lift's name AND WHICH SET"*; the second half had
 *     never been built.                                            → the set takes the line
 *   · VOICEOVER    had `setsLabel` computed under a comment
 *     promising it, and rendered nowhere at all.                   → `LiftRail` owns the sentence
 *
 * ⚠️ AND THE FOURTH, WHICH IS THE SAME SHAPE AS THE "6 CHANGES" BUG: the learned-rest beat fired on
 * *she pressed Start early* and reported *your prescription moved* — two different facts. With no
 * history behind a lift the median is the tier and cannot move, so cutting a 2:30 rest short
 * produced "REST · LEARNED / 2:30 NEXT TIME" with nothing changed and nothing struck through.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
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

/**
 * ⚠️ 150 SECONDS IS NOT AN ARBITRARY FIXTURE. `restWithSample([], …)` — no history behind the lift —
 * returns the TIER, 150, whatever she actually rested. So a 2:30 rest cut short is precisely the
 * case where the median cannot move, and it is the case the founder screenshotted.
 */
const TIER_REST_S = 150;

function makeSession(over = {}) {
  return {
    active: true,
    phase: 'SET_PRESENTED',
    displayPhase: 'SET_PRESENTED',
    paused: false,
    currentExercise: { id: 'bb_bench_press', name: 'Bench Press', muscle: 'Chest', equipment: 'barbell' },
    currentExerciseId: 'bb_bench_press',
    sessionExerciseIds: ['bb_bench_press'],
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
    exerciseProgress: { index: 1, total: 6 },
    nextExercise: null,
    nextTarget: null,
    restSeconds: TIER_REST_S,
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

/** Every string the athlete actually reads. */
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

const flat = (s: unknown) => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;

/** The rail row, found by the role it declares. */
const rail = (r: ReactTestRenderer) =>
  r.root.findAll((n) => n.props?.accessibilityRole === 'progressbar', { deep: true })[0] ?? null;

/** Alpha out of an `rgba(r,g,b,a)` string; 1 for anything opaque. */
const alphaOf = (c: string): number => {
  const m = /rgba?\([^)]*?,\s*([0-9.]+)\s*\)/.exec(c);
  return m ? Number(m[1]) : 1;
};

describe('⛔ the rail says which set she is on, in words as well as in marks', () => {
  /*
   * ⛔ REVERSED ON 2026-09-01 (founder: every deferred design-review finding is treated on the
   * reviewer's judgment). The 08-26 cut argued "the pips are the count"; the review's answer is
   * that an instrument this small still earns a CAPTION — a sighted athlete was counting
   * hairlines for a sentence the rail already spoke to VoiceOver alone. So the law flips: the
   * exact string the accessibilityLabel carries is DRAWN, once, under the track — the ear's
   * sentence and the eye's are one sentence again.
   */
  it('⛔ writes the position under the track — the same words VoiceOver was always given', () => {
    const said = textOf(draw(makeSession()));
    expect(said).toContain(tg('workout.exerciseCount', { n: 2, N: 6 }));
    expect(said).toContain(tg('workout.setOfM', { n: 2, m: 4 }));
  });

  it('says the whole sentence to VoiceOver, which is what the deleted `setsLabel` only promised', () => {
    const label = rail(draw(makeSession()))?.props.accessibilityLabel ?? '';
    expect(label).toContain(tg('workout.setOfM', { n: 2, m: 4 }));
    expect(label).toContain(tg('workout.exerciseCount', { n: 2, N: 6 }));
  });

  it('does not draw at all on a lift with one set and one lift — there is nothing to say', () => {
    const said = textOf(draw(makeSession({
      setLabel: { n: 1, m: 1 },
      exerciseProgress: { index: 0, total: 1 },
    })));
    expect(said).not.toContain('1/1');
  });
});

describe('⛔ her sets are drawn as a thing that can be counted', () => {
  it('the open lift is a CONTAINER — it has a ground of its own, and the strokes beside it do not', () => {
    // Containment is the cue that survives a glance. Without it, "these four belong together" is
    // implied by a gap, and a gap among ten marks reads as four more lifts.
    const row = rail(draw(makeSession()));
    // Host nodes only: react-test-renderer returns the composite AND the host for every `View`, so
    // an un-filtered `findAll` counts each drawn thing twice.
    const opened = row.findAll(
      (n) => typeof n.type === 'string'
        && flat(n.props.style).backgroundColor != null
        && flat(n.props.style).paddingHorizontal != null,
      { deep: true },
    );
    expect(opened.length).toBe(1);
  });

  it('⛔ a set she has NOT done outweighs a lift she has not reached — the exact regression', () => {
    /*
     * This is the measurement the founder's complaint reduces to. It was `0.14` for a pending SET
     * against `0.12` for a pending LIFT: two hundredths of alpha carrying the whole distinction,
     * which on glass is no distinction. The sets she has left are the entire question the rail is
     * being asked, so they are the marks that must survive being looked at quickly.
     */
    const row = rail(draw(makeSession()));
    const fills = row
      .findAll((n) => typeof n.type === 'string' && typeof flat(n.props.style).backgroundColor === 'string', { deep: true })
      .map((n) => flat(n.props.style));
    /* PENDING only — a done mark and the live one are opaque by design (moss, cream), and the
       comparison worth defending is between the two things that have NOT happened yet. */
    const rgba = (s: Record<string, unknown>) => /^rgba/.test(s.backgroundColor as string);
    const pendingPip = fills.filter((s) => s.height === 8 && rgba(s)).map((s) => alphaOf(s.backgroundColor as string));
    const pendingStroke = fills.filter((s) => s.height === 3 && rgba(s)).map((s) => alphaOf(s.backgroundColor as string));
    expect(pendingPip.length).toBeGreaterThan(0);
    expect(pendingStroke.length).toBeGreaterThan(0);
    expect(Math.max(...pendingPip)).toBeGreaterThan(Math.max(...pendingStroke) * 1.5);
  });

  it('a set is a PIP and a lift is a STROKE — two families, so the nesting is drawn not implied', () => {
    const row = rail(draw(makeSession()));
    const heights = row
      .findAll((n) => typeof flat(n.props.style).height === 'number', { deep: true })
      .map((n) => flat(n.props.style).height as number);
    // Round versus flat: the pip's radius is half its height, the stroke's is not.
    expect(new Set(heights).size).toBeGreaterThan(1);
  });
});

describe('⛔ between sets, the rest card says the set — the lift is where she is standing', () => {
  const resting = (over = {}) => makeSession({ phase: 'REST_INTER', displayPhase: 'REST_INTER', ...over });

  it('names the set she comes back to', () => {
    expect(textOf(draw(resting()))).toContain(tg('workout.setOfM', { n: 3, m: 4 }));
  });

  it('⛔ …and does NOT say "Up next" over a lift she has not left', () => {
    // The file's own note about the crossing card already said it: "UP NEXT is not information on
    // a card that is the only card on the screen." It was true one branch to the left as well.
    expect(textOf(draw(resting()))).not.toContain(tg('workout.upNext'));
  });

  it('the lift keeps a home — the legend — because a SWAP announces itself there', () => {
    // Uppercased by `Legend`, and isolated by `bidi()` so a Latin name inside a Hebrew line cannot
    // drag the punctuation around it.
    expect(textOf(draw(resting()))).toContain('BENCH PRESS');
  });

  it('⚠️ a CROSSING is untouched: there the lift IS the news', () => {
    const said = textOf(draw(makeSession({
      phase: 'REST_TRANSITION',
      displayPhase: 'REST_TRANSITION',
      nextExerciseId: 'lat_pulldown',
      nextExercise: { id: 'lat_pulldown', name: 'Lat Pulldown', muscle: 'Back', equipment: 'machine' },
      nextTarget: { exerciseId: 'lat_pulldown', setIndex: 0, recommendedWeight: 45, recommendedReps: 10, repBandLo: 10, repBandHi: 12 },
    })));
    expect(said).toContain(tg('workout.upNextNewLift').toUpperCase());
    expect(said).toContain('Lat Pulldown');
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ AND THE APP ONLY SAYS IT LEARNED SOMETHING WHEN IT DID.
 *
 * Two beats, one fault each, and the same fault: a sentence fired off a TRIGGER rather than off the
 * FINDING it claims to report. `aCountAndItsRowsAreOneDerivation` named this shape in August —
 * *"a count that is not literally `rows.length` is a second source of truth waiting to disagree"* —
 * and both of these were second sources.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⛔ "learned" is a finding, not a trigger', () => {
  /** Press the footer's one act by the label it wears. */
  function press(r: ReactTestRenderer, label: string) {
    const hit = r.root
      .findAll((n) => n.props?.accessibilityLabel === label || n.props?.label === label, { deep: true })
      .find((n) => typeof n.props.onPress === 'function');
    if (!hit) throw new Error(`no pressable "${label}" — saw: ${textOf(r)}`);
    act(() => hit.props.onPress());
  }

  it('cutting a rest short that moves NOTHING hands straight to the set', () => {
    /*
     * The founder's own screenshot. With no history behind the lift `restWithSample` returns the
     * tier — 150 — whatever she rested, so a 2:30 rest cut short cannot move her prescription. The
     * beat fired anyway and read "REST · LEARNED / 2:30 NEXT TIME" over a struck row it had hidden
     * because there was nothing to strike.
     */
    const endRest = jest.fn();
    const r = draw(makeSession({ phase: 'REST_INTER', displayPhase: 'REST_INTER', restSeconds: TIER_REST_S, endRest }));
    press(r, tg('workout.startNextSet'));
    expect(endRest).toHaveBeenCalled();
    expect(textOf(r)).not.toContain(tg('workout.restLearned').toUpperCase());
  });

  it('⚠️ …and one that DOES move it still gets its beat', () => {
    // Same press, one different fact: the rest she was on was not the tier, so the tier she lands
    // on is a change and the screen has something to report.
    const endRest = jest.fn();
    const r = draw(makeSession({ phase: 'REST_INTER', displayPhase: 'REST_INTER', restSeconds: 90, endRest }));
    press(r, tg('workout.startNextSet'));
    expect(endRest).not.toHaveBeenCalled();
    expect(textOf(r)).toContain(tg('workout.restLearned').toUpperCase());
  });
});

/**
 * ⛔ AND IT SAYS SO ONCE PER LIFT, NOT ONCE PER SET.
 *
 * "37 kg holds for your next set" is a decision, and the founder's foundation stone licenses it —
 * *"if it thinks it should stay on the same weight — it may […] therefore every decision the system
 * makes must explain why."* What the stone does not license is saying it four times about ONE
 * decision. On a four-set lift the beat announced the same unchanged number after every set, and
 * with the rest beat and the load toast beside it the workout's dominant voice became the app
 * talking about its own diligence.
 */
describe('⛔ a load that holds is stated once per lift', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => void jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  const completeSet = () => jest.fn(async () => ({ ended: false, correction: null, unlockedPortrait: false }));

  /** Log a set and let the capture beat mount. */
  function logSet(r: ReactTestRenderer) {
    /*
     * ⛔ THE REP COUNT FIRST — it starts EMPTY on every set (founder, 2026-08-31: *"ובחזרות להשאיר
     * ריק"*) and pressing the act with it empty opens the field rather than writing a number
     * nobody said. Logging a set is now: say how many, then finish.
     */
    const cell = r.root.find(
      (n) =>
        n.props?.accessibilityRole === 'button' &&
        String(n.props?.accessibilityLabel ?? '').startsWith(tg('workout.repsUnit')) &&
        typeof n.props?.onPress === 'function',
    );
    act(() => cell.props.onPress());
    const eight = r.root.find(
      (n) => n.props?.accessibilityRole === 'button' && n.props?.accessibilityLabel === '8' && typeof n.props?.onPress === 'function',
    );
    act(() => eight.props.onPress());
    const hit = r.root
      .findAll((n) => n.props?.label === tg('workout.completeSet'), { deep: true })
      .find((n) => typeof n.props.onPress === 'function');
    if (!hit) throw new Error(`no Complete set — saw: ${textOf(r)}`);
    act(() => hit.props.onPress());
  }

  /* 2026-08-26: the holds sentence retired with the in-session corrections it accompanied —
     during the workout the app is a LOGGER, and a logger's beat is the record itself. What this
     block pins now is exactly that: the capture states HER set, and says nothing about the next. */
  it('the capture states her set — the record, not a verdict', () => {
    const r = draw(makeSession({ completeSet: completeSet() }));
    logSet(r);
    const read = textOf(r).toUpperCase();
    expect(read).toContain(tg('workout.setCaptured', { n: 2 }).toUpperCase());
  });

  it('⛔ …and says NOTHING about the next set — no hold, no verdict, no correction', () => {
    const r = draw(makeSession({ completeSet: completeSet() }));
    logSet(r);
    const read = textOf(r);
    expect(read).not.toMatch(/holds for your next set/i);
    expect(read).not.toMatch(/landed|band/i);
  });
});

/**
 * ⛔ AND THE TWO NUMBERS ON THE REST SCREEN ARE ONE NUMBER.
 *
 * Caught in the harness the minute the rest card started naming the set she comes back to: the rail
 * above it was still reading `setLabel` — the set she had just FINISHED — so the screen carried
 * "SET 2/4" eight points above "Set 3 of 4". Same lift, same word, two answers. A rest belongs to
 * the set it precedes.
 */
describe('⛔ the rail and the rest card never disagree about which set it is', () => {
  it('the REST surface says the sentence ONCE — the card speaks, the rail only draws (finding #5)', () => {
    /*
     * Amended 2026-08-25 (founder gym finding #5): on the rest screen the set was stated three
     * times — pips, "SET 3/4" beside them, and the card's "Set 3 of 4". The card keeps the
     * sentence (it is where the resting eye looks) and the written count beside the pips is gone
     * FROM THIS SURFACE only; the stage keeps it (next test) because the stage has no card.
     */
    const said = textOf(draw(makeSession({ phase: 'REST_INTER', displayPhase: 'REST_INTER' })));
    expect(said).toContain(tg('workout.setOfM', { n: 3, m: 4 })); // the card's one sentence
    expect(said).not.toContain('3/4'); // the written count beside the pips is not on this surface
    expect(said).not.toContain('2/4');
  });

  it('⚠️ …and on the STAGE the rail is the set she is doing, not the next one', () => {
    /* The written count is gone (see the head of this file), so the fact is read where it lives
       now — the rail's spoken sentence. Same guarantee, one honest source. */
    const label = rail(draw(makeSession()))?.props.accessibilityLabel ?? '';
    expect(label).toContain(tg('workout.setOfM', { n: 2, m: 4 }));
    expect(label).not.toContain(tg('workout.setOfM', { n: 3, m: 4 }));
  });
});
