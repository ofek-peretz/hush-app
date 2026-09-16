/**
 * Hush Engine v5 — reps-per-rung (Loop 1's "how far to move," B-5 until fitted, then F-13).
 *
 * "How many reps is one rung worth?" is measured from HER history on a lift — the Theil–Sen slope of
 * her (load, reps) sets — and it obeys L3: only like-for-like sets enter the fit (known, similar
 * rest, F-11), and only the recency window (F-8). Until she has F-12 like-for-like pairs, there is no
 * fitted slope and a correction moves ONE cautious rung (B-5). No invented slope ever moves iron.
 */

import type { Band, SetPerf, SessionRecord, ExerciseMeta } from './types';
import { theilSenSlope } from './stats';
import { nextRung, isBigJump } from './grid';
import { epley, loadForReps } from '@/engine/loadMath';
import {
  MIN_PAIRS_FOR_SLOPE,
  REST_BAND_WIDTH_S,
  RECENCY_WINDOW_SESSIONS,
  BOOTSTRAP_RUNGS_PER_MOVE,
  EPLEY_VALID_REPS,
} from './constants';

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

  /*
   * ⛔ ONE IMPLEMENTATION OF F-13 (2026-08-16). This loop WAS a second Theil–Sen, hand-rolled beside
   * the declared one in `stats.theilSenSlope` — which had no production caller at all. F-13 says
   * *"'a robust fit' is an algorithm FAMILY; this is the single algorithm chosen, and nothing else
   * may be substituted"*, and the engine carried two, of which the unused one was the one under test.
   *
   * The split had a real cause: L3 refuses a PAIR, not a point, and a fit that only sees `{x, y}`
   * cannot ask about rest, occurrence or position. `theilSenSlope` now takes the predicate, so the
   * estimator is shared and the FILTER — which is this file's business — stays here.
   *
   * ════ WHAT THE PREDICATE REFUSES, AND WHY EACH CLAUSE EARNED ITS PLACE ════
   *
   * · **Not like-for-like rest (L3).** A set after a three-minute breather is not evidence about a
   *   set after forty-five seconds.
   * · **The same occurrence.** Set 1 and set 4 are not comparable however equal their rest: the
   *   accumulated fatigue between them is a larger confound than the rest ever was, and it is not
   *   noise — it is SIGNED. Loop 1 moves the load as the sets go on, so a set-1/set-4 pair reads
   *   "less weight AND fewer reps", a POSITIVE slope, which drags the median toward zero, SHRINKS
   *   perRung, and — since a move is headroom ÷ perRung — makes every correction BIGGER than her own
   *   number warrants.
   * · **A different POSITION in the exercise.** Refusing pairs only within one occurrence closed
   *   half the door: set 1 of Monday against set 4 of Thursday carries the identical confound, and
   *   across a sixteen-week simulation it was the dominant one — a fitted 1.0 rep/rung where her
   *   real number was 2.5, so a 12-rep set on a 7 kg dumbbell raised her TWO rungs, she got 6 reps,
   *   and the occurrence stopped clearing. Loop 1's overshoot was quietly cancelling Loop 2's
   *   progression, over and over.
   *
   * When that leaves too few pairs, F-12 is not met and B-5's cautious step stands — the failure
   * direction that cannot hurt her.
   */
  const medSlopeRaw = theilSenSlope(
    pts.map((p) => ({ ...p, x: p.load, y: p.reps })),
    MIN_PAIRS_FOR_SLOPE,
    (a, b) =>
      Math.abs(b.rest - a.rest) <= REST_BAND_WIDTH_S &&
      a.occurrence !== b.occurrence &&
      a.position === b.position,
  );
  if (medSlopeRaw == null) return null;

  const medSlope = medSlopeRaw; // d(reps)/d(kg), typically negative
  const priceAt = atLoad ?? Math.max(...pts.map((p) => p.load));
  const rungKg = nextRung(priceAt, meta.equipment, meta.observedLoads) - priceAt;
  const perRung = -medSlope * (rungKg > 0 ? rungKg : 1);
  return perRung > 0 ? perRung : null;
}

/**
 * ════ B-5, DERIVED · WHAT ONE RUNG IS WORTH BEFORE SHE HAS A SLOPE ════
 *
 * Reps-per-rung at `load`, implied by the e1RM model the app already displays, when F-12 is not yet
 * met. One rep of headroom at the band edge `edgeReps` is worth `loadForReps(epley(load, edgeReps+1),
 * edgeReps) − load` kilograms — the model evaluated twice, with no algebra copied out of `loadMath`
 * and no constant invented. Divide the real rung by that and the answer is in the same units the
 * fitted statistic speaks in, so `rungsForHeadroom` needs to know nothing about which one it has.
 *
 * ⚠️ IT IS INDEPENDENT OF THE REPS SHE ACTUALLY DID — deliberately. The price of a rep is a property
 * of the load and the band, so the SAME slope sizes a 1-rep miss and a 20-rep overshoot; the miss's
 * magnitude enters through the headroom, exactly where the fitted path puts it.
 *
 * ⚠️ AND IT IS NOT FED TO `rungOutOfReach`. S-28 is a claim that a measured FACT of hers forbids the
 * step, and the register is explicit that it stays silent until F-12 is met. A modelled slope is not
 * that fact. This sizes a move; it never cancels one.
 *
 * Returns null when the model cannot price the step (no load, no rung) — there B-5's flat rung stands.
 */
export function bootstrapPerRung(load: number | null, edgeReps: number, meta: ExerciseMeta): number | null {
  if (load == null || !(load > 0) || !Number.isFinite(edgeReps)) return null;
  const rungKg = nextRung(load, meta.equipment, meta.observedLoads) - load;
  if (!(rungKg > 0)) return null;
  const kgPerRep = loadForReps(epley(load, edgeReps + 1), edgeReps) - load;
  if (!(kgPerRep > 0)) return null;
  return rungKg / kgPerRep;
}

/**
 * How many rungs a move of `headroomReps` (reps above/below the band edge) is worth. Her fitted
 * reps-per-rung first (F-13); else the modelled bootstrap (B-5, from `bootstrapPerRung`); else the
 * one cautious rung. Always ≥ 1.
 *
 * ⛔ THE ROUNDING IS ASYMMETRIC, BECAUSE THE TWO ERRORS ARE NOT THE SAME SIZE.
 *
 * Both directions used to round DOWN, which reads as caution and is only caution going up. Guessing
 * a raise too small costs one under-stimulating set. Guessing a DROP too small leaves her under a
 * weight that already beat her, for the rest of an exercise she has two corrections to escape — the
 * set is lost either way, and this one can hurt her. So a raise keeps `floor` (never prescribe iron
 * the evidence has not paid for) and a drop takes `ceil` (when the model is between two rungs, take
 * the lighter one).
 */
export function rungsForHeadroom(
  headroomReps: number,
  perRung: number | null,
  direction: 'up' | 'down' = 'up',
  /** B-5's modelled slope, used only when hers is not yet fitted. */
  fallbackPerRung: number | null = null,
): number {
  const slope = perRung != null && perRung > 0 ? perRung : fallbackPerRung;
  if (slope == null || slope <= 0) return BOOTSTRAP_RUNGS_PER_MOVE;
  // F-16 — past the end of the load–rep continuum the extra reps are not evidence about iron.
  const headroom = Math.min(Math.abs(headroomReps), EPLEY_VALID_REPS);
  const exact = headroom / slope;
  /*
   * ⛔ THE ASYMMETRY IS THE COACHING, AND IT WAS MEASURED — 2026-08-19.
   *
   * Read against L10 this line looks like the defect that explains the whole board: the register
   * says *"a move is sized by that number, never by a fixed step"*, and for the ordinary case
   * (2-rep band, 1–4 reps of overshoot, a real slope near 2.3 reps/rung) `floor` returns 0 and the
   * clamp makes it 1 — so her fitted slope and B-5's un-fitted model give the SAME integer, and
   * Loop 1 in week 10 emits exactly what it emitted in week 2. That reading is correct.
   *
   * ⚠️ AND RELEASING IT LOSES. Both arms were run on the full board (`thePrescriptionIsAccurate`):
   *
   *     floor on the up path (today) ..  58.3%   under 17.5   over 24.2   mean miss 0.87
   *     round on the up path .........   58.6%   under 17.8   over 23.6   mean miss 0.89
   *     ceil on both (symmetric) .....   58.9%   under 20.0   over 21.1   mean miss 0.93
   *
   * In-band buys 0.3–0.6 points and the MISSES GET BIGGER in both arms. The symmetric arm pays for
   * it in the wrong currency: `under` +2.5 points — sets she cannot finish — to buy `over` −3.1,
   * sets that were merely easy. Those two are not worth the same to an athlete, and
   * `theProgrammeSurvivesTheMonths` grades one of them and not the other.
   *
   * So the floor stays, and it is a DECISION rather than an accident: **a coach who is unsure errs
   * light.** A rung down is taken in full the moment she falls short; a rung up has to be earned
   * outright. The register's sentence is about not inventing a fixed step — this reads her slope
   * and then rounds the answer conservatively, which is a different thing and belongs in L10's text.
   */
  return Math.max(1, direction === 'down' ? Math.ceil(exact) : Math.floor(exact));
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
