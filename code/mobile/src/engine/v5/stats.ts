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
 */
export function theilSenSlope(points: { x: number; y: number }[], minPairs: number): number | null {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x;
      if (Math.abs(dx) < 1e-9) continue; // same load — no slope
      slopes.push((points[j].y - points[i].y) / dx);
    }
  }
  if (slopes.length < minPairs) return null;
  return median(slopes);
}
