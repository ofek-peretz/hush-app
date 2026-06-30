/**
 * Live session engine. Drives the Session Flow via the session-state machine
 * (spec §6.3), persists per-set actuals at each Complete Set (§8.4), and honors
 * the invariant save order: Last Set -> SESSION_SAVED -> Well Done -> Home.
 *
 * Rest is Hush-owned and not user-adjustable (UX §10.8); these are the fixed
 * defaults. "Ready" (endRest) is the only rest agency.
 */
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ProgramDay, Session, SessionSummary, SetLog, SetTarget } from '@/data/local/models';
import { exerciseById, similarExercises, type Exercise } from '@/data/exercises';
import { db } from '@/data/local/db';
import { liveActivity } from '@/platform/liveActivity';
import { projectSessionMirror, type MirrorStep } from '@/platform/sessionMirror';
import { loadSetup } from '@/domain/loadPresentation';
import { WatchSession } from '@/platform/watch/watchBridge';
import type { WatchLobby } from '@/platform/watch/protocol';
import { watchTransport } from '@/platform/watch/watchTransportNative';
import {
  initialSessionMachine,
  sessionReducer,
  type SessionEvent,
  type SessionMachine,
} from '@/state/machines/sessionState';
import { HttpError } from '@/data/api/httpErrors';
import { track, trackFirst } from '@/platform/telemetry';
import { LIVE_ACTIVITY_EVENTS } from '@/platform/events';
import { useApp } from './appStore';

/** True if a failed sync is worth queuing for retry (transient), not a doomed payload. */
function worthQueuing(e: unknown): boolean {
  return !(e instanceof HttpError) || e.transient;
}

const REST_INTER_S = 90; // between sets of the same exercise (Hush-owned)
const REST_TRANSITION_S = 120; // between exercises (Hush-owned)


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
}

type Action =
  | { type: 'START'; plan: Step[]; session: Session; machine: SessionMachine }
  | { type: 'LOG'; setLog: SetLog; session: Session; machine: SessionMachine }
  | { type: 'MACHINE'; machine: SessionMachine }
  | { type: 'SWAP_PLAN'; plan: Step[] }
  | { type: 'END' };

function reducer(s: InternalState, a: Action): InternalState {
  switch (a.type) {
    case 'START':
      return { plan: a.plan, session: a.session, machine: a.machine };
    case 'LOG':
      return { ...s, session: a.session, machine: a.machine };
    case 'MACHINE':
      return { ...s, machine: a.machine };
    case 'SWAP_PLAN':
      return { ...s, plan: a.plan };
    case 'END':
      return { plan: [], session: null, machine: initialSessionMachine(true) };
    default:
      return s;
  }
}

export interface CompleteResult {
  ended: boolean;
  unlockedPortrait: boolean;
  /** Closing summary for the Complete screen — present when a real (≥1 set) session was saved. */
  summary?: SessionSummary;
  /** The athlete left without logging a single set: NOT a workout — nothing was saved or counted. */
  notStarted?: boolean;
}

/** What the SessionFlow renders underneath any overlay. */
export type DisplayPhase = 'SET_PRESENTED' | 'REST_INTER' | 'REST_TRANSITION';

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
  /** Epoch ms the active session started (drives the session elapsed-time label on the mirror). */
  startedAtMs: number | null;
  // actions
  start: (day: ProgramDay, targets: SetTarget[]) => Promise<void>;
  completeSet: (override?: { weight: number | null; reps: number }) => Promise<CompleteResult>;
  /** Edit Result: update the CURRENT set's weight/reps in place (re-renders Active
   *  Set). Does NOT log — Complete Set remains the sole confirmer (§4.13 / founder). */
  editCurrentSet: (v: { weight: number | null; reps: number }) => void;
  endRest: () => void;
  /** Extend the running rest by N seconds ("+15 sec"). Re-publishes the longer rest
   *  to the watch + Live Activity; the phone's own rest UI also reflects it. */
  extendRest: (seconds: number) => void;
  pause: () => void;
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
   *  remains the sole authority that actually starts a workout. */
  publishWatchLobby: (lobby: WatchLobby) => void;
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
}

const Ctx = createContext<SessionView | null>(null);

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
 * Name-resolve the live plan into canonical mirror steps — shared by the live mirror effect AND
 * the terminal complete-frame publish (so the watch/Live Activity always get the same projection).
 * Attaches the equipment-native load setup (kg) so the watch can show how to load the weight (item
 * 11), and the in-class swap alternatives at the start of each exercise.
 */
function buildMirrorSteps(plan: Step[]): MirrorStep[] {
  return plan.map((st) => {
    const ex = exerciseById(st.exerciseId);
    const swapOptions =
      ex && st.exerciseSetIndex === 0
        ? similarExercises(ex.id, 2).map((e) => ({ id: e.id, name: e.name }))
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
  });
  // Keep the latest session for synchronous persistence inside actions.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = state.session;
  // Latest machine, read by deferred callbacks (e.g. the 400ms Complete-Set
  // success timer) so they see a PAUSE that landed AFTER they were scheduled.
  const machineRef = useRef<SessionMachine>(state.machine);
  machineRef.current = state.machine;
  // Temporal telemetry: when the current rest/pause began (ms epoch).
  const restStartedAtRef = useRef<number | null>(null);
  const pauseStartedAtRef = useRef<number | null>(null);
  // Seconds added to the CURRENT rest via "+15 sec" (phone or watch). Reset when a new
  // rest begins / ends. Bumping `restNonce` re-runs the mirror effect so the longer
  // rest is republished to the watch + Live Activity.
  const restExtraSecondsRef = useRef(0);
  const [restNonce, setRestNonce] = useState(0);
  // The closing result of the just-finished session. Set by finalize() from a SINGLE place so the
  // phone navigates to Well Done whether the completion was triggered on the phone OR proposed from
  // the watch — a watch-driven finish previously left SessionFlow on an empty (black) stage. The
  // SessionFlow screen consumes this and clears it.
  const [endResult, setEndResult] = useState<CompleteResult | null>(null);
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
      restInterS: REST_INTER_S,
      restTransitionS: REST_TRANSITION_S,
      restExtraS: restExtraSecondsRef.current,
      restStartedAtMs: restStartedAtRef.current,
      nowMs: Date.now(),
      workoutName: state.session?.programDayName ?? '',
      sessionStartedAtMs: state.session ? Date.parse(state.session.startedAt) : null,
      completedSets: loggedSets.length,
      progressedLifts: progressedLiftCount(plan, loggedSets),
      toLoad: isToLoad(plan, machine.setIndex, loggedSets),
    });

    // One projection → both surfaces. The watch receives the full mirror (incl. the
    // terminal "complete" frame so it can show Workout Complete, then tear down).
    watchRef.current?.publish(mirror);

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
    const restSeconds = displayPhase === 'REST_INTER' ? REST_INTER_S : REST_TRANSITION_S;

    async function finalize(earlyFinish: boolean): Promise<CompleteResult> {
      const session = sessionRef.current;
      if (!session) return { ended: true, unlockedPortrait: false };

      // NOT STARTED (UX item 3A): the athlete entered the workout and left without completing a
      // single set. This is NOT a workout — it is never saved to history, never counted toward
      // calibration, and never marks the day done. Just clear the orphan session and exit.
      if (session.sets.length === 0) {
        await db.clearActiveSession();
        dispatch({ type: 'END' });
        void track('session_abandoned', { sessionId: session.id, programDayId: session.programDayId });
        const notStartedResult: CompleteResult = { ended: true, unlockedPortrait: false, notStarted: true };
        setEndResult(notStartedResult);
        return notStartedResult;
      }

      // Owner-voice annotation only when Hush acted or the athlete ended early
      // (§4.10). Early-finish takes precedence; otherwise an increase this session.
      const increasedStep = plan.find((s) => s.target.reasonType === 'increase');
      const saved: Session = {
        ...session,
        state: 'SAVED',
        earlyFinish,
        annotation: earlyFinish ? 'ended_early' : increasedStep ? 'increased' : null,
        annotationCapability:
          !earlyFinish && increasedStep ? exerciseById(increasedStep.exerciseId)?.capability : undefined,
      };
      // Save BEFORE Well Done (invariant §8.4). Local save + mode advance + END
      // must ALWAYS run, online or offline — completion never depends on the
      // backend (§6.2). Backend sync is best-effort and queued on failure (§6.4).
      await db.appendCompletedSession(saved);
      await db.clearActiveSession();
      const { unlockedPortrait } = await app.recordSessionCompleted();
      // Mark this workout DONE for the week so Program shows the green DONE chip and
      // Home advances to the next unfinished workout (Rest once all are done).
      await app.markWorkoutCompleted(session.programDayId);

      // Publish the terminal "complete" frame to the watch BEFORE teardown (deterministic — not
      // reliant on the [state] effect's scheduling). The wrist then shows Workout Complete with the
      // TRUTHFUL summary; END below empties the plan so the next projection is null, which the watch
      // bridge ignores once this complete frame has ended its session.
      const completeMirror = projectSessionMirror({
        steps: buildMirrorSteps(plan),
        total: plan.length,
        machine: { ...machine, phase: 'SESSION_SAVED' },
        restInterS: REST_INTER_S,
        restTransitionS: REST_TRANSITION_S,
        restStartedAtMs: null,
        nowMs: Date.now(),
        workoutName: saved.programDayName ?? '',
        sessionStartedAtMs: Date.parse(saved.startedAt),
        completedSets: saved.sets.length,
        progressedLifts: progressedLiftCount(plan, saved.sets),
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
        earlyFinish,
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
      startedAtMs: state.session ? Date.parse(state.session.startedAt) : null,
      // Equipment Occupied applies at the START of an exercise that has a later exercise to do.
      canMarkOccupied:
        displayPhase === 'SET_PRESENTED' &&
        !!current &&
        current.exerciseSetIndex === 0 &&
        plan.some((s) => s.globalIndex > current.globalIndex && s.exerciseId !== current.exerciseId),
      toLoad: current ? isToLoad(plan, machine.setIndex, state.session?.sets ?? []) : false,

      publishWatchLobby(lobby) {
        // An active session drives the watch via the mirror; never overwrite it.
        const sessionActive =
          plan.length > 0 && machine.phase !== 'SESSION_SAVED' && machine.phase !== 'WELL_DONE';
        if (sessionActive) return;
        watchRef.current?.publishLobby(lobby);
      },
      setWatchHomeActions(handlers) {
        watchStartRef.current = handlers ? () => handlers.onBegin() : () => {};
        watchSelectRef.current = handlers ? (id) => handlers.onSelect(id) : () => {};
      },
      endResult,
      clearEndResult: () => setEndResult(null),

      async start(day, targets) {
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
        });
      },

      async completeSet(override): Promise<CompleteResult> {
        const session = sessionRef.current;
        if (!current || !session) return { ended: false, unlockedPortrait: false };
        // Race guard: a Pause may have landed after the 400ms success timer was
        // scheduled. A paused session never logs a set — the workout is frozen
        // (§7.2). The set logs on Resume → Complete Set, not behind the overlay.
        if (machineRef.current.phase === 'PAUSED') return { ended: false, unlockedPortrait: false };
        const setLog: SetLog = {
          exerciseId: current.exerciseId,
          setIndex: current.exerciseSetIndex,
          blockId: current.target.blockId, // carried for backend sync
          recommendedWeight: current.target.recommendedWeight,
          recommendedReps: current.target.recommendedReps,
          actualWeight: override ? override.weight : current.target.recommendedWeight,
          actualReps: override ? override.reps : current.target.recommendedReps,
          edited: override != null || !!current.edited,
          persistedAt: new Date().toISOString(),
        };
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

        const restSecondsForThis = current.lastSetOfExercise ? REST_TRANSITION_S : REST_INTER_S;
        const m = sessionReducer(
          { ...machine, isLastSetOfSession: current.lastSetOfSession },
          { type: 'COMPLETE_SET', restSeconds: restSecondsForThis, lastSetOfExercise: current.lastSetOfExercise },
        );
        sessionRef.current = updated;
        dispatch({ type: 'LOG', setLog, session: updated, machine: m });

        // Mark when rest begins so the ACTUAL rest taken is measurable on endRest.
        if (m.phase === 'REST_INTER' || m.phase.startsWith('REST_TRANSITION')) {
          restStartedAtRef.current = Date.now();
          restExtraSecondsRef.current = 0; // a fresh rest starts at its base length
        }

        if (m.phase === 'SESSION_SAVED') {
          return finalize(false);
        }
        return { ended: false, unlockedPortrait: false };
      },

      endRest() {
        // Actual rest taken (a fatigue/recovery signal that was never captured before).
        if (restStartedAtRef.current != null) {
          const restMs = Date.now() - restStartedAtRef.current;
          const variant = machine.phase === 'REST_INTER' ? 'inter' : 'transition';
          void track('rest_completed', { sessionId: sessionRef.current?.id, restMs, plannedS: restSeconds, variant, early: restMs < restSeconds * 1000 });
          restStartedAtRef.current = null;
        }
        restExtraSecondsRef.current = 0;
        dispatch({ type: 'MACHINE', machine: sessionReducer(machine, { type: 'REST_ELAPSED' }) });
      },
      extendRest(seconds: number) {
        if (restStartedAtRef.current == null) return; // only while resting
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
          void track('resume', { sessionId: sessionRef.current?.id, pausedMs: Date.now() - pauseStartedAtRef.current });
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
        const upcoming = plan[startIdx];
        if (!upcoming) return;
        const oldId = upcoming.exerciseId;
        const newPlan = plan.map((st) =>
          st.exerciseId === oldId && st.globalIndex >= startIdx
            ? { ...st, exerciseId, target: { ...st.target, exerciseId } }
            : st,
        );
        dispatch({ type: 'SWAP_PLAN', plan: newPlan });
      },
      swapCurrentExercise(exerciseId) {
        const startIdx = machine.setIndex; // the current exercise
        const cur = plan[startIdx];
        if (!cur) return;
        const oldId = cur.exerciseId;
        const newPlan = plan.map((st) =>
          st.exerciseId === oldId && st.globalIndex >= startIdx
            ? { ...st, exerciseId, target: { ...st.target, exerciseId } }
            : st,
        );
        dispatch({ type: 'SWAP_PLAN', plan: newPlan });
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
  }, [state, app, endResult]);

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
    if (actualReps == null && actualWeight === undefined) {
      void view.completeSet(); // nothing adjusted → log the prescribed target
      return;
    }
    void view.completeSet({
      weight: actualWeight !== undefined ? actualWeight : tgt?.recommendedWeight ?? null,
      reps: actualReps ?? tgt?.recommendedReps ?? 0,
    });
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

  return <Ctx.Provider value={view}>{children}</Ctx.Provider>;
}

export function useSession(): SessionView {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used within SessionProvider');
  return v;
}
