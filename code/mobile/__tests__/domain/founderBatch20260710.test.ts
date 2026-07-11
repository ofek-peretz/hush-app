/**
 * Founder batch 2026-07-10 — domain rules added in the microscopic-quality pass:
 *  - cardio record admission (a never-performed activity is not a History record);
 *  - age upkeep (asked once, auto-advanced a year per full year elapsed);
 *  - mid-week signup (the first bucket extends to the next Saturday when the
 *    remaining days cannot fit the chosen frequency) + the Week-N display clamp.
 */
import { cardioPerformed, CARDIO_MIN_DURATION_S, CARDIO_MIN_DISTANCE_KM } from '@/domain/cardio';
import { agedProfile, fullYearsSince } from '@/domain/profileAge';
import {
  currentWeekOpen,
  nextWeekOpen,
  firstBucketOpen,
  trainableDaysUntil,
  displayWeekNumber,
  trainingWeekNumber,
  bucketStart,
  healWeekCompletion,
} from '@/domain/weekCadence';
import { prescribedSets, workoutTrained } from '@/domain/completion';
import type { Profile, Program, Session } from '@/data/local/models';

describe('cardioPerformed — record admission', () => {
  it('a false start (seconds, no distance) is not a record', () => {
    expect(cardioPerformed(0, 0)).toBe(false);
    expect(cardioPerformed(30, 0.01)).toBe(false);
  });
  it('a minute on the clock OR real distance qualifies', () => {
    expect(cardioPerformed(CARDIO_MIN_DURATION_S, 0)).toBe(true);
    expect(cardioPerformed(10, CARDIO_MIN_DISTANCE_KM)).toBe(true);
    expect(cardioPerformed(1800, 5)).toBe(true);
  });
});

describe('agedProfile — age is asked once and kept current by the app', () => {
  const base: Profile = {
    units: 'kg',
    goal: 'build_muscle',
    daysPerWeek: 4,
    healthConnected: false,
    age: 30,
    ageUpdatedAt: '2025-01-15T10:00:00.000Z',
    memberSince: '2025-01-15T10:00:00.000Z',
  };
  const YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const anchor = Date.parse(base.ageUpdatedAt!);

  it('under a year → unchanged (null)', () => {
    expect(agedProfile(base, anchor + YEAR - 1)).toBeNull();
  });
  it('one full year → +1, anchor advances exactly one year (no fractional loss)', () => {
    const out = agedProfile(base, anchor + YEAR + 24 * 60 * 60 * 1000)!;
    expect(out.age).toBe(31);
    expect(Date.parse(out.ageUpdatedAt!)).toBe(anchor + YEAR);
  });
  it('multiple elapsed years are credited at once', () => {
    const out = agedProfile(base, anchor + 3 * YEAR + 1)!;
    expect(out.age).toBe(33);
  });
  it('falls back to memberSince for pre-rule profiles; no anchor at all → null', () => {
    const legacy = { ...base, ageUpdatedAt: undefined };
    expect(agedProfile(legacy, anchor + YEAR + 1)!.age).toBe(31);
    expect(agedProfile({ ...legacy, memberSince: undefined }, anchor + 10 * YEAR)).toBeNull();
  });
  it('no age → nothing to advance', () => {
    expect(agedProfile({ ...base, age: undefined }, anchor + 2 * YEAR)).toBeNull();
  });
  it('fullYearsSince guards invalid and future anchors', () => {
    expect(fullYearsSince('garbage', anchor)).toBe(0);
    expect(fullYearsSince(new Date(anchor + YEAR).toISOString(), anchor)).toBe(0);
  });
});

describe('firstBucketOpen — mid-week signup gets a full runway', () => {
  // 2026-07-09 is a Thursday; 2026-07-05 is a Sunday (local dates in the test TZ).
  const thursday = new Date(2026, 6, 9, 18, 0, 0).getTime();
  const sunday = new Date(2026, 6, 5, 9, 0, 0).getTime();

  it('trainableDaysUntil counts local calendar days inclusive', () => {
    // Thu 18:00 → Sat 23:59 = Thu, Fri, Sat.
    expect(trainableDaysUntil(thursday, nextWeekOpen(thursday))).toBe(3);
  });

  it('a Sunday signup at 4×/week fits the window → normal anchor', () => {
    expect(firstBucketOpen(sunday, 4)).toBe(currentWeekOpen(sunday));
  });

  it('a Thursday signup at 4×/week cannot fit → bucket stamped for the NEXT open', () => {
    expect(firstBucketOpen(thursday, 4)).toBe(nextWeekOpen(thursday));
  });

  it('a Thursday signup at 2×/week fits (Thu/Fri/Sat ≥ 2) → normal anchor', () => {
    expect(firstBucketOpen(thursday, 2)).toBe(currentWeekOpen(thursday));
  });

  it('displayWeekNumber clamps to week 1 while the extended first bucket is ahead of the calendar', () => {
    const memberSince = new Date(thursday).toISOString();
    const bucketOpen = firstBucketOpen(thursday, 4); // next Saturday 23:59
    // Inside the extended bucket, just before it opens (the calendar Saturday has NOT passed yet).
    const midExtended = bucketOpen - 60 * 60 * 1000;
    expect(displayWeekNumber(memberSince, bucketOpen, midExtended)).toBe(1);
    // Once the bucket's own open passes, the plain calendar count resumes.
    const afterOpen = bucketOpen + 2 * 24 * 60 * 60 * 1000;
    expect(displayWeekNumber(memberSince, bucketOpen, afterOpen)).toBe(
      trainingWeekNumber(memberSince, afterOpen),
    );
  });

  it('bucketStart clamps a FUTURE anchor to the current week-open (its work starts now)', () => {
    const bucketOpen = firstBucketOpen(thursday, 4); // in the future relative to `thursday`
    expect(bucketStart(bucketOpen, thursday)).toBe(currentWeekOpen(thursday));
    // An ordinary (past) anchor is used as-is.
    expect(bucketStart(currentWeekOpen(sunday), sunday)).toBe(currentWeekOpen(sunday));
    // No anchor at all → the current week-open.
    expect(bucketStart(null, sunday)).toBe(currentWeekOpen(sunday));
  });
});

describe('healWeekCompletion — a mid-week rebuild never resurrects finished work', () => {
  const now = new Date(2026, 6, 8, 12, 0, 0).getTime(); // Wednesday
  const weekOpen = currentWeekOpen(now);
  const trainedAt = new Date(weekOpen + 12 * 60 * 60 * 1000).toISOString(); // this week
  const lastWeek = new Date(weekOpen - 3 * 24 * 60 * 60 * 1000).toISOString();

  const logged = (n: number, at: string): Session['sets'] =>
    Array.from({ length: n }, (_, i) => ({
      exerciseId: 'bb_bench_press',
      setIndex: i,
      recommendedWeight: 50,
      recommendedReps: 8,
      actualWeight: 50,
      actualReps: 8,
      edited: false,
      persistedAt: at,
    }));
  const session = (id: string, dayId: string, name: string | undefined, startedAt: string, sets = 8): Session => ({
    id,
    programDayId: dayId,
    programDayName: name,
    startedAt,
    state: 'SAVED',
    earlyFinish: false,
    sets: logged(sets, startedAt),
  });
  // Each day prescribes 8 work sets (2 lifts × 4) → TRAINED at 4+, PARTIAL below.
  const day = (id: string, name: string) => ({
    id,
    name,
    muscleGroups: [],
    isRest: false,
    completed: false,
    slots: [
      { capability: 'horizontal_push' as const, exerciseId: 'bb_bench_press', setCount: 4 },
      { capability: 'horizontal_pull' as const, exerciseId: 'bb_row', setCount: 4 },
    ],
  });
  const program = (): Program => ({
    id: 'p',
    frequency: 3,
    days: [day('day_0', 'Push A'), day('day_1', 'Pull A'), day('day_2', 'Legs A')],
  });

  it('re-marks a workout trained THIS week (matched by the captured day name)', () => {
    // The re-split moved "Pull A" from day_1 to day_2 — the NAME still identifies it.
    const history = [session('s1', 'day_1', 'Pull A', trainedAt)];
    const healed = healWeekCompletion(program(), history, weekOpen, now)!;
    expect(healed.days.map((d) => d.completed)).toEqual([false, true, false]);
  });

  it('falls back to the day id for sessions saved without a name', () => {
    const history = [session('s1', 'day_0', undefined, trainedAt)];
    const healed = healWeekCompletion(program(), history, weekOpen, now)!;
    expect(healed.days[0].completed).toBe(true);
  });

  it('LAST week\'s sessions never mark this week done', () => {
    const history = [session('s1', 'day_0', 'Push A', lastWeek)];
    expect(healWeekCompletion(program(), history, weekOpen, now)).toBeNull();
  });

  it('nothing to heal → null (no needless write)', () => {
    expect(healWeekCompletion(program(), [], weekOpen, now)).toBeNull();
  });

  it('a mid-week signup\'s FUTURE anchor still recognizes this week\'s work', () => {
    const future = nextWeekOpen(now); // the extended first bucket
    const history = [session('s1', 'day_2', 'Legs A', trainedAt)];
    const healed = healWeekCompletion(program(), history, future, now)!;
    expect(healed.days[2].completed).toBe(true);
  });

  it('a PARTIAL session (under half the prescribed sets) never marks the workout done', () => {
    // 3 of 8 prescribed sets — real work, but not the session (founder 2026-07-11).
    const history = [session('s1', 'day_0', 'Push A', trainedAt, 3)];
    expect(healWeekCompletion(program(), history, weekOpen, now)).toBeNull();
  });

  it('exactly HALF the prescribed sets finishes the workout', () => {
    const history = [session('s1', 'day_0', 'Push A', trainedAt, 4)];
    expect(healWeekCompletion(program(), history, weekOpen, now)!.days[0].completed).toBe(true);
  });
});

describe('workoutTrained — the partial-workout law (founder 2026-07-11)', () => {
  const day = (sets: number[]) => ({
    id: 'd',
    name: 'Push A',
    muscleGroups: [],
    isRest: false,
    slots: sets.map((n) => ({ capability: 'horizontal_push' as const, exerciseId: 'bb_bench_press', setCount: n })),
  });

  it('prescribedSets sums every slot (core included — it is prescribed work)', () => {
    expect(prescribedSets(day([4, 4, 3, 3]))).toBe(14);
  });

  it('zero sets is never a workout', () => {
    expect(workoutTrained(0, day([4, 4]))).toBe(false);
  });

  it('one lift out of six is PARTIAL — the workout stays open', () => {
    const d = day([4, 4, 4, 3, 3, 3]); // 21 prescribed → needs 11
    expect(workoutTrained(4, d)).toBe(false); // one lift done
    expect(workoutTrained(10, d)).toBe(false); // just under half
  });

  it('half or more FINISHES the workout', () => {
    const d = day([4, 4, 4, 3, 3, 3]); // 21 prescribed → ceil(10.5) = 11
    expect(workoutTrained(11, d)).toBe(true);
    expect(workoutTrained(21, d)).toBe(true);
  });

  it('an unknown day (the plan moved under the session) counts any logged work', () => {
    expect(workoutTrained(1, undefined)).toBe(true);
    expect(workoutTrained(0, undefined)).toBe(false);
  });
});
