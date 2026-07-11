/**
 * Quarterly peak-weight progress (founder, 2026-06-19 — replaces the Portrait
 * 3-month capability retrospective).
 *
 * Every 3 months, for each exercise the athlete trained in at least 9 of the last
 * 12 weeks, compare the INITIAL peak weight (the most they lifted in the first week
 * it appears in the window) to the PEAK weight reached during the window. Peak — not
 * the current/last week — so a one-off dip in week 12 never makes real progress look
 * like a loss. Pure & I/O-free: computed from logged sets (actualWeight) alone.
 *
 * BODYWEIGHT movements (founder 2026-07-10): a lift with no load still progresses —
 * by REPS. Sets logged without a weight are tracked as best reps per bucket and
 * reported with `mode: 'reps'` (initial best reps → peak reps), so an athlete doing
 * push-ups or pull-ups sees their performance history like everyone else. An
 * exercise with ANY loaded sets reports by load (the stronger signal); reps entries
 * list after load entries.
 */
import type { Session } from '@/data/local/models';

export const REPORT_WINDOW_WEEKS = 12;
export const REPORT_MIN_WEEKS = 9; // must have trained the exercise in ≥9 of the 12 weeks
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type ProgressMode = 'load' | 'reps';

export interface QuarterlyProgressEntry {
  exerciseId: string;
  /** Peak in the earliest bucket it appears in (kg — or best REPS when mode is 'reps'). */
  initialPeakKg: number;
  /** Best peak reached anywhere in the window (kg — or best REPS when mode is 'reps'). */
  periodPeakKg: number;
  /** periodPeak − initialPeak (kg or reps per mode; ≥ 0 in practice; can be 0). */
  deltaKg: number;
  weeksTrained: number; // distinct buckets the exercise was performed in
  /** 'load' (default) = kg peaks; 'reps' = bodyweight movement tracked by best reps. */
  mode?: ProgressMode;
}

/** exerciseId → (bucketIndex → peak value that bucket), collected separately for
 *  loaded sets (kg) and bodyweight sets (reps). */
interface PeakMaps {
  load: Map<string, Map<number, number>>;
  reps: Map<string, Map<number, number>>;
}

function collectPeaks(
  sessions: Session[],
  bucketOf: (tsMs: number) => number | null,
): PeakMaps {
  const load = new Map<string, Map<number, number>>();
  const reps = new Map<string, Map<number, number>>();
  for (const session of sessions) {
    for (const log of session.sets) {
      const tsMs = Date.parse(log.persistedAt || session.startedAt);
      if (Number.isNaN(tsMs)) continue;
      const bucket = bucketOf(tsMs);
      if (bucket == null) continue;
      const weighted = log.actualWeight != null;
      const value = weighted ? log.actualWeight! : log.actualReps;
      if (!(value > 0)) continue;
      const target = weighted ? load : reps;
      let buckets = target.get(log.exerciseId);
      if (!buckets) {
        buckets = new Map();
        target.set(log.exerciseId, buckets);
      }
      const cur = buckets.get(bucket);
      if (cur == null || value > cur) buckets.set(bucket, value);
    }
  }
  return { load, reps };
}

/** Build entries from peak maps: load entries first (biggest kg gain first), then
 *  bodyweight reps entries (biggest rep gain first). `minBuckets` gates both. */
function entriesFromPeaks(peaks: PeakMaps, minBuckets: number): QuarterlyProgressEntry[] {
  const build = (
    map: Map<string, Map<number, number>>,
    mode: ProgressMode,
    skip?: Map<string, unknown>,
  ): QuarterlyProgressEntry[] => {
    const out: QuarterlyProgressEntry[] = [];
    for (const [exerciseId, buckets] of map) {
      if (skip?.has(exerciseId)) continue; // any loaded work → the load entry tells the story
      if (buckets.size < minBuckets) continue;
      const earliest = Math.min(...buckets.keys());
      const initial = buckets.get(earliest)!;
      const peak = Math.max(...buckets.values());
      out.push({
        exerciseId,
        initialPeakKg: initial,
        periodPeakKg: peak,
        deltaKg: Math.round((peak - initial) * 10) / 10,
        weeksTrained: buckets.size,
        ...(mode === 'reps' ? { mode } : {}),
      });
    }
    // Biggest gain first; ties keep exercises that were trained more buckets ahead.
    out.sort((a, b) => b.deltaKg - a.deltaKg || b.weeksTrained - a.weeksTrained);
    return out;
  };
  return [...build(peaks.load, 'load'), ...build(peaks.reps, 'reps', peaks.load)];
}

/**
 * Build the report for the 12-week window ending at `nowMs`. Returns one entry per
 * qualifying exercise, sorted by the biggest gain first (load entries, then
 * bodyweight reps entries). Empty until enough history accrues (so it naturally
 * only "fires" after a real quarter of training).
 */
export function quarterlyPeakProgress(sessions: Session[], nowMs: number): QuarterlyProgressEntry[] {
  const windowStart = nowMs - REPORT_WINDOW_WEEKS * WEEK_MS;
  const peaks = collectPeaks(sessions, (tsMs) => {
    if (tsMs < windowStart || tsMs > nowMs) return null;
    return Math.floor((tsMs - windowStart) / WEEK_MS);
  });
  return entriesFromPeaks(peaks, REPORT_MIN_WEEKS);
}

/**
 * ALL-TIME peak progress (founder, 2026-06-21). Same comparison as the quarterly
 * report — initial peak vs best peak reached since — but the window spans the
 * athlete's ENTIRE history (first training day → now), so the Progress screen
 * always shows cumulative progression.
 *
 * Gate (founder 2026-07-09): a lift appears from its VERY FIRST performance — that first
 * load (or rep count, for bodyweight) is the athlete's starting point, shown as a
 * baseline (no gain yet), and every later session is measured against it. So the
 * Progress screen turns on the moment the first workout finishes. Pure & I/O-free.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
/** Minimum distinct training days for a lift to appear. 1 = show from the first performance
 *  (the starting point); progress is then measured against it from the second onward. */
export const ALL_TIME_MIN_WEEKS = 1;

export function allTimePeakProgress(sessions: Session[], nowMs: number): QuarterlyProgressEntry[] {
  // Origin = the earliest logged set (loaded OR bodyweight); day buckets count from there.
  let originMs = Number.POSITIVE_INFINITY;
  for (const session of sessions) {
    for (const log of session.sets) {
      const tsMs = Date.parse(log.persistedAt || session.startedAt);
      if (!Number.isNaN(tsMs) && tsMs < originMs) originMs = tsMs;
    }
  }
  if (!Number.isFinite(originMs)) return [];

  const peaks = collectPeaks(sessions, (tsMs) => {
    if (tsMs < originMs || tsMs > nowMs) return null;
    return Math.floor((tsMs - originMs) / DAY_MS);
  });
  return entriesFromPeaks(peaks, ALL_TIME_MIN_WEEKS);
}
