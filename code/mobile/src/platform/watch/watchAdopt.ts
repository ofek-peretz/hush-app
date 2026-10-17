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

//

import type { Session, SetLog, SetTarget } from '@/data/local/models';
import type { SessionMachine, SessionPhase } from '@/state/machines/sessionState';
import type { Step } from '@/state/stores/sessionStore';
import type { WatchLocalSession, WatchPlanStep, WatchRecordSet } from './protocol';
import { watchItemToResult, watchSessionId } from './watchReconcile';

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
  /** The absolute instant the wrist's running rest ends — the one fact the handover must keep. */
  restEndsAtMs: number | null;
  /** A rest the wrist handed over PAUSED: what remained of it at the pause. Null otherwise. */
  pausedRestRemainingS: number | null;
  /** A hold running on the wrist at the handover: the instant its clock began, so the phone's one
   *  clock counts to the same end. Null when no hold was running. */
  holdStartedAtMs: number | null;
}

const isRestPhase = (p: SessionPhase | null | undefined) => p === 'REST_INTER' || !!p?.startsWith('REST_TRANSITION');

/**
 * Where the phone's rest anchor goes when it takes over from the wrist — solved from the PHONE'S
 * own prescribed length, so that the end the wrist was counting to is the end the phone counts to.
 *
 *   · a running rest: `start = end − base`, exactly — the countdown does not move by a millisecond;
 *   · a paused rest: frozen at `now`, with the remainder it had — resume carries on from it;
 *   · a paused rest from a wrist too old to say its remainder: the prescribed length, never "no
 *     clock" — a rest with no anchor has no countdown on the wrist or the lock screen at all.
 */
export function adoptedRestAnchor(
  a: Pick<AdoptedSession, 'machine' | 'restEndsAtMs' | 'pausedRestRemainingS'>,
  baseS: number | null,
  nowMs: number,
): { restStartedAtMs: number | null; pausedAtMs: number | null } {
  if (baseS == null || !Number.isFinite(baseS)) return { restStartedAtMs: null, pausedAtMs: null };
  const { machine } = a;
  if (isRestPhase(machine.phase)) {
    const end = a.restEndsAtMs ?? nowMs + baseS * 1000;
    return { restStartedAtMs: end - baseS * 1000, pausedAtMs: null };
  }
  if (machine.phase === 'PAUSED' && isRestPhase(machine.resumePhase)) {
    const remaining = a.pausedRestRemainingS ?? baseS;
    return { restStartedAtMs: nowMs - (baseS - remaining) * 1000, pausedAtMs: nowMs };
  }
  return { restStartedAtMs: null, pausedAtMs: null };
}

/** The wrist's phase vocabulary → the phone machine's. */
const PHASE: Record<string, SessionPhase> = {
  active_set: 'SET_PRESENTED',
  rest_inter: 'REST_INTER',
  rest_transition: 'REST_TRANSITION',
  paused: 'PAUSED',
};

function stepOf(s: WatchPlanStep, total: number, next: WatchPlanStep | undefined): Step {
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
  /*
   * ⛔ A HOLD COMES BACK AS A HOLD (2026-10-13, stage 1b). The stage branches on the step having no
   * `target`: that is what sends a plank to `ItemStage` and its Done to `completeItem`. Rebuilt as a
   * set it would arrive as "0 kg × 0" — the defect `completeItem`'s own header describes. So a hold
   * carries its `item` (what the coach wrote) and its `where` (so a second Done is refused as
   * already recorded), and no target at all.
   */
  const where = s.at ? { where: { block: s.at.block, round: s.at.round, position: s.at.position } } : {};
  const rest = s.restWritten && s.restAfterS != null ? { restAfterS: s.restAfterS } : {};
  const edges = { lastSetOfExercise: !next || next.exerciseId !== s.exerciseId, lastSetOfSession: s.globalIndex === total - 1 };
  /*
   * ⛔ A WARM-UP BRIDGE COMES BACK AS A BRIDGE (2026-10-17, stage 2). `insertWarmup`'s shape, byte for
   * byte: its label, its negative index, the breath after it (written on the step), no `where`, and
   * never the last of its lift — so every reader on the phone steps over it exactly as it steps over
   * one the phone inserted itself.
   */
  if (s.warmup) {
    return {
      exerciseId: s.exerciseId,
      globalIndex: s.globalIndex,
      exerciseSetIndex: s.setIndexInExercise,
      totalSetsInExercise: s.totalSetsInExercise,
      target: { exerciseId: s.exerciseId, setIndex: s.setIndexInExercise, recommendedWeight: s.targetWeight, recommendedReps: s.targetReps },
      warmup: { index: s.warmup.index, count: s.warmup.count },
      ...(s.restAfterS != null ? { restAfterS: s.restAfterS } : {}),
      lastSetOfExercise: false,
      lastSetOfSession: s.globalIndex === total - 1,
    };
  }
  if (s.holdSeconds != null || s.holdMetres != null) {
    const load = s.targetWeight != null ? { load: s.targetWeight } : {};
    return {
      exerciseId: s.exerciseId,
      globalIndex: s.globalIndex,
      exerciseSetIndex: s.setIndexInExercise,
      totalSetsInExercise: s.totalSetsInExercise,
      item: s.holdSeconds != null ? { kind: 'time', ex: s.exerciseId, seconds: s.holdSeconds, ...load } : { kind: 'distance', ex: s.exerciseId, metres: s.holdMetres as number, ...load },
      ...where,
      ...rest,
      ...edges,
    };
  }
  return {
    exerciseId: s.exerciseId,
    globalIndex: s.globalIndex,
    exerciseSetIndex: s.setIndexInExercise,
    totalSetsInExercise: s.totalSetsInExercise,
    target,
    ...where,
    /*
     * ⛔ THE WRIST'S STEPS ARE THE PHONE'S OWN RUN NOW, AND ARE READ BACK BY THE PHONE'S OWN RULES
     * (2026-10-13, stage 1). Two things here used to be guessed from a set's number:
     *
     *   · "the last set of this lift" was `setIndex === total − 1`. True of a lift whose sets stand
     *     in a row; in a superset (A, B, A, B) every step is the last of its lift until the partner
     *     has gone — which is `buildPlanFromCoach`'s rule, and the one the rest clock asks.
     *   · the rest after a step was not carried at all, so a workout adopted in the MIDDLE of a
     *     superset arrived on the phone as six ordinary sets with a full rest after each: the couple
     *     she was half-way through was gone from the stage the moment she opened the phone.
     *
     * A rest the plan WROTE (a block's own, or a round's inner zero) stays on the step — that zero
     * is what a superset is, to every screen that reads one (`domain/supersetView`). Her own pace is
     * NOT pinned: the phone re-reads it from her record, exactly as it does for a session it began.
     */
    ...(s.restWritten && s.restAfterS != null ? { restAfterS: s.restAfterS } : {}),
    lastSetOfExercise: !next || next.exerciseId !== s.exerciseId,
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
    ...(s.isWarmup ? { isApproach: true, isWarmup: true } : {}),
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

  const plan = local.steps.map((s, i) => stepOf(s, total, local.steps[i + 1]));

  /*
   * ⚠️ REST IS TAKEN FROM THE ABSOLUTE INSTANT, NEVER A COUNT. `restEndsAt` is wall-clock, which is
   * the product's whole answer to two devices disagreeing about a timer — so what remains is
   * computed here, at adoption, and a rest that expired while the message was in flight arrives as
   * zero rather than as a negative number nobody guarded.
   */
  let restStartedAtMs: number | null = null;
  let restRemainingS: number | null = null;
  let restEndsAtMs: number | null = null;
  const resting = phase === 'REST_INTER' || phase === 'REST_TRANSITION';
  if (resting && local.restEndsAt) {
    const endsAt = Date.parse(local.restEndsAt);
    if (!Number.isFinite(endsAt)) return null;
    restEndsAtMs = endsAt;
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
    ...(local.items && local.items.length > 0 ? { items: local.items.map(watchItemToResult) } : {}),
  };

  const machine: SessionMachine = {
    phase,
    resumePhase,
    setIndex: local.currentIndex,
    isLastSetOfSession: local.currentIndex === total - 1,
    earlyFinish: false,
  };

  /* A pause the wrist entered mid-rest clears its end instant and freezes what remained instead. */
  const pausedRestRemainingS =
    phase === 'PAUSED' && isRestPhase(resumePhase) && local.pausedRestRemainingS != null
      ? Math.max(0, Math.round(local.pausedRestRemainingS))
      : null;

  /* A hold in flight: its end is absolute on the wrist, and its length is on the step — so the
     start is the one subtraction, and the phone's countdown lands on the same second. */
  const onStep = local.steps[local.currentIndex];
  const holdEnd = phase === 'SET_PRESENTED' && local.holdEndsAt && onStep?.holdSeconds ? Date.parse(local.holdEndsAt) : NaN;
  const holdStartedAtMs = Number.isFinite(holdEnd) ? holdEnd - (onStep.holdSeconds as number) * 1000 : null;

  return { session, plan, machine, restStartedAtMs, restRemainingS, restEndsAtMs, pausedRestRemainingS, holdStartedAtMs };
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
