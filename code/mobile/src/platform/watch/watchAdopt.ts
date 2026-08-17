/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ADOPTING A WORKOUT THAT BEGAN ON THE WRIST — the pure half of the live handover.
 *
 * ⛔ FOUNDER: *"אם התחלתי אימון בשעון ואני נכנס לאפליקציה בפלאפון המסך של האימון צריך להופיע."*
 *
 * When the phone is present it is the authority and the wrist mirrors it, so a Begin tapped on the
 * wrist already shows up on the phone. The gap is the standalone path — she began with the phone
 * asleep or out of range — where the wrist runs its own engine and, by design, says nothing until
 * the workout is over. Opening the phone mid-workout showed Today.
 *
 * This turns the wrist's live state into exactly the three things the phone's own resume path
 * rebuilds a session from, so adoption walks a road that already exists rather than a new one:
 *
 *     resumeSaved()  ←  db.loadActiveSession() + db.loadSessionResume()  →  dispatch START
 *     adopt          ←  this                                             →  dispatch START
 *
 * ── ⚠️ IDEMPOTENCY IS NOT A RULE HERE, IT IS THE IDENTITY ───────────────────────────────────────
 * The session is adopted under `watchSessionId(recordId)` — the id `applyWatchSessionRecord`
 * already de-dupes on. The wrist's outbox is at-least-once by design, so its finished record may
 * well arrive after a successful handover; when it does, the phone finds that id in history and
 * acks it as a duplicate. Nothing new has to stay true for that to hold.
 *
 * ── ⚠️ WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────────────────────
 * It does not decide WHETHER to adopt — that is the caller's, and it is a different question with
 * different facts (is a session already live? is this the same workout?). This only answers *what
 * would the phone's session be*, purely, so every branch of it can be tested without a device.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import type { Session, SetLog, SetTarget } from '@/data/local/models';
import type { SessionMachine, SessionPhase } from '@/state/machines/sessionState';
import type { Step } from '@/state/stores/sessionStore';
import type { WatchLocalSession, WatchPlanStep, WatchRecordSet } from './protocol';
import { watchSessionId } from './watchReconcile';

export interface AdoptedSession {
  /** The live session, ready for `db.saveActiveSession` and the store. */
  session: Session;
  /** The executed prescriptions, in the phone's own plan shape. */
  plan: Step[];
  machine: SessionMachine;
  /** Wall-clock ms the running rest began — null when she is not resting. */
  restStartedAtMs: number | null;
  /** Seconds still to run on that rest, floored at 0. Null when she is not resting. */
  restRemainingS: number | null;
}

/** The wrist's phase vocabulary → the phone machine's. */
const PHASE: Record<string, SessionPhase> = {
  active_set: 'SET_PRESENTED',
  rest_inter: 'REST_INTER',
  rest_transition: 'REST_TRANSITION',
  paused: 'PAUSED',
};

function stepOf(s: WatchPlanStep, total: number): Step {
  const target: SetTarget = {
    exerciseId: s.exerciseId,
    setIndex: s.setIndexInExercise,
    recommendedWeight: s.targetWeight,
    recommendedReps: s.targetReps,
    ...(s.blockId ? { blockId: s.blockId } : {}),
    /* Her band's ceiling travels with the step so the adopted stage draws the same ruler the wrist
       was drawing. Absent on an older wrist, which is the same state as a step that never had one. */
    ...(s.targetRepsHi != null ? { repBandHi: s.targetRepsHi } : {}),
    ...(s.reasonType ? { reasonType: s.reasonType } : {}),
  };
  return {
    exerciseId: s.exerciseId,
    globalIndex: s.globalIndex,
    exerciseSetIndex: s.setIndexInExercise,
    totalSetsInExercise: s.totalSetsInExercise,
    target,
    lastSetOfExercise: s.setIndexInExercise === s.totalSetsInExercise - 1,
    lastSetOfSession: s.globalIndex === total - 1,
  };
}

/**
 * ⚠️ THE SET LOG IS BUILT THE SAME WAY A FINISHED RECORD'S IS (`watchRecordToSession`), field for
 * field, so a workout that is adopted mid-flight and one that comes home as a record cannot produce
 * two different histories of the same work.
 */
function setOf(s: WatchRecordSet): SetLog {
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
    persistedAt: s.completedAt,
  };
}

/**
 * Turn the wrist's live state into the phone's. Returns null only for a state the phone could not
 * honestly stand in — the caller treats that as "do not adopt", never as an empty session.
 */
export function adoptWatchSession(local: WatchLocalSession, nowMs: number): AdoptedSession | null {
  const total = local.steps.length;
  if (total === 0) return null;
  if (local.currentIndex < 0 || local.currentIndex >= total) return null;

  const phase = PHASE[local.phase];
  if (!phase) return null;

  /*
   * ⛔ A PAUSE MUST NAME WHAT IT FROZE. The phone's machine restores the exact phase a pause was
   * entered from, and a PAUSED machine with no `resumePhase` cannot be resumed — it would strand
   * her on a screen with a Resume button that leads nowhere. A wrist that says "paused" without
   * saying from what has told us something we cannot act on, so we decline the whole handover and
   * leave the workout where it is running.
   */
  let resumePhase: SessionMachine['resumePhase'] = null;
  if (phase === 'PAUSED') {
    const from = local.pausedFrom ? PHASE[local.pausedFrom] : null;
    if (!from || from === 'PAUSED') return null;
    resumePhase = from as SessionMachine['resumePhase'];
  }

  const plan = local.steps.map((s) => stepOf(s, total));

  /*
   * ⚠️ REST IS TAKEN FROM THE ABSOLUTE INSTANT, NEVER A COUNT. `restEndsAt` is wall-clock, which is
   * the product's whole answer to two devices disagreeing about a timer — so what remains is
   * computed here, at adoption, and a rest that expired while the message was in flight arrives as
   * zero rather than as a negative number nobody guarded.
   */
  let restStartedAtMs: number | null = null;
  let restRemainingS: number | null = null;
  const resting = phase === 'REST_INTER' || phase === 'REST_TRANSITION';
  if (resting && local.restEndsAt) {
    const endsAt = Date.parse(local.restEndsAt);
    if (!Number.isFinite(endsAt)) return null;
    restRemainingS = Math.max(0, Math.round((endsAt - nowMs) / 1000));
    /* Derived BACKWARDS from the end and the prescription, so the phone's ring gets the same
       denominator the wrist was drawing. A frame with no stated length gives no ring to size, and
       "started now" is the only honest stand-in — the countdown itself is still the absolute end. */
    const totalS = local.restTotalS != null && local.restTotalS > 0 ? local.restTotalS : null;
    restStartedAtMs = totalS != null ? endsAt - totalS * 1000 : nowMs;
  }

  const session: Session = {
    id: watchSessionId(local.recordId),
    programDayId: local.workoutId,
    programDayName: local.workoutName,
    startedAt: local.startedAt,
    state: 'ACTIVE',
    earlyFinish: false,
    sets: local.sets.map(setOf),
  };

  const machine: SessionMachine = {
    phase,
    resumePhase,
    setIndex: local.currentIndex,
    isLastSetOfSession: local.currentIndex === total - 1,
    earlyFinish: false,
  };

  return { session, plan, machine, restStartedAtMs, restRemainingS };
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHETHER TO ADOPT — the three refusals, in one testable place.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The mapping above answers *what would the session be*. This answers *may we*, and it is the half
 * that can hurt her: getting it wrong means either overwriting a workout she is doing on the phone,
 * or resurrecting one that is already finished and saved.
 *
 * It lives here, pure, for the same reason `watchPlanToPublish` does — buried inside a React action
 * these rules cannot be exercised, and "the risky part is the untested part" is how the last three
 * bugs in this layer survived as long as they did.
 *
 *   'duplicate' → the phone already holds this exact session, live or finished. Nothing to move.
 *   'refused'   → a DIFFERENT session is live here. The phone is the authority whenever it has one,
 *                 and adopting over it would discard sets she logged on the phone.
 *   'proceed'   → take it.
 *
 * ⚠️ THE ORDER MATTERS. "Is it already mine?" is asked BEFORE "is something else live?", because a
 * wrist that restates its offer during a session the phone has already adopted must be answered
 * `duplicate` — the honest word — and not `refused`, which would read in the dataset as a handover
 * that failed.
 */
export function decideAdoption(inp: {
  /** Id of the session live on the phone right now, or null when none is. */
  liveSessionId: string | null;
  /** Whether a plan is loaded — the phone's own test for "a session is live". */
  liveSessionActive: boolean;
  /** Ids already in her saved history. */
  historyIds: readonly string[];
  /** The id this offer would be adopted under — `watchSessionId(recordId)`. */
  offeredId: string;
}): 'duplicate' | 'refused' | 'proceed' {
  if (inp.liveSessionId === inp.offeredId) return 'duplicate';
  if (inp.liveSessionActive) return 'refused';
  if (inp.historyIds.includes(inp.offeredId)) return 'duplicate';
  return 'proceed';
}
