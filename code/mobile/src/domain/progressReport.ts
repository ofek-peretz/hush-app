/**
 * Quarterly peak-weight progress (founder, 2026-06-19 — replaces the Portrait
 * 3-month capability retrospective).
 *
 * Every 3 months, for each exercise the athlete trained in at least 9 of the last
 * 12 weeks, compare the INITIAL peak weight (the most they lifted in the first week
 * it appears in the window) to the PEAK weight reached during the window. Peak — not
 * the current/last week — so a one-off dip in week 12 never makes real progress look
 * like a loss. Pure & I/O-free: computed from logged sets (actualWeight) alone.
 */
import type { Session } from '@/data/local/models';

export const REPORT_WINDOW_WEEKS = 12;
export const REPORT_MIN_WEEKS = 9; // must have trained the exercise in ≥9 of the 12 weeks
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface QuarterlyProgressEntry {
  exerciseId: string;
  initialPeakKg: number; // peak in the earliest week it appears in the window
  periodPeakKg: number; // best (max) weight reached anywhere in the window
  deltaKg: number; // periodPeak − initialPeak (≥ 0 in practice; can be 0)
  weeksTrained: number; // distinct weeks (of 12) the exercise was performed
}

/**
 * Build the report for the 12-week window ending at `nowMs`. Returns one entry per
 * qualifying exercise, sorted by the biggest gain first. Empty until enough history
 * accrues (so it naturally only "fires" after a real quarter of training).
 */
export function quarterlyPeakProgress(sessions: Session[], nowMs: number): QuarterlyProgressEntry[] {
  const windowStart = nowMs - REPORT_WINDOW_WEEKS * WEEK_MS;
  // exerciseId → (weekIndex 0..11 → max weight that week)
  const byExercise = new Map<string, Map<number, number>>();

  for (const session of sessions) {
    for (const log of session.sets) {
      if (log.actualWeight == null) continue; // bodyweight movements have no load to compare
      const tsMs = Date.parse(log.persistedAt || session.startedAt);
      if (Number.isNaN(tsMs) || tsMs < windowStart || tsMs > nowMs) continue;
      const week = Math.floor((tsMs - windowStart) / WEEK_MS);
      let weeks = byExercise.get(log.exerciseId);
      if (!weeks) {
        weeks = new Map();
        byExercise.set(log.exerciseId, weeks);
      }
      const cur = weeks.get(week);
      if (cur == null || log.actualWeight > cur) weeks.set(week, log.actualWeight);
    }
  }

  const out: QuarterlyProgressEntry[] = [];
  for (const [exerciseId, weeks] of byExercise) {
    if (weeks.size < REPORT_MIN_WEEKS) continue; // the ≥9-of-12 gate
    const earliestWeek = Math.min(...weeks.keys());
    const initialPeakKg = weeks.get(earliestWeek)!;
    const periodPeakKg = Math.max(...weeks.values());
    out.push({
      exerciseId,
      initialPeakKg,
      periodPeakKg,
      deltaKg: Math.round((periodPeakKg - initialPeakKg) * 10) / 10,
      weeksTrained: weeks.size,
    });
  }
  // Biggest gain first; ties keep exercises that were trained more weeks ahead.
  out.sort((a, b) => b.deltaKg - a.deltaKg || b.weeksTrained - a.weeksTrained);
  return out;
}

/**
 * Whether a quarterly report is due relative to an anchor (account creation, or the
 * last report). Retained for a future periodic notification trigger; the in-app
 * surface gates on `quarterlyPeakProgress(...).length` instead (data IS the cadence).
 */
export function isQuarterlyReportDue(anchorIso: string | null, nowMs: number): boolean {
  if (!anchorIso) return false;
  const anchor = Date.parse(anchorIso);
  if (Number.isNaN(anchor)) return false;
  return nowMs - anchor >= REPORT_WINDOW_WEEKS * WEEK_MS;
}
