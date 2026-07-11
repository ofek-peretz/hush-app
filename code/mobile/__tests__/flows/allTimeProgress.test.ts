/**
 * All-time peak progress (the Progress screen's data): initial peak vs best peak
 * across the athlete's entire history. A lift appears from its FIRST performance
 * (founder 2026-07-09) — that first load is the starting point (baseline, delta 0);
 * gains are measured against it from the second day on.
 */
import { allTimePeakProgress, ALL_TIME_MIN_WEEKS } from '@/domain/progressReport';
import type { Session, SetLog } from '@/data/local/models';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const base = Date.parse('2026-01-05T10:00:00.000Z');

function set(exerciseId: string, w: number, tsMs: number): SetLog {
  return {
    exerciseId,
    setIndex: 0,
    recommendedWeight: w,
    recommendedReps: 8,
    actualWeight: w,
    actualReps: 8,
    edited: false,
    persistedAt: new Date(tsMs).toISOString(),
  };
}
function session(id: string, tsMs: number, sets: SetLog[]): Session {
  return { id, programDayId: 'd', startedAt: new Date(tsMs).toISOString(), state: 'SAVED', earlyFinish: false, sets };
}

describe('allTimePeakProgress', () => {
  test('empty history → no entries', () => {
    expect(allTimePeakProgress([], Date.now())).toEqual([]);
  });

  test('a single performance appears as the starting point (baseline, delta 0)', () => {
    const sessions = [session('s1', base, [set('squat', 60, base)])];
    const out = allTimePeakProgress(sessions, base + WEEK);
    expect(out).toHaveLength(1);
    expect(out[0].exerciseId).toBe('squat');
    expect(out[0].initialPeakKg).toBe(60);
    expect(out[0].periodPeakKg).toBe(60);
    expect(out[0].deltaKg).toBe(0); // no gain yet — this first load IS the baseline
    expect(ALL_TIME_MIN_WEEKS).toBe(1);
  });

  test('initial peak vs best peak across the full span', () => {
    const sessions = [
      session('s1', base, [set('squat', 60, base)]),
      session('s2', base + WEEK, [set('squat', 70, base + WEEK)]),
      session('s3', base + 5 * WEEK, [set('squat', 100, base + 5 * WEEK)]), // best, but a later dip must not hide it
      session('s4', base + 6 * WEEK, [set('squat', 90, base + 6 * WEEK)]),
    ];
    const out = allTimePeakProgress(sessions, base + 7 * WEEK);
    expect(out).toHaveLength(1);
    expect(out[0].exerciseId).toBe('squat');
    expect(out[0].initialPeakKg).toBe(60); // earliest week's peak
    expect(out[0].periodPeakKg).toBe(100); // best ever (peak, not last)
    expect(out[0].deltaKg).toBe(40);
    expect(out[0].weeksTrained).toBe(4);
  });

  test('multiple workouts across different DAYS within one week qualify (TestFlight fix)', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const sessions = [
      session('s1', base, [set('bench', 60, base)]),
      session('s2', base + 2 * DAY, [set('bench', 62.5, base + 2 * DAY)]),
    ];
    const out = allTimePeakProgress(sessions, base + 3 * DAY);
    expect(out).toHaveLength(1);
    expect(out[0].deltaKg).toBe(2.5);
    expect(out[0].weeksTrained).toBe(2); // distinct training days
  });

  test('two sessions on the SAME day collapse to one day → baseline (best of the day)', () => {
    const HOUR = 60 * 60 * 1000;
    const sessions = [
      session('s1', base, [set('bench', 60, base)]),
      session('s2', base + 3 * HOUR, [set('bench', 62.5, base + 3 * HOUR)]),
    ];
    const out = allTimePeakProgress(sessions, base + 6 * HOUR);
    expect(out).toHaveLength(1);
    expect(out[0].periodPeakKg).toBe(62.5); // one day → the day's best is the starting point
    expect(out[0].deltaKg).toBe(0); // still a single day → no gain yet
  });

  test('bodyweight sets progress by REPS (founder 2026-07-10); load entries sort first', () => {
    const bwSet = (reps: number, tsMs: number): SetLog => ({
      ...set('pullup', 0, tsMs),
      actualWeight: null,
      recommendedWeight: null,
      actualReps: reps,
    });
    const sessions = [
      session('s1', base, [set('bench', 40, base), bwSet(6, base)]),
      session('s2', base + WEEK, [set('bench', 55, base + WEEK), bwSet(10, base + WEEK)]),
      session('s3', base, [set('row', 50, base)]),
      session('s4', base + WEEK, [set('row', 52, base + WEEK)]),
    ];
    const out = allTimePeakProgress(sessions, base + 2 * WEEK);
    const ids = out.map((e) => e.exerciseId);
    expect(ids[0]).toBe('bench'); // +15 sorts before row's +2
    expect(out.find((e) => e.exerciseId === 'bench')!.deltaKg).toBe(15);
    // Bodyweight movement: tracked by best reps per day, flagged mode:'reps', after loads.
    const pull = out.find((e) => e.exerciseId === 'pullup')!;
    expect(pull.mode).toBe('reps');
    expect(pull.initialPeakKg).toBe(6);
    expect(pull.periodPeakKg).toBe(10);
    expect(pull.deltaKg).toBe(4);
    expect(ids.indexOf('pullup')).toBeGreaterThan(ids.indexOf('row')); // reps list after loads
    // Load entries never carry the reps flag.
    expect(out.find((e) => e.exerciseId === 'bench')!.mode).toBeUndefined();
  });

  test('an exercise with ANY loaded sets reports by load, never doubled as a reps entry', () => {
    const sessions = [
      session('s1', base, [set('dip', 20, base)]),
      session('s2', base + WEEK, [{ ...set('dip', 0, base + WEEK), actualWeight: null, recommendedWeight: null, actualReps: 12 }]),
    ];
    const out = allTimePeakProgress(sessions, base + 2 * WEEK);
    expect(out.filter((e) => e.exerciseId === 'dip')).toHaveLength(1);
    expect(out[0].mode).toBeUndefined(); // the load entry tells the story
  });
});
