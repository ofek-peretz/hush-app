/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WRIST RUNS WHAT THE PHONE RUNS — one script, two engines. (founder, 2026-10-13)
 *
 *   > *"אני רוצה שהאימון בשעון יהיה ברמה הגבוהה ביותר ושיהיה מסונכרן בצורה מושלמת עם הפלאפון."*
 *
 * A workout has two machines that can run it: the phone's session store, and the watch's own
 * `LocalWorkoutEngine.swift` when the phone is in a locker. They are two implementations of one
 * behaviour in two languages, and until today nothing ever RAN the second one — every wrist law
 * reads Swift as text. "Perfectly in sync" was a claim with no instrument behind it.
 *
 * This file is the phone's half of that instrument. For each scenario — a day as the coach wrote it,
 * and a script of what she does (a set as written, a set with her own figures, skip the rest, +15,
 * pause, end early) — it:
 *
 *   1. builds the plan the WRIST would be sent for that day (`buildCoachWatchPlan`, the real one);
 *   2. runs the script through the REAL session store, and after every action writes down what the
 *      phone tells the wrist (the mirror in the envelope): which lift, which set, what load, what
 *      rest, what comes next — and at the end, the sets it logged.
 *
 * `native-tests/wrist-engine/main.swift` then plays the SAME script on the watch's real engine on a
 * Mac in CI and holds every one of those facts against what the engine itself draws. Where the two
 * agree the wrist alone IS the phone; where they do not, that is a gap with a name.
 *
 * ── THE GAPS ARE IN THE FILE, NOT IN A BACKLOG ──────────────────────────────────────────────────
 * A scenario says `agrees: true` or names its gap. A named gap is ALLOWED to differ — and is
 * required to: the Swift half fails when a scenario marked as a gap starts agreeing, so closing one
 * cannot be done without saying so here. The list below is the plan the founder approved, as tests.
 *
 * The fixtures are regenerated with `SYNC_FIXTURES=write` and compared otherwise, exactly as the
 * simulator's are — a stale fixture is a failure, so Swift can never be checked against an old phone.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
//
import React from 'react';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { db } from '@/data/local/db';
import type { PlannedSession } from '@/domain/coachPlan';
import { buildCoachWatchPlan } from '@/platform/watch/watchPlan';
import { REST_INTER_S, restTransitionSeconds } from '@/domain/restPrescription';

const wire = { envelopes: [] as any[] };

jest.mock('@/platform/watch/watchTransportNative', () => ({
  watchTransport: {
    isReachable: () => true,
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
  return {
    ...actual,
    liveActivity: { start: async () => {}, update: async () => {}, end: async () => {} },
    drainLockIntents: async () => [],
    addLockIntentListener: () => () => {},
    syncLiveActivity: async () => {},
  };
});
jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => false,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/setNudge', () => ({ setNudge: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) } }));
jest.mock('@/platform/coach/afterSession', () => ({ askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })) }));

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

const T0 = 1_800_000_000_000;
jest.useFakeTimers({
  doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback'],
});
let now = T0;
const setNow = (t: number) => {
  now = t;
  jest.setSystemTime(t);
};
beforeEach(async () => {
  await db.clearAll();
  setNow(T0);
  wire.envelopes = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove() {} }) as never);
});
afterAll(() => jest.useRealTimers());

// ── what she does ────────────────────────────────────────────────────────────────────────────────
type Action =
  | { do: 'complete'; weight?: number | null; reps?: number } // as written when no figures are given
  | { do: 'start' } // Ready on a hold: its one clock starts
  | { do: 'endRest' }
  | { do: 'addRest' } // +15
  | { do: 'pause' }
  | { do: 'resume' }
  | { do: 'finishEarly' }
  | { do: 'warmUp' } // "+ Warm-up" on a compound's first set: the bridges go in ahead of it
  | { do: 'wait'; s: number } // she stands there this many seconds more — the rest she TAKES is measured
  | { do: 'phoneDies' }; // stage 3: from here the WRIST runs it, from the phone's last word — the phone runs on as the reference

const done = (n: number, a: Action = { do: 'complete' }): Action[] => Array.from({ length: n }, () => [a, { do: 'endRest' } as Action]).flat();
const reps = (ex: string, load: number | null, band: [number, number] = [8, 12]) => ({ kind: 'reps', ex, load, reps: band });

interface Scenario {
  name: string;
  /** What the day is — said to a person reading the report. */
  says: string;
  day: PlannedSession;
  script: Action[];
  /** `true`: the wrist alone must draw exactly what the phone tells it. Otherwise the gap's name and stage. */
  agrees: true | { gap: string; stage: number };
}

const wait = (s: number): Action => ({ do: 'wait', s });

const SCENARIOS: Scenario[] = [
  {
    name: 'straight',
    says: 'three lifts, every set as written, every rest skipped, to the end',
    day: { name: 'Upper A', blocks: [{ rounds: 3, items: [reps('bb_bench_press', 60, [8, 10])] }, { rounds: 2, items: [reps('bb_row', 50)] }, { rounds: 2, items: [reps('lateral_raise', 8, [12, 20])] }] },
    // the last set ends the workout — nothing to skip after it
    script: done(7).slice(0, -1),
    agrees: true,
  },
  {
    name: 'rests-and-pauses',
    says: '+15 on a rest, a pause inside a rest, a pause on a set, and the workout ended early',
    day: { name: 'Upper A', blocks: [{ rounds: 3, items: [reps('bb_bench_press', 60, [8, 10])] }, { rounds: 2, items: [reps('bb_row', 50)] }] },
    script: [
      { do: 'complete' },
      wait(20),
      { do: 'addRest' },
      { do: 'pause' },
      wait(60), // a minute standing still is not rest she took — on either device
      { do: 'resume' },
      wait(25),
      { do: 'endRest' }, // banked: the rest either side of the pause — its minute left out
      { do: 'pause' },
      { do: 'resume' },
      { do: 'complete' },
      { do: 'endRest' }, // two seconds: a thumb, not her pace — not banked
      { do: 'complete' }, // the last bench set: the rest that follows is the walk to the row
      wait(50),
      { do: 'endRest' },
      { do: 'complete' },
      { do: 'finishEarly' },
    ],
    agrees: true,
  },
  {
    name: 'bodyweight',
    says: 'a lift with no load beside a loaded one',
    day: { name: 'Pull', blocks: [{ rounds: 2, items: [reps('pull_up', null, [6, 10])] }, { rounds: 2, items: [reps('db_row', 20)] }] },
    script: done(4).slice(0, -1),
    agrees: true,
  },
  {
    name: 'her-own-reps',
    says: 'she logs her own reps inside the band — the load is untouched',
    day: { name: 'Upper A', blocks: [{ rounds: 3, items: [reps('bb_bench_press', 60, [8, 10])] }, { rounds: 2, items: [reps('bb_row', 50)] }] },
    script: [{ do: 'complete', weight: 60, reps: 9 }, { do: 'endRest' }, { do: 'complete', weight: 60, reps: 8 }, { do: 'endRest' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete', weight: 50, reps: 10 }, { do: 'endRest' }, { do: 'complete' }],
    agrees: true,
  },
  {
    name: 'her-own-weight',
    says: 'she lifts lighter than written on the first set — the phone carries her weight to the sets that follow',
    day: { name: 'Upper A', blocks: [{ rounds: 3, items: [reps('bb_bench_press', 60, [8, 10])] }, { rounds: 2, items: [reps('bb_row', 50)] }] },
    script: [{ do: 'complete', weight: 55, reps: 9 }, { do: 'endRest' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete' }],
    // ✅ CLOSED 2026-10-13 (stage 2): her own number is copied forward on the wrist, as on the phone.
    agrees: true,
  },
  {
    name: 'out-of-the-band',
    /* ⚠️ THE INSTRUMENT'S FIRST CORRECTION WAS OF ME. I had written this one down as a gap — "the phone
       corrects the load when her reps leave the band, the wrist does not". The phone does no such
       thing: since the founder's ruling of 2026-08-26 the athlete is a LOGGER mid-workout and
       `applyLoop1` has no caller in the live session (`sessionStore.completeSet`). Four reps where
       eight were asked moves nothing on the phone — so the wrist doing nothing is not a gap, it is
       parity, and this scenario holds it there. */
    says: 'her reps fall far under the band — and the load does NOT move, on either device',
    day: { name: 'Upper A', blocks: [{ rounds: 3, items: [reps('bb_bench_press', 60, [8, 10])] }, { rounds: 2, items: [reps('bb_row', 50)] }] },
    script: [{ do: 'complete', weight: 60, reps: 4 }, { do: 'endRest' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete' }],
    agrees: true,
  },
  {
    name: 'superset',
    says: 'a lift, then a couple of two lifts for three rounds, then a lift',
    day: {
      name: 'Arms',
      blocks: [{ rounds: 2, items: [reps('bb_bench_press', 60, [8, 10])] }, { rounds: 3, items: [reps('db_curl', 12), reps('rope_pushdown', 25, [10, 15])] }, { rounds: 2, items: [reps('lateral_raise', 8, [12, 20])] }],
    },
    script: [...done(2), { do: 'complete' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete' }, { do: 'complete' }, { do: 'endRest' }, ...done(2).slice(0, -1)],
    // ✅ CLOSED 2026-10-13 (stage 1): the plan is the phone's own run of the day, each step says how
    // long its rest is, and the engine goes straight on where that is nothing. 147 facts apart → none.
    agrees: true,
  },
  {
    name: 'plank-day',
    says: 'a day with a plank in it — one hold started on its clock and finished, one finished outright',
    day: { name: 'Core', blocks: [{ rounds: 2, items: [reps('bb_bench_press', 60, [8, 10])] }, { rounds: 2, restS: 45, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] }, { rounds: 2, items: [reps('bb_row', 50)] }] },
    script: [...done(2), { do: 'start' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete' }, { do: 'endRest' }, ...done(2).slice(0, -1)],
    // ✅ CLOSED 2026-10-13 (stage 1b): the day is sent (in `moreWorkouts`), the engine runs the hold on
    // its own clock, and Done writes an item — not a set of zero reps.
    agrees: true,
  },
  {
    name: 'carry-day',
    says: 'a bodyweight lift, a loaded carry measured in metres, a dumbbell lift — ended early inside the carry',
    day: { name: 'Full B', blocks: [{ rounds: 2, items: [reps('push_up', null)] }, { rounds: 2, restS: 60, items: [{ kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24 }] }, { rounds: 2, items: [reps('db_row', 20)] }] },
    script: [...done(2), { do: 'complete' }, { do: 'pause' }, { do: 'resume' }, { do: 'endRest' }, { do: 'finishEarly' }],
    agrees: true,
  },
  {
    name: 'warm-up',
    says: 'she asks for the warm-up on the squat (two bridges) and on the deadlift (one), pauses on a bridge, and the curl is offered none',
    day: {
      name: 'Lower',
      blocks: [{ rounds: 3, items: [reps('bb_back_squat', 100, [5, 8])] }, { rounds: 2, items: [reps('bb_rdl', 80, [8, 10])] }, { rounds: 2, items: [reps('leg_extension', 40, [10, 15])] }],
    },
    script: [
      { do: 'warmUp' },
      { do: 'complete' }, // bridge 1 of 2, as written
      { do: 'endRest' },
      { do: 'pause' },
      { do: 'resume' },
      { do: 'complete', weight: 70, reps: 3 }, // bridge 2 of 2, lighter than written — and it carries NOTHING
      { do: 'endRest' },
      ...done(3), // the three working squats; the last rest is the walk to the deadlift
      { do: 'warmUp' },
      ...done(3), // one bridge, then two working sets
      ...done(2).slice(0, -1), // two leg extensions — never offered a warm-up
    ],
    // Stage 2 (2026-10-17): the phone's offer rides the plan, and the wrist inserts what it was told.
    agrees: true,
  },
  /*
   * ⛔ THE PHONE DIES (stage 3, 2026-10-17). In each of these the PHONE runs the workout up to
   * `phoneDies`; from there the WRIST runs it — started from nothing but the takeover kits the phone's
   * frames carried — while the phone runs on beside it as the reference. Every frame after the
   * takeover, and the whole record at the end (the phone's sets AND the wrist's, with the rest before
   * each), must be what the phone would have drawn and written had it never gone silent.
   */
  {
    name: 'phone-dies-in-a-rest',
    says: 'she lifts lighter on the phone (her weight carried), the phone goes silent mid-rest, and the wrist carries the day to its end',
    day: { name: 'Upper A', blocks: [{ rounds: 3, items: [reps('bb_bench_press', 60, [8, 10])] }, { rounds: 2, items: [reps('bb_row', 50)] }] },
    script: [
      { do: 'complete', weight: 55, reps: 9 },
      wait(30),
      { do: 'endRest' },
      { do: 'complete' },
      wait(15),
      { do: 'phoneDies' },
      wait(20),
      { do: 'endRest' }, // the rest she took spans the takeover — measured as ONE rest
      { do: 'complete' },
      { do: 'endRest' },
      { do: 'complete' },
      wait(40),
      { do: 'endRest' },
      { do: 'complete' },
    ],
    agrees: true,
  },
  {
    name: 'phone-dies-mid-superset',
    says: 'the phone goes silent with the couple half done — the wrist goes straight on to the partner, then rests the round',
    day: {
      name: 'Arms',
      blocks: [{ rounds: 1, items: [reps('bb_bench_press', 60, [8, 10])] }, { rounds: 2, items: [reps('db_curl', 12), reps('rope_pushdown', 25, [10, 15])] }],
    },
    script: [...done(1), { do: 'complete' }, { do: 'phoneDies' }, { do: 'complete' }, wait(30), { do: 'endRest' }, { do: 'complete' }, { do: 'complete' }],
    agrees: true,
  },
  {
    name: 'phone-dies-paused',
    says: 'she pauses on the phone in a rest, the phone goes silent, and she resumes on the wrist — the pause is not counted as rest',
    day: { name: 'Pull', blocks: [{ rounds: 3, items: [reps('db_row', 20)] }] },
    script: [{ do: 'complete' }, wait(10), { do: 'pause' }, wait(30), { do: 'phoneDies' }, wait(30), { do: 'resume' }, wait(10), { do: 'endRest' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete' }],
    agrees: true,
  },
  {
    name: 'phone-dies-on-a-warm-up',
    says: 'the warm-up was asked for on the phone; it goes silent between the two bridges — the wrist runs the second, then the working sets',
    day: { name: 'Lower', blocks: [{ rounds: 2, items: [reps('bb_back_squat', 100, [5, 8])] }] },
    script: [{ do: 'warmUp' }, { do: 'complete' }, { do: 'phoneDies' }, { do: 'endRest' }, { do: 'complete' }, { do: 'endRest' }, ...done(2).slice(0, -1)],
    agrees: true,
  },
  {
    name: 'phone-dies-after-a-plank',
    says: 'a plank held on the phone, the phone silent before the second — the wrist holds it and finishes the day; both planks come home',
    day: { name: 'Core', blocks: [{ rounds: 1, items: [reps('bb_bench_press', 60, [8, 10])] }, { rounds: 2, restS: 45, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] }, { rounds: 1, items: [reps('bb_row', 50)] }] },
    script: [...done(1), { do: 'start' }, { do: 'complete' }, { do: 'phoneDies' }, wait(20), { do: 'endRest' }, { do: 'complete' }, { do: 'endRest' }, { do: 'complete' }],
    agrees: true,
  },
];

// ── the phone, running it ────────────────────────────────────────────────────────────────────────
/** What the wrist is TOLD — every fact a standalone wrist must be able to draw by itself. */
const FACTS = [
  'phase',
  'exerciseName',
  'setNumber',
  'setsInExercise',
  'globalIndex',
  'totalSets',
  'targetWeight',
  'targetReps',
  'targetRepsHi',
  'restTotalS',
  'nextExerciseName',
  'nextSetNumber',
  'nextSetsInExercise',
  'nextTargetWeight',
  'nextTargetReps',
  'completedExerciseName',
  'liftIndex',
  'liftCount',
  'superset',
  'setsSoFar',
  'loadsSoFar',
  'liveSets',
  'liveVolumeKg',
  'holdSeconds',
  'holdMetres',
  'nextHoldSeconds',
  'nextHoldMetres',
  // The warm-up on offer for the set on stage, and whether the step coming is a bridge (stage 2).
  'warmupOffered',
] as const;

function told(): Record<string, unknown> {
  const m = wire.envelopes[wire.envelopes.length - 1]?.mirror;
  if (!m) return { phase: 'none' };
  const out: Record<string, unknown> = {};
  for (const k of FACTS) out[k] = m[k] ?? null;
  // "What comes next" is a fact of a REST. Off one, the phone writes zeros and the wrist writes
  // nothing — the same statement in two spellings, and not what this file is measuring.
  if (m.phase !== 'rest_inter' && m.phase !== 'rest_transition') for (const k of FACTS) if (k.startsWith('next')) out[k] = null;
  // A zero and an absence are one fact here: "no warm-up", "no hold".
  out.isWarmup = m.isWarmup === true;
  if (m.phase === 'rest_inter' || m.phase === 'rest_transition') out.nextIsWarmup = m.nextIsWarmup === true;
  if (m.phase === 'complete') {
    return { phase: 'complete', summarySets: m.summary?.sets ?? null, summaryVolumeKg: m.summary?.volumeKg ?? null, summaryLifts: (m.summary?.lifts ?? []).map((l) => `${l.name} ${l.best}`) };
  }
  return out;
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function run(s: Scenario) {
  let view: SessionView | null = null;
  function Probe() {
    view = useSession();
    return null;
  }
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <AppContext.Provider value={appFixture}>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </AppContext.Provider>,
    );
  });
  const WORKOUT = 'w_today';
  // The plan her wrist would have been sent for this same day, built by the same call Home makes.
  const plan = buildCoachWatchPlan({
    sessions: [{ id: WORKOUT, name: s.day.name, blocks: s.day.blocks }],
    history: [],
    nowMs: T0,
    restInterS: REST_INTER_S,
    restTransitionS: restTransitionSeconds(),
  });

  await act(async () => void (await view!.startCoach(s.day, WORKOUT)));
  await settle();
  const steps: { do: string; weight?: number | null; reps?: number; phone: Record<string, unknown> }[] = [];
  const start = told();
  /** What the wrist holds when the phone goes silent — see `wristHolds`. */
  let takeover: { nowMs: number; kits: unknown[] } | null = null;
  for (const a of s.script) {
    const v = view!;
    setNow(now + 1_000); // a second passes between any two things she does
    if (a.do === 'wait') setNow(now + a.s * 1000);
    if (a.do === 'phoneDies') takeover = { nowMs: now, kits: wristHolds() };
    if (a.do === 'complete') {
      const own = a.reps != null;
      if (v.currentTarget) await act(async () => void (await v.completeSet(own ? { weight: a.weight ?? null, reps: a.reps! } : undefined)));
      else await act(async () => void (await v.completeItem()));
    } else if (a.do === 'start') await act(async () => v.markSetStarted());
    else if (a.do === 'endRest') await act(async () => v.endRest());
    else if (a.do === 'addRest') await act(async () => v.extendRest(15));
    else if (a.do === 'pause') await act(async () => v.pause());
    else if (a.do === 'resume') await act(async () => v.resume());
    else if (a.do === 'warmUp') await act(async () => v.addWarmup());
    else if (a.do === 'wait' || a.do === 'phoneDies') {
      // Nothing she does: time passes, or (stage 3) the WRIST takes over — the phone runs on as the reference.
    } else await act(async () => void (await v.finishEarly()));
    await settle();
    await settle();
    steps.push({ ...a, phone: told() });
  }
  const saved = (await db.loadHistory())[0] ?? view!.session ?? null;
  const logged = saved?.sets ?? [];
  // The holds and carries she finished — what `completeItem` wrote, less the lifts (which are `sets`).
  const held = (saved?.items ?? [])
    .filter((i) => i.kind === 'time' || i.kind === 'distance')
    .map((i) => ({
      exerciseId: i.ex,
      block: i.block,
      round: i.round,
      position: i.position,
      kind: i.kind,
      ...(i.kind === 'time' ? { seconds: i.seconds } : { metres: i.metres }),
      load: i.load ?? null,
      ...(i.restBeforeS != null ? { restBeforeS: i.restBeforeS } : {}),
    }));
  act(() => tree!.unmount());
  return {
    name: s.name,
    says: s.says,
    agrees: s.agrees,
    // The instant the script starts — the wrist's engine runs on the SAME seconds (its clock seam).
    t0: T0,
    workoutId: WORKOUT,
    plan,
    start,
    steps,
    // What the PHONE wrote down — the record a wrist-alone workout must bring home. A warm-up bridge
    // is part of it, marked as the bridge it is (stage 2): the wrist must bring home the same rows.
    logged: logged.map((l) => ({
      exerciseId: l.exerciseId,
      setIndex: l.setIndex,
      weight: l.actualWeight ?? null,
      reps: l.actualReps,
      ...(l.isWarmup ? { warmup: true } : {}),
      // …and the rest she took before it (stage 5): her pace learns from a wrist workout too.
      ...(l.restBeforeS != null ? { restBeforeS: l.restBeforeS } : {}),
    })),
    held,
    // Stage 3: the moment the phone went silent, and the kits the wrist held then.
    ...(takeover ? { takeover } : {}),
  };
}

/**
 * ⛔ WHAT THE WRIST HOLDS WHEN THE PHONE GOES SILENT (stage 3) — read off the frames the phone sent,
 * never handed to it: the last kit that carried the plan whole, and the latest kit (which may carry
 * none — it names the same rev). The Swift half stores the two in that order through the wrist's own
 * `WatchStore.saveTakeoverKit`, so the steps-by-rev rule is exercised for real, not assumed.
 */
function wristHolds(): unknown[] {
  const kits = wire.envelopes.map((e) => e.takeover).filter(Boolean);
  const latest = kits[kits.length - 1];
  if (!latest) return [];
  const whole = [...kits].reverse().find((k) => k.rev === latest.rev && Array.isArray(k.steps));
  return whole && whole !== latest ? [whole, latest] : [latest];
}

const FIXTURES = join(__dirname, '__fixtures__', 'wrist-engine');

describe('one script, two engines — the phone’s half', () => {
  const made = new Map<string, unknown>();

  it.each(SCENARIOS.map((s) => [s.name, s] as const))('%s — the phone runs it and writes down what it tells the wrist', async (_name, s) => {
    const out = await run(s);
    made.set(s.name, out);
    // The script ran: every action moved the phone somewhere it could describe.
    expect(out.steps.length).toBe(s.script.length);
    expect(out.steps.every((st) => typeof st.phone.phase === 'string' && st.phone.phase !== 'none')).toBe(true);
    expect(out.logged.length).toBeGreaterThan(0);
    // A scenario where the phone dies hands the wrist a kit WITH its plan in it, or there is nothing to test.
    if (s.script.some((a) => a.do === 'phoneDies')) {
      expect(out.takeover?.kits.length).toBeGreaterThan(0);
      expect(out.takeover!.kits.some((k: any) => Array.isArray(k.steps) && k.steps.length > 0)).toBe(true);
    }
  });

  it('⛔ the rest she takes is in the record — and a pause is never counted as rest (stage 5)', async () => {
    const out = await run(SCENARIOS.find((x) => x.name === 'rests-and-pauses')!);
    // A second passes before every tap. The first rest runs from the set (t 1) to the pause (t 24),
    // and from the resume (t 86) to "next" (t 113): 23 + 27 = 50 — the 62 seconds paused are left out
    // (counted, it would read 112). The second is two seconds — a thumb, not banked. The walk: 52.
    expect(out.logged.map((l) => l.restBeforeS ?? null)).toEqual([null, 50, null, 52]);
  });

  it('the fixtures on disk are these — so the Swift half is never checked against an old phone', () => {
    expect(made.size).toBe(SCENARIOS.length);
    if (process.env.SYNC_FIXTURES === 'write') {
      if (!existsSync(FIXTURES)) mkdirSync(FIXTURES, { recursive: true });
      for (const [name, body] of made) writeFileSync(join(FIXTURES, `${name}.json`), JSON.stringify(body, null, 1) + '\n');
      return;
    }
    for (const [name, body] of made) {
      const file = join(FIXTURES, `${name}.json`);
      expect({ name, exists: existsSync(file) }).toEqual({ name, exists: true });
      expect({ name, fixture: JSON.parse(readFileSync(file, 'utf8')) }).toEqual({ name, fixture: JSON.parse(JSON.stringify(body)) });
    }
    // …and no fixture is left on disk for a scenario this file no longer has.
    expect(readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).sort()).toEqual([...made.keys()].map((n) => `${n}.json`).sort());
  });

  it('⛔ the gaps that are still open are exactly these — closing one is said here, in the same change', () => {
    // None, as of 2026-10-13: a superset, a day with a hold or a carry, and her own weight carried
    // forward all run on the wrist alone exactly as the phone runs them. A new gap is NAMED here.
    expect(SCENARIOS.filter((s) => s.agrees !== true).map((s) => `${s.name} · stage ${s.agrees.stage} · ${s.agrees.gap}`)).toEqual([]);
  });
});
