/**
 * Hush Engine v5 — contested-set allocation (S-32 give-rule, S-37 donor-rule).
 *
 * Two muscles earn a set and only one fits under the time ceiling: emphasis wins, else the muscle
 * with the fewest rolling-7-day sets, else a fixed canonical order (F-9). Taking a set to fund an
 * emphasis muscle (S-37) is the exact mirror: never from emphasis or a floored muscle, else from the
 * muscle with the MOST sets, else reverse canonical order. Every tie breaks on a fact then a fixed
 * order — never a coin-toss, wall-clock, or RNG (I-24/25).
 *
 * The canonical order (F-9) is the v4 pattern enum extended to every muscle group — declared, stable,
 * and never reordered.
 */

export interface VolumeCandidate {
  muscle: string;
  isEmphasis: boolean;
  /** Rolling-7-day set count for this muscle — a read for tie-breaking only (S-64 note). */
  weeklySets: number;
  /** At its floor (F-1) — a donor may never take it below (S-35). */
  atFloor: boolean;
}

/** Rank index of a muscle in the canonical order (F-9); unknown muscles sort last, then by name. */
function canonicalRank(muscle: string, canonicalOrder: readonly string[]): number {
  const i = canonicalOrder.indexOf(muscle);
  return i >= 0 ? i : canonicalOrder.length;
}

/**
 * S-32 — which muscle gets the one contested set. Emphasis first; then fewest weekly sets (bring up
 * the lagging one); then canonical order. Returns null only if there are no candidates.
 */
export function chooseWinner(candidates: VolumeCandidate[], canonicalOrder: readonly string[]): VolumeCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    if (a.isEmphasis !== b.isEmphasis) return a.isEmphasis ? -1 : 1; // emphasis wins
    if (a.weeklySets !== b.weeklySets) return a.weeklySets - b.weeklySets; // fewest first
    return canonicalRank(a.muscle, canonicalOrder) - canonicalRank(b.muscle, canonicalOrder);
  })[0];
}

/**
 * S-37 — which muscle DONATES a set so an emphasis muscle can grow under a full ceiling. Never an
 * emphasis muscle, never one at its floor; then the muscle with the MOST weekly sets (best able to
 * spare it); then reverse canonical order. Returns null when no muscle can donate — then the earned
 * set simply does not fit and is held (S-37 / S-64).
 */
export function chooseDonor(candidates: VolumeCandidate[], canonicalOrder: readonly string[]): VolumeCandidate | null {
  const eligible = candidates.filter((c) => !c.isEmphasis && !c.atFloor);
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => {
    if (a.weeklySets !== b.weeklySets) return b.weeklySets - a.weeklySets; // most first (inverse of give)
    return canonicalRank(b.muscle, canonicalOrder) - canonicalRank(a.muscle, canonicalOrder); // reverse order
  })[0];
}
