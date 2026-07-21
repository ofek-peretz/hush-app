/**
 * Hush Engine v5 — reps-per-rung (Loop 1's "how far to move," B-5 until fitted, then F-13).
 *
 * "How many reps is one rung worth?" is measured from HER history on a lift — the Theil–Sen slope of
 * her (load, reps) sets — and it obeys L3: only like-for-like sets enter the fit (known, similar
 * rest, F-11), and only the recency window (F-8). Until she has F-12 like-for-like pairs, there is no
 * fitted slope and a correction moves ONE cautious rung (B-5). No invented slope ever moves iron.
 */

import type { SetPerf, SessionRecord, ExerciseMeta } from './types';
import { median } from './stats';
import { nextRung } from './grid';
import { MIN_PAIRS_FOR_SLOPE, REST_BAND_WIDTH_S, RECENCY_WINDOW_SESSIONS, BOOTSTRAP_RUNGS_PER_MOVE } from './constants';

interface FitPoint {
  load: number;
  reps: number;
  rest: number;
}

/** Collect like-for-like fit points from the recent history + this session (weighted, known rest). */
function fitPoints(session: SetPerf[], history: SessionRecord[]): FitPoint[] {
  const pts: FitPoint[] = [];
  const push = (s: SetPerf) => {
    if (s.isApproach || s.load == null || s.load <= 0 || s.reps <= 0 || s.restBeforeS == null) return;
    pts.push({ load: s.load, reps: s.reps, rest: s.restBeforeS });
  };
  for (const s of session) push(s);
  for (const rec of history.slice(0, RECENCY_WINDOW_SESSIONS)) for (const s of rec.sets) push(s);
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
