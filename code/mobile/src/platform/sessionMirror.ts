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
import type { ReasonType } from '@/data/local/models';

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

/** Equipment-native load setup (kg) — how to physically load the prescribed weight so the athlete
 *  never has to calculate (UX items 5/12). Mirrors `domain/loadPresentation.LoadSetup` but is a
 *  plain structural type so this module stays free of domain/native imports. The headline IS the
 *  step's `targetWeight`; these fields only explain the setup. Watch + Live Activity render a
 *  compact line from it. `style` is a free string (the load style) to keep this decoupled. */
export interface MirrorLoadSetup {
  style: string;
  /** Per-side weight for a bar / carriage (barbell, plate_loaded). */
  perSide?: number;
  /** Plate stack for one side (largest first) — present ONLY when it sums exactly to `perSide`. */
  plates?: number[];
  /** Bar weight (barbell only). */
  barKg?: number;
  /** Per-hand weight (dumbbell). */
  perHand?: number;
  /** Stack pin weight (selectorized, cable). */
  pin?: number;
  /** Fixed-bar weight (fixed_barbell). */
  fixedBar?: number;
}

/** One step of the live plan, name-resolved, as the projection needs it. Decoupled
 *  from the session store's internal `Step` so this module stays pure. */
export interface MirrorStep {
  exerciseName: string;
  /** Primary muscle group label (Active Set legend). */
  exerciseGroup?: string;
  setIndexInExercise: number; // 0-based within the exercise
  totalSetsInExercise: number;
  globalIndex: number; // 0-based within the whole session
  targetWeight: number | null; // null => bodyweight
  targetReps: number;
  /** Advisory model reason for THIS set's load vs last comparable (§4.4). Carried so
   *  the watch can render the LoadDelta mark; never authoritative. */
  reasonType?: ReasonType;
  /** Magnitude (kg) of the change, used by the LoadDelta value. */
  reasonDelta?: number;
  /** In-class alternatives the athlete may swap to (Swap overlay); empty = none. */
  swapOptions?: { id: string; name: string }[];
  /** Equipment-native setup (kg) for this step's load — the watch reads it so the
   *  athlete never has to do mental math on the wrist (item 11). */
  loadSetup?: MirrorLoadSetup | null;
}

/**
 * One lift, at the close of the workout: what it was, and whether the athlete finished it.
 *
 * The wrist earns the same closing beat the phone has (founder 2026-07-12): the workout is read
 * back lift by lift, a check landing on each one that was completed. To do that the watch needs
 * the LIST, and the mirror is the only thing that crosses. A lift is done when every set it was
 * prescribed sits behind the athlete's completion frontier — so a workout ended early shows,
 * plainly, what was trained and what was left.
 */
export interface MirrorSummaryLift {
  name: string;
  done: boolean;
}

export interface MirrorSummary {
  timeLabel: string;
  sets: number;
  up: number;
  lifts: MirrorSummaryLift[];
}

/** The canonical mirror. Every surface renders a SUBSET of this — e.g. the Live
 *  Activity shows the timer as hero and ignores target load; the watch shows the
 *  Active Set with the target. The data is the same; only the rendering differs. */
export interface SessionMirror {
  schema: typeof MIRROR_SCHEMA_VERSION;
  phase: MirrorPhase;
  exerciseName: string;
  /** Primary muscle group of the current exercise (Active Set legend); '' if none. */
  exerciseGroup: string;
  /**
   * The CURRENT step, which during a REST is the set the athlete has JUST FINISHED — the state
   * machine does not advance `setIndex` until the rest ends (sessionState: END_REST). That is a
   * deliberate design (the rest belongs to the set that earned it), and it is a trap for every
   * surface that renders a rest, because what a resting athlete wants to know is what is COMING.
   * Use `nextSetLabel` / `nextSetNumber` on a rest frame. Both the watch and the Live Activity
   * read `setLabel` here and were quietly showing the set the athlete had already done.
   */
  setLabel: string; // e.g. "Set 2 of 4"
  /** Numeric set position within the current exercise (1-based) + total, for set dots. */
  setNumber: number;
  setsInExercise: number;
  /** The set the athlete is about to do — the ONLY set worth naming during a rest. Null when
   *  there is no next step (an active set, or the last set of the session). */
  nextSetLabel: string | null;
  nextSetNumber: number;
  /** Total sets of the UPCOMING exercise (transition card "{n} sets"); 0 if none. */
  nextSetsInExercise: number;
  globalIndex: number; // 0-based position within the session
  totalSets: number;
  targetWeight: number | null;
  targetReps: number;
  /** Absolute instant the current rest ends (ISO); null unless resting. */
  restEndsAt: string | null;
  /** Convenience snapshot derived from restEndsAt at projection time. */
  restRemainingS: number | null;
  /** The full prescribed rest length (s) — the rest ring's denominator; null unless
   *  resting. Optional/back-compatible. */
  restTotalS?: number | null;
  /** Upcoming exercise name during a transition rest; else null. */
  nextExerciseName: string | null;
  /** Upcoming exercise's muscle group (transition card legend); else null. */
  nextExerciseGroup?: string | null;
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
  /** Signed kg change of the CURRENT set's load vs last comparable: + increase,
   *  − decrease, 0 hold. Drives the watch LoadDelta mark (sage ▲ / clay ▼ / hold).
   *  Advisory, presentational only — never alters the prescribed target. */
  loadDeltaKg: number;
  /** Signed kg change of the UPCOMING exercise's first set (transition rest card). */
  nextLoadDeltaKg: number;
  /** The current lift's ordinal among the session's distinct exercises + the total
   *  ("Lift 1/6") — ambient exercises-remaining context on the top strip. */
  liftIndex: number;
  liftCount: number;
  /** The session's workout name (program day) — shown on the Complete screen. */
  workoutName: string;
  /** Complete-frame summary (only on the terminal frame): wall-clock time, total
   *  sets logged, and lifts progressed (distinct exercises the model raised). */
  summary: MirrorSummary | null;
  /** Swap alternatives for the CURRENT exercise (Active Set glyph → overlay). */
  swapOptions: { id: string; name: string }[];
  /** Swap alternatives for the UPCOMING exercise (Transition rest card glyph). */
  nextSwapOptions: { id: string; name: string }[];
  /** Equipment-native setup (kg) for the CURRENT set's load (item 11) — the watch /
   *  Live Activity render the per-side / plate / pin / per-hand line from it.
   *  Optional/back-compatible: a version-skewed surface simply omits the line. */
  loadSetup?: MirrorLoadSetup | null;
  /** Equipment-native setup (kg) for the UPCOMING exercise's first set (transition rest). */
  nextLoadSetup?: MirrorLoadSetup | null;
  /** TO-LOAD vs LOADED for the CURRENT set (item: instruction-first execution). True when the
   *  athlete still has to set the equipment — the first set of an exercise, or the load changed
   *  since the last completed set of it. False once a set has been logged at this load (the bar /
   *  pin is set) and for bodyweight (nothing to load). Drives the bright imperative vs the quiet
   *  "loaded" confirmation on the Active Set. */
  toLoad?: boolean;
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
  /** Seconds added to the current rest via "+15 sec" (phone or watch). Extends both
   *  restEndsAt and restTotalS so every surface agrees on the longer rest. */
  restExtraS?: number;
  nowMs: number;
  /** The session's workout name (program day) — for the watch Complete screen. */
  workoutName?: string;
  /** When the session started (ms epoch) — drives the Complete summary time. */
  sessionStartedAtMs?: number | null;
  /** Sets actually LOGGED this session — drives the Complete summary's truthful set
   *  count. Falls back to the planned `total` only when omitted (e.g. a pure-projection
   *  caller without the live session). Fixes the watch reporting all planned sets done. */
  completedSets?: number;
  /** Distinct lifts the athlete actually trained AND that the model raised — the
   *  Complete summary's "up". Falls back to the planned-increase count when omitted. */
  progressedLifts?: number;
  /** Whether the CURRENT set still needs the equipment set (TO-LOAD) — see SessionMirror.toLoad. */
  toLoad?: boolean;
}

function isResting(phase: SessionMachine['phase']): boolean {
  return phase === 'REST_INTER' || phase.startsWith('REST_TRANSITION');
}

/** Signed kg load change for a step: + increase, − decrease, 0 hold/unknown. */
function signedDelta(step: MirrorStep | null | undefined): number {
  if (!step || !step.reasonType) return 0;
  const mag = step.reasonDelta ?? 0;
  return step.reasonType === 'increase' ? mag : step.reasonType === 'decrease' ? -mag : 0;
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The workout read back lift by lift (see MirrorSummaryLift).
 *
 * `completedSets` is the athlete's frontier: the sets are walked in order, so the first N steps
 * are the ones that were logged. A lift is DONE when every step it owns falls behind that
 * frontier — anything else is a lift the athlete started and did not finish, or never reached,
 * and on a workout that ended early those are exactly the ones worth showing without a check.
 *
 * Pure + exported so the rule is a tested fact rather than a rendering detail on a wrist.
 */
export function summaryLifts(steps: MirrorStep[], completedSets: number): MirrorSummaryLift[] {
  const order: string[] = [];
  const tally = new Map<string, { total: number; done: number }>();
  steps.forEach((s, i) => {
    let t = tally.get(s.exerciseName);
    if (!t) {
      t = { total: 0, done: 0 };
      tally.set(s.exerciseName, t);
      order.push(s.exerciseName);
    }
    t.total += 1;
    if (i < completedSets) t.done += 1;
  });
  return order.map((name) => {
    const t = tally.get(name)!;
    return { name, done: t.done >= t.total };
  });
}

/** The current step's lift ordinal (1-based) among contiguous same-exercise runs,
 *  and the total number of runs ("Lift 1/6"). */
function liftPosition(steps: MirrorStep[], idx: number): { index: number; count: number } {
  let runs = 0;
  let curRun = 0;
  let prev: string | null = null;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].exerciseName !== prev) {
      runs += 1;
      prev = steps[i].exerciseName;
    }
    if (i === idx) curRun = runs;
  }
  return { index: curRun || 1, count: runs || 1 };
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
  const workoutName = inp.workoutName ?? '';
  if (steps.length === 0) return null;

  const idx = machine.setIndex;
  // Clamp: at SESSION_SAVED/WELL_DONE the index may sit past the last step.
  const cur = steps[idx] ?? steps[steps.length - 1];
  const setLabel = `Set ${cur.setIndexInExercise + 1} of ${cur.totalSetsInExercise}`;
  const lift = liftPosition(steps, Math.min(idx, steps.length - 1));

  // Terminal — a read-only "complete" frame. No rest, no next.
  if (machine.phase === 'SESSION_SAVED' || machine.phase === 'WELL_DONE') {
    // Lifts progressed = distinct exercises the model raised this session.
    const up = new Set(
      steps.filter((s) => s.reasonType === 'increase').map((s) => s.exerciseName),
    ).size;
    const startedMs = inp.sessionStartedAtMs ?? null;
    const summary: MirrorSummary = {
      timeLabel: startedMs != null ? formatDuration(nowMs - startedMs) : '—',
      // Truthful: the sets the athlete ACTUALLY logged (not the planned total) — an
      // early finish must never report every planned set as done.
      sets: inp.completedSets ?? total,
      up: inp.progressedLifts ?? up,
      lifts: summaryLifts(steps, inp.completedSets ?? total),
    };
    return {
      schema: MIRROR_SCHEMA_VERSION,
      phase: 'complete',
      exerciseName: cur.exerciseName,
      exerciseGroup: cur.exerciseGroup ?? '',
      setLabel,
      setNumber: cur.setIndexInExercise + 1,
      setsInExercise: cur.totalSetsInExercise,
      nextSetLabel: null,
      nextSetNumber: 0,
      nextSetsInExercise: 0,
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
      loadDeltaKg: 0,
      nextLoadDeltaKg: 0,
      liftIndex: lift.index,
      liftCount: lift.count,
      workoutName,
      summary,
      swapOptions: [],
      nextSwapOptions: [],
      loadSetup: null,
      nextLoadSetup: null,
      toLoad: false,
    };
  }

  // Under pause the workout is frozen; the timer does not run (spec §7.2). Reflect
  // the frozen prior phase's content but expose no live countdown.
  const effPhase = machine.phase === 'PAUSED' ? machine.resumePhase ?? 'SET_PRESENTED' : machine.phase;
  const resting = isResting(effPhase);
  const paused = machine.phase === 'PAUSED';

  let restEndsAt: string | null = null;
  let restRemainingS: number | null = null;
  let restTotalS: number | null = null;
  if (resting && !paused) {
    const restS = (effPhase === 'REST_INTER' ? restInterS : restTransitionS) + (inp.restExtraS ?? 0);
    restTotalS = restS;
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
    exerciseGroup: cur.exerciseGroup ?? '',
    setLabel,
    setNumber: cur.setIndexInExercise + 1,
    setsInExercise: cur.totalSetsInExercise,
    // The set that is COMING — see the field docs. On a rest frame this is the only honest
    // answer to "which set am I on"; `setLabel` above is the one that is already behind them.
    nextSetLabel: next ? `Set ${next.setIndexInExercise + 1} of ${next.totalSetsInExercise}` : null,
    nextSetNumber: next ? next.setIndexInExercise + 1 : 0,
    nextSetsInExercise: next ? next.totalSetsInExercise : 0,
    globalIndex: cur.globalIndex,
    totalSets: total,
    targetWeight: cur.targetWeight,
    targetReps: cur.targetReps,
    restEndsAt,
    restRemainingS,
    restTotalS,
    nextExerciseName: next ? next.exerciseName : null,
    nextExerciseGroup: next ? next.exerciseGroup ?? null : null,
    nextTargetWeight: next ? next.targetWeight : null,
    nextTargetReps: next ? next.targetReps : null,
    // The just-finished exercise is the current step on a transition-rest frame.
    completedExerciseName: isTransition ? cur.exerciseName : null,
    canMarkBusy,
    // Active set: the current set's signed load change (the LoadDelta mark).
    loadDeltaKg: phase === 'active_set' ? signedDelta(cur) : 0,
    // Transition rest: the upcoming exercise's first-set change (the card's delta).
    nextLoadDeltaKg: isTransition ? signedDelta(next) : 0,
    liftIndex: lift.index,
    liftCount: lift.count,
    workoutName,
    summary: null,
    swapOptions: phase === 'active_set' ? cur.swapOptions ?? [] : [],
    nextSwapOptions: isTransition && next ? next.swapOptions ?? [] : [],
    // Equipment-native setup (kg): the current set's during a live set, the upcoming
    // exercise's during a transition rest — so the watch shows how to load it.
    loadSetup: phase === 'active_set' ? cur.loadSetup ?? null : null,
    nextLoadSetup: isTransition && next ? next.loadSetup ?? null : null,
    // TO-LOAD only matters on the live set; the caller computes it from the logged sets.
    toLoad: phase === 'active_set' ? inp.toLoad ?? false : false,
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
