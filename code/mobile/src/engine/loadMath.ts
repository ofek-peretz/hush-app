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

/** How close an ideal load must be to a performed rung to snap onto it (else the static increment). */
const GRID_SNAP_TOLERANCE_KG = 2.5;

/**
 * Snap an ideal load onto a real rung: within the athlete's performed range, snap DOWN to the nearest
 * rung she has actually used — but only within the tolerance, so a sparse grid never drags a
 * between-rungs ideal down (that froze progression). Above her max, or between distant rungs, defer to
 * the static increment. The grid refines among performed loads; it never caps progression.
 */
export function normalizeLoad(load: number, equipment: Equipment, grid?: number[]): number {
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
