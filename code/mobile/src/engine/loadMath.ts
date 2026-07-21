/**
 * Hush engine — load math. The e1RM estimate (display + the cold-start transfer) and the physical
 * constant every prescribed load is floored at.
 *
 * **F-2 and B-6 each used to live here TWICE.** This file carried its own `LOAD_INCREMENT` (a second
 * copy of B-6) and its own grid snap with a `GRID_SNAP_TOLERANCE_KG` rule that `engine/v5/grid`
 * did not share — two implementations of one declared bootstrap and one declared form constant,
 * free to disagree about what is loadable. They are gone: **`normalizeLoad` now delegates to
 * `engine/v5/grid.snapDown`**, which is the single implementation of F-2 (the learned grid speaks
 * only within her performed range; outside it, B-6's increment), and B-6 has one home,
 * `engine/v5/constants.STARTING_INCREMENT`.
 */
import type { Equipment } from './catalog';
import { snapDown } from './v5/grid';
import { STARTING_INCREMENT, BAR_KG } from './v5/constants';

/** Epley one-rep-max estimate from a working set. */
export function epley(load: number, reps: number): number {
  return load * (1 + reps / 30);
}

/** B-6 — the starting loadable increment per equipment class. Re-exported from its one declaration
 *  in the v5 ledger (`engine/v5/constants`), never redeclared here. */
export const LOAD_INCREMENT = STARTING_INCREMENT;

/** S-55 — the empty bar, re-exported from its single declaration in the v5 ledger
 *  (`engine/v5/constants`). `loadPresentation` does the athlete's plate maths against this exact
 *  number, so what decides a loadable weight and what builds it cannot drift apart. */
export { BAR_KG };

/**
 * Snap an ideal load onto a real rung (F-2) — **one implementation, shared with the live loops.**
 *
 * The cold-start seed and the between-session prescription must agree about what is loadable, or the
 * two disagree about the same athlete on the same lift. This is now a thin wrapper over
 * `engine/v5/grid.snapDown`: her performed rungs decide within the range she has actually used, B-6's
 * increment decides outside it, and every result is floored at what physically exists (S-55 — the
 * empty bar, the smallest plate; never zero).
 */
export function normalizeLoad(load: number, equipment: Equipment, grid?: number[]): number {
  return snapDown(load, equipment, grid);
}
