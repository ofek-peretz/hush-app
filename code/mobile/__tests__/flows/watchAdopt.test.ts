/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LIVE HANDOVER — the wrist's running workout, adopted by the phone.
 *
 * ⛔ FOUNDER: *"אם התחלתי אימון בשעון ואני נכנס לאפליקציה בפלאפון המסך של האימון צריך להופיע."*
 *
 * The wrist's standalone engine says nothing while it runs, so a workout begun with the phone away
 * was invisible to the phone until it was over. These cover the two halves that can be proven off a
 * device: the frame is not believed unless it is whole, and what it becomes is exactly what the
 * phone's own resume path would have rebuilt.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { parseWatchLocalSession, WATCH_PROTOCOL_VERSION } from '@/platform/watch/protocol';
import { adoptWatchSession, decideAdoption } from '@/platform/watch/watchAdopt';
import { watchSessionId } from '@/platform/watch/watchReconcile';

const NOW = Date.parse('2026-08-17T10:00:00.000Z');

function step(over = {}) {
  return {
    exerciseId: 'bb_bench_press',
    exerciseName: 'Barbell Bench Press',
    setIndexInExercise: 0,
    totalSetsInExercise: 2,
    globalIndex: 0,
    targetWeight: 40,
    targetReps: 8,
    targetRepsHi: 10,
    blockId: 'b1',
    ...over,
  };
}

/** Four steps: two of one lift, two of another — enough to prove every boundary flag. */
const STEPS = [
  step({ globalIndex: 0, setIndexInExercise: 0 }),
  step({ globalIndex: 1, setIndexInExercise: 1 }),
  step({ exerciseId: 'bb_row', exerciseName: 'Barbell Row', globalIndex: 2, setIndexInExercise: 0 }),
  step({ exerciseId: 'bb_row', exerciseName: 'Barbell Row', globalIndex: 3, setIndexInExercise: 1 }),
];

function local(over = {}) {
  return {
    v: WATCH_PROTOCOL_VERSION,
    type: 'local_session',
    recordId: 'rec-1',
    workoutId: 'day_1',
    workoutName: 'Upper A',
    startedAt: new Date(NOW - 600_000).toISOString(),
    phase: 'active_set',
    currentIndex: 1,
    steps: STEPS,
    sets: [
      {
        exerciseId: 'bb_bench_press',
        setIndex: 0,
        blockId: 'b1',
        recommendedWeight: 40,
        recommendedReps: 8,
        actualWeight: 40,
        actualReps: 9,
        completedAt: new Date(NOW - 120_000).toISOString(),
      },
    ],
    sentAt: new Date(NOW).toISOString(),
    ...over,
  };
}

describe('parseWatchLocalSession — believed whole, or not at all', () => {
  it('accepts a well-formed frame', () => {
    expect(parseWatchLocalSession(local())).not.toBeNull();
  });

  it('accepts it as a JSON string too (the wire carries text)', () => {
    expect(parseWatchLocalSession(JSON.stringify(local()))).not.toBeNull();
  });

  it.each([
    ['a wrong protocol version', { v: 99 }],
    ['a different message type', { type: 'session_record' }],
    ['no recordId — the handover has no identity', { recordId: '' }],
    ['no workoutId', { workoutId: '' }],
    ['an unparseable startedAt', { startedAt: 'sometime' }],
    ['a phase the phone has no machine for', { phase: 'cardio' }],
    ['a pausedFrom that is not a phase', { phase: 'paused', pausedFrom: 'nonsense' }],
    ['a fractional step index', { currentIndex: 1.5 }],
    ['a negative step index', { currentIndex: -1 }],
    ['a step index past the plan she sent', { currentIndex: 4 }],
    ['no steps at all', { steps: [] }],
    ['a step with no exercise', { steps: [step({ exerciseId: '' })] }],
    ['a step whose set count is zero', { steps: [step({ totalSetsInExercise: 0 })] }],
    ['an infinite target weight', { steps: [step({ targetWeight: Number.POSITIVE_INFINITY })] }],
    ['a negative rep target', { steps: [step({ targetReps: -1 })] }],
    ['an unparseable restEndsAt', { phase: 'rest_inter', restEndsAt: 'soon' }],
    ['a negative rest total', { phase: 'rest_inter', restTotalS: -5 }],
    ['a logged set with no exercise', { sets: [{ exerciseId: '', setIndex: 0, actualReps: 8, completedAt: new Date(NOW).toISOString() }] }],
    ['a logged set with impossible reps', { sets: [{ exerciseId: 'x', setIndex: 0, actualReps: Number.NaN, completedAt: new Date(NOW).toISOString() }] }],
    ['a logged set with no timestamp', { sets: [{ exerciseId: 'x', setIndex: 0, actualReps: 8, completedAt: 'later' }] }],
  ])('rejects %s', (_label, over) => {
    expect(parseWatchLocalSession(local(over))).toBeNull();
  });

  it('rejects junk that is not an object at all', () => {
    expect(parseWatchLocalSession(null)).toBeNull();
    expect(parseWatchLocalSession('not json')).toBeNull();
    expect(parseWatchLocalSession(42)).toBeNull();
  });
});

describe('adoptWatchSession — what the phone becomes', () => {
  it('⛔ adopts under the id the finished record will carry — the handover is idempotent by identity', () => {
    const a = adoptWatchSession(local(), NOW)!;
    expect(a.session.id).toBe(watchSessionId('rec-1'));
    // Which is the exact identity `applyWatchSessionRecord` de-dupes on, so a record that arrives
    // after a successful handover is recognised and acked rather than saved twice.
    expect(a.session.id).toBe('watch_rec-1');
  });

  it('the session is LIVE, and carries her work and the workout it belongs to', () => {
    const a = adoptWatchSession(local(), NOW)!;
    expect(a.session.state).toBe('ACTIVE');
    expect(a.session.earlyFinish).toBe(false);
    expect(a.session.programDayId).toBe('day_1');
    expect(a.session.programDayName).toBe('Upper A');
    expect(a.session.sets).toHaveLength(1);
    expect(a.session.sets[0]).toMatchObject({ exerciseId: 'bb_bench_press', setIndex: 0, actualReps: 9 });
  });

  it('marks a set she changed as edited, and one she did not as not', () => {
    const asPrescribed = adoptWatchSession(
      local({ sets: [{ ...local().sets[0], actualReps: 8, actualWeight: 40 }] }),
      NOW,
    )!;
    expect(asPrescribed.session.sets[0].edited).toBe(false);
    // The fixture's own set is 9 reps against a prescribed 8.
    expect(adoptWatchSession(local(), NOW)!.session.sets[0].edited).toBe(true);
  });

  it('rebuilds the plan with the right boundaries', () => {
    const a = adoptWatchSession(local(), NOW)!;
    expect(a.plan).toHaveLength(4);
    expect(a.plan.map((s) => s.lastSetOfExercise)).toEqual([false, true, false, true]);
    expect(a.plan.map((s) => s.lastSetOfSession)).toEqual([false, false, false, true]);
    expect(a.plan[0].target).toMatchObject({
      exerciseId: 'bb_bench_press',
      recommendedWeight: 40,
      recommendedReps: 8,
      repBandHi: 10,
      blockId: 'b1',
    });
  });

  it('a bodyweight step keeps its null load rather than becoming a zero', () => {
    const a = adoptWatchSession(local({ steps: [step({ targetWeight: null })], currentIndex: 0 }), NOW)!;
    expect(a.plan[0].target.recommendedWeight).toBeNull();
  });

  it.each([
    ['active_set', 'SET_PRESENTED'],
    ['rest_inter', 'REST_INTER'],
    ['rest_transition', 'REST_TRANSITION'],
  ])('puts the machine in the phase the wrist is in (%s)', (wrist, machine) => {
    const a = adoptWatchSession(local({ phase: wrist, restEndsAt: new Date(NOW + 60_000).toISOString(), restTotalS: 90 }), NOW)!;
    expect(a.machine.phase).toBe(machine);
    expect(a.machine.setIndex).toBe(1);
    expect(a.machine.isLastSetOfSession).toBe(false);
  });

  it('a pause restores the exact phase it froze', () => {
    const a = adoptWatchSession(local({ phase: 'paused', pausedFrom: 'rest_inter' }), NOW)!;
    expect(a.machine.phase).toBe('PAUSED');
    expect(a.machine.resumePhase).toBe('REST_INTER');
  });

  it('⛔ declines a pause that does not say what it froze — Resume would lead nowhere', () => {
    expect(adoptWatchSession(local({ phase: 'paused' }), NOW)).toBeNull();
    expect(adoptWatchSession(local({ phase: 'paused', pausedFrom: 'paused' }), NOW)).toBeNull();
  });

  it('⛔ takes the rest from the absolute instant, and never returns a negative', () => {
    const running = adoptWatchSession(
      local({ phase: 'rest_inter', restEndsAt: new Date(NOW + 45_000).toISOString(), restTotalS: 90 }),
      NOW,
    )!;
    expect(running.restRemainingS).toBe(45);
    // …and the start is derived BACKWARDS from the end and the prescription, so the ring drawn on
    // the phone has the same denominator the wrist was drawing: ends in 45 s, was 90 s long.
    expect(running.restStartedAtMs).toBe(NOW + 45_000 - 90_000);

    const expired = adoptWatchSession(
      local({ phase: 'rest_inter', restEndsAt: new Date(NOW - 30_000).toISOString(), restTotalS: 90 }),
      NOW,
    )!;
    expect(expired.restRemainingS).toBe(0);
  });

  it('carries no rest at all when she is not resting', () => {
    const a = adoptWatchSession(local(), NOW)!;
    expect(a.restRemainingS).toBeNull();
    expect(a.restStartedAtMs).toBeNull();
  });

  it('knows when she is standing on the last set of the workout', () => {
    const a = adoptWatchSession(local({ currentIndex: 3 }), NOW)!;
    expect(a.machine.isLastSetOfSession).toBe(true);
  });

  it('declines a state the phone could not stand in', () => {
    expect(adoptWatchSession(local({ steps: [] }), NOW)).toBeNull();
    expect(adoptWatchSession(local({ currentIndex: 9 }), NOW)).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * MAY WE ADOPT? — the half that can hurt her.
 *
 * Getting this wrong means either overwriting a workout she is doing on the PHONE, or resurrecting
 * one that is already finished and saved. Both are worse than never building the handover at all.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('decideAdoption', () => {
  const ID = 'watch_rec-1';

  it('takes it when the phone is idle and has never seen it', () => {
    expect(
      decideAdoption({ liveSessionId: null, liveSessionActive: false, historyIds: [], offeredId: ID }),
    ).toBe('proceed');
  });

  it('⛔ never overwrites a DIFFERENT session that is live on the phone', () => {
    expect(
      decideAdoption({ liveSessionId: 'phone_123', liveSessionActive: true, historyIds: [], offeredId: ID }),
    ).toBe('refused');
  });

  it('⛔ calls a restated offer of the session it already holds a DUPLICATE, not a refusal', () => {
    /*
     * The wrist re-offers on every reconnect, which is correct of it. Answering "refused" would be
     * true of nothing and would read in the dataset as a handover that failed — on the one event
     * that tells us whether this feature works in the field.
     */
    expect(
      decideAdoption({ liveSessionId: ID, liveSessionActive: true, historyIds: [], offeredId: ID }),
    ).toBe('duplicate');
  });

  it('⛔ never resurrects a workout that has already come home and been saved', () => {
    expect(
      decideAdoption({ liveSessionId: null, liveSessionActive: false, historyIds: ['x', ID], offeredId: ID }),
    ).toBe('duplicate');
  });

  it('the live check outranks the history check — a live session is answered without a read', () => {
    // Same inputs, but live: the answer must come from the session, not from history.
    expect(
      decideAdoption({ liveSessionId: ID, liveSessionActive: true, historyIds: [ID], offeredId: ID }),
    ).toBe('duplicate');
  });
});
