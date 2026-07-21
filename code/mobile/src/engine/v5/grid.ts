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

import type { Equipment } from '@/engine/catalog';
import { BAR_KG } from '@/engine/loadMath';
import { STARTING_INCREMENT } from './constants';

const EPS = 1e-9;

/** The sorted, de-duped real rungs she has performed, or [] if none yet. */
function rungsOf(observedLoads?: number[]): number[] {
  if (!observedLoads || observedLoads.length === 0) return [];
  return Array.from(new Set(observedLoads.filter((x) => x > 0))).sort((a, b) => a - b);
}

/**
 * S-55 — the smallest loadable weight that PHYSICALLY EXISTS: the empty bar, the smallest dumbbell,
 * the first pin. "A prescription may never fall to or below zero, or below the lightest weight that
 * physically exists."
 *
 * Two things were wrong here, and both put an impossible number on the stage:
 *
 *  1. **The bar was missing entirely.** `engine/loadMath.normalizeLoad` floors barbell loads at
 *     `BAR_KG` — but that is the COLD-START seed's path. v5's live progression walks its own grid,
 *     and this module had no idea a barbell weighs anything: a failed set on a `bb_curl` at 20 kg
 *     stepped the next set to 17.5, exactly the bug `__tests__/engine/barIsTheFloor.test.ts` was
 *     written to kill — killed on one path and left alive on the other. It reads the SAME constant
 *     now, for the reason that test gives: the number that decides what is loadable and the number
 *     that builds the plates must not be two numbers.
 *  2. **Her lowest PERFORMED load was being used as the floor.** It is not a floor — it is just the
 *     lightest weight she has happened to use. On a lift she has only ever done at one load (a new
 *     lift's second occurrence — very common) that made the floor equal to the current load, so a
 *     stall back-off clamped to a NO-OP and the lift froze at the wall for ever (S-25.1).
 *
 * What is actually known to be loadable is the smaller of: her lightest performed rung, and the
 * equipment's own increment (B-6). Nothing else is claimed.
 */
/**
 * F-2 — THE LEARNED GRID SPEAKS ONLY WITHIN THE RANGE SHE HAS PERFORMED.
 *
 * Her observed loads are the rungs we KNOW exist, not every rung that exists. Outside that range the
 * grid has nothing to say and the equipment increment (B-6) is the honest answer — the rule
 * `engine/loadMath.normalizeLoad` already documents ("above the max observed, or below min, or
 * no-grid → the static increment; the grid never caps progression") and the founder ratified for the
 * equipment layer.
 *
 * `snapDown` was missing the LOWER half of that rule, and it was not cosmetic. Its own header
 * promises "snapping is always DOWN — normalization can only ever lower an implied load, never
 * raise it (the safety invariant)", but with the ideal below her lowest rung the loop's initialiser
 * (`let down = rungs[0]`) returned that rung — a snap UP. On a lift she had only ever performed at
 * ONE weight — which is EVERY lift on its second session — Loop 1's drop computed 37.5, snapped
 * back to 40, and reported `corrected: false`. **The load could not ease.** That is the exact
 * shape of the Build #33 complaint ("no matter how many reps I write it stays at 34"), still alive
 * through a different door, on a path the band-floor fix never touched.
 */
function inRange(load: number, observedLoads?: number[]): boolean {
  const rungs = rungsOf(observedLoads);
  return rungs.length > 0 && load >= rungs[0] - EPS && load <= rungs[rungs.length - 1] + EPS;
}

export function loadFloor(equipment: Equipment, observedLoads?: number[]): number {
  if (equipment === 'barbell') return BAR_KG; // a fact of the room, not a statistic
  const inc = STARTING_INCREMENT[equipment] || 0;
  const rungs = rungsOf(observedLoads);
  if (rungs.length === 0) return inc;
  return inc > 0 ? Math.min(rungs[0], inc) : rungs[0];
}

/**
 * Snap an ideal load DOWN to the nearest real rung (F-2). With a known grid, round down to the
 * nearest performed load at or below the ideal; above her max performed load (normal progression
 * past her best), or with no grid yet, fall back to the starting increment (B-6).
 */
export function snapDown(ideal: number, equipment: Equipment, observedLoads?: number[]): number {
  const floor = loadFloor(equipment, observedLoads); // S-55 — nothing below what physically exists
  if (inRange(ideal, observedLoads)) {
    const rungs = rungsOf(observedLoads);
    let down = rungs[0];
    for (const r of rungs) if (r <= ideal + EPS) down = r;
    return Math.max(down, floor);
  }
  const inc = STARTING_INCREMENT[equipment];
  if (inc <= 0) return ideal;
  return Math.max(Math.floor(ideal / inc + EPS) * inc, floor);
}

/**
 * The next real rung strictly ABOVE `load` (the smallest step up that exists). Uses her grid when
 * `load` sits within it; otherwise the starting increment. This is the unit "one rung" means
 * everywhere in the engine.
 */
export function nextRung(load: number, equipment: Equipment, observedLoads?: number[]): number {
  const floor = loadFloor(equipment, observedLoads);
  // Only within her performed range (see `inRange`): below her lowest rung the grid would propose a
  // LEAP up to it, when the increment is a real, smaller, honest step.
  if (load >= (rungsOf(observedLoads)[0] ?? Infinity) - EPS) {
    for (const r of rungsOf(observedLoads)) if (r > load + EPS) return Math.max(r, floor);
  }
  const inc = STARTING_INCREMENT[equipment];
  if (inc <= 0) return load;
  // Above her observed max (or no grid): step by the increment from the current load. A load stored
  // below the floor (legacy state) climbs straight back onto it rather than crawling under it.
  return Math.max(Math.round((load + inc) / inc) * inc, floor);
}

/** The previous real rung strictly BELOW `load` (one honest step down), never under the floor (S-55). */
export function prevRung(load: number, equipment: Equipment, observedLoads?: number[]): number {
  const floor = loadFloor(equipment, observedLoads);
  // Only within her performed range: above her heaviest rung the grid would propose a PLUNGE down to
  // it (80 → 50 on a [40,50] grid) when the increment is one honest step (77.5).
  const rungs = load <= (rungsOf(observedLoads).at(-1) ?? -Infinity) + EPS ? rungsOf(observedLoads) : [];
  let below: number | null = null;
  for (const r of rungs) if (r < load - EPS) below = r;
  if (below != null) return Math.max(below, floor);
  const inc = STARTING_INCREMENT[equipment];
  if (inc <= 0) return load;
  return Math.max(load - inc, floor); // never below the smallest loadable weight (S-55)
}

/** How many kg the next real rung above `load` costs — the step she actually faces (F-2). */
export function rungSize(load: number, equipment: Equipment, observedLoads?: number[]): number {
  return nextRung(load, equipment, observedLoads) - load;
}

/**
 * S-28 — "the next rung is a BIG JUMP (a machine with 10 kg pins; **no micro-loading**)".
 *
 * The register defines the condition in that parenthesis, and both halves of it are already declared
 * facts: the rung she faces comes from her learned grid (F-2), and the equipment's own finest step is
 * the bootstrap B-6. **No micro-loading = the real rung is bigger than the increment.** On a barbell
 * the two are equal, so this is false and S-22 governs unchanged; on a stack that jumps 40 → 50 it is
 * true. No new constant, and nothing invented — the answer was in the situation's own wording.
 */
export function isBigJump(load: number, equipment: Equipment, observedLoads?: number[]): boolean {
  const inc = STARTING_INCREMENT[equipment];
  if (inc <= 0) return false; // bodyweight — no load axis (S-51)
  return rungSize(load, equipment, observedLoads) > inc + EPS;
}

/** Move `n` rungs from `load` (n>0 up, n<0 down). One call per rung so a sparse grid steps rung-wise. */
export function moveRungs(load: number, n: number, equipment: Equipment, observedLoads?: number[]): number {
  let cur = load;
  for (let i = 0; i < Math.abs(n); i++) {
    cur = n > 0 ? nextRung(cur, equipment, observedLoads) : prevRung(cur, equipment, observedLoads);
  }
  return cur;
}
