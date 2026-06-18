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
