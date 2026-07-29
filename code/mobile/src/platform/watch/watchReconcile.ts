/**
 * Watch-local session reconciliation (phone side).
 *
 * When the watch executed a workout AS THE LOCAL AUTHORITY (phone absent), it
 * durably queues a `WatchSessionRecord` and delivers it at-least-once. This
 * module applies such a record on the phone so the workout becomes a first-class
 * completed session — history entry, mode/calibration advance, week DONE mark,
 * and backend model sync (queued offline, §6.4) — exactly the side effects the
 * phone's own finalize() runs.
 *
 * Rules:
 *  - IDEMPOTENT: the reconciled session's id is `watch_<recordId>`; a record
 *    whose session already exists in history is acknowledged and dropped.
 *  - ALWAYS ACK a readable record (even a duplicate or an empty one) — the ack is
 *    what lets the watch clear its outbox; only an unreadable payload is not
 *    acked (there is no id to ack).
 *  - An empty record (zero sets) is NOT a workout (§ not-started rule): nothing
 *    is saved or counted, but it IS acked.
 *
 * Deps are injected so the whole flow is unit-testable without native modules.
 */
import type { CardioActivity, ProgramDay, Session, SetLog } from '@/data/local/models';
import { exerciseById } from '@/data/exercises';
import { sessionTrained } from '@/domain/completion';
import { HttpError } from '@/data/api/httpErrors';
import { WATCH_EVENTS } from '@/platform/events';
import { parseCardioRecord, parseSessionRecord, type WatchCardioRecord, type WatchSessionRecord } from './protocol';

/** One set in the shape the backend model sync expects (same as finalize()). */
export interface WatchSyncSet {
  exerciseId: string;
  setIndex: number;
  actualWeight: number | null;
  actualReps: number;
  blockId?: string;
}

export interface WatchReconcileDeps {
  loadHistory: () => Promise<Session[]>;
  appendCompletedSession: (s: Session) => Promise<void>;
  recordSessionCompleted: () => Promise<{ unlockedPortrait: boolean }>;
  markWorkoutCompleted: (programDayId: string) => Promise<void>;
  /** The program day a watch record belongs to — its prescription decides whether the session
   *  FINISHED the workout (domain/completion). Absent (or unknown day) => any logged work
   *  finishes it, preserving the pre-rule behavior. */
  programDay?: (programDayId: string) => ProgramDay | undefined;
  /** Backend model sync (app.model.recordSession). Throws offline — then queued. */
  recordToModel: (args: { programDayId: string; sets: WatchSyncSet[]; earlyFinish: boolean }) => Promise<unknown>;
  enqueuePendingSync: (args: {
    sessionId: string;
    programDayId: string;
    sets: WatchSyncSet[];
    earlyFinish: boolean;
  }) => Promise<void>;
  track: (type: string, data?: Record<string, unknown>) => void;
  /** Acknowledge the record to the watch (durable transfer) so it clears its outbox. */
  ack: (recordId: string) => void;
}

/** True if a failed sync is worth queuing for retry (transient), not a doomed payload. */
function worthQueuing(e: unknown): boolean {
  return !(e instanceof HttpError) || e.transient;
}

/** The reconciled session identity for a record — the de-dupe key. */
export function watchSessionId(recordId: string): string {
  return `watch_${recordId}`;
}

/** Materialize the record as a Session indistinguishable from a phone-run one. */
export function watchRecordToSession(r: WatchSessionRecord): Session {
  const sets: SetLog[] = r.sets.map((s) => {
    const recommendedWeight = s.recommendedWeight ?? null;
    const recommendedReps = s.recommendedReps ?? s.actualReps;
    const actualWeight = s.actualWeight ?? null;
    return {
      exerciseId: s.exerciseId,
      setIndex: s.setIndex,
      blockId: s.blockId,
      recommendedWeight,
      recommendedReps,
      actualWeight,
      actualReps: s.actualReps,
      edited: actualWeight !== recommendedWeight || s.actualReps !== recommendedReps,
      persistedAt: s.completedAt ?? r.endedAt,
    };
  });
  return {
    id: watchSessionId(r.recordId),
    programDayId: r.workoutId,
    programDayName: r.workoutName,
    startedAt: r.startedAt,
    state: 'SAVED',
    earlyFinish: r.earlyFinish,
    // Owner-voice annotation parity with finalize(): early finish wins; a watch
    // record carries no advisory increase data, so a full session gets none.
    annotation: r.earlyFinish ? 'ended_early' : null,
    // ONE NUMBER PER WORKOUT. On a standalone workout the WRIST is the authority and it has a
    // sensor the phone does not, so its measurement becomes the session's — stamped here, at
    // creation, never as a later mutation of immutable history. Absent ⇒ every surface estimates,
    // exactly as it always has.
    ...(r.kcal == null ? {} : { measuredKcal: r.kcal }),
    sets,
  };
}

/**
 * Apply one raw record payload end-to-end. Total: never throws; every readable
 * record is acked exactly once, and the outcome is telemetered.
 */
export async function applyWatchSessionRecord(raw: unknown, deps: WatchReconcileDeps): Promise<void> {
  const record = parseSessionRecord(raw);
  if (!record) {
    deps.track(WATCH_EVENTS.recordReceived, { outcome: 'rejected', reason: 'malformed' });
    return; // unreadable — nothing to ack
  }
  try {
    // Not a workout (zero sets logged) — never saved or counted, but acked so the
    // watch stops re-sending it.
    if (record.sets.length === 0) {
      deps.track(WATCH_EVENTS.recordReceived, {
        outcome: 'rejected',
        reason: 'empty',
        recordId: record.recordId,
      });
      deps.ack(record.recordId);
      return;
    }

    // Idempotency: at-least-once delivery + a durable identity = safe replays.
    const history = await deps.loadHistory();
    const id = watchSessionId(record.recordId);
    if (history.some((s) => s.id === id)) {
      deps.track(WATCH_EVENTS.recordReceived, { outcome: 'duplicate', recordId: record.recordId });
      deps.ack(record.recordId);
      return;
    }

    // PARTIAL vs TRAINED (domain/completion) — identical to the phone's finalize: a wrist session
    // under half the workout's prescribed sets is real work, but it does NOT finish the workout;
    // it stays on the week's list and does not spend a session from the count (which gates the
    // free trial + calibration). The day comes from the phone's program (the authority); the
    // verdict is stamped on the session so the workout-count milestones can read it later.
    const day = deps.programDay?.(record.workoutId);
    const base = watchRecordToSession(record);
    const trained = sessionTrained(base, day);
    const session: Session = { ...base, trained };
    // Same order as finalize(): save history first (§8.4), then advance mode +
    // week state, then best-effort backend sync with an offline queue.
    await deps.appendCompletedSession(session);
    if (trained) {
      await deps.recordSessionCompleted();
      await deps.markWorkoutCompleted(record.workoutId);
    }

    const syncSets: WatchSyncSet[] = session.sets.map((s) => ({
      exerciseId: s.exerciseId,
      setIndex: s.setIndex,
      actualWeight: s.actualWeight,
      actualReps: s.actualReps,
      blockId: s.blockId,
    }));
    try {
      await deps.recordToModel({
        programDayId: record.workoutId,
        sets: syncSets,
        earlyFinish: record.earlyFinish,
      });
    } catch (e) {
      if (worthQueuing(e)) {
        await deps.enqueuePendingSync({
          sessionId: session.id,
          programDayId: record.workoutId,
          sets: syncSets,
          earlyFinish: record.earlyFinish,
        });
      } else {
        deps.track('sync_dropped', {
          sessionId: session.id,
          kind: e instanceof HttpError ? e.kind : 'unknown',
        });
      }
    }

    deps.track(WATCH_EVENTS.recordReceived, {
      outcome: 'applied',
      recordId: record.recordId,
      setCount: record.sets.length,
      earlyFinish: record.earlyFinish,
      planId: record.planId,
    });
    deps.ack(record.recordId);
  } catch {
    // Persistence failed mid-way — do NOT ack; the watch re-delivers and the
    // idempotent id makes the retry safe.
    deps.track(WATCH_EVENTS.recordReceived, {
      outcome: 'rejected',
      reason: 'apply_failed',
      recordId: record.recordId,
    });
  }
}

// ───────────────────────────── the wrist's run, carried home ─────────────────────────────

/** What applying a cardio record needs. Injected, like everything else here, so the whole flow is
 *  testable without a native module. */
export interface WatchCardioReconcileDeps {
  loadCardio: () => Promise<{ id: string }[]>;
  appendCardioActivity: (a: CardioActivity) => Promise<void>;
  ack: (recordId: string) => void;
  track: (type: string, data?: Record<string, unknown>) => void;
}

/** The reconciled activity's identity — the same `watch_<recordId>` shape the strength side uses,
 *  so a replayed delivery is recognisably the same activity and not a second one. */
export const watchCardioId = (recordId: string): string => `watch_${recordId}`;

/**
 * One wrist run → one `CardioActivity`, built from ONLY what the wrist honestly measured.
 *
 * `avgPaceSec` is derived rather than carried, because pace is not a measurement — it is duration
 * over distance, and computing it here means the wrist and the phone can never disagree about it.
 * No distance ⇒ no pace (0), never a division by zero dressed as a number. `splits` is empty and
 * `route` absent by construction: the wrist has neither, and inventing either would put a line on
 * her map that she never ran.
 */
export function cardioRecordToActivity(r: WatchCardioRecord): CardioActivity {
  const distanceKm = r.distanceKm ?? 0;
  return {
    kind: 'cardio',
    id: watchCardioId(r.recordId),
    gait: r.gait,
    startedAt: r.startedAt,
    durationSec: Math.round(r.durationSec),
    distanceKm,
    avgPaceSec: distanceKm > 0 ? Math.round(r.durationSec / distanceKm) : 0,
    ...(r.avgHr === undefined ? {} : { avgHr: r.avgHr }),
    ...(r.kcal === undefined ? {} : { calories: r.kcal }),
    splits: [],
  };
}

/**
 * Apply one raw cardio payload end-to-end. Total: never throws.
 *
 * The same three rules the strength reconciler follows, for the same reasons:
 *  · IDEMPOTENT on `watch_<recordId>` — at-least-once delivery makes replays certain, not likely;
 *  · ALWAYS ACK a readable record, duplicate or not, because the ack is what clears the wrist's
 *    outbox — only an unreadable payload goes un-acked (there is no id to ack);
 *  · a failure to PERSIST is not acked, so the wrist re-delivers and the idempotent id makes the
 *    retry safe.
 *
 * A cardio activity touches no engine state (S-50 / "recorded, never coached") — no session count,
 * no week completion, no model sync. It is history, and history alone.
 */
export async function applyWatchCardioRecord(raw: unknown, deps: WatchCardioReconcileDeps): Promise<void> {
  const record = parseCardioRecord(raw);
  if (!record) {
    deps.track(WATCH_EVENTS.cardioRecordReceived, { outcome: 'rejected', reason: 'malformed' });
    return; // unreadable — nothing to ack
  }
  try {
    const existing = await deps.loadCardio();
    const id = watchCardioId(record.recordId);
    if (existing.some((a) => a.id === id)) {
      deps.track(WATCH_EVENTS.cardioRecordReceived, { outcome: 'duplicate', recordId: record.recordId });
      deps.ack(record.recordId);
      return;
    }
    await deps.appendCardioActivity(cardioRecordToActivity(record));
    deps.track(WATCH_EVENTS.cardioRecordReceived, {
      outcome: 'applied',
      recordId: record.recordId,
      gait: record.gait,
      distanceKm: record.distanceKm,
      durationSec: record.durationSec,
    });
    deps.ack(record.recordId);
  } catch {
    deps.track(WATCH_EVENTS.cardioRecordReceived, {
      outcome: 'rejected',
      reason: 'apply_failed',
      recordId: record.recordId,
    });
  }
}
