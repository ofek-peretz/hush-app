/**
 * Athlete-owned ordering helper (Program Ownership Contract). Pure + deterministic so the
 * reorder UX and its persistence stay in lock-step. Athlete Order > Model Default, always.
 */
// @ts-nocheck

// 


/** Move the item at `from` to index `to`, returning a new array (stable for other items). */
export function move<T>(arr: readonly T[], from: number, to: number): T[] {
  const out = arr.slice();
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}
