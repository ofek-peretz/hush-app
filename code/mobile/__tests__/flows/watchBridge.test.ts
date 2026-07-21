/**
 * Apple Watch bridge lifecycle + intent handling, driven by a FAKE transport so
 * the whole authority/telemetry path is exercised without a watchOS target or any
 * Apple hardware.
 */
import { WatchSession, type WatchTransport } from '@/platform/watch/watchBridge';
import { WATCH_EVENTS } from '@/platform/events';
import type { SessionEvent } from '@/state/machines/sessionState';
import type { SessionMirror } from '@/platform/sessionMirror';
import { WATCH_PROTOCOL_VERSION } from '@/platform/watch/protocol';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

function activeMirror(over: Partial<SessionMirror> = {}): SessionMirror {
  return {
    schema: 1, phase: 'active_set', exerciseName: 'Bench', setLabel: 'Set 1 of 3',
    globalIndex: 0, totalSets: 3, targetWeight: 60, targetReps: 5,
    restEndsAt: null, restRemainingS: null, nextExerciseName: null,
    nextTargetWeight: null, nextTargetReps: null, completedExerciseName: null,
    canMarkBusy: false, loadDeltaKg: 0, nextLoadDeltaKg: 0, liftIndex: 1, liftCount: 3,
    workoutName: 'Upper A', summary: null, swapOptions: [], nextSwapOptions: [], ...over,
  };
}

function harness() {
  let reachable = false;
  let intentCb: ((raw: unknown) => void) | undefined;
  let reachCb: ((r: boolean) => void) | undefined;
  const sent: unknown[] = [];
  const events: { type: string; data?: Record<string, unknown> }[] = [];
  const dispatched: SessionEvent[] = [];
  const busy: number[] = [];
  const completed: (number | undefined)[] = [];
  const completedWeights: (number | null | undefined)[] = [];

  const acked: string[] = [];
  const transport: WatchTransport = {
    isReachable: () => reachable,
    sendState: (env) => void sent.push(env),
    onIntent: (cb) => { intentCb = cb; return () => { intentCb = undefined; }; },
    onReachabilityChange: (cb) => { reachCb = cb; return () => { reachCb = undefined; }; },
    onSessionRecord: () => () => {},
    ackRecord: (id) => void acked.push(id),
  };

  const selected: (string | undefined)[] = [];
  const startedWorkouts: (string | undefined)[] = [];
  const swapped: (string | undefined)[] = [];
  const restAdded: number[] = [];

  const session = new WatchSession({
    transport,
    now: () => NOW,
    track: (type, data) => void events.push({ type, data }),
    completeSet: (reps, weight) => { completed.push(reps); completedWeights.push(weight); },
    dispatch: (e) => void dispatched.push(e),
    markEquipmentOccupied: () => void busy.push(1),
    selectWorkout: (id) => void selected.push(id),
    startWorkout: (id) => void startedWorkouts.push(id),
    swapExercise: (id) => void swapped.push(id),
    addRest: (s) => void restAdded.push(s),
  });

  return {
    session, sent, events, dispatched, busy, completed, completedWeights, selected, startedWorkouts, swapped, restAdded,
    types: () => events.map((e) => e.type),
    emitIntent: (raw: unknown) => intentCb?.(raw),
    setReachable: (r: boolean) => { reachable = r; reachCb?.(r); },
    setInitialReachable: (r: boolean) => { reachable = r; },
  };
}

function intent(over: Record<string, unknown> = {}) {
  return { v: WATCH_PROTOCOL_VERSION, type: 'complete_set', intentId: 'i1', issuedAt: new Date(NOW - 100).toISOString(), expectedGlobalIndex: 0, ...over };
}

describe('WatchSession lifecycle', () => {
  it('begins on first publish and pushes a state envelope', () => {
    const h = harness();
    h.session.publish(activeMirror());
    expect(h.types()).toContain(WATCH_EVENTS.sessionStarted);
    expect(h.types()).toContain(WATCH_EVENTS.statePublished);
    expect(h.sent).toHaveLength(1);
  });

  it('emits connected on begin when already reachable', () => {
    const h = harness();
    h.setInitialReachable(true);
    h.session.publish(activeMirror());
    expect(h.types()).toContain(WATCH_EVENTS.connected);
  });

  it('tracks disconnect then reconnect (not a second "connected")', () => {
    const h = harness();
    h.session.publish(activeMirror());
    h.setReachable(false); // already false → no-op
    h.setReachable(true);
    h.setReachable(false);
    h.setReachable(true);
    expect(h.types()).toContain(WATCH_EVENTS.disconnected);
    expect(h.types()).toContain(WATCH_EVENTS.reconnected);
  });

  it('ends the session on a complete or null mirror', () => {
    const h1 = harness();
    h1.session.publish(activeMirror());
    h1.session.publish(activeMirror({ phase: 'complete' }));
    expect(h1.types()).toContain(WATCH_EVENTS.sessionEnded);

    const h2 = harness();
    h2.session.publish(activeMirror());
    h2.session.publish(null);
    expect(h2.types()).toContain(WATCH_EVENTS.sessionEnded);
  });
});

describe('WatchSession intent handling (phone authority)', () => {
  it('accepts a plain complete_set → completes with target reps + records latency', () => {
    const h = harness();
    h.session.publish(activeMirror());
    h.emitIntent(intent());
    expect(h.completed).toEqual([undefined]); // no adjusted reps = target reps
    expect(h.dispatched).toHaveLength(0);
    const received = h.events.find((e) => e.type === WATCH_EVENTS.actionReceived);
    expect(received?.data).toMatchObject({ action: 'complete_set', adjusted: false, latencyMs: 100 });
  });

  it('completes with adjusted actual reps (the Edit Result reps)', () => {
    const h = harness();
    h.session.publish(activeMirror({ targetReps: 8 }));
    h.emitIntent(intent({ actualReps: 6, intentId: 'r1' }));
    expect(h.completed).toEqual([6]);
    const received = h.events.find((e) => e.type === WATCH_EVENTS.actionReceived);
    expect(received?.data).toMatchObject({ action: 'complete_set', adjusted: true });
  });

  it('completes with adjusted actual weight from the watch Edit Result', () => {
    const h = harness();
    h.session.publish(activeMirror({ targetWeight: 60 }));
    h.emitIntent(intent({ actualWeight: 62.5, intentId: 'w1' }));
    expect(h.completedWeights).toEqual([62.5]);
    const received = h.events.find((e) => e.type === WATCH_EVENTS.actionReceived);
    expect(received?.data).toMatchObject({ action: 'complete_set', adjusted: true });
  });

  it('routes exercise_busy to the equipment-occupied reorder (not a completion)', () => {
    const h = harness();
    h.session.publish(activeMirror({ canMarkBusy: true }));
    h.emitIntent(intent({ type: 'exercise_busy', intentId: 'b1' }));
    expect(h.busy).toHaveLength(1);
    expect(h.completed).toHaveLength(0);
    const received = h.events.find((e) => e.type === WATCH_EVENTS.actionReceived);
    expect(received?.data).toMatchObject({ action: 'mark_equipment_occupied' });
  });

  it('ignores a duplicate replay (idempotency) without re-acting', () => {
    const h = harness();
    h.session.publish(activeMirror());
    h.emitIntent(intent());
    h.emitIntent(intent()); // same intentId
    expect(h.completed).toHaveLength(1);
    expect(h.events.some((e) => e.type === WATCH_EVENTS.actionIgnored && e.data?.reason === 'duplicate')).toBe(true);
  });

  it('S-48 · ignores a phase-mismatched intent — watch and phone disagree, the phone is the authority', () => {
    const h = harness();
    h.session.publish(activeMirror({ phase: 'rest_inter' }));
    h.emitIntent(intent()); // complete_set during rest
    expect(h.completed).toHaveLength(0);
    expect(h.events.some((e) => e.type === WATCH_EVENTS.actionIgnored && e.data?.reason === 'phase_mismatch')).toBe(true);
  });
});

describe('WatchSession lobby (Start screen)', () => {
  it('publishes a null-mirror lobby envelope and stays subscribed for proposals', () => {
    const h = harness();
    h.session.publishLobby({
      workoutId: 'w1', workoutName: 'Upper A', muscles: 'Chest', resting: false,
      workouts: [{ id: 'w1', name: 'Upper A' }, { id: 'w2', name: 'Lower A' }],
    });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ mirror: null, lobby: { workoutName: 'Upper A' } });

    // A Start-screen proposal arriving while idle is routed to the phone.
    h.emitIntent({ v: WATCH_PROTOCOL_VERSION, type: 'select_workout', intentId: 's1', issuedAt: new Date(NOW - 50).toISOString(), workoutId: 'w2' });
    expect(h.selected).toEqual(['w2']);

    h.emitIntent({ v: WATCH_PROTOCOL_VERSION, type: 'start_workout', intentId: 's2', issuedAt: new Date(NOW - 50).toISOString(), workoutId: 'w2' });
    expect(h.startedWorkouts).toEqual(['w2']);
  });

  it('rejects an in-workout intent while in the lobby (no active session)', () => {
    const h = harness();
    h.session.publishLobby({ workoutId: 'w1', workoutName: 'Upper A', muscles: '', workouts: [] });
    h.emitIntent(intent()); // complete_set with no session
    expect(h.completed).toHaveLength(0);
    expect(h.events.some((e) => e.type === WATCH_EVENTS.actionIgnored && e.data?.reason === 'no_session')).toBe(true);
  });
});

describe('WatchSession swap + add_rest (in-workout)', () => {
  it('routes swap_exercise on Active Set to the phone swap', () => {
    const h = harness();
    h.session.publish(activeMirror());
    h.emitIntent({ v: WATCH_PROTOCOL_VERSION, type: 'swap_exercise', intentId: 'sw1', issuedAt: new Date(NOW - 50).toISOString(), exerciseId: 'lat_pulldown' });
    expect(h.swapped).toEqual(['lat_pulldown']);
  });

  it('routes add_rest during rest (default +15s)', () => {
    const h = harness();
    h.session.publish(activeMirror({ phase: 'rest_inter' }));
    h.emitIntent({ v: WATCH_PROTOCOL_VERSION, type: 'add_rest', intentId: 'ar1', issuedAt: new Date(NOW - 50).toISOString() });
    expect(h.restAdded).toEqual([15]);
  });

  it('rejects add_rest outside a rest (phase mismatch)', () => {
    const h = harness();
    h.session.publish(activeMirror()); // active_set
    h.emitIntent({ v: WATCH_PROTOCOL_VERSION, type: 'add_rest', intentId: 'ar2', issuedAt: new Date(NOW - 50).toISOString() });
    expect(h.restAdded).toHaveLength(0);
    expect(h.events.some((e) => e.type === WATCH_EVENTS.actionIgnored && e.data?.reason === 'phase_mismatch')).toBe(true);
  });
});
