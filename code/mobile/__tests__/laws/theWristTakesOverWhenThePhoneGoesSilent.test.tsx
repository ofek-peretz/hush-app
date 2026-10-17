/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WRIST TAKES OVER WHEN THE PHONE GOES SILENT — and the record comes home whole.
 * (2026-10-17, the wrist-alone plan, stages 3 and 5; approved 2026-10-13, "כן מאשר")
 *
 *   > *"אני רוצה שהאימון בשעון יהיה ברמה הגבוהה ביותר ושיהיה מסונכרן בצורה מושלמת עם הפלאפון."*
 *
 * Build 79 is what this was before it: the phone killed in a pocket, a set pressed on the wrist that
 * went nowhere, the honest viewer, and no way on but the phone. Now every live frame carries the
 * phone's last word on its workout (`WatchTakeoverKit`); a wrist whose phone stops answering starts
 * its own engine from it, at that exact point; and when the phone answers again the workout is
 * offered back under the PHONE's session id and ONE rule decides whose account of the time apart
 * stands (`decideTakeover`).
 *
 * The continuation itself — that the wrist, started from the kit, draws what the phone would have
 * drawn and writes the same record — is played on the watch's REAL engine on a Mac
 * (`sync/theWristRunsWhatThePhoneRuns`, the five `phone-dies-*` scenarios). This file holds the
 * phone's half: the rule, when the plan rides a frame, how a takeover comes home, and the store
 * taking a workout back from the wrist. And the wrist's two triggers, read from its source.
 *
 * STAGE 5 rides with it: every set the wrist logs carries its place in the day and the rest she took
 * before it, so the phone writes the canonical record (`items`) a set of its own would have — which
 * is what closes the stage-1b bug where a plank day came home counted as two steps, and untrained.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
//
import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession } from '@/state/stores/sessionStore';
import { db } from '@/data/local/db';
import { WatchSession } from '@/platform/watch/watchBridge';
import { WATCH_PROTOCOL_VERSION, parseSessionRecord, parseWatchLocalSession } from '@/platform/watch/protocol';
import { decideTakeover, sessionWork } from '@/platform/watch/watchTakeover';
import { applyWatchSessionRecord, canonicalItems, watchRecordToSession } from '@/platform/watch/watchReconcile';
import { sessionTrained } from '@/domain/completion';
import { REST_SAMPLE_FLOOR_S } from '@/domain/restPrescription';

const wire = { envelopes: [] as any[], reachable: true };
jest.mock('@/platform/watch/watchTransportNative', () => ({
  watchTransport: {
    isReachable: () => wire.reachable,
    sendState: (env: unknown) => {
      wire.envelopes.push(JSON.parse(JSON.stringify(env)));
      return true;
    },
    onIntent: () => () => {},
    onReachabilityChange: () => () => {},
    onSessionRecord: () => () => {},
    ackRecord: () => {},
  },
}));
jest.mock('@/platform/liveActivity', () => {
  const actual = jest.requireActual('@/platform/liveActivity');
  return { ...actual, liveActivity: { start: async () => {}, update: async () => {}, end: async () => {} }, drainLockIntents: async () => [], addLockIntentListener: () => () => {}, syncLiveActivity: async () => {} };
});
jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => false,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/setNudge', () => ({ setNudge: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) } }));
jest.mock('@/platform/coach/afterSession', () => ({ askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })) }));

const ROOT = path.resolve(__dirname, '..', '..');
const swift = (f: string) => fs.readFileSync(path.join(ROOT, 'targets', 'watch', f), 'utf8');
const NOW = 1_800_000_000_000;
const iso = (ms: number) => new Date(ms).toISOString();

// ── 1 · THE ONE RULE ─────────────────────────────────────────────────────────────────────────────
describe('⛔ the one rule: whose account of the time apart stands', () => {
  const rule = (live: { id: string; work: number } | null, wristWork: number, historyIds: string[] = []) =>
    decideTakeover({ takeoverOf: 's1', splitAt: 4, wristWork, live, historyIds });

  it('the wrist did more after the split → the phone takes the wrist’s account', () => {
    expect(rule({ id: 's1', work: 4 }, 6)).toBe('proceed'); // the phone did nothing since — the killed-phone case
    expect(rule({ id: 's1', work: 5 }, 7)).toBe('proceed');
  });

  it('otherwise the phone keeps its own, and the wrist lets go — a tie goes to the phone in her hand', () => {
    expect(rule({ id: 's1', work: 5 }, 5)).toBe('superseded'); // the same set logged on both: one set, the phone's
    expect(rule({ id: 's1', work: 7 }, 5)).toBe('superseded');
    expect(rule({ id: 's1', work: 4 }, 4)).toBe('superseded'); // the wrist took over and did nothing
  });

  it('a different workout live on the phone is refused; one already saved is a duplicate; none at all is taken', () => {
    expect(rule({ id: 'other', work: 9 }, 6)).toBe('refused');
    expect(rule(null, 6, ['s1'])).toBe('duplicate');
    expect(rule(null, 6)).toBe('proceed'); // the phone came back from a kill with nothing live: the wrist's is the workout
  });

  it('work is counted the way the split is: sets, a bridge among them, and holds — never the reps rows twice', () => {
    const session = { sets: [{}, {}, {}], items: [{ kind: 'reps' }, { kind: 'reps' }, { kind: 'reps' }, { kind: 'time' }] };
    expect(sessionWork(session)).toBe(4);
  });
});

// ── 2 · WHEN THE PLAN RIDES A FRAME ──────────────────────────────────────────────────────────────
describe('the takeover kit: the plan rides only when the wrist may not hold it', () => {
  const mirror = { schema: 1, phase: 'active_set', exerciseName: 'Bench', setLabel: 'Set 1 of 3', globalIndex: 0, totalSets: 3, targetWeight: 60, targetReps: 5, restEndsAt: null, restRemainingS: null, nextExerciseName: null, nextTargetWeight: null, nextTargetReps: null, completedExerciseName: null, canMarkBusy: false, loadDeltaKg: 0, nextLoadDeltaKg: 0, liftIndex: 1, liftCount: 1, workoutName: 'A', summary: null, swapOptions: [], nextSwapOptions: [] };
  const kit = (rev: string) => ({ sessionId: 's1', workoutId: 'd1', workoutName: 'A', startedAt: iso(NOW), rev, steps: [{ exerciseId: 'bb_bench_press' }], cursor: 0, phase: 'active_set', sets: [], restInterS: 90, restTransitionS: 120 });
  function bridge() {
    const sent: any[] = [];
    let reachable = true;
    let intentCb: (raw: unknown) => void = () => {};
    const events: string[] = [];
    const session = new WatchSession({
      transport: {
        isReachable: () => reachable,
        sendState: (env) => void sent.push(JSON.parse(JSON.stringify(env))) || true,
        onIntent: (cb) => ((intentCb = cb), () => {}),
        onReachabilityChange: () => () => {},
        onSessionRecord: () => () => {},
        ackRecord: () => {},
      },
      now: () => NOW,
      track: (t) => void events.push(t),
      completeSet: () => {},
      dispatch: () => {},
      markEquipmentOccupied: () => {},
      adoptLocalSession: async (l) => (l.takeoverOf ? 'superseded' : 'adopted'),
    });
    return { session, sent, events, setReachable: (r: boolean) => (reachable = r), emit: (raw: unknown) => intentCb(raw), last: () => sent[sent.length - 1] };
  }

  it('whole on the first frame and on a new plan; light while the plan is unchanged', () => {
    const b = bridge();
    b.session.publish(mirror, kit('r1'));
    expect(b.last().takeover.steps).toBeDefined();
    b.session.publish(mirror, kit('r1'));
    expect(b.last().takeover.steps).toBeUndefined();
    expect(b.last().takeover.rev).toBe('r1'); // the light kit still NAMES the plan it goes with
    b.session.publish(mirror, kit('r2')); // her weight carried, a swap, a warm-up — a new plan
    expect(b.last().takeover.steps).toBeDefined();
  });

  it('⛔ whole on EVERY frame while the wrist cannot be reached directly — only the last one will arrive', () => {
    const b = bridge();
    b.session.publish(mirror, kit('r1'));
    b.setReachable(false);
    b.session.publish(mirror, kit('r1'));
    expect(b.last().takeover.steps).toBeDefined();
  });

  it('whole again the moment the wrist asks for it — answered at once, not at the next change', () => {
    const b = bridge();
    b.session.publish(mirror, kit('r1'));
    b.session.publish(mirror, kit('r1'));
    const before = b.sent.length;
    b.emit({ v: WATCH_PROTOCOL_VERSION, type: 'kit_request', have: 'r0', sentAt: iso(NOW) });
    expect(b.sent.length).toBe(before + 1);
    expect(b.last().takeover.steps).toBeDefined();
    expect(b.events).toContain('watch_kit_requested');
  });

  it('a live frame only — never a lobby, never the closing frame', () => {
    const b = bridge();
    b.session.publish({ ...mirror, phase: 'complete' }, kit('r1'));
    expect(b.last().takeover).toBeUndefined();
    b.session.publishLobby({ workoutId: 'd1', workoutName: 'A', muscles: '', workouts: [] });
    expect(b.last().takeover).toBeUndefined();
  });

  it('a takeover the phone judged shorter than its own is still NAMED back — so the wrist lets go of its copy', async () => {
    const b = bridge();
    b.session.publish(mirror, kit('r1'));
    b.emit({ v: WATCH_PROTOCOL_VERSION, type: 'local_session', recordId: 'rec-t', workoutId: 'd1', workoutName: 'A', startedAt: iso(NOW), phase: 'active_set', currentIndex: 0, steps: [{ exerciseId: 'bb_bench_press', globalIndex: 0, setIndexInExercise: 0, totalSetsInExercise: 1, targetReps: 5, targetWeight: 60 }], sets: [], takeoverOf: 's1', splitAt: 0, sentAt: iso(NOW) });
    await act(async () => {});
    expect(b.last().adoptedRecordId).toBe('rec-t');
    expect(b.last().takeover).toBeDefined(); // the republish keeps the kit — the wrist may need it again
  });
});

// ── 3 · THE RECORD COMES HOME WHOLE (stage 5) ────────────────────────────────────────────────────
describe('⛔ the record comes home whole — every set at its place, every hold, the rest before each', () => {
  const set = (ex: string, block: number, round: number, s: number, rest?: number) => ({
    exerciseId: ex, setIndex: round - 1, recommendedWeight: 60, recommendedReps: 8, actualWeight: 60, actualReps: 8,
    completedAt: iso(NOW + s * 1000), at: { block, round, position: 1 }, ...(rest != null ? { restBeforeS: rest } : {}),
  });
  const plank = (round: number, s: number) => ({ exerciseId: 'plank', block: 2, round, position: 1, kind: 'time', seconds: 45, completedAt: iso(NOW + s * 1000), restBeforeS: 45 });
  const record = (over = {}) => ({
    v: WATCH_PROTOCOL_VERSION, type: 'session_record', recordId: 'r1', workoutId: 'd1', workoutName: 'Core', startedAt: iso(NOW), endedAt: iso(NOW + 900_000), earlyFinish: false,
    sets: [set('bb_bench_press', 1, 1, 60), set('bb_bench_press', 1, 2, 200, 120), set('bb_row', 3, 1, 600, 150), set('bb_row', 3, 2, 750, 140)],
    items: [plank(1, 300), plank(2, 400)],
    ...over,
  });

  it('a plank day is SIX steps done, not two — and it is trained (the stage-1b bug, closed)', () => {
    const s = watchRecordToSession(parseSessionRecord(record()));
    expect(s.items.map((i) => `${i.kind}:${i.ex}:${i.block}.${i.round}`)).toEqual([
      'reps:bb_bench_press:1.1', 'reps:bb_bench_press:1.2', 'time:plank:2.1', 'time:plank:2.2', 'reps:bb_row:3.1', 'reps:bb_row:3.2',
    ]);
    expect(sessionTrained({ ...s, prescribed: 6 }, undefined)).toBe(true);
    // The rest before each — on the set log, and on its row of the canonical record.
    expect(s.sets.map((x) => x.restBeforeS ?? null)).toEqual([null, 120, 150, 140]);
    expect(s.items.map((i) => i.restBeforeS ?? null)).toEqual([null, 120, 45, 45, 150, 140]);
  });

  it('a record from a wrist older than places keeps the shape it always had — no half-written canonical list', () => {
    const old = record({ sets: record().sets.map(({ at, ...rest }) => rest), items: undefined });
    expect(watchRecordToSession(parseSessionRecord(old)).items).toBeUndefined();
    expect(canonicalItems([{ ...record().sets[0], isWarmup: true, at: undefined }], undefined)).toBeUndefined(); // a bridge has no row
  });

  it('the floor below which a rest is a thumb is ONE number on both devices', () => {
    expect(Number(swift('WatchWire.swift').match(/let REST_SAMPLE_FLOOR_S = (\d+)/)?.[1])).toBe(REST_SAMPLE_FLOOR_S);
  });
});

// ── 4 · A TAKEOVER, COME HOME FINISHED ───────────────────────────────────────────────────────────
describe('⛔ a workout the wrist took over comes home as the PHONE’s workout — one session, not two', () => {
  const rec = (sets: number, over = {}) => ({
    v: WATCH_PROTOCOL_VERSION, type: 'session_record', recordId: 'rec-w', workoutId: 'd1', workoutName: 'A', startedAt: iso(NOW), endedAt: iso(NOW + 600_000), earlyFinish: false,
    sets: Array.from({ length: sets }, (_, i) => ({ exerciseId: 'bb_bench_press', setIndex: i, recommendedWeight: 60, recommendedReps: 8, actualWeight: 60, actualReps: 8, completedAt: iso(NOW + i * 60_000), at: { block: 1, round: i + 1, position: 1 } })),
    takeoverOf: 'sess_phone', splitAt: 2,
    ...over,
  });
  function deps(live: { id: string; work: number } | null, history: { id: string }[] = []) {
    const saved = [];
    const retired = [];
    const acked = [];
    const events = [];
    return {
      saved, retired, acked, events,
      d: {
        loadHistory: async () => history,
        appendCompletedSession: async (s) => void saved.push(s),
        recordSessionCompleted: async () => ({ unlockedPortrait: false }),
        markWorkoutCompleted: async () => {},
        recordToModel: async () => {},
        enqueuePendingSync: async () => {},
        track: (t, data) => void events.push({ t, data }),
        ack: (id) => void acked.push(id),
        liveSession: () => live,
        retireLocalCopy: async (id) => void retired.push(id),
      },
    };
  }

  it('saved under the phone’s session id, and the phone’s own copy of it retired (live or waiting to resume)', async () => {
    const h = deps({ id: 'sess_phone', work: 2 }); // the phone came back stale, at the split
    await applyWatchSessionRecord(rec(4), h.d);
    expect(h.saved.map((s) => s.id)).toEqual(['sess_phone']);
    expect(h.retired).toEqual(['sess_phone']);
    expect(h.acked).toEqual(['rec-w']);
  });

  it('the phone did more after the split: its account stands, the record is acknowledged and set aside', async () => {
    const h = deps({ id: 'sess_phone', work: 5 });
    await applyWatchSessionRecord(rec(4), h.d);
    expect(h.saved).toEqual([]);
    expect(h.retired).toEqual([]);
    expect(h.acked).toEqual(['rec-w']); // answered, so the wrist's outbox clears
  });

  it('already saved on the phone: a duplicate, acknowledged — never a second session', async () => {
    const h = deps(null, [{ id: 'sess_phone' }]);
    await applyWatchSessionRecord(rec(4), h.d);
    expect(h.saved).toEqual([]);
    expect(h.acked).toEqual(['rec-w']);
  });

  it('a takeover is two facts or none — a record naming one without the other is refused whole', () => {
    expect(parseSessionRecord(rec(4, { splitAt: undefined }))).toBeNull();
    expect(parseSessionRecord(rec(4, { takeoverOf: '' }))).toBeNull();
  });
});

// ── 5 · THE STORE TAKES THE WORKOUT BACK ─────────────────────────────────────────────────────────
describe('⛔ the phone takes back a workout its wrist carried on — and keeps its own when it did more', () => {
  const appFixture = {
    booted: true,
    profile: { id: 'p1', name: 'Maya', sex: 'female', units: 'kg', weightKg: 62, bodyMap: {}, repBandByMuscle: {} },
    program: null, sessions: [], entitlement: { status: 'trial', sessionsUsed: 0 }, model: {}, modeState: { completedSessions: 0 },
    recordSessionCompleted: async () => ({ unlockedPortrait: false }), markWorkoutCompleted: async () => {}, refreshProgram: async () => {},
  };
  // Six sets: long enough that two more on the phone leave the workout still running (four would finish it,
  // and a finished workout is answered `duplicate` — the third verdict, held in the rule's own block above).
  const DAY = { name: 'Upper A', blocks: [{ rounds: 6, items: [{ kind: 'reps', ex: 'bb_bench_press', load: 60, reps: [8, 10] }] }] };
  let view = null;
  let tree;
  function Probe() {
    view = useSession();
    return null;
  }
  const settle = async () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
  beforeEach(async () => {
    await db.clearAll();
    wire.envelopes = [];
    wire.reachable = true;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove() {} }));
    act(() => {
      tree = renderer.create(
        <AppContext.Provider value={appFixture}>
          <SessionProvider>
            <Probe />
          </SessionProvider>
        </AppContext.Provider>,
      );
    });
    await act(async () => void (await view.startCoach(DAY, 'w1')));
    await settle();
    // Two sets on the phone, then the phone goes silent at the third set.
    for (let i = 0; i < 2; i++) {
      await act(async () => void (await view.completeSet()));
      await act(async () => view.endRest());
      await settle();
    }
  });
  afterEach(() => act(() => tree.unmount()));

  /** What the wrist would offer back after carrying on from the kit it held: `own` more sets, then resting. */
  function offerAfter(own: number) {
    const kits = wire.envelopes.map((e) => e.takeover).filter(Boolean);
    const latest = kits[kits.length - 1];
    const steps = [...kits].reverse().find((k) => k.rev === latest.rev && k.steps).steps;
    const t = Date.now();
    const mine = Array.from({ length: own }, (_, i) => ({
      exerciseId: 'bb_bench_press', setIndex: latest.cursor + i, recommendedWeight: 60, recommendedReps: 8, actualWeight: 60, actualReps: 8,
      completedAt: iso(t + i * 1000), at: { block: 1, round: latest.cursor + i + 1, position: 1 },
    }));
    return {
      v: WATCH_PROTOCOL_VERSION, type: 'local_session', recordId: 'rec-take', workoutId: latest.workoutId, workoutName: latest.workoutName,
      startedAt: latest.startedAt, phase: 'rest_inter', currentIndex: latest.cursor + own - 1,
      restEndsAt: iso(t + 120_000), restTotalS: 120, steps, sets: [...latest.sets, ...mine],
      takeoverOf: latest.sessionId, splitAt: latest.sets.length, pendingRestS: null, sentAt: iso(t),
    };
  }

  it('the frame carries the kit: the phone’s session, where she stands, what she logged', () => {
    const k = wire.envelopes[wire.envelopes.length - 1].takeover;
    expect(k.sessionId).toMatch(/^sess_/);
    expect(k.cursor).toBe(2);
    expect(k.sets.length).toBe(2);
    expect(k.sets.every((s) => s.at)).toBe(true); // every set at its place — the canonical record can be rebuilt
  });

  it('the wrist did more → adopted, UNDER THE PHONE’S OWN ID, with every set of both devices in order', async () => {
    const offer = offerAfter(1);
    expect(parseWatchLocalSession(JSON.parse(JSON.stringify(offer)))).not.toBeNull();
    const id = offer.takeoverOf;
    let outcome;
    await act(async () => void (outcome = await view.adoptLocalSession(offer)));
    await settle();
    expect(outcome).toBe('adopted');
    // Still the phone's own session — the kit its frames now carry names the same id — with all three sets.
    expect(wire.envelopes[wire.envelopes.length - 1].takeover.sessionId).toBe(id);
    expect(view.loggedSets.length).toBe(3);
    expect((await db.loadActiveSession())?.id).toBe(id);
    expect(view.displayPhase).toBe('REST_INTER');
    // …and every frame from here names the wrist's copy, so the wrist lets go of it.
    expect(wire.envelopes[wire.envelopes.length - 1].adoptedRecordId).toBe('rec-take');
  });

  it('the phone did more → superseded: nothing on the phone moves', async () => {
    const offer = offerAfter(1);
    await act(async () => void (await view.completeSet())); // she pressed it on the phone too…
    await act(async () => view.endRest());
    await act(async () => void (await view.completeSet())); // …and one more
    await settle();
    const before = view.loggedSets.length;
    let outcome;
    await act(async () => void (outcome = await view.adoptLocalSession(offer)));
    expect(outcome).toBe('superseded');
    expect(view.loggedSets.length).toBe(before);
  });
});

// ── 5b · A WORKOUT COME HOME SENDS THE WRIST ITS NEXT WEEK ───────────────────────────────────────
describe('⛔ a workout come home sends the wrist its next week — wherever she is in the app (stage 5)', () => {
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, 'src', rel), 'utf8');

  it('the nudge reaches every listener, and stops at unsubscribe', () => {
    const { onWatchRecordApplied, noteWatchRecordApplied } = require('@/platform/watch/watchPlanRefresh');
    let a = 0;
    let b = 0;
    const offA = onWatchRecordApplied(() => (a += 1));
    const offB = onWatchRecordApplied(() => (b += 1));
    noteWatchRecordApplied();
    offA();
    noteWatchRecordApplied();
    offB();
    expect([a, b]).toEqual([1, 2]);
  });

  it('the store nudges as it answers a wrist record; Today rebuilds the plan on the nudge even when it is not in front', () => {
    const store = read('state/stores/sessionStore.tsx');
    const ack = store.slice(store.indexOf('ack: (id) => {'), store.indexOf('liveSession: () =>'));
    expect(ack).toContain('watchTransport.ackRecord(id)');
    expect(ack).toContain('noteWatchRecordApplied()');
    const home = read('screens/home/Home.tsx');
    expect(home).toContain('onWatchRecordApplied(() => setWristTick((n) => n + 1))');
    expect(home).toContain('if (!isFocused && wristTick === wristTickBuilt.current) return;');
    expect(home).toMatch(/\[isFocused, coachPlan, coachWorkouts, doneCoachIds, weekLoaded, wristTick\]/);
  });
});

// ── 6 · THE WRIST'S HALF, READ FROM ITS SOURCE ───────────────────────────────────────────────────
describe('the wrist’s two triggers, and its one guard (it is compiled and RUN on a Mac by the instrument)', () => {
  const model = swift('WatchModel.swift');
  const engine = swift('LocalWorkoutEngine.swift');
  const between = (src: string, a: string, b: string) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

  it('a tap the phone does not answer is carried out HERE — every session tap goes through `propose`', () => {
    const p = between(model, 'private func propose(', 'Drive the OS workout runtime');
    expect(p).toContain('sendExpectingReply');
    expect(p).toContain('self.takeOver(type)');
    expect(p).toContain('replyDeadlineS');
    for (const t of ['complete_set', 'end_rest', 'add_rest', 'pause', 'resume', 'set_ready', 'add_warmup', 'finish_early']) {
      expect({ tap: t, proposed: model.includes(`propose("${t}"`) || model.includes(`"${t}",`) }).toEqual({ tap: t, proposed: true });
    }
  });

  it('a phone out of reach past the grace hands the workout over instead of the viewer', () => {
    const grace = between(model, 'func setReachable', '// MARK: Rest haptics');
    expect(grace).toMatch(/self\.takeOver\("unreachable"\) != nil \{ return \}/);
  });

  it('⛔ NOT a rest that ran out in silence — a pocketed phone never moves past a rest by itself', () => {
    /*
     * A third trigger stood here for one day: "the rest ran out and no frame came for eight seconds".
     * The phone's own source says why that is the ordinary case and not a dead phone — its JS clock
     * sleeps in a pocket and catches up when she taps or opens it (`applyClock`). The trigger would
     * have taken the workout over after nearly every rest, leaving the phone and the lock card behind.
     */
    const store = fs.readFileSync(path.join(ROOT, 'src', 'state', 'stores', 'sessionStore.tsx'), 'utf8');
    expect(store).toContain('A JS timer does not run in a pocket');
    expect(model).not.toMatch(/armSilenceWatch|silenceWatch|rest_ran_out/);
  });

  it('⛔ a takeover with nothing of its own is OFFERED to a relaunched phone’s Today — never dropped there', () => {
    // A phone relaunched after the kill boots onto Today with her workout on disk, not live. Dropping
    // the takeover there would put the wrist on the Start screen mid-workout; offering it lets the phone
    // carry the workout on from the wrist (`decideTakeover`: nothing live, not saved → proceed).
    const reclaim = model.split('\n').find((l) => l.includes('let engine = localEngine, phoneLive ||'));
    expect(reclaim).toBeDefined();
    expect(reclaim).not.toContain('lobby');
    expect(model).toContain('if let engine = localEngine, envelope.mirror == nil || engine.isTakeover, Date().timeIntervalSince(lastLocalOfferAt) > 5');
    expect(decideTakeover({ takeoverOf: 's1', splitAt: 3, wristWork: 3, live: null, historyIds: [] })).toBe('proceed');
  });

  it('the kit is kept with the frame it came on, and dropped with a frame that carries none', () => {
    const keep = between(model, 'if phoneLive, let kit = envelope.takeover', 'let engine = localEngine,');
    expect(keep).toContain('store.saveTakeoverKit(kit)');
    expect(keep).toContain('askForKit(have: kit.rev)');
    expect(keep).toContain('store.clearTakeoverKit()');
  });

  it('⛔ the guard counts only what THIS wrist logged — a takeover’s inherited account is the phone’s', () => {
    expect(engine).toMatch(/var hasWork: Bool \{ state\.sets\.count \+ \(state\.items\?\.count \?\? 0\) > \(state\.splitAt \?\? 0\) \}/);
    expect(engine).toContain('splitAt: kit.sets.count + (kit.items?.count ?? 0)');
    expect(engine).toContain('takeoverOf: kit.sessionId');
  });
});
