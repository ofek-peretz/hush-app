/**
 * Hush Engine v5 — the S-37 donor rule (which muscle gives a set up under a full ceiling).
 *
 * The S-32 GIVE-rule ("two muscles earn a set and only one fits") has no single contest point in this
 * architecture: each muscle's volume grows on its OWN track, one set at a time, capped by its own
 * weekly time budget (Loop 3, advanceV5) — there is never a moment where two muscles bid for one shared
 * set, so its emphasis-first / fewest-first / canonical tie-break is expressed structurally by the
 * emphasis bonus (B-2) and each muscle's independent earning, not by a picker function. The DONOR rule
 * DOES have a contest point — trimming an over-budget day (trimV5ToBudget) — and it is wired here.
 *
 * Taking a set to make room (S-37) is the exact mirror of S-32's give-rule: never from an emphasis or a
 * floored muscle, else from the muscle with the MOST sets, else reverse canonical order (F-9). Every tie
 * breaks on a fact then a fixed order — never a coin-toss, wall-clock, or RNG (I-24/25).
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
