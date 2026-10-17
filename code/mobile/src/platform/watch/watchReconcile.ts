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

// 

import type { CardioActivity, ItemResult, ProgramDay, Session, SetLog } from '@/data/local/models';
import { exerciseById } from '@/data/exercises';
import { sessionTrained } from '@/domain/completion';
import { HttpError } from '@/data/api/httpErrors';
import { WATCH_EVENTS } from '@/platform/events';
import { parseCardioRecord, parseSessionRecord, type WatchCardioRecord, type WatchRecordItem, type WatchRecordSet, type WatchSessionRecord } from './protocol';
import { decideTakeover } from './watchTakeover';

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
  /** The session live on this phone, if any, and how much it holds (`sessionWork`) — what a record
   *  of a workout the wrist TOOK OVER is judged against (stage 3). Absent: nothing is live. */
  liveSession?: () => { id: string; work: number } | null;
  /** Retire the phone's own copy of a workout the wrist took over and finished: end it if it is live,
   *  and clear it from disk if it is waiting to be resumed (stage 3). */
  retireLocalCopy?: (sessionId: string) => Promise<void>;
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
      // A warm-up bridge comes home with BOTH of the phone's marks (`domain/warmupRamp`) — the one
      // every engine reader already steps over, and the honest label (2026-10-17).
      ...(s.isWarmup ? { isApproach: true, isWarmup: true } : {}),
      // The rest she took before it — her learned pace learns from a wrist workout too (stage 5).
      ...(s.restBeforeS != null ? { restBeforeS: s.restBeforeS } : {}),
    };
  });
  const items = canonicalItems(r.sets, r.items);
  return {
    // A workout the wrist TOOK OVER is the phone's own workout, finished elsewhere (stage 3).
    id: r.takeoverOf ?? watchSessionId(r.recordId),
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
    // Every step she did, where the plan had it — the canonical record (stage 5, see below).
    ...(items ? { items } : {}),
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE RECORD COMES HOME WHOLE (2026-10-17, the wrist-alone plan, stage 5)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * On the phone a coach session's canonical record is `items` — EVERY step at its block, round and
 * position, a set among them (`itemResultOf`) — and `sets` is the strangler's second copy of the
 * reps (`models.ts`). `sessionTrained`, and every reader after it, counts `items` whenever it exists.
 *
 * ⛔ THE BUG THIS CLOSES (stage 1b, never in a build): a wrist workout with a plank in it came home
 * with the planks in `items` and the sets in `sets` only — so a day of four sets and two planks was
 * counted as TWO steps done, under half of six, and was not credited as trained. Every set now
 * crosses with its place (`WatchRecordSet.at`) and becomes the reps item the phone writes for one;
 * the holds join them, and the list reads in the order she did the work.
 *
 * ⚠️ A WORKING SET WITH NO PLACE means a record from a wrist (or a plan) older than places: then
 * there is no honest way to put its reps in the canonical list, and the record keeps the shape it
 * always had — no reps items, so every reader falls back to `sets` as it always did. A warm-up
 * bridge never has a place (it is the app's own, not the coach's) and never has an item, as on the
 * phone (`insertWarmup`).
 */
export function canonicalItems(sets: readonly WatchRecordSet[], items: readonly WatchRecordItem[] | undefined): ItemResult[] | undefined {
  const holds = (items ?? []).map((i) => ({ when: i.completedAt, item: watchItemToResult(i) }));
  const working = sets.filter((s) => s.isWarmup !== true);
  if (!working.every((s) => s.at != null)) return holds.length > 0 ? holds.map((h) => h.item) : undefined;
  const reps = working.map((s) => {
    const recommendedReps = s.recommendedReps ?? s.actualReps;
    const edited = (s.actualWeight ?? null) !== (s.recommendedWeight ?? null) || s.actualReps !== recommendedReps;
    const item: ItemResult = {
      ex: s.exerciseId,
      block: s.at!.block,
      round: s.at!.round,
      position: s.at!.position,
      at: s.completedAt,
      ...(s.restBeforeS != null ? { restBeforeS: s.restBeforeS } : {}),
      kind: 'reps',
      load: s.actualWeight ?? null,
      reps: s.actualReps,
      ...(edited ? { edited: true } : {}),
    };
    return { when: s.completedAt, item };
  });
  const all = [...reps, ...holds]
    .map((x, i) => ({ ...x, i, t: Date.parse(x.when) }))
    .sort((a, b) => (a.t !== b.t ? a.t - b.t : a.i - b.i))
    .map((x) => x.item);
  return all.length > 0 ? all : undefined;
}

/**
 * A hold the wrist finished → the `ItemResult` `completeItem` would have written for it on the
 * phone. The wrist finishes a hold AS PRESCRIBED (Done), so what was held is what was asked.
 */
export function watchItemToResult(i: WatchRecordItem): ItemResult {
  const base = {
    ex: i.exerciseId,
    block: i.block,
    round: i.round,
    position: i.position,
    at: i.completedAt,
    ...(i.restBeforeS != null ? { restBeforeS: i.restBeforeS } : {}),
  };
  return i.kind === 'time'
    ? { ...base, kind: 'time', seconds: i.seconds ?? 0, askedSeconds: i.seconds ?? 0, ...(i.load != null ? { load: i.load } : {}) }
    : { ...base, kind: 'distance', metres: i.metres ?? 0, askedMetres: i.metres ?? 0, ...(i.load != null ? { load: i.load } : {}) };
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
    // Not a workout (nothing logged) — never saved or counted, but acked so the
    // watch stops re-sending it. A hold she finished is work (2026-10-13): a record of holds alone
    // is a workout, and dropping it as "empty" would lose the one thing she did. A warm-up bridge is
    // NOT (2026-10-17) — the phone's own rule for a session of bridges and nothing else (`finalize`).
    if (record.sets.every((s) => s.isWarmup === true) && (record.items?.length ?? 0) === 0) {
      deps.track(WATCH_EVENTS.recordReceived, {
        outcome: 'rejected',
        reason: 'empty',
        recordId: record.recordId,
      });
      deps.ack(record.recordId);
      return;
    }

    // Idempotency: at-least-once delivery + a durable identity = safe replays. A workout the wrist
    // took over comes home under the PHONE's id — one workout, one session — never a second beside it.
    const history = await deps.loadHistory();
    const id = record.takeoverOf ?? watchSessionId(record.recordId);
    if (history.some((s) => s.id === id)) {
      deps.track(WATCH_EVENTS.recordReceived, { outcome: 'duplicate', recordId: record.recordId });
      deps.ack(record.recordId);
      return;
    }
    /*
     * ⛔ THE ONE RULE, AT THE END OF A TAKEOVER (stage 3, 2026-10-17). The phone may still be holding
     * its own copy of this workout — live, if it came back and she carried on there too. Whichever
     * account did more after the split stands (`decideTakeover`): the phone's, and this record is
     * acknowledged and set aside; or the record's, and the phone's copy is retired before it is saved.
     */
    if (record.takeoverOf) {
      const live = deps.liveSession?.() ?? null;
      const verdict = decideTakeover({
        takeoverOf: record.takeoverOf,
        splitAt: record.splitAt ?? 0,
        wristWork: record.sets.length + (record.items?.length ?? 0),
        live: live && live.id === record.takeoverOf ? live : null,
        historyIds: [],
      });
      if (verdict === 'superseded') {
        deps.track(WATCH_EVENTS.recordReceived, { outcome: 'superseded', recordId: record.recordId, takeover: true });
        deps.ack(record.recordId);
        return;
      }
      await deps.retireLocalCopy?.(record.takeoverOf);
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
