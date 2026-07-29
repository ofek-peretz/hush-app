/**
 * Hush Engine v5 — reps-per-rung (Loop 1's "how far to move," B-5 until fitted, then F-13).
 *
 * "How many reps is one rung worth?" is measured from HER history on a lift — the Theil–Sen slope of
 * her (load, reps) sets — and it obeys L3: only like-for-like sets enter the fit (known, similar
 * rest, F-11), and only the recency window (F-8). Until she has F-12 like-for-like pairs, there is no
 * fitted slope and a correction moves ONE cautious rung (B-5). No invented slope ever moves iron.
 */

import type { Band, SetPerf, SessionRecord, ExerciseMeta } from './types';
import { median } from './stats';
import { nextRung, isBigJump } from './grid';
import { MIN_PAIRS_FOR_SLOPE, REST_BAND_WIDTH_S, RECENCY_WINDOW_SESSIONS, BOOTSTRAP_RUNGS_PER_MOVE } from './constants';

interface FitPoint {
  load: number;
  reps: number;
  rest: number;
  /** Which OCCURRENCE the set belongs to. 0 = the live session; 1..n = the history records. */
  occurrence: number;
  /** WHERE in the exercise the set sits — set 1, set 2, set 3… Fatigue is a function of this. */
  position: number;
}

/** Collect like-for-like fit points from the recent history + this session (weighted, known rest). */
function fitPoints(session: SetPerf[], history: SessionRecord[]): FitPoint[] {
  const pts: FitPoint[] = [];
  const push = (s: SetPerf, occurrence: number, position: number) => {
    if (s.isApproach || s.load == null || s.load <= 0 || s.reps <= 0 || s.restBeforeS == null) return;
    pts.push({ load: s.load, reps: s.reps, rest: s.restBeforeS, occurrence, position });
  };
  session.forEach((s, i) => push(s, 0, i));
  history.slice(0, RECENCY_WINDOW_SESSIONS).forEach((rec, i) => {
    rec.sets.forEach((s, j) => push(s, i + 1, j));
  });
  return pts;
}

/**
 * Reps lost per one rung of added load, or null if not yet fittable. Positive = heavier costs reps
 * (the normal case). Theil–Sen over the like-for-like pairs (F-11), scaled by the size of one real
 * rung. An implausible non-positive result falls back to null (→ the bootstrap).
 */
export function repsPerRung(
  session: SetPerf[],
  history: SessionRecord[],
  meta: ExerciseMeta,
  /**
   * Price the rung at THIS load — the step she is actually about to be asked for. A rung is not one
   * size across a grid: on a `[40, 50]` stack the step from 40 costs 10 kg, while the step above her
   * top rung costs the equipment increment. Defaulting to her heaviest fitted load keeps every
   * existing caller identical, but S-28 must ask about the rung in FRONT of her or it prices a 2.5 kg
   * step for a 10 kg jump and never fires.
   */
  atLoad?: number,
): number | null {
  const pts = fitPoints(session, history);
  if (pts.length < 2) return null;

  const slopes: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.abs(pts[j].load - pts[i].load) < 1e-9) continue; // same load — no slope
      if (Math.abs(pts[j].rest - pts[i].rest) > REST_BAND_WIDTH_S) continue; // not like-for-like (L3)
      // ════ L3 ALSO MEANS THE SAME PLACE IN THE EXERCISE ════
      //
      // Set 1 and set 4 are not comparable however equal their rest: the accumulated fatigue between
      // them is a larger confound than the rest ever was, and it is not noise — it is signed. Loop 1
      // moves the load as the sets go on, so a set-1/set-4 pair reads "less weight AND fewer reps",
      // a POSITIVE slope, which drags the median toward zero, SHRINKS perRung, and — since a move is
      // headroom ÷ perRung — makes every correction BIGGER than her own number warrants.
      //
      // Refusing those pairs only WITHIN one occurrence closed half the door. Set 1 of Monday
      // against set 4 of Thursday carries the identical confound, and across a sixteen-week
      // simulation it was the dominant one: a fitted 1.0 rep/rung where her real number was 2.5, so
      // a 12-rep set on a 7 kg dumbbell raised her TWO rungs, she got 6 reps, the occurrence stopped
      // clearing — and S-22 needs every set to clear. Loop 1's overshoot was quietly cancelling
      // Loop 2's progression, over and over.
      //
      // So the pair must come from two different occurrences AND the same place in the exercise.
      // When that leaves too few pairs, F-12 is not met and B-5's one cautious rung stands — the
      // failure direction that cannot hurt her.
      if (pts[i].occurrence === pts[j].occurrence) continue;
      if (pts[i].position !== pts[j].position) continue;
      slopes.push((pts[j].reps - pts[i].reps) / (pts[j].load - pts[i].load));
    }
  }
  if (slopes.length < MIN_PAIRS_FOR_SLOPE) return null;

  const medSlope = median(slopes); // d(reps)/d(kg), typically negative
  const priceAt = atLoad ?? Math.max(...pts.map((p) => p.load));
  const rungKg = nextRung(priceAt, meta.equipment, meta.observedLoads) - priceAt;
  const perRung = -medSlope * (rungKg > 0 ? rungKg : 1);
  return perRung > 0 ? perRung : null;
}

/**
 * How many rungs a move of `headroomReps` (reps above/below the band edge) is worth. With a fitted
 * reps-per-rung, size the move to her number; without one, B-5 — a single cautious rung. Always ≥ 1.
 */
export function rungsForHeadroom(headroomReps: number, perRung: number | null): number {
  if (perRung == null || perRung <= 0) return BOOTSTRAP_RUNGS_PER_MOVE;
  return Math.max(1, Math.floor(Math.abs(headroomReps) / perRung));
}

/**
 * ════ S-28 · IS THE NEXT RUNG OUT OF REACH? ════
 *
 * The register's two conditions, in ONE place, so the between-session door and the in-session door
 * cannot answer differently (they each carried their own copy, and a law that holds on one path and
 * not its neighbour is how every defect in this engine's audit got in):
 *
 *   1. **NO MICRO-LOADING** — the step in front of her is coarse.
 *   2. **THE LOAD CANNOT MOVE WITHOUT BREAKING HER** — her own measured reps-per-rung says the step
 *      lands her under `Tlo`. Released by the same number read the other way: when her reps give a
 *      full rung's worth of headroom, the rung is taken.
 *
 * ── What was wrong with condition 1 ──────────────────────────────────────────────────────────────
 *
 * It was ONLY `grid.isBigJump` — "her learned rung is bigger than the equipment's finest step" — and
 * that is an ABSOLUTE test of a RELATIVE fact. A 2.5 kg step is micro-loading on a 43 kg bench (6%)
 * and the opposite of micro-loading on a 5 kg cable (50%), yet 2.5 kg IS the finest step a cable
 * stack offers, so `isBigJump` returned **false exactly where the situation was most true.**
 *
 * Sixteen simulated weeks show what that cost. On every light cable, light machine and light
 * dumbbell — a woman's lateral raise, a man's glute kickback, everyone's calf raise — the session
 * read `19 / 12 / 5 / 4`: Loop 1, unblocked, took a rung worth half her load, she failed the rest of
 * the exercise, and Loop 2's anchor (the MEDIAN of the loads she met `Tlo` at) then landed *below*
 * the heaviest load she had actually held to contract. Next occurrence started there and walked up
 * again. The lift never left the bottom of the stack: 26 of 125 lifts finished under 85% of her real
 * capacity, some at 50%.
 *
 * ── The second reading of condition 1, and why it needs no constant ───────────────────────────────
 *
 * "No micro-loading" means the grid is too coarse **for her**, and the engine already owns the ruler
 * that says so: **her band.** If one rung costs her more reps than the band is WIDE, then no two
 * consecutive rungs can both sit inside `[Tlo, Thi]` — there is literally no load on this equipment
 * that lets her climb and stay in her contract. That is "the load cannot move without breaking her",
 * measured, from `perRung` (her statistic) and `T` (hers). No number was invented.
 *
 * It leaves S-22 untouched where the register insists: a barbell bench fits ~1.9 reps in a 2.5 kg
 * rung against a band 2 wide → not out of reach, "all three sets hit 8, the row goes to 47.5" still
 * holds. It fires on the 10 kg-pin machine of the register's own example, and on the 5 kg cable the
 * register never imagined.
 */
export function rungOutOfReach(
  load: number,
  band: Band,
  perRung: number | null,
  meta: ExerciseMeta,
  /** The reps the decision is priced against — the occurrence's worst set, or the set just performed. */
  reps: number,
): boolean {
  // Silent until her slope is fitted (F-12): with no measured perRung there is no FACT that the jump
  // breaks her, and B-5's one cautious rung stands.
  if (perRung == null || perRung <= 0) return false;
  const coarse =
    isBigJump(load, meta.equipment, meta.observedLoads) || // her learned grid skips steps
    perRung > band.hi - band.lo; // …or one rung is wider than her whole band
  return coarse && reps - perRung < band.lo;
}
