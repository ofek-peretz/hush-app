/**
 * Apple Watch companion protocol (non-native layer).
 *
 * Defines the wire contracts between the iPhone (sole authority) and the Watch
 * (a remote terminal), plus the PURE rules that enforce the phone's authority.
 * No WatchConnectivity / native code here — only schemas + validation + mapping,
 * so it is fully unit-testable on any host. The native WCSession transport is a
 * separate swap point (watchBridge.ts).
 *
 * Architecture (audit, ratified):
 *  - Phone → Watch: a read-only SessionMirror snapshot (the SAME canonical
 *    projection that feeds the Live Activity — no second projection system).
 *  - Watch → Phone: INTENTS, never state. The watch proposes an action; the
 *    phone validates it against its own truth and runs it through the one session
 *    machine. The watch never mutates its own state and keeps no workout database.
 *  - Offline: the watch is a terminal. A completion intent is NEVER queued on the
 *    watch (queuing risks double-logging and broken save-order); a stale intent
 *    after a reconnect is rejected. The phone remains able to complete a workout
 *    entirely on its own, online or offline.
 */
import type { SessionEvent } from '@/state/machines/sessionState';
import type { SessionMirror } from '@/platform/sessionMirror';

export const WATCH_PROTOCOL_VERSION = 1 as const;

/** How long a watch intent stays valid after it was issued. Beyond this it is
 *  rejected as stale — protects against an intent arriving late after a
 *  reconnect, when the phone has already moved on (audit offline rule). */
export const WATCH_INTENT_TTL_MS = 15_000;

// ---- Phone → Watch ---------------------------------------------------------

/** The envelope the phone publishes to the watch on every state change. */
export interface WatchStateEnvelope {
  v: typeof WATCH_PROTOCOL_VERSION;
  type: 'session_state';
  /** Read-only projection; null = no active session (watch tears its UI down). */
  mirror: SessionMirror | null;
  /** Monotonic authority sequence. The watch keeps the highest it has seen and
   *  ignores any envelope with a lower seq (last-write-wins, reorder-proof). */
  authoritySeq: number;
  sentAt: string; // ISO
}

export function makeStateEnvelope(
  mirror: SessionMirror | null,
  authoritySeq: number,
  sentAtMs: number,
): WatchStateEnvelope {
  return {
    v: WATCH_PROTOCOL_VERSION,
    type: 'session_state',
    mirror,
    authoritySeq,
    sentAt: new Date(sentAtMs).toISOString(),
  };
}

// ---- Watch → Phone ---------------------------------------------------------

/** The actions the watch may propose. The watch reports actual REPS (via the
 *  rep-adjustment screen behind "Couldn't Complete"); weight stays phone-only.
 *  `exercise_busy` maps to the phone's equipment-occupied reorder. */
export type WatchIntentType =
  | 'complete_set'
  | 'end_rest'
  | 'pause'
  | 'resume'
  | 'finish_early'
  | 'exercise_busy';

export interface WatchIntent {
  v: number;
  type: WatchIntentType;
  /** Idempotency key — the phone de-dupes replays of the same intent. */
  intentId: string;
  issuedAt: string; // ISO, used to measure completion latency + reject stale
  /** The set the watch believed was active. Optimistic concurrency: a
   *  complete_set is rejected if this no longer matches the phone's truth. */
  expectedGlobalIndex?: number;
  /** Actual reps performed (a complete_set carries this when the athlete adjusted
   *  via the rep-adjustment screen). Omitted = the prescribed target reps. Weight
   *  is never set from the watch (it stays the recommended target). */
  actualReps?: number;
}

/** Why an intent was rejected (telemetered + useful in tests). */
export type WatchRejectReason =
  | 'no_session'
  | 'malformed'
  | 'version'
  | 'duplicate'
  | 'stale'
  | 'phase_mismatch'
  | 'index_mismatch'
  | 'unavailable';

/** What an accepted intent asks the phone to do: complete the current set with the
 *  reported actual reps (the phone processes it exactly as an on-phone entry — the
 *  source of truth), a session-machine event, or the equipment-occupied reorder. */
export type WatchPhoneAction =
  | { kind: 'complete_set'; actualReps?: number } // actualReps omitted = target reps
  | { kind: 'session_event'; event: SessionEvent }
  | { kind: 'mark_equipment_occupied' };

export interface WatchIntentDecision {
  accept: boolean;
  reason?: WatchRejectReason;
  /** The phone action to perform when accepted; null when rejected. */
  action: WatchPhoneAction | null;
  /** issuedAt → now, ms. Watch completion latency (present when parseable). */
  latencyMs?: number;
}

const INTENT_TYPES: WatchIntentType[] = [
  'complete_set', 'end_rest', 'pause', 'resume', 'finish_early', 'exercise_busy',
];

/** Parse a wire-form intent defensively. Returns null on anything that is not a
 *  readable intent of a known type. */
export function parseWatchIntent(raw: unknown): WatchIntent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== 'string' || typeof o.intentId !== 'string' || typeof o.issuedAt !== 'string') {
    return null;
  }
  if (!INTENT_TYPES.includes(o.type as WatchIntentType)) return null;
  return o as unknown as WatchIntent;
}

function intentToAction(intent: WatchIntent): WatchPhoneAction | null {
  switch (intent.type) {
    case 'complete_set':
      // The phone logs the set with the reported reps (or the target reps when
      // omitted) and runs its own machine transition — exactly like an on-phone entry.
      return { kind: 'complete_set', actualReps: intent.actualReps };
    case 'end_rest':
      return { kind: 'session_event', event: { type: 'REST_ELAPSED' } };
    case 'pause':
      return { kind: 'session_event', event: { type: 'PAUSE' } };
    case 'resume':
      return { kind: 'session_event', event: { type: 'RESUME' } };
    case 'finish_early':
      return { kind: 'session_event', event: { type: 'FINISH_EARLY' } };
    case 'exercise_busy':
      return { kind: 'mark_equipment_occupied' };
    default:
      return null;
  }
}

/**
 * Decide a watch intent against the phone's authoritative mirror. PURE — the
 * single point that enforces "the phone's truth wins". Rejects (never throws) a
 * malformed / wrong-version / duplicate / stale / phase- or index-mismatched
 * intent; otherwise returns the session event to dispatch.
 *
 * `seenIntentIds` is the caller-owned de-dupe set; this function only reads it
 * (the caller adds the id on acceptance) so the function stays pure.
 */
export function decideWatchIntent(
  raw: unknown,
  mirror: SessionMirror | null,
  nowMs: number,
  seenIntentIds: ReadonlySet<string>,
): WatchIntentDecision {
  const intent = parseWatchIntent(raw);
  if (!intent) return { accept: false, reason: 'malformed', action: null };
  if (intent.v !== WATCH_PROTOCOL_VERSION) return { accept: false, reason: 'version', action: null };

  const issuedMs = Date.parse(intent.issuedAt);
  const latencyMs = Number.isNaN(issuedMs) ? undefined : Math.max(0, nowMs - issuedMs);

  if (seenIntentIds.has(intent.intentId)) {
    return { accept: false, reason: 'duplicate', action: null, latencyMs };
  }
  // No active session on the phone → nothing the watch can act on.
  if (!mirror || mirror.phase === 'complete') {
    return { accept: false, reason: 'no_session', action: null, latencyMs };
  }
  // Stale: issued too long ago (e.g. delivered late after a reconnect).
  if (!Number.isNaN(issuedMs) && nowMs - issuedMs > WATCH_INTENT_TTL_MS) {
    return { accept: false, reason: 'stale', action: null, latencyMs };
  }

  // Phase gating — the proposed action must make sense for the current phase.
  const resting = mirror.phase === 'rest_inter' || mirror.phase === 'rest_transition';
  // A set completion (with or without adjusted reps) acts on the presented set.
  if (intent.type === 'complete_set') {
    if (mirror.phase !== 'active_set') return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
    // Optimistic concurrency: the watch must be acting on the set the phone shows.
    if (intent.expectedGlobalIndex != null && intent.expectedGlobalIndex !== mirror.globalIndex) {
      return { accept: false, reason: 'index_mismatch', action: null, latencyMs };
    }
  }
  if (intent.type === 'exercise_busy') {
    if (mirror.phase !== 'active_set') return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
    // Only valid where the phone says it's offerable (start of exercise + a later one).
    if (!mirror.canMarkBusy) return { accept: false, reason: 'unavailable', action: null, latencyMs };
    if (intent.expectedGlobalIndex != null && intent.expectedGlobalIndex !== mirror.globalIndex) {
      return { accept: false, reason: 'index_mismatch', action: null, latencyMs };
    }
  }
  if (intent.type === 'end_rest' && !resting) {
    return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
  }
  if (intent.type === 'resume' && mirror.phase !== 'paused') {
    return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
  }
  if (intent.type === 'pause' && mirror.phase === 'paused') {
    return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
  }

  const action = intentToAction(intent);
  if (!action) return { accept: false, reason: 'malformed', action: null, latencyMs };
  return { accept: true, action, latencyMs };
}

// ---- Serialization layer (wire ⇄ object) -----------------------------------
//
// Both sides of the bridge cross WatchConnectivity as JSON-ish dictionaries.
// These are the canonical (de)serializers; they are total and defensive so a
// malformed or wrong-version payload is a clean null, never a throw.

export function serializeEnvelope(env: WatchStateEnvelope): string {
  return JSON.stringify(env);
}

export function parseEnvelope(raw: unknown): WatchStateEnvelope | null {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const e = o as Record<string, unknown>;
  if (e.v !== WATCH_PROTOCOL_VERSION || e.type !== 'session_state') return null;
  if (typeof e.authoritySeq !== 'number') return null;
  return e as unknown as WatchStateEnvelope;
}

export function serializeIntent(intent: WatchIntent): string {
  return JSON.stringify(intent);
}
