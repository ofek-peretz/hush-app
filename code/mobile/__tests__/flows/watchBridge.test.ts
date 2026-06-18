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
    canMarkBusy: false, ...over,
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

  const transport: WatchTransport = {
    isReachable: () => reachable,
    sendState: (env) => void sent.push(env),
    onIntent: (cb) => { intentCb = cb; return () => { intentCb = undefined; }; },
    onReachabilityChange: (cb) => { reachCb = cb; return () => { reachCb = undefined; }; },
  };

  const session = new WatchSession({
    transport,
    now: () => NOW,
    track: (type, data) => void events.push({ type, data }),
    completeSet: (reps) => void completed.push(reps),
    dispatch: (e) => void dispatched.push(e),
    markEquipmentOccupied: () => void busy.push(1),
  });

  return {
    session, sent, events, dispatched, busy, completed,
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
    expect(received?.data).toMatchObject({ action: 'complete_set', repsAdjusted: false, latencyMs: 100 });
  });

  it('completes with adjusted actual reps (the Couldn\'t Complete result)', () => {
    const h = harness();
    h.session.publish(activeMirror({ targetReps: 8 }));
    h.emitIntent(intent({ actualReps: 6, intentId: 'r1' }));
    expect(h.completed).toEqual([6]);
    const received = h.events.find((e) => e.type === WATCH_EVENTS.actionReceived);
    expect(received?.data).toMatchObject({ action: 'complete_set', repsAdjusted: true });
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

  it('ignores a phase-mismatched intent (the phone is the authority)', () => {
    const h = harness();
    h.session.publish(activeMirror({ phase: 'rest_inter' }));
    h.emitIntent(intent()); // complete_set during rest
    expect(h.completed).toHaveLength(0);
    expect(h.events.some((e) => e.type === WATCH_EVENTS.actionIgnored && e.data?.reason === 'phase_mismatch')).toBe(true);
  });
});
