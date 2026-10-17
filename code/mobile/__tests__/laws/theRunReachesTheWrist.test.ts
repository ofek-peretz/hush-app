/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE RUN REACHES THE WRIST.
 *
 * Founder, 2026-09-15: *"תיגע בשניים האלו לפי מה שישדרג את חווית המשתמש ואת המוצר שלנו ברמה הגבוהה
 * ביותר ותוודא שהכל סגור ונעול בפני באגים וחורים."*
 *
 * A run started on the PHONE never reached the watch: the wire carried a finished run home from the
 * wrist and nothing live the other way. Now the phone's run is on the wrist — the same cardio stage
 * a wrist run uses, fed the phone's figures, with pause, resume and finish proposed back.
 *
 * What this holds closed, because each is how a mirrored run goes wrong in the field:
 *   · the phone stays the ONLY authority — the wrist proposes, the run's screen performs;
 *   · a lobby published mid-run, or a reconnect, RESTATES the run instead of silently retracting it;
 *   · a finished run cannot be resurrected by a reconnect;
 *   · every wrist proposal is judged against the RUN — none acts with no run, late, or out of phase;
 *   · one beat, one wrist: the phone stays still while a wrist is playing the kilometre;
 *   · the wrist never RECORDS the phone's run — no second workout in Health, no duplicate in her log.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WatchSession } from '@/platform/watch/watchBridge';
import { WATCH_PROTOCOL_VERSION, WATCH_INTENT_TTL_MS, type WatchCardioLive } from '@/platform/watch/protocol';
import {
  cardioSurfaces,
  setCardioWatchSink,
  setCardioControls,
  cardioControl,
  wristOwnsTheBeat,
  WATCH_CARDIO_REFRESH_MS,
} from '@/platform/cardio/cardioLive';

const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

const T0 = Date.parse('2026-09-15T07:10:00.000Z');

function run(over: Partial<WatchCardioLive> = {}): WatchCardioLive {
  return {
    runId: 'run-1', gait: 'run', paused: false, clockAnchorMs: T0 - 600_000, elapsedS: 600, distanceKm: 1.9,
    hr: 150, kcal: 140, lastSplitKm: 1, lastSplitPaceS: 320, lastSplitFastest: true, complete: false, ...over,
  };
}

function bridge() {
  const sent: any[] = [];
  let intent: ((raw: unknown) => void) | null = null;
  let reach: ((r: boolean) => void) | null = null;
  const control = jest.fn();
  let now = T0;
  const s = new WatchSession({
    transport: {
      isReachable: () => false,
      sendState: (env) => (sent.push(env), true),
      onIntent: (cb) => ((intent = cb), () => {}),
      onReachabilityChange: (cb) => ((reach = cb), () => {}),
      onSessionRecord: () => () => {},
      ackRecord: () => {},
    },
    completeSet: () => {},
    dispatch: () => {},
    markEquipmentOccupied: () => {},
    cardioControl: control,
    track: () => {},
    now: () => now,
  });
  let n = 0;
  const tap = (type: string, issuedAt = now) =>
    intent!({ v: WATCH_PROTOCOL_VERSION, type, intentId: `i${++n}`, issuedAt: new Date(issuedAt).toISOString() });
  return { s, sent, control, tap, reconnect: () => reach!(true), setNow: (t: number) => (now = t) };
}

const LOBBY = { workoutId: 'day_1', workoutName: 'Push A', muscles: '', workouts: [] };

describe('the bridge carries the phone’s run', () => {
  it('a run is published beside the lobby — the wrist loses neither', () => {
    const b = bridge();
    b.s.publishLobby(LOBBY);
    b.s.publishCardio(run());
    const env = b.sent.at(-1);
    expect(env.mirror).toBeNull();
    expect(env.cardio).toEqual(run());
    expect(env.lobby).toEqual(LOBBY);
  });

  it('⛔ a LOBBY published mid-run restates the run — Home sits under it and republishes on its own', () => {
    const b = bridge();
    b.s.publishCardio(run());
    b.s.publishLobby(LOBBY);
    expect(b.sent.at(-1).cardio).toEqual(run());
  });

  it('⛔ a reconnect restates the run it had', () => {
    const b = bridge();
    b.s.publishCardio(run({ paused: true, clockAnchorMs: null }));
    b.sent.length = 0;
    b.reconnect();
    expect(b.sent).toHaveLength(1);
    expect(b.sent[0].cardio.paused).toBe(true);
  });

  it('⛔ a FINISHED run is said once — no reconnect and no lobby brings it back', () => {
    const b = bridge();
    b.s.publishCardio(run());
    b.s.publishCardio(run({ complete: true, paused: true, clockAnchorMs: null }));
    expect(b.sent.at(-1).cardio.complete).toBe(true);
    b.s.publishLobby(LOBBY);
    expect(b.sent.at(-1).cardio).toBeUndefined();
    b.sent.length = 0;
    b.reconnect();
    expect(b.sent.every((e) => e.cardio === undefined)).toBe(true);
  });

  it('taking a run off the wrist sends one frame; there is nothing to take when none was there', () => {
    const b = bridge();
    b.s.publishCardio(null);
    expect(b.sent).toHaveLength(0);
    b.s.publishCardio(run());
    b.s.publishCardio(null);
    expect(b.sent).toHaveLength(2);
    expect(b.sent[1].cardio).toBeUndefined();
  });
});

describe('the wrist proposes; the run’s own screen performs', () => {
  it('pause, resume and finish reach the run — each only in its phase', () => {
    const b = bridge();
    b.s.publishCardio(run());
    b.tap('cardio_resume'); // not paused → nothing
    b.tap('cardio_pause');
    expect(b.control.mock.calls).toEqual([['pause']]);
    b.s.publishCardio(run({ paused: true, clockAnchorMs: null }));
    b.tap('cardio_pause'); // already paused → nothing
    b.tap('cardio_resume');
    b.tap('cardio_finish');
    expect(b.control.mock.calls).toEqual([['pause'], ['resume'], ['finish']]);
  });

  it('⛔ with no run on the wrist, a proposal acts on nothing', () => {
    const b = bridge();
    b.s.publishLobby(LOBBY); // the wrist is listening — Today is on it, and no run has been published
    b.tap('cardio_pause');
    b.tap('cardio_finish');
    expect(b.control).not.toHaveBeenCalled();
  });

  it('⛔ nor after the run has finished', () => {
    const b = bridge();
    b.s.publishCardio(run());
    b.s.publishCardio(run({ complete: true }));
    b.tap('cardio_finish');
    expect(b.control).not.toHaveBeenCalled();
  });

  it('⛔ a proposal delivered late is stale, not a pause she meant now', () => {
    const b = bridge();
    b.s.publishCardio(run());
    b.tap('cardio_pause', T0 - WATCH_INTENT_TTL_MS - 1_000);
    expect(b.control).not.toHaveBeenCalled();
  });

  it('the same tap delivered twice is performed once', () => {
    const b = bridge();
    b.s.publishCardio(run());
    const raw = { v: WATCH_PROTOCOL_VERSION, type: 'cardio_finish', intentId: 'same', issuedAt: new Date(T0).toISOString() };
    (b.s as any).handleIntent(raw);
    (b.s as any).handleIntent(raw);
    expect(b.control).toHaveBeenCalledTimes(1);
  });

  it('the store routes the proposal to the screen that registered the run — and to nothing once it ends', () => {
    const pause = jest.fn();
    setCardioControls({ pause });
    expect(cardioControl('pause')).toBe(true);
    expect(pause).toHaveBeenCalledTimes(1);
    setCardioControls(null);
    expect(cardioControl('pause')).toBe(false);
  });
});

describe('the fan-out: one state, the lock card and the wrist', () => {
  const state = (over = {}) => ({
    kind: 'cardio', gait: 'run', paused: false, startedAtMs: T0 - 600_000, elapsedSec: 600, distanceKm: 1.9,
    paceSec: 315, hr: 150, calories: 140, lastSplit: { km: 1, paceSec: 320, fastest: true }, ...over,
  });
  let now = T0;
  let frames: Array<WatchCardioLive | null>;
  let reachable = true;

  beforeEach(() => {
    now = T0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    frames = [];
    reachable = true;
    setCardioWatchSink((live) => (frames.push(live), reachable));
    cardioSurfaces.end(); // module state is shared — every test starts with no run
    frames = [];
  });
  afterEach(() => jest.restoreAllMocks());

  it('the start reaches the wrist at once, with a clock anchored to the absolute instant', () => {
    cardioSurfaces.start(state(), 'run-9');
    expect(frames).toHaveLength(1);
    expect(frames[0]!.runId).toBe('run-9');
    expect(frames[0]!.clockAnchorMs).toBe(T0 - 600_000);
    expect(frames[0]!.complete).toBe(false);
  });

  it('an unchanged run is not re-sent every second — the wrist ticks its own clock', () => {
    cardioSurfaces.start(state(), 'run-9');
    for (let i = 1; i < 5; i++) {
      now = T0 + i * 1_000;
      cardioSurfaces.update(state({ elapsedSec: 600 + i, distanceKm: 1.9 + i * 0.003 }));
    }
    expect(frames).toHaveLength(1);
    now = T0 + WATCH_CARDIO_REFRESH_MS;
    cardioSurfaces.update(state({ elapsedSec: 605, distanceKm: 1.92 }));
    expect(frames).toHaveLength(2);
  });

  it('⛔ a PAUSE and a KILOMETRE are sent the instant they happen', () => {
    cardioSurfaces.start(state(), 'run-9');
    now = T0 + 1_000;
    cardioSurfaces.update(state({ paused: true }));
    expect(frames.at(-1)!.paused).toBe(true);
    expect(frames.at(-1)!.clockAnchorMs).toBeNull(); // a paused clock is frozen, not ticking
    now = T0 + 2_000;
    cardioSurfaces.update(state({ lastSplit: { km: 2, paceSec: 310, fastest: true } }));
    expect(frames.at(-1)!.lastSplitKm).toBe(2);
    expect(frames).toHaveLength(3);
  });

  it('⛔ ONE BEAT, ONE WRIST — the phone stays still only while a reachable wrist has the run', () => {
    cardioSurfaces.start(state(), 'run-9');
    expect(wristOwnsTheBeat()).toBe(true);
    reachable = false;
    now = T0 + 1_000;
    cardioSurfaces.update(state({ paused: true }));
    expect(wristOwnsTheBeat()).toBe(false); // no wrist to play it — the phone does
  });

  it('the finish closes the run on the wrist, and the end takes it away', () => {
    cardioSurfaces.start(state(), 'run-9');
    cardioSurfaces.complete(state({ paused: true }));
    expect(frames.at(-1)!.complete).toBe(true);
    expect(wristOwnsTheBeat()).toBe(false);
    cardioSurfaces.end();
    expect(frames.at(-1)).toBeNull();
  });

  it('a background wake before the screen has started the run names nothing on the wrist', () => {
    cardioSurfaces.update(state());
    expect(frames).toHaveLength(0);
  });
});

describe('the seals no device test can reach', () => {
  const model = read('targets/watch/WatchModel.swift');

  it('⛔ the wrist never RECORDS the phone’s run — `.other`, abandoned, never finished', () => {
    // A `.running` session would be turned into a WRIST recording by `onAdoptedActivity` after a relaunch
    // — saved to Health and sent home a second time.
    const sync = model.slice(model.indexOf('private func syncWorkoutRuntime'), model.indexOf('// MARK: Standalone'));
    expect(sync).toContain('if let c = phoneCardio {');
    expect(sync).toContain('trackLive(paused: c.paused, activity: .other, indoor: true)');
    const apply = model.slice(model.indexOf('private func applyPhoneCardio'), model.indexOf('func phoneCardioElapsed'));
    expect(apply).not.toContain('workoutRuntime.finish()');
    expect(apply).not.toContain('transferCardioRecord');
    expect(apply).not.toContain('enqueueCardioRecord');
  });

  it('⛔ the wrist changes the run only when the PHONE says so — a tap is a proposal', () => {
    const toggle = model.slice(model.indexOf('func togglePhoneCardioPause'), model.indexOf('func endPhoneCardio'));
    expect(toggle).toContain('sendIntent(type: c.paused ? "cardio_resume" : "cardio_pause")');
    expect(toggle).not.toContain('phoneCardio =');
  });

  it('the phone run is drawn by the SAME stage as a wrist run, from the phone’s figures', () => {
    const screens = read('targets/watch/WatchScreens.swift');
    expect(screens).toContain('case let .phoneCardio(paused):');
    expect(screens).toContain('CardioPager(paused: paused, metrics: model.phoneCardioMetrics');
  });

  it('⛔ a phone that goes SILENT is not a run — reconnecting at two minutes, gone at twenty', () => {
    expect(model).toContain('DispatchQueue.main.asyncAfter(deadline: .now() + 120, execute: stale)');
    expect(model).toContain('DispatchQueue.main.asyncAfter(deadline: .now() + 20 * 60, execute: gone)');
    expect(model).toContain('if connection == .reconnecting || phoneCardioStale { return .connectionLost(mirror: nil) }');
    // …and the phone keeps the rule honest: a paused run is restated, so silence means silence.
    const flow = read('src/screens/cardio/Cardio.tsx');
    expect(flow).toContain('if (lastStateRef.current) cardioSurfaces.update(lastStateRef.current);');
    expect(flow).toContain('}, 30_000);');
  });

  it('⛔ the wrist’s run clock is Int64 — a ms epoch overflows arm64_32’s Int', () => {
    expect(read('targets/watch/WatchWire.swift')).toContain('var clockAnchorMs: Int64?');
  });

  it('one road to the surfaces: neither publisher talks to the lock card on its own any more', () => {
    for (const rel of ['src/screens/cardio/Cardio.tsx', 'src/platform/cardio/cardioRun.ts']) {
      expect(read(rel)).not.toContain('cardioLiveActivity.');
      expect(read(rel)).toContain('cardioSurfaces.');
    }
  });

  it('the phone’s km and finish beats stand down for a wrist that is playing them', () => {
    const flow = read('src/screens/cardio/Cardio.tsx');
    expect(flow).toContain('if (!wristOwnsTheBeat()) haptics.setLogged();');
    expect(flow).toContain('if (!wristOwnsTheBeat()) haptics.exerciseAdvance();');
  });

  it('⛔ a run prescribed INSIDE a workout is not mirrored on its own — the strength mirror owns the wrist', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    const sink = store.slice(store.indexOf('setCardioWatchSink((live) => {'));
    expect(sink.slice(0, 200)).toContain('if (strengthLiveRef.current) return false;');
  });
});
