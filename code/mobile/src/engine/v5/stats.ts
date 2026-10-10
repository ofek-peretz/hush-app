/**
 * Hush Engine v5 — the two named estimators (F-13), so identical inputs yield identical output
 * (I-24). "A robust fit" and "the 75th percentile" are algorithm families; these are the single
 * algorithms chosen, and nothing else may be substituted.
 */

/** Plain median (even n → mean of the two middle values). Deterministic. */
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Nearest-rank percentile (F-13) — the one method the engine uses for `N` (S-25). For fraction `p`,
 * rank = ceil(p · n), 1-indexed. Stable on the small samples where N matters most (early on), where
 * interpolating methods disagree.
 */
export function percentileNearestRank(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(p * s.length));
  return s[Math.min(rank, s.length) - 1];
}

/**
 * Theil–Sen slope (F-13) — the median of the slopes of all point pairs at distinct x. Robust to the
 * odd mis-keyed set. Returns null when there are too few usable pairs to fit (the caller then uses
 * the cautious single-rung bootstrap, B-5).
 *
 * ⛔ `admissible` IS WHAT LETS THIS BE THE ONLY COPY. F-13 declares ONE named algorithm — *"'a robust
 * fit' is an algorithm FAMILY; this is the single algorithm chosen, and nothing else may be
 * substituted"* — and there were two: this one, with no production caller at all, and a second
 * hand-rolled inside `repsPerRung`, which is the one that actually moved iron. The reason for the
 * split was real: L3 refuses a PAIR unless the two sets are like-for-like (similar rest, different
 * occurrences, the same position in the exercise), and a fit that only sees `{x, y}` cannot ask.
 *
 * So the predicate is the parameter. The estimator stays one function, the filter stays the
 * caller's, and neither can drift from the other by being rewritten in two places.
 */
export function theilSenSlope<T extends { x: number; y: number }>(
  points: readonly T[],
  minPairs: number,
  /** Is this PAIR comparable? Absent → every pair at distinct x, which is the plain estimator. */
  admissible?: (a: T, b: T) => boolean,
): number | null {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x;
      if (Math.abs(dx) < 1e-9) continue; // same x — no slope
      if (admissible && !admissible(points[i], points[j])) continue;
      slopes.push((points[j].y - points[i].y) / dx);
    }
  }
  if (slopes.length < minPairs) return null;
  return median(slopes);
}
