        /*
         * ⛔ THE STRUCTURAL-CHANGE RECORD WENT WITH THE LOG NOBODY READS.
         *
         * An adopted learned swap used to be stamped into the engine's changeLog so the Saturday
         * mirror could name it. Nothing reads that log any more — and the swap reaches the coach a
         * better way: it is a PREFERENCE (`preferences.substitutes`), it travels on her sheet as
         * `swappedByHer`, and the coach decides what to do about it rather than being told after
         * the fact that the app already had.
         */

// 


/**
 * Live session engine. Drives the Session Flow via the session-state machine
 * (spec §6.3), persists per-set actuals at each Complete Set (§8.4), and honors
 * the invariant save order: Last Set -> SESSION_SAVED -> Well Done -> Home.
 *
 * Rest is Hush-owned and not user-adjustable (UX §10.8); these are the fixed
 * defaults. "Ready" (endRest) is the only rest agency.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ItemResult, ProgramDay, Session, SessionSummary, SetLog, SetTarget } from '@/data/local/models';
import { exerciseById, catalogIdFromEngine, exerciseDisplayName, muscleOf, type Exercise } from '@/data/exercises';
import { swapChoices } from '@/domain/swapPool';
import { foldSessionSwaps, learnedLeaveIts } from '@/domain/swapLearning';
import { db } from '@/data/local/db';
import type { PlannedItem, PlannedSession } from '@/domain/coachPlan';
import { isTrainingGated } from '@/domain/entitlement';
import { runSteps } from '@/domain/planRun';
import { liveActivity, drainLockIntents, addLockIntentListener, type LockExtras, type LockIntent } from '@/platform/liveActivity';
import { projectSessionMirror, type MirrorStep, type MirrorMilestone } from '@/platform/sessionMirror';
import { newlyEarned } from '@/domain/milestones';
import { milestoneCopy, type Translate } from '@/domain/milestoneCopy';
import { i18n, tg } from '@/i18n';
import { equipmentLoad, loadSetup } from '@/domain/loadPresentation';
import { prescribedSets, sessionTrained } from '@/domain/completion';
import { AppState } from 'react-native';
import { notifier } from '@/platform/notifications';
import { WatchSession } from '@/platform/watch/watchBridge';
import { isCardioRecordPayload, type WatchLobby, type WatchLocalSession, type WatchPlanSnapshot } from '@/platform/watch/protocol';
import { applyWatchCardioRecord, applyWatchSessionRecord, watchSessionId } from '@/platform/watch/watchReconcile';
import { armGapCatch } from '@/platform/gapCatch';
import { adoptWatchSession, decideAdoption } from '@/platform/watch/watchAdopt';
import { watchTransport } from '@/platform/watch/watchTransportNative';
import {
  initialSessionMachine,
  sessionReducer,
  REST_SKIP_THRESHOLD_S,
  type SessionEvent,
  type SessionMachine,
} from '@/state/machines/sessionState';
import { reconcileResume, salvageOrphanSession, RESUME_WINDOW_MS, type SalvageResult } from '@/state/sessionRecovery';
import { HttpError } from '@/data/api/httpErrors';
import { track, trackFirst } from '@/platform/telemetry';
import { carryWeightForward } from '@/engine/v5/liveSession';
import { refreshLearnedRests, restTransitionSeconds, restTransitionIsLearned, restInterSecondsFor, restIsLearnedFor, isRestSample, REST_UNSTATED_S } from '@/domain/restPrescription';
import { warmupRamp, WARMUP_REST_S, type WarmupSet } from '@/domain/warmupRamp';
import { nudgeAfterS, nudgeApplies, learnedExecSFor } from '@/domain/setDwell';
import { weightStepFor } from '@/domain/weightStep';
import { runClock } from '@/domain/sessionClock';
import { audioSession } from '@/platform/voice/audioSession';
import { factForLift, type KnownFact } from '@/domain/whatIKnow';
import { setNudge } from '@/platform/setNudge';
import { restHaptics } from '@/platform/restHaptics';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { priorPeakKg, livePeakKg, recordBaselineKg, isRecordSet } from '@/domain/setRecord';
import { musclesForWristArea, asPainSeverity } from '@/domain/painReport';
import { sessionDurationMs, sessionEnergyKcal } from '@/domain/sessionMetrics';
import { healthWrite } from '@/platform/health/healthWrite';
import { LIVE_ACTIVITY_EVENTS } from '@/platform/events';
import { useApp } from './appStore';

/** True if a failed sync is worth queuing for retry (transient), not a doomed payload. */
function worthQueuing(e: unknown): boolean {
  return !(e instanceof HttpError) || e.transient;
}

// S-17 — HER MEDIAN REST BECOMES THE PRESCRIPTION, for BOTH kinds of rest. The whole rest doctrine
// (day-one tier bootstraps + the learned per-lift INTER median + the learned pooled TRANSITION
// median) lives in ONE home, `domain/restPrescription` — re-exported here so every existing
// importer (Home, the watch plan, tests) keeps its single import point.
import { applyLiveEdits, type LiveEdit } from '@/domain/liveRevision';
import { lastTimeOn, type LastTime } from '@/domain/lastTimeOn';
import { bandOf, currentBlockSets } from '@/domain/setRow';

export { REST_COMPOUND_S, REST_ISOLATION_S, REST_TRANSITION_S, REST_INTER_S, REST_UNSTATED_S, refreshLearnedRests, restInterSecondsFor, restIsLearnedFor, restTransitionSeconds } from '@/domain/restPrescription';


export interface Step {
  exerciseId: string;
  globalIndex: number;
  exerciseSetIndex: number; // 0-based within the exercise
  totalSetsInExercise: number;
  /**
   * The rep prescription — a weight for a number of reps.
   *
   * **Optional, because not every step is one.** A 45-second plank, a 400 m repeat and five minutes
   * of mobility have no weight and no reps, and the previous shape required both. Filling them with
   * zeros so a plank fits the old field is the lie `ItemResult` exists to prevent, and it would be
   * the same lie one layer up.
   *
   * ABSENT means there is no rep prescription, and every reader must say what it does about that
   * rather than read a fabricated zero. The compiler found all 34 of them.
   */
  target?: SetTarget;
  /**
   * What the coach actually wrote for this step, when the plan came from a coach plan
   * (`domain/planRun`). Absent on a plan built the old way from a `ProgramDay`.
   *
   * This is the discriminator the screen switches on: a step with a non-`reps` item goes to
   * `ItemStage`, and one without an item at all is the reps path exactly as it has always been.
   */
  item?: PlannedItem;
  /** Where the coach put it — block, round and position, for "lap 3 of 6" and for the record. */
  where?: { block: number; round: number; position: number };
  /** Seconds the coach prescribed AFTER this step. Absent = the old per-exercise rest rules stand. */
  restAfterS?: number;
  lastSetOfExercise: boolean;
  lastSetOfSession: boolean;
  edited?: boolean; // the athlete adjusted this set via Edit Result (logged as an override)
  /**
   * A warm-up bridge (domain/warmupRamp, founder 2026-08-24) — NOT a working set. Present only on
   * ramp steps: `index`/`count` drive the "Warm-up · 1 of 2" label. A warm-up step's
   * `exerciseSetIndex` is NEGATIVE (−ramp.length … −1) so the working sets keep their 0-based
   * indices untouched, and its log carries `isApproach` + `isWarmup` so every engine reader
   * excludes it by construction.
   */
  warmup?: { index: number; count: number };
}

/**
 * WHICH STEP THIS IS, as an identity rather than as a position.
 *
 * ⛔ `globalIndex` IS A POSITION AND POSITIONS MOVE. Inserting a warm-up ahead of the cursor leaves
 * the cursor's NUMBER unchanged while the step under it becomes a bridge — so anything that asks
 * "am I still on the same set?" by comparing indices answers yes across a change of subject. What
 * makes a step itself is the lift and where in the lift it sits; a bridge's set index is negative,
 * which is exactly why that pair is enough.
 */
function stepKey(step: Step): string {
  return `${step.exerciseId}#${step.exerciseSetIndex}`;
}

/** Contiguous same-exercise runs of a plan (each exercise's consecutive sets). */
function exerciseRuns(plan: Step[]): Step[][] {
  const runs: Step[][] = [];
  for (const st of plan) {
    const last = runs[runs.length - 1];
    if (last && last[0].exerciseId === st.exerciseId) last.push(st);
    else runs.push([st]);
  }
  return runs;
}

/**
 * Equipment Occupied (V1): move the CURRENT exercise exactly ONE position later — its run swaps
 * with the next exercise's run, so the athlete does the next exercise first and returns to this
 * one. Pure: re-derives globalIndex + lastSetOfSession; structure, loads, targets unchanged. If
 * the current exercise is already last (no next run), the plan is returned unchanged.
 */
export function deferCurrentExercise(plan: Step[], fromIndex: number): Step[] {
  if (fromIndex < 0 || fromIndex >= plan.length) return plan;
  const runs = exerciseRuns(plan);
  let acc = 0;
  let cur = -1;
  for (let r = 0; r < runs.length; r++) {
    if (fromIndex < acc + runs[r].length) { cur = r; break; }
    acc += runs[r].length;
  }
  if (cur < 0 || cur >= runs.length - 1) return plan; // already last → unchanged
  const reordered = [...runs.slice(0, cur), runs[cur + 1], runs[cur], ...runs.slice(cur + 2)];
  const flat = reordered.flat();
  return flat.map((st, i) => ({ ...st, globalIndex: i, lastSetOfSession: i === flat.length - 1 }));
}

/**
 * ════ SHE REORDERS WHAT IS STILL AHEAD (founder, 2026-09-07) ════
 *
 * *"במהלך האימון יש פקד שמציג את התרגילים — אני רוצה שיהיה אפשרות להחליף את סדר התרגילים שם. רק
 * תוודא שמה שבוצע אי אפשר להחליף."*
 *
 * The session map has listed every lift since 2026-08-26 and could move none of them; the only
 * reorder verb was the equipment-busy one, which moves the CURRENT lift exactly one seat later.
 * This is the general form of the same operation — whole runs, never single sets — and it draws
 * the founder's line where the machine already draws it:
 *
 *   · a run whose first step sits BEFORE `boundary` has been started (or finished) and is a record.
 *     `boundary` is the cursor on a live set, and the cursor + 1 during a rest, because during a
 *     rest the cursor still points at the set she just logged (`sessionReducer` advances it on
 *     `REST_ELAPSED`, not on `COMPLETE_SET`). Either way: the set she is on, or has done, is fixed;
 *   · a lift that appears in MORE THAN ONE run is a superset or a circuit — its seats interleave
 *     with a partner's, and moving one half would break the structure the coach wrote. Locked.
 *
 * Runs that are movable keep their SEATS (a locked run between them stays where it was) and only
 * their relative order changes, so nothing in the fixed prefix — and therefore nothing the machine's
 * `setIndex` points at — is renumbered from under the cursor. Same renumbering as
 * `deferCurrentExercise`: `globalIndex` and `lastSetOfSession` re-derived, everything else carried.
 */
export function movableExercisesFrom(plan: Step[], boundary: number): string[] {
  const runs = exerciseRuns(plan);
  const runsOf = new Map<string, number>();
  for (const r of runs) runsOf.set(r[0].exerciseId, (runsOf.get(r[0].exerciseId) ?? 0) + 1);
  const out: string[] = [];
  let at = 0;
  for (const r of runs) {
    if (at >= boundary && runsOf.get(r[0].exerciseId) === 1) out.push(r[0].exerciseId);
    at += r.length;
  }
  return out;
}

export function reorderAheadOf(plan: Step[], boundary: number, exerciseId: string, toPosition: number): Step[] {
  const movable = movableExercisesFrom(plan, boundary);
  const from = movable.indexOf(exerciseId);
  if (from < 0) return plan;
  const to = Math.max(0, Math.min(movable.length - 1, toPosition));
  if (from === to) return plan;
  const order = movable.slice();
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  // Movable runs, by exercise; written back into the movable SEATS in the new order.
  const runs = exerciseRuns(plan);
  const byExercise = new Map(runs.filter((r) => movable.includes(r[0].exerciseId)).map((r) => [r[0].exerciseId, r]));
  let k = 0;
  const reordered = runs.map((r) => (movable.includes(r[0].exerciseId) ? byExercise.get(order[k++])! : r));
  const flat = reordered.flat();
  return flat.map((st, i) => ({ ...st, globalIndex: i, lastSetOfSession: i === flat.length - 1 }));
}

/**
 * ════ ANY FREE STATION STARTS NOW — the board, not the script (founder, 2026-09-07) ════
 *
 *   > *"מה קורה בחדר כושר עמוס שזה כבר לא מקרה קצה… ברוב המקרים האימון משתנה ולא לפי התוכנית."*
 *
 * The session is a ledger of what she still owes, not an order she has to keep. Whatever station is
 * free is the next thing: `exerciseId`'s first run still ahead of `boundary` is brought to the
 * boundary, and everything that was in front of it — INCLUDING the unfinished remainder of the lift
 * she is standing on — slides after it in its original order. A lift split this way returns later as
 * "set 3 of 4" with its logged sets intact (`currentBlockSetsOf` reads the trailing run from its
 * `setIndex === 0`), and `movableExercisesFrom` then locks it, exactly as it locks a superset: a lift
 * in two runs is not to be shuffled again.
 *
 * The record — everything before `boundary` — is never touched. Same renumbering as the other two
 * reorders. Pure; the same plan back when the lift is already next, or is not ahead at all.
 */
export function bringForward(
  plan: Step[],
  boundary: number,
  exerciseId: string,
  /**
   * ════ A LIFT SHE LEFT AFTER TWO OR MORE SETS WAITS AT THE END (founder, 2026-09-09) ════
   *
   *   > *"אם עשיתי x סטים בתרגיל כאשר x שונה מאחד, זרוק אותו לסוף האימון בסדר התרגילים כי כנראה
   *   > שאני מעדיף לעשות x סטים מאשר y הסטים שהתוכנית נתנה."*
   *
   * `remainderToEnd`: the run AT the boundary — the unfinished remainder of the lift she is
   * standing on — goes to the END of the order instead of straight after the new lift. Two sets
   * and a walk to another station is a decision about the lift (x sets, not y); the remainder is
   * hers to pick up at the end or to leave. The store decides from the record (`startExerciseNow`);
   * this only moves. A transition rest has no run at the boundary of the lift she left, so the
   * flag is inert there — the same plan a plain call returns.
   */
  opts?: { remainderToEnd?: boolean },
): Step[] {
  if (boundary < 0 || boundary > plan.length) return plan;
  const ahead = plan.slice(boundary);
  const start = ahead.findIndex((st) => st.exerciseId === exerciseId);
  if (start <= 0) return plan; // not ahead (−1), or already the very next thing (0)
  let end = start;
  while (end < ahead.length && ahead[end].exerciseId === exerciseId) end += 1;
  const run = ahead.slice(start, end);
  let lead = 0; // the remainder of the lift at the boundary, when it is to wait at the end
  if (opts?.remainderToEnd) while (lead < start && ahead[lead].exerciseId === ahead[0].exerciseId) lead += 1;
  const flat = [...plan.slice(0, boundary), ...run, ...ahead.slice(lead, start), ...ahead.slice(end), ...ahead.slice(0, lead)];
  return flat.map((st, i) => ({ ...st, globalIndex: i, lastSetOfSession: i === flat.length - 1 }));
}

/** The lifts she could start now — every run still ahead of `boundary`, first-seen order, the one at the boundary excluded. */
export function aheadExercisesFrom(plan: Step[], boundary: number): string[] {
  const nextId = plan[boundary]?.exerciseId;
  const out: string[] = [];
  for (const st of plan.slice(boundary)) if (st.exerciseId !== nextId && !out.includes(st.exerciseId)) out.push(st.exerciseId);
  return out;
}

/** Where the record ends and the future begins — see `reorderAheadOf`. */
export function reorderBoundary(machine: SessionMachine): number {
  const phase = machine.phase === 'PAUSED' ? machine.resumePhase ?? 'SET_PRESENTED' : machine.phase;
  const resting = phase === 'REST_INTER' || phase.startsWith('REST_TRANSITION');
  return resting ? machine.setIndex + 1 : machine.setIndex;
}

/**
 * The logged sets of ONE lift, scoped to the block she is in — see `currentBlockSets` for why the
 * block matters. One helper because the reps and the loads must never disagree about which sets
 * they are describing.
 */
function currentBlockSetsOf(sets: SetLog[] | undefined, exerciseId: string): SetLog[] {
  // Working sets only (2026-08-24): during the ramp the trailing-run rule would return the warm-up
  // logs themselves (no `setIndex === 0` exists yet), and "the set before" would be a bridge —
  // drawing a planned 50%→75% climb as news on the hero.
  return currentBlockSets((sets ?? []).filter((x) => x.exerciseId === exerciseId && !x.isApproach));
}

interface InternalState {
  plan: Step[];
  session: Session | null;
  machine: SessionMachine;
  /** The session's FULL target table (every exercise, per set) — a swap adopts the NEW
   *  exercise's own prescription instead of carrying the old lift's load across equipment
   *  (a bench 60 kg must never ride onto a machine pin). Empty on resume (swaps then fall
   *  back to carrying reps at the old load). */
  targets: SetTarget[];
}

type Action =
  | { type: 'START'; plan: Step[]; session: Session; machine: SessionMachine; targets?: SetTarget[] }
  | { type: 'LOG'; setLog: SetLog; session: Session; machine: SessionMachine }
  /** A step that was not a set — held, covered, or simply done. Same movement, no `SetLog`. */
  | { type: 'LOG_ITEM'; session: Session; machine: SessionMachine }
  /** The clock ran forward (`domain/sessionClock`): a rest that ran out while the app slept, served at its instant. */
  | { type: 'CLOCK'; session: Session; machine: SessionMachine }
  /** The record changed under a still machine — her word on a lift (confirm / amend / re-anchor). */
  | { type: 'SESSION'; session: Session }
  | { type: 'MACHINE'; machine: SessionMachine }
  | { type: 'SWAP_PLAN'; plan: Step[] }
  | { type: 'END' };

function reducer(s: InternalState, a: Action): InternalState {
  switch (a.type) {
    case 'START':
      return { plan: a.plan, session: a.session, machine: a.machine, targets: a.targets ?? [] };
    case 'LOG':
    case 'LOG_ITEM':
    case 'CLOCK':
      return { ...s, session: a.session, machine: a.machine };
    case 'SESSION':
      return { ...s, session: a.session };
    case 'MACHINE':
      return { ...s, machine: a.machine };
    case 'SWAP_PLAN':
      return { ...s, plan: a.plan };
    case 'END':
      return { plan: [], session: null, machine: initialSessionMachine(true), targets: [] };
    default:
      return s;
  }
}

/**
 * Re-point every remaining step of `oldId` (from `startIdx`) at `newId`, adopting the NEW
 * exercise's own per-set target when the session's target table carries one — the display /
 * performed / learned number must be the new lift's prescription, never the old lift's load
 * on different equipment. Falls back to carrying reps at the old target when absent. Pure.
 */
/**
 * The rest anchor after a pause is lifted: pushed forward by exactly the time the workout stood
 * still, so the rest resumes where it was — on EVERY surface.
 *
 * The mirror derives the rest's end from this anchor, so if it does not move, the rest keeps
 * burning through a pause for everyone except the phone screen (which freezes its own countdown
 * locally). Pause for five minutes mid-rest and the wrist would say READY — and buzz GO — while
 * the phone still showed 45 seconds. Pure, so the rule is a tested fact rather than a line inside
 * a store method.
 */
export function unfrozenRestAnchor(
  restStartedAtMs: number | null,
  pausedAtMs: number | null,
  nowMs: number,
): number | null {
  if (restStartedAtMs == null || pausedAtMs == null) return restStartedAtMs;
  return restStartedAtMs + Math.max(0, nowMs - pausedAtMs);
}

/** One frozen empty array, so `loggedSets` keeps a stable identity between sessions — a fresh `[]`
 *  per render would re-fire every effect that depends on it, and the pair publishes on that effect. */
const EMPTY_SETS: readonly SetLog[] = Object.freeze([]);

/** Has this exact step already been logged? One set, one log — whichever surface asked (see completeSet). */
export function hasLoggedStep(sets: readonly SetLog[], exerciseId: string, exerciseSetIndex: number): boolean {
  return sets.some((s) => s.exerciseId === exerciseId && s.setIndex === exerciseSetIndex);
}

export function retargetPlanForSwap(
  plan: Step[],
  targets: SetTarget[],
  startIdx: number,
  newId: string,
): Step[] {
  const anchor = plan[startIdx];
  if (!anchor) return plan;
  const oldId = anchor.exerciseId;
  const targetFor = (setIndex: number): SetTarget | undefined =>
    targets.find((t) => t.exerciseId === newId && t.setIndex === setIndex);
  return plan.map((st) =>
    st.exerciseId === oldId && st.globalIndex >= startIdx
      ? {
          ...st,
          exerciseId: newId,
          // A step with no rep prescription has none to carry across either — a swapped plank is
          // still a plank, and inventing a target here would put a weight on it.
          ...(st.target ? { target: targetFor(st.exerciseSetIndex) ?? { ...st.target, exerciseId: newId } } : {}),
        }
      : st,
  );
}

export interface CompleteResult {
  ended: boolean;
  unlockedPortrait: boolean;
  /** Closing summary for the Complete screen — present when a real (≥1 set) session was saved. */
  summary?: SessionSummary;
  /** The athlete left without logging a single set: NOT a workout — nothing was saved or counted. */
  notStarted?: boolean;
  /**
   * THE SIGNATURE MOMENT, handed back to the caller. Loop 1 also publishes this on `correction`
   * (consumed by the rest card's eased-load pill), but the phone's "Set logged" beat needs it
   * SYNCHRONOUSLY — at the instant the set writes — to reveal the correction on the logged moment
   * itself (mock 2.3), before releasing to rest. Present only when the set just logged moved the
   * next one; null/absent otherwise, and always absent on the set that ends the session (the last
   * set has no next set to correct).
   */
  correction?: LiveCorrection | null;
}

/** What the SessionFlow renders underneath any overlay. */
export type DisplayPhase = 'SET_PRESENTED' | 'REST_INTER' | 'REST_TRANSITION';

/**
 * A set the WATCH just logged — so the phone can play the beat it always plays (founder
 * 2026-07-13: "I complete a set on the watch and the phone never shows the logged screen").
 *
 * The phone's own Complete Set holds the "Set logged" beat BEFORE it writes; a watch completion
 * writes immediately, so this is the same beat played AFTER the fact, over the rest that has
 * already started. `seq` is what the screen watches: two identical sets logged in a row are two
 * beats, and the payload alone could not tell them apart.
 */
export interface WatchLoggedSet {
  weight: number | null;
  reps: number;
  n: number;
  m: number;
  seq: number;
  /*
   * ⛔ THE BAND THE SET WAS DECIDED AGAINST — added 2026-08-12, and it closes a real split.
   *
   * The wrist reported four numbers and no band, so `bandPlacement` could never place a set logged
   * on the watch. **The same set showed the band instrument on the phone and a bare "34 kg × 8 ·
   * Set recorded" readback from the wrist** — two different answers to one set, decided by which
   * device the athlete happened to tap. It looked like a designed state; it was a missing field.
   *
   * Captured beside `weight` and `reps`, before the machine advances, for the identical reason.
   */
  band?: [number, number];
  /** Which lift it belonged to — the last set of one closes it, and the beat says its name. */
  lift?: string;
  /** This set struck her all-time record (domain/setRecord) — same rule, either device, so a PR
   *  never depends on which wrist or thumb happened to log it (2026-08-24). */
  record?: boolean;
}

export interface SessionView {
  active: boolean;
  phase: SessionMachine['phase'];
  /** Phase to render — under Pause this is the FROZEN prior phase (spec §7.2). */
  displayPhase: DisplayPhase;
  paused: boolean;
  currentExercise: Exercise | null;
  /** Raw exercise id of the current step (a fallback when the local catalog lacks
   *  the exercise, so the Active Set never renders blank — §7.9). */
  currentExerciseId: string | null;
  /** Distinct exercise ids across the whole session — lets an in-session swap avoid offering a
   *  lift the session already contains (no duplicate in one workout). */
  sessionExerciseIds: string[];
  /** The lifts she may still move — every one not yet started, and not half of a superset.
   *  See `movableExercisesFrom`. A done or live lift is a record and never appears here. */
  movableExerciseIds: string[];
  /** WORKING sets per exercise across the plan (warm-up bridges excluded) — the session map's
   *  per-row figure (the rail's own sheet, 2026-08-26). */
  sessionSetCounts: Record<string, number>;
  currentTarget: SetTarget | null;
  /**
   * What the coach wrote for the step she is on, when the plan came from a coach — the
   * discriminator the stage switches on. Absent on an engine-built plan (which is reps by
   * construction), and `kind: 'reps'` is the ordinary set screen exactly as it has always been.
   */
  currentItem: PlannedItem | null;
  /** The same, for the step a rest is leading into — so a crossing card can say what is coming. */
  nextItem: PlannedItem | null;
  /**
   * The next exercise's NAME when there is no rest before it — a superset, a circuit, a lift paired
   * with a hold. Null whenever a rest follows, which is every ordinary set.
   *
   * The app has always RUN these correctly and never told the athlete: she finished a set of bench,
   * a row appeared immediately, and nothing said that was the plan rather than a fault.
   */
  straightInto: string | null;
  /** Raw id of the upcoming exercise (rest only) — readable-name fallback (§7.9). */
  nextExerciseId: string | null;
  /** Set n of m within the exercise. `warmup: true` = a ramp step — n/m then count the RAMP
   *  ("Warm-up 1 of 2"), never the working sets, and the stage prints the warm-up wording. */
  setLabel: { n: number; m: number; warmup?: boolean } | null;
  /*
   * ⛔ `emphases` IS DELETED (founder, 2026-08-12). It carried the coach's sentence per exercise and
   * had exactly two readers — the mid-workout sheet and the cardio sheet — and both are gone.
   *
   * ⚠️ THE SENTENCE ITSELF IS NOT LOST. `ItemStage` draws an item's `say` on the stage it belongs
   * to (`SayLine`), which is the better place for it anyway: beside the thing it is about, not
   * collected onto a page she has to go and open. What no longer has a surface is the `say` on an
   * ordinary LIFT — see the note left with the deletion.
   */
  /**
   * ⛔ WHAT SHE DID LAST TIME ON THE LIFT IN FRONT OF HER (founder 2026-08-04).
   *
   * The one number a gym app is asked for most, and the EVIDENCE for the load the coach chose — it
   * turns the number on the stage from an instruction into a conclusion she can check. Null on a
   * lift she has never done, which is a real state and not a hole to fill.
   */
  lastTime: LastTime | null;
  /**
   * ⛔ WHAT SHE HAS ALREADY DONE ON THIS LIFT, THIS SESSION — in the order she did it.
   *
   * The set stage draws her sets as a row of large figures (`domain/setRow`), which is what replaced
   * the rep-band graphic and the ten-point "last time" line. Until now the screen could not see a
   * single set she had performed: the logged sets live on the session and the view was never handed
   * them, so set 3 looked exactly like set 1.
   *
   * Reps only. The row is about how the lift is GOING, and a load column beside it would be the
   * second graphic this stage keeps rejecting.
   */
  setsSoFar: number[];
  /**
   * ⛔ AND THE LOADS SHE LIFTED THEM AT (founder 2026-08-04): *"we show how many reps were done, but
   * we are not showing how much weight was lifted."*
   *
   * The set stage compares the load in front of her to the one on the PREVIOUS set of this lift —
   * a Loop 1 correction is the change she has to act on, and it outranks last week. Same order,
   * same filter, same session as `setsSoFar`, so the two arrays are index-aligned by construction.
   */
  loadsSoFar: (number | null)[];
  /**
   * ════ ⛔ THE PAIR'S ONE READ OF THE LIVE SESSION — read-only, and deliberately RAW (2026-08-31) ═
   *
   * Two athletes on one bar (`state/stores/pairStore`, `domain/sharedSession`). The pair needs to
   * know two things about this session and nothing else: the STEPS it is made of, and which of them
   * have been LOGGED. Everything the shared stage draws — whose turn it is, which station the two
   * are at, how far each of them is through it — is derived from those, on both phones, by one pure
   * function.
   *
   * ⚠️ RAW RATHER THAN PROJECTED, ON PURPOSE. A second projection of the live session is the exact
   * thing `platform/sessionMirror` exists to prevent (*"there is deliberately NO second projection
   * system — duplicating this would let the surfaces drift from the phone's session machine"*). The
   * mirror is the projection for surfaces that DISPLAY the workout; the pair is not one of those —
   * it publishes a COUNT to another phone. Handing it the two arrays it counts, rather than a
   * shaped view it would have to be kept in step with, is what keeps the count honest.
   *
   * ⛔ AND IT IS READ-ONLY IN THE STRONGEST SENSE: nothing the pair receives can reach back through
   * here. The wire cannot log a set, move the cursor, or end a workout — those live on the actions
   * below, and no partner has a path to any of them.
   */
  livePlan: readonly Step[];
  loggedSets: readonly SetLog[];
  globalProgress: { index: number; total: number } | null;
  /** Exercise ordinal among the session's distinct exercises ("Exercise n / N"). */
  exerciseProgress: { index: number; total: number } | null;
  nextExercise: Exercise | null; // for Rest preview (upcoming set/exercise)
  nextTarget: SetTarget | null;
  /** Upcoming set's "n of m" label (the set the rest leads into) — §4.11/§4.12. */
  nextSetLabel: { n: number; m: number; warmup?: boolean } | null;
  restSeconds: number;
  /** Seconds added to the CURRENT rest by "+15 sec", from EITHER surface. The phone's Rest
   *  countdown reads this and fills forward by the delta — which is how a watch +15 reaches the
   *  phone (its countdown is local, and nothing used to tell it the rest had grown). */
  restExtraSeconds: number;
  /** Epoch ms the running rest began — the mirror's anchor; null unless resting and not paused. */
  restStartedAtMs: number | null;
  /** Epoch ms the running rest ENDS (start + prescribed + extra) — the instant the wrist, the lock
   *  screen and the phone's ring all count to. Null unless resting and not paused. */
  restEndsAtMs: number | null;
  /** The rest-over alert's words for the set the rest leads into; null when nothing follows. */
  restAlert: { title: string; body: string } | null;
  /** The last set the WATCH logged — the phone plays its "Set logged" beat over it. */
  watchLoggedSet: WatchLoggedSet | null;
  /** Epoch ms the active session started (drives the session elapsed-time label on the mirror). */
  startedAtMs: number | null;
  /** The day's name ("Upper A") — the voice's opening line says it (spec §3.1). */
  workoutName: string;
  // actions
  /**
   * `withPartners` stamps `Session.partners` at START — the people she trained WITH.
   *
   * ⛔ THE FIELD'S OWN HEADER CALLED THIS SHOT IN ADVANCE (`models.ts`, founder 2026-08-23): *"v1 is
   * names she writes; the live shared-session (CloudKit circles) will fill this from the pairing
   * when it lands, on the same field — the record's shape is the contract, not the mechanism."*
   * This is the pairing filling it, and nothing downstream had to change: the finish poster and the
   * story card have read this field since the day it was written.
   *
   * At START rather than at save, because a pair that dissolves at the fourth lift was still a
   * workout they did together — and because a session killed mid-way must carry it into salvage.
   */
  start: (day: ProgramDay, targets: SetTarget[], withPartners?: readonly string[]) => Promise<void>;
  /**
   * Begin a session the COACH wrote.
   *
   * The same machine, entered through a different door. `start` takes a `ProgramDay` and a set of
   * engine targets; a coach session has neither — it has blocks of items, three of whose four
   * shapes a `ProgramDay` cannot express, and its loads are already decided and sitting in the
   * plan. So the two doors stay separate rather than one of them pretending to be the other.
   *
   * `workoutId` is the coach workout's positional id (`coachWorkoutId`), stamped on the session so
   * History can say which workout this was long after the programme has changed shape.
   */
  startCoach: (session: PlannedSession, workoutId: string, withPartners?: readonly string[]) => Promise<void>;
  /** An interrupted (app-killed) workout that can still be picked up, or null. Home reads
   *  this on focus to offer "Continue {workout}" as the primary CTA (S3). */
  loadResumable: () => Promise<{ workoutName: string } | null>;
  /** Rebuild the interrupted session exactly where it was (logged sets kept, wall-clock
   *  rest caught up). False when nothing usable remains — the caller falls back to Begin. */
  resumeSaved: () => Promise<boolean>;
  /**
   * Take over a workout the WRIST is running (the live handover). Resolves with what happened:
   * `adopted` — the phone now holds it and the stage will draw; `duplicate` — it already does, or
   * the workout has already come home as a finished record; `refused` — a different session is live
   * here, or the offered state is one the phone could not honestly stand in.
   *
   * Never overwrites a live session, and never half-adopts: every question is answered before
   * anything is mutated. See the implementation.
   */
  adoptLocalSession: (local: WatchLocalSession) => Promise<'adopted' | 'duplicate' | 'refused'>;
  completeSet: (override?: { weight: number | null; reps: number }) => Promise<CompleteResult>;
  /**
   * End the current step when it is NOT a set — held, covered, or simply done.
   *
   * `seconds` is what she ACTUALLY held (a plank stopped at 20 of 45 is a 20-second plank, not a
   * failure); `metres` what she actually covered. Both default to what was asked. Refuses a reps
   * step, exactly as `completeSet` refuses one without a target.
   */
  completeItem: (done?: { seconds?: number; metres?: number; activityId?: string }) => Promise<CompleteResult>;
  /** Edit Result: update the CURRENT set's weight/reps in place (re-renders Active
   *  Set). Does NOT log — Complete Set remains the sole confirmer (§4.13 / founder). */
  editCurrentSet: (v: { weight: number | null; reps: number }) => void;
  /*
   * ════ THE VOICE COACH'S VERBS (docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md, 2026-09-08) ════
   * Four verbs the conductor needs that the stage never did. Each is a fact about the session the
   * screens already draw — none of them changes a screen, which is the founder's condition.
   */
  /** Her load for the lift, from the set on stage onward — the loading dialogue's "ארבעים וחמש"
   *  and the voice's Loop 1 verdict. Carries forward exactly as a lifted weight does. */
  setLiftLoad: (weightKg: number | null) => void;
  /** "מוכן" — the set on stage starts NOW: the clock's stamp moves to this instant and the pocket
   *  alerts re-arm from it. The lock screen's Ready button lands here too (`set_ready`). */
  markSetStarted: () => void;
  /** The loading dialogue is open: the lock screen shows Ready beside Done. */
  setAwaitingReady: (on: boolean) => void;
  awaitingReady: boolean;
  /**
   * The engine's first-set prescription for ANY exercise in the session's target table — what a
   * swap WOULD put on the bar (design review 2026-09-01: the swap sheet offered three names with
   * no loads, and the load is half of what decides a swap). Null for an exercise the table does
   * not carry (resumed sessions run without a table; the sheet then simply shows no figure).
   */
  previewTargetFor: (exerciseId: string) => SetTarget | null;
  /** Her heaviest EVER logged weight on the current lift (domain/setRecord), or null when the
   *  lift has no past — the beat's record question is answered against this. */
  priorPeakKg: number | null;
  /**
   * ════ THE WARM-UP DISC, AND WHETHER IT EXISTS RIGHT NOW (founder 2026-08-30) ════
   *
   * How many bridges the athlete would get if she pressed it — 0 means the disc is not offered,
   * and it is the ONE question the stage bar asks. `warmupOffer` owns the whole rule; this is it,
   * asked at the step she is actually about to perform:
   *
   *   · on a live SET, the step she is standing on;
   *   · on a CROSSING, the step she is walking to — because "the start of the exercise" is a place
   *     she reaches before the first set, and the crossing is where she is deciding what to rack.
   *     (The cursor has not moved yet on a crossing; that is the same fact the film disc above it
   *     gets wrong every time it is written from `current`.)
   *   · never during a rest BETWEEN sets: the lift has begun, and a bridge behind her is nothing.
   */
  warmupOffered: number;
  /**
   * ════ THIS SET HAS RUN LONGER THAN HERS EVER DO (founder, 2026-08-30) ════
   *
   *   > *"כעבור זמן מסוים שכבר הייתי אמור לסיים את הסט צריך להשלח התראה של להזין את התוצאה."*
   *
   * True once the set on screen has passed twice her measured execution on this lift
   * (`domain/setDwell` owns the number and the argument). It is the FOREGROUND half of the ask;
   * the pocket gets a scheduled OS note instead, and the two are armed and cancelled together.
   *
   * ⚠️ IT IS A QUESTION, NOT A VERDICT. Nothing is inferred from it and nothing is written because
   * of it — the founder rejected the version that credited the dwell against her rest, and he was
   * right: the app does not know what she was doing, only that it has been a long time to be
   * asking. So it asks, once, and the athlete decides.
   */
  setRunningLong: boolean;
  /** Her numbers on one logged set of a lift, in the block she is in — the voice's "לא, עשר" in the echo's tail. */
  amendSet: (exerciseId: string, setIndex: number, v: { weight: number | null; reps: number }) => void;
  /** Replay lock-screen taps at their instants — see `applyLockIntents` (2026-09-08). */
  applyLockIntents: (intents: LockIntent[]) => Promise<void>;
  /**
   * ════ WHAT THE APP KNOWS ABOUT HER ON THE LIFT SHE IS WALKING TO (2026-08-31) ════
   *
   *   > *"אם המשתמש מרגיש שבאמת התוכנית אישית… יהיה לו דרייב לדבוק בה ולהשקיע ברישום כל סט."*
   *
   * One measured fact, or null (`domain/whatIKnow` owns which, and why one). Present only on a
   * CROSSING — she is between stations, walking, with nothing to do but read, and the thing she is
   * about to start is the thing she is thinking about. Between sets of a lift she is mid-effort and
   * the stage holds one decision; on a live set the whole screen is the prescription.
   *
   * ⚠️ AND IT IS THE NEXT LIFT, not the current one — the crossing's standing trap
   * (`filmSubject`, and the founder's own bug of 2026-08-30). Read from `next` for that reason.
   */
  nextLiftFact: KnownFact | null;
  /**
   * Insert the offered ramp and step onto its first bridge. A no-op when nothing is offered, so the
   * disc and the action cannot disagree — they are one derivation (`warmupOffer`).
   */
  addWarmup: () => void;
  endRest: () => void;
  /** Extend the running rest by N seconds ("+15 sec"). Re-publishes the longer rest
   *  to the watch + Live Activity; the phone's own rest UI also reflects it. */
  extendRest: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  finishEarly: () => Promise<CompleteResult>;
  /** Mid-session "choose another": swap the UPCOMING exercise in place (situational,
   *  not persisted — §7.3). Capability is preserved (Replacement stays in-class). */
  /**
   * ⛔ THE COACH'S WRITE PATH INTO THE RUNNING SESSION (founder 2026-08-02).
   *
   * *"You can just ask the coach for anything in the chat window and it happens."* This is the
   * "it happens". Returns how many edits actually landed — the caller says nothing changed rather
   * than reporting a change that did not occur.
   */
  reviseToday: (edits: LiveEdit[]) => number;
  swapNextExercise: (exerciseId: string) => void;
  /** Swap the CURRENT exercise in place (situational, not persisted). Only meaningful
   *  before any of its sets are logged; capability/load progression are preserved. */
  swapCurrentExercise: (exerciseId: string) => void;
  /** Equipment Occupied (V1): move the current exercise one position later in the workout
   *  (no replacement, no structure change). Only available at the start of an exercise. */
  markEquipmentOccupied: () => void;
  /** Move a lift that is still ahead to `toPosition` among the movable ones (the session map's
   *  drag). A lift outside `movableExerciseIds` is refused silently — see `reorderAheadOf`. */
  reorderAhead: (exerciseId: string, toPosition: number) => void;
  /**
   * ════ THE BOARD (founder, 2026-09-07): any free station starts now ════
   * `aheadExerciseIds` — the lifts still wholly ahead of her, first-seen order, the very next one
   * excluded (it needs no verb). `startExerciseNow` brings one of them to the front: from a rest
   * the rest is cut and its first set presents; from a live set the unfinished remainder of the
   * lift she is on slides after it and she returns to "set 3 of 4". See `bringForward`.
   */
  aheadExerciseIds: string[];
  startExerciseNow: (exerciseId: string) => void;
  /** True when Equipment Occupied applies (at the start of an exercise that isn't last). */
  canMarkOccupied: boolean;
  /** TO-LOAD vs LOADED for the current set: true when the athlete must still set the equipment
   *  (first set of the exercise, or the load changed since the last completed set). Drives the
   *  bright imperative instruction vs the quiet "loaded" confirmation on the Active Set. */
  toLoad: boolean;
  /** Publish the pre-session lobby to the Apple Watch Start screen (the queued
   *  workout + pickable list). Read-only/no-op while a session is active. The phone
   *  remains the sole authority that actually starts a workout WHILE PRESENT; the
   *  optional `plan` snapshot is what lets the watch execute one when it is not. */
  publishWatchLobby: (lobby: WatchLobby, plan?: WatchPlanSnapshot | null) => void;
  /** Register (or clear, with null) the Home screen's Begin/Choose handlers so the
   *  watch Start screen can run the EXACT same path. Home sets these while focused
   *  and clears them on blur, so a watch Begin only acts when the phone is on Home. */
  setWatchHomeActions: (
    handlers: { onBegin: () => void; onSelect: (workoutId?: string) => void } | null,
  ) => void;
  /** The closing result of the session that just finished, or null. Set when ANY
   *  completion path resolves (phone tap, finish-early, or a watch-proposed finish),
   *  so SessionFlow can navigate to Well Done from one place. Cleared by the consumer. */
  endResult: CompleteResult | null;
  /** Acknowledge `endResult` after navigating to Well Done (prevents a re-navigation). */
  clearEndResult: () => void;

  /**
   * THE SIGNATURE MOMENT — Loop 1 just moved the next set's load, and this is Hush saying so.
   *
   * The brief calls the real-time correction "the single most distinctive moment in the product"
   * and notes it is easy to miss. It was easy to miss because **nothing told anyone**: the store
   * ran `applyLoop1`, sent `l1.corrected` / `l1.direction` to TELEMETRY, and silently swapped the
   * plan. The set just logged really did change the next one — the athlete simply arrived at a
   * different number with no account of why. A coach standing next to you says it out loud.
   *
   * Set the moment a set is logged and a correction lands; consumed by the stage's rest beat and
   * mirrored to the wrist. Cleared when the athlete moves on — it belongs to one rest, not the
   * session (`clearCorrection`).
   */
  correction: LiveCorrection | null;
  /** Acknowledge `correction` once it has been shown (it belongs to one rest, not the session). */
  clearCorrection: () => void;
}

/**
 * A load correction Loop 1 just made, with everything a surface needs to SAY it.
 *
 * `from` and `to` are the loads, not a delta: the athlete is watching a number she was about to
 * lift change into a different number, and both halves of that are the story. `reps` is the fact
 * that earned it — Hush never states a reason it did not measure (R7), and the reps she just did
 * are the entire reason.
 */
export interface LiveCorrection {
  exerciseId: string;
  direction: 'up' | 'down';
  from: number;
  to: number;
  /** The reps she just did — the measured fact that moved the load. */
  reps: number;
  /** Her band's edge that the set crossed: above `hi` → too light, below `lo` → too heavy. */
  band: [number, number];
}

const Ctx = createContext<SessionView | null>(null);

/** Raw context — WEB PREVIEW GALLERY only (see `AppContext` in appStore for the why). */
export const SessionContext = Ctx;

/*
 * ⛔ "THE SAME SPAN EVERY OTHER SURFACE PRICES ITS CALORIES OVER" — IT WAS NOT, TWICE OVER.
 *
 * This file held a duration that read only `sets` (so an interval session was zero seconds long and
 * cost zero calories on the wrist), AND a second, different one below it: the summary handed to Well
 * Done measured `Date.now() - startedAt` at the moment she pressed Finish. Sit for ten minutes after
 * the last set and Well Done said 48 min while the Log row, a tap later, said 38. One span now,
 * `domain/sessionMetrics.sessionDurationMs` — start to the last stamp in either record.
 */

export function buildPlan(day: ProgramDay, targets: SetTarget[]): Step[] {
  const find = (exerciseId: string, setIndex: number): SetTarget => {
    const t = targets.find((x) => x.exerciseId === exerciseId && x.setIndex === setIndex);
    // Data gap (§7.9): never render "—"; fall back to a neutral target if missing.
    return t ?? { exerciseId, setIndex, recommendedWeight: null, recommendedReps: 8 };
  };
  const steps: Step[] = [];
  let global = 0;
  const totalSlots = day.slots.length;
  /*
   * ⛔ THE RAMP IS NOT BUILT HERE ANY MORE — IT IS ASKED FOR (founder, 2026-08-30) ════
   *
   *   > *"אני חושב שרק בתרגילי הקומפאונד צריך להופיע האפשרות לפקד חימום ובשאר לא. לא לקבוע מראש
   *   > לאף אחד חימום ומי שרוצה שילחץ על הפקד."*
   *
   * The 2026-08-24 contract stands in full — what a bridge IS, what it costs, that it never touches
   * the working prescription, that its log is excluded from every engine decision. What changed is
   * WHO decides there is one. It was written into the plan for every loaded compound; now the plan
   * is built without bridges and the athlete inserts them, at the station, with the warm-up disc
   * (`warmupOffer` / `insertWarmup` below — one rule, offered on compounds only).
   *
   * ⚠️ AND THE HOUR STOPPED PAYING FOR THEM, which is the half that was not cosmetic. `coachWeek`
   * and `fixtureModel` charged 70 s per structural bridge, and a day pushed over the ceiling by
   * that charge had `enforceTimeCap` cut a WORKING SET to fund it. Charging in advance for a
   * warm-up nobody asked for, in the currency of real work, is the wrong way round. The charge is
   * gone, and `leanWarmup` — which existed only to buy the mandatory ramp's cost back — with it.
   */
  day.slots.forEach((slot, slotIdx) => {
    for (let s = 0; s < slot.setCount; s++) {
      steps.push({
        exerciseId: slot.exerciseId,
        globalIndex: global,
        exerciseSetIndex: s,
        totalSetsInExercise: slot.setCount,
        target: find(slot.exerciseId, s),
        lastSetOfExercise: s === slot.setCount - 1,
        lastSetOfSession: slotIdx === totalSlots - 1 && s === slot.setCount - 1,
      });
      global += 1;
    }
  });
  return steps;
}

/**
 * ════ A COACH'S SESSION, AS THE MACHINE RUNS IT ════
 *
 * The second builder. `buildPlan` above turns a `ProgramDay` + `SetTarget[]` into steps — the shape
 * the engine's generator produces, and the one every TestFlight workout runs today. This turns what
 * the COACH wrote into the same `Step[]`, so the machine, the rest timer, the crash salvage, the
 * watch mirror and the record all keep working without knowing which builder made the plan.
 *
 * The expansion itself is not repeated here: `domain/planRun` owns it, because rounds are where a
 * circuit and a straight block stop looking alike and there must be exactly one place that knows.
 *
 * A `reps` item gets a real `SetTarget` and is indistinguishable from a step the old builder made —
 * that is the point, and it is why the reps path needs no new code at all. Every other shape gets
 * NO target, which is what makes it visible as something else all the way down: the wrist does not
 * mirror it as a set, Loop 1 steps over it, `completeSet` refuses it, and the stage sends it to
 * `ItemStage` instead.
 */
export function buildPlanFromCoach(session: PlannedSession): Step[] {
  const steps = runSteps(session);
  /*
   * ⛔ AND NO RAMP IS BUILT HERE EITHER (founder 2026-08-30 — see `buildPlan` for the ruling).
   *
   * This builder carried bridges from 2026-08-25, when it turned out `buildPlan`'s ramp had no
   * production caller at all. Both builders now produce the same thing: the session as written,
   * with no bridge in it. The two restrictions that were enforced HERE, because only this shape
   * knows about rounds, did not evaporate with the injection — they moved to `warmupOffer`, which
   * derives both from the finished plan (a bridge is offered only at the first step of an
   * exercise's own run, never inside a superset round, never on a lift the plan revisits).
   */
  const out: Step[] = [];
  let global = 0;
  steps.forEach((st, i) => {
    const lastOfExercise = i === steps.length - 1 || steps[i + 1].item.ex !== st.item.ex;
    out.push({
      exerciseId: st.item.ex,
      globalIndex: global,
      // Kept in the vocabulary the rest of the machine already speaks: for a straight block these
      // ARE the sets of the exercise; for a circuit they are its laps, which is the same count.
      exerciseSetIndex: st.round - 1,
      totalSetsInExercise: st.rounds,
      ...(st.item.kind === 'reps'
        ? {
            target: {
              exerciseId: st.item.ex,
              setIndex: st.round - 1,
              recommendedWeight: st.item.load,
              recommendedReps: st.item.reps[0],
              repBandLo: st.item.reps[0],
              repBandHi: st.item.reps[1],
            } satisfies SetTarget,
          }
        : {}),
      item: st.item,
      where: { block: st.block, round: st.round, position: st.position },
      restAfterS: st.restAfterS,
      lastSetOfExercise: lastOfExercise,
      lastSetOfSession: st.last,
    });
    global += 1;
  });
  return out;
}

/**
 * ════ WHOSE FILM THE FORM DOOR PLAYS (founder bug, 2026-08-30) ════
 *
 *   > *"באג - בסט המעבר זה מציג את הוידאו של התרגיל הקודם."*
 *
 * ⛔ THE CAUSE IS ONE LINE OF THIS FILE'S OWN CONTRACT: **the cursor only moves on `REST_ELAPSED`**
 * (see `restSeconds` in the view). So for the whole of a transition rest `currentExerciseId` is the
 * lift that ENDED, and `nextExerciseId` is the one the screen is entirely about. Every other part of
 * the crossing already knew — the name, the load, the plates-a-side line, the SWAP disc — and the
 * form disc was the one control still written from `current`, so it played the dumbbell she had
 * just put down over a card describing the machine she was walking to.
 *
 * ⚠️ AND THE GATE FAILED IN BOTH DIRECTIONS, from the same mistake. It asked whether the CURRENT
 * step was a catalogue lift: crossing into a RUN that is true, so the door stood open onto the
 * finished lift; crossing out of a run INTO a lift it is false, so the door was missing at the one
 * moment a film is most wanted — a station she has not reached yet.
 *
 * `null` means there is no film and therefore no door. A run has none (`exerciseCues` for a
 * movement id is empty, and there is no clip of five kilometres), and a door onto nothing is worse
 * than no door.
 *
 * Pure, and exported, so the law can hold it without standing a session up.
 */
export function filmSubject(
  displayPhase: DisplayPhase,
  currentExerciseId: string | null,
  nextExerciseId: string | null,
): string | null {
  const id = displayPhase === 'REST_TRANSITION' ? nextExerciseId : currentExerciseId;
  return id && exerciseById(id) ? id : null;
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WARM-UP IS OFFERED, NOT PRESCRIBED (founder, 2026-08-30)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"אני חושב שרק בתרגילי הקומפאונד צריך להופיע האפשרות לפקד חימום ובשאר לא. לא לקבוע מראש
 *   > לאף אחד חימום ומי שרוצה שילחץ על הפקד."*
 *
 * Two rules, and this is the first of them: WHEN a bridge may be asked for. It is asked by the
 * stage bar (does the disc exist?) and by the action that inserts one (is this legal?), and those
 * two must never be able to disagree — a disc that leads to a refusal is worse than no disc.
 *
 * ── WHAT IS OFFERED, AND WHY EACH CONDITION IS THERE ───────────────────────────────────────────
 *   · **A COMPOUND, AND NOTHING ELSE** — the founder's ruling, and also the surviving half of the
 *     2026-08-24 contract (*"it exists only where it earns its place"*). A curl gets no disc at all,
 *     rather than a disc that opens onto an empty ramp.
 *   · **AT THE START OF THE EXERCISE** — the first step of its own contiguous run. A bridge after
 *     her first working set is not a bridge, and the founder's word was *"בתחילת כל תרגיל"*.
 *   · **NOT INSIDE A SUPERSET ROUND** — carried over verbatim from `buildPlanFromCoach`, which used
 *     to enforce it while it still had the block shape in hand. A round is one breath; a bridge in
 *     its middle breaks it. Derived here from `where`: a block with more than one position is not
 *     straight.
 *   · **NOT ON A LIFT THE PLAN REVISITS** — the second carried-over restriction. If she has already
 *     worked this exercise today she is warm, whatever the sheet says.
 *   · **AND A DISTINCT BRIDGE MUST EXIST BELOW THE WORKING LOAD** — `warmupRamp` answers that from
 *     the load itself, and an empty ramp means no offer. An empty-bar squat has no road to it.
 *
 * ⚠️ THE RAMP'S SHAPE IS UNTOUCHED: the day's first compound is offered two bridges and a later one
 * gets a single one (`warmupRamp`), because that is a fact about a cold body, not about who asked.
 * `lean` is gone with `leanWarmup` — a ramp nobody is charged for has no cost to trim.
 *
 * Pure, and derived entirely from the plan, so the resumed-after-a-kill session answers the same.
 */
export function warmupOffer(plan: Step[], atIndex: number): { at: number; ramp: WarmupSet[] } | null {
  const st = plan[atIndex];
  if (!st) return null;
  if (st.warmup) return null; // already standing on a bridge
  if (st.item && st.item.kind !== 'reps') return null; // a hold or a run has no load to ramp to
  const ex = exerciseById(st.exerciseId);
  if (!ex || ex.tier !== 'compound') return null; // the founder's ruling: compounds only
  // The start of this exercise's own run — and never a lift the plan has already worked.
  const prev = plan[atIndex - 1];
  if (prev && prev.exerciseId === st.exerciseId) return null;
  if (plan.slice(0, atIndex).some((s) => s.exerciseId === st.exerciseId)) return null;
  // A superset/circuit round is one breath (see above). A block carrying more than one position is
  // not straight; a plan with no `where` at all is the engine's own, where every block is.
  if (st.where && plan.some((s) => s.where?.block === st.where!.block && s.where.position !== st.where!.position)) return null;
  /* The day's FIRST compound gets the two-bridge ramp; a later one is already half-warm and gets
     one. Read from the plan, not from a counter, so the answer survives a swap and a resume. */
  const firstCompound = !plan.slice(0, atIndex).some((s) => exerciseById(s.exerciseId)?.tier === 'compound');
  const ramp = warmupRamp(ex, st.target?.recommendedWeight ?? null, firstCompound);
  return ramp.length > 0 ? { at: atIndex, ramp } : null;
}

/**
 * The second rule: what a bridge IS once she has asked for one. Inserted immediately BEFORE the
 * working set at `at`, so the cursor — which addresses the plan by position — lands on the first
 * bridge without being moved at all.
 *
 * ⛔ THE SHAPE IS THE 2026-08-24 CONTRACT, BYTE FOR BYTE, and it has to be: every downstream reader
 * in this app already knows how to see a bridge and step over it. Negative ascending set indices so
 * no positional read of working sets can collide, `warmup: {index, count}` for the label, the fixed
 * `WARMUP_REST_S` breath, never `lastSetOf*`, and a log that carries `isApproach` + `isWarmup`.
 *
 * ⚠️ `globalIndex` AND `lastSetOfSession` ARE RE-DERIVED, and nothing else is. The machine's cursor
 * IS a `globalIndex` (`plan.find((st) => st.globalIndex === machine.setIndex)`) and the view reads
 * the same number as an array position — two readings that agree only while the two are equal, so a
 * plan that gains steps and keeps the old numbers runs the session off the end of itself. This is
 * `deferCurrentExercise`'s renumbering exactly, and deliberately NOT `liveRevision`'s `reindex`,
 * which also rebuilds `exerciseSetIndex` per run and would flatten the bridges' negative indices
 * into working set numbers — turning two warm-ups into sets 1 and 2 of the lift.
 */
export function insertWarmup(plan: Step[], at: number, ramp: WarmupSet[]): Step[] {
  const anchor = plan[at];
  if (!anchor || ramp.length === 0) return plan;
  const bridges: Step[] = ramp.map((w, i) => ({
    exerciseId: anchor.exerciseId,
    globalIndex: 0, // re-derived below
    exerciseSetIndex: i - ramp.length,
    totalSetsInExercise: anchor.totalSetsInExercise,
    target: {
      exerciseId: anchor.exerciseId,
      setIndex: i - ramp.length,
      recommendedWeight: w.weightKg,
      recommendedReps: w.reps,
    },
    /*
     * ⛔ NO `where` ON A BRIDGE (code review 2026-09-09). It inherited the anchor's, so
     * `itemResultOf` wrote an `ItemResult` for every bridge under the SAME {block, round, position}
     * as the working set it warmed up — a duplicate key in the canonical record, counted by
     * `sessionTrained` as the working set itself (two warm-ups could finish a lift), by Well Done's
     * set count, and by every `items` reader after them. The ramp is the app's own, not a coach item.
     */
    warmup: { index: i, count: ramp.length },
    restAfterS: WARMUP_REST_S, // a breath and a plate change — never her learned rest
    lastSetOfExercise: false,
    lastSetOfSession: false,
  }));
  const flat = [...plan.slice(0, at), ...bridges, ...plan.slice(at)];
  return flat.map((st, i) => ({ ...st, globalIndex: i, lastSetOfSession: i === flat.length - 1 }));
}

/**
 * ════ HOW LONG SHE RESTS AFTER THIS STEP — one answer, asked in three places ════
 *
 * The coach's number when the coach gave one, and what she actually rests otherwise.
 *
 * ⚠️ THIS FIELD WAS STAMPED ONTO EVERY COACH STEP AND READ BY NOBODY. `buildPlanFromCoach` carried
 * `restAfterS` faithfully from `planRun`, and the machine went on asking the learned rest for every
 * step of every session — so a coach who wrote 20 seconds between the two lifts of a superset, or
 * three minutes between heavy squat sets, was overruled by a median. The founder's ruling is
 * explicit that the next workout's **prescribed rest** is the coach's decision, and a prescription
 * nothing reads is not a prescription.
 *
 * Absent means the coach did not say (`restS` is optional), and then S-17 stands: her own median on
 * that lift. Zero means the coach said no rest, which is a real instruction — it is how a superset
 * and a circuit are written — and the machine skips the rest screen entirely (§1.14).
 *
 * ⛔⛔ AND S-17 DID NOT STAND — IT RETURNED A FLAT 90 (founder 2026-08-16):
 *
 *   > *"אני רוצה שהמנוע ידע את זמני המנוחה של המתאמן עבור כל תרגיל בנפרד."*
 *
 * The absent branch read `?? REST_UNSTATED_S`. Three separate places in this codebase state the
 * opposite — the comment directly above, `Step.restAfterS`'s own doc (*"Absent = the old
 * per-exercise rest rules stand"*), and `enginePlan`'s header, which deliberately leaves `restS`
 * absent *"so her own median runs the timer"* — and the register ratifies it at S-17: *"The rest
 * timer is her own median now (phone, watch mirror, and the standalone watch plan, from one
 * registry)."* One line disagreed with all four, and it was the only one that ran.
 *
 * ⚠️ THE CONSEQUENCE WAS NOT A MISSING FEATURE, IT WAS A FALSE CLAIM. On an engine-composed week
 * NOTHING writes `restAfterS`, so every rest on every lift was 90 s — while the end-of-rest beat
 * showed her "NEXT TIME 0:52" with 1:30 struck through, and the wrist printed "your pace". The app
 * measured her, told her it had learned, and then argued with her anyway.
 *
 * ── WHY THIS DOES NOT REOPEN WHAT 2026-08-02 CLOSED ──────────────────────────────────────────────
 * That ruling — *"make it the dumb constant"* — was made when the AI coach composed programmes, and
 * its stated fear is precise: *"an athlete who rushes her rests teaches the app to prescribe short
 * rests, quietly, against a coach that never agreed to it and is never told."* The coach's number
 * still wins here, absolutely, zero included. Her median only ever fills a silence — and on the
 * engine's own week there is no coach to overrule, which is the case that ruling never covered.
 */
/**
 * ════ THE INSTANT A WRITE IS STAMPED WITH (2026-09-08 — the lock screen is a control) ════
 *
 * Every set this store logs and every rest it starts is stamped "now". A tap on the lock screen
 * happened at ITS instant — minutes ago, while JS slept — and is replayed here as if the thumb had
 * landed on the stage at that instant: `applyLockIntents` runs the clock to the tap, moves this
 * one reading of "now" to it, presses the verb, and puts "now" back. Nothing else may set it.
 */
let nowOverrideMs: number | null = null;
export function clockNow(): number {
  return nowOverrideMs ?? Date.now();
}

export function restAfterStep(step: Step): number {
  if (step.restAfterS != null) return step.restAfterS; // the coach said so; 0 is "straight on"
  // S-17 · the two kinds of rest, split by a fact the step already carries. The walk to the next
  // station is her pooled pace; the rest between sets of a lift is that lift's own number.
  return step.lastSetOfExercise ? restTransitionSeconds() : restInterSecondsFor(step.exerciseId);
}

/**
 * ════ WHICH SET OF HOW MANY — one ladder, every surface (code review 2026-09-09) ════
 *
 * A warm-up bridge counts the RAMP ("Warm-up 1 of 2"), a working set counts the lift ("Set 2 of
 * 4"). The stage and the rest card branched on `step.warmup` correctly; the lock screen and the
 * pocket alert read `exerciseSetIndex` — which is NEGATIVE on a bridge by construction
 * (`insertWarmup`) — and printed "Warm-up −1 of 4". Four readers, one function now.
 */
export function stepPosition(step: Step): { n: number; m: number; warmup?: true } {
  return step.warmup
    ? { n: step.warmup.index + 1, m: step.warmup.count, warmup: true }
    : { n: step.exerciseSetIndex + 1, m: step.totalSetsInExercise };
}

/**
 * ════ WHAT THE LOCK SCREEN SAYS WHEN THE CLOCK'S REST RUNS OUT (2026-09-08) ════
 *
 * The rest-over alert used to say "Go." — enough for a rest she started with a tap, because she
 * knew what she was going back to. A rest the CLOCK ran began while the phone was in her pocket,
 * so the alert is the first thing she reads about the next set: it wears the set's own figures —
 * the lift, set n of m, the load and how it sits on the equipment, the reps — the same sentence
 * the stage will show when she lifts the phone. Pure: a step in, two strings out.
 */
export function nextSetAlert(next: Step, units: Parameters<typeof displayWeight>[1]): { title: string; body: string } {
  const load = displayWeight(next.target?.recommendedWeight ?? null, units);
  const eq = equipmentLoad(loadSetup(next.exerciseId, load, units));
  /*
   * ⛔ THE SETUP LINE WAS GATED ON `eq.total != null` — which `equipmentLoad` sets ONLY for a
   * barbell or a plate-loaded machine (code review 2026-09-09). So the per-hand and pin branches
   * below were unreachable: a dumbbell or a cable set woke her to a load with no way to set it.
   * Every style speaks now; a fixed bar says nothing extra because the headline IS the bar.
   */
  const setup = !eq
    ? null
    : eq.style === 'dumbbell'
      ? tg('notifications.nextSetPerHand', { value: eq.value })
      : eq.style === 'selectorized' || eq.style === 'cable'
        ? tg('notifications.nextSetPin', { value: eq.value })
        : eq.style === 'fixed_barbell'
          ? null
          : tg('notifications.nextSetAside', { value: eq.value });
  const reps = next.target?.recommendedReps;
  const pos = stepPosition(next);
  return {
    title: tg(pos.warmup ? 'notifications.nextWarmupTitle' : 'notifications.nextSetTitle', { n: pos.n, m: pos.m, name: exerciseDisplayName(next.exerciseId) }),
    body: [load != null ? `${load} ${unitLabel(units)}` : null, setup, reps != null ? tg('notifications.nextSetReps', { count: reps }) : null].filter(Boolean).join(' · '),
  };
}

/**
 * ════ THE RECORD OF ONE STEP, WHATEVER SHAPE IT WAS ════
 *
 * `Session.items` is the canonical record and `sets` is the rep-only view kept in step beside it
 * (see `ItemResult`). Both are written here so nothing downstream has to know which of the two a
 * given reader is on — and so a plank is never written as zero reps at zero kilograms, which is the
 * lie the type exists to prevent.
 *
 * Null when the step did not come from a coach plan: an engine-built step has no block, round or
 * position, and inventing one would make up a structure the athlete was never given.
 */
function itemResultOf(
  step: Step,
  done: { seconds?: number; metres?: number; restBeforeS?: number | null; activityId?: string },
  log: SetLog | null,
  at: string,
): ItemResult | null {
  const item = step.item;
  if (!item || !step.where) return null;
  const restBeforeS = log ? log.restBeforeS : done.restBeforeS ?? undefined;
  const base = {
    ex: step.exerciseId,
    ...step.where,
    at,
    ...(restBeforeS != null ? { restBeforeS } : {}),
  };
  switch (item.kind) {
    case 'reps':
      if (!log) return null;
      return {
        ...base,
        kind: 'reps',
        load: log.actualWeight ?? null,
        reps: log.actualReps,
        ...(log.edited ? { edited: true } : {}),
      };
    case 'time':
      return { ...base, kind: 'time', seconds: done.seconds ?? item.seconds, askedSeconds: item.seconds };
    case 'distance':
      return {
        ...base,
        kind: 'distance',
        metres: done.metres ?? item.metres,
        askedMetres: item.metres,
        // A GPS run measured itself. The pace, the splits, the route and the heart rate live on the
        // `CardioActivity` and are NEVER copied here — one measurement, one home, and the record
        // points at it instead of holding a second version that can drift.
        ...(done.seconds != null ? { seconds: done.seconds } : {}),
        ...(done.activityId ? { activityId: done.activityId } : {}),
      };
    default:
      /*
       * ⚠️ THE LEGACY TOLERANCE — `open` left `PlannedItem` on 2026-08-12, but an ACTIVE session
       * saved before that day can still hold one mid-resume, and `OpenResult` deliberately survives
       * in `models.ts` so history can read its own record. Same seam as `coachWeek`'s default.
       */
      return { ...base, kind: 'open' };
  }
}

/**
 * ════ HER NUMBERS ON ONE ROW SHE ALREADY LOGGED ════
 *
 * The voice's echo tail ("לא, עשר") amends the row it just wrote: her figures, `edited`, and the
 * write instant moved to the correction (so the `items` mirror, paired by lift and instant, moves
 * with it). Addressed by the row's `persistedAt`, never a set index: a lift the coach split across
 * two blocks restarts `setIndex` at 0, and an index alone amended the wrong block (2026-09-09).
 * Pure; returns the same session when the row is not there.
 */
function amendRow(
  session: Session,
  amend: { persistedAt: string; weight: number | null; reps: number; at: string },
): Session {
  const was = session.sets.find((x) => x.persistedAt === amend.persistedAt);
  if (!was) return session;
  const next: SetLog = { ...was, actualWeight: amend.weight, actualReps: amend.reps, edited: true, persistedAt: amend.at };
  const sets = session.sets.map((x) => (x === was ? next : x));
  const items = session.items?.map((it) =>
    it.kind === 'reps' && it.ex === was.exerciseId && it.at === was.persistedAt
      ? { ...it, at: next.persistedAt, load: next.actualWeight ?? null, reps: next.actualReps, edited: true as const }
      : it,
  );
  return { ...session, sets, ...(items ? { items } : {}) };
}

/** Has this exact place in the session already been written? One step, one row. */
function alreadyRecorded(items: ItemResult[] | undefined, where: Step['where']): boolean {
  if (!items || !where) return false;
  return items.some((i) => i.block === where.block && i.round === where.round && i.position === where.position);
}

/**
 * Is this lift ALREADY in the session? The last line of defence before a swap is applied, on both
 * surfaces (a phone tap and a watch intent land here).
 *
 * Compared in ONE id space (founder 2026-07-12). The plan can carry the engine's bare ids
 * ('back_squat') while a swap option is a catalog id ('bb_back_squat') — a naive `===` between the
 * two spaces matches nothing, so the guard silently passes and the athlete gets the lift they just
 * finished. That is exactly the class of bug this whole pass exists to close, and a guard that can
 * be defeated by a naming convention is not a guard.
 */
function alreadyInPlan(plan: Step[], exerciseId: string): boolean {
  const target = catalogIdFromEngine(exerciseId);
  return plan.some((s) => catalogIdFromEngine(s.exerciseId) === target);
}

/**
 * Name-resolve the live plan into canonical mirror steps — shared by the live mirror effect AND
 * the terminal complete-frame publish (so the watch/Live Activity always get the same projection).
 * Attaches the equipment-native load setup (kg) so the watch can show how to load the weight (item
 * 11), and the in-class swap alternatives at the start of each exercise.
 */
export function buildMirrorSteps(plan: Step[], equipment?: readonly import('@/data/exercises').EquipmentFamily[]): MirrorStep[] {
  // THE session's lifts — every one of them, computed ONCE for the whole plan. The watch's swap
  // options are chosen against this list (founder 2026-07-12).
  //
  // This is the bug the founder caught. The phone's quick swap excluded the session's other lifts;
  // the watch's did not, because it called a different pool with no exclusion at all. So an
  // athlete who had squatted, then reached the leg press and pressed Swap ON THE WRIST, was offered
  // a Barbell Back Squat. Both surfaces now ask the SAME function, and the exclusion is not an
  // optional argument anybody can forget.
  const sessionExerciseIds = [...new Set(plan.map((st) => st.exerciseId))];
  return plan.flatMap((st) => {
    const ex = exerciseById(st.exerciseId);
    // WHEN the verb is offered is a law, not a local opinion — `isSwapMoment` owns it, and the
    // phone's stage asks the same function. This used to be a bare `=== 0` here and a different
    // hard-coded rule on the stage, which is exactly how the two surfaces came to disagree.
    /*
     * ⛔ THE WRIST OFFERS TRUE SYNONYMS ONLY (2026-08-16). This used to slice the raw ranked list to
     * two, which can hand her a DIFFERENT MOVEMENT — `swapChoices` measures that 49 of 111 lifts
     * have no third synonym, and for a cable kickback the next-best thing is a hip thrust.
     *
     * The phone may offer one of those, because the phone has a line under each row to say what it
     * is ("trains it a different way" — `SwapSheet`). A 40 mm screen has no such line: it shows a
     * name and nothing else, so an unlabelled non-synonym there IS the lie the sheet exists to
     * prevent. Where the wrist cannot explain, it does not offer, and she reaches for the phone —
     * which has the honest menu. Both surfaces still ask the SAME function, which is the law that
     * stopped them drifting in the first place.
     */
    /*
     * ⛔ ON EVERY SET, NOT ONLY THE FIRST (2026-09-07 — the board). The first-set rule existed so
     * that "a swap mid-exercise never strands the sets she has already logged", and it never did:
     * `retargetPlanForSwap` re-points only the steps from the cursor on, so the logged sets stay
     * with the lift she did them on and the REMAINDER becomes the lift she swapped to. A station
     * that becomes taken between set 2 and set 3 is the ordinary case the board exists for.
     */
    const swapOptions = ex
      ? swapChoices(ex.id, { sessionExerciseIds, equipment }, 2)
          .filter((c) => c.sameMovement)
          .map((c) => ({ id: c.exercise.id, name: c.exercise.name }))
      : [];
    // The wrist draws a weight and a rep band (WT2). A step with no rep prescription has neither,
    // and publishing zeros would put "0 kg x 0" on her wrist — so it is not mirrored as a set.
    if (!st.target) return [];
    const setup = loadSetup(st.exerciseId, st.target.recommendedWeight, 'kg');
    return {
      exerciseName: ex?.name ?? '',
      exerciseGroup: ex?.muscle ?? '',
      setIndexInExercise: st.exerciseSetIndex,
      totalSetsInExercise: st.totalSetsInExercise,
      globalIndex: st.globalIndex,
      targetWeight: st.target.recommendedWeight,
      targetReps: st.target.recommendedReps,
      // The rep BAND's ceiling — the wrist draws the same 8–10 rule the phone does (WT2).
      // The floor is `targetReps` (== repBandLo); only the ceiling needs carrying.
      repBandHi: st.target.repBandHi,
      reasonType: st.target.reasonType,
      reasonDelta: st.target.reasonDelta,
      ...(st.warmup ? { warmup: st.warmup } : {}),
      swapOptions,
      loadSetup: setup
        ? {
            style: setup.style,
            perSide: setup.perSide,
            plates: setup.plates,
            barKg: setup.barKg,
            perHand: setup.perHand,
            pin: setup.pin,
            fixedBar: setup.fixedBar,
          }
        : null,
    };
  });
}

/**
 * TO-LOAD vs LOADED for the current set (instruction-first execution): true when the athlete must
 * still set the equipment — the first set of an exercise, OR the load changed since the last
 * completed set of it (re-load). False once a set has been logged at this load (the bar/pin is set),
 * and for bodyweight (nothing to load). Pure over the logged sets so the phone view and the watch
 * mirror agree.
 */
function isToLoad(plan: Step[], setIndex: number, sets: SetLog[]): boolean {
  const cur = plan[setIndex];
  if (!cur) return false;
  // No rep prescription → nothing to set on a machine. A plank has no load to walk over and set.
  const curLoad = cur.target?.recommendedWeight;
  if (curLoad == null) return false; // bodyweight, or not a loaded step at all
  let loaded: number | null | undefined;
  for (const s of sets) if (s.exerciseId === cur.exerciseId) loaded = s.actualWeight;
  if (loaded === undefined) return true; // no set of this exercise logged yet → must load
  return loaded !== curLoad; // load changed since last loaded → re-load
}

/** Distinct lifts the athlete actually trained (logged ≥1 set) AND that the model raised — the
 *  truthful "lifts up" for the Complete summary (an early finish must not count untrained lifts). */
/**
 * ════ LIFTS THE APP RAISED **THIS SESSION** ════
 *
 * ⛔ FOUND IN THE 2026-08-04 AUDIT — the sixth surface still reading the dead engine, and the one
 * that reaches the wrist and the Lock Screen.
 *
 * It counted `target.reasonType === 'increase'`, a field `buildPlanFromCoach` never writes. So on
 * every coach-built workout the closing frame said **0 lifts raised**, on both surfaces, whatever
 * had happened.
 *
 * ⚠️ AND `reasonType` WAS THE WRONG FIELD EVEN IN THE ENGINE ERA. It is the WEEKLY decision — a load
 * Loop 2 raised days ago, before she walked in. The label has always said "this session". The only
 * thing that raises a load DURING a session is Loop 1, and Loop 1 rewrites the remaining steps'
 * `recommendedWeight` in place.
 *
 * So the honest measure is the one that was always meant: an exercise whose prescribed load ENDS the
 * session higher than it started it. That is era-independent — it reads what happened, not which
 * engine wrote the plan — and it is why this now takes no `reasonType` at all.
 */
export function progressedLiftCount(plan: Step[], sets: SetLog[]): number {
  // WORKING sets and steps only (2026-08-24): the warm-up ramp's first step is half the working
  // weight BY DESIGN, so reading it as "where the lift started this session" would count every
  // ramped lift as progressed, every workout. A lift she only warmed up on was not trained.
  const trained = new Set(sets.filter((s) => !s.isApproach).map((s) => s.exerciseId));
  const first = new Map<string, number>();
  const last = new Map<string, number>();
  for (const st of plan) {
    if (st.warmup) continue;
    const w = st.target?.recommendedWeight;
    if (w == null || !trained.has(st.exerciseId)) continue;
    if (!first.has(st.exerciseId)) first.set(st.exerciseId, w);
    last.set(st.exerciseId, w);
  }
  let n = 0;
  for (const [ex, start] of first) if ((last.get(ex) ?? start) > start) n += 1;
  return n;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [state, dispatch] = useReducer(reducer, {
    plan: [],
    session: null,
    machine: initialSessionMachine(true),
    targets: [],
  });
  // Latest app store for the watch-record reconciler (subscribed once on mount —
  // a ref keeps its deps from closing over a stale modeState/program).
  const appRef = useRef(app);
  appRef.current = app;

  /**
   * Credit a salvaged workout (founder 2026-07-11). The app died mid-workout; if the athlete had
   * nonetheless TRAINED it (>= half the prescribed sets — sessionRecovery stamps the verdict), it
   * counts exactly like a workout finished by hand: the session count advances (free trial +
   * calibration) and the workout is done for the week. A crash is not the athlete's fault, and a
   * PARTIAL salvage still credits nothing but its real work. Best-effort: never blocks a start.
   *
   * (The BOOT path credits the same salvage itself, before the app store publishes its state —
   * see appStore. This is the in-session path: an orphan salvaged as the athlete starts a fresh
   * workout, or when a stale resume is discarded.)
   */
  const creditSalvage = useCallback(async (salvaged: SalvageResult) => {
    if (!salvaged.trained) return;
    try {
      await appRef.current.recordSessionCompleted();
      if (salvaged.programDayId) await appRef.current.markWorkoutCompleted(salvaged.programDayId);
      void track('session_recovered_credited', { programDayId: salvaged.programDayId });
    } catch {
      /* the work is already in History; the next boot's heal reconciles the week */
    }
  }, []);
  // Reconcile watch-local session records: the watch executed a workout AS THE
  // LOCAL AUTHORITY (phone absent) and durably queued the result. Delivery is
  // at-least-once (OS userInfo transfer), apply is idempotent, and the ack is
  // durable — so the workout lands in history/mode/model exactly once no matter
  // how often it is replayed. Subscribed for the app's whole lifetime: records
  // reconcile whenever the phone comes back, not only around live sessions.
  useEffect(() => {
    return watchTransport.onSessionRecord((raw) => {
      // ONE durable channel, TWO record types, told apart by the `type` inside the payload — the
      // wrist's runs ride the same transferUserInfo, the same at-least-once delivery and the same
      // ack as its workouts (founder 2026-07-28), so nothing new had to be trusted.
      if (isCardioRecordPayload(raw)) {
        void applyWatchCardioRecord(raw, {
          loadCardio: () => db.loadCardio(),
          /* The wrist's run is training too, so the day-six catch re-arms off it — the same
             re-derive the phone's own run does (`domain/gapCatch`). Fire-and-forget after the
             write, never in front of it. */
          appendCardioActivity: async (a) => {
            await db.appendCardioActivity(a);
            void armGapCatch();
          },
          track: (type, data) => void track(type, data),
          ack: (id) => watchTransport.ackRecord(id),
        });
        return;
      }
      void applyWatchSessionRecord(raw, {
        loadHistory: () => db.loadHistory(),
        appendCompletedSession: async (s) => {
          await db.appendCompletedSession(s);
          /*
           * THE SAVE RECEIPT (2026-08-23): a standalone wrist workout just became part of her
           * record — often with the phone in a bag. Say so, once, quietly. Foreground is exempt:
           * the app is open and the record lands where she can see it. The note rides the same
           * fact-not-reminder decree as the kilometre.
           */
          if (AppState.currentState !== 'active') void notifier.watchWorkoutSaved(s.programDayName ?? '');
        },
        recordSessionCompleted: () => appRef.current.recordSessionCompleted(),
        markWorkoutCompleted: (id) => appRef.current.markWorkoutCompleted(id),
        programDay: (id) => appRef.current.program?.days.find((d) => d.id === id),
        recordToModel: (args) => appRef.current.model.recordSession(args),
        enqueuePendingSync: (args) => db.enqueuePendingSync(args),
        track: (type, data) => void track(type, data),
        ack: (id) => watchTransport.ackRecord(id),
      });
    });
  }, []);
  // Keep the latest session for synchronous persistence inside actions.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = state.session;
  // …and the latest plan, for the clock (which runs from timers and app-state callbacks).
  const planRef = useRef<Step[]>(state.plan);
  planRef.current = state.plan;
  // Latest machine, read by deferred callbacks (e.g. the 400ms Complete-Set
  // success timer) so they see a PAUSE that landed AFTER they were scheduled.
  const machineRef = useRef<SessionMachine>(state.machine);
  machineRef.current = state.machine;
  /** A set write is in flight (see completeSet) — the phone and the wrist can both ask at once. */
  const completingRef = useRef(false);
  // Temporal telemetry: when the current rest/pause began (ms epoch).
  const restStartedAtRef = useRef<number | null>(null);
  const pauseStartedAtRef = useRef<number | null>(null);
  /**
   * ════ WHEN THIS SET WENT ON SCREEN (founder, 2026-08-30 → the nudge) ════
   *
   * The one instant the phone genuinely knows about the front half of a set. The app cannot see the
   * last rep; it can see when it started asking and when she answered, and the gap between them is
   * the only measurable this whole family of problems has (`domain/setDwell` owns what it means).
   *
   * It buys two things at once, which is why it is a ref on the session rather than a screen's
   * state: the DWELL stamped on `set_completed` — the compliance signal the product had no way to
   * see, and the reason the founder's finding took a live gym session to surface at all — and the
   * moment the nudge becomes legal.
   *
   * Stamped when the cursor arrives at a step, NOT on every render: re-stamping would reset the
   * clock each time the screen redrew and the nudge would never fire. Keyed on the step so the
   * arrival is detected once (see the effect below).
   */
  const setPresentedAtRef = useRef<{ key: string; atMs: number } | null>(null);
  /** True once the nudge has been raised for THIS set. A coach says it once (`domain/setDwell`). */
  const nudgedRef = useRef(false);
  /**
   * The IN-APP half of the nudge — the quiet line on the stage, for the athlete who IS looking.
   *
   * ⚠️ TWO HALVES, ONE THOUGHT, AND THEY MUST NOT BOTH SPEAK. The OS notification is the pocket's
   * copy and is suppressed while the app is foregrounded (`notifications.ts`); this is what the
   * foreground gets instead. They are armed and cancelled together by one effect, so there is no
   * state in which one of them is live and the other is not.
   */
  const [setRunningLong, setSetRunningLong] = useState(false);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearNudgeTimer = useCallback(() => {
    if (nudgeTimerRef.current != null) {
      clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
  }, []);
  /**
   * Engine v5 · Stage 0 (law L3): the rest that has JUST ENDED and is waiting to be stamped onto
   * the next set as `SetLog.restBeforeS`. Written at `endRest` — the single rest-exit path, which
   * the timer, SKIP, and the watch all pass through — and consumed by `completeSet`, the single
   * set-log path, which the phone and the watch both pass through. So the fact is captured once,
   * for both surfaces, with no per-surface wiring.
   *
   * Null means UNKNOWN, never zero: no rest preceded this set (the first of a session), or the
   * rest was lost to an app kill.
   */
  const pendingRestSRef = useRef<number | null>(null);
  /**
   * ════ THE SESSION CLOCK (2026-09-07; ends rests only since 2026-09-09) ════
   *
   * `applyClockRef` — the one function that runs the clock forward, reached from the app coming to
   * the foreground and from every wrist and lock-screen intent (the wrist keeps its own time; the
   * phone must be caught up before it judges what the wrist says). It serves out a rest that ran
   * out while the app slept; it never writes a set (`domain/sessionClock`).
   */
  const applyClockRef = useRef<(nowMs: number) => Promise<void>>(async () => {});
  /**
   * Engine v5 · Stage 2 (Loop 1): corrections applied to the CURRENT exercise this session, capped
   * at 2 (S-13). Reset when a new exercise begins. Keyed by exerciseId so a swap/rotation restarts
   * the count cleanly.
   */
  /**
   * The athlete's completed-session history, loaded ONCE when a session starts — so a live Loop 1
   * correction can snap to her learned real grid (`observedLoads`), landing on a weight that physically
   * exists at her gym (a 2 kg dumbbell jump, a 5 kg stack) rather than the equipment default increment.
   * Combined with THIS session's own logged sets at correction time. Empty until loaded (→ default grid).
   */
  const historyRef = useRef<Session[]>([]);
  // Seconds added to the CURRENT rest via "+15 sec" (phone or watch). Reset when a new
  // rest begins / ends. Bumping `restNonce` re-runs the mirror effect so the longer
  // rest is republished to the watch + Live Activity.
  const restExtraSecondsRef = useRef(0);
  const [restNonce, setRestNonce] = useState(0);
  /** The voice's loading dialogue is open (spec §3.2): the lock screen shows Ready beside Done. */
  const [awaitingReady, setAwaitingReadyState] = useState(false);
  /** Bumped by `markSetStarted` so the arming effect re-arms from the new stamp (its key is unchanged). */
  const [startedNonce, setStartedNonce] = useState(0);
  // The set the watch last logged, published to the phone's stage so it plays the same "Set
  // logged" beat a phone tap would (see WatchLoggedSet). Seq-stamped: two identical sets are two
  // distinct beats.
  const [watchLoggedSet, setWatchLoggedSet] = useState<WatchLoggedSet | null>(null);
  const watchLogSeqRef = useRef(0);
  // The closing result of the just-finished session. Set by finalize() from a SINGLE place so the
  // phone navigates to Well Done whether the completion was triggered on the phone OR proposed from
  // the watch — a watch-driven finish previously left SessionFlow on an empty (black) stage. The
  // SessionFlow screen consumes this and clears it.
  const [endResult, setEndResult] = useState<CompleteResult | null>(null);
  // The signature moment — see `LiveCorrection`. Belongs to one rest, not the session.
  const [correction, setCorrection] = useState<LiveCorrection | null>(null);
  // One-shot remaining seconds of a rest resumed after an app kill (S3): the Rest UI anchors
  // its countdown on this instead of the full base length. Cleared at the next transition.
  const [restResumeRemainingS, setRestResumeRemainingS] = useState<number | null>(null);
  // Live Activity start/end is one-shot per session; gates start-vs-update + telemetry.
  const laStartedRef = useRef(false);
  // Watch action handlers, refreshed each render so a (native) watch intent runs the
  // EXACT same action an in-app tap would. The stub transport delivers none in v1.
  const watchActionsRef = useRef<Partial<Record<SessionEvent['type'], () => void>>>({});
  // Exercise Busy is a session-store action (not a machine event); kept in its own ref.
  const watchBusyRef = useRef<() => void>(() => {});
  /**
   * The latest view, for wrist handlers that first catch the clock up (`applyClock`) and must then
   * act on the state AFTER the catch-up — the `view` a handler closed over is the render before it.
   */
  const viewRef = useRef<SessionView | null>(null);
  // Set completion from the watch, carrying reported actual reps + weight (each
  // omitted = target; weight null = bodyweight).
  const watchCompleteRef = useRef<(actualReps?: number, actualWeight?: number | null) => void>(() => {});
  // Swap (in-session) from the watch — routed to swapCurrent/Next by the live phase.
  const watchSwapRef = useRef<(exerciseId?: string) => void>(() => {});
  // Start / Choose from the watch Start screen — provided by Home WHILE it is focused
  // (so a watch Begin runs the exact same path the phone's Begin does), else no-op.
  const watchStartRef = useRef<(workoutId?: string) => void>(() => {});
  const watchSelectRef = useRef<(workoutId?: string) => void>(() => {});
  // "+15 sec" from a watch Rest screen — extends the running rest (the phone is the
  // authority; the longer rest re-publishes to every surface).
  const watchAddRestRef = useRef<(seconds: number) => void>(() => {});
  const watchPainRef = useRef<(area: string, severity: string) => void>(() => {});
  /** The live handover — see the store's `adoptLocalSession`. Bound below, like every other wrist
   *  action, so the bridge is built once and never closes over a stale implementation. */
  const watchAdoptRef = useRef<(local: WatchLocalSession) => Promise<'adopted' | 'duplicate' | 'refused'>>(
    async () => 'refused',
  );
  // The phone-authority watch bridge. Constructed once; reads the action ref so it
  // never closes over stale actions. Transport is a no-op until the watchOS target
  // exists — all authority/validation/telemetry runs regardless.
  const watchRef = useRef<WatchSession | null>(null);
  if (!watchRef.current) {
    watchRef.current = new WatchSession({
      transport: watchTransport,
      now: Date.now,
      track: (type, data) => void track(type, data),
      completeSet: (actualReps, actualWeight) => watchCompleteRef.current(actualReps, actualWeight),
      dispatch: (event) => watchActionsRef.current[event.type]?.(),
      markEquipmentOccupied: () => watchBusyRef.current(),
      swapExercise: (exerciseId) => watchSwapRef.current(exerciseId),
      startWorkout: (workoutId) => watchStartRef.current(workoutId),
      selectWorkout: (workoutId) => watchSelectRef.current(workoutId),
      addRest: (seconds) => watchAddRestRef.current(seconds),
      // WT14 · What's off. The wrist flags a body area; the phone owns what a pain flag DOES.
      // This key was MISSING — the bridge's `this.d.reportPain?.(area)` evaluated to undefined and
      // the athlete's report died in silence, with every other layer of the chain correct.
      reportPain: (area, severity) => watchPainRef.current(area, severity),
      // The wrist offering a workout it is already running — the live handover (WT: "start on the
      // watch, open the phone, see the workout"). The store owns the decision; see below.
      adoptLocalSession: (local) => watchAdoptRef.current(local),
    });
  }

  /**
   * ════ THE SET WENT ON SCREEN — stamp it once, and arm the pocket (founder 2026-08-30) ════
   *
   * ⚠️ THE STEP, NOT THE INDEX. A warm-up press inserts bridges ahead of the cursor, so the number
   * `machine.setIndex` holds can stay put while the step underneath it becomes a different thing
   * entirely — and an identity read from the number alone would carry the working set's stopwatch
   * over onto the bridge that replaced it. The key is what the step IS.
   *
   * ⛔ AND THE NUDGE IS ARMED FROM HERE, not from the screen, for the reason the whole feature
   * exists: the screen's timers stop when the phone is pocketed. `setNudge.arm` schedules with the
   * OS, ahead of time, so the ask survives a locked phone — and every path that leaves the set
   * (logged, paused, ended, unmounted) disarms it below. A pending question about a set she has
   * already finished is the nagging this must never become.
   */
  useEffect(() => {
    const { plan, machine } = state;
    const step = machine.phase === 'SET_PRESENTED' ? plan[machine.setIndex] : null;
    if (!step) {
      // Off the set: the question is spent, whatever the reason (logged, resting, paused, done).
      setPresentedAtRef.current = null;
      nudgedRef.current = false;
      setSetRunningLong(false);
      clearNudgeTimer();
      void setNudge.disarm();
      // A rest keeps the OS alerts the set armed (the rest screen re-arms them on its true end);
      // anything else — paused, ended, saved — takes them down with the set.
      if (!machine.phase.startsWith('REST_')) void restHaptics.disarm();
      return;
    }
    /*
     * The clock may already have stamped this step (it catches up through rests by wall-clock and
     * sets `presentedAtMs` to the instant the rest ENDED, not the instant the app noticed). A stamp
     * for the same step is kept; a different step is stamped now. Either way the timer below is
     * armed exactly once per step — `armedForRef` says which step it is armed for.
     */
    const key = stepKey(step);
    if (setPresentedAtRef.current?.key !== key) {
      setPresentedAtRef.current = { key, atMs: Date.now() };
      nudgedRef.current = false;
      setSetRunningLong(false);
    }
    if (armedForRef.current === key) return; // same set, a re-render — the timer is already running
    armedForRef.current = key;
    nudgedRef.current = false;
    setSetRunningLong(false);
    /*
     * ════ THE ASK, NEVER THE ANSWER (founder 2026-08-30; reaffirmed 2026-09-09) ════
     *
     * When the set's expected duration elapses with no word from her, the app ASKS — the quiet line
     * on the stage for the athlete who is looking, the OS note for the one whose phone is in a
     * pocket — and writes nothing. Between 2026-09-07 and 2026-09-09 this instant wrote the set as
     * prescribed instead ("the session runs itself"); the founder cancelled that outright after a
     * workout on build 71: *"הסט האוטומטי עדיין קיים אפילו שאמרתי לך לבטל אותו לגמרי."* A step the
     * nudge has no business with (a hold, a run, a warm-up bridge) is not timed at all.
     */
    if (!nudgeApplies(step)) {
      clearNudgeTimer();
      void setNudge.disarm();
      return;
    }
    /* ⛔ THE PRESCRIPTION, NOT HER HISTORY (founder, 2026-08-31): *"לא צריך לחשב כמה זמן לוקח לכל
       בן אדם לעשות סט… זה צריך להיות פשוט."* The band's FLOOR is the rep count used — the fewest
       reps that still count as this set done — see `domain/setDwell`. */
    const afterS = nudgeAfterS(step.exerciseId, step.target?.repBandLo ?? step.target?.recommendedReps ?? 8);
    void setNudge.arm(afterS);
    // No rest-over alert belongs to a set: the one armed for the rest before it has already fired,
    // and the rest after it is armed by the rest screen the moment she logs the set.
    void restHaptics.disarm();
    /*
     * …and the same instant, in-app.
     *
     * ⛔ THE TIMER IS A REF, NOT AN EFFECT CLEANUP, and that is the whole correctness of it. This
     * effect runs on every `state` change — every logged set anywhere, every mirror republish —
     * and a cleanup-based timer would be torn down by each of those and only re-armed by the ones
     * that reach the bottom. Since a re-render of the SAME set returns early above, the timer
     * would have been cancelled and never rebuilt: the nudge would fire only for a set that
     * happened to see no state change at all, which in a live session is none of them.
     *
     * Cleared and rebuilt exactly when the SET changes, which is the only event it is about. It
     * fires at the DUE instant measured from the stamp — which may be earlier than "now" when the
     * clock stamped the step at the end of a rest that ran out while the app slept.
     */
    clearNudgeTimer();
    const dueInMs = Math.max(0, setPresentedAtRef.current.atMs + afterS * 1000 - Date.now());
    nudgeTimerRef.current = setTimeout(() => {
      nudgeTimerRef.current = null;
      nudgedRef.current = true;
      setSetRunningLong(true);
    }, dueInMs);
    // startedNonce: "מוכן" moved the stamp of the SAME set — re-arm from the new instant.
  }, [state, app, clearNudgeTimer, startedNonce]);

  /** Which step the set timer is armed for — the guard that lets a clock-stamped step still arm. */
  const armedForRef = useRef<string | null>(null);
  useEffect(() => {
    // Off the set (any phase but SET_PRESENTED) the timer is disarmed above; forget the key too, so
    // returning to the SAME step (a pause and resume) arms it again.
    if (state.machine.phase !== 'SET_PRESENTED') armedForRef.current = null;
  }, [state.machine.phase]);

  /**
   * ⛔ THE CLOCK CATCHES UP WHEN THE APP WAKES. A JS timer does not run in a pocket; the wall clock
   * does. Every return to the foreground runs the clock forward through whatever fell due while the
   * phone slept — the same discipline `reconcileResume` keeps across an app kill, applied across a
   * lock. The wrist intents do the same before they are judged (see the watch refs below).
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void applyClockRef.current(Date.now());
    });
    return () => sub.remove();
  }, []);

  /**
   * ════ RUN THE CLOCK FORWARD TO `nowMs` ════
   *
   * `domain/sessionClock` decides WHAT fell due; this writes it — and since 2026-09-09 the only
   * thing that can fall due is a REST. A rest that ran out while the phone slept presents its next
   * set at the instant it ended (not at the wake) and banks its length for the set that follows,
   * the same fact `endRest` banks when the ring reaches zero in the foreground. No set is written
   * here, ever (founder, 2026-09-09).
   *
   * Reached from the app waking (`AppState`), from every wrist intent and every lock-screen tap
   * (each keeps its own time). Latched on the same in-flight guard `completeSet` uses, so a tap
   * and a tick can never write over each other; a tick that finds the latch closed is simply
   * retried by the next wake — the wall clock does not forget.
   */
  const applyClock = useCallback(
    async (nowMs: number): Promise<void> => {
      const session = sessionRef.current;
      const plan = planRef.current;
      const machine = machineRef.current;
      if (!session || plan.length === 0) return;
      if (completingRef.current) return;
      const res = runClock({
        plan,
        machine,
        restStartedAtMs: restStartedAtRef.current,
        restExtraS: restExtraSecondsRef.current,
        restAfterStep,
        nowMs,
      });
      if (res.ticks.length === 0) return;
      completingRef.current = true;
      try {
        for (const tick of res.ticks) pendingRestSRef.current = isRestSample(tick.restS) ? tick.restS : null;
        restStartedAtRef.current = res.restStartedAtMs;
        restExtraSecondsRef.current = res.restExtraS;
        if (res.machine.phase === 'SET_PRESENTED' && res.presentedAtMs != null) {
          const st = plan[res.machine.setIndex];
          // Stamp the step the clock landed on at the instant its rest ENDED, so the arming effect
          // keeps the stamp and the ask is measured from the truth, not from the wake.
          if (st) setPresentedAtRef.current = { key: stepKey(st), atMs: res.presentedAtMs };
        }
        setRestResumeRemainingS(null);
        setCorrection(null);
        machineRef.current = res.machine;
        dispatch({ type: 'CLOCK', session, machine: res.machine });
      } finally {
        completingRef.current = false;
      }
    },
    [dispatch],
  );
  applyClockRef.current = applyClock;

  /**
   * ════ THE LOCK SCREEN'S TAPS, REPLAYED AT THEIR INSTANTS (founder, 2026-09-08) ════
   *
   *   > *"להזין סט כשהמסך סגור וגם מנוחה של קיצור או הוספת 15 שניות."*
   *
   * A tap on the Live Activity is queued natively with the instant it happened
   * (`HushLockIntents.swift` → the App Group). It reaches this store three ways — the native
   * whistle while JS is alive, the app waking, the session starting — and every road ends here,
   * where each tap is replayed AS IF the thumb had landed on the stage at that instant:
   *
   *   1. the clock runs forward to the tap (`applyClock`), so the tap is judged against the
   *      session as it stood then — a rest that had run out by the tap has already presented
   *      its next set, exactly as the stage would have;
   *   2. "now" is moved to the tap's instant (`clockNow`) and the verb is pressed through the
   *      view's own method — the same code a thumb on the stage runs, no second path;
   *   3. "now" is put back, and after the last tap the clock runs to the present.
   *
   * Idempotent: an id seen once is never applied twice (the whistle and a wake can both drain),
   * and a tap from before this session started, or from the future, is dropped.
   */
  const seenLockIdsRef = useRef<Set<string>>(new Set());
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));
  const applyLockIntents = useCallback(
    async (intents: LockIntent[]) => {
      const session = sessionRef.current;
      if (!session) return;
      const startedMs = Date.parse(session.startedAt);
      const fresh = intents
        .filter((i) => !seenLockIdsRef.current.has(i.id) && i.atMs >= startedMs && i.atMs <= Date.now() + 5_000)
        .sort((a, b) => a.atMs - b.atMs);
      for (const i of fresh) {
        seenLockIdsRef.current.add(i.id);
        await applyClockRef.current(i.atMs);
        await settle();
        const v = viewRef.current;
        if (!v || !v.active) continue;
        nowOverrideMs = i.atMs;
        try {
          if (i.type === 'complete_set') {
            // On the stage → logged, as written or with her figures (the steppers moved), exactly
            // as a typed set on the stage is. During a rest → nothing: the set is written and the
            // tap was a second one.
            const hers = i.reps != null && i.weight !== undefined ? { weight: i.weight, reps: i.reps } : undefined;
            if (v.displayPhase === 'SET_PRESENTED') await v.completeSet(hers);
          } else if (i.type === 'add_rest') {
            v.extendRest(15);
          } else if (i.type === 'end_rest') {
            if (v.displayPhase === 'REST_INTER' || v.displayPhase === 'REST_TRANSITION') {
              // The set that follows is presented AT THE TAP, not at the wake: the arming effect
              // keeps a stamp that already exists for a step, so it is written here first — the same
              // thing `applyClock` does when a rest runs out while the phone sleeps.
              const next = planRef.current[machineRef.current.setIndex + 1];
              if (next) setPresentedAtRef.current = { key: stepKey(next), atMs: i.atMs };
              v.endRest();
            }
          } else if (i.type === 'set_ready') {
            // "מוכן" from the lock screen: the set on stage started at the tap (spec §3.2).
            if (v.displayPhase === 'SET_PRESENTED') v.markSetStarted();
          }
        } finally {
          nowOverrideMs = null;
        }
        await settle();
        void track('lock_intent', { sessionId: session.id, type: i.type, lateS: Math.max(0, Math.round((Date.now() - i.atMs) / 1000)) });
      }
      await applyClockRef.current(Date.now());
    },
    [],
  );
  const applyLockIntentsRef = useRef(applyLockIntents);
  applyLockIntentsRef.current = applyLockIntents;
  /** Take the queue and replay it — every road into the replay goes through here. */
  const drainLockQueue = useCallback(async () => {
    const list = await drainLockIntents();
    // Always — an empty queue still ends in `applyClock(now)`, so a wake that reaches this listener
    // first runs the clock forward exactly as the clock's own listener would.
    await applyLockIntentsRef.current(list);
  }, []);
  useEffect(() => {
    // The whistle (JS alive), the wake (JS slept), and the start (a queue from before the app ran).
    const off = addLockIntentListener(() => void drainLockQueue());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void drainLockQueue();
    });
    return () => {
      off();
      sub.remove();
    };
  }, [drainLockQueue]);
  useEffect(() => {
    if (state.session?.id) void drainLockQueue();
  }, [state.session?.id, drainLockQueue]);

  /** The workout screen going away must not leave a question pending in the OS queue. */
  useEffect(
    () => () => {
      clearNudgeTimer();
      void setNudge.disarm();
    },
    [clearNudgeTimer],
  );

  // Mirror session state to BOTH the Live Activity / Dynamic Island / Lock Screen
  // AND the Apple Watch — from ONE canonical projection (§8.5; no duplicate state).
  // READ-ONLY, timer is the hero, no completion controls from outside the app.
  useEffect(() => {
    const { plan, machine } = state;
    const loggedSets = state.session?.sets ?? [];
    /*
     * ⚠️ THE MIRROR COUNTS IN SET-SPACE, THE MACHINE COUNTS IN STEP-SPACE.
     *
     * `buildMirrorSteps` drops every step that is not a set — a plank has no weight and no rep band
     * to draw on a wrist, and publishing zeros would put "0 kg × 0" on it. But `machine.setIndex`
     * indexes the PLAN, and the mirror reads it against its own shorter list: one plank early in a
     * session and every frame after it named the wrong lift, on the Lock Screen and the wrist alike.
     *
     * So the cursor is translated into the mirror's space — the number of SETS she has reached.
     * While she is on an item, that lands on the next set, which is the honest approximation
     * available to a surface that cannot draw the item at all.
     *
     * ⏸️ Drawing the item ITSELF on those two surfaces is watch work, and the watch is deferred by
     * the founder until his QA batch. This keeps them truthful in the meantime.
     */
    const mirrorSteps = buildMirrorSteps(plan, appRef.current?.profile?.equipment);
    const setsBeforeCursor = plan.slice(0, machine.setIndex).filter((s) => s.target).length;
    const mirror = projectSessionMirror({
      steps: mirrorSteps,
      total: plan.length,
      machine: setsBeforeCursor === machine.setIndex ? machine : { ...machine, setIndex: setsBeforeCursor },
      /*
       * ⚠️ ONE REST, ONE SOURCE — the step the athlete is on (`restAfterStep`).
       *
       * These three read the LEARNED median, while the phone's own clock reads what the coach
       * wrote. Two answers to one question, on two surfaces, in the same second: a coach's three
       * minutes on the phone and her ninety-second median on the wrist, with the watch's GO haptic
       * firing against a rest the phone had not finished.
       *
       * `restIsLearned` drives the wrist's "your pace" line (WT5), so it must say exactly when the
       * number on the clock IS hers. It was pinned to `false` while the timer ran the constant —
       * correct then, a lie now that `restAfterStep` consults her median. It is asked the same way
       * the timer is: the coach's number is not her pace however good it is, and a lift she has not
       * yet rested through three times is still on the bootstrap.
       */
      restInterS: plan[machine.setIndex] ? restAfterStep(plan[machine.setIndex]) : REST_UNSTATED_S,
      // …on a crossing too (2026-09-09): the walk between stations is her pooled median once she
      // has one (`learnedTransitionRestS`), and it was pinned `false` here for every transition, so
      // the wrist never said "your pace" on the one rest that is most obviously her own.
      restIsLearned:
        plan[machine.setIndex] != null &&
        plan[machine.setIndex].restAfterS == null &&
        (plan[machine.setIndex].lastSetOfExercise
          ? restTransitionIsLearned()
          : restIsLearnedFor(plan[machine.setIndex].exerciseId)),
      restTransitionS: plan[machine.setIndex] ? restAfterStep(plan[machine.setIndex]) : REST_UNSTATED_S,
      restExtraS: restExtraSecondsRef.current,
      restStartedAtMs: restStartedAtRef.current,
      nowMs: Date.now(),
      workoutName: state.session?.programDayName ?? '',
      sessionStartedAtMs: state.session ? Date.parse(state.session.startedAt) : null,
      completedSets: loggedSets.length,
      // The actuals, in step order — the wrist's read-back prints the best set of each lift, and
      // it must print what was LIFTED, not what was asked for (they differ the moment an athlete
      // edits a set).
      loggedSets: loggedSets.map((s) => ({ weight: s.actualWeight ?? null, reps: s.actualReps })),
      /*
       * ⛔ WHAT SHE DID LAST TIME, ONTO THE WIRE (2026-08-04). The phone's set stage has drawn this
       * for a week and the wrist drew four dots that only counted. Read through the SAME call the
       * phone's view uses — a second lookup here would eventually disagree with it about what "last
       * time" means, and the two surfaces are in the same workout.
       */
      lastTime: lastTimeOn(
        plan.find((st) => st.globalIndex === machine.setIndex)?.exerciseId ?? null,
        historyRef.current,
        { excludeSessionId: sessionRef.current?.id },
      ),
      progressedLifts: progressedLiftCount(plan, loggedSets),
      toLoad: isToLoad(plan, machine.setIndex, loggedSets),
      // THE SIGNATURE MOMENT — through the ONE projection, so the wrist and the phone cannot
      // disagree about it (§8.5: no duplicate state).
      correction: correction ? { from: correction.from, to: correction.to, direction: correction.direction, reps: correction.reps } : null,
    });

    // One projection → both surfaces. The watch receives the full mirror (incl. the
    // terminal "complete" frame so it can show Workout Complete, then tear down).
    watchRef.current?.publish(mirror);

    // Mid-workout resume snapshot (S3): every live state change persists the machine + plan
    // + rest anchors, so an app kill resumes exactly where the athlete was (the watch's
    // LocalWorkoutEngine standard). Cleared explicitly by finalize/abandon — never here (the
    // empty pre-hydration state at boot must not destroy a snapshot Home is about to offer).
    if (plan.length > 0 && state.session && machine.phase !== 'SESSION_SAVED' && machine.phase !== 'WELL_DONE') {
      void db
        .saveSessionResume({
          schema: 1,
          plan,
          machine,
          restStartedAtMs: restStartedAtRef.current,
          restExtraS: restExtraSecondsRef.current,
          pausedAtMs: pauseStartedAtRef.current,
          savedAt: new Date().toISOString(),
          // A rest already banked but not yet stamped onto a set: an app kill between "Ready" and
          // "Complete Set" would otherwise lose it and leave that set uncomparable (L3).
          ...(pendingRestSRef.current != null ? { pendingRestS: pendingRestSRef.current } : {}),
          // When the set on screen was presented — so a resume asks about it from the truth, not the wake.
          presentedAtMs:
            plan[machine.setIndex] && setPresentedAtRef.current?.key === stepKey(plan[machine.setIndex])
              ? setPresentedAtRef.current.atMs
              : null,
        })
        .catch(() => {});
    }

    // The Live Activity renders its subset; it ends on no-session / complete.
    if (!mirror || mirror.phase === 'complete') {
      if (laStartedRef.current) {
        laStartedRef.current = false;
        void liveActivity.end();
        void audioSession.stopKeepAlive();
        void track(LIVE_ACTIVITY_EVENTS.ended);
      }
      return;
    }
    /*
     * ════ WHAT THE LOCK SCREEN NEEDS TO ANSWER A TAP ON ITS OWN (2026-09-08) ════
     * The set on stage, the rest it earns, the set after it, and the words — baked here in her
     * language, so a thumb on the Live Activity gets an answer in the same second, before this
     * store has woken to replay the tap (`applyLockIntents`).
     */
    const onStep = plan[machine.setIndex];
    const after = plan[machine.setIndex + 1];
    const units = appRef.current?.profile?.units ?? 'kg';
    const lock: LockExtras = {
      restAfterS: onStep ? restAfterStep(onStep) : 0,
      lastSetOfSession: !!onStep?.lastSetOfSession,
      // `stepPosition`, like the stage: a bridge's `exerciseSetIndex` is negative, and this line
      // read "Warm-up −1 of 4" on the lock screen until the ladder was shared (2026-09-09).
      nextSetLabel: after ? tg(after.warmup ? 'workout.warmupOfM' : 'workout.setOfM', stepPosition(after)) : '',
      nextSetIndex: after ? stepPosition(after).n : 1,
      nextSetCount: after ? stepPosition(after).m : 1,
      ...(after ? (({ title, body }) => ({ alertTitle: title, alertBody: body }))(nextSetAlert(after, units)) : { alertTitle: '', alertBody: '' }),
      words: {
        rest: tg('notifications.lockWordRest'),
        next: tg('notifications.lockWordNext'),
        paused: tg('notifications.lockWordPaused'),
        logged: tg('notifications.lockWordLogged'),
        done: tg('notifications.lockActDone'),
        addRest: tg('notifications.lockActAddRest'),
        start: tg('notifications.lockActStart'),
        reps: tg('notifications.lockWordReps'),
        ready: tg('notifications.lockActReady'),
      },
      // The voice's loading dialogue is open: the card offers Ready beside Done (spec §4).
      awaitingReady,
      // Her figures, typed on the lock screen: the steppers turn by this lift's own detent.
      unitLabel: unitLabel(units),
      weightStep: weightStepFor(units, onStep ? exerciseById(onStep.exerciseId)?.equipment : undefined),
    };
    if (!laStartedRef.current) {
      laStartedRef.current = true;
      /*
       * ════ THE PROCESS STAYS AWAKE FOR THE WHOLE WORKOUT (founder, 2026-09-09) ════
       *
       *   > *"כשמעלים ומורידים מספרים ב-live activity זה משנה אבל בדילאיי."*
       *
       * A tap on the Live Activity is an App Intent iOS performs IN THIS APP'S PROCESS. With the
       * screen locked the process is suspended within seconds, so every tap on the card first had
       * to wake it — the delay he felt on the steppers. `modules/hush-voice-audio`'s keep-alive (a
       * looping second of silence under `.playback` + `.mixWithOthers`, the `audio` background mode)
       * keeps the process — and the JS clock, and the lock-intent listener — alive from the first
       * set to the receipt. Her music is untouched; the loop is inaudible. Stopped with the activity.
       */
      void audioSession.startKeepAlive();
      void track(LIVE_ACTIVITY_EVENTS.started);
      void liveActivity.start(mirror, lock).catch(() => void track(LIVE_ACTIVITY_EVENTS.failed, { op: 'start' }));
    } else {
      void liveActivity.update(mirror, lock).catch(() => void track(LIVE_ACTIVITY_EVENTS.failed, { op: 'update' }));
    }
    // restNonce: re-publish when "+15 sec" extended the current rest (ref change alone
    // would not re-run this effect). awaitingReady: the lock card gains or loses its Ready button.
  }, [state, restNonce, awaitingReady]);

  const view = useMemo<SessionView>(() => {
    const { plan, machine } = state;
    const idx = machine.setIndex;
    const current = plan[idx] ?? null;
    const next = plan[idx + 1] ?? null;
    const paused = machine.phase === 'PAUSED';
    // Under Pause, render the exact frozen prior phase (spec §7.2).
    const effPhase = paused ? machine.resumePhase ?? 'SET_PRESENTED' : machine.phase;
    const resting = effPhase === 'REST_INTER' || effPhase.startsWith('REST_TRANSITION');
    const displayPhase: DisplayPhase = resting
      ? effPhase === 'REST_INTER'
        ? 'REST_INTER'
        : 'REST_TRANSITION'
      : 'SET_PRESENTED';
    // A rest resumed after an app kill anchors on its true remaining time, not the base length.
    //
    // The rest belongs to the step that just ENDED — which is `current`, since the cursor only moves
    // on REST_ELAPSED — so it is the same question `completeSet` asked when it decided there would
    // be a rest at all (`restAfterStep`). Asking it differently here is how the machine and the
    // countdown come to disagree about a coach's three minutes.
    const restSeconds =
      restResumeRemainingS ??
      (current ? restAfterStep(current) : restTransitionSeconds());

    async function finalize(earlyFinish: boolean): Promise<CompleteResult> {
      const session = sessionRef.current;
      if (!session) return { ended: true, unlockedPortrait: false };

      // NOT STARTED (UX item 3A): the athlete entered the workout and left without completing a
      // single step. This is NOT a workout — it is never saved to history, never counted toward
      // calibration, and never marks the day done. Just clear the orphan session and exit.
      //
      // ⚠️ IT ASKED ONLY ABOUT SETS. A session of intervals and holds — which the coach can now
      // write, and which is an entire training week for a runner — logs no `SetLog` at all, so a
      // finished workout would have been thrown away as never started.
      //
      // ⚠️ AND A WARM-UP BRIDGE IS NOT A START (2026-08-24). Tapping through half a ramp and
      // leaving is the same "entered and left" this gate has always named — a record whose only
      // rows are bridges would sit in History as a workout of no work, which is the exact thing
      // `sessionHasLoggedWork` refuses to list.
      if (session.sets.every((s) => s.isApproach) && !session.items?.length) {
        await db.clearActiveSession();
        await db.clearSessionResume().catch(() => {});
        dispatch({ type: 'END' });
        void track('session_abandoned', { sessionId: session.id, programDayId: session.programDayId });
        const notStartedResult: CompleteResult = { ended: true, unlockedPortrait: false, notStarted: true };
        setEndResult(notStartedResult);
        return notStartedResult;
      }

      // PARTIAL vs TRAINED (founder 2026-07-11, domain/completion): a session finishes the workout
      // only at HALF its prescribed sets or more. The verdict is stamped ON the session so it is
      // durable (the workout-count milestones read it long after the program has changed shape).
      const programDay = app.program?.days.find((d) => d.id === session.programDayId);
      /*
       * ⛔ HER WORD, STAMPED BEFORE THE VERDICT (2026-09-07). Every road into `finalize` is hers:
       * the finish control, "done" from the wrist or by voice, or the last set of the session. A
       * salvage (`sessionRecovery`) never comes through here and never carries this mark, which is
       * exactly how `sessionTrained` tells "she finished" from "she left".
       */
      const withHerWord: Session = { ...session, finishedByAthlete: true };
      const trained = sessionTrained(withHerWord, programDay);

      // Owner-voice annotation only when Hush acted or the athlete ended early
      // (§4.10). Early-finish takes precedence; otherwise an increase this session.
      const increasedStep = plan.find((s) => s.target?.reasonType === 'increase');
      const saved: Session = {
        ...withHerWord,
        state: 'SAVED',
        earlyFinish,
        trained,
        annotation: earlyFinish ? 'ended_early' : increasedStep ? 'increased' : null,
        annotationCapability:
          !earlyFinish && increasedStep ? exerciseById(increasedStep.exerciseId)?.capability : undefined,
      };
      // Save BEFORE Well Done (invariant §8.4). Local save + mode advance + END
      // must ALWAYS run, online or offline — completion never depends on the
      // backend (§6.2). Backend sync is best-effort and queued on failure (§6.4).
      await db.appendCompletedSession(saved);
      await db.clearActiveSession();
      await db.clearSessionResume().catch(() => {});
      /*
       * ⛔ HER RINGS CLOSE (2026-08-23). The finished session goes to Apple Health — the write the
       * plist has promised since it was authored, and the one thing every competitor does that this
       * app did not. Strictly AFTER the local save and strictly un-awaited: a Health failure costs
       * the ring, never the record, and nothing may stand between the save and Well Done (§8.4).
       *
       * ⚠️ ONLY A TRAINED SESSION IS A WORKOUT — the same completion bar the count keeps. A two-set
       * false start written to Health would put a "workout" on her rings that this app itself
       * refuses to count.
       *
       * ⚠️ THE SPAN IS THE WORKOUT'S OWN (`sessionDurationMs`), not screen time — the exact defect
       * the summary above already documents. kcal is the declared estimate and rides only when her
       * bodyweight priced one: no body, no number, in Health exactly as on the screen.
       */
      if (trained) {
        const spanMs = sessionDurationMs(saved);
        void healthWrite
          .strength({
            startedAt: saved.startedAt,
            endedAt: new Date(Date.parse(saved.startedAt) + spanMs).toISOString(),
            kcal: sessionEnergyKcal(saved, app.profile?.weightKg),
          })
          .then((ok) => { if (ok) void track('health_workout_written', { kind: 'strength' }); })
          .catch(() => {});
      }
      // Below the TRAINED bar the work is still real — it is in History and the engine folds every
      // set performed — but the workout STAYS on the week's list, so one exercise out of six never
      // costs the athlete the session.
      // A COMPLETED SESSION is a completed WORKOUT — so only a trained one advances the count.
      // The count gates the free trial (14 sessions) and calibration: a partial that leaves the
      // workout open must not burn a free session, or an athlete who finishes that same workout
      // in a second visit would pay twice for one workout.
      const { unlockedPortrait } = trained
        ? await app.recordSessionCompleted()
        : { unlockedPortrait: false };
      if (trained) {
        // Mark this workout DONE for the week so Program shows the green DONE chip and
        // Home advances to the next unfinished workout (Rest once all are done).
        await app.markWorkoutCompleted(session.programDayId);
      }
      /*
       * ⛔ THE COACH IS NOT ASKED WHAT HAPPENS NEXT. THE ENGINE ALREADY KNOWS.
       *
       * ⛔ FOUNDER, 2026-08-12: *"אחרי כל אימון — המנוע אחראי לתוכנית."*
       *
       * This line was `void askAfterSession(saved)`, and the comment above it called that "the
       * sentence the product is built around: the workout ended … and **the coach decides the next
       * programme**." That sentence was true of the AI era and it survived the AI being removed —
       * which meant the engine owned her week for exactly ONE week. She trained once, the model
       * wrote a `CoachPlan`, and every surface preferred it from then on.
       *
       * ⚠️ SO EVERY GUARANTEE THE ENGINE MAKES APPLIED TO HER FIRST WEEK ONLY. The share table, the
       * 45–60 minutes, the repair pass, the effective dose, the 270-week scoreboard — all of it,
       * replaced after her first session by a model that had none of those rules.
       *
       * ── AND NOTHING IS LOST BY REMOVING IT, WHICH IS THE POINT ─────────────────────────────────
       * The engine has always done this work and does it from her record rather than from prose:
       *
       *   Loop 1  moves the load BETWEEN sets, from the reps she just did
       *   Loop 2  decides the next session's load from the last one (S-38 … S-53)
       *   Loop 3  grows or trims a muscle's weekly volume from what she earned
       *
       * `sessionTargets` re-reads her history on every call, so the next workout is already the
       * answer to this one. There was never a second opinion to add — only one to override.
       */

      void track('session_finished', {
        sessionId: saved.id,
        programDayId: session.programDayId,
        sets: saved.sets.length,
        prescribed: programDay ? prescribedSets(programDay) : null,
        earlyFinish,
        trained,
      });

      // Rev 7 (S-68…S-70): learn a standing exercise replacement from repeated in-workout swaps.
      // Best-effort — the learning never blocks a finished workout.
      //
      // This used to be gated on `app.profile?.repBand` — the old v5 COHORT switch. There is no
      // cohort any more (register, corrected 2026-07-17: the burial deleted v4, so nobody can "stay
      // v4"), and Rev 7 §A deleted the onboarding rep-band question, so `repBand` is exactly the
      // field that is allowed to be absent. Any profile without it — a legacy athlete, or one whose
      // profile write lost the default — silently lost the WHOLE of S-68…S-72: her swaps never
      // became standing replacements and her resistance to a rotation never earned a leave-it. A
      // legacy fallback is supposed to be free; one that switches off a feature is not.
      // Offered = the day's non-supplemental slots; performed = the distinct WORKING lifts she logged
      // (approach sets excluded). Two consecutive same-target swaps adopt (writes prefs.substitutes,
      // which the assembler honours); the original is offered first ever after (S-70).
      if (programDay) {
        try {
          const offeredIds = programDay.slots.filter((s) => !s.supplemental).map((s) => s.exerciseId);
          const performedIds = [...new Set(saved.sets.filter((s) => !s.isApproach).map((s) => s.exerciseId))];
          const prefs = await db.loadPreferences();
          const prev = prefs.substitutes;
          const next = foldSessionSwaps(
            { substitutes: prev, pending: prefs.swapPending ?? {} },
            offeredIds,
            performedIds,
          );
          // S-71: the learned "leave it." The engine rotated a stalled lift away (marked in
          // engineRotated). If she swaps BACK to that lift twice, the fold CLEARS its substitute here —
          // that resistance earns a learned pin: the engine stops rotating it (fixtureModel skips a pin).
          // Only her OWN swap-backs reach this; an engine rotation never advances the counter (S-72).
          const engineRotated = { ...(prefs.engineRotated ?? {}) };
          const leaveItsByMuscle = { ...prefs.leaveItsByMuscle };
          for (const anchor of learnedLeaveIts(prev, next.substitutes, engineRotated)) {
            const m = muscleOf(anchor);
            if (m) leaveItsByMuscle[m] = anchor; // S-71 — never rotated (S-30), cut last (S-59)
            delete engineRotated[anchor];
          }
          await db.savePreferences({ ...prefs, substitutes: next.substitutes, swapPending: next.pending, leaveItsByMuscle, engineRotated });
          /*
           * ⛔ THE ADOPTION USED TO BE STAMPED INTO THE ENGINE'S CHANGELOG so the Saturday mirror
           * could name it. Nothing reads that log any more — and the adoption reaches the coach a
           * better way than a stamp: it is a PREFERENCE, it travels on her sheet as `swappedByHer`,
           * and the coach decides what to do about it instead of being told after the fact what the
           * app has already done.
           */
        } catch {
          /* best-effort — a learning failure never affects the saved workout */
        }
      }

      /**
       * THE MARK, ON THE WRIST (founder 2026-07-13). The phone celebrates a milestone as beat 4 of
       * Well Done; an athlete who trained with the phone in a locker never saw it. The mark is
       * earned HERE — on the phone, from the phone's history, one line after the session was
       * written to it — and rides the complete frame as finished English copy (MirrorMilestone).
       * No milestone logic crosses to the watch: there is no second engine on the wrist.
       *
       * It must be computed BEFORE the frame is published (the publish is what ends the watch
       * session), and it can only be computed after `appendCompletedSession` above — a milestone
       * is crossed by a session that exists in history, not by one that is about to.
       */
      let milestone: MirrorMilestone | null = null;
      try {
        const earned = newlyEarned(await db.loadHistory(), app.profile)[0] ?? null;
        if (earned) {
          // English: the watch target has no i18n runtime (WatchCopy.swift is English by law).
          const tEn = i18n.getFixedT('en') as unknown as Translate;
          const c = milestoneCopy(earned, tEn, app.profile?.units ?? 'kg');
          milestone = { value: c.value, caption: c.caption, title: c.title, sub: c.sub };
        }
      } catch {
        // A milestone is a grace note. If history cannot be read, the wrist still gets its
        // closing screen — it simply does not get the medallion.
        milestone = null;
      }

      // Publish the terminal "complete" frame to the watch BEFORE teardown (deterministic — not
      // reliant on the [state] effect's scheduling). The wrist then shows Workout Complete with the
      // TRUTHFUL summary; END below empties the plan so the next projection is null, which the watch
      // bridge ignores once this complete frame has ended its session.
      const completeMirror = projectSessionMirror({
        steps: buildMirrorSteps(plan, appRef.current?.profile?.equipment),
        total: plan.length,
        machine: { ...machine, phase: 'SESSION_SAVED' },
        // The terminal frame draws no timer; the numbers are carried only so the shape is complete.
        restInterS: REST_UNSTATED_S,
        restTransitionS: REST_UNSTATED_S,
        restStartedAtMs: null,
        nowMs: Date.now(),
        workoutName: saved.programDayName ?? '',
        sessionStartedAtMs: Date.parse(saved.startedAt),
        completedSets: saved.sets.length,
        loggedSets: saved.sets.map((s) => ({ weight: s.actualWeight ?? null, reps: s.actualReps })),
        progressedLifts: progressedLiftCount(plan, saved.sets),
        // ONE NUMBER PER WORKOUT — the phone is the authority here, so the phone's figure crosses
        // to the wrist and the wrist stops printing its own HealthKit reading beside it.
        kcal: sessionEnergyKcal(saved, app.profile?.weightKg),
        milestone,
      });
      if (completeMirror) watchRef.current?.publish(completeMirror);
      dispatch({ type: 'END' });

      void track('session_completed', {
        sessionId: saved.id,
        programDayId: session.programDayId,
        setCount: saved.sets.length,
        earlyFinish,
        unlockedPortrait,
      });

      const syncSets = saved.sets.map((s) => ({
        exerciseId: s.exerciseId,
        setIndex: s.setIndex,
        actualWeight: s.actualWeight,
        actualReps: s.actualReps,
        blockId: s.blockId,
      }));
      try {
        await app.model.recordSession({ programDayId: session.programDayId, sets: syncSets, earlyFinish });
      } catch (e) {
        if (worthQueuing(e)) {
          // Offline / timeout / 5xx → queue for silent reconcile on reconnect (§5.2, §6.4).
          await db.enqueuePendingSync({ sessionId: saved.id, programDayId: session.programDayId, sets: syncSets, earlyFinish });
        } else {
          // Permanent (e.g. validation) — never retries; record it so we can diagnose.
          void track('sync_dropped', { sessionId: saved.id, kind: e instanceof HttpError ? e.kind : 'unknown' });
        }
      }
      // Closing summary for the Complete screen (computed from the saved session + plan).
      /*
       * ⛔ THE SAME ANSWER THE WRIST GETS (code review 2026-09-09). This read
       * `target.reasonType === 'increase'`, which `buildMirrorSteps` documents at length as never
       * written on a coach plan — so the phone's Well Done said "0 raised" over the wrist's "3".
       * `progressedLiftCount` is the measured fact both surfaces now print.
       */
      const progressed = progressedLiftCount(plan, saved.sets);
      const summary: SessionSummary = {
        workoutName: saved.programDayName ?? exerciseById(plan[0]?.exerciseId ?? '')?.name ?? '',
        // Every step she did, for the same reason `sessionTrained` counts them: a session of
        // intervals reading "0" would tell her she had done nothing on the screen that closes it.
        // Working sets only — the warm-up ramp is not counted here, exactly as everywhere else
        // (a bridge writes no `ItemResult` since 2026-09-09 — see `insertWarmup`).
        sets: saved.items?.length ?? saved.sets.filter((s) => !s.isApproach).length,
        progressed,
        // ⚠️ THE WORKOUT, NOT THE TIME SHE SPENT ON THIS SCREEN. This was `Date.now() - startedAt`:
        // the stopwatch kept running while she racked the bar, changed, and got round to pressing
        // Finish, so Well Done's minutes and calories overshot the record the Log would show her a
        // tap later. Same span, everywhere, for one session.
        durationMs: sessionDurationMs(saved),
        // The key every decision this occurrence earned is stamped with (changeLog[].at).
        startedAtMs: Date.parse(saved.startedAt),
        earlyFinish,
        // False => the workout stays on this week's list (PARTIAL); Well Done says so.
        trained,
      };
      const result: CompleteResult = { ended: true, unlockedPortrait, summary };
      setEndResult(result);
      return result;
    }

    return {
      applyLockIntents,
      active: plan.length > 0 && machine.phase !== 'SESSION_SAVED' && machine.phase !== 'WELL_DONE',
      phase: machine.phase,
      displayPhase,
      paused,
      currentExercise: current ? exerciseById(current.exerciseId) ?? null : null,
      currentExerciseId: current?.exerciseId ?? null,
      sessionExerciseIds: [...new Set(plan.map((s) => s.exerciseId))],
      movableExerciseIds: movableExercisesFrom(plan, reorderBoundary(machine)),
      sessionSetCounts: plan.reduce<Record<string, number>>((acc, s) => {
        if (!s.warmup) acc[s.exerciseId] = (acc[s.exerciseId] ?? 0) + 1;
        return acc;
      }, {}),
      currentTarget: current?.target ?? null,
      currentItem: current?.item ?? null,
      nextItem: resting ? next?.item ?? null : null,
      /*
       * ════ THE THING SHE GOES STRAIGHT INTO, WITH NO REST ════
       *
       * ⚠️ THE APP RAN SUPERSETS CORRECTLY AND NEVER SAID SO. `planRun` expands a two-item block
       * exactly right — no rest inside a round, the coach's rest between rounds — so she finished a
       * set of bench and the next screen was a row, immediately, with nothing anywhere telling her
       * that was deliberate. From the athlete's side an intentional superset and a broken rest timer
       * look identical.
       *
       * Present only when the very next step follows with NO rest, which is the definition the plan
       * already carries: `restAfterS === 0` is the coach saying "straight on".
       */
      // `<= REST_SKIP_THRESHOLD_S`, the machine's own line (§1.14): a coach rest of one to five
      // seconds skips the rest screen exactly as zero does, and read as `=== 0` the superset label
      // went missing on precisely those (2026-09-09).
      straightInto:
        current && restAfterStep(current) <= REST_SKIP_THRESHOLD_S && next && !current.lastSetOfSession
          ? exerciseById(next.exerciseId)?.name ?? exerciseDisplayName(next.exerciseId)
          : null,
      setLabel: current ? stepPosition(current) : null,
      /*
       * ⚠️ THE LIVE SESSION IS EXCLUDED BY ID. History is written as she goes, so without this
       * "last time" would become "the set you just did" — useless and wrong.
       */
      lastTime: lastTimeOn(current?.exerciseId ?? null, historyRef.current, {
        excludeSessionId: sessionRef.current?.id,
      }),
      /*
       * ⚠️ FILTERED BY EXERCISE AND ORDERED BY `setIndex`, not by the order they were written. A
       * resumed session appends in write order, and a row read from that would put set 3's reps in
       * slot 1 the moment anything was logged out of sequence.
       */
      /*
       * ⛔ THE CURRENT BLOCK'S SETS, NOT EVERY SET OF THIS LIFT TODAY (found 2026-08-04). `setIndex`
       * is the round WITHIN a block, so a lift the coach split across two blocks restarts at 0 and a
       * plain sort interleaved the two — block two's row drew block one's reps. `currentBlockSets`
       * takes the trailing run that begins at the last `setIndex === 0`, which is what the plan's
       * front-to-back execution guarantees.
       */
      setsSoFar: current ? currentBlockSetsOf(state.session?.sets, current.exerciseId).map((x) => x.actualReps) : [],
      loadsSoFar: current ? currentBlockSetsOf(state.session?.sets, current.exerciseId).map((x) => x.actualWeight ?? null) : [],
      livePlan: plan,
      loggedSets: state.session?.sets ?? EMPTY_SETS,
      globalProgress: current ? { index: current.globalIndex, total: plan.length } : null,
      exerciseProgress: current
        ? (() => {
            const runs = exerciseRuns(plan);
            let acc = 0;
            for (let r = 0; r < runs.length; r++) {
              if (current.globalIndex < acc + runs[r].length) return { index: r, total: runs.length };
              acc += runs[r].length;
            }
            return { index: 0, total: runs.length };
          })()
        : null,
      nextExercise: resting && next ? exerciseById(next.exerciseId) ?? null : null,
      nextExerciseId: resting ? next?.exerciseId ?? null : null,
      nextTarget: resting ? next?.target ?? null : null,
      nextSetLabel: resting && next ? stepPosition(next) : null,
      restSeconds,
      restExtraSeconds: restExtraSecondsRef.current,
      /*
       * ════ THE PHONE'S RING RUNS ON THE MIRROR'S ANCHOR (code review 2026-09-09) ════
       * The countdown anchored itself at MOUNT (`Date.now() + restSeconds`) and re-anchored only when
       * the length or the phase changed. Two things move the anchor without moving either: a set the
       * clock PRESUMED (the rest began at the due instant, minutes ago — the phone restarted a full
       * rest while the wrist and the lock screen showed the true remainder) and "I just finished"
       * (the rest restarts NOW — the store re-anchored, the ring never did). The end the wrist draws
       * is `restStartedAt + (rest + extra)`; the phone's ring is handed the same instant.
       */
      restStartedAtMs: resting && !paused ? restStartedAtRef.current : null,
      restEndsAtMs:
        resting && !paused && current && restStartedAtRef.current != null
          ? restStartedAtRef.current + (restAfterStep(current) + restExtraSecondsRef.current) * 1000
          : null,
      // What the rest-over alert says — the next set's own figures (`nextSetAlert`). Handed to the
      // rest screen so every re-arm it makes (mount, resume, +15) keeps them; it used to re-arm
      // with no payload and overwrite the store's with "Go." while the app was open (2026-09-09).
      restAlert: resting && next ? nextSetAlert(next, appRef.current?.profile?.units ?? 'kg') : null,
      watchLoggedSet,
      startedAtMs: state.session ? Date.parse(state.session.startedAt) : null,
      workoutName: state.session?.programDayName ?? '',
      // Equipment Occupied applies at the START of an exercise that has a later exercise to do.
      // The start is the exercise's FIRST step — its first warm-up bridge when it has a ramp
      // (that is the moment she discovers the station is busy), else working set 0.
      // Any set of a lift with a later, different lift to go to (2026-09-07 — the board).
      canMarkOccupied:
        displayPhase === 'SET_PRESENTED' &&
        !!current &&
        plan.some((s) => s.globalIndex > current.globalIndex && s.exerciseId !== current.exerciseId),
      aheadExerciseIds: aheadExercisesFrom(plan, reorderBoundary(machine)),
      toLoad: current ? isToLoad(plan, machine.setIndex, state.session?.sets ?? []) : false,
      // The record question's baseline — everything logged BEFORE the current set: her history's
      // peak AND the live session's own earlier sets (domain/setRecord `recordBaselineKg`).
      // History alone made the record repeat on every set at the new weight (review, 2026-08-24).
      priorPeakKg: current
        ? recordBaselineKg(
            priorPeakKg(historyRef.current, current.exerciseId, sessionRef.current?.id),
            livePeakKg(state.session?.sets ?? [], current.exerciseId),
          )
        : null,
      /* The offer, asked at the step she is about to PERFORM — see the field's note for why a
         crossing asks about `idx + 1` and a rest between sets asks nothing. */
      /* Never under a Pause: the workout is frozen (§7.2), so a set cannot be "running long" — she
         stopped it on purpose, and the timer above was cleared when the phase left SET_PRESENTED. */
      setRunningLong: setRunningLong && !paused,
      nextLiftFact:
        displayPhase === 'REST_TRANSITION' && next?.exerciseId
          ? factForLift(historyRef.current, next.exerciseId, learnedExecSFor(historyRef.current, next.exerciseId))
          : null,
      warmupOffered: paused ? 0 : (warmupOffer(plan, displayPhase === 'REST_TRANSITION' ? idx + 1 : displayPhase === 'SET_PRESENTED' ? idx : -1)?.ramp.length ?? 0),
      /**
       * ⚠️ ONE DERIVATION, ASKED TWICE — the disc above and this action call the SAME `warmupOffer`
       * against the same cursor, so a press can never land on a refusal. It re-asks rather than
       * trusting the view's number because a press is a moment later than the render that offered
       * it, and in between a rest can have expired under her thumb.
       *
       * The cursor is NOT moved. The bridges go in immediately before the working set she was
       * heading for, so the position the machine already holds now addresses the first bridge —
       * which is exactly what "take me to a warm-up set" means, with no state to keep in step.
       */
      addWarmup() {
        if (machineRef.current.phase === 'PAUSED') return; // a frozen workout takes no edits (§7.2)
        // `startsWith`, because a crossing has two names — an auto-swapped one is still a crossing,
        // and reading `=== 'REST_TRANSITION'` would silently drop the offer on exactly the beat
        // where the station turned out to be busy.
        const crossing = machine.phase.startsWith('REST_TRANSITION');
        if (!crossing && machine.phase !== 'SET_PRESENTED') return;
        const at = crossing ? machine.setIndex + 1 : machine.setIndex;
        const offer = warmupOffer(state.plan, at);
        if (!offer) return;
        void track('warmup_added', {
          sessionId: sessionRef.current?.id,
          ex: state.plan[at]?.exerciseId,
          bridges: offer.ramp.length,
          from: crossing ? 'crossing' : 'set',
        });
        dispatch({ type: 'SWAP_PLAN', plan: insertWarmup(state.plan, offer.at, offer.ramp) });
      },

      publishWatchLobby(lobby, watchPlan) {
        /*
         * ⚠️ WELL DONE IS STILL THE SESSION (founder, device QA 2026-07-30: *"I managed to start a
         * workout from the watch while the phone was showing What this session earned"*).
         *
         * This read `plan.length > 0 && phase !== 'SESSION_SAVED' && phase !== 'WELL_DONE'` — so the
         * instant the last set was written, the lobby went back to the wrist and its Start came
         * alive while the phone was still on the closing beat. She could begin a second workout out
         * of the end of the first.
         *
         * The two exclusions were there to get the lobby back promptly after a workout. They are not
         * needed for it: `END` empties the plan, and an EMPTY PLAN is what "she has left the session"
         * actually means. The phase was a step INSIDE the finish, and reading a step as the end is
         * the whole of this bug.
         */
        if (plan.length > 0) return;
        watchRef.current?.publishLobby(lobby, watchPlan ?? null);
      },
      setWatchHomeActions(handlers) {
        watchStartRef.current = handlers ? () => handlers.onBegin() : () => {};
        watchSelectRef.current = handlers ? (id) => handlers.onSelect(id) : () => {};
      },
      endResult,
      correction,
      clearEndResult: () => setEndResult(null),
      clearCorrection: () => setCorrection(null),

      async start(day, targets, withPartners) {
        /*
         * ════ ⛔ THE GATE, GUARDED WHERE IT CANNOT BE ROUTED AROUND (founder, 2026-08-23) ════
         *
         * Every UI door checks `isTrainingGated` before starting — and the pre-workout card
         * demonstrably did not, for weeks. Doors multiply (Home, the card, the wrist, whatever
         * ships next quarter); the doorway does not. A start that reaches here gated is refused,
         * whoever forgot to ask — the same depth-of-defense shape as the one-session guard above.
         */
        {
          const a = appRef.current;
          if (a && isTrainingGated(a.modeState.completedSessions, a.entitlement.active, a.profile?.memberSince)) return;
        }

        /*
         * ⚠️ ONE SESSION AT A TIME, GUARDED WHERE IT CANNOT BE ROUTED AROUND.
         *
         * The founder started a second workout from his wrist while the phone was on the closing
         * beat of the first. The lobby fix above closes the door he walked through; this closes the
         * doorway. `watchStartRef` stays bound while Home is MOUNTED rather than focused — on
         * purpose, so a watch Begin works with Settings or Well Done pushed on top — which means a
         * lobby already sitting on the wrist can still call in. A second START would replace the
         * live plan, and the first workout's remaining sets would simply cease to exist.
         */
        if (plan.length > 0) return;
        // The athlete chose a FRESH workout while an interrupted one was still resumable
        // (or a stale orphan lingered): salvage its logged work first, then compose cleanly.
        await creditSalvage(await salvageOrphanSession());
        setRestResumeRemainingS(null);
        // A rest banked by the PREVIOUS session must never be stamped onto this one's first set —
        // the athlete's "rest" between two workouts is not a rest (L3). The first set of a session
        // has no rest before it, and that is the honest answer.
        restStartedAtRef.current = null;
        pendingRestSRef.current = null;
        historyRef.current = await db.loadHistory().catch(() => []); // her learned grid for live Loop 1
        refreshLearnedRests(historyRef.current); // …and her learned REST timer (S-17)
        const plan2 = buildPlan(day, targets);
        const session: Session = {
          id: `sess_${Date.now()}`,
          programDayId: day.id,
          programDayName: day.name, // captured now so History stays stable across regenerations
          // What she was asked to do, stamped now — see `Session.prescribed`.
          prescribed: plan2.length,
          startedAt: new Date().toISOString(),
          state: 'ACTIVE',
          earlyFinish: false,
          sets: [],
          // Trained together (see the parameter). Absent on every solo start — which is exactly
          // what an absent `partners` has meant on this record since the field was added.
          ...(withPartners && withPartners.length > 0 ? { partners: [...withPartners] } : {}),
        };
        await db.saveActiveSession(session);
        void track('session_started', { sessionId: session.id, programDayId: day.id, blockCount: day.slots.length });
        // The Live Activity + Watch surfaces start/update from the canonical mirror
        // projection (the [state] effect) — START flips state and the effect fires.
        dispatch({
          type: 'START',
          plan: plan2,
          session,
          machine: initialSessionMachine(plan2.length <= 1),
          targets,
        });
      },

      async startCoach(planned, workoutId, withPartners) {
        /*
         * ════ ⛔ THE GATE, GUARDED WHERE IT CANNOT BE ROUTED AROUND (founder, 2026-08-23) ════
         *
         * Every UI door checks `isTrainingGated` before starting — and the pre-workout card
         * demonstrably did not, for weeks. Doors multiply (Home, the card, the wrist, whatever
         * ships next quarter); the doorway does not. A start that reaches here gated is refused,
         * whoever forgot to ask — the same depth-of-defense shape as the one-session guard above.
         */
        {
          const a = appRef.current;
          if (a && isTrainingGated(a.modeState.completedSessions, a.entitlement.active, a.profile?.memberSince)) return;
        }

        /*
         * ⚠️ ONE SESSION AT A TIME, GUARDED WHERE IT CANNOT BE ROUTED AROUND.
         *
         * The founder started a second workout from his wrist while the phone was on the closing
         * beat of the first. The lobby fix above closes the door he walked through; this closes the
         * doorway. `watchStartRef` stays bound while Home is MOUNTED rather than focused — on
         * purpose, so a watch Begin works with Settings or Well Done pushed on top — which means a
         * lobby already sitting on the wrist can still call in. A second START would replace the
         * live plan, and the first workout's remaining sets would simply cease to exist.
         */
        if (plan.length > 0) return;
        /*
         * Everything `start` does before it composes, because none of it is about where the plan
         * came from: salvage an orphan, clear the previous session's banked rest, reset Loop 1's
         * budget, and read her history so the live loop has her learned grid and rest.
         */
        await creditSalvage(await salvageOrphanSession());
        setRestResumeRemainingS(null);
        restStartedAtRef.current = null;
        pendingRestSRef.current = null;
        historyRef.current = await db.loadHistory().catch(() => []);
        refreshLearnedRests(historyRef.current);

        // No `targets` argument, and that is the whole difference. The engine's per-set targets are
        // what `start` composes a plan AROUND; here the loads are already decided and are in the
        // items. Only the `reps` shape carries one at all — a run has no load to prescribe.
        const plan2 = buildPlanFromCoach(planned);
        const session: Session = {
          id: `sess_${Date.now()}`,
          programDayId: workoutId,
          programDayName: planned.name,
          /*
           * ⛔ TRAINED TOGETHER — ON BOTH RECORDS, NOT ONE (found by the founder's question,
           * 2026-08-31: *"מה קורה אם אני שולח אימון זוגי…"*).
           *
           * The guest's session carried `partners` from the day the pair was built, because he
           * starts through `start`. The HOST starts through this door, which did not take the
           * argument — so the finish poster and the story card named a partner on his phone and
           * nobody on hers, for the same hour of the same workout. One workout, two records, and
           * only one of them remembered it happened.
           */
          ...(withPartners && withPartners.length > 0 ? { partners: [...withPartners] } : {}),
          /*
           * The only answer to "did she finish it?" for a coach session — there is no `ProgramDay`
           * to count slots on, and the fallback for an unknown prescription is "any logged work
           * counts", which would let one set close the workout and burn a free trial session.
           */
          prescribed: plan2.length,
          startedAt: new Date().toISOString(),
          state: 'ACTIVE',
          earlyFinish: false,
          sets: [],
        };
        await db.saveActiveSession(session);
        void track('session_started', { sessionId: session.id, programDayId: workoutId, blockCount: planned.blocks.length });
        dispatch({
          type: 'START',
          plan: plan2,
          session,
          machine: initialSessionMachine(plan2.length <= 1),
        });
      },

      async loadResumable() {
        // A resumable exists only while no session is live in this process.
        if (plan.length > 0) return null;
        try {
          const [active, snap] = await Promise.all([db.loadActiveSession(), db.loadSessionResume()]);
          if (!active || !snap || snap.schema !== 1) return null;
          const m = snap.machine as SessionMachine;
          if (m.phase === 'SESSION_SAVED' || m.phase === 'WELL_DONE') return null;
          if (Date.now() - Date.parse(snap.savedAt) > RESUME_WINDOW_MS) return null;
          return { workoutName: active.programDayName ?? '' };
        } catch {
          return null;
        }
      },

      async resumeSaved() {
        if (plan.length > 0) return false; // a live session always wins
        try {
          const [active, snap] = await Promise.all([db.loadActiveSession(), db.loadSessionResume()]);
          if (!active || !snap || snap.schema !== 1) return false;
          const resumePlan = snap.plan as Step[];
          const r = reconcileResume(
            {
              plan: resumePlan,
              machine: snap.machine as SessionMachine,
              restStartedAtMs: snap.restStartedAtMs,
              restExtraS: snap.restExtraS,
              pausedAtMs: snap.pausedAtMs,
              savedAt: snap.savedAt,
            },
            active,
            Date.now(),
            // The coach's own number for the step the rest belongs to — the machine sits ON the
            // completed step while resting, so this is the same step `restAfterStep` asks about.
            // Without it a three-minute prescribed rest came back from a crash as ninety seconds.
            (_kind, _exerciseId) =>
              restAfterStep(resumePlan[(snap.machine as SessionMachine).setIndex] ?? ({} as Step)),
          );
          if (!r) {
            // Unusable (stale / fully completed) → salvage so the next Begin composes cleanly.
            await creditSalvage(await salvageOrphanSession());
            return false;
          }
          sessionRef.current = active;
          historyRef.current = await db.loadHistory().catch(() => []); // her learned grid for live Loop 1
          refreshLearnedRests(historyRef.current); // …and her learned REST timer (S-17)
          restStartedAtRef.current = r.restStartedAtMs;
          restExtraSecondsRef.current = r.restExtraS;
          // A rest banked before the kill still belongs to the set the athlete is about to log (L3).
          pendingRestSRef.current = snap.pendingRestS ?? null;
          /*
           * THE CLOCK'S ANCHOR COMES BACK TOO (2026-09-07). A set still presented keeps the instant
           * it went on screen, so the ask below is measured from the truth, not from the wake — and
           * a rest the reconciler served out on the wall clock presents its next set from that end.
           */
          const landed = resumePlan[r.machine.setIndex];
          if (landed && r.machine.phase === 'SET_PRESENTED') {
            const same = (snap.machine as SessionMachine).setIndex === r.machine.setIndex && (snap.machine as SessionMachine).phase === 'SET_PRESENTED';
            const atMs = same && snap.presentedAtMs != null ? snap.presentedAtMs : Date.now();
            setPresentedAtRef.current = { key: stepKey(landed), atMs };
          }
          pauseStartedAtRef.current = null;
          setRestResumeRemainingS(r.restRemainingS);
          dispatch({ type: 'START', plan: resumePlan, session: active, machine: r.machine });
          // …and a rest that ran out while the app was dead is served out now, at its own instant.
          setTimeout(() => void applyClockRef.current(Date.now()), 0);
          void track('session_resumed', {
            sessionId: active.id,
            sets: active.sets.length,
            phase: r.machine.phase,
            restRemainingS: r.restRemainingS,
          });
          return true;
        } catch {
          return false;
        }
      },

      /**
       * ════════════════════════════════════════════════════════════════════════════════════════
       * THE WRIST IS RUNNING A WORKOUT — TAKE IT OVER.
       * ════════════════════════════════════════════════════════════════════════════════════════
       *
       * ⛔ FOUNDER: *"אם התחלתי אימון בשעון ואני נכנס לאפליקציה בפלאפון המסך של האימון צריך
       * להופיע."*
       *
       * A workout begun with the phone away runs on the wrist's own engine, which by design says
       * nothing until it is over. So opening the phone mid-workout showed Today — and offered to
       * start the very workout she was in the middle of.
       *
       * This is the phone taking the authority BACK, mid-flight. It walks the same road
       * `resumeSaved` walks — one session, one plan, one machine, then `START` — because inventing
       * a second way to put a live session into this store is inventing a second way to log a set.
       *
       * ── THE ORDER IS THE SAFETY ─────────────────────────────────────────────────────────────
       * Every question that can be answered is answered BEFORE anything is mutated. A refusal must
       * leave this store exactly as it found it; a half-adopted session — plan swapped, machine
       * not — is the one outcome worse than not adopting at all.
       */
      async adoptLocalSession(local: WatchLocalSession): Promise<'adopted' | 'duplicate' | 'refused'> {
        const id = watchSessionId(local.recordId);
        /* The cheap refusals first, on facts already in memory — no read of her history is needed
           to know that a different workout is live on this phone. */
        const quick = decideAdoption({
          liveSessionId: sessionRef.current?.id ?? null,
          liveSessionActive: plan.length > 0,
          historyIds: [],
          offeredId: id,
        });
        if (quick !== 'proceed') return quick;

        const history = await db.loadHistory().catch(() => []);
        /* …and then the one that needs her record: already finished and come home. The wrist's
           record may beat its own offer, and a straggler must not resurrect a saved workout. */
        const verdict = decideAdoption({
          liveSessionId: sessionRef.current?.id ?? null,
          liveSessionActive: plan.length > 0,
          historyIds: history.map((h) => h.id),
          offeredId: id,
        });
        if (verdict !== 'proceed') return verdict;

        const adopted = adoptWatchSession(local, Date.now());
        /* A state the phone could not honestly stand in (a pause that does not say what it froze,
           a step index outside the plan she sent). Refuse and leave the workout on her wrist. */
        if (!adopted) return 'refused';

        sessionRef.current = adopted.session;
        historyRef.current = history; // her learned grid for live Loop 1
        refreshLearnedRests(history); // …and her learned REST timer (S-17)
        restStartedAtRef.current = adopted.restStartedAtMs;
        /* The wrist's +15s is already inside the absolute `restEndsAt` it sent, so there is no
           extra left to carry — counting it twice would hand her a rest she never asked for. */
        restExtraSecondsRef.current = 0;
        pendingRestSRef.current = null;
        pauseStartedAtRef.current = null;
        setRestResumeRemainingS(adopted.restRemainingS);
        /*
         * ⛔ BEFORE THE DISPATCH, NOT AFTER THE RESOLVE. Going live is what triggers the first
         * mirror frame, and that frame has to carry the ack — otherwise the wrist, which is still
         * running this workout, has no way to know it may let go until the phone's next state
         * change. Mid-rest that is ninety seconds of both devices believing they are in charge.
         */
        watchRef.current?.noteAdopted(local.recordId);
        dispatch({ type: 'START', plan: adopted.plan, session: adopted.session, machine: adopted.machine });
        /* Best-effort, and deliberately not awaited into the outcome: the session is live in this
           store either way, and the wrist keeps its own copy until it sees the phone's mirror — so
           a failed write costs a crash-resume, never the workout. */
        void db.saveActiveSession(adopted.session).catch(() => {});
        return 'adopted';
      },

      async completeSet(override): Promise<CompleteResult> {
        const session = sessionRef.current;
        if (!current || !session) return { ended: false, unlockedPortrait: false };
        // Race guard: a Pause may have landed after the 400ms success timer was
        // scheduled. A paused session never logs a set — the workout is frozen
        // (§7.2). The set logs on Resume → Complete Set, not behind the overlay.
        if (machineRef.current.phase === 'PAUSED') return { ended: false, unlockedPortrait: false };
        // A tap that lands during a rest is a second tap on a set already written: refused, quietly.
        // (Until 2026-09-09 a rest after a set the clock had presumed took this tap as "I just
        // finished"; no clock writes a set any more, so there is nothing here to re-anchor.)
        if (machineRef.current.phase !== 'SET_PRESENTED') return { ended: false, unlockedPortrait: false };
        /**
         * ONE SET, ONE LOG — WHICHEVER WRIST OR THUMB ASKED FOR IT.
         *
         * There are two mouths on this function now, and they can both be open at once. The phone
         * holds a 1.4 s "Set logged" beat before it calls in; the mirror still says `active_set`
         * for all of it, so a tap on the WATCH during that beat is a perfectly valid intent with a
         * matching index — the bridge accepts it, the phone logs the set, and then the beat's own
         * timer fires and logs it AGAIN. Two identical SetLogs: doubled tonnage, a doubled set in
         * the engine's history, and a duplicated key in the crash-resume map, which keys logged
         * sets by (exercise, set) and would now skip a set the athlete never did.
         *
         * So the write is made idempotent at the one place both callers pass through: an in-flight
         * latch for the concurrent case (the two calls overlap), and the athlete's own log for the
         * sequential one (the second call arrives after the first has landed). Neither caller has
         * to know the other exists.
         */
        if (completingRef.current) return { ended: false, unlockedPortrait: false };
        /* Read BEFORE anything moves: the stamp belongs to the set being answered, and the effect
           that maintains it re-points the moment the cursor advances. `nudged` likewise — the ask
           was about THIS set. Both are telemetry only; neither can affect what is logged. */
        const presentedAtMs = setPresentedAtRef.current?.key === stepKey(current) ? setPresentedAtRef.current.atMs : null;
        const nudged = nudgedRef.current;
        if (hasLoggedStep(session.sets, current.exerciseId, current.exerciseSetIndex)) {
          return { ended: false, unlockedPortrait: false };
        }
        completingRef.current = true;
        /*
         * `completeSet` logs a SET — a weight for a number of reps. A step with no rep prescription
         * is not one, and it does not come through here: `ItemStage` owns the shapes that are held,
         * covered or simply done, and they write an `ItemResult` instead. This is the guard that
         * says so, rather than a `?.` that would quietly write a set of `undefined` reps.
         */
        if (!current.target) {
          completingRef.current = false;
          return { ended: false, unlockedPortrait: false };
        }
        try {
        const setLog: SetLog = {
          exerciseId: current.exerciseId,
          setIndex: current.exerciseSetIndex,
          blockId: current.target.blockId, // carried for backend sync
          recommendedWeight: current.target.recommendedWeight,
          recommendedReps: current.target.recommendedReps,
          actualWeight: override ? override.weight : current.target.recommendedWeight,
          actualReps: override ? override.reps : current.target.recommendedReps,
          edited: override != null || !!current.edited,
          // A warm-up bridge writes BOTH marks (domain/warmupRamp): `isApproach` is the standing
          // wholesale exclusion every fold reader already filters; `isWarmup` is the honest label.
          // A working set writes neither — Rev 8's "no approach set" ruling stands untouched.
          ...(current.warmup ? { isApproach: true, isWarmup: true } : {}),
          persistedAt: new Date(clockNow()).toISOString(),
          // The rest that preceded THIS set (L3). Undefined on the session's first set — there
          // was none — and after a kill that landed mid-transition; undefined means unknown, and
          // the engine excludes such a set from every rest comparison rather than reading it as 0.
          ...(pendingRestSRef.current != null ? { restBeforeS: pendingRestSRef.current } : {}),
        };
        pendingRestSRef.current = null; // spent — one rest belongs to exactly one set
        // …and the same set as a row of the canonical record. One write, both views: `sets` is what
        // the engine, History and the mirror still read; `items` is what the coach is sent, and a
        // session whose record held only its planks would tell it she had stopped lifting.
        const repsRow = itemResultOf(current, {}, setLog, setLog.persistedAt);
        const updated: Session = {
          ...session,
          sets: [...session.sets, setLog],
          ...(repsRow ? { items: [...(session.items ?? []), repsRow] } : {}),
        };
        // Persist the actual at each Complete Set (§8.4).
        await db.saveActiveSession(updated);

        const capability = exerciseById(current.exerciseId)?.capability;

        // Per-set decision + outcome telemetry (alpha): structured context and the
        // logged actual — enough to reconstruct the session later.
        void track('set_completed', {
          sessionId: session.id,
          exerciseId: current.exerciseId,
          capability,
          setIndex: current.exerciseSetIndex,
          recommendedWeight: setLog.recommendedWeight,
          recommendedReps: setLog.recommendedReps,
          actualWeight: setLog.actualWeight,
          actualReps: setLog.actualReps,
          override: setLog.edited,
          decisionType: current.target.reasonType,
          /*
           * ⛔ THE COMPLIANCE SIGNAL THE PRODUCT COULD NOT SEE (2026-08-31, step 0 of the plan).
           *
           * How long the set sat on screen before it was answered. It took a live gym session for
           * the founder to discover he was forgetting to log at all — because nothing in the app or
           * the telemetry could have told us. `sets`/`prescribed` on `session_finished` say whether
           * a workout was logged; only this says whether it was logged AS IT HAPPENED, which is the
           * difference between a training app and a diary filled in afterwards.
           *
           * It is also the number the nudge is judged by: if the nudge works, this distribution's
           * tail collapses. `nudged` says whether we asked, so the two can be read against each
           * other rather than hoped about.
           */
          dwellS: presentedAtMs != null ? Math.round((clockNow() - presentedAtMs) / 1000) : null,
          nudged,
        });
        if (setLog.edited) void trackFirst('first_override');

        const restSecondsForThis = restAfterStep(current);
        const m = sessionReducer(
          { ...machine, isLastSetOfSession: current.lastSetOfSession },
          { type: 'COMPLETE_SET', restSeconds: restSecondsForThis, lastSetOfExercise: current.lastSetOfExercise },
        );
        sessionRef.current = updated;
        setRestResumeRemainingS(null); // a fresh transition — the resumed-rest anchor is spent
        dispatch({ type: 'LOG', setLog, session: updated, machine: m });

        // Engine v5 · the remaining sets follow what she just LIFTED (the fact, not the prescription).
        // One path here reaches both the phone and the watch, since the mirror re-projects from the plan.
        //   1) CARRY the performed weight onto the rest of the exercise — an equipment-reality edit (up
        //      or down) sticks instead of reverting to the prescription each set (founder, 2026-07-16).
        //   2) LOOP 1 then corrects ON TOP from her reps: the band it reads is her IMMUTABLE Tlo
        //      (target.repBandLo), never the reps she edited into recommendedReps, or every set would sit
        //      "in band" and the load could never move. Bodyweight / last-set / spent-budget are no-ops.
        // Every WORKING set acts from set 1 (no approach set — founder ruling 2026-07-16). A warm-up
        // bridge is not one: it carries no band, its weight must not carry onto the working sets,
        // and Loop 1 reading "5 reps at half weight" as a signal would be the measurement mechanism
        // Rev 8 deleted. The ramp logs its fact and steps aside (domain/warmupRamp).
        if (current.warmup) {
          setCorrection(null);
          if (m.phase === 'REST_INTER' || m.phase.startsWith('REST_TRANSITION')) {
            restStartedAtRef.current = clockNow();
            restExtraSecondsRef.current = 0;
          }
          if (m.phase === 'SESSION_SAVED') return finalize(false);
          return { ended: false, unlockedPortrait: false };
        }
        /*
         * ════ ⛔ LOOP 1 NO LONGER TOUCHES THE IRON MID-SESSION (founder, 2026-08-26) ════
         *
         * *"בזמן האימון המתאמן רק רושם ומתעד את הביצועים שלו… בלי שינויים במהלך האימון אלא רק
         * הסתגלות — אם נתנו לו משקל X והוא עושה Y אנחנו קופצים למשקל שהוא עשה. כל המסכים הכחולים
         * של הורדת משקל או הוספת משקל בזמן האימון צריך ללכת."*
         *
         * The register once called the in-set correction the signature moment; the founder's later
         * ruling is the sharper read of the same athlete: mid-workout she is a LOGGER — tired,
         * loaded, non-compliant — and an app that moves her plates between sets is friction, not
         * coaching. The coach speaks AFTER the session (Loop 2 → `engineChanges` → the WellDone
         * decisions door, each with its reason), which is the product's actual difference from
         * Hevy and Strong: their logger, plus a coach who concludes.
         *
         * What SURVIVES in-session is the one adaptation that follows her own hand:
         * `carryWeightForward` — she lifted Y where X was written, so the rest of the lift opens
         * at Y. Her decision, propagated; never ours, invented. `applyLoop1` stays a pure, tested
         * module (`engine/v5/loop1`) — Loop 2's between-session mathematics rests on the same
         * band — but nothing in the live session calls it any more, `correction` is permanently
         * null on this surface, and the eased/raised chrome is gone with it. (S-13's cap still binds
         * inside `correctInSession` for the one caller left — the voice conductor, spec §6.)
         */
        setCorrection(null);
        const carried = carryWeightForward(plan, current.globalIndex, setLog.actualWeight);
        // Identical-to-prescription set → a true no-op.
        if (carried !== plan) dispatch({ type: 'SWAP_PLAN', plan: carried as Step[] });

        // Mark when rest begins so the ACTUAL rest taken is measurable on endRest.
        if (m.phase === 'REST_INTER' || m.phase.startsWith('REST_TRANSITION')) {
          restStartedAtRef.current = clockNow();
          restExtraSecondsRef.current = 0; // a fresh rest starts at its base length
        }

        if (m.phase === 'SESSION_SAVED') {
          return finalize(false);
        }
        return { ended: false, unlockedPortrait: false, correction: null };
        } finally {
          completingRef.current = false;
        }
      },

      /**
       * ════ THE STEP THAT WAS NOT A SET ════
       *
       * A hold, a distance, an open item. Everything `completeSet` does except the parts that only
       * mean something for a weight: no Loop 1 (there is no band to correct against), no carry
       * forward (there is no load to carry), no `SetLog`.
       *
       * ⚠️ WITHOUT THIS THE COACH COULD WRITE THREE OF ITS FOUR SHAPES AND THE APP COULD RUN NONE
       * OF THEM. `ItemStage` was built, `ItemResult` was designed, `planRun` expanded them and
       * `buildPlanFromCoach` carried them — and the workout screen never branched, so a plank
       * arrived at the set stage as a set with no weight and no reps, mid-session.
       */
      async completeItem(done = {}): Promise<CompleteResult> {
        const session = sessionRef.current;
        if (!current || !session) return { ended: false, unlockedPortrait: false };
        // A paused workout is frozen (§7.2) — the same law the set path holds.
        if (machineRef.current.phase === 'PAUSED') return { ended: false, unlockedPortrait: false };
        // A set comes through `completeSet`, which knows about bands, loads and Loop 1. This is the
        // twin of that function's `!current.target` guard: neither door accepts the other's work.
        if (!current.item || current.item.kind === 'reps') return { ended: false, unlockedPortrait: false };
        if (completingRef.current) return { ended: false, unlockedPortrait: false };
        if (alreadyRecorded(session.items, current.where)) return { ended: false, unlockedPortrait: false };
        completingRef.current = true;
        try {
          const row = itemResultOf(
            current,
            { ...done, restBeforeS: pendingRestSRef.current },
            null,
            new Date().toISOString(),
          );
          if (!row) return { ended: false, unlockedPortrait: false };
          pendingRestSRef.current = null; // spent — one rest belongs to exactly one step
          const updated: Session = { ...session, items: [...(session.items ?? []), row] };
          await db.saveActiveSession(updated);
          void track('item_completed', {
            sessionId: session.id,
            ex: current.exerciseId,
            kind: current.item.kind,
            ...(row.kind === 'time' ? { seconds: row.seconds, askedSeconds: row.askedSeconds } : {}),
            ...(row.kind === 'distance' ? { metres: row.metres, askedMetres: row.askedMetres } : {}),
          });

          const restSecondsForThis = restAfterStep(current);
          const m = sessionReducer(
            { ...machine, isLastSetOfSession: current.lastSetOfSession },
            { type: 'COMPLETE_SET', restSeconds: restSecondsForThis, lastSetOfExercise: current.lastSetOfExercise },
          );
          sessionRef.current = updated;
          setRestResumeRemainingS(null);
          // Nothing here can correct a load, so nothing here may leave one on screen: a correction
          // belongs to the set that earned it, and the rest after a plank is not that rest.
          setCorrection(null);
          dispatch({ type: 'LOG_ITEM', session: updated, machine: m });

          if (m.phase === 'REST_INTER' || m.phase.startsWith('REST_TRANSITION')) {
            restStartedAtRef.current = clockNow();
            restExtraSecondsRef.current = 0;
          }
          if (m.phase === 'SESSION_SAVED') return finalize(false);
          return { ended: false, unlockedPortrait: false };
        } finally {
          completingRef.current = false;
        }
      },

      endRest() {
        // The rest the athlete ACTUALLY took. This is the only place it is knowable, and it used
        // to be handed to telemetry and thrown away — measured, then evaporated. It is now also
        // banked for the next set (engine v5 · L3: the engine may only compare like with like).
        if (restStartedAtRef.current != null) {
          const restMs = clockNow() - restStartedAtRef.current;
          const variant = machine.phase === 'REST_INTER' ? 'inter' : 'transition';
          void track('rest_completed', { sessionId: sessionRef.current?.id, restMs, plannedS: restSeconds, variant, early: restMs < restSeconds * 1000 });
          /**
           * ⛔ A REST SHE PRESSED STRAIGHT THROUGH IS NOT A THREE-SECOND REST (founder 2026-08-30).
           *
           * The clock above starts when the SET WAS LOGGED, not when it ended — so an athlete who
           * forgets to log, stands for four minutes and then presses on is recording his thumb, not
           * his pace. `isRestSample` owns the whole argument and the number; here it decides only
           * what is BANKED for the next set, which is what every engine reader downstream sees.
           *
           * ⚠️ ABSENT, NOT ZERO, and that distinction is L3 itself: nothing reads this as a small
           * rest, everything reads it as a rest that is not known. The telemetry line above is
           * deliberately UNGATED — the product still wants to know he skipped, and how often.
           */
          const tookS = Math.max(0, Math.round(restMs / 1000));
          pendingRestSRef.current = isRestSample(tookS) ? tookS : null;
          restStartedAtRef.current = null;
        }
        restExtraSecondsRef.current = 0;
        setRestResumeRemainingS(null); // the resumed-rest anchor is spent
        dispatch({ type: 'MACHINE', machine: sessionReducer(machine, { type: 'REST_ELAPSED' }) });
      },
      extendRest(seconds: number) {
        if (restStartedAtRef.current == null) return; // only while resting
        // Defence in depth (the watch protocol already sieves this): a non-finite or non-positive
        // extension would poison the rest anchor — and a NaN end instant is the one value that can
        // make the mirror's ISO conversion throw, inside the publish effect, mid-workout.
        if (!Number.isFinite(seconds) || seconds <= 0) return;
        restExtraSecondsRef.current += seconds;
        void track('rest_extended', { sessionId: sessionRef.current?.id, seconds });
        setRestNonce((n) => n + 1); // re-run the mirror effect → republish the longer rest
      },
      pause() {
        pauseStartedAtRef.current = Date.now();
        void track('pause', { sessionId: sessionRef.current?.id, phase: machine.phase });
        dispatch({ type: 'MACHINE', machine: sessionReducer(machine, { type: 'PAUSE' }) });
      },
      resume() {
        if (pauseStartedAtRef.current != null) {
          const pausedMs = Math.max(0, Date.now() - pauseStartedAtRef.current);
          /**
           * THE REST DOES NOT RUN WHILE THE WORKOUT IS FROZEN — ON EVERY SURFACE.
           *
           * A paused workout is frozen (§7.2), and the phone's own Rest screen honours that: it
           * holds its countdown at the pause instant and re-anchors from the frozen remaining when
           * the athlete comes back. But the MIRROR does not read that screen — it derives the rest
           * end from `restStartedAtMs`, and nobody was moving it. So the rest kept burning through
           * the pause for everyone ELSE: pause for five minutes mid-rest and the wrist (and the
           * Live Activity) would say READY while the phone still showed 45 seconds — and worse, the
           * watch's own GO haptic would fire against a rest the phone had not finished. Two clocks,
           * one workout.
           *
           * Push the anchor forward by exactly the time the workout stood still. The rest resumes
           * where it was, and the phone, the wrist and the Lock Screen agree to the second.
           */
          restStartedAtRef.current = unfrozenRestAnchor(
            restStartedAtRef.current,
            pauseStartedAtRef.current,
            Date.now(),
          );
          void track('resume', { sessionId: sessionRef.current?.id, pausedMs });
          pauseStartedAtRef.current = null;
        }
        dispatch({ type: 'MACHINE', machine: sessionReducer(machine, { type: 'RESUME' }) });
      },
      async finishEarly(): Promise<CompleteResult> {
        const m = sessionReducer(machine, { type: 'FINISH_EARLY' });
        dispatch({ type: 'MACHINE', machine: m });
        return finalize(true);
      },
      amendSet(exerciseId, setIndex, v) {
        const session = sessionRef.current;
        if (!session) return;
        // The block she is in — `currentBlockSetsOf`, the same scope the stage's set row and the
        // amend sheet read (a lift split across two blocks shares its set indices).
        const was = currentBlockSetsOf(session.sets, exerciseId).find((s) => s.setIndex === setIndex);
        if (!was) return;
        const stamped = amendRow(session, { persistedAt: was.persistedAt, weight: v.weight, reps: v.reps, at: new Date().toISOString() });
        if (stamped === session) return;
        sessionRef.current = stamped;
        void db.saveActiveSession(stamped).catch(() => {});
        dispatch({ type: 'SESSION', session: stamped });
        // The load she says she lifted carries onto the lift's remaining sets — her decision,
        // propagated (`carryWeightForward`), exactly as a tapped set's does.
        const at = plan.findIndex((st) => st.exerciseId === exerciseId && st.exerciseSetIndex === setIndex);
        if (at >= 0 && v.weight != null) {
          const carried = carryWeightForward(plan, plan[at].globalIndex, v.weight);
          if (carried !== plan) dispatch({ type: 'SWAP_PLAN', plan: carried as Step[] });
        }
        void track('set_amended', {
          sessionId: session.id,
          exerciseId,
          setIndex,
          reps: v.reps,
          weight: v.weight,
        });
      },
      previewTargetFor(exerciseId: string) {
        return (
          state.targets.find((tg) => tg.exerciseId === exerciseId && tg.setIndex === 0) ??
          state.targets.find((tg) => tg.exerciseId === exerciseId) ??
          null
        );
      },
      editCurrentSet({ weight, reps }) {
        const idx = machine.setIndex;
        const cur = plan[idx];
        if (!cur) return;
        // Update only the current step's target + flag it edited. No log, no advance —
        // Active Set re-renders with the new values; Complete Set logs them (as edited).
        // Editing a set means editing a weight and a rep count. A step that has neither is not
        // editable through this door, and it has no wheel on screen to open it with.
        if (!cur.target) return;
        const newPlan = plan.map((st, i) =>
          i === idx && st.target
            ? {
                ...st,
                edited: true,
                target: { ...st.target, recommendedWeight: weight, recommendedReps: reps },
              }
            : st,
        );
        dispatch({ type: 'SWAP_PLAN', plan: newPlan });
      },

      // ════ The voice coach's verbs (spec §3.2 / §3.4 / §4) ════
      setLiftLoad(weightKg) {
        const idx = machine.setIndex;
        const cur = plan[idx];
        if (!cur || !cur.target) return;
        // Every later set of the lift follows (`carryWeightForward`, exactly as a lifted weight
        // does); the set on stage is written here, edited, exactly as the wheel writes it.
        const carried = carryWeightForward(plan, cur.globalIndex, weightKg) as Step[];
        // On a rest the machine still sits on the COMPLETED step, whose row is written: only a set
        // still on stage takes the new load itself; a written one is left as it was lifted.
        const onStage = machine.phase === 'SET_PRESENTED';
        const newPlan = carried.map((st, i) =>
          onStage && i === idx && st.target ? { ...st, edited: true, target: { ...st.target, recommendedWeight: weightKg } } : st,
        );
        dispatch({ type: 'SWAP_PLAN', plan: newPlan });
      },
      markSetStarted() {
        const cur = plan[machine.setIndex];
        if (!cur || machine.phase !== 'SET_PRESENTED') return;
        // Her word, at this instant: the stamp is hers (no clock mark), and the arming effect
        // re-arms the pocket from it — `armedForRef` is cleared so the same set is armed again.
        setPresentedAtRef.current = { key: stepKey(cur), atMs: clockNow() };
        armedForRef.current = null;
        setStartedNonce((n) => n + 1);
        // "מוכן" from any channel closes the loading dialogue: the card's Ready button goes, and
        // the conductor reads the flag's fall as the start signal.
        setAwaitingReadyState(false);
      },
      setAwaitingReady(on) {
        setAwaitingReadyState(on);
      },
      awaitingReady: awaitingReady && machine.phase === 'SET_PRESENTED',
      reviseToday(edits) {
        /*
         * ⛔ FROM THE STEP SHE IS ON, NEVER BEHIND IT. A logged set is a fact about her body; no
         * answer from a model may rewrite one. `applyLiveEdit` enforces the same boundary, and this
         * is where the boundary's VALUE comes from.
         */
        const from = machine.setIndex;
        let next = plan;
        let landed = 0;
        for (const edit of edits) {
          const before = next;
          if (edit.do === 'swap') {
            // The store owns the target table, so the swap adopts the NEW lift's own prescription
            // rather than carrying a bench load onto a machine pin — the rule `retargetPlanForSwap`
            // exists for, and the reason this one verb is not in `applyLiveEdit`.
            const at = next.findIndex((st, i) => i >= from && st.exerciseId === edit.ex);
            if (at >= 0 && !alreadyInPlan(next, edit.to)) {
              next = retargetPlanForSwap(next, state.targets, at, edit.to);
            }
          } else if (edit.do === 'defer') {
            const at = next.findIndex((st, i) => i >= from && st.exerciseId === edit.ex);
            if (at >= 0) next = deferCurrentExercise(next, at);
          } else {
            next = applyLiveEdits(next, from, [edit]);
          }
          if (next !== before) landed += 1;
        }
        if (landed === 0) return 0;
        void track('coach_revised_today', { sessionId: sessionRef.current?.id, edits: edits.length, landed });
        dispatch({ type: 'SWAP_PLAN', plan: next });
        return landed;
      },
      swapNextExercise(exerciseId) {
        const startIdx = machine.setIndex + 1; // the upcoming exercise
        if (!plan[startIdx]) return;
        if (alreadyInPlan(plan, exerciseId)) return; // never duplicate a lift already in the session
        dispatch({ type: 'SWAP_PLAN', plan: retargetPlanForSwap(plan, state.targets, startIdx, exerciseId) });
      },
      swapCurrentExercise(exerciseId) {
        const startIdx = machine.setIndex; // the current exercise
        if (!plan[startIdx]) return;
        if (alreadyInPlan(plan, exerciseId)) return; // never duplicate a lift already in the session
        dispatch({ type: 'SWAP_PLAN', plan: retargetPlanForSwap(plan, state.targets, startIdx, exerciseId) });
      },
      startExerciseNow(exerciseId) {
        /*
         * The board's verb (2026-09-07): the lift she tapped becomes the next thing, from a live set
         * or from a rest. From a rest the rest is cut — `endRest` banks it as it always would — and
         * the cursor lands on the lift's first set; from a live set the step under the cursor is
         * simply replaced, and the machine's "last set" flag follows the new plan.
         */
        const boundary = reorderBoundary(machine);
        /*
         * ════ x SETS, NOT y (founder, 2026-09-09) ════ The lift she is leaving — the run at the
         * boundary — has this many WORKING sets logged in the block she is in. Two or more and the
         * walk is a decision: its remainder waits at the end of the order (`bringForward`). One is
         * an interruption (a taken bench): the remainder returns right after the new lift, as before.
         */
        const leaving = plan[boundary];
        const done = leaving && leaving.exerciseId !== exerciseId ? currentBlockSetsOf(sessionRef.current?.sets, leaving.exerciseId).length : 0;
        const remainderToEnd = done >= 2;
        const newPlan = bringForward(plan, boundary, exerciseId, { remainderToEnd });
        if (newPlan === plan) return;
        void track('exercise_started_now', {
          sessionId: sessionRef.current?.id,
          exerciseId,
          from: plan[machine.setIndex]?.exerciseId ?? null,
          midLift: plan[machine.setIndex]?.exerciseSetIndex !== 0 || machine.phase !== 'SET_PRESENTED',
          remainderToEnd,
        });
        dispatch({ type: 'SWAP_PLAN', plan: newPlan });
        if (machine.phase === 'SET_PRESENTED') {
          dispatch({ type: 'MACHINE', machine: { ...machine, isLastSetOfSession: newPlan[machine.setIndex]?.lastSetOfSession ?? false } });
        } else if (machine.phase !== 'PAUSED') {
          view.endRest();
        }
      },
      markEquipmentOccupied() {
        /*
         * ⛔ AT ANY SET, NOT ONLY THE FIRST (2026-09-07 — the board). A station is taken when it is
         * taken; the lift's REMAINING sets go one run later, its logged sets stay where they are,
         * and she comes back to "set 3 of 4". `bringForward` of the next lift is exactly that move.
         */
        const cur = plan[machine.setIndex];
        if (!cur) return;
        const boundary = reorderBoundary(machine);
        const nextLift = aheadExercisesFrom(plan, boundary)[0];
        if (!nextLift) return; // already last — nothing to move past
        const newPlan = bringForward(plan, boundary, nextLift);
        if (newPlan === plan) return;
        void track('equipment_occupied', { sessionId: sessionRef.current?.id, exerciseId: cur.exerciseId, setIndex: cur.exerciseSetIndex });
        dispatch({ type: 'SWAP_PLAN', plan: newPlan });
        if (machine.phase === 'SET_PRESENTED') {
          dispatch({ type: 'MACHINE', machine: { ...machine, isLastSetOfSession: newPlan[machine.setIndex]?.lastSetOfSession ?? false } });
        } else if (machine.phase !== 'PAUSED') {
          view.endRest();
        }
        // Backend records the busy event + reorders the (planned) session blocks (best-effort;
        // the local plan reorder above already moved it for this live session).
        if (cur.target?.blockId) {
          void app.model.markEquipmentOccupied({ blockId: cur.target.blockId }).catch(() => {});
        }
      },
      reorderAhead(exerciseId, toPosition) {
        const newPlan = reorderAheadOf(plan, reorderBoundary(machine), exerciseId, toPosition);
        if (newPlan === plan) return;
        void track('session_reordered', { sessionId: sessionRef.current?.id, exerciseId, to: toPosition });
        dispatch({ type: 'SWAP_PLAN', plan: newPlan });
      },

    };
    // restNonce: `restExtraSeconds` is read from a ref, so a "+15 sec" (from either surface)
    // must re-memo the view or the phone's Rest screen would never see the rest grow.
  }, [state, app, endResult, correction, restResumeRemainingS, restNonce, watchLoggedSet, setRunningLong, applyLockIntents, awaitingReady]);

  // Map watch intents → the same view actions a tap fires. A watch Complete Set
  // accepts the recommended target (no override) — editing stays phone-only.
  viewRef.current = view;
  /*
   * ⛔ THE WRIST KEEPS ITS OWN TIME — CATCH THE CLOCK UP BEFORE JUDGING WHAT IT SAYS (2026-09-07).
   * A phone that slept in a pocket is behind the wall clock; a tap that lands on its stale machine
   * would be judged against a rest the clock should already have served out. So every wrist action
   * first runs the clock forward and then acts on the view AFTER it — never the one this render
   * closed over. `applyClock` is latched, so a tap and a tick cannot write over each other.
   */
  const afterClock = (act: (v: SessionView) => void) => async () => {
    await applyClockRef.current(Date.now());
    const v = viewRef.current;
    if (v) act(v);
  };
  watchActionsRef.current = {
    REST_ELAPSED: afterClock((v) => v.endRest()),
    PAUSE: afterClock((v) => v.pause()),
    RESUME: afterClock((v) => v.resume()),
    FINISH_EARLY: afterClock((v) => void v.finishEarly()),
  };
  // Set completion from the watch. Reported weight/reps (from the watch Edit Result)
  // become an edited actual; each falls back to the recommended target when the watch
  // didn't adjust it. Processed identically to an on-phone entry — phone is the truth.
  watchCompleteRef.current = (actualReps, actualWeight) => {
    const tgt = view.currentTarget;
    // What the phone is about to write — captured HERE, before the machine advances and the
    // current step becomes the next one. This is what the phone's stage prints on its "Set
    // logged" beat, so the wrist and the screen read back the same numbers.
    const weight = actualWeight !== undefined ? actualWeight : tgt?.recommendedWeight ?? null;
    const reps = actualReps ?? tgt?.recommendedReps ?? 0;
    if (view.setLabel) {
      setWatchLoggedSet({
        weight,
        reps,
        n: view.setLabel.n,
        m: view.setLabel.m,
        seq: ++watchLogSeqRef.current,
        // Same capture, same instant, same reason as `weight` and `reps` above — see `WatchLoggedSet`.
        ...(bandOf(tgt) ? { band: bandOf(tgt)! } : {}),
        ...(tgt?.exerciseId ? { lift: tgt.exerciseId } : {}),
        // The record answers identically on either device (never on a warm-up bridge).
        ...(!view.setLabel.warmup && isRecordSet(weight, reps, view.priorPeakKg) ? { record: true } : {}),
      });
    }
    if (actualReps == null && actualWeight === undefined) {
      void view.completeSet(); // nothing adjusted → log the prescribed target
      return;
    }
    void view.completeSet({ weight, reps });
  };
  // Exercise Busy → the same equipment-occupied reorder a phone tap performs.
  watchBusyRef.current = () => view.markEquipmentOccupied();
  // "+15 sec" from the watch → extend the running rest (re-publishes to every surface).
  watchAddRestRef.current = (seconds) => view.extendRest(seconds);
  // Swap from the watch → the same swap a phone tap performs, routed by live phase
  // (Active Set swaps the current exercise; Transition rest swaps the next).
  watchSwapRef.current = (exerciseId) => {
    if (!exerciseId) return;
    if (view.displayPhase === 'REST_TRANSITION') view.swapNextExercise(exerciseId);
    else view.swapCurrentExercise(exerciseId);
  };
  // WT14 → the SAME pain report a phone tap makes (§13.2), from the wrist's word. The wrist names a
  // joint and the map knows only muscles, so `musclesForWristArea` joins the two vocabularies; an
  // area it does not know rests NOTHING (the engine never rests a muscle she did not name). The
  // severity is the mildest of the three, because the wrist never asked her (WRIST_REPORT_SEVERITY).
  watchPainRef.current = (area, severity) => {
    const sharpness = asPainSeverity(severity);
    if (!sharpness) return; // she never answered — the engine may not choose a window for her
    for (const muscle of musclesForWristArea(area)) void app.reportPain(muscle, sharpness);
  };
  // The live handover, straight to the store's own action — no translation layer, because there is
  // nothing to translate: the wrist is handing over a session, not proposing one.
  watchAdoptRef.current = (local) => view.adoptLocalSession(local);

  return <Ctx.Provider value={view}>{children}</Ctx.Provider>;
}

export function useSession(): SessionView {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used within SessionProvider');
  return v;
}
