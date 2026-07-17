/**
 * Hush engine — load math (engine-agnostic). The e1RM estimate and the equipment-grid snap used by
 * the COLD-START seed (`smartSeed`) before an athlete has engine state. Re-homed out of `engine/v4/`
 * (the v4 burial, S-58); v5's live progression uses its own learned grid (`engine/v5/grid`), but the
 * seed still needs a plausible day-one load from her history.
 */
import type { Equipment } from './catalog';

/** Epley one-rep-max estimate from a working set. */
export function epley(load: number, reps: number): number {
  return load * (1 + reps / 30);
}

/** The starting loadable increment per equipment class (the day-one grid before real loads refine it). */
export const LOAD_INCREMENT: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 1.0,
  machine: 2.5,
  cable: 2.5,
  bodyweight: 0,
};

/**
 * THE EMPTY BAR (kg) — the floor under every barbell load, because it is a fact of the room.
 *
 * A barbell lift cannot be lighter than the bar. Nothing enforced this except one clause in
 * `startingLoad`, scoped to `tier === 'compound'` — so the two barbell ISOLATION lifts in the
 * catalogue fell straight through it: `bb_curl` and `skullcrusher`, both `baseKg: 20`. Every
 * beginner was prescribed them at 20 × 0.78 = **16 kg**, and a beginner woman at 20 × 0.62 × 0.78 =
 * **10 kg**. You cannot put 10 kg on a 20 kg bar. The screen dutifully printed "Barbell Curl ·
 * 10 kg" and, because the per-side maths resolved to zero, offered no way to build it.
 *
 * The floor belongs HERE, at the choke point every prescribed load passes through, not in the seed
 * alone: a Loop 1 down-correction ("too heavy — ease it") walked under the bar by the same route,
 * from 20 kg to 17.5.
 *
 * It is a constant of the physical world, and `loadPresentation` does the athlete's plate maths
 * against the same number — so it is exported and shared rather than written down twice.
 */
export const BAR_KG = 20;

/** How close an ideal load must be to a performed rung to snap onto it (else the static increment). */
const GRID_SNAP_TOLERANCE_KG = 2.5;

/**
 * Snap an ideal load onto a real rung: within the athlete's performed range, snap DOWN to the nearest
 * rung she has actually used — but only within the tolerance, so a sparse grid never drags a
 * between-rungs ideal down (that froze progression). Above her max, or between distant rungs, defer to
 * the static increment. The grid refines among performed loads; it never caps progression.
 */
export function normalizeLoad(load: number, equipment: Equipment, grid?: number[]): number {
  // The bar is the floor, and it comes FIRST — before the grid and before the increment, because
  // neither of them knows what a barbell weighs. Her performed grid cannot contain a sub-bar rung
  // (she never lifted one), and the increment walk would happily step 20 → 17.5 → 15 on the way
  // down. See BAR_KG: a lift lighter than the bar is not a light lift, it is an impossible one.
  if (equipment === 'barbell' && load < BAR_KG) return BAR_KG;
  if (grid && grid.length > 0) {
    const rungs = Array.from(new Set(grid.filter((x) => x > 0))).sort((a, b) => a - b);
    const max = rungs[rungs.length - 1];
    if (load <= max + 1e-9) {
      let down: number | null = null;
      for (const x of rungs) if (x <= load + 1e-9) down = x;
      if (down != null && load - down <= GRID_SNAP_TOLERANCE_KG + 1e-9) return down;
    }
  }
  const inc = LOAD_INCREMENT[equipment];
  if (inc <= 0) return load;
  return Math.floor(load / inc) * inc;
}
