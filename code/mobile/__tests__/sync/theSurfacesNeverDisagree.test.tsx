/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SURFACES NEVER DISAGREE — the sync simulator. (founder 2026-09-17)
 *
 *   > *"שהלייב אקטיביטי, הפלאפון, האפל ווטש, האודיו בפלאפון, הדיינמיק איילנד כולם עובדים בהרמוניה
 *   >  ובסינכרון מושלם… חייב שהכל יעבוד בסנכרון מושלם."*
 *
 * Every earlier sync law pinned ONE seam somebody had already tripped over in a gym. This one does
 * not wait for the gym. It mounts the REAL session store and drives one workout through every door
 * a set, a rest or a pause can come in by — the stage, the wrist (through the real bridge and the
 * real intent decision), the lock screen / Dynamic Island (through `applyLockIntents`, the queue the
 * widget writes), the voice's verb — and after EVERY step it reads all five surfaces at once:
 *
 *   PHONE   · `useSession()` — what the stage draws
 *   WATCH   · the last envelope the fake WatchConnectivity transport was handed
 *   LOCK    · `liveActivityStateFromMirror` of what the ActivityKit host was handed. The Dynamic
 *             Island is drawn by the same widget from the SAME ContentState, so it is this row too.
 *   AUDIO   · a real `VoiceConductor` observing the same view: the timer it schedules for
 *             "ten seconds" and what it says
 *   BUZZ    · the OS rest alert the phone would arm (`restHaptics.arm` with the store's end)
 *
 * …and asserts they state ONE workout: the same lift, the same set, the same load, the same count
 * of logged sets, the same rest end to the millisecond, the same pause. Then it does it again for
 * hundreds of random interleavings (seeded — a failure prints the seed and the step log).
 *
 * ── Scope, honestly ─────────────────────────────────────────────────────────────────────────────
 * What this proves: the PHONE hands every surface the same truth at every step, whatever order the
 * doors are used in. What it cannot: Bluetooth latency, iOS suspending a process, ActivityKit's
 * update budget, and how SwiftUI draws the fields — the Swift decode of these same frames is pinned
 * by the golden fixtures (`__fixtures__/sync`) and the macOS CI job; the rest is the on-device
 * sync log.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
//
import React from 'react';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { db } from '@/data/local/db';
import type { PlannedSession } from '@/domain/coachPlan';
import { WATCH_PROTOCOL_VERSION } from '@/platform/watch/protocol';
import { VoiceConductor } from '@/platform/voice/voiceConductor';

// ── the surfaces, captured ───────────────────────────────────────────────────────────────────────
const wire = {
  envelopes: [] as any[],
  intentCb: null as null | ((raw: unknown) => void),
  la: [] as { op: string; mirror: any; lock: any }[],
  laEnded: 0,
  armed: [] as { endMs: number; at: number }[],
  disarmed: 0,
};

jest.mock('@/platform/watch/watchTransportNative', () => ({
  watchTransport: {
    isReachable: () => true,
    sendState: (env: unknown) => {
      wire.envelopes.push(JSON.parse(JSON.stringify(env)));
      return true;
    },
    onIntent: (cb: (raw: unknown) => void) => {
      wire.intentCb = cb;
      return () => {};
    },
    onReachabilityChange: () => () => {},
    onSessionRecord: () => () => {},
    ackRecord: () => {},
  },
}));

jest.mock('@/platform/liveActivity', () => {
  const actual = jest.requireActual('@/platform/liveActivity');
  return {
    ...actual,
    liveActivity: {
      start: async (mirror: unknown, lock: unknown) => void wire.la.push({ op: 'start', mirror: JSON.parse(JSON.stringify(mirror)), lock }),
      update: async (mirror: unknown, lock: unknown) => void wire.la.push({ op: 'update', mirror: JSON.parse(JSON.stringify(mirror)), lock }),
      end: async () => void (wire.laEnded += 1),
    },
    drainLockIntents: async () => [],
    addLockIntentListener: () => () => {},
    syncLiveActivity: async () => {},
  };
});

jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => false,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  restHaptics: {
    arm: jest.fn(async (endMs: number) => void wire.armed.push({ endMs, at: Date.now() })),
    disarm: jest.fn(async () => void (wire.disarmed += 1)),
  },
}));
jest.mock('@/platform/setNudge', () => ({
  setNudge: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/coach/afterSession', () => ({
  askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })),
}));

const { liveActivityStateFromMirror, holdLabelOf } = jest.requireActual('@/platform/liveActivity');

// ── the workout: two lifts, a timed hold between them (the set-space ≠ step-space trap) ──────────
const BENCH = 'bb_bench_press';
const ROW = 'bb_row';
const PLAN: PlannedSession = {
  name: 'Upper A',
  blocks: [
    { rounds: 3, items: [{ kind: 'reps', ex: BENCH, load: 60, reps: [8, 10] }] },
    { rounds: 1, restS: 45, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
    { rounds: 2, items: [{ kind: 'reps', ex: ROW, load: 50, reps: [8, 12] }] },
  ],
};

/** A second shape: a bodyweight lift, a loaded CARRY measured in metres, a dumbbell lift. */
const PLAN_B: PlannedSession = {
  name: 'Full B',
  blocks: [
    { rounds: 2, items: [{ kind: 'reps', ex: 'push_up', reps: [8, 12] }] },
    { rounds: 2, restS: 60, items: [{ kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24 }] },
    { rounds: 2, items: [{ kind: 'reps', ex: 'db_row', load: 20, reps: [8, 12] }] },
  ],
};

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

/*
 * ⚠️ THE WHOLE CLOCK, NOT ONLY `Date.now` — the store stamps with `new Date()` too (the resume
 * snapshot's `savedAt`), and a spy on `Date.now` alone made every resume look minutes-or-years old
 * and be refused. Only the DATE is faked; the timers stay real so `settle()` still yields.
 */
let now = 1_800_000_000_000;
const setNow = (t: number) => {
  now = t;
  jest.setSystemTime(t);
};
jest.useFakeTimers({
  doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback'],
});

beforeEach(async () => {
  await db.clearAll();
  setNow(1_800_000_000_000);
  wire.envelopes = [];
  wire.intentCb = null;
  wire.la = [];
  wire.laEnded = 0;
  wire.armed = [];
  wire.disarmed = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove() {} }) as never);
});
afterAll(() => jest.useRealTimers());

// ── the voice, over the same view ────────────────────────────────────────────────────────────────
function voice(getView: () => SessionView) {
  const said: string[] = [];
  const timers = new Map<number, { atMs: number; label: string }>();
  let seq = 0;
  const c = new VoiceConductor({
    mouth: { say: async (line: string) => void said.push(line), interrupt() {}, available: () => true },
    ear: { open: () => ({ close() {} }), available: () => true },
    audio: { duck: async () => {}, unduck: async () => {}, playChime: async () => {} },
    now: () => now,
    setTimeout: (_f: () => void, ms: number) => {
      seq += 1;
      timers.set(seq, { atMs: now + ms, label: String(_f).slice(0, 40) });
      return seq;
    },
    clearTimeout: (h: number) => void timers.delete(h),
    getView,
    locale: () => ({ locale: 'en', units: 'kg' }),
    firstSessionEver: () => false,
    track: () => {},
  });
  return { c, said, timers };
}

function mount() {
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
  const v = voice(() => view!);
  v.c.enable();
  const lastExtra = { s: 0 };
  /** What `useVoiceCoach` does on every view change. */
  const feedVoice = () => {
    v.c.observe(view!);
    if (view!.restExtraSeconds !== lastExtra.s) {
      lastExtra.s = view!.restExtraSeconds;
      v.c.onRestExtended(view!);
    }
  };
  return { view: () => view!, voice: v, feedVoice, unmount: () => act(() => tree.unmount()) };
}

// ── the five readings, and the one question they must all answer the same way ────────────────────
const lastEnvelope = () => wire.envelopes[wire.envelopes.length - 1] ?? null;
const lastLa = () => wire.la[wire.la.length - 1] ?? null;

function phoneReading(v: SessionView) {
  const cur = v.livePlan[v.globalProgress?.index ?? -1] ?? null;
  const resting = v.displayPhase === 'REST_INTER' || v.displayPhase === 'REST_TRANSITION';
  return {
    active: v.active,
    paused: v.paused,
    resting,
    exerciseId: v.currentExerciseId,
    loggedSets: v.loggedSets.length,
    restEndsAtMs: v.paused ? null : resting ? v.restEndsAtMs : null,
    frozenS: v.paused && resting ? v.restFrozenRemainingS : null,
    targetWeight: v.currentTarget?.recommendedWeight ?? null,
    setN: v.setLabel?.n ?? null,
    setM: v.setLabel?.m ?? null,
    nextExerciseId: v.nextExerciseId,
    cur,
  };
}

/**
 * The agreement. Returns a list of disagreements (empty = the five surfaces say one thing).
 * Each line names the surface and the two values, because a sync failure is only useful if it says
 * WHO drifted from WHOM.
 */
function disagreements(v: SessionView, voiceState: ReturnType<typeof voice>): string[] {
  const out: string[] = [];
  const p = phoneReading(v);
  const env = lastEnvelope();
  const la = lastLa();
  const m = env?.mirror ?? null;

  if (!p.active) {
    if (m && m.phase !== 'complete') out.push(`WATCH still shows a live ${m.phase} after the session ended`);
    return out;
  }
  if (!m) return [`WATCH has no mirror while the phone runs a session`];

  // WATCH ≡ LOCK: one projection, byte for byte.
  if (!la) out.push('LOCK never received a frame');
  else if (JSON.stringify(la.mirror) !== JSON.stringify(m)) {
    const keys = Object.keys(m).filter((k) => JSON.stringify(m[k]) !== JSON.stringify(la.mirror[k]));
    out.push(`LOCK≠WATCH on ${keys.join(',')}`);
  }

  // PHASE
  const want = p.paused ? 'paused' : p.resting ? (v.displayPhase === 'REST_INTER' ? 'rest_inter' : 'rest_transition') : 'active_set';
  if (m.phase !== want) out.push(`phase: PHONE ${want} / WATCH ${m.phase}`);

  // THE REST END — one instant everywhere.
  const watchEnd = m.restEndsAt ? Date.parse(m.restEndsAt) : null;
  if (p.restEndsAtMs !== watchEnd) out.push(`rest end: PHONE ${p.restEndsAtMs} / WATCH ${watchEnd} (Δ ${watchEnd != null && p.restEndsAtMs != null ? watchEnd - p.restEndsAtMs : 'n/a'} ms)`);
  const card = la ? liveActivityStateFromMirror(la.mirror, la.lock) : null;
  if (card && p.restEndsAtMs !== card.restEndsAtMs) out.push(`rest end: PHONE ${p.restEndsAtMs} / LOCK ${card.restEndsAtMs}`);
  if (card && card.isResting !== (p.resting && !p.paused) && !p.paused) out.push(`resting: PHONE ${p.resting} / LOCK ${card.isResting}`);
  // …and the frozen remainder while paused (the watch receives no end then, by design).
  if (p.paused && p.resting && p.frozenS == null) out.push('PHONE paused in a rest with no frozen remainder');

  // THE SET ON STAGE (active set only — on a rest every surface names what is COMING).
  if (!p.resting && !p.paused && p.cur?.target) {
    const name = v.currentExercise?.name;
    if (name && m.exerciseName !== name) out.push(`lift: PHONE ${name} / WATCH ${m.exerciseName}`);
    if ((p.targetWeight ?? null) !== (m.targetWeight ?? null)) out.push(`load: PHONE ${p.targetWeight} / WATCH ${m.targetWeight}`);
    if (p.setN != null && m.setNumber !== p.setN) out.push(`set #: PHONE ${p.setN} / WATCH ${m.setNumber}`);
    if (p.setM != null && m.setsInExercise !== p.setM) out.push(`sets in lift: PHONE ${p.setM} / WATCH ${m.setsInExercise}`);
    if (card && (card.targetWeight ?? null) !== (p.targetWeight ?? null)) out.push(`load: PHONE ${p.targetWeight} / LOCK ${card.targetWeight}`);
    if (card && p.setN != null && card.setIndex !== p.setN) out.push(`set #: PHONE ${p.setN} / LOCK ${card.setIndex}`);
  }
  if (p.resting && !p.paused && v.nextSetLabel && v.nextTarget) {
    // The COMING set — the only one a resting athlete is asking about.
    if (m.nextSetNumber !== v.nextSetLabel.n) out.push(`next set #: PHONE ${v.nextSetLabel.n} / WATCH ${m.nextSetNumber}`);
    if ((m.nextTargetWeight ?? null) !== (v.nextTarget.recommendedWeight ?? null)) out.push(`next load: PHONE ${v.nextTarget.recommendedWeight} / WATCH ${m.nextTargetWeight}`);
    if (card && card.setIndex !== v.nextSetLabel.n) out.push(`next set #: PHONE ${v.nextSetLabel.n} / LOCK ${card.setIndex}`);
    if (card && (card.targetWeight ?? null) !== (v.nextTarget.recommendedWeight ?? null)) out.push(`next load: PHONE ${v.nextTarget.recommendedWeight} / LOCK ${card.targetWeight}`);
  }
  if (p.resting && !p.paused) {
    const nextName = v.nextExercise?.name ?? null;
    if (v.displayPhase === 'REST_TRANSITION' && nextName && m.nextExerciseName !== nextName) {
      out.push(`next lift: PHONE ${nextName} / WATCH ${m.nextExerciseName}`);
    }
    if (v.nextTarget && (v.nextTarget.recommendedWeight ?? null) !== (m.nextTargetWeight ?? null) && v.displayPhase === 'REST_TRANSITION') {
      out.push(`next load: PHONE ${v.nextTarget.recommendedWeight} / WATCH ${m.nextTargetWeight}`);
    }
  }

  // A HOLD OR A CARRY on stage: every surface draws its duration, none draws a set.
  const item = v.currentItem;
  if (!p.resting && !p.paused && !v.currentTarget && item && item.kind !== 'reps') {
    const secs = item.kind === 'time' ? item.seconds : null;
    const metres = item.kind === 'distance' ? item.metres : null;
    if ((m.holdSeconds ?? null) !== secs || (m.holdMetres ?? null) !== metres) out.push(`hold: PHONE ${secs ?? metres} / WATCH ${m.holdSeconds ?? m.holdMetres}`);
    if (!m.exerciseName) out.push('hold: WATCH names no movement');
    if (card && card.holdLabel !== holdLabelOf(secs, metres)) out.push(`hold: PHONE ${holdLabelOf(secs, metres)} / LOCK ${card.holdLabel}`);
  } else if (!p.resting && !p.paused && m.phase === 'active_set' && (m.holdSeconds != null || m.holdMetres != null)) {
    out.push('hold: WATCH draws a hold while the phone is on a set');
  }
  // …and on a rest that leads INTO one.
  const nextItem = v.nextItem;
  if (p.resting && !p.paused && nextItem && nextItem.kind !== 'reps' && !v.nextTarget) {
    const secs = nextItem.kind === 'time' ? nextItem.seconds : null;
    const metres = nextItem.kind === 'distance' ? nextItem.metres : null;
    if ((m.nextHoldSeconds ?? null) !== secs || (m.nextHoldMetres ?? null) !== metres) out.push(`next hold: PHONE ${secs ?? metres} / WATCH ${m.nextHoldSeconds ?? m.nextHoldMetres}`);
    if (card && card.holdLabel !== holdLabelOf(secs, metres)) out.push(`next hold: PHONE ${holdLabelOf(secs, metres)} / LOCK ${card.holdLabel}`);
    const nextName = v.nextExercise?.name ?? null;
    if (nextName && m.nextExerciseName !== nextName) out.push(`next: PHONE ${nextName} / WATCH ${m.nextExerciseName}`);
  }

  // AUDIO — "ten seconds" is scheduled against the same end, or not at all.
  if (p.resting && !p.paused && p.restEndsAtMs != null) {
    const tenS = [...voiceState.timers.values()].map((t) => t.atMs);
    const expected = p.restEndsAtMs - 10_000;
    if (expected > now && tenS.length > 0 && !tenS.includes(expected)) {
      out.push(`voice: "ten seconds" at ${tenS.map((t) => t - p.restEndsAtMs!).join('/')} ms from the end, not −10000`);
    }
  }
  return out;
}

// ── the golden frames: what the PHONE says, beside the exact bytes the wrist is sent ─────────────
/*
 * ⛔ THE OTHER HALF OF THE WIRE IS SWIFT, AND NO MACHINE HERE COMPILES IT. So the frames this simulator
 * produced at the moments that matter are written to `__fixtures__/` beside the facts the PHONE's
 * own view states at that moment, and the macOS CI job decodes every envelope with the watch's real
 * `WatchWire.decodeEnvelope` (`native-tests/wire-fixtures/main.swift`) and checks each fact. A frame
 * the phone sends and the wrist reads differently fails there, not in a gym.
 *
 * The files are regenerated with `SYNC_FIXTURES=write` and compared otherwise — a stale fixture is a
 * test failure, so the Swift check can never be proving an old wire.
 */
const FIXTURES = join(__dirname, '__fixtures__');
const frames = new Map<string, unknown>();

function phoneFacts(v: SessionView) {
  const resting = v.displayPhase === 'REST_INTER' || v.displayPhase === 'REST_TRANSITION';
  const item = v.currentItem && v.currentItem.kind !== 'reps' ? v.currentItem : null;
  const nextItem = v.nextItem && v.nextItem.kind !== 'reps' && !v.nextTarget ? v.nextItem : null;
  if (!v.active) return { phase: 'complete' };
  return {
    phase: v.paused ? 'paused' : resting ? (v.displayPhase === 'REST_INTER' ? 'rest_inter' : 'rest_transition') : 'active_set',
    restEndsAtMs: v.paused || !resting ? null : v.restEndsAtMs,
    ...(!resting && !v.paused
      ? {
          exerciseName: v.currentExercise?.name ?? (item ? lastEnvelope().mirror.exerciseName : null),
          targetWeight: item ? (item as any).load ?? null : v.currentTarget?.recommendedWeight ?? null,
          setNumber: v.setLabel?.n ?? null,
          holdSeconds: item?.kind === 'time' ? item.seconds : null,
          holdMetres: item?.kind === 'distance' ? item.metres : null,
        }
      : {}),
    ...(resting && !v.paused
      ? {
          nextSetNumber: v.nextSetLabel?.n ?? null,
          nextTargetWeight: nextItem ? (nextItem as any).load ?? null : v.nextTarget?.recommendedWeight ?? null,
          nextHoldSeconds: nextItem?.kind === 'time' ? nextItem.seconds : null,
          nextHoldMetres: nextItem?.kind === 'distance' ? nextItem.metres : null,
        }
      : {}),
  };
}

function frame(h: ReturnType<typeof mount>, name: string) {
  frames.set(name, { phone: phoneFacts(h.view()), envelope: lastEnvelope() });
}

function settleFixtures() {
  if (frames.size === 0) return;
  if (process.env.SYNC_FIXTURES === 'write') {
    if (!existsSync(FIXTURES)) mkdirSync(FIXTURES);
    for (const [name, body] of frames) writeFileSync(join(FIXTURES, `${name}.json`), JSON.stringify(body, null, 2) + '\n');
    return;
  }
  for (const [name, body] of frames) {
    const file = join(FIXTURES, `${name}.json`);
    expect({ name, exists: existsSync(file) }).toEqual({ name, exists: true });
    expect({ name, frame: JSON.parse(readFileSync(file, 'utf8')) }).toEqual({ name, frame: JSON.parse(JSON.stringify(body)) });
  }
}

// ── the doors ────────────────────────────────────────────────────────────────────────────────────
let intentSeq = 0;
function wrist(type: string, extra: Record<string, unknown> = {}) {
  const m = lastEnvelope()?.mirror;
  intentSeq += 1;
  wire.intentCb?.({
    v: WATCH_PROTOCOL_VERSION,
    type,
    intentId: `w${intentSeq}`,
    issuedAt: new Date(now).toISOString(),
    expectedGlobalIndex: m?.globalIndex,
    ...extra,
  });
}

type Door = 'phone' | 'wrist' | 'lock' | 'voice';

async function doSet(h: ReturnType<typeof mount>, door: Door) {
  const v = h.view();
  if (v.displayPhase !== 'SET_PRESENTED' || v.paused || !v.active) return;
  if (!v.currentTarget) {
    // A hold or a carry — through the same door as a set (the wrist and the card finish it as prescribed).
    if (door === 'wrist') await act(async () => wrist('complete_set'));
    else if (door === 'lock') await act(async () => v.applyLockIntents([{ id: `l${++intentSeq}`, type: 'complete_set', atMs: now }]));
    else await act(async () => void (await v.completeItem()));
    await settle();
    return;
  }
  if (door === 'phone') await act(async () => void (await v.completeSet()));
  else if (door === 'wrist') await act(async () => wrist('complete_set'));
  else if (door === 'lock') await act(async () => v.applyLockIntents([{ id: `l${++intentSeq}`, type: 'complete_set', atMs: now }]));
  else {
    const w = v.currentTarget.recommendedWeight ?? null;
    const r = v.currentTarget.recommendedReps ?? 8;
    await act(async () => void (await v.completeSet({ weight: w, reps: r })));
    await act(async () => h.view().announceLoggedSet(w, r));
  }
  await settle();
}

async function doExtend(h: ReturnType<typeof mount>, door: Door) {
  const v = h.view();
  if (!(v.displayPhase === 'REST_INTER' || v.displayPhase === 'REST_TRANSITION')) return;
  if (door === 'wrist') await act(async () => wrist('add_rest', { seconds: 15 }));
  else if (door === 'lock') await act(async () => v.applyLockIntents([{ id: `l${++intentSeq}`, type: 'add_rest', atMs: now }]));
  else await act(async () => v.extendRest(15));
  await settle();
}

async function doEndRest(h: ReturnType<typeof mount>, door: Door) {
  const v = h.view();
  if (!(v.displayPhase === 'REST_INTER' || v.displayPhase === 'REST_TRANSITION') || v.paused) return;
  if (door === 'wrist') await act(async () => wrist('end_rest'));
  else if (door === 'lock') await act(async () => v.applyLockIntents([{ id: `l${++intentSeq}`, type: 'end_rest', atMs: now }]));
  else await act(async () => v.endRest());
  await settle();
}

async function doPause(h: ReturnType<typeof mount>, door: Door) {
  const v = h.view();
  if (!v.active) return;
  if (door === 'wrist') await act(async () => wrist(v.paused ? 'resume' : 'pause'));
  else await act(async () => (v.paused ? v.resume() : v.pause()));
  await settle();
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function later(h: ReturnType<typeof mount>, ms: number) {
  setNow(now + ms);
  await settle();
}

/** In the fuzz, disagreements are COLLECTED by kind (the message with its numbers blanked), so one
 *  run names every distinct fault with the shortest step log that produced it. */
let collector: Map<string, string> | null = null;

function check(h: ReturnType<typeof mount>, log: string[], label: string) {
  act(() => h.feedVoice());
  const d = disagreements(h.view(), h.voice);
  log.push(`${label} → ${h.view().displayPhase}${h.view().paused ? ' (paused)' : ''} sets=${h.view().loggedSets.length}`);
  if (!d.length) return;
  const report = `after "${label}":\n  ${d.join('\n  ')}\n  steps:\n    ${log.join('\n    ')}`;
  if (!collector) throw new Error(`SURFACES DISAGREE ${report}`);
  for (const line of d) {
    const kind = line.replace(/-?\d+/g, '#');
    const prev = collector.get(kind);
    if (!prev || prev.length > report.length) collector.set(kind, report);
  }
}

// ── 1 · the scripted workout: every door, in the order a real session uses them ─────────────────
describe('the scripted workout — every door, one truth', () => {
  it('stage, wrist, lock screen and voice each drive a step, and all five surfaces agree after every one', async () => {
    const h = mount();
    const log: string[] = [];
    await act(async () => h.view().startCoach(PLAN, 'coach_0'));
    await settle();
    check(h, log, 'start');
    frame(h, 'set-first');

    await doSet(h, 'phone');           check(h, log, 'bench set 1 · phone');
    frame(h, 'rest-inter');
    await later(h, 20_000);            check(h, log, '20 s into rest');
    await doExtend(h, 'wrist');        check(h, log, '+15 · wrist');
    await doExtend(h, 'lock');         check(h, log, '+15 · lock screen');
    frame(h, 'rest-inter-extended');
    await doPause(h, 'phone');         check(h, log, 'pause · phone');
    frame(h, 'paused-in-rest');
    await later(h, 120_000);           check(h, log, 'two minutes paused');
    await doPause(h, 'wrist');         check(h, log, 'resume · wrist');
    await doEndRest(h, 'lock');        check(h, log, 'skip rest · lock screen');
    await doSet(h, 'wrist');           check(h, log, 'bench set 2 · wrist');
    await doEndRest(h, 'phone');       check(h, log, 'skip rest · phone');
    await doSet(h, 'lock');            check(h, log, 'bench set 3 · lock screen');
    frame(h, 'rest-transition-into-hold');
    await doEndRest(h, 'wrist');       check(h, log, 'skip transition · wrist');
    frame(h, 'hold');
    await doSet(h, 'phone');           check(h, log, 'plank hold · phone');
    frame(h, 'rest-transition-after-hold');
    await doEndRest(h, 'phone');       check(h, log, 'skip rest after hold');
    await doSet(h, 'voice');           check(h, log, 'row set 1 · voice');
    await later(h, 200_000);           check(h, log, 'rest ran past its end');
    await doEndRest(h, 'wrist');       check(h, log, 'rest ended · wrist');
    expect(h.view().loggedSets.length).toBe(4); // three bench, one row — the hold is an item, not a set
    await doSet(h, 'wrist');           check(h, log, 'row set 2 · wrist');
    // The last set closes the workout: the wrist got its closing frame and the card was ended.
    expect(h.view().active).toBe(false);
    expect(lastEnvelope().mirror?.phase ?? 'complete').toBe('complete');
    expect(wire.laEnded).toBeGreaterThan(0);
    frames.set('complete', { phone: { phase: 'complete' }, envelope: wire.envelopes.find((e) => e.mirror?.phase === 'complete') });
    settleFixtures();
    frames.clear();
  });

  it('⛔ the same tap arriving twice — wrist replay — logs ONE set on every surface', async () => {
    const h = mount();
    const log: string[] = [];
    await act(async () => h.view().startCoach(PLAN, 'coach_0'));
    await settle();
    const m = lastEnvelope().mirror;
    const intent = { v: WATCH_PROTOCOL_VERSION, type: 'complete_set', intentId: 'dup-1', issuedAt: new Date(now).toISOString(), expectedGlobalIndex: m.globalIndex };
    await act(async () => wire.intentCb!(intent));
    await settle();
    await act(async () => wire.intentCb!(intent));
    await settle();
    check(h, log, 'wrist tap delivered twice');
    expect(h.view().loggedSets.length).toBe(1);
  });

  it('⛔ two doors in the same second — a wrist tap and a lock-screen tap for the SAME set — log ONE set', async () => {
    const h = mount();
    const log: string[] = [];
    await act(async () => h.view().startCoach(PLAN, 'coach_0'));
    await settle();
    const v = h.view();
    await act(async () => {
      wrist('complete_set');
      await v.applyLockIntents([{ id: 'l-same', type: 'complete_set', atMs: now }]);
    });
    await settle();
    check(h, log, 'wrist + lock screen, same set, same second');
    expect(h.view().loggedSets.length).toBe(1);
  });
});

describe('⛔ a tap from the wrist after the phone slept acts on the workout AFTER the clock (found by this simulator, 2026-09-17)', () => {
  /*
   * The second thing the simulator found. The rest ran out while the phone slept; the wrist pressed
   * Pause. The bridge caught the clock up (the next set was presented) and then called `pause()` from
   * the PREVIOUS render, which reduced from the rest it remembered — resurrecting a served-out rest
   * with no anchor. The phone drew no clock; the wrist and the lock card each invented a full rest.
   */
  it('pause pressed on the wrist after the rest ran out pauses the SET, and every surface agrees', async () => {
    const h = mount();
    const log: string[] = [];
    await act(async () => h.view().startCoach(PLAN, 'coach_0'));
    await settle();
    await doSet(h, 'phone');
    check(h, log, 'set 1');
    expect(h.view().displayPhase).toBe('REST_INTER');
    await later(h, 10 * 60_000); // the phone sleeps through the whole rest — no clock runs
    await act(async () => wrist('pause'));
    await settle();
    check(h, log, 'pause · wrist, after the rest ran out');
    expect(h.view().paused).toBe(true);
    expect(h.view().displayPhase).toBe('SET_PRESENTED');
    expect(lastEnvelope().mirror.restEndsAt).toBeNull();
    await act(async () => wrist('resume'));
    await settle();
    check(h, log, 'resume · wrist');
    expect(h.view().displayPhase).toBe('SET_PRESENTED');
    expect(lastEnvelope().mirror.phase).toBe('active_set');
  });

  it('the voice counts "ten seconds" to the same instant the wrist and the card count to', async () => {
    const h = mount();
    const log: string[] = [];
    await act(async () => h.view().startCoach(PLAN, 'coach_0'));
    await settle();
    await doSet(h, 'phone');
    check(h, log, 'set 1');
    const end = Date.parse(lastEnvelope().mirror.restEndsAt);
    expect([...h.voice.timers.values()].map((t) => t.atMs)).toContain(end - 10_000);
    await doExtend(h, 'wrist');
    check(h, log, '+15 · wrist');
    const moved = Date.parse(lastEnvelope().mirror.restEndsAt);
    expect(moved).toBe(end + 15_000);
    expect([...h.voice.timers.values()].map((t) => t.atMs)).toContain(moved - 10_000);
  });
});

describe('⛔ a hold on stage is a hold on every surface (found by this simulator, 2026-09-17)', () => {
  /*
   * The first thing the simulator found. A plank between two lifts was left out of the mirror, so
   * while she held it the wrist and the lock card showed the NEXT lift's load and reps, a Done on
   * either was refused in silence, and the rests either side of the hold named the wrong set.
   */
  it('the wrist and the card name the plank and its seconds, and Done on either one finishes it', async () => {
    for (const door of ['wrist', 'lock'] as const) {
      await db.clearAll();
      const h = mount();
      const log: string[] = [];
      await act(async () => h.view().startCoach(PLAN, 'coach_0'));
      await settle();
      for (let i = 0; i < 3; i++) {
        await doSet(h, 'phone');
        await doEndRest(h, 'phone');
      }
      expect(h.view().currentExerciseId).toBe('plank');
      check(h, log, 'plank on stage');
      const m = lastEnvelope().mirror;
      expect(m).toMatchObject({ phase: 'active_set', exerciseName: 'Plank', holdSeconds: 45, holdMetres: null, targetReps: 0 });
      expect(liveActivityStateFromMirror(lastLa().mirror, lastLa().lock).holdLabel).toBe('0:45');
      await doSet(h, door);
      check(h, log, `plank finished · ${door}`);
      expect(h.view().displayPhase).toBe('REST_TRANSITION');
      expect(h.view().nextExerciseId).toBe(ROW);
      h.unmount();
    }
  });

  it('a CARRY crosses in metres, with its load, and a bodyweight lift crosses with no load', async () => {
    const h = mount();
    const log: string[] = [];
    await act(async () => h.view().startCoach(PLAN_B, 'coach_0'));
    await settle();
    expect(lastEnvelope().mirror.targetWeight ?? null).toBeNull();
    for (let i = 0; i < 2; i++) {
      await doSet(h, 'wrist');
      check(h, log, `push-up ${i + 1}`);
      await doEndRest(h, 'lock');
      check(h, log, 'rest skipped');
    }
    expect(h.view().currentExerciseId).toBe('farmer_carry');
    expect(lastEnvelope().mirror).toMatchObject({ holdMetres: 40, holdSeconds: null, targetWeight: 24 });
    frame(h, 'carry');
    settleFixtures();
    frames.clear();
  });
});

// ── 2 · the fuzz: hundreds of interleavings nobody would think to script ────────────────────────
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

const SEEDS = Number(process.env.SYNC_FUZZ_SEEDS ?? 60);

describe('the fuzz — random doors, random timing', () => {
  jest.setTimeout(240_000);
  it(`${SEEDS} seeded workouts, every step checked on all five surfaces`, async () => {
    collector = new Map();
    for (let seed = 1; seed <= SEEDS; seed++) {
      await db.clearAll();
      wire.envelopes = [];
      wire.la = [];
      const r = rng(seed);
      const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
      const doors: Door[] = ['phone', 'wrist', 'lock', 'voice'];
      let h = mount();
      const plan = seed % 2 ? PLAN : PLAN_B;
      const log: string[] = [`seed ${seed} · ${plan.name}`];
      await act(async () => h.view().startCoach(plan, 'coach_0'));
      await settle();
      check(h, log, 'start');
      for (let step = 0; step < 45 && h.view().active; step++) {
        const roll = r();
        const door = pick(doors);
        const v = h.view();
        if (roll < 0.3) { await doSet(h, door); check(h, log, `set · ${door}`); }
        else if (roll < 0.4) { await doExtend(h, door); check(h, log, `+15 · ${door}`); }
        else if (roll < 0.52) { await doEndRest(h, door); check(h, log, `end rest · ${door}`); }
        else if (roll < 0.6) { await doPause(h, door === 'lock' || door === 'voice' ? 'phone' : door); check(h, log, `pause/resume · ${door}`); }
        else if (roll < 0.65) {
          // The voice moves the coming load.
          const base = v.currentTarget?.recommendedWeight ?? v.nextTarget?.recommendedWeight;
          if (base != null) { await act(async () => v.setLiftLoad(base + 2.5)); await settle(); }
          check(h, log, 'voice moves the load');
        } else if (roll < 0.69) {
          await act(async () => v.addWarmup());
          await settle();
          check(h, log, 'warm-up added');
        } else if (roll < 0.74) {
          // A swap — from the wrist's own menu, or the phone's.
          const opt = lastEnvelope()?.mirror?.swapOptions?.[0] ?? lastEnvelope()?.mirror?.nextSwapOptions?.[0];
          if (opt && door === 'wrist') await act(async () => wrist('swap_exercise', { exerciseId: opt.id }));
          else if (opt && v.displayPhase === 'REST_TRANSITION') await act(async () => v.swapNextExercise(opt.id));
          else if (opt && v.displayPhase === 'SET_PRESENTED') await act(async () => v.swapCurrentExercise(opt.id));
          await settle();
          check(h, log, `swap · ${door}`);
        } else if (roll < 0.78) {
          // The station is taken.
          if (door === 'wrist') await act(async () => wrist('exercise_busy'));
          else if (v.canMarkOccupied) await act(async () => v.markEquipmentOccupied());
          await settle();
          check(h, log, `busy · ${door}`);
        } else if (roll < 0.82) {
          // iOS kills the app mid-workout; she opens it again.
          h.unmount();
          wire.intentCb = null;
          await later(h, Math.floor(r() * 90_000));
          h = mount();
          let resumed: boolean | null = null;
          const snapBefore = await db.loadSessionResume();
          const activeBefore = await db.loadActiveSession();
          await act(async () => void (resumed = await h.view().resumeSaved()));
          if (process.env.SYNC_DEBUG) console.log('RESUME', JSON.stringify({ seed, resumed, snap: !!snapBefore, active: !!activeBefore, phase: snapBefore?.machine?.phase }));
          await settle();
          check(h, log, 'app killed and resumed');
        } else { const ms = Math.floor(r() * 150_000); await later(h, ms); check(h, log, `wait ${ms} ms`); }
      }
      h.unmount();
    }
    const found = collector;
    collector = null;
    if (found.size) {
      throw new Error(`${found.size} KIND(S) OF DISAGREEMENT:\n\n${[...found.entries()].map(([k, r]) => `■ ${k}\n  ${r}`).join('\n\n')}`);
    }
  });
});
