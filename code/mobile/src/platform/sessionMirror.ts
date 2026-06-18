/**
 * Canonical Session Mirror — the SINGLE read-only projection of the live session.
 *
 * One projection feeds every external surface that must show the in-progress
 * workout: Live Activity, Dynamic Island, Lock Screen, AND the Apple Watch
 * companion. There is deliberately NO second projection system — duplicating
 * this would let the surfaces drift from the phone's session machine, which is
 * the one source of truth (spec §8.5; audit risk #5).
 *
 * Hard rules encoded here:
 *  - READ-ONLY. The mirror carries no actions; completion only ever happens
 *    inside the app, against the phone's session machine (data integrity).
 *  - The phone owns the workout lifecycle. The mirror is derived state, never
 *    authoritative — it cannot start, advance, or save a session.
 *  - Rest timing is expressed as an ABSOLUTE end instant (`restEndsAt`), not a
 *    remaining-seconds countdown, so a surface renders a drift-proof timer even
 *    under transport latency (NATIVE_SURFACES §1; audit risk #8). The
 *    convenience `restRemainingS` snapshot is derived from it.
 *
 * This module is PURE (no native imports) so it is unit-testable on any host.
 */
import type { SessionMachine } from '@/state/machines/sessionState';

/** The mirror's coarse phase — the projection of the session machine an external
 *  surface needs (it never sees the machine's internal sub-states). */
export type MirrorPhase =
  | 'active_set'
  | 'rest_inter'
  | 'rest_transition'
  | 'paused'
  | 'complete';

/** Schema version of the wire form. Bump on any incompatible field change so a
 *  surface built against an older app rejects a shape it cannot read. */
export const MIRROR_SCHEMA_VERSION = 1 as const;

/** One step of the live plan, name-resolved, as the projection needs it. Decoupled
 *  from the session store's internal `Step` so this module stays pure. */
export interface MirrorStep {
  exerciseName: string;
  setIndexInExercise: number; // 0-based within the exercise
  totalSetsInExercise: number;
  globalIndex: number; // 0-based within the whole session
  targetWeight: number | null; // null => bodyweight
  targetReps: number;
}

/** The canonical mirror. Every surface renders a SUBSET of this — e.g. the Live
 *  Activity shows the timer as hero and ignores target load; the watch shows the
 *  Active Set with the target. The data is the same; only the rendering differs. */
export interface SessionMirror {
  schema: typeof MIRROR_SCHEMA_VERSION;
  phase: MirrorPhase;
  exerciseName: string;
  setLabel: string; // e.g. "Set 2 of 4"
  globalIndex: number; // 0-based position within the session
  totalSets: number;
  targetWeight: number | null;
  targetReps: number;
  /** Absolute instant the current rest ends (ISO); null unless resting. */
  restEndsAt: string | null;
  /** Convenience snapshot derived from restEndsAt at projection time. */
  restRemainingS: number | null;
  /** Upcoming exercise name during a transition rest; else null. */
  nextExerciseName: string | null;
  /** Target of the upcoming exercise's first set during a transition rest. */
  nextTargetWeight: number | null;
  nextTargetReps: number | null;
  /** The exercise just finished — non-null ONLY on a transition-rest frame, so the
   *  watch can present the "<Exercise> Complete" interstitial. */
  completedExerciseName: string | null;
  /** True only at the start of an exercise (set 1) that has a later, different
   *  exercise to defer to — drives the Active Set "Exercise Busy" affordance
   *  (mirrors the phone's canMarkOccupied). */
  canMarkBusy: boolean;
}

export interface MirrorInputs {
  /** Name-resolved live plan. Empty => no active session (project returns null). */
  steps: MirrorStep[];
  total: number;
  machine: SessionMachine;
  restInterS: number;
  restTransitionS: number;
  /** When the current rest began (ms epoch), or null when not resting. Drives the
   *  absolute restEndsAt so the timer never drifts as the mirror is re-projected. */
  restStartedAtMs: number | null;
  nowMs: number;
}

function isResting(phase: SessionMachine['phase']): boolean {
  return phase === 'REST_INTER' || phase.startsWith('REST_TRANSITION');
}

/**
 * Project the session machine + plan into the canonical mirror.
 *
 * Returns `null` ONLY when there is no session at all (empty plan) — that is the
 * signal for a host to tear its surface down. A finished session projects a
 * `complete` mirror first (so the watch can show "Workout Complete" and the Live
 * Activity can render a final frame) and the host ends on the next null.
 *
 * Pure and total: never throws, never reads a clock other than `nowMs`.
 */
export function projectSessionMirror(inp: MirrorInputs): SessionMirror | null {
  const { steps, total, machine, restInterS, restTransitionS, restStartedAtMs, nowMs } = inp;
  if (steps.length === 0) return null;

  const idx = machine.setIndex;
  // Clamp: at SESSION_SAVED/WELL_DONE the index may sit past the last step.
  const cur = steps[idx] ?? steps[steps.length - 1];
  const setLabel = `Set ${cur.setIndexInExercise + 1} of ${cur.totalSetsInExercise}`;

  // Terminal — a read-only "complete" frame. No rest, no next.
  if (machine.phase === 'SESSION_SAVED' || machine.phase === 'WELL_DONE') {
    return {
      schema: MIRROR_SCHEMA_VERSION,
      phase: 'complete',
      exerciseName: cur.exerciseName,
      setLabel,
      globalIndex: cur.globalIndex,
      totalSets: total,
      targetWeight: cur.targetWeight,
      targetReps: cur.targetReps,
      restEndsAt: null,
      restRemainingS: null,
      nextExerciseName: null,
      nextTargetWeight: null,
      nextTargetReps: null,
      completedExerciseName: null,
      canMarkBusy: false,
    };
  }

  // Under pause the workout is frozen; the timer does not run (spec §7.2). Reflect
  // the frozen prior phase's content but expose no live countdown.
  const effPhase = machine.phase === 'PAUSED' ? machine.resumePhase ?? 'SET_PRESENTED' : machine.phase;
  const resting = isResting(effPhase);
  const paused = machine.phase === 'PAUSED';

  let restEndsAt: string | null = null;
  let restRemainingS: number | null = null;
  if (resting && !paused) {
    const restS = effPhase === 'REST_INTER' ? restInterS : restTransitionS;
    const startMs = restStartedAtMs ?? nowMs;
    const endMs = startMs + restS * 1000;
    restEndsAt = new Date(endMs).toISOString();
    restRemainingS = Math.max(0, Math.round((endMs - nowMs) / 1000));
  }

  const phase: MirrorPhase = paused
    ? 'paused'
    : resting
      ? effPhase === 'REST_INTER'
        ? 'rest_inter'
        : 'rest_transition'
      : 'active_set';

  const next = resting ? steps[idx + 1] ?? null : null;
  const isTransition = phase === 'rest_transition';

  // Exercise Busy is offered at the start of an exercise (set 1) that still has a
  // later, different exercise to defer to (mirrors the phone's canMarkOccupied).
  const canMarkBusy =
    phase === 'active_set' &&
    cur.setIndexInExercise === 0 &&
    steps.slice(idx + 1).some((s) => s.exerciseName !== cur.exerciseName);

  return {
    schema: MIRROR_SCHEMA_VERSION,
    phase,
    exerciseName: cur.exerciseName,
    setLabel,
    globalIndex: cur.globalIndex,
    totalSets: total,
    targetWeight: cur.targetWeight,
    targetReps: cur.targetReps,
    restEndsAt,
    restRemainingS,
    nextExerciseName: next ? next.exerciseName : null,
    nextTargetWeight: next ? next.targetWeight : null,
    nextTargetReps: next ? next.targetReps : null,
    // The just-finished exercise is the current step on a transition-rest frame.
    completedExerciseName: isTransition ? cur.exerciseName : null,
    canMarkBusy,
  };
}

/** Plain-object wire form (what crosses a native bridge / WatchConnectivity dict
 *  or an ActivityKit ContentState). A serialized mirror is self-describing via
 *  `schema`. */
export function mirrorToWire(m: SessionMirror): Record<string, unknown> {
  return { ...m };
}

/**
 * Parse a wire-form mirror defensively. Returns null on anything that is not a
 * readable mirror of a known schema — a surface must never render garbage, and a
 * forward/back schema mismatch is a clean no-op, not a crash.
 */
export function mirrorFromWire(raw: unknown): SessionMirror | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.schema !== MIRROR_SCHEMA_VERSION) return null;
  if (typeof o.phase !== 'string' || typeof o.exerciseName !== 'string') return null;
  return o as unknown as SessionMirror;
}
