/**
 * Live session engine. Drives the Session Flow via the session-state machine
 * (spec §6.3), persists per-set actuals at each Complete Set (§8.4), and honors
 * the invariant save order: Last Set -> SESSION_SAVED -> Well Done -> Home.
 *
 * Rest is Hush-owned and not user-adjustable (UX §10.8); these are the fixed
 * defaults. "Ready" (endRest) is the only rest agency.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { EffortLevel, ProgramDay, Session, SessionSummary, SetLog, SetTarget } from '@/data/local/models';
import { exerciseById, catalogIdFromEngine, muscleOf, type Exercise } from '@/data/exercises';
import { swapCandidates, isSwapMoment } from '@/domain/swapPool';
import { foldSessionSwaps, learnedLeaveIts } from '@/domain/swapLearning';
import { db } from '@/data/local/db';
import { recordEffort } from '@/domain/effort';
import { liveActivity } from '@/platform/liveActivity';
import { projectSessionMirror, type MirrorStep, type MirrorMilestone } from '@/platform/sessionMirror';
import { newlyEarned } from '@/domain/milestones';
import { milestoneCopy, type Translate } from '@/domain/milestoneCopy';
import { i18n } from '@/i18n';
import { loadSetup } from '@/domain/loadPresentation';
import { prescribedSets, sessionTrained } from '@/domain/completion';
import { WatchSession } from '@/platform/watch/watchBridge';
import { isCardioRecordPayload, type WatchLobby, type WatchPlanSnapshot } from '@/platform/watch/protocol';
import { applyWatchCardioRecord, applyWatchSessionRecord } from '@/platform/watch/watchReconcile';
import { watchTransport } from '@/platform/watch/watchTransportNative';
import {
  initialSessionMachine,
  sessionReducer,
  type SessionEvent,
  type SessionMachine,
} from '@/state/machines/sessionState';
import { reconcileResume, salvageOrphanSession, RESUME_WINDOW_MS, type SalvageResult } from '@/state/sessionRecovery';
import { HttpError } from '@/data/api/httpErrors';
import { track, trackFirst } from '@/platform/telemetry';
import { applyLoop1, carryWeightForward } from '@/engine/v5/liveSession';
import { recordStructuralChangeV5, observedLoads, railCeilingFor } from '@/engine/v5/v5Engine';
import { refreshLearnedRests, restInterSecondsFor, restIsLearnedFor, restTransitionSeconds } from '@/domain/restPrescription';
import { musclesForWristArea, asPainSeverity } from '@/domain/painReport';
import { sessionKcal } from '@/domain/energy';
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
export { REST_COMPOUND_S, REST_ISOLATION_S, REST_TRANSITION_S, REST_INTER_S, refreshLearnedRests, restInterSecondsFor, restTransitionSeconds } from '@/domain/restPrescription';


export interface Step {
  exerciseId: string;
  globalIndex: number;
  exerciseSetIndex: number; // 0-based within the exercise
  totalSetsInExercise: number;
  target: SetTarget;
  lastSetOfExercise: boolean;
  lastSetOfSession: boolean;
  edited?: boolean; // the athlete adjusted this set via Edit Result (logged as an override)
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
  | { type: 'MACHINE'; machine: SessionMachine }
  | { type: 'EFFORT'; session: Session }
  | { type: 'SWAP_PLAN'; plan: Step[] }
  | { type: 'END' };

function reducer(s: InternalState, a: Action): InternalState {
  switch (a.type) {
    case 'START':
      return { plan: a.plan, session: a.session, machine: a.machine, targets: a.targets ?? [] };
    case 'LOG':
      return { ...s, session: a.session, machine: a.machine };
    case 'MACHINE':
      return { ...s, machine: a.machine };
    case 'EFFORT':
      // Her answer changes the RECORD and nothing else — no phase moves, no target changes. The
      // beat that asked has its own release; this must not be able to steer the workout.
      return { ...s, session: a.session };
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
      ? { ...st, exerciseId: newId, target: targetFor(st.exerciseSetIndex) ?? { ...st.target, exerciseId: newId } }
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
  currentTarget: SetTarget | null;
  /** Raw id of the upcoming exercise (rest only) — readable-name fallback (§7.9). */
  nextExerciseId: string | null;
  setLabel: { n: number; m: number } | null; // set n of m within the exercise
  globalProgress: { index: number; total: number } | null;
  /** Exercise ordinal among the session's distinct exercises ("Exercise n / N"). */
  exerciseProgress: { index: number; total: number } | null;
  nextExercise: Exercise | null; // for Rest preview (upcoming set/exercise)
  nextTarget: SetTarget | null;
  /** Upcoming set's "n of m" label (the set the rest leads into) — §4.11/§4.12. */
  nextSetLabel: { n: number; m: number } | null;
  restSeconds: number;
  /** Seconds added to the CURRENT rest by "+15 sec", from EITHER surface. The phone's Rest
   *  countdown reads this and fills forward by the delta — which is how a watch +15 reaches the
   *  phone (its countdown is local, and nothing used to tell it the rest had grown). */
  restExtraSeconds: number;
  /** The last set the WATCH logged — the phone plays its "Set logged" beat over it. */
  watchLoggedSet: WatchLoggedSet | null;
  /** Epoch ms the active session started (drives the session elapsed-time label on the mirror). */
  startedAtMs: number | null;
  // actions
  start: (day: ProgramDay, targets: SetTarget[]) => Promise<void>;
  /** An interrupted (app-killed) workout that can still be picked up, or null. Home reads
   *  this on focus to offer "Continue {workout}" as the primary CTA (S3). */
  loadResumable: () => Promise<{ workoutName: string } | null>;
  /** Rebuild the interrupted session exactly where it was (logged sets kept, wall-clock
   *  rest caught up). False when nothing usable remains — the caller falls back to Begin. */
  resumeSaved: () => Promise<boolean>;
  completeSet: (override?: { weight: number | null; reps: number }) => Promise<CompleteResult>;
  /** Edit Result: update the CURRENT set's weight/reps in place (re-renders Active
   *  Set). Does NOT log — Complete Set remains the sole confirmer (§4.13 / founder). */
  editCurrentSet: (v: { weight: number | null; reps: number }) => void;
  endRest: () => void;
  /** Extend the running rest by N seconds ("+15 sec"). Re-publishes the longer rest
   *  to the watch + Live Activity; the phone's own rest UI also reflects it. */
  extendRest: (seconds: number) => void;
  pause: () => void;
  /**
   * Her answer to "how did that go?" for the exercise that just ended (`EffortLevel`).
   *
   * Idempotent per exercise: a second answer REPLACES the first rather than appending, so a
   * re-entered beat (a resumed session, a double tap) cannot log the same lift twice. Writes the
   * record and returns; it never moves the workout on — the beat that asked owns its own release,
   * because a control that both answers and advances is a control that cannot be corrected.
   */
  reportEffort: (exerciseId: string, level: EffortLevel) => void;
  resume: () => void;
  finishEarly: () => Promise<CompleteResult>;
  /** Mid-session "choose another": swap the UPCOMING exercise in place (situational,
   *  not persisted — §7.3). Capability is preserved (Replacement stays in-class). */
  swapNextExercise: (exerciseId: string) => void;
  /** Swap the CURRENT exercise in place (situational, not persisted). Only meaningful
   *  before any of its sets are logged; capability/load progression are preserved. */
  swapCurrentExercise: (exerciseId: string) => void;
  /** Equipment Occupied (V1): move the current exercise one position later in the workout
   *  (no replacement, no structure change). Only available at the start of an exercise. */
  markEquipmentOccupied: () => void;
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

/** Wall-clock ms from a saved session's start to its last logged set — the same span every other
 *  surface prices its calories over. */
function sessionDurationMs(s: Session): number {
  const start = Date.parse(s.startedAt);
  let end = start;
  for (const l of s.sets) if (l.persistedAt) end = Math.max(end, Date.parse(l.persistedAt));
  return Math.max(0, end - start);
}

function buildPlan(day: ProgramDay, targets: SetTarget[]): Step[] {
  const find = (exerciseId: string, setIndex: number): SetTarget => {
    const t = targets.find((x) => x.exerciseId === exerciseId && x.setIndex === setIndex);
    // Data gap (§7.9): never render "—"; fall back to a neutral target if missing.
    return t ?? { exerciseId, setIndex, recommendedWeight: null, recommendedReps: 8 };
  };
  const steps: Step[] = [];
  let global = 0;
  const totalSlots = day.slots.length;
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
export function buildMirrorSteps(plan: Step[]): MirrorStep[] {
  // THE session's lifts — every one of them, computed ONCE for the whole plan. The watch's swap
  // options are chosen against this list (founder 2026-07-12).
  //
  // This is the bug the founder caught. The phone's quick swap excluded the session's other lifts;
  // the watch's did not, because it called a different pool with no exclusion at all. So an
  // athlete who had squatted, then reached the leg press and pressed Swap ON THE WRIST, was offered
  // a Barbell Back Squat. Both surfaces now ask the SAME function, and the exclusion is not an
  // optional argument anybody can forget.
  const sessionExerciseIds = [...new Set(plan.map((st) => st.exerciseId))];
  return plan.map((st) => {
    const ex = exerciseById(st.exerciseId);
    // WHEN the verb is offered is a law, not a local opinion — `isSwapMoment` owns it, and the
    // phone's stage asks the same function. This used to be a bare `=== 0` here and a different
    // hard-coded rule on the stage, which is exactly how the two surfaces came to disagree.
    const swapOptions =
      ex && isSwapMoment(st.exerciseSetIndex)
        ? swapCandidates(ex.id, { sessionExerciseIds })
            .slice(0, 2)
            .map((e) => ({ id: e.id, name: e.name }))
        : [];
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
  const curLoad = cur.target.recommendedWeight;
  if (curLoad == null) return false; // bodyweight — no loading action
  let loaded: number | null | undefined;
  for (const s of sets) if (s.exerciseId === cur.exerciseId) loaded = s.actualWeight;
  if (loaded === undefined) return true; // no set of this exercise logged yet → must load
  return loaded !== curLoad; // load changed since last loaded → re-load
}

/** Distinct lifts the athlete actually trained (logged ≥1 set) AND that the model raised — the
 *  truthful "lifts up" for the Complete summary (an early finish must not count untrained lifts). */
function progressedLiftCount(plan: Step[], sets: SetLog[]): number {
  const trained = new Set(sets.map((s) => s.exerciseId));
  return new Set(
    plan
      .filter((s) => s.target.reasonType === 'increase' && trained.has(s.exerciseId))
      .map((s) => s.exerciseId),
  ).size;
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
          appendCardioActivity: (a) => db.appendCardioActivity(a),
          track: (type, data) => void track(type, data),
          ack: (id) => watchTransport.ackRecord(id),
        });
        return;
      }
      void applyWatchSessionRecord(raw, {
        loadHistory: () => db.loadHistory(),
        appendCompletedSession: (s) => db.appendCompletedSession(s),
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
   * Engine v5 · Stage 2 (Loop 1): corrections applied to the CURRENT exercise this session, capped
   * at 2 (S-13). Reset when a new exercise begins. Keyed by exerciseId so a swap/rotation restarts
   * the count cleanly.
   */
  const loop1Ref = useRef<{ exerciseId: string; count: number }>({ exerciseId: '', count: 0 });
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
    });
  }

  // Mirror session state to BOTH the Live Activity / Dynamic Island / Lock Screen
  // AND the Apple Watch — from ONE canonical projection (§8.5; no duplicate state).
  // READ-ONLY, timer is the hero, no completion controls from outside the app.
  useEffect(() => {
    const { plan, machine } = state;
    const loggedSets = state.session?.sets ?? [];
    const mirror = projectSessionMirror({
      steps: buildMirrorSteps(plan),
      total: plan.length,
      machine,
      // Per-tier: the mirror's REST_INTER duration belongs to the CURRENT exercise.
      restInterS: restInterSecondsFor(plan[machine.setIndex]?.exerciseId),
      // WT5 — whether that number is HER median or the tier bootstrap. The wrist says "your pace"
      // only when it is hers; a claim on a lift she has never rested through would be false.
      restIsLearned: restIsLearnedFor(plan[machine.setIndex]?.exerciseId),
      restTransitionS: restTransitionSeconds(), // S-17 — her learned transition, one registry
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
        })
        .catch(() => {});
    }

    // The Live Activity renders its subset; it ends on no-session / complete.
    if (!mirror || mirror.phase === 'complete') {
      if (laStartedRef.current) {
        laStartedRef.current = false;
        void liveActivity.end();
        void track(LIVE_ACTIVITY_EVENTS.ended);
      }
      return;
    }
    if (!laStartedRef.current) {
      laStartedRef.current = true;
      void track(LIVE_ACTIVITY_EVENTS.started);
      void liveActivity.start(mirror).catch(() => void track(LIVE_ACTIVITY_EVENTS.failed, { op: 'start' }));
    } else {
      void liveActivity.update(mirror).catch(() => void track(LIVE_ACTIVITY_EVENTS.failed, { op: 'update' }));
    }
    // restNonce: re-publish when "+15 sec" extended the current rest (ref change alone
    // would not re-run this effect).
  }, [state, restNonce]);

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
    const restSeconds =
      restResumeRemainingS ?? (displayPhase === 'REST_INTER' ? restInterSecondsFor(current?.exerciseId) : restTransitionSeconds());

    async function finalize(earlyFinish: boolean): Promise<CompleteResult> {
      const session = sessionRef.current;
      if (!session) return { ended: true, unlockedPortrait: false };

      // NOT STARTED (UX item 3A): the athlete entered the workout and left without completing a
      // single set. This is NOT a workout — it is never saved to history, never counted toward
      // calibration, and never marks the day done. Just clear the orphan session and exit.
      if (session.sets.length === 0) {
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
      const trained = sessionTrained(session, programDay);

      // Owner-voice annotation only when Hush acted or the athlete ended early
      // (§4.10). Early-finish takes precedence; otherwise an increase this session.
      const increasedStep = plan.find((s) => s.target.reasonType === 'increase');
      const saved: Session = {
        ...session,
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
          // S-45: a newly ADOPTED learned swap (S-69) is a Hush decision — let the Saturday mirror name
          // it. The adoption is the key whose standing substitute just changed.
          for (const k of Object.keys(next.substitutes))
            if (next.substitutes[k] !== prev[k])
              await recordStructuralChangeV5(k, next.substitutes[k], 'swap').catch(() => {});
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
        steps: buildMirrorSteps(plan),
        total: plan.length,
        machine: { ...machine, phase: 'SESSION_SAVED' },
        restInterS: restInterSecondsFor(plan[machine.setIndex]?.exerciseId),
        restTransitionS: restTransitionSeconds(),
        restStartedAtMs: null,
        nowMs: Date.now(),
        workoutName: saved.programDayName ?? '',
        sessionStartedAtMs: Date.parse(saved.startedAt),
        completedSets: saved.sets.length,
        loggedSets: saved.sets.map((s) => ({ weight: s.actualWeight ?? null, reps: s.actualReps })),
        progressedLifts: progressedLiftCount(plan, saved.sets),
        // ONE NUMBER PER WORKOUT — the phone is the authority here, so the phone's figure crosses
        // to the wrist and the wrist stops printing its own HealthKit reading beside it.
        kcal: sessionKcal(saved, sessionDurationMs(saved), app.profile?.weightKg),
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
      const progressed = new Set(
        plan.filter((s) => s.target.reasonType === 'increase').map((s) => s.exerciseId),
      ).size;
      const summary: SessionSummary = {
        workoutName: saved.programDayName ?? exerciseById(plan[0]?.exerciseId ?? '')?.name ?? '',
        sets: saved.sets.length,
        progressed,
        durationMs: Math.max(0, Date.now() - Date.parse(saved.startedAt)),
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
      active: plan.length > 0 && machine.phase !== 'SESSION_SAVED' && machine.phase !== 'WELL_DONE',
      phase: machine.phase,
      displayPhase,
      paused,
      currentExercise: current ? exerciseById(current.exerciseId) ?? null : null,
      currentExerciseId: current?.exerciseId ?? null,
      sessionExerciseIds: [...new Set(plan.map((s) => s.exerciseId))],
      currentTarget: current?.target ?? null,
      setLabel: current ? { n: current.exerciseSetIndex + 1, m: current.totalSetsInExercise } : null,
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
      nextSetLabel: resting && next ? { n: next.exerciseSetIndex + 1, m: next.totalSetsInExercise } : null,
      restSeconds,
      restExtraSeconds: restExtraSecondsRef.current,
      watchLoggedSet,
      startedAtMs: state.session ? Date.parse(state.session.startedAt) : null,
      // Equipment Occupied applies at the START of an exercise that has a later exercise to do.
      canMarkOccupied:
        displayPhase === 'SET_PRESENTED' &&
        !!current &&
        current.exerciseSetIndex === 0 &&
        plan.some((s) => s.globalIndex > current.globalIndex && s.exerciseId !== current.exerciseId),
      toLoad: current ? isToLoad(plan, machine.setIndex, state.session?.sets ?? []) : false,

      publishWatchLobby(lobby, watchPlan) {
        // An active session drives the watch via the mirror; never overwrite it.
        const sessionActive =
          plan.length > 0 && machine.phase !== 'SESSION_SAVED' && machine.phase !== 'WELL_DONE';
        if (sessionActive) return;
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

      async start(day, targets) {
        // The athlete chose a FRESH workout while an interrupted one was still resumable
        // (or a stale orphan lingered): salvage its logged work first, then compose cleanly.
        await creditSalvage(await salvageOrphanSession());
        setRestResumeRemainingS(null);
        // A rest banked by the PREVIOUS session must never be stamped onto this one's first set —
        // the athlete's "rest" between two workouts is not a rest (L3). The first set of a session
        // has no rest before it, and that is the honest answer.
        restStartedAtRef.current = null;
        pendingRestSRef.current = null;
        loop1Ref.current = { exerciseId: '', count: 0 }; // Loop 1 correction budget resets per session
        historyRef.current = await db.loadHistory().catch(() => []); // her learned grid for live Loop 1
        refreshLearnedRests(historyRef.current); // …and her learned REST timer (S-17)
        const plan2 = buildPlan(day, targets);
        const session: Session = {
          id: `sess_${Date.now()}`,
          programDayId: day.id,
          programDayName: day.name, // captured now so History stays stable across regenerations
          startedAt: new Date().toISOString(),
          state: 'ACTIVE',
          earlyFinish: false,
          sets: [],
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
            (kind, exerciseId) => (kind === 'inter' ? restInterSecondsFor(exerciseId) : restTransitionSeconds()),
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
          pauseStartedAtRef.current = null;
          setRestResumeRemainingS(r.restRemainingS);
          dispatch({ type: 'START', plan: resumePlan, session: active, machine: r.machine });
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

      async completeSet(override): Promise<CompleteResult> {
        const session = sessionRef.current;
        if (!current || !session) return { ended: false, unlockedPortrait: false };
        // Race guard: a Pause may have landed after the 400ms success timer was
        // scheduled. A paused session never logs a set — the workout is frozen
        // (§7.2). The set logs on Resume → Complete Set, not behind the overlay.
        if (machineRef.current.phase === 'PAUSED') return { ended: false, unlockedPortrait: false };
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
        if (hasLoggedStep(session.sets, current.exerciseId, current.exerciseSetIndex)) {
          return { ended: false, unlockedPortrait: false };
        }
        completingRef.current = true;
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
          // No approach mark is ever written (Rev 8 removed the approach set entirely); the legacy
          // `SetLog.isApproach` field survives only on already-logged Build-#33 sets.
          persistedAt: new Date().toISOString(),
          // The rest that preceded THIS set (L3). Undefined on the session's first set — there
          // was none — and after a kill that landed mid-transition; undefined means unknown, and
          // the engine excludes such a set from every rest comparison rather than reading it as 0.
          ...(pendingRestSRef.current != null ? { restBeforeS: pendingRestSRef.current } : {}),
        };
        pendingRestSRef.current = null; // spent — one rest belongs to exactly one set
        const updated: Session = { ...session, sets: [...session.sets, setLog] };
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
        });
        if (setLog.edited) void trackFirst('first_override');

        const restSecondsForThis = current.lastSetOfExercise ? restTransitionSeconds() : restInterSecondsFor(current.exerciseId);
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
        // Every set is a working set (no approach set — founder ruling 2026-07-16), so this acts from set 1.
        if (loop1Ref.current.exerciseId !== current.exerciseId) loop1Ref.current = { exerciseId: current.exerciseId, count: 0 };
        // Her learned real grid for this lift = the loads she has performed on it, across her history AND
        // this session so far (including the set just logged), so a correction snaps to a weight that
        // exists at her gym rather than the equipment default increment.
        const seen = [updated, ...historyRef.current];
        const grid = observedLoads(current.exerciseId, seen);
        // L11 — the rail, live: a mid-session RAISE may never go more than one rung past the heaviest
        // load she has completed at Tlo (her settled history plus this session). S-11 says "always
        // inside the rail" and S-14 calls it absolute; until now only Loop 2 honoured it, so one wild
        // rep count could put a load on the bar she has never come near. Null on a lift with no such
        // set — the rail is inactive there by definition (S-49), and her own eyes are the guard.
        const rail = railCeilingFor(current.exerciseId, current.target.repBandLo ?? current.target.recommendedReps, seen);
        const carried = carryWeightForward(plan, current.globalIndex, setLog.actualWeight);
        const l1 = applyLoop1(carried, current.globalIndex, setLog.actualWeight, setLog.actualReps, loop1Ref.current.count, grid, rail);
        // THE SIGNATURE MOMENT — set (or cleared) on EVERY logged set, so it always belongs to the
        // set just finished. Until 2026-07-17 the only thing that happened here was the `track`
        // call below: the correction went to analytics and the plan changed underneath her. The set
        // she just did moved the next one — the most distinctive thing this product does — and she
        // had no way to know it had happened, or why.
        //
        // The `else` is not tidiness: without it, a correction on set 2 would still be on screen
        // during the rest after set 3, claiming news about a set that decided nothing.
        let liveCorrection: LiveCorrection | null = null;
        if (l1.corrected && setLog.actualWeight != null && l1.nextLoad != null && (l1.direction === 'up' || l1.direction === 'down')) {
          liveCorrection = {
            exerciseId: current.exerciseId,
            direction: l1.direction,
            from: setLog.actualWeight,
            to: l1.nextLoad,
            reps: setLog.actualReps,
            band: [current.target.repBandLo ?? 8, current.target.repBandHi ?? 10],
          };
        }
        setCorrection(liveCorrection);
        if (l1.corrected) {
          loop1Ref.current = { exerciseId: current.exerciseId, count: loop1Ref.current.count + 1 };
          void track('loop1_correction', { sessionId: session.id, exerciseId: current.exerciseId, direction: l1.direction, from: setLog.actualWeight, to: l1.nextLoad });
        }
        // Dispatch once for either effect (carry and/or correction). Identical-to-prescription set → no-op.
        if (l1.plan !== plan) dispatch({ type: 'SWAP_PLAN', plan: l1.plan as Step[] });

        // Mark when rest begins so the ACTUAL rest taken is measurable on endRest.
        if (m.phase === 'REST_INTER' || m.phase.startsWith('REST_TRANSITION')) {
          restStartedAtRef.current = Date.now();
          restExtraSecondsRef.current = 0; // a fresh rest starts at its base length
        }

        if (m.phase === 'SESSION_SAVED') {
          return finalize(false);
        }
        return { ended: false, unlockedPortrait: false, correction: liveCorrection };
        } finally {
          completingRef.current = false;
        }
      },

      endRest() {
        // The rest the athlete ACTUALLY took. This is the only place it is knowable, and it used
        // to be handed to telemetry and thrown away — measured, then evaporated. It is now also
        // banked for the next set (engine v5 · L3: the engine may only compare like with like).
        if (restStartedAtRef.current != null) {
          const restMs = Date.now() - restStartedAtRef.current;
          const variant = machine.phase === 'REST_INTER' ? 'inter' : 'transition';
          void track('rest_completed', { sessionId: sessionRef.current?.id, restMs, plannedS: restSeconds, variant, early: restMs < restSeconds * 1000 });
          pendingRestSRef.current = Math.max(0, Math.round(restMs / 1000));
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
      reportEffort(exerciseId: string, level: EffortLevel) {
        const session = sessionRef.current;
        if (!session) return;
        const updated: Session = {
          ...session,
          effort: recordEffort(session.effort, exerciseId, level, new Date().toISOString()),
        };
        sessionRef.current = updated;
        // Persisted at once, like a set: an app killed between here and the finish must not lose
        // the answer, and the crash-salvage path reads the active session, not this state.
        void db.saveActiveSession(updated);
        dispatch({ type: 'EFFORT', session: updated });
        void track('effort_reported', { sessionId: session.id, exerciseId, level });
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
      editCurrentSet({ weight, reps }) {
        const idx = machine.setIndex;
        const cur = plan[idx];
        if (!cur) return;
        // Update only the current step's target + flag it edited. No log, no advance —
        // Active Set re-renders with the new values; Complete Set logs them (as edited).
        const newPlan = plan.map((st, i) =>
          i === idx
            ? { ...st, edited: true, target: { ...st.target, recommendedWeight: weight, recommendedReps: reps } }
            : st,
        );
        dispatch({ type: 'SWAP_PLAN', plan: newPlan });
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
      markEquipmentOccupied() {
        const cur = plan[machine.setIndex];
        if (!cur || cur.exerciseSetIndex !== 0) return; // only at the start of an exercise
        const newPlan = deferCurrentExercise(plan, machine.setIndex);
        if (newPlan === plan) return; // already last — nothing to move past
        void track('equipment_occupied', { sessionId: sessionRef.current?.id, exerciseId: cur.exerciseId });
        dispatch({ type: 'SWAP_PLAN', plan: newPlan });
        // Backend records the busy event + reorders the (planned) session blocks (best-effort;
        // the local plan reorder above already moved it for this live session).
        if (cur.target.blockId) {
          void app.model.markEquipmentOccupied({ blockId: cur.target.blockId }).catch(() => {});
        }
      },
    };
    // restNonce: `restExtraSeconds` is read from a ref, so a "+15 sec" (from either surface)
    // must re-memo the view or the phone's Rest screen would never see the rest grow.
  }, [state, app, endResult, correction, restResumeRemainingS, restNonce, watchLoggedSet]);

  // Map watch intents → the same view actions a tap fires. A watch Complete Set
  // accepts the recommended target (no override) — editing stays phone-only.
  watchActionsRef.current = {
    REST_ELAPSED: () => view.endRest(),
    PAUSE: () => view.pause(),
    RESUME: () => view.resume(),
    FINISH_EARLY: () => void view.finishEarly(),
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
      setWatchLoggedSet({ weight, reps, n: view.setLabel.n, m: view.setLabel.m, seq: ++watchLogSeqRef.current });
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

  return <Ctx.Provider value={view}>{children}</Ctx.Provider>;
}

export function useSession(): SessionView {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used within SessionProvider');
  return v;
}
