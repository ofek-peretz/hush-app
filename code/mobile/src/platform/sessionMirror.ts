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
// @ts-nocheck

// 

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
  /** The rep band's ceiling (floor == targetReps). Carried so the watch draws the same
   *  8–10 rep-range rule the phone's stage does (WT2). */
  repBandHi?: number;
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
 * One lift the athlete PERFORMED, at the close of the workout — with its best set.
 *
 * The wrist plays the phone's closing beat, and now it plays the same one (founder 2026-07-13:
 * "read the workout on the watch exactly like the phone reads it — only the exercises that were
 * performed, with the green check"). The first cut listed the whole prescription and marked the
 * unreached lifts with a dash. That is a LEDGER, and the closing beat is not a ledger: the phone
 * walks the sets the athlete actually logged (WellDone reads `session.sets`), lands a check on
 * each lift among them, and prints the best set beside it. Nothing that did not happen appears.
 *
 * So the wire carries what the phone renders: the performed lifts, in the order they were trained,
 * each with the heaviest set of work it took (best by volume — the same rule WellDone uses).
 */
export interface MirrorSummaryLift {
  name: string;
  /** The lift's best set, formatted the way the phone prints it: "60 × 8", "BW × 12". */
  best: string;
  /**
   * DEPRECATED — a compatibility shim, to be deleted one release after Build 30.
   *
   * The watch app installs asynchronously from the phone app, so THIS phone will spend a while
   * talking to the PREVIOUS watch binary, and that binary decodes `done` as a non-optional Bool.
   * A missing key throws inside its decoder, and since `summary` is a nested optional the throw
   * takes the whole complete frame with it — the wrist would miss its closing screen altogether
   * rather than miss one line of it. So the old field keeps being sent, with its old meaning
   * (every prescribed set of this lift is logged), until no old binary can still be out there.
   * Nothing in this build reads it.
   */
  done: boolean;
}

/** One logged set, in step order — the actuals behind the read-back's numbers. */
export interface MirrorLoggedSet {
  weight: number | null; // kg; null = bodyweight
  reps: number;
}

/**
 * A milestone the session just crossed — the phone's beat 4, carried to the wrist (founder
 * 2026-07-13: "add milestones to the watch at the end of a workout when the athlete earned one").
 *
 * COPY, NOT DOMAIN. The mark is earned on the phone, from the phone's history, the moment the
 * session is written — there is no second engine on the wrist and never will be. What crosses the
 * wire is the finished sentence (`domain/milestoneCopy`), rendered in ENGLISH: the watch target
 * has no i18n runtime (WatchCopy.swift), and a Hebrew string in a mono face is the bug we already
 * fixed once. The wrist shows the medallion's figure and the one factual line; the emblem itself,
 * with its engraved glyph, stays a phone thing.
 */
export interface MirrorMilestone {
  /** The engraved figure ("100", "250 t", "140 kg") — empty for a mark that is an event, not a number. */
  value: string;
  /** The tiny unit under the figure ("workouts", "tonnes"), when the figure has one. */
  caption?: string;
  title: string;
  sub?: string;
}

export interface MirrorSummary {
  timeLabel: string;
  sets: number;
  up: number;
  /** Total external load moved this session, in KILOGRAMS (Σ weight × reps over the logged sets;
   *  bodyweight sets contribute 0). The watch Complete screen renders it as tonnes ("11.7 T").
   *  0 when no weighted set was logged. */
  volumeKg: number;
  /**
   * The session's calories, AS THE PHONE COMPUTED THEM — one number per workout (founder
   * 2026-07-28). The wrist can read HealthKit's active energy and the phone cannot, so for a
   * phone-authority session the two surfaces used to print different figures for the same workout.
   * The authority produces it; the wrist renders it. Null when it cannot be estimated honestly
   * (no bodyweight — Hush never guesses a body to bill calories against).
   */
  kcal?: number | null;
  lifts: MirrorSummaryLift[];
  /** Present ONLY on the session that crossed it — a mark is celebrated once, on its own workout. */
  milestone?: MirrorMilestone | null;
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
  /** The rep band's ceiling (floor == targetReps). Carried so the wrist draws the same
   *  8–10 rep-range ruler the phone's stage does (WT2). Null when the target is a single rep. */
  targetRepsHi: number | null;
  /**
   * ⛔ HER OWN SETS ON THIS LIFT, THIS SESSION — reps in order (2026-08-04).
   *
   * The wrist drew four dots: filled, ringed, empty. They said HOW MANY sets were behind her and
   * never WHAT HAPPENED in them, while the phone printed the figures. These two fields close that,
   * and they are what the single row hands over from.
   */
  setsSoFar: number[];
  /** The same sets' loads, index-aligned — what the hero's delta measures against mid-lift. */
  loadsSoFar: (number | null)[];
  /** Last time's reps on this lift, in order. Empty on a lift she has never done. */
  lastReps: number[];
  /** …and the load she finished it on. `null` = bodyweight, or no history at all. */
  lastLoadKg: number | null;
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
  /**
   * WT13c · GLANCE — what she has DONE so far, live, while the workout is still running.
   *
   * The summary below carries the same two figures, but only on the terminal frame, so a glance
   * mid-session had nothing to read: the wrist could show her heart and her burn (the OS supplies
   * those) and not one thing about her own lifting. These are the athlete's frontier, from the
   * ACTUALS in step order — bodyweight sets contribute 0 kg, exactly as the summary treats them.
   */
  liveVolumeKg: number;
  liveSets: number;
  /** WT5 — true when the running rest is HER measured median on this lift (S-17) rather than the
   *  tier bootstrap. Presentational only: the seconds are already hers either way. */
  restIsLearned?: boolean;
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
  /**
   * THE SIGNATURE MOMENT, on the wrist (2026-07-17).
   *
   * Loop 1 just moved the next set's load because of the set she finished. The brief calls this the
   * product's most distinctive moment and requires it to appear on BOTH surfaces — "the same change
   * appears on the watch" — which matters most here: mid-workout the wrist is often the only thing
   * she looks at, and a load changing on it with no account of why is the app doing something TO
   * her rather than WITH her.
   *
   * `from`/`to` are kg (the mirror's unit; the wrist formats). Null on every frame that did not
   * just earn a correction. Optional/back-compatible: a version-skewed watch simply omits the line
   * and still shows the correct next load.
   */
  correction?: { from: number; to: number; direction: 'up' | 'down'; reps: number } | null;
}

export interface MirrorInputs {
  /** Name-resolved live plan. Empty => no active session (project returns null). */
  steps: MirrorStep[];
  total: number;
  machine: SessionMachine;
  restInterS: number;
  /** WT5 — is `restInterS` her MEASURED median on this lift, or the tier bootstrap? */
  restIsLearned?: boolean;
  restTransitionS: number;
  /** When the current rest began (ms epoch), or null when not resting. Drives the
   *  absolute restEndsAt so the timer never drifts as the mirror is re-projected. */
  restStartedAtMs: number | null;
  /** Seconds added to the current rest via "+15 sec" (phone or watch). Extends `restEndsAt` —
   *  never `restTotalS`, which stays the prescribed length so every mirrored ring fills forward
   *  the way the phone's does (see the projection below). */
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
  /** The logged sets themselves, in step order — the ACTUAL weight/reps behind the read-back's
   *  best-set line. Omitted ⇒ the read-back falls back to the prescription. */
  loggedSets?: MirrorLoggedSet[];
  /**
   * ⛔ WHAT SHE DID LAST TIME ON THE LIFT IN FRONT OF HER (founder 2026-08-04, bringing the wrist
   * up to the phone's set screen). `lastTimeOn` already computes it for the phone; passing it here
   * is what lets the wrist draw the same row of figures rather than four dots that only count.
   *
   * ⚠️ OPTIONAL, AND ABSENT IS THE NORMAL STATE for a lift she has never done. The wrist draws a
   * dash there — never a zero, which is a set she did and failed.
   */
  lastTime?: { loadKg: number | null; reps: number[] } | null;
  /** Distinct lifts the athlete actually trained AND that the model raised — the
   *  Complete summary's "up". Falls back to the planned-increase count when omitted. */
  progressedLifts?: number;
  /** The session's calories as the PHONE computed them (`domain/energy.sessionKcal`) — carried so
   *  the wrist prints the same number rather than its own HealthKit reading (founder 2026-07-28). */
  kcal?: number | null;
  /** The mark this session crossed (already-rendered English copy), for the terminal frame only. */
  milestone?: MirrorMilestone | null;
  /** Whether the CURRENT set still needs the equipment set (TO-LOAD) — see SessionMirror.toLoad. */
  toLoad?: boolean;
  /** The correction Loop 1 just made, if any — see SessionMirror.correction. */
  correction?: { from: number; to: number; direction: 'up' | 'down'; reps: number } | null;
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

/** "60 × 8" · "62.5 × 6" · "BW × 12" — the read-back's one number, phone-identical. */
function bestSetLabel(s: MirrorLoggedSet): string {
  const w = s.weight == null ? 'BW' : String(Math.round(s.weight * 10) / 10);
  return `${w} × ${s.reps}`;
}

/**
 * The workout read back lift by lift (see MirrorSummaryLift) — ONLY what was performed.
 *
 * `completedSets` is the athlete's frontier: sets are logged in step order, so the first N steps
 * are the ones that happened. A lift appears here if ANY of its steps falls behind that frontier;
 * a lift the athlete never reached is not part of the workout they just did and has no place in
 * the beat that reads it back. `logged` carries the ACTUALS in the same order (what was lifted,
 * not what was prescribed) — the best of them, by volume, is the set shown beside the check. It is
 * optional only so a caller with no live session still projects a valid frame; then the
 * prescription stands in for the log, which is the closest true thing available.
 *
 * Pure + exported so the rule is a tested fact rather than a rendering detail on a wrist.
 */
export function summaryLifts(
  steps: MirrorStep[],
  completedSets: number,
  logged?: MirrorLoggedSet[],
): MirrorSummaryLift[] {
  // WITHIN one lift: the heaviest work wins, and when the work ties — which it ALWAYS does on a
  // bodyweight lift, where volume is 0 by definition — the longer set wins. Volume alone would
  // have made "your best set of pull-ups" mean "the first one you did", forever. (WellDone.tsx
  // holds the identical comparator; the two read-backs must never name different sets.)
  const vol = (s: MirrorLoggedSet) => (s.weight ?? 0) * s.reps;
  const better = (a: MirrorLoggedSet, b: MirrorLoggedSet) =>
    vol(a) !== vol(b) ? vol(a) > vol(b) : a.reps > b.reps;
  const order: string[] = [];
  const best = new Map<string, MirrorLoggedSet>();
  // Prescribed vs logged, per lift — only for the deprecated `done` shim (see MirrorSummaryLift).
  const tally = new Map<string, { total: number; done: number }>();
  steps.forEach((s, i) => {
    const t = tally.get(s.exerciseName) ?? { total: 0, done: 0 };
    t.total += 1;
    if (i < completedSets) t.done += 1;
    tally.set(s.exerciseName, t);
    if (i >= completedSets) return; // never reached — it is not part of this workout
    const set = logged?.[i] ?? { weight: s.targetWeight, reps: s.targetReps };
    const cur = best.get(s.exerciseName);
    if (!cur) order.push(s.exerciseName);
    if (!cur || better(set, cur)) best.set(s.exerciseName, set);
  });
  return order.map((name) => {
    const t = tally.get(name)!;
    return { name, best: bestSetLabel(best.get(name)!), done: t.done >= t.total };
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
/**
 * Her sets on the CURRENT lift, this session — reps and loads, in order.
 *
 * ⚠️ `loggedSets` is index-aligned with `steps`, so the exercise is read from the step rather than
 * from the set: a logged set carries no exercise id of its own, and pairing them any other way is
 * how a row ends up showing another lift's numbers.
 */
function soFarOnLift(steps: MirrorStep[], logged: MirrorLoggedSet[] | undefined, exerciseName: string) {
  /*
   * ⛔ SCOPED TO THE BLOCK (found in the 2026-08-04 hermetic pass). `setIndexInExercise` restarts at
   * 0 for a lift the coach split across two blocks, so collecting every set of the lift put block
   * one's reps into block two's row — three figures from work she finished twenty minutes earlier.
   * The plan runs front to back, so the current block is the trailing run beginning at the last 0.
   */
  const picked: { reps: number; weight: number | null; at: number }[] = [];
  (logged ?? []).forEach((set, i) => {
    if (steps[i]?.exerciseName !== exerciseName) return;
    picked.push({ reps: set.reps, weight: set.weight, at: steps[i]?.setIndexInExercise ?? 0 });
  });
  let start = 0;
  for (let i = 0; i < picked.length; i += 1) if (picked[i].at === 0) start = i;
  const block = picked.slice(start);
  return { reps: block.map((x) => x.reps), loads: block.map((x) => x.weight) };
}

/** The four fields the wrist's set row needs, assembled once for every phase. */
function soFarFields(steps: MirrorStep[], inp: MirrorInputs, exerciseName: string) {
  const { reps, loads } = soFarOnLift(steps, inp.loggedSets, exerciseName);
  return {
    setsSoFar: reps,
    loadsSoFar: loads,
    lastReps: inp.lastTime?.reps ?? [],
    lastLoadKg: inp.lastTime?.loadKg ?? null,
  };
}

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
  // WT13c · GLANCE — her own work so far, computed ONCE for every frame (the glance is reachable
  // from any live phase, so it cannot hang off the terminal branch below).
  const liveSets = inp.completedSets ?? 0;
  const liveVolumeKg = (inp.loggedSets ?? []).reduce((sum, x) => sum + (x.weight ?? 0) * x.reps, 0);

  if (machine.phase === 'SESSION_SAVED' || machine.phase === 'WELL_DONE') {
    /*
     * ⛔ THE FALLBACK READ THE DEAD ENGINE TOO (2026-08-04 audit). `reasonType` is never written on a
     * coach-built plan, so this branch produced 0 for every coach athlete — on the wrist and on the
     * Lock Screen, which is where a closing frame is actually read.
     *
     * `progressedLifts` is the measured answer (`progressedLiftCount` — a load that ends the session
     * higher than it started it, which is what "raised this session" has always meant). This is only
     * reached when the caller supplies nothing, and 0 is the honest answer then: an unmeasured count
     * is not a count.
     */
    const up = 0;
    const startedMs = inp.sessionStartedAtMs ?? null;
    const summary: MirrorSummary = {
      timeLabel: startedMs != null ? formatDuration(nowMs - startedMs) : '—',
      // Truthful: the sets the athlete ACTUALLY logged (not the planned total) — an
      // early finish must never report every planned set as done.
      sets: inp.completedSets ?? total,
      up: inp.progressedLifts ?? up,
      // External tonnage actually moved — from the ACTUALS, in step order. Bodyweight sets
      // (weight null) contribute 0, exactly as the read-back's volume comparator treats them.
      volumeKg: (inp.loggedSets ?? []).reduce((sum, s) => sum + (s.weight ?? 0) * s.reps, 0),
      kcal: inp.kcal ?? null,
      lifts: summaryLifts(steps, inp.completedSets ?? total, inp.loggedSets),
      milestone: inp.milestone ?? null,
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
      targetRepsHi: cur.repBandHi ?? null,
      ...soFarFields(steps, inp, cur.exerciseName),
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
      liveVolumeKg,
      liveSets,
      restIsLearned: inp.restIsLearned ?? false,
      summary,
      swapOptions: [],
      nextSwapOptions: [],
      loadSetup: null,
      nextLoadSetup: null,
      toLoad: false,
      correction: null,
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
    const baseS = effPhase === 'REST_INTER' ? restInterS : restTransitionS;
    const restS = baseS + (inp.restExtraS ?? 0);
    // THE RING'S DENOMINATOR IS THE PRESCRIBED REST, AND +15 DOES NOT MOVE IT (founder 2026-07-13:
    // "+15 on the watch drops the animation by 15 seconds and climbs back — I want it to rise from
    // where it is, exactly like the phone"). The phone's ring adds the 15 s to the NUMERATOR only,
    // so the arc fills FORWARD by a visible 15/total slice. Growing the total here made every
    // mirrored ring (watch, Live Activity) compute a smaller fraction of a longer rest and lurch
    // backwards before recovering — the same 15 seconds, told as a loss. The END still moves out:
    // that is what "+15" means. Only the yardstick stays put.
    restTotalS = baseS;
    const startMs = restStartedAtMs ?? nowMs;
    const endMs = startMs + restS * 1000;
    // TOTAL MEANS TOTAL. `new Date(NaN).toISOString()` throws a RangeError, and this projection
    // runs inside the store's publish effect — a single poisoned number (a corrupt +15 from the
    // wire, a broken clock) would have taken the live workout down with it. An unusable end is
    // simply no end: the surfaces render a rest without a countdown, and the athlete trains on.
    if (Number.isFinite(endMs)) {
      restEndsAt = new Date(endMs).toISOString();
      restRemainingS = Math.max(0, Math.round((endMs - nowMs) / 1000));
    }
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
    ...soFarFields(steps, inp, cur.exerciseName),
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
    targetRepsHi: cur.repBandHi ?? null,
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
    liveVolumeKg,
    liveSets,
    restIsLearned: inp.restIsLearned ?? false,
    summary: null,
    swapOptions: phase === 'active_set' ? cur.swapOptions ?? [] : [],
    nextSwapOptions: isTransition && next ? next.swapOptions ?? [] : [],
    // Equipment-native setup (kg): the current set's during a live set, the upcoming
    // exercise's during a transition rest — so the watch shows how to load it.
    loadSetup: phase === 'active_set' ? cur.loadSetup ?? null : null,
    nextLoadSetup: isTransition && next ? next.loadSetup ?? null : null,
    // TO-LOAD only matters on the live set; the caller computes it from the logged sets.
    toLoad: phase === 'active_set' ? inp.toLoad ?? false : false,
    // ONLY on an inter-set rest. Two reasons, and both matter:
    //  - On the ACTIVE SET she is lifting, and the load in front of her IS the corrected one —
    //    announcing it there would narrate the present, not the change.
    //  - On a TRANSITION rest the athlete is already looking at a different lift, and a correction
    //    belongs to the exercise it was measured on (SessionFlow holds the same guard, as
    //    `correction.exerciseId === nextExerciseId`). Loop 1 makes the last set of an exercise a
    //    no-op (liveSession.ts — there is no next set to correct), so a live correction on a
    //    transition frame should be impossible; this states that invariant instead of inheriting
    //    it from a rule two modules away. The wrist must never say "I added weight" over the name
    //    of a lift that earned nothing.
    correction: phase === 'rest_inter' ? inp.correction ?? null : null,
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
