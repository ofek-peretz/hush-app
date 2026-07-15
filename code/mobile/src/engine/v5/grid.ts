/**
 * Hush Engine v5 — the equipment grid (F-2, seeded by B-6).
 *
 * Rungs are the loads that PHYSICALLY EXIST. The engine decides an ideal load; the grid maps it to a
 * real, loadable weight. Her performed loads (`observedLoads`) are the real rungs; before she has
 * performed any, the starting increment (B-6) stands in. Snapping is always DOWN — normalization can
 * only lower an implied load, never raise it (the safety invariant).
 *
 * A prescribed rung is a SUGGESTION, not a requirement (F-2): if the exact rung is not on the floor
 * she is standing on today, she loads the nearest weight that is, and that performed load becomes the
 * truth the loops read. So the grid never has to know which gym she is in.
 */

import type { Equipment } from '@/engine/v4/constants';
import { STARTING_INCREMENT } from './constants';

const EPS = 1e-9;

/** The sorted, de-duped real rungs she has performed, or [] if none yet. */
function rungsOf(observedLoads?: number[]): number[] {
  if (!observedLoads || observedLoads.length === 0) return [];
  return Array.from(new Set(observedLoads.filter((x) => x > 0))).sort((a, b) => a - b);
}

/**
 * Snap an ideal load DOWN to the nearest real rung (F-2). With a known grid, round down to the
 * nearest performed load at or below the ideal; above her max performed load (normal progression
 * past her best), or with no grid yet, fall back to the starting increment (B-6).
 */
export function snapDown(ideal: number, equipment: Equipment, observedLoads?: number[]): number {
  const rungs = rungsOf(observedLoads);
  if (rungs.length > 0 && ideal <= rungs[rungs.length - 1] + EPS) {
    let down = rungs[0];
    for (const r of rungs) if (r <= ideal + EPS) down = r;
    return down;
  }
  const inc = STARTING_INCREMENT[equipment];
  if (inc <= 0) return ideal;
  return Math.floor(ideal / inc + EPS) * inc;
}

/**
 * The next real rung strictly ABOVE `load` (the smallest step up that exists). Uses her grid when
 * `load` sits within it; otherwise the starting increment. This is the unit "one rung" means
 * everywhere in the engine.
 */
export function nextRung(load: number, equipment: Equipment, observedLoads?: number[]): number {
  const rungs = rungsOf(observedLoads);
  for (const r of rungs) if (r > load + EPS) return r;
  const inc = STARTING_INCREMENT[equipment];
  if (inc <= 0) return load;
  // Above her observed max (or no grid): step by the increment from the current load.
  return Math.round((load + inc) / inc) * inc;
}

/** The previous real rung strictly BELOW `load` (one honest step down), floored at the increment. */
export function prevRung(load: number, equipment: Equipment, observedLoads?: number[]): number {
  const rungs = rungsOf(observedLoads);
  let below: number | null = null;
  for (const r of rungs) if (r < load - EPS) below = r;
  if (below != null) return below;
  const inc = STARTING_INCREMENT[equipment];
  if (inc <= 0) return load;
  const stepped = load - inc;
  return stepped >= inc - EPS ? stepped : inc; // never below the smallest loadable weight (S-55)
}

/** Move `n` rungs from `load` (n>0 up, n<0 down). One call per rung so a sparse grid steps rung-wise. */
export function moveRungs(load: number, n: number, equipment: Equipment, observedLoads?: number[]): number {
  let cur = load;
  for (let i = 0; i < Math.abs(n); i++) {
    cur = n > 0 ? nextRung(cur, equipment, observedLoads) : prevRung(cur, equipment, observedLoads);
  }
  return cur;
}

/** The smallest loadable weight that physically exists (the load floor, S-55). */
export function loadFloor(equipment: Equipment, observedLoads?: number[]): number {
  const rungs = rungsOf(observedLoads);
  if (rungs.length > 0) return rungs[0];
  return STARTING_INCREMENT[equipment] || 0;
}
