/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE REST IS ONE CLOCK, EVERYWHERE.
 *
 * Founder, 2026-09-15, on the two findings the sync audit had left for his ruling: *"תיגע בשניים
 * האלו לפי מה שישדרג את חווית המשתמש ואת המוצר שלנו ברמה הגבוהה ביותר ותוודא שהכל סגור ונעול בפני
 * באגים וחורים."*
 *
 * One rest is drawn by the phone's ring, the wrist's ring, the lock card's draining line, and
 * spoken by the voice's "ten seconds". The audit found FIVE ways the same rest told different
 * times, and every one of them lived in a moment that is not the ordinary first second of a rest:
 *
 *   1 · RESUMED — after an app kill the phone's `restSeconds` became the REMAINDER. Its ring started
 *       full over forty seconds while the wrist and the card drew those forty as a partial ring, and
 *       `restedSeconds` wrote her rest into the learned median minus everything before the kill.
 *   2 · PAUSED — pausing clears the anchor, and the phone's ring read the missing end as "no anchor
 *       yet": it showed a FULL rest for the whole pause.
 *   3 · HANDED OVER RUNNING — the anchor came from the wrist's length and the phone counted to its
 *       own; with a learned median between them, the rest she was watching jumped at the handover.
 *   4 · HANDED OVER PAUSED — the wrist clears its end when it pauses and never sent the remainder,
 *       so the phone received a paused rest with no clock at all.
 *   5 · EXTENDED — the voice counted "ten seconds" from the moment it LOOKED, so a "+15" late in a
 *       rest re-scheduled the line past the end of the rest.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
//
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { db } from '@/data/local/db';
import type { PlannedSession } from '@/domain/coachPlan';
import { adoptWatchSession, adoptedRestAnchor } from '@/platform/watch/watchAdopt';
import { parseWatchLocalSession, WATCH_PROTOCOL_VERSION } from '@/platform/watch/protocol';
import { restedSeconds } from '@/domain/restPrescription';
import { VoiceConductor } from '@/platform/voice/voiceConductor';

jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => true,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/setNudge', () => ({
  setNudge: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/coach/afterSession', () => ({
  askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })),
}));

const BENCH = 'bb_bench_press';
const appFixture = {
  booted: true,
  profile: { id: 'p1', name: 'Maya', sex: 'female', units: 'kg', weightKg: 62, bodyMap: {}, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  model: {},
  modeState: { completedSessions: 0 },
  recordSessionCompleted: async () => ({ unlockedPortrait: false }),
  markWorkoutCompleted: async () => {},
  refreshProgram: async () => {},
} as unknown as React.ContextType<typeof AppContext>;

const PLAN: PlannedSession = {
  name: 'Upper A',
  blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: BENCH, load: 60, reps: [8, 10] }] }],
};

let now = 1_800_000_000_000;
const clock = jest.spyOn(Date, 'now');
let wake: ((s: string) => void) | null = null;

beforeEach(async () => {
  await db.clearAll();
  now = 1_800_000_000_000;
  clock.mockImplementation(() => now);
  wake = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type: string, cb: (s: string) => void) => {
    wake = cb;
    return { remove() {} } as never;
  });
});
afterAll(() => clock.mockRestore());

function harness() {
  let view: SessionView | null = null;
  function Probe() {
    view = useSession();
    return null;
  }
  act(() => {
    renderer.create(
      <AppContext.Provider value={appFixture}>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </AppContext.Provider>,
    );
  });
  return () => view!;
}

async function later(ms: number) {
  now += ms;
  await act(async () => {
    wake?.('active');
    await new Promise((r) => setTimeout(r, 0));
  });
}

const remainingOf = (v: SessionView) => Math.round((v.restEndsAtMs! - now) / 1000);

describe('1–2 · the phone’s own rest', () => {
  it('restSeconds is the PRESCRIBED length for the whole rest — never what remains', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => await view().completeSet());
    const prescribed = view().restSeconds;
    expect(prescribed).toBeGreaterThan(40);
    await later(30_000);
    expect(view().restSeconds).toBe(prescribed);
    expect(remainingOf(view())).toBe(prescribed - 30);
  });

  it('⛔ a PAUSE freezes what remains — it does not restart the rest, however long it stands', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => await view().completeSet());
    const prescribed = view().restSeconds;
    await later(25_000);
    await act(async () => view().pause());
    expect(view().restEndsAtMs).toBeNull(); // no end runs while the workout is frozen…
    expect(view().restFrozenRemainingS).toBe(prescribed - 25); // …and the remainder is stated, not guessed
    await later(10 * 60_000);
    expect(view().restFrozenRemainingS).toBe(prescribed - 25);
    await act(async () => view().resume());
    expect(view().restFrozenRemainingS).toBeNull();
    // It resumes exactly where it stopped — the ten minutes away are not in it.
    expect(remainingOf(view())).toBe(prescribed - 25);
    expect(view().restSeconds).toBe(prescribed);
  });

  it('a "+15" pressed during the pause lands in the frozen remainder', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => await view().completeSet());
    const prescribed = view().restSeconds;
    await later(20_000);
    await act(async () => view().pause());
    await act(async () => view().extendRest(15));
    expect(view().restFrozenRemainingS).toBe(prescribed - 20 + 15);
    await act(async () => view().resume());
    expect(remainingOf(view())).toBe(prescribed - 20 + 15);
  });

  it('what she RESTED is measured against the prescription — exactly, after a +15 too', () => {
    // The ring hands `restedSeconds(total, remaining, extra)`. With the prescribed length as `total`,
    // a 90 s rest with a +15 left at 40 s is 65 s of rest; with the REMAINDER as `total` (the old
    // resume path, 70 s left at the kill) it would have been 45.
    expect(restedSeconds(90, 40, 15)).toBe(65);
  });
});

describe('3–4 · the handover from the wrist', () => {
  const machine = (phase, resumePhase = null) => ({ phase, resumePhase, setIndex: 1, isLastSetOfSession: false, earlyFinish: false });
  const NOW = 1_900_000_000_000;

  it('⛔ a RUNNING rest keeps the wrist’s end to the millisecond, whatever the phone’s own length', () => {
    const end = NOW + 47_321;
    // The wrist prescribed 90; the phone's learned median says 120. The end must not move.
    const a = adoptedRestAnchor({ machine: machine('REST_INTER'), restEndsAtMs: end, pausedRestRemainingS: null }, 120, NOW);
    expect(a.restStartedAtMs! + 120 * 1000).toBe(end);
    expect(a.pausedAtMs).toBeNull();
  });

  it('⛔ a PAUSED rest keeps its frozen remainder, and stays paused', () => {
    const a = adoptedRestAnchor({ machine: machine('PAUSED', 'REST_TRANSITION'), restEndsAtMs: null, pausedRestRemainingS: 33 }, 120, NOW);
    expect(a.pausedAtMs).toBe(NOW);
    // What the phone's store computes while paused: start + base − pausedAt.
    expect((a.restStartedAtMs! + 120 * 1000 - a.pausedAtMs!) / 1000).toBe(33);
  });

  it('a paused rest from a wrist too old to state its remainder still gets a CLOCK — never none', () => {
    const a = adoptedRestAnchor({ machine: machine('PAUSED', 'REST_INTER'), restEndsAtMs: null, pausedRestRemainingS: null }, 90, NOW);
    expect(a.restStartedAtMs).not.toBeNull();
    expect((a.restStartedAtMs! + 90 * 1000 - a.pausedAtMs!) / 1000).toBe(90);
  });

  it('a set, or a pause of a set, has no rest anchor to give', () => {
    expect(adoptedRestAnchor({ machine: machine('SET_PRESENTED'), restEndsAtMs: null, pausedRestRemainingS: null }, 90, NOW)).toEqual({ restStartedAtMs: null, pausedAtMs: null });
    expect(adoptedRestAnchor({ machine: machine('PAUSED', 'SET_PRESENTED'), restEndsAtMs: null, pausedRestRemainingS: 20 }, 90, NOW)).toEqual({ restStartedAtMs: null, pausedAtMs: null });
  });

  it('the wrist’s frozen remainder crosses the wire and survives the parser', () => {
    const step = (i) => ({ exerciseId: BENCH, exerciseName: 'Bench', setIndexInExercise: i, totalSetsInExercise: 3, globalIndex: i, targetWeight: 40, targetReps: 8, targetRepsHi: 10, blockId: 'b1' });
    const offer = {
      v: WATCH_PROTOCOL_VERSION,
      type: 'local_session',
      recordId: 'rec-9',
      workoutId: 'day_1',
      workoutName: 'Upper A',
      startedAt: new Date(NOW - 600_000).toISOString(),
      phase: 'paused',
      pausedFrom: 'rest_inter',
      currentIndex: 1,
      restEndsAt: null,
      restTotalS: 90,
      pausedRestRemainingS: 41,
      steps: [step(0), step(1), step(2)],
      sets: [{ exerciseId: BENCH, setIndex: 0, blockId: 'b1', recommendedWeight: 40, recommendedReps: 8, actualWeight: 40, actualReps: 8, completedAt: new Date(NOW - 100_000).toISOString() }],
      sentAt: new Date(NOW).toISOString(),
    };
    const parsed = parseWatchLocalSession(offer);
    expect(parsed).not.toBeNull();
    const adopted = adoptWatchSession(parsed!, NOW)!;
    expect(adopted.machine.phase).toBe('PAUSED');
    expect(adopted.pausedRestRemainingS).toBe(41);
    // …and a negative or non-finite remainder is a malformed frame, not a rest.
    expect(parseWatchLocalSession({ ...offer, pausedRestRemainingS: -3 })).toBeNull();
  });
});

describe('5 · the voice counts to the same end', () => {
  function conductor(t: { now: number }) {
    const timers: number[] = [];
    const c = new VoiceConductor({
      mouth: { say: async () => {}, interrupt() {} },
      ear: { open: () => ({ close() {} }) },
      audio: { duck: async () => {}, unduck: async () => {}, playChime: async () => {} },
      now: () => t.now,
      setTimeout: (_f, ms) => (timers.push(ms), timers.length),
      clearTimeout: () => {},
      getView: () => null,
      locale: () => 'he',
      firstSessionEver: () => false,
    });
    return { c, timers };
  }

  it('⛔ a "+15" late in a rest schedules "ten seconds" against the rest’s END, not from the tap', () => {
    const t = { now: 5_000_000 };
    const { c, timers } = conductor(t);
    // Ninety seconds prescribed, sixty served, then +15: forty-five seconds remain.
    const view = { restSeconds: 90, restExtraSeconds: 15, restEndsAtMs: t.now + 45_000, displayPhase: 'REST_INTER' };
    c.scheduleTenSeconds(view);
    expect(timers).toEqual([35_000]); // it used to be 95_000 — past the end of the rest
  });

  it('inside the last ten seconds, the line is not said late', () => {
    const t = { now: 5_000_000 };
    const { c, timers } = conductor(t);
    c.scheduleTenSeconds({ restSeconds: 90, restExtraSeconds: 0, restEndsAtMs: t.now + 6_000, displayPhase: 'REST_INTER' });
    expect(timers).toEqual([]);
  });
});
