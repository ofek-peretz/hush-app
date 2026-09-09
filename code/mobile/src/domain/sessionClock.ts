/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SESSION CLOCK — it ends rests. It never writes a set.
 *
 * ── THE RULING (founder, 2026-09-09, after a workout on build 71) ────────────────────────────────
 *   > *"הסט האוטומטי עדיין קיים אפילו שאמרתי לך לבטל אותו לגמרי."*
 *
 * From 2026-09-07 to 2026-09-09 this clock PRESUMED sets: when a set's expected duration passed
 * with no word from her, the prescription was written in her name (marked `presumed`), the rest
 * ran, the next set was presented. Law 4 (2026-09-08) limited that to one presumption per word of
 * hers; the founder then cancelled it outright. A set is written by her hand, her voice, her wrist
 * or the lock screen — never by time. What the clock still does, and must: a REST she started
 * runs on the wall clock, so a phone that slept in a pocket through the whole rest presents the
 * next set at the instant the rest ended (not at the wake), and the pocket ASKS about a set that
 * has run long (`platform/setNudge`) instead of answering for her.
 *
 * Pure and wall-clock-injected, so the same rule runs whether the app is in the foreground (a JS
 * timer fires at the due instant) or comes back after twenty minutes in a locker (one call catches
 * up through every rest that fell due while it slept — the discipline `sessionRecovery.reconcileResume`
 * already keeps for a rest).
 *
 * ── WHAT IT NEVER DOES ──────────────────────────────────────────────────────────────────────────
 * Write a set (there is no `PRESUME_SET` any more — the reducer does not know the word). End a
 * session. Move a paused workout (frozen, §7.2). Present a set from a rest it has no anchor for.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
//
import { sessionReducer, type SessionMachine } from '@/state/machines/sessionState';

/** The slice of a plan step the clock reads. */
export interface ClockStep {
  exerciseId: string;
  exerciseSetIndex: number;
  target?: { recommendedReps: number; repBandLo?: number } | null;
  item?: { kind: string };
  warmup?: unknown;
  lastSetOfExercise: boolean;
  lastSetOfSession: boolean;
}

export type ClockTick =
  /** A rest ran out at `atMs`. `restS`: how long it ran (prescribed + any "+15") — hers to bank. */
  { kind: 'rest_elapsed'; atMs: number; restS: number };

export interface ClockInput<S extends ClockStep> {
  plan: S[];
  machine: SessionMachine;
  /** When the running rest began (epoch ms); null when not resting. */
  restStartedAtMs: number | null;
  /** Seconds added to the running rest ("+15"). */
  restExtraS: number;
  /** The rest the step earns after it — the store's `restAfterStep`. */
  restAfterStep: (step: S) => number;
  nowMs: number;
}

export interface ClockResult {
  machine: SessionMachine;
  ticks: ClockTick[];
  /** When the set now on screen was presented — the instant its rest ENDED — or null when no rest
   *  ran out in this walk (the caller keeps the stamp it has). */
  presentedAtMs: number | null;
  restStartedAtMs: number | null;
  restExtraS: number;
}

/**
 * Run the clock forward to `nowMs`. Returns every rest that ran out, in order, and the state the
 * machine and the anchors are in afterwards. Zero ticks means nothing was due: the caller changes
 * nothing. Pure — the caller banks the rest and persists.
 *
 * At most ONE rest can fall due per walk: the set the rest ends into is hers to log, and until she
 * does no further rest exists. So this is a single step, written as a function for the callers
 * that were built around a walk.
 */
export function runClock<S extends ClockStep>(inp: ClockInput<S>): ClockResult {
  const { plan, restAfterStep, nowMs } = inp;
  const machine = inp.machine;
  const none: ClockResult = { machine, ticks: [], presentedAtMs: null, restStartedAtMs: inp.restStartedAtMs, restExtraS: inp.restExtraS };
  if (machine.phase !== 'REST_INTER' && !machine.phase.startsWith('REST_TRANSITION')) return none; // a set, paused, saved — nothing for a clock to do
  if (inp.restStartedAtMs == null) return none;
  const step = plan[machine.setIndex];
  if (!step) return none;
  const restS = restAfterStep(step) + inp.restExtraS;
  const endMs = inp.restStartedAtMs + restS * 1000;
  if (nowMs < endMs) return none;
  const next = sessionReducer(machine, { type: 'REST_ELAPSED' });
  if (next === machine) return none;
  return {
    machine: next,
    ticks: [{ kind: 'rest_elapsed', atMs: endMs, restS }],
    presentedAtMs: endMs,
    restStartedAtMs: null,
    restExtraS: 0,
  };
}
