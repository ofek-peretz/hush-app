/**
 * ════ HOW HARD IT WAS — the seam, not the pixels (2026-07-31) ════
 *
 * The coach's most valuable input is the one the record never held: whether a set was a grind or a
 * stroll. The question is worth nothing unless the answer survives every hop — tap → the session's
 * record → the sheet the coach reads.
 *
 * Each of those hops has broken silently in this codebase before: the wrist's pain report reached
 * the phone and DIED there, because the delegate literal had no `reportPain` key and nothing failed.
 * So this walks the seam. The layout is not the risk; the handoffs are.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { AppContext } from '@/state/stores/appStore';
import { SessionContext } from '@/state/stores/sessionStore';
import { ToastProvider } from '@/components/ds';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { initI18n, tg } from '@/i18n';
import { recordEffort } from '@/domain/effort';
import { coachFacts } from '@/domain/coachFacts';
import type { EffortReport, Profile, Program, Session } from '@/data/local/models';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => { await initI18n(); });
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => { while (mounted.length) mounted.pop()!.unmount(); });
});

const noop = () => {};
const asyncNoop = async () => {};

const LIFT = 'db_shoulder_press';

/** The last set of a four-set lift — the only state that opens the question. */
function liveSession(reportEffort: jest.Mock, setN = 4, setM = 4) {
  return {
    active: true,
    phase: 'SET_PRESENTED',
    displayPhase: 'SET_PRESENTED',
    paused: false,
    currentExercise: { id: LIFT, name: 'Dumbbell Shoulder Press', muscle: 'Shoulders', equipment: 'dumbbell' },
    currentExerciseId: LIFT,
    nextExerciseId: 'bb_row',
    currentTarget: { exerciseId: LIFT, setIndex: setN - 1, recommendedWeight: 14, recommendedReps: 8 },
    setLabel: { n: setN, m: setM },
    restSeconds: 0,
    restTotalSeconds: 120,
    restExtraSeconds: 0,
    elapsedSeconds: 100,
    exerciseOrdinal: { n: 2, m: 6 },
    toLoad: false,
    canMarkOccupied: false,
    startedAtMs: Date.now(),
    completeSet: async () => ({ ended: false, unlockedPortrait: false, correction: null }),
    editCurrentSet: noop,
    endRest: noop,
    extendRest: noop,
    pause: noop,
    resume: noop,
    reportEffort,
    finishEarly: asyncNoop,
    swapNextExercise: noop,
    swapCurrentExercise: noop,
    markEquipmentOccupied: noop,
    start: asyncNoop,
    loadResumable: async () => null,
    resumeSaved: async () => false,
  } as unknown as React.ContextType<typeof SessionContext>;
}

function draw(session: React.ContextType<typeof SessionContext>): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AppContext.Provider value={{ units: 'kg', profile: {} } as never}>
          <SessionContext.Provider value={session}>
            <ToastProvider>
              <SessionFlow navigation={{ navigate: noop, replace: noop } as never} route={{ params: {} } as never} />
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
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const node = n as { children?: unknown[] } | null;
    node?.children?.forEach(walk);
  };
  walk(r.toJSON());
  return out.join(' ');
}

/**
 * Log the set and let the beat settle.
 *
 * `completeSet` is ASYNC and the question only opens after it resolves — deliberately, so the set
 * is on disk before the window starts. A synchronous `act` leaves that promise pending: the beat
 * renders, but the branch that opens the question has not run, and every assertion after it reads a
 * half-finished frame. The await is the whole reason this helper exists.
 */
async function pressCompleteSet(r: ReactTestRenderer): Promise<void> {
  const btn = r.root.findAll(
    (n) => typeof n.type !== 'string' && n.props?.accessibilityLabel === tg('workout.completeSet'),
  )[0];
  await act(async () => { btn.props.onPress(); });
  await act(async () => { jest.advanceTimersByTime(1500); }); // past the capture dwell
}

async function pressAnswer(r: ReactTestRenderer, key: string): Promise<void> {
  const btn = r.root.findAll((n) => n.props?.accessibilityLabel === tg(key))[0];
  await act(async () => { btn.props.onPress(); });
}

const asked = (r: ReactTestRenderer) => textOf(r).toUpperCase().includes(tg('workout.effortAsk').toUpperCase());

describe('how hard it was — from her thumb to the coach', () => {
  it('files the answer against the lift she just finished', async () => {
    const reportEffort = jest.fn();
    const r = draw(liveSession(reportEffort));
    await pressCompleteSet(r);
    expect(asked(r)).toBe(true);
    await pressAnswer(r, 'workout.effortAboutRight');
    // The cursor moves to the NEXT lift the instant the last set writes. Reading it live at the
    // moment she answers would file her answer against a lift she has not started.
    expect(reportEffort).toHaveBeenCalledWith(LIFT, 'about_right');
  });

  it('offers all three rungs, and each one sends its own value', async () => {
    for (const [key, level] of [
      ['workout.effortHadMore', 'had_more'],
      ['workout.effortAboutRight', 'about_right'],
      ['workout.effortNothingLeft', 'nothing_left'],
    ] as const) {
      const reportEffort = jest.fn();
      const r = draw(liveSession(reportEffort));
      await pressCompleteSet(r);
      await pressAnswer(r, key);
      expect({ key, calls: reportEffort.mock.calls }).toEqual({ key, calls: [[LIFT, level]] });
    }
  });

  it('releases the stage on the tap alone — answering is the FAST way out', async () => {
    const r = draw(liveSession(jest.fn()));
    await pressCompleteSet(r);
    expect(asked(r)).toBe(true);
    await pressAnswer(r, 'workout.effortHadMore');
    // No timer advanced between the tap and here. If answering did not release the beat, the
    // question would be a toll on the workout and nobody would answer it twice.
    expect(asked(r)).toBe(false);
  });

  it('lets the window run out writing nothing — unknown stays unknown', async () => {
    const reportEffort = jest.fn();
    const r = draw(liveSession(reportEffort));
    await pressCompleteSet(r);
    await act(async () => { jest.advanceTimersByTime(6500); });
    expect(reportEffort).not.toHaveBeenCalled();
    expect(asked(r)).toBe(false); // and the workout moved on by itself
  });

  it('is not asked on an ordinary set — only the beat that closes a lift', async () => {
    const r = draw(liveSession(jest.fn(), 2, 4));
    await pressCompleteSet(r);
    expect(asked(r)).toBe(false);
  });

  it('is not asked on a single-set lift — nothing was closed', async () => {
    const r = draw(liveSession(jest.fn(), 1, 1));
    await pressCompleteSet(r);
    expect(asked(r)).toBe(false);
  });
});

describe('the record keeps one answer per lift', () => {
  it('replaces an earlier answer rather than stacking a second', () => {
    // A session resumed after the app was killed re-enters the beat, and a double tap is a double
    // tap. Two answers for one lift is a record that cannot be read.
    let effort: EffortReport[] | undefined;
    effort = recordEffort(effort, 'a', 'had_more', '1');
    effort = recordEffort(effort, 'b', 'about_right', '2');
    effort = recordEffort(effort, 'a', 'nothing_left', '3');
    expect(effort).toEqual([
      { exerciseId: 'b', level: 'about_right', at: '2' },
      { exerciseId: 'a', level: 'nothing_left', at: '3' },
    ]);
  });
});

describe('the sheet carries it, and carries absence as absence', () => {
  const profile: Profile = {
    sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false,
  };
  const program: Program = { id: 'p', frequency: 4, days: [] };
  const session: Session = {
    id: 's1', programDayId: 'd1', startedAt: '2026-07-26T17:00:00.000Z',
    state: 'SAVED', earlyFinish: false, trained: true,
    sets: [
      { exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: 30, recommendedReps: 8,
        actualWeight: 30, actualReps: 12, edited: false, persistedAt: '2026-07-26T17:00:00.000Z' },
      { exerciseId: 'bb_row', setIndex: 0, recommendedWeight: 40, recommendedReps: 8,
        actualWeight: 40, actualReps: 10, edited: false, persistedAt: '2026-07-26T17:10:00.000Z' },
    ],
    effort: [{ exerciseId: 'bb_bench_press', level: 'nothing_left', at: '2026-07-26T17:05:00.000Z' }],
  };

  it('states her answer beside the sets it is about', () => {
    const f = coachFacts({ profile, program, history: [session], justFinished: session });
    expect(f.session!.lifts.find((l) => l.ex === 'bb_bench_press')!.effort).toBe('nothing_left');
  });

  it('never invents one for a lift she was not asked about', () => {
    const f = coachFacts({ profile, program, history: [session], justFinished: session });
    const row = f.session!.lifts.find((l) => l.ex === 'bb_row')!;
    // An effort inferred from the reps would be the coach reading its own guess back as her
    // testimony — the exact failure the whole architecture exists to prevent.
    expect('effort' in row).toBe(false);
    expect(JSON.stringify(f)).not.toContain('"effort":null');
  });
});
