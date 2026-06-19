/**
 * Quarterly peak-weight progress (domain/progressReport). Proves the founder rules:
 *  - an exercise enters the report only if trained in ≥9 of the last 12 weeks;
 *  - progress is initial-week peak → in-window PEAK (a late dip never counts);
 *  - sets outside the 12-week window and bodyweight sets are ignored;
 *  - entries are sorted biggest-gain first.
 */
import { quarterlyPeakProgress, isQuarterlyReportDue } from '@/domain/progressReport';
import type { Session, SetLog } from '@/data/local/models';

const NOW = Date.parse('2026-06-19T12:00:00.000Z');
const WEEK = 7 * 24 * 60 * 60 * 1000;
const WINDOW_START = NOW - 12 * WEEK;

/** ISO timestamp landing inside week index `w` (0 = oldest week of the window). */
function tsInWeek(w: number): string {
  return new Date(WINDOW_START + w * WEEK + 60 * 60 * 1000).toISOString();
}

function log(exerciseId: string, week: number, weight: number | null): SetLog {
  return {
    exerciseId,
    setIndex: 0,
    recommendedWeight: weight,
    recommendedReps: 8,
    actualWeight: weight,
    actualReps: 8,
    edited: false,
    persistedAt: tsInWeek(week),
  };
}

/** One session per (exercise, week) keeps timestamps unambiguous for the test. */
function sessionsFor(exerciseId: string, weekWeights: Array<[number, number | null]>): Session[] {
  return weekWeights.map(([w, kg], i) => ({
    id: `${exerciseId}_${i}`,
    programDayId: 'd',
    startedAt: tsInWeek(w),
    state: 'SAVED' as const,
    earlyFinish: false,
    sets: [log(exerciseId, w, kg)],
  }));
}

describe('quarterlyPeakProgress', () => {
  it('includes an exercise trained in ≥9 weeks; initial→peak, late dip ignored', () => {
    // bench in weeks 0..8 climbing 60→68, plus a week-11 dip to 50.
    const bench = sessionsFor('bench', [
      [0, 60], [1, 61], [2, 62], [3, 63], [4, 64], [5, 65], [6, 66], [7, 67], [8, 68], [11, 50],
    ]);
    const [entry] = quarterlyPeakProgress(bench, NOW);
    expect(entry.exerciseId).toBe('bench');
    expect(entry.initialPeakKg).toBe(60); // earliest week's peak
    expect(entry.periodPeakKg).toBe(68); // best in window — NOT the week-11 dip (50)
    expect(entry.deltaKg).toBe(8);
    expect(entry.weeksTrained).toBe(10);
  });

  it('excludes an exercise trained in only 8 of 12 weeks', () => {
    const squat = sessionsFor('squat', [
      [0, 90], [1, 90], [2, 92], [3, 92], [4, 95], [5, 95], [6, 97], [7, 100],
    ]);
    expect(quarterlyPeakProgress(squat, NOW)).toEqual([]);
  });

  it('uses the per-week PEAK as the initial value (best set of the first week)', () => {
    const rows = [
      // week 0 has two sessions; the higher (62.5) is the initial peak.
      ...sessionsFor('row', [[0, 60]]),
      ...sessionsFor('row', [[0, 62.5], [1, 63], [2, 64], [3, 65], [4, 66], [5, 67], [6, 68], [7, 69], [8, 70]]),
    ];
    const [entry] = quarterlyPeakProgress(rows, NOW);
    expect(entry.initialPeakKg).toBe(62.5);
    expect(entry.periodPeakKg).toBe(70);
    expect(entry.deltaKg).toBe(7.5);
  });

  it('ignores sets older than the 12-week window and bodyweight (null) sets', () => {
    const old = sessionsFor('press', [[0, 40], [1, 41], [2, 42], [3, 43], [4, 44], [5, 45], [6, 46], [7, 47], [8, 48]]);
    // Drop the press to 8 in-window weeks by moving one set out of the window (week -1 → before start).
    old[0].sets[0].persistedAt = new Date(WINDOW_START - WEEK).toISOString();
    expect(quarterlyPeakProgress(old, NOW)).toEqual([]); // now only 8 weeks qualify

    const bw = sessionsFor('pullup', [
      [0, null], [1, null], [2, null], [3, null], [4, null], [5, null], [6, null], [7, null], [8, null],
    ]);
    expect(quarterlyPeakProgress(bw, NOW)).toEqual([]); // no load to compare
  });

  it('sorts qualifying entries by biggest gain first', () => {
    const big = sessionsFor('big', [[0, 60], [1, 62], [2, 64], [3, 66], [4, 68], [5, 70], [6, 72], [7, 74], [8, 76]]); // +16
    const small = sessionsFor('small', [[0, 50], [1, 50], [2, 50], [3, 51], [4, 51], [5, 52], [6, 52], [7, 52], [8, 53]]); // +3
    const out = quarterlyPeakProgress([...small, ...big], NOW);
    expect(out.map((e) => e.exerciseId)).toEqual(['big', 'small']);
  });
});

describe('isQuarterlyReportDue', () => {
  it('is due once 12 weeks have passed since the anchor', () => {
    expect(isQuarterlyReportDue(new Date(NOW - 12 * WEEK).toISOString(), NOW)).toBe(true);
    expect(isQuarterlyReportDue(new Date(NOW - 11 * WEEK).toISOString(), NOW)).toBe(false);
  });
  it('is never due without a valid anchor', () => {
    expect(isQuarterlyReportDue(null, NOW)).toBe(false);
    expect(isQuarterlyReportDue('not-a-date', NOW)).toBe(false);
  });
});
