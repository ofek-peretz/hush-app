/**
 * Live session engine. Drives the Session Flow via the session-state machine
 * (spec §6.3), persists per-set actuals at each Complete Set (§8.4), and honors
 * the invariant save order: Last Set -> SESSION_SAVED -> Well Done -> Home.
 *
 * Rest is Hush-owned and not user-adjustable (UX §10.8); these are the fixed
 * defaults. "Ready" (endRest) is the only rest agency.
 */
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ForecastRecord, ProgramDay, Session, SetLog, SetTarget } from '@/data/local/models';
import { exerciseById, type Exercise } from '@/data/exercises';
import { db } from '@/data/local/db';
import { liveActivityStub, type LiveActivityHost } from '@/platform/liveActivity';
import {
  initialSessionMachine,
  sessionReducer,
  type SessionMachine,
} from '@/state/machines/sessionState';
import { resolveIncrease } from '@/domain/receiptRules';
import type { Line } from '@/domain/voice';
import { canSpeak } from '@/domain/modeGate';
import { HttpError } from '@/data/api/httpErrors';
import { track, trackFirst } from '@/platform/telemetry';
import { useApp } from './appStore';

/** True if a failed sync is worth queuing for retry (transient), not a doomed payload. */
function worthQueuing(e: unknown): boolean {
  return !(e instanceof HttpError) || e.transient;
}

const REST_INTER_S = 90; // between sets of the same exercise (Hush-owned)
const REST_TRANSITION_S = 120; // between exercises (Hush-owned)

// Read-only Live Activity / Dynamic Island / Lock Screen mirror (spec §8.5).
// Stub now; swap for the native ActivityHost on a dev build (see NATIVE_SURFACES).
const liveActivity: LiveActivityHost = liveActivityStub;

export interface Step {
  exerciseId: string;
  globalIndex: number;
  exerciseSetIndex: number; // 0-based within the exercise
  totalSetsInExercise: number;
  target: SetTarget;
  lastSetOfExercise: boolean;
  lastSetOfSession: boolean;
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
  // A receipt earned on the previous set, to be shown ONCE on the next set
  // (an increase forecast resolves same-session, §2.9). Loud only when right.
  pendingReceipt: Line | null;
}

type Action =
  | { type: 'START'; plan: Step[]; session: Session; machine: SessionMachine }
  | { type: 'LOG'; setLog: SetLog; session: Session; machine: SessionMachine; pendingReceipt: Line | null }
  | { type: 'MACHINE'; machine: SessionMachine }
  | { type: 'SWAP_PLAN'; plan: Step[] }
  | { type: 'END' };

function reducer(s: InternalState, a: Action): InternalState {
  switch (a.type) {
    case 'START':
      return { plan: a.plan, session: a.session, machine: a.machine, pendingReceipt: null };
    case 'LOG':
      return { ...s, session: a.session, machine: a.machine, pendingReceipt: a.pendingReceipt };
    case 'MACHINE':
      return { ...s, machine: a.machine };
    case 'SWAP_PLAN':
      return { ...s, plan: a.plan };
    case 'END':
      return { plan: [], session: null, machine: initialSessionMachine(true), pendingReceipt: null };
    default:
      return s;
  }
}

export interface CompleteResult {
  ended: boolean;
  unlockedPortrait: boolean;
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
  currentTarget: SetTarget | null;
  setLabel: { n: number; m: number } | null; // set n of m within the exercise
  globalProgress: { index: number; total: number } | null;
  nextExercise: Exercise | null; // for Transition Rest preview
  nextTarget: SetTarget | null;
  restSeconds: number;
  /** Receipt to show on the CURRENT set (earned by the previous set), once. */
  receiptLine: Line | null;
  // actions
  start: (day: ProgramDay, targets: SetTarget[]) => Promise<void>;
  completeSet: (override?: { weight: number | null; reps: number }) => Promise<CompleteResult>;
  endRest: () => void;
  pause: () => void;
  resume: () => void;
  finishEarly: () => Promise<CompleteResult>;
  /** Mid-session "choose another": swap the UPCOMING exercise in place (situational,
   *  not persisted — §7.3). Capability is preserved (Replacement stays in-class). */
  swapNextExercise: (exerciseId: string) => void;
  /** Equipment Occupied (V1): move the current exercise one position later in the workout
   *  (no replacement, no structure change). Only available at the start of an exercise. */
  markEquipmentOccupied: () => void;
  /** True when Equipment Occupied applies (at the start of an exercise that isn't last). */
  canMarkOccupied: boolean;
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

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [state, dispatch] = useReducer(reducer, {
    plan: [],
    session: null,
    machine: initialSessionMachine(true),
    pendingReceipt: null,
  });
  // Keep the latest session for synchronous persistence inside actions.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = state.session;
  // Temporal telemetry: when the current rest/pause began (ms epoch).
  const restStartedAtRef = useRef<number | null>(null);
  const pauseStartedAtRef = useRef<number | null>(null);

  // Mirror session state to the Live Activity / Dynamic Island / Lock Screen —
  // READ-ONLY, timer is the hero, no completion controls from outside (§8.5).
  useEffect(() => {
    const { plan, machine } = state;
    const ended = plan.length === 0 || machine.phase === 'SESSION_SAVED' || machine.phase === 'WELL_DONE';
    if (ended) {
      void liveActivity.end();
      return;
    }
    const cur = plan[machine.setIndex];
    const ex = cur ? exerciseById(cur.exerciseId) : null;
    const resting = machine.phase === 'REST_INTER' || machine.phase.startsWith('REST_TRANSITION');
    void liveActivity.update({
      exerciseName: ex?.name ?? '',
      restRemainingS: resting ? (machine.phase === 'REST_INTER' ? REST_INTER_S : REST_TRANSITION_S) : null,
      setLabel: cur ? `Set ${cur.exerciseSetIndex + 1} of ${cur.totalSetsInExercise}` : '',
    });
  }, [state]);

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
      return { ended: true, unlockedPortrait };
    }

    return {
      active: plan.length > 0 && machine.phase !== 'SESSION_SAVED' && machine.phase !== 'WELL_DONE',
      phase: machine.phase,
      displayPhase,
      paused,
      currentExercise: current ? exerciseById(current.exerciseId) ?? null : null,
      currentTarget: current?.target ?? null,
      setLabel: current ? { n: current.exerciseSetIndex + 1, m: current.totalSetsInExercise } : null,
      globalProgress: current ? { index: current.globalIndex, total: plan.length } : null,
      nextExercise: resting && next ? exerciseById(next.exerciseId) ?? null : null,
      nextTarget: resting ? next?.target ?? null : null,
      restSeconds,
      // Show the earned receipt only on a presented set (never over rest).
      receiptLine: displayPhase === 'SET_PRESENTED' ? state.pendingReceipt : null,
      // Equipment Occupied applies at the START of an exercise that has a later exercise to do.
      canMarkOccupied:
        displayPhase === 'SET_PRESENTED' &&
        !!current &&
        current.exerciseSetIndex === 0 &&
        plan.some((s) => s.globalIndex > current.globalIndex && s.exerciseId !== current.exerciseId),

      async start(day, targets) {
        const plan2 = buildPlan(day, targets);
        const session: Session = {
          id: `sess_${Date.now()}`,
          programDayId: day.id,
          startedAt: new Date().toISOString(),
          state: 'ACTIVE',
          earlyFinish: false,
          sets: [],
        };
        await db.saveActiveSession(session);
        void track('session_started', { sessionId: session.id, programDayId: day.id, blockCount: day.slots.length });
        const first = plan2[0];
        const firstEx = first ? exerciseById(first.exerciseId) : null;
        void liveActivity.start({
          exerciseName: firstEx?.name ?? '',
          restRemainingS: null,
          setLabel: first ? `Set 1 of ${first.totalSetsInExercise}` : '',
        });
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
        const setLog: SetLog = {
          exerciseId: current.exerciseId,
          setIndex: current.exerciseSetIndex,
          blockId: current.target.blockId, // carried for backend sync
          recommendedWeight: current.target.recommendedWeight,
          recommendedReps: current.target.recommendedReps,
          actualWeight: override ? override.weight : current.target.recommendedWeight,
          actualReps: override ? override.reps : current.target.recommendedReps,
          edited: override != null,
          persistedAt: new Date().toISOString(),
        };
        const updated: Session = { ...session, sets: [...session.sets, setLog] };
        // Persist the actual at each Complete Set (§8.4).
        await db.saveActiveSession(updated);

        // Resolve forecasts against THIS set. The old pending receipt (shown on
        // this set) is consumed; a new one may be earned for the next set.
        // Asymmetry: a receipt only on a HIT (§5.4).
        const speaking = canSpeak(app.modeState.mode);
        const capability = exerciseById(current.exerciseId)?.capability;
        const fc = current.target.forecast;

        // (a) Increase forecast resolves same-session (§2.9) — no durable record.
        let increaseReceipt: Line | null = null;
        if (speaking && fc?.type === 'increase') {
          const rec: ForecastRecord = {
            id: `fc_${current.globalIndex}`,
            type: 'increase',
            capability: fc.capability,
            predictedValue: fc.predictedValue,
            predictedReps: fc.predictedReps,
            dueSessionOrDate: fc.dueSessionOrDate,
            state: 'PENDING',
          };
          increaseReceipt = resolveIncrease(rec, setLog).receipt;
        }

        // (b) Hold forecast loop (#9) — durable, cross-session. Resolve any PENDING
        // hold for this capability against the logged set FIRST (so a freshly-issued
        // hold can never self-resolve), THEN stake a newly-delivered hold as PENDING.
        let holdReceipt: Line | null = null;
        if (speaking && capability) {
          holdReceipt = await app.resolveHoldForecasts({ capability, log: setLog });
          if (fc?.type === 'hold') {
            await app.issueHoldForecast({
              capability: fc.capability,
              predictedValue: fc.predictedValue,
              predictedReps: fc.predictedReps,
              dueSessionOrDate: fc.dueSessionOrDate,
            });
          }
        }

        // At most one receipt surfaces per set; the same-session increase wins ties.
        const pendingReceipt: Line | null = increaseReceipt ?? holdReceipt;

        // Decision + trust telemetry (alpha): structured per-set decision context,
        // outcome, and override — enough to answer "was the model right?" later.
        const decisionType = current.target.reasonType;
        const forecastIssued = speaking && !!current.target.forecast;
        const hit = speaking && fc?.type === 'increase' ? increaseReceipt != null : undefined;
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
          decisionType,
          forecastIssued,
          hit,
        });
        if (setLog.edited) void trackFirst('first_override');
        if (speaking) {
          if (decisionType === 'hold') {
            void trackFirst('first_hold_encountered');
            if (!setLog.edited) void trackFirst('first_hold_accepted');
          }
          if (forecastIssued) void trackFirst('first_forecast_delivered');
          if (hit === true) {
            void trackFirst('first_receipt_delivered');
            void trackFirst('first_forecast_proven_correct');
            void track('forecast_resolved', { sessionId: session.id, capability, hit: true });
          } else if (hit === false) {
            void track('forecast_resolved', { sessionId: session.id, capability, hit: false });
          }
        }

        const restSecondsForThis = current.lastSetOfExercise ? REST_TRANSITION_S : REST_INTER_S;
        const m = sessionReducer(
          { ...machine, isLastSetOfSession: current.lastSetOfSession },
          { type: 'COMPLETE_SET', restSeconds: restSecondsForThis, lastSetOfExercise: current.lastSetOfExercise },
        );
        sessionRef.current = updated;
        dispatch({ type: 'LOG', setLog, session: updated, machine: m, pendingReceipt });

        // Mark when rest begins so the ACTUAL rest taken is measurable on endRest.
        if (m.phase === 'REST_INTER' || m.phase.startsWith('REST_TRANSITION')) {
          restStartedAtRef.current = Date.now();
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
        dispatch({ type: 'MACHINE', machine: sessionReducer(machine, { type: 'REST_ELAPSED' }) });
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
  }, [state, app]);

  return <Ctx.Provider value={view}>{children}</Ctx.Provider>;
}

export function useSession(): SessionView {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used within SessionProvider');
  return v;
}
