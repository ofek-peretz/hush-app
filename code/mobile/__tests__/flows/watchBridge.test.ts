/**
 * Apple Watch bridge lifecycle + intent handling, driven by a FAKE transport so
 * the whole authority/telemetry path is exercised without a watchOS target or any
 * Apple hardware.
 */
// @ts-nocheck

// 

import { WatchSession, WATCH_SEEN_LIMIT, type WatchTransport } from '@/platform/watch/watchBridge';
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
  } as SessionMirror;
}

function harness() {
  let reachable = false;
  let intentCb: ((raw: unknown) => void) | undefined;
  let reachCb: ((r: boolean) => void) | undefined;
  const sent: unknown[] = [];
  let sendOk = true;
  const events: { type: string; data?: Record<string, unknown> }[] = [];
  const dispatched: SessionEvent[] = [];
  const busy: number[] = [];
  const completed: (number | undefined)[] = [];
  const completedWeights: (number | null | undefined)[] = [];

  const acked: string[] = [];
  const transport: WatchTransport = {
    isReachable: () => reachable,
    sendState: (env) => {
      sent.push(env);
      return sendOk;
    },
    onIntent: (cb) => { intentCb = cb; return () => { intentCb = undefined; }; },
    onReachabilityChange: (cb) => { reachCb = cb; return () => { reachCb = undefined; }; },
    onSessionRecord: () => () => {},
    ackRecord: (id) => void acked.push(id),
  };

  const selected: (string | undefined)[] = [];
  const startedWorkouts: (string | undefined)[] = [];
  const swapped: (string | undefined)[] = [];
  const restAdded: number[] = [];
  const pain: { area?: string; severity?: string }[] = [];
  const offers: unknown[] = [];
  let adoptOutcome: 'adopted' | 'duplicate' | 'refused' | 'throw' = 'adopted';

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
    reportPain: (area, severity) => void pain.push({ area, severity }),
    adoptLocalSession: async (l) => {
      offers.push(l);
      if (adoptOutcome === 'throw') throw new Error('adoption failed');
      return adoptOutcome;
    },
  });

  return {
    session, sent, events, dispatched, busy, completed, completedWeights, selected, startedWorkouts, swapped, restAdded, pain, offers,
    setAdoptOutcome: (o: 'adopted' | 'duplicate' | 'refused' | 'throw') => { adoptOutcome = o; },
    types: () => events.map((e) => e.type),
    emitIntent: (raw: unknown) => intentCb?.(raw),
    setReachable: (r: boolean) => { reachable = r; reachCb?.(r); },
    setInitialReachable: (r: boolean) => { reachable = r; },
    setSendOk: (ok: boolean) => { sendOk = ok; },
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

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * TWO FAILURES THAT ONLY EXIST BETWEEN PROCESSES — and were therefore invisible to every test here.
 *
 * The suite above drives one phone and one wrist inside one Jest run. Both bugs below need a
 * SECOND process — an app that was killed and relaunched, or a message delivered while nothing was
 * listening — which is exactly the seam a single-process fake transport cannot reach. They are
 * written as unit tests anyway because the CONTRACT that fixes each one is a phone-side contract.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the bridge keeps listening between workouts', () => {
  it('⛔ still hears a pain report delivered after the session ended', () => {
    /*
     * `report_pain` rides `transferUserInfo` — the DURABLE channel — precisely so a report made out
     * of range arrives later. The OS delivers it once, with no ack and no redelivery. `end()` used
     * to drop the `onIntent` subscription, and `publish(null)` calls `end()` at the close of every
     * workout, so a report landing in that window was destroyed on arrival by the one side that
     * was supposed to be guarding it.
     */
    const h = harness();
    h.session.publish(activeMirror());
    h.session.publish(null); // the teardown frame — mirroring stops here
    h.emitIntent(intent({ type: 'report_pain', intentId: 'pain-1', area: 'shoulders', severity: 'pain' }));
    expect(h.pain).toEqual([{ area: 'shoulders', severity: 'pain' }]);
  });

  it('a lobby published after a workout still routes the Start screen’s proposals', () => {
    const h = harness();
    h.session.publish(activeMirror());
    h.session.publish(null);
    h.session.publishLobby({ workoutId: 'w2', workoutName: 'Lower A' } as never);
    h.emitIntent(intent({ type: 'start_workout', intentId: 's-1', workoutId: 'w2' }));
    expect(h.startedWorkouts).toEqual(['w2']);
  });
});

describe('the authority sequence names the phone process it counts inside', () => {
  const mk = (nowMs: number) => {
    const sent: Record<string, unknown>[] = [];
    const session = new WatchSession({
      transport: {
        isReachable: () => false,
        sendState: (env) => void sent.push(env as never),
        onIntent: () => () => {},
        onReachabilityChange: () => () => {},
        onSessionRecord: () => () => {},
        ackRecord: () => {},
      },
      now: () => nowMs,
      track: () => {},
      completeSet: () => {},
      dispatch: () => {},
      markEquipmentOccupied: () => {},
    });
    return { session, sent };
  };

  it('every envelope carries the epoch', () => {
    const a = mk(NOW);
    a.session.publish(activeMirror());
    expect(a.sent[0].authorityEpoch).toBe(NOW);
  });

  it('⛔ a relaunched phone restarts the sequence — and says so with a later epoch', () => {
    /*
     * The bug: `authoritySeq` lives in a `WatchSession` built once per JS context, so it restarts at
     * 1 on every app launch, while the wrist's high-water mark lives in the WATCH app's memory and
     * outlives it. iOS reclaims a backgrounded phone app routinely, so an evening session would
     * publish seq 1, 2, 3 … against a wrist holding 300 and be discarded in full — the wrist frozen
     * on the morning until its own process died.
     *
     * The sequence restarting is correct and stays. What the epoch buys is that the wrist can tell
     * "a message from before" (still ignore) from "a phone counting again" (reset and adopt).
     */
    const morning = mk(NOW);
    morning.session.publish(activeMirror());
    morning.session.publish(activeMirror());

    const evening = mk(NOW + 8 * 3600 * 1000); // the app was killed and reopened
    evening.session.publish(activeMirror());

    // The sequence genuinely goes BACKWARDS across the relaunch …
    expect(evening.sent[0].authoritySeq).toBeLessThan(morning.sent[1].authoritySeq);
    // … and the epoch is the only thing that makes that distinguishable from a stale message.
    expect(evening.sent[0].authorityEpoch).toBeGreaterThan(morning.sent[1].authorityEpoch);
  });
});

describe('a reconnect restates the truth', () => {
  it('⛔ republishes the live mirror when the wrist becomes reachable again', () => {
    /*
     * Convergence used to rest entirely on `updateApplicationContext` being last-write-wins, and
     * the native send is a `try?` that throws when the session is not activated or the payload is
     * too large. The comment excusing that drop promised "the bridge re-publishes on next change" —
     * during a rest there may be no next change for two minutes, and for a LOBBY there may be none
     * at all until Home's effect dependencies happen to move.
     */
    const h = harness();
    h.session.publish(activeMirror());
    const before = h.sent.length;
    h.setReachable(true);
    expect(h.sent.length).toBe(before + 1);
    const last = h.sent[h.sent.length - 1] as Record<string, never>;
    expect(last.mirror.phase).toBe('active_set');
    expect(last.authoritySeq).toBeGreaterThan((h.sent[before - 1] as Record<string, never>).authoritySeq);
  });

  it('restates the LOBBY when that is the last thing published', () => {
    const h = harness();
    h.session.publishLobby({ workoutId: 'w9', workoutName: 'Lower A' } as never);
    const before = h.sent.length;
    h.setReachable(true);
    const last = h.sent[h.sent.length - 1] as Record<string, never>;
    expect(h.sent.length).toBe(before + 1);
    expect(last.mirror).toBeNull();
    expect(last.lobby.workoutId).toBe('w9');
  });

  it('marks the restatement as a resync so the dataset can tell it from a real change', () => {
    const h = harness();
    h.session.publish(activeMirror());
    h.setReachable(true);
    const published = h.events.filter((e) => e.data?.resync === true);
    expect(published).toHaveLength(1);
  });
});

describe('the de-dupe memory is bounded', () => {
  it('⛔ forgets the oldest id once the cap is reached, and never grows past it', () => {
    /*
     * The bridge now lives as long as the app does, so a set that is only ever added to is a leak
     * that grows with every tap. Proven by BEHAVIOUR: the first id is accepted again once enough
     * newer ones have pushed it out — which is also the honest statement of what the de-dupe is
     * for, a redelivery seconds later rather than one hours later.
     */
    const h = harness();
    h.session.publishLobby(null);
    const pain = (id: string) =>
      h.emitIntent(intent({ type: 'report_pain', intentId: id, area: 'shoulders', severity: 'twinge' }));

    pain('first');
    expect(h.pain).toHaveLength(1);
    pain('first'); // still remembered → ignored
    expect(h.pain).toHaveLength(1);

    for (let i = 0; i < WATCH_SEEN_LIMIT; i += 1) pain(`p${i}`);
    pain('first'); // pushed out → accepted as new
    expect(h.pain.length).toBeGreaterThan(WATCH_SEEN_LIMIT + 1);
  });
});

describe('the wrist offers a workout it is already running', () => {
  const localFrame = (over = {}) => ({
    v: WATCH_PROTOCOL_VERSION,
    type: 'local_session',
    recordId: 'rec-9',
    workoutId: 'day_2',
    workoutName: 'Lower A',
    startedAt: new Date(NOW - 300_000).toISOString(),
    phase: 'active_set',
    currentIndex: 0,
    steps: [
      {
        exerciseId: 'bb_back_squat',
        exerciseName: 'Back Squat',
        setIndexInExercise: 0,
        totalSetsInExercise: 3,
        globalIndex: 0,
        targetWeight: 60,
        targetReps: 8,
      },
    ],
    sets: [],
    sentAt: new Date(NOW).toISOString(),
    ...over,
  });

  it('⛔ routes the handover to the store, not through the intent gates', () => {
    /*
     * `decideWatchIntent` would throw this away as malformed — it is not an intent and has no
     * intentId. Checking it first is what keeps a whole workout from being logged as noise.
     */
    const h = harness();
    h.session.publishLobby(null);
    h.emitIntent(localFrame());
    expect(h.offers).toHaveLength(1);
    expect(h.offers[0]).toMatchObject({ recordId: 'rec-9', workoutId: 'day_2' });
    // …and it was NOT counted as an ignored intent.
    expect(h.events.filter((e) => e.type === WATCH_EVENTS.actionIgnored)).toHaveLength(0);
  });

  it('telemeters what the store decided', async () => {
    const h = harness();
    h.session.publishLobby(null);
    h.setAdoptOutcome('refused');
    h.emitIntent(localFrame());
    await Promise.resolve();
    const ev = h.events.find((e) => e.type === WATCH_EVENTS.localSessionOffered);
    expect(ev?.data).toMatchObject({ outcome: 'refused', recordId: 'rec-9', workoutId: 'day_2' });
  });

  it('⛔ a refused offer can be accepted when it comes again — the bridge must not remember it', async () => {
    /*
     * The store legitimately refuses while a different session is live, and can accept the very
     * same offer once that ends. A bridge-level de-dupe would make the first refusal permanent and
     * strand her workout on the wrist for good.
     */
    const h = harness();
    h.session.publishLobby(null);
    h.setAdoptOutcome('refused');
    h.emitIntent(localFrame());
    h.setAdoptOutcome('adopted');
    h.emitIntent(localFrame());
    await Promise.resolve();
    await Promise.resolve();
    expect(h.offers).toHaveLength(2);
    const outcomes = h.events
      .filter((e) => e.type === WATCH_EVENTS.localSessionOffered)
      .map((e) => e.data?.outcome);
    expect(outcomes).toEqual(['refused', 'adopted']);
  });

  it('a malformed handover is not mistaken for one — and never reaches the store', () => {
    const h = harness();
    h.session.publishLobby(null);
    h.emitIntent(localFrame({ currentIndex: 7 })); // past the plan it sent
    expect(h.offers).toHaveLength(0);
  });

  it('an ordinary intent still goes down the intent path', () => {
    const h = harness();
    h.session.publish(activeMirror());
    h.emitIntent(intent());
    expect(h.offers).toHaveLength(0);
    expect(h.completed).toHaveLength(1);
  });
});

describe('an adoption that fails is not a silent one', () => {
  it('⛔ says so in the dataset when the store throws', async () => {
    const h = harness();
    h.session.publishLobby(null);
    h.setAdoptOutcome('throw');
    h.emitIntent({
      v: WATCH_PROTOCOL_VERSION,
      type: 'local_session',
      recordId: 'rec-x',
      workoutId: 'day_3',
      workoutName: 'Push',
      startedAt: new Date(NOW - 60_000).toISOString(),
      phase: 'active_set',
      currentIndex: 0,
      steps: [
        {
          exerciseId: 'bb_bench_press',
          exerciseName: 'Bench',
          setIndexInExercise: 0,
          totalSetsInExercise: 1,
          globalIndex: 0,
          targetWeight: 40,
          targetReps: 8,
        },
      ],
      sets: [],
      sentAt: new Date(NOW).toISOString(),
    });
    await Promise.resolve();
    await Promise.resolve();
    const ev = h.events.find((e) => e.type === WATCH_EVENTS.localSessionOffered);
    expect(ev?.data).toMatchObject({ outcome: 'rejected', reason: 'threw', recordId: 'rec-x' });
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ACK — the wrist may only let go once the phone is holding it.
 *
 * The wrist's local engine carries real sets. Discarding it because the phone happens to be running
 * SOMETHING is the one mistake in this layer that loses a workout outright, so the phone names the
 * session it took: `adoptedRecordId`, on every frame, from the envelope's single construction site.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the phone names the handover it is holding', () => {
  const frame = (recordId = 'rec-42') => ({
    v: WATCH_PROTOCOL_VERSION,
    type: 'local_session',
    recordId,
    workoutId: 'day_5',
    workoutName: 'Pull',
    startedAt: new Date(NOW - 400_000).toISOString(),
    phase: 'active_set',
    currentIndex: 0,
    steps: [
      {
        exerciseId: 'bb_row',
        exerciseName: 'Row',
        setIndexInExercise: 0,
        totalSetsInExercise: 3,
        globalIndex: 0,
        targetWeight: 50,
        targetReps: 8,
      },
    ],
    sets: [],
    sentAt: new Date(NOW).toISOString(),
  });

  const lastEnv = (h) => h.sent[h.sent.length - 1] as Record<string, unknown>;

  it('⛔ stamps the adopted id on the frames that follow', async () => {
    const h = harness();
    h.session.publish(activeMirror());
    expect(lastEnv(h).adoptedRecordId).toBeUndefined();
    h.emitIntent(frame());
    await Promise.resolve();
    await Promise.resolve();
    h.session.publish(activeMirror());
    expect(lastEnv(h).adoptedRecordId).toBe('rec-42');
  });

  it('⛔ answers at once rather than leaving her waiting for the next state change', async () => {
    /* A rest can be ninety seconds long. A wrist that had to wait for the next frame to learn its
       session was safe would sit there holding it, with the phone already drawing the workout. */
    const h = harness();
    h.session.publish(activeMirror());
    const before = h.sent.length;
    h.emitIntent(frame());
    await Promise.resolve();
    await Promise.resolve();
    expect(h.sent.length).toBe(before + 1);
    expect(lastEnv(h).adoptedRecordId).toBe('rec-42');
  });

  it('⛔ a DUPLICATE is also an ack — it is the wrist that missed the first one, asking again', async () => {
    const h = harness();
    h.session.publish(activeMirror());
    h.setAdoptOutcome('duplicate');
    h.emitIntent(frame());
    await Promise.resolve();
    await Promise.resolve();
    expect(lastEnv(h).adoptedRecordId).toBe('rec-42');
  });

  it('a REFUSED offer is never acked — the wrist keeps its workout', async () => {
    const h = harness();
    h.session.publish(activeMirror());
    h.setAdoptOutcome('refused');
    h.emitIntent(frame());
    await Promise.resolve();
    await Promise.resolve();
    h.session.publish(activeMirror());
    expect(lastEnv(h).adoptedRecordId).toBeUndefined();
  });

  it('⛔ the ack dies with the workout it belonged to', async () => {
    /* Left standing, it would tell the NEXT session's wrist that its own live local workout had
       been adopted — and invite it to drop one the phone has never seen. */
    const h = harness();
    h.session.publish(activeMirror());
    h.emitIntent(frame());
    await Promise.resolve();
    await Promise.resolve();
    h.session.publish(null); // the teardown frame ends the session
    h.session.publish(activeMirror()); // a NEW workout begins
    expect(lastEnv(h).adoptedRecordId).toBeUndefined();
  });
});

describe('the very first frame of an adopted session carries the ack', () => {
  it('⛔ a session that goes live AFTER being noted is stamped from its first frame', () => {
    /*
     * The ordering bug this pins: the stamp used to be set when the adoption RESOLVED, but adopting
     * is what makes the session live, and going live is what publishes the first frame. That frame
     * could leave unstamped — and the wrist, still running the workout, had no way to know it could
     * let go until the phone's next state change. Between sets that is ninety seconds.
     *
     * The store calls `noteAdopted` immediately before it dispatches; this proves the stamp is on
     * the frame that dispatch produces, not merely on the ones after it.
     */
    const h = harness();
    h.session.noteAdopted('rec-first');
    h.session.publish(activeMirror()); // the frame the adoption itself produces
    const first = h.sent[0] as Record<string, unknown>;
    expect(first.adoptedRecordId).toBe('rec-first');
  });

  it('noting the same handover twice is harmless', () => {
    const h = harness();
    h.session.noteAdopted('rec-first');
    h.session.noteAdopted('rec-first');
    h.session.publish(activeMirror());
    expect((h.sent[0] as Record<string, unknown>).adoptedRecordId).toBe('rec-first');
  });
});

describe('a frame the OS refused is not reported as sent', () => {
  it('⛔ tracks a FAILURE when the transport refuses the envelope', () => {
    /*
     * `updateApplicationContext` throws when the session is not activated and on payload-too-large,
     * and the native transport swallowed it while this bridge telemetered `statePublished`
     * regardless. The dataset then recorded a success for a frame that never left the phone — on
     * the one signal that would have revealed a wrist stuck on stale state.
     */
    const h = harness();
    h.setSendOk(false);
    h.session.publish(activeMirror());
    expect(h.types()).toContain(WATCH_EVENTS.statePublishFailed);
    expect(h.types()).not.toContain(WATCH_EVENTS.statePublished);
  });

  it('a lobby the OS refused says so too', () => {
    const h = harness();
    h.setSendOk(false);
    h.session.publishLobby({ workoutId: 'w1', workoutName: 'A' } as never);
    expect(h.types()).toContain(WATCH_EVENTS.statePublishFailed);
  });

  it('and a frame that WAS taken still reports a plain success', () => {
    const h = harness();
    h.session.publish(activeMirror());
    expect(h.types()).toContain(WATCH_EVENTS.statePublished);
    expect(h.types()).not.toContain(WATCH_EVENTS.statePublishFailed);
  });
});
