/**
 * Apple Watch protocol — source-of-truth enforcement + serialization. The phone
 * validates every watch intent against its own mirror; the phone's truth wins.
 * Pure, no native.
 */
import {
  decideWatchIntent,
  makeStateEnvelope,
  serializeEnvelope,
  parseEnvelope,
  serializeIntent,
  parseWatchIntent,
  WATCH_INTENT_TTL_MS,
  WATCH_PROTOCOL_VERSION,
  type WatchIntent,
} from '@/platform/watch/protocol';
import type { SessionMirror } from '@/platform/sessionMirror';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

function mirror(over: Partial<SessionMirror> = {}): SessionMirror {
  return {
    schema: 1,
    phase: 'active_set',
    exerciseName: 'Bench',
    setLabel: 'Set 1 of 3',
    globalIndex: 0,
    totalSets: 3,
    targetWeight: 60,
    targetReps: 5,
    restEndsAt: null,
    restRemainingS: null,
    nextExerciseName: null,
    nextTargetWeight: null,
    nextTargetReps: null,
    completedExerciseName: null,
    canMarkBusy: false,
    loadDeltaKg: 0, nextLoadDeltaKg: 0, liftIndex: 1, liftCount: 3,
    workoutName: 'Upper A', summary: null, swapOptions: [], nextSwapOptions: [],
    ...over,
  };
}

function intent(over: Partial<WatchIntent> = {}): WatchIntent {
  return {
    v: WATCH_PROTOCOL_VERSION,
    type: 'complete_set',
    intentId: 'i1',
    issuedAt: new Date(NOW - 200).toISOString(),
    expectedGlobalIndex: 0,
    ...over,
  };
}

const NONE: ReadonlySet<string> = new Set();

describe('decideWatchIntent — acceptance', () => {
  it('accepts a plain complete_set on the active set (actual = target reps)', () => {
    const d = decideWatchIntent(intent(), mirror(), NOW, NONE);
    expect(d.accept).toBe(true);
    expect(d.action).toEqual({ kind: 'complete_set' }); // no actualReps → target reps
    expect(d.latencyMs).toBe(200); // watch completion latency
  });

  it('accepts a complete_set carrying adjusted actual reps (Couldn\'t Complete)', () => {
    const d = decideWatchIntent(intent({ actualReps: 6 }), mirror({ targetReps: 8 }), NOW, NONE);
    expect(d.accept).toBe(true);
    expect(d.action).toEqual({ kind: 'complete_set', actualReps: 6 });
  });

  it('maps end_rest → REST_ELAPSED during rest', () => {
    const d = decideWatchIntent(intent({ type: 'end_rest' }), mirror({ phase: 'rest_inter' }), NOW, NONE);
    expect(d.action).toEqual({ kind: 'session_event', event: { type: 'REST_ELAPSED' } });
  });

  it('maps pause / resume against the right phase', () => {
    expect(decideWatchIntent(intent({ type: 'pause' }), mirror(), NOW, NONE).action)
      .toEqual({ kind: 'session_event', event: { type: 'PAUSE' } });
    expect(decideWatchIntent(intent({ type: 'resume' }), mirror({ phase: 'paused' }), NOW, NONE).action)
      .toEqual({ kind: 'session_event', event: { type: 'RESUME' } });
  });

  it('accepts exercise_busy only when the phone says it is offerable', () => {
    const d = decideWatchIntent(intent({ type: 'exercise_busy' }), mirror({ canMarkBusy: true }), NOW, NONE);
    expect(d.accept).toBe(true);
    expect(d.action).toEqual({ kind: 'mark_equipment_occupied' });
  });

  it('accepts a Start-screen select_workout / start_workout when there is NO active session', () => {
    const sel = decideWatchIntent(intent({ type: 'select_workout', workoutId: 'w2', expectedGlobalIndex: undefined }), null, NOW, NONE);
    expect(sel.accept).toBe(true);
    expect(sel.action).toEqual({ kind: 'select_workout', workoutId: 'w2' });
    const start = decideWatchIntent(intent({ type: 'start_workout', workoutId: 'w2', expectedGlobalIndex: undefined }), null, NOW, NONE);
    expect(start.accept).toBe(true);
    expect(start.action).toEqual({ kind: 'start_workout', workoutId: 'w2' });
  });

  it('also accepts a lobby proposal over a completed (torn-down) session', () => {
    const d = decideWatchIntent(intent({ type: 'start_workout', expectedGlobalIndex: undefined }), mirror({ phase: 'complete' }), NOW, NONE);
    expect(d.accept).toBe(true);
    expect(d.action).toEqual({ kind: 'start_workout', workoutId: undefined });
  });
});

describe('decideWatchIntent — lobby proposals are gated to the lobby', () => {
  it('rejects a Start-screen proposal while a workout is ACTIVE (phone owns the lifecycle)', () => {
    expect(decideWatchIntent(intent({ type: 'start_workout', expectedGlobalIndex: undefined }), mirror(), NOW, NONE))
      .toMatchObject({ accept: false, reason: 'phase_mismatch' });
    expect(decideWatchIntent(intent({ type: 'select_workout', expectedGlobalIndex: undefined }), mirror({ phase: 'rest_inter' }), NOW, NONE))
      .toMatchObject({ accept: false, reason: 'phase_mismatch' });
  });

  it('still rejects an in-workout intent (complete_set) when there is no session', () => {
    expect(decideWatchIntent(intent(), null, NOW, NONE)).toMatchObject({ accept: false, reason: 'no_session' });
  });
});

describe('decideWatchIntent — the phone wins', () => {
  it('rejects a duplicate intent id (idempotency)', () => {
    expect(decideWatchIntent(intent(), mirror(), NOW, new Set(['i1'])))
      .toMatchObject({ accept: false, reason: 'duplicate' });
  });

  it('rejects a stale intent (arrived late after a reconnect)', () => {
    const stale = intent({ issuedAt: new Date(NOW - WATCH_INTENT_TTL_MS - 1).toISOString() });
    expect(decideWatchIntent(stale, mirror(), NOW, NONE)).toMatchObject({ accept: false, reason: 'stale' });
  });

  it('rejects any intent when there is no active session', () => {
    expect(decideWatchIntent(intent(), null, NOW, NONE)).toMatchObject({ accept: false, reason: 'no_session' });
    expect(decideWatchIntent(intent(), mirror({ phase: 'complete' }), NOW, NONE)).toMatchObject({ accept: false, reason: 'no_session' });
  });

  it('rejects complete_set during rest (phase mismatch)', () => {
    expect(decideWatchIntent(intent(), mirror({ phase: 'rest_inter' }), NOW, NONE))
      .toMatchObject({ accept: false, reason: 'phase_mismatch' });
  });

  it('rejects complete_set for a stale set index (optimistic concurrency)', () => {
    expect(decideWatchIntent(intent({ expectedGlobalIndex: 5 }), mirror({ globalIndex: 0 }), NOW, NONE))
      .toMatchObject({ accept: false, reason: 'index_mismatch' });
  });

  it('rejects exercise_busy when the phone says it is unavailable', () => {
    expect(decideWatchIntent(intent({ type: 'exercise_busy' }), mirror({ canMarkBusy: false }), NOW, NONE))
      .toMatchObject({ accept: false, reason: 'unavailable' });
  });

  it('rejects a wrong protocol version and malformed payloads', () => {
    expect(decideWatchIntent(intent({ v: 999 }), mirror(), NOW, NONE)).toMatchObject({ accept: false, reason: 'version' });
    expect(decideWatchIntent({}, mirror(), NOW, NONE)).toMatchObject({ accept: false, reason: 'malformed' });
    expect(decideWatchIntent(null, mirror(), NOW, NONE)).toMatchObject({ accept: false, reason: 'malformed' });
  });
});

describe('serialization layer (wire ⇄ object)', () => {
  it('round-trips a state envelope and rejects a wrong version', () => {
    const env = makeStateEnvelope(mirror(), 7, NOW);
    const back = parseEnvelope(serializeEnvelope(env));
    expect(back).toEqual(env);
    expect(parseEnvelope(JSON.stringify({ ...env, v: 999 }))).toBeNull();
    expect(parseEnvelope('not json')).toBeNull();
  });

  it('round-trips an intent and rejects an unknown type', () => {
    const i = intent({ type: 'exercise_busy' });
    expect(parseWatchIntent(JSON.parse(serializeIntent(i)))).toEqual(i);
    expect(parseWatchIntent({ type: 'launch_missiles', intentId: 'x', issuedAt: 'now' })).toBeNull();
    expect(parseWatchIntent(null)).toBeNull();
  });
});

/**
 * THE NUMBERS THE WATCH REPORTS ARE NOT TRUSTED (hardened 2026-07-13).
 *
 * The parser used to check the three routing fields and cast the rest of the payload straight
 * through, so a corrupt frame's numbers reached the session machine unexamined. Two of them are
 * load-bearing: `actualReps`/`actualWeight` are written into the athlete's set log and folded by
 * the engine forever, and `seconds` is ADDED to the rest — a NaN there makes the rest end NaN, and
 * the mirror's `new Date(NaN).toISOString()` throws inside the store's publish effect, mid-set.
 *
 * A field that is ABSENT still means "unadjusted". A field that is PRESENT but not a sane number
 * makes the whole frame malformed — corrupt is corrupt, and it is dropped, not half-believed.
 */
describe('a corrupt number makes the whole intent malformed', () => {
  const junk = [NaN, Infinity, -Infinity, -1, 1e12, '7' as unknown as number, null as unknown as number];

  it('rejects a nonsense +15 rather than poisoning the rest anchor', () => {
    for (const seconds of [...junk, 0, 601, 15.5]) {
      const d = decideWatchIntent(
        { ...intent({ type: 'add_rest' }), seconds },
        mirror({ phase: 'rest_inter', restRemainingS: 40, restTotalS: 90 }),
        NOW,
        NONE,
      );
      expect({ seconds, accept: d.accept, reason: d.reason }).toEqual({ seconds, accept: false, reason: 'malformed' });
    }
    // …and the real one still gets through.
    const ok = decideWatchIntent(
      { ...intent({ type: 'add_rest' }), seconds: 15 },
      mirror({ phase: 'rest_inter', restRemainingS: 40, restTotalS: 90 }),
      NOW,
      NONE,
    );
    expect(ok.action).toEqual({ kind: 'add_rest', seconds: 15 });
  });

  it('rejects a nonsense set — the log and the engine take what this writes, forever', () => {
    for (const actualReps of [...junk, 201, 8.5]) {
      const d = decideWatchIntent({ ...intent(), actualReps }, mirror(), NOW, NONE);
      expect({ actualReps, accept: d.accept }).toEqual({ actualReps, accept: false });
    }
    for (const actualWeight of [NaN, Infinity, -1, 1001, '60' as unknown as number]) {
      const d = decideWatchIntent({ ...intent(), actualWeight }, mirror(), NOW, NONE);
      expect({ actualWeight, accept: d.accept }).toEqual({ actualWeight, accept: false });
    }
  });

  it('bodyweight (actualWeight: null) survives the sieve — it is a value, not a hole', () => {
    const d = decideWatchIntent({ ...intent(), actualWeight: null, actualReps: 12 }, mirror(), NOW, NONE);
    expect(d.accept).toBe(true);
    expect(d.action).toEqual({ kind: 'complete_set', actualReps: 12, actualWeight: null });
  });

  it('an unadjusted set is still unadjusted — absent fields stay absent', () => {
    const d = decideWatchIntent(intent(), mirror(), NOW, NONE);
    expect(d.action).toEqual({ kind: 'complete_set', actualReps: undefined, actualWeight: undefined });
  });
});
