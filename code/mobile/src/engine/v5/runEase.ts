/**
 * ════ THE RUN IS CARRIED INTO HER LEGS — readiness without a questionnaire (2026-08-24) ════
 *
 * The competitive review's finding, verbatim: nobody in the market folds EXTERNAL work into the
 * strength prescription. Fitbod ingests activity but explains nothing; Juggernaut asks a morning
 * survey; RP asks five. Hush's rule (L1) is that the engine acts on facts it MEASURED — and a run
 * is the one readiness fact this product already measures to the metre, with no question asked.
 *
 * THE FACT.  A real run — her recorded gait says 'run', and it was long enough to cost her legs
 * something (`RUN_EASE_MIN_KM` km or `RUN_EASE_MIN_SEC` of it) — ended within `RUN_EASE_WINDOW_H`
 * hours of the session she is about to be handed.
 *
 * THE ANSWER.  Her LOWER-BODY lifts start ONE RUNG easier (the equipment's own ladder — the same
 * honest step every other decision moves by), stamped in the changeLog like any decision, each
 * carrying the run that earned it ("You ran 8 km yesterday"). Upper-body lifts are untouched; the
 * run cost her legs, not her bench.
 *
 * ── ⚠️ A CAUTIOUS START, NOT A VERDICT — the deliberate difference from the deload ──────────────
 * A deload's lightness IS the decision, so Loop 1 is forbidden to raise under it. The ease is a
 * caution the evidence may overturn: if her first sets say the legs are fine, Loop 1 raises
 * exactly as it always does, and the caution costs one set. That is why there is NO `deloadHold`
 * here — the live loop stays the judge.
 *
 * ── THE WINDOW'S LIFECYCLE (same discipline as the deload) ──────────────────────────────────────
 *   · OPENED at the fold/read where the fact exists — never on a calendar, never twice for the
 *     same run (`lastRunEasedForMs` is the idempotency stamp, exactly `detrainedAfter`'s shape).
 *   · While open, an EASED lift's occurrence does not fold — one deliberately-light occurrence is
 *     not capability news — but every other lift of that session folds normally.
 *   · CLOSED the moment an eased lift has been trained inside the window, or when the window
 *     lapses — even on a pure read. Loads walk back to exactly where they stood, stamped.
 *   · Never opens during a light week (the deload already answered), and the deload trigger holds
 *     its question while an ease is open — one decision speaks at a time.
 *
 * Pure and clock-free: every function reads the timestamps it is handed.
 */

//

export const RUN_EASE_WINDOW_H = 36;
/** A run this long costs the legs something. Shorter and faster is training, not fatigue. */
export const RUN_EASE_MIN_KM = 5;
export const RUN_EASE_MIN_SEC = 30 * 60;
/**
 * Hysteresis between eases (review find, 2026-08-24): a hybrid athlete who runs every other day
 * is ADAPTED to running — easing every leg day she has would be the chronic under-loading Fitbod
 * is complained about for. The ease answers the OCCASIONAL long run; four days between answers is
 * what "occasional" means. A run inside the cooldown is simply never answered (its window will be
 * dead by the time the cooldown is not).
 */
export const RUN_EASE_COOLDOWN_H = 96;

/** The muscles a run spends — the canonical lower-body names (engine/v5/constants). */
export const RUN_EASE_MUSCLES: ReadonlySet<string> = new Set(['Quads', 'Hamstrings', 'Glutes', 'Calves']);

const HOUR_MS = 60 * 60 * 1000;

/** The open ease, as stored on EngineV5State. `restore` holds every pre-ease load. */
export interface RunEaseState {
  startedAt: number; // when the ease opened (the fold/read that saw the run)
  endsAt: number; // run end + RUN_EASE_WINDOW_H
  /** The run that earned it — `startedAt` ms of the cardio record (the idempotency key). */
  runAtMs: number;
  /** Rounded km, for the sentence; null when the run qualified by duration alone. */
  runKm: number | null;
  restore: Record<string, number | null>;
}

/** The slice of a cardio record the trigger reads — structural, so the module stays pure. */
export interface RunView {
  gait: 'run' | 'walk';
  startedAt: string; // ISO
  durationSec: number;
  distanceKm: number;
}

/** Does this recorded activity qualify as a leg-spending run? */
export function runQualifies(run: RunView): boolean {
  if (run.gait !== 'run') return false; // a walk is recovery, not a cost
  return run.distanceKm >= RUN_EASE_MIN_KM || run.durationSec >= RUN_EASE_MIN_SEC;
}

/** When this run's ease window closes (ms). */
export function runEaseEndsAt(run: RunView): number {
  return Date.parse(run.startedAt) + run.durationSec * 1000 + RUN_EASE_WINDOW_H * HOUR_MS;
}

/**
 * The most recent qualifying run whose window is still open at `atMs` and that has not already
 * been answered (`answeredThroughMs` — the `lastRunEasedForMs` stamp). Null when there is none.
 */
export function easeDueFor(
  runs: readonly RunView[],
  atMs: number,
  answeredThroughMs: number | null,
): RunView | null {
  let best: RunView | null = null;
  let bestAt = -Infinity;
  for (const run of runs) {
    const runAt = Date.parse(run.startedAt);
    if (!Number.isFinite(runAt)) continue;
    if (runAt <= (answeredThroughMs ?? -Infinity)) continue; // this run has been answered
    if (answeredThroughMs != null && runAt - answeredThroughMs < RUN_EASE_COOLDOWN_H * HOUR_MS) continue; // hysteresis — see RUN_EASE_COOLDOWN_H
    if (!runQualifies(run)) continue;
    const end = runEaseEndsAt(run);
    if (runAt > atMs) continue; // the future is not evidence
    if (atMs >= end) continue; // the window has lapsed — legs recovered on their own
    if (runAt > bestAt) {
      best = run;
      bestAt = runAt;
    }
  }
  return best;
}

/** Is `atMs` inside an open ease window? */
export function runEaseActiveAt(ease: RunEaseState | null | undefined, atMs: number): boolean {
  return ease != null && atMs >= ease.startedAt && atMs < ease.endsAt;
}
