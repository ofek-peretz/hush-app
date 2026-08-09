/**
 * Standalone watch track — the phone-side halves of the two new sync surfaces:
 *
 *  1. Plan snapshot (phone → watch): the model's prescriptions for the week's
 *     remaining workouts, fully resolved so the watch can execute one offline.
 *  2. Session record reconciliation (watch → phone): a watch-executed workout
 *     becomes a first-class completed session — idempotently, with a durable ack.
 *
 * The watch-side executor is Swift (LocalWorkoutEngine, device-verified); these
 * tests pin the CONTRACTS both sides rely on.
 */
// @ts-nocheck

// 

import { buildWatchPlanSnapshot } from '@/platform/watch/watchPlan';
import {
  applyWatchCardioRecord,
  applyWatchSessionRecord,
  cardioRecordToActivity,
  watchRecordToSession,
  watchSessionId,
  type WatchReconcileDeps,
} from '@/platform/watch/watchReconcile';
import {
  isCardioRecordPayload,
  parseCardioRecord,
  parseSessionRecord,
  WATCH_PROTOCOL_VERSION,
} from '@/platform/watch/protocol';
import { WATCH_EVENTS } from '@/platform/events';
import { cardioPerformed } from '@/domain/cardio';
import { progressAggregate } from '@/domain/progressAggregate';
import type { ProgramDay, Session, SetTarget } from '@/data/local/models';
import { EXERCISES } from '@/data/exercises';

const NOW = Date.parse('2026-07-04T10:00:00.000Z');

// Real catalog exercises so name/equipment resolution is exercised end-to-end.
const EX_A = EXERCISES[0];
const EX_B = EXERCISES[1];

function day(id: string, over: Partial<ProgramDay> = {}): ProgramDay {
  return {
    id,
    name: `Workout ${id}`,
    muscleGroups: ['Chest', 'Back'],
    isRest: false,
    slots: [
      { capability: EX_A.capability, exerciseId: EX_A.id, setCount: 2 },
      { capability: EX_B.capability, exerciseId: EX_B.id, setCount: 1 },
    ],
    ...over,
  };
}

function targets(dayId: string): SetTarget[] {
  return [
    { exerciseId: EX_A.id, setIndex: 0, recommendedWeight: 40, recommendedReps: 8, reasonType: 'increase', reasonDelta: 2.5, blockId: `${dayId}_b1` },
    { exerciseId: EX_A.id, setIndex: 1, recommendedWeight: 40, recommendedReps: 8 },
    { exerciseId: EX_B.id, setIndex: 0, recommendedWeight: null, recommendedReps: 10 },
  ];
}

function snapshot(days: ProgramDay[] = [day('d1'), day('d2')]) {
  return buildWatchPlanSnapshot({
    days,
    targetsByDay: Object.fromEntries(days.map((d) => [d.id, targets(d.id)])),
    nowMs: NOW,
    restInterS: 90,
    restTransitionS: 120,
  });
}

describe('buildWatchPlanSnapshot', () => {
  it('prescribes every remaining workout fully (steps resolved, ordered, counted)', () => {
    const plan = snapshot();
    expect(plan).not.toBeNull();
    expect(plan!.workouts.map((w) => w.id)).toEqual(['d1', 'd2']);
    const w = plan!.workouts[0];
    expect(w.steps).toHaveLength(3); // 2 + 1 sets
    expect(w.steps.map((s) => s.globalIndex)).toEqual([0, 1, 2]);
    // Names + groups resolved from the catalog — the watch has no catalog.
    expect(w.steps[0].exerciseName).toBe(EX_A.name);
    expect(w.steps[0].exerciseGroup).toBe(EX_A.muscle);
    // Prescriptions verbatim, advisory delta included, blockId carried through.
    expect(w.steps[0]).toMatchObject({
      targetWeight: 40, targetReps: 8, reasonType: 'increase', reasonDelta: 2.5, blockId: 'd1_b1',
    });
    // Rests ride the snapshot so the watch runs the same rests the phone would.
    expect(plan!.restInterS).toBe(90);
    expect(plan!.restTransitionS).toBe(120);
  });

  it('excludes rest + completed days, and is null when nothing remains', () => {
    const plan = snapshot([
      day('d1', { completed: true }),
      day('r', { isRest: true, slots: [] }),
      day('d3'),
    ]);
    expect(plan!.workouts.map((w) => w.id)).toEqual(['d3']);
    expect(snapshot([day('d1', { completed: true })])).toBeNull();
  });

  it('skips a day with no targets (partial snapshot beats none)', () => {
    const plan = buildWatchPlanSnapshot({
      days: [day('d1'), day('d2')],
      targetsByDay: { d1: targets('d1') }, // d2's targets failed to resolve
      nowMs: NOW,
      restInterS: 90,
      restTransitionS: 120,
    });
    expect(plan!.workouts.map((w) => w.id)).toEqual(['d1']);
  });

  it('planId is stable for identical content and changes with it', () => {
    const a = snapshot()!;
    const b = snapshot()!;
    expect(a.planId).toBe(b.planId);
    const c = snapshot([day('d1', { name: 'Renamed' }), day('d2')])!;
    expect(c.planId).not.toBe(a.planId);
  });

  it('per-step tier rest rides each step; plan-level values remain the stale-build fallback (S2)', () => {
    const plan = buildWatchPlanSnapshot({
      days: [day('d1')],
      targetsByDay: { d1: targets('d1') },
      nowMs: NOW,
      restInterS: 90,
      restTransitionS: 120,
      restInterSFor: (id) => (id === EX_A.id ? 150 : 75),
    });
    const steps = plan!.workouts[0].steps;
    expect(steps[0].restInterS).toBe(150); // EX_A
    expect(steps[2].restInterS).toBe(75); // EX_B
    expect(plan!.restInterS).toBe(90); // fallback untouched
  });
});

// ---- Reconciliation ---------------------------------------------------------

function record(over: Record<string, unknown> = {}) {
  return {
    v: WATCH_PROTOCOL_VERSION,
    type: 'session_record',
    recordId: 'r-123',
    planId: 'plan_x',
    workoutId: 'd1',
    workoutName: 'Workout d1',
    startedAt: new Date(NOW - 30 * 60_000).toISOString(),
    endedAt: new Date(NOW).toISOString(),
    earlyFinish: false,
    sets: [
      {
        exerciseId: EX_A.id, setIndex: 0, blockId: 'd1_b1',
        recommendedWeight: 40, recommendedReps: 8,
        actualWeight: 42.5, actualReps: 7,
        completedAt: new Date(NOW - 20 * 60_000).toISOString(),
      },
      {
        exerciseId: EX_B.id, setIndex: 0,
        recommendedWeight: null, recommendedReps: 10,
        actualWeight: null, actualReps: 10,
        completedAt: new Date(NOW - 10 * 60_000).toISOString(),
      },
    ],
    ...over,
  };
}

describe('parseSessionRecord', () => {
  it('accepts a valid record (object or JSON string)', () => {
    expect(parseSessionRecord(record())?.recordId).toBe('r-123');
    expect(parseSessionRecord(JSON.stringify(record()))?.recordId).toBe('r-123');
  });

  it('rejects wrong version/type/shape without throwing', () => {
    expect(parseSessionRecord(null)).toBeNull();
    expect(parseSessionRecord('not json {')).toBeNull();
    expect(parseSessionRecord(record({ v: 99 }))).toBeNull();
    expect(parseSessionRecord(record({ type: 'other' }))).toBeNull();
    expect(parseSessionRecord(record({ recordId: '' }))).toBeNull();
    expect(parseSessionRecord(record({ sets: [{ exerciseId: 1 }] }))).toBeNull();
  });
});

describe('watchRecordToSession', () => {
  it('materializes a Session indistinguishable from a phone-run one', () => {
    const s = watchRecordToSession(parseSessionRecord(record())!);
    expect(s.id).toBe(watchSessionId('r-123'));
    expect(s.state).toBe('SAVED');
    expect(s.programDayId).toBe('d1');
    expect(s.programDayName).toBe('Workout d1');
    expect(s.sets).toHaveLength(2);
    // Edited derived from actual-vs-recommended (the watch reports both).
    expect(s.sets[0].edited).toBe(true);
    expect(s.sets[1].edited).toBe(false);
    expect(s.sets[0].blockId).toBe('d1_b1');
  });

  it('annotates an early finish (owner voice parity with finalize)', () => {
    const s = watchRecordToSession(parseSessionRecord(record({ earlyFinish: true }))!);
    expect(s.earlyFinish).toBe(true);
    expect(s.annotation).toBe('ended_early');
  });
});

function reconcileHarness(history: Session[] = []) {
  const appended: Session[] = [];
  const acked: string[] = [];
  const events: { type: string; data?: Record<string, unknown> }[] = [];
  const modelCalls: unknown[] = [];
  const queued: unknown[] = [];
  const doneDays: string[] = [];
  let modeAdvances = 0;
  let modelFails: unknown = null;

  const deps: WatchReconcileDeps = {
    loadHistory: async () => [...history, ...appended],
    appendCompletedSession: async (s) => void appended.push(s),
    recordSessionCompleted: async () => {
      modeAdvances += 1;
      return { unlockedPortrait: false };
    },
    markWorkoutCompleted: async (id) => void doneDays.push(id),
    recordToModel: async (args) => {
      if (modelFails) throw modelFails;
      modelCalls.push(args);
    },
    enqueuePendingSync: async (args) => void queued.push(args),
    track: (type, data) => void events.push({ type, data }),
    ack: (id) => void acked.push(id),
  };
  return {
    deps, appended, acked, events, modelCalls, queued, doneDays,
    get modeAdvances() { return modeAdvances; },
    failModel: (e: unknown) => { modelFails = e; },
    outcomes: () =>
      events.filter((e) => e.type === WATCH_EVENTS.recordReceived).map((e) => e.data?.outcome),
  };
}

describe('applyWatchSessionRecord', () => {
  it('applies a record end-to-end: history + mode + week DONE + model sync + ack', async () => {
    const h = reconcileHarness();
    await applyWatchSessionRecord(record(), h.deps);
    expect(h.appended).toHaveLength(1);
    expect(h.modeAdvances).toBe(1);
    expect(h.doneDays).toEqual(['d1']);
    expect(h.modelCalls).toHaveLength(1);
    expect(h.acked).toEqual(['r-123']);
    expect(h.outcomes()).toEqual(['applied']);
  });

  it('is idempotent: a replay is acked but applied nowhere', async () => {
    const h = reconcileHarness();
    await applyWatchSessionRecord(record(), h.deps);
    await applyWatchSessionRecord(record(), h.deps);
    expect(h.appended).toHaveLength(1);
    expect(h.modeAdvances).toBe(1);
    expect(h.doneDays).toEqual(['d1']);
    expect(h.acked).toEqual(['r-123', 'r-123']); // both deliveries acked
    expect(h.outcomes()).toEqual(['applied', 'duplicate']);
  });

  it('queues the model sync offline and still acks (completion never depends on the backend)', async () => {
    const h = reconcileHarness();
    h.failModel(new Error('offline'));
    await applyWatchSessionRecord(record(), h.deps);
    expect(h.appended).toHaveLength(1);
    expect(h.queued).toHaveLength(1);
    expect(h.acked).toEqual(['r-123']);
    expect(h.outcomes()).toEqual(['applied']);
  });

  it('acks but never saves an empty record (not-started rule)', async () => {
    const h = reconcileHarness();
    await applyWatchSessionRecord(record({ sets: [] }), h.deps);
    expect(h.appended).toHaveLength(0);
    expect(h.modeAdvances).toBe(0);
    expect(h.acked).toEqual(['r-123']);
    expect(h.outcomes()).toEqual(['rejected']);
  });

  it('never acks an unreadable payload (nothing to ack) and never throws', async () => {
    const h = reconcileHarness();
    await applyWatchSessionRecord('garbage', h.deps);
    await applyWatchSessionRecord(record({ v: 99 }), h.deps);
    expect(h.acked).toEqual([]);
    expect(h.appended).toHaveLength(0);
    expect(h.outcomes()).toEqual(['rejected', 'rejected']);
  });

  it('does not ack when persistence fails mid-apply (the watch re-delivers safely)', async () => {
    const h = reconcileHarness();
    h.deps.appendCompletedSession = async () => {
      throw new Error('disk');
    };
    await applyWatchSessionRecord(record(), h.deps);
    expect(h.acked).toEqual([]);
    expect(h.outcomes()).toEqual(['rejected']);
  });
});

// ═══════════════════ THE WRIST'S RUN, CARRIED HOME (founder 2026-07-28) ═══════════════════
//
// A run recorded on the wrist used to write its HKWorkout to Health and stop there, so the
// kilometres appeared in Apple Health and NOWHERE in Hush — not her Log, not her Progress
// distance, not her lifetime burn. She had done the work and her own app did not know it.
//
// It now rides the SAME durable path as a standalone strength record: one channel, told apart by
// the `type` inside the payload, at-least-once delivery, idempotent apply, durable ack.

const CARDIO = {
  v: 1 as const,
  type: 'cardio_record' as const,
  recordId: 'c-1',
  gait: 'run' as const,
  startedAt: '2026-07-28T06:00:00.000Z',
  endedAt: '2026-07-28T06:26:14.000Z',
  durationSec: 1574,
  distanceKm: 4.2,
  kcal: 318,
};

describe('parseCardioRecord — the wrist may send junk; the phone may not throw', () => {
  it('accepts a valid record, as an object or as the JSON string the transport delivers', () => {
    expect(parseCardioRecord(CARDIO)).toEqual(CARDIO);
    expect(parseCardioRecord(JSON.stringify(CARDIO))).toEqual(CARDIO);
  });

  it('rejects what it cannot trust, and never throws doing it', () => {
    for (const bad of [
      null, undefined, 42, 'not json', {},
      { ...CARDIO, v: 99 }, // a future protocol
      { ...CARDIO, type: 'session_record' }, // the other kind
      { ...CARDIO, recordId: '' }, // no identity ⇒ no idempotency
      { ...CARDIO, gait: 'swim' }, // not a gait Hush records
      { ...CARDIO, durationSec: 0 }, // a tap, not an activity
      { ...CARDIO, durationSec: undefined },
    ]) {
      expect(() => parseCardioRecord(bad)).not.toThrow();
      expect(parseCardioRecord(bad)).toBeNull();
    }
  });

  it('drops a measurement it cannot read rather than coercing it to zero', () => {
    // "0 km" and "we could not read the distance" are different claims about her run.
    const r = parseCardioRecord({ ...CARDIO, distanceKm: Number.NaN, kcal: -5 });
    expect(r).not.toBeNull();
    expect(r).not.toHaveProperty('distanceKm');
    expect(r).not.toHaveProperty('kcal');
  });
});

describe('cardioRecordToActivity — only what the wrist honestly measured', () => {
  it('derives pace instead of carrying it, so the two surfaces cannot disagree', () => {
    const a = cardioRecordToActivity(CARDIO);
    expect(a.avgPaceSec).toBe(Math.round(1574 / 4.2));
    expect(a.durationSec).toBe(1574);
    expect(a.calories).toBe(318);
  });

  it('no distance ⇒ no pace, never a division by zero dressed as a number', () => {
    const a = cardioRecordToActivity({ ...CARDIO, distanceKm: undefined });
    expect(a.distanceKm).toBe(0);
    expect(a.avgPaceSec).toBe(0);
  });

  it('carries no route and no splits — the wrist has neither, and a drawn line she never ran is a lie', () => {
    const a = cardioRecordToActivity(CARDIO);
    expect(a.splits).toEqual([]);
    expect(a.route).toBeUndefined();
  });

  it('the id is the same watch_<recordId> shape the strength side uses', () => {
    expect(cardioRecordToActivity(CARDIO).id).toBe('watch_c-1');
  });
});

describe('applyWatchCardioRecord — the three rules the strength reconciler follows', () => {
  const deps = (existing: { id: string }[] = []) => {
    const appended: unknown[] = [];
    const acked: string[] = [];
    const events: { type: string; data?: Record<string, unknown> }[] = [];
    return {
      appended, acked, events,
      d: {
        loadCardio: async () => existing,
        appendCardioActivity: async (a: unknown) => void appended.push(a),
        ack: (id: string) => void acked.push(id),
        track: (type: string, data?: Record<string, unknown>) => void events.push({ type, data }),
      },
    };
  };

  it('saves the activity and acks it', async () => {
    const t = deps();
    await applyWatchCardioRecord(CARDIO, t.d);
    expect(t.appended).toHaveLength(1);
    expect(t.acked).toEqual(['c-1']);
  });

  it('a REPLAY saves nothing and still acks — at-least-once delivery makes replays certain', async () => {
    const t = deps([{ id: 'watch_c-1' }]);
    await applyWatchCardioRecord(CARDIO, t.d);
    expect(t.appended).toHaveLength(0);
    expect(t.acked).toEqual(['c-1']); // the ack is what clears the wrist's outbox
    expect(t.events.some((e) => e.data?.outcome === 'duplicate')).toBe(true);
  });

  it('an UNREADABLE payload is not acked — there is no id to ack', async () => {
    const t = deps();
    await applyWatchCardioRecord({ nonsense: true }, t.d);
    expect(t.appended).toHaveLength(0);
    expect(t.acked).toEqual([]);
  });

  it('a failure to PERSIST is not acked, so the wrist re-delivers', async () => {
    const t = deps();
    await applyWatchCardioRecord(CARDIO, {
      ...t.d,
      appendCardioActivity: async () => { throw new Error('disk full'); },
    });
    expect(t.acked).toEqual([]);
    expect(t.events.some((e) => e.data?.reason === 'apply_failed')).toBe(true);
  });

  it('never throws, whatever it is handed', async () => {
    const t = deps();
    for (const bad of [null, 'x', 7, {}, { type: 'cardio_record' }]) {
      await expect(applyWatchCardioRecord(bad, t.d)).resolves.toBeUndefined();
    }
  });
});

describe('one channel, two record types — the receiver tells them apart before parsing', () => {
  it('recognises a cardio payload as an object and as the transport\'s JSON string', () => {
    expect(isCardioRecordPayload(CARDIO)).toBe(true);
    expect(isCardioRecordPayload(JSON.stringify(CARDIO))).toBe(true);
  });

  it('a strength record is NOT cardio — misrouting one would ack it against the wrong queue', () => {
    expect(isCardioRecordPayload({ v: 1, type: 'session_record', recordId: 's1' })).toBe(false);
    expect(isCardioRecordPayload(null)).toBe(false);
    expect(isCardioRecordPayload('not json')).toBe(false);
  });

  it('a MALFORMED cardio payload is still routed to cardio, and rejected there', () => {
    // The alternative — falling through to the session reconciler — would ack a cardio record
    // against the strength queue and lose the run for good.
    const broken = { ...CARDIO, durationSec: 0 };
    expect(isCardioRecordPayload(broken)).toBe(true);
    expect(parseCardioRecord(broken)).toBeNull();
  });
});

describe('the last mile — a reconciled wrist run actually SURFACES', () => {
  // Reconciling into `db` is only half the promise. The kilometres have to reach the surfaces she
  // looks at, and the wrist's activity has a SHAPE the phone's never has: no route, no splits, and
  // possibly no heart rate. Every one of those is a place a display could quietly drop it.
  const activity = () => cardioRecordToActivity(CARDIO);

  it('counts as PERFORMED, so the Log lists it (it has duration even with no GPS)', () => {
    const a = activity();
    expect(cardioPerformed(a.durationSec, a.distanceKm)).toBe(true);
  });

  it('its kilometres and calories reach the all-time aggregate Progress draws', () => {
    const agg = progressAggregate([], [activity()], '2026-07-01T00:00:00.000Z', 70, Date.parse('2026-07-28T12:00:00Z'));
    expect(agg.cardioKm).toBe(4.2);
    expect(agg.kcal).toBe(318);
  });

  it('an indoor run — no distance at all — still lands, and claims no kilometres it did not cover', () => {
    const indoor = cardioRecordToActivity({ ...CARDIO, distanceKm: undefined });
    expect(cardioPerformed(indoor.durationSec, indoor.distanceKm)).toBe(true); // duration carries it
    const agg = progressAggregate([], [indoor], '2026-07-01T00:00:00.000Z', 70, Date.parse('2026-07-28T12:00:00Z'));
    expect(agg.cardioKm).toBe(0);
  });
});
