/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HUSH ENGINE v5 — SHE STOPPED, AND THE ENGINE SAW NOTHING.
 *
 * ⛔ FOUNDER'S LIST, 2026-08-16. Measured before it was written, on an athlete given eight ordinary
 * weeks and then a gap, with a conservative body model (about 10% of strength per month away,
 * levelling out at 70% of peak — the safe end of the literature):
 *
 *     away  90 days   incline barbell press   asked 30 kg  →  she gets  0 reps
 *                     machine row             asked 32.5   →  she gets  0 reps
 *     away 180 days   incline barbell press   asked 30 kg  →  she gets  0 reps
 *                     dumbbell curl           asked  9 kg  →  she gets  3 reps
 *
 * Four lifts out of four, two of them a weight she cannot move once. That is the first session of a
 * comeback — the single session in her whole history where the app most has to be right — and Loop 1
 * has TWO corrections to rescue it (S-13). It cannot.
 *
 * ── WHY THE REGISTER ALLOWED IT, AND WHY THAT REASONING NOW HAS A COUNTEREXAMPLE ─────────────────
 * F-8 windows every measured statistic, and exempts exactly one thing: *"a raw completed load used
 * only to SEED a prescription (S-9) is exempt — a weight she lifted is a fact whatever its age; what
 * catches a stale seed is Loop 1, from set 1."* The exemption is reasonable and its stated guard is
 * measurably false at this magnitude. Loop 1 corrects by rungs from where it starts; it cannot walk
 * back thirty percent in two moves.
 *
 * ── WHY THIS IS A BOOTSTRAP AND NOT A THEORY ────────────────────────────────────────────────────
 * Detraining is the one thing about her the engine genuinely cannot measure: there is no data during
 * a gap, by definition. The register has exactly one category for a number like that — a BOOTSTRAP,
 * *"theory-laden by nature and acceptable ONLY because a fact of hers replaces them fast (L2)"* —
 * and this one is replaced by her very first set back, which is faster than any other B-constant.
 *
 * ⚠️ AND IT ERRS LIGHT ON PURPOSE. Too light costs her one under-loaded session and Loop 1 raises
 * inside it; too heavy costs her the comeback. The two are not symmetric and this is not tuned to
 * the midpoint of the evidence — it is tuned to the safe end of it.
 *
 * ── ⛔⛔ BUILT AND NOT WIRED — TWO RATIFIED LAWS SAY WHERE IT MUST NOT GO (2026-08-16) ────────────
 * Two placements were tried and measured, and each broke a law that is right:
 *
 *   · **Inside `currentV5Targets`** — S-9, S-29 and S-43 assert that the façade reports the load the
 *     engine DECIDED. Decaying it there made the façade disagree with its own stored state.
 *   · **Inside `fixtureModel.sessionTargets`** — `everyScreenShowsTheEngineNumber` asserts that
 *     *"every load on the stage is the engine state, not a seed or a last-logged weight"*, and this
 *     showed her a number no decision produced. That is exactly the defect class this codebase spent
 *     the day removing (a rest median nothing ran, a "your pace" badge on the coach's number).
 *
 * ⚠️ SO DETRAINING IS A DECISION, NOT A FILTER. It has to be written into `ExerciseState.load` and
 * LOGGED as a change, so the load on the screen is a load the engine chose and the Saturday mirror
 * can say it out loud — *"you were away eleven weeks, so I brought your loads down"* (S-45/R7). The
 * open question is only the TRIGGER: `advanceV5` folds a completed session, which is one session too
 * late for the session she is about to do, so the comeback has to be enacted where it is already
 * detected (`comebackAfterGap`, which drives the Welcome Back screen).
 *
 * Pure. Reads no clock — the caller supplies the gap (I-24).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { COMEBACK_DAYS } from '@/domain/comeback';
import { DETRAIN_RETAINED_PER_MONTH, DETRAIN_FLOOR } from './constants';

/**
 * The fraction of her prescribed load she is assumed to have kept after `daysAway` without training.
 * `1` inside the grace window — an ordinary week off is not detraining, and the product already
 * declares where a gap becomes a comeback (`COMEBACK_DAYS`).
 */
export function retainedAfterGap(daysAway: number): number {
  if (!Number.isFinite(daysAway) || daysAway < COMEBACK_DAYS) return 1;
  const months = (daysAway - COMEBACK_DAYS) / 30;
  return Math.max(DETRAIN_FLOOR, DETRAIN_RETAINED_PER_MONTH ** months);
}

/**
 * Her most recent session start (ms), or `0` when she has never trained.
 *
 * ⚠️ THIS IS ALSO THE IDENTITY OF THE GAP. `applyDetrainingV5` stamps it as `detrainedAfter`, so the
 * decay for one layoff is taken exactly once however many times the prescription is read.
 */
export function lastSessionStartMs(startedAtMs: readonly number[]): number {
  let last = 0;
  for (const t of startedAtMs) if (Number.isFinite(t) && t > last) last = t;
  return last;
}

/**
 * Whole days between her most recent session and `nowMs`. `0` when she has never trained — that is a
 * beginning, not a return, and B-1 owns the opening load there.
 */
export function daysSinceLastSession(startedAtMs: readonly number[], nowMs: number): number {
  const last = lastSessionStartMs(startedAtMs);
  if (last <= 0) return 0;
  return Math.max(0, Math.floor((nowMs - last) / 86400000));
}
