/**
 * Share-card facts (domain/shareCard) — the numbers a poster carries, and the discipline that they
 * are never invented. Proves:
 *  · a record card appears ONLY when the latest session set a genuine new all-time load;
 *  · it names the biggest STEP when several fall, with the real delta and a real "weeks ago" line;
 *  · a first-ever load is a record with no delta and no context (there is no history to claim);
 *  · lb athletes see lb figures;
 *  · a week card buckets the week's work by day, sums tonnage + reports the honest ± vs last week,
 *    and is null for an empty week.
 */
// @ts-nocheck

// 

import { recordCardFromHistory, weekCardFromHistory, cardioCardFromActivity, sessionCardFromHistory } from '@/domain/shareCard';
import { trainingWeekNumber } from '@/domain/weekCadence';
import type { Session, SetLog } from '@/data/local/models';

const T0 = Date.parse('2026-03-02T09:00:00.000Z'); // a Monday
const DAY = 86_400_000;

/*
 * ⛔ THE CARD NO LONGER COUNTS ITS OWN WEEKS. It counted 7-day blocks from the first logged session
 * while Progress counted Saturday-20:30 windows from `memberSince` — so the screen read "6 weeks"
 * and the card posted from it read "Week 4", and the card is the one the world sees. The ordinal
 * comes from the account's anchor now, which is why every call below passes one.
 */
const MEMBER_SINCE = new Date(T0 - 6 * DAY).toISOString();

function log(exerciseId: string, weight: number | null, reps = 8): SetLog {
  return {
    exerciseId,
    setIndex: 0,
    recommendedWeight: weight,
    recommendedReps: 8,
    actualWeight: weight,
    actualReps: reps,
    edited: false,
    persistedAt: new Date(T0).toISOString(),
  };
}

let seq = 0;
function session(atMs: number, sets: SetLog[]): Session {
  const started = new Date(atMs).toISOString();
  // Give each set a persistedAt ~30 min after the start so duration/energy is real where it matters.
  const withStamp = sets.map((s) => ({ ...s, persistedAt: new Date(atMs + 30 * 60_000).toISOString() }));
  return { id: `s${++seq}`, programDayId: 'd', startedAt: started, state: 'SAVED', earlyFinish: false, sets: withStamp };
}

beforeEach(() => {
  seq = 0;
});

describe('recordCardFromHistory', () => {
  it('returns null with no history', () => {
    expect(recordCardFromHistory([], 'kg')).toBeNull();
  });

  it('returns null when the latest session beats no prior best', () => {
    const hist = [
      session(T0, [log('bb_bench_press', 60)]),
      session(T0 + DAY, [log('bb_bench_press', 55)]), // lighter — not a record
    ];
    expect(recordCardFromHistory(hist, 'kg')).toBeNull();
  });

  it('names a real new PR with the step up and a weeks-ago context line', () => {
    const hist = [
      session(T0, [log('bb_bench_press', 60)]),
      session(T0 + 14 * DAY, [log('bb_bench_press', 62.5)]), // +2.5, two weeks on
    ];
    const card = recordCardFromHistory(hist, 'kg');
    expect(card).not.toBeNull();
    expect(card).toMatchObject({ kind: 'record', exerciseId: 'bb_bench_press', weight: 62.5, unit: 'kg', reps: 8, delta: 2.5 });
    expect(card!.weeksAgo).toBe(2);
    expect(card!.firstWeight).toBe(60);
  });

  it('when several lifts break a PR, the biggest step wins', () => {
    const hist = [
      session(T0, [log('bb_bench_press', 60), log('bb_back_squat', 100)]),
      session(T0 + DAY, [log('bb_bench_press', 62.5), log('bb_back_squat', 110)]), // +2.5 vs +10
    ];
    const card = recordCardFromHistory(hist, 'kg');
    expect(card!.exerciseId).toBe('bb_back_squat');
    expect(card!.delta).toBe(10);
  });

  it('a first-ever load is a record, but claims no delta and no context', () => {
    const card = recordCardFromHistory([session(T0, [log('bb_bench_press', 40)])], 'kg');
    expect(card).toMatchObject({ kind: 'record', weight: 40, delta: null, weeksAgo: null, firstWeight: null });
  });

  it('shows lb figures for an lb athlete', () => {
    const hist = [
      session(T0, [log('bb_bench_press', 60)]),
      session(T0 + DAY, [log('bb_bench_press', 62.5)]),
    ];
    const card = recordCardFromHistory(hist, 'lb');
    expect(card!.unit).toBe('lb');
    expect(card!.weight).toBe(Math.round(62.5 * 2.2046226));
  });
});

describe('weekCardFromHistory', () => {
  it('is null for an empty week', () => {
    expect(weekCardFromHistory([], T0, 80, 'kg')).toBeNull();
  });

  it('buckets the week, sums tonnage, and reports the honest change vs last week', () => {
    const hist = [
      // last week: 60×8 = 480 kg
      session(T0 - 6 * DAY, [log('bb_bench_press', 60)]),
      // this week: Mon 60×8=480, Wed 100×5=500 → 980 kg across 2 days
      session(T0, [log('bb_bench_press', 60)]),
      session(T0 + 2 * DAY, [log('bb_back_squat', 100, 5)]),
    ];
    const card = weekCardFromHistory(hist, T0, 80, 'kg', MEMBER_SINCE);
    expect(card).not.toBeNull();
    expect(card!.kind).toBe('week');
    expect(card!.trainedDays).toBe(2);
    expect(card!.moved).toBe(980);
    expect(card!.days[0].trained).toBe(true); // Monday
    expect(card!.days[2].trained).toBe(true); // Wednesday
    expect(card!.days[1].trained).toBe(false);
    // +104% vs last week's 480 → round((980-480)/480*100)
    expect(card!.deltaPct).toBe(Math.round(((980 - 480) / 480) * 100));
    // The account's own week count, not a block count from the first workout.
    expect(card!.weekNumber).toBe(trainingWeekNumber(MEMBER_SINCE, T0));
  });

  it('leaves the delta null when there is no prior week', () => {
    const card = weekCardFromHistory([session(T0, [log('bb_bench_press', 60)])], T0, 80, 'kg', new Date(T0).toISOString());
    expect(card!.deltaPct).toBeNull();
    expect(card!.weekNumber).toBe(1); // she joined this week
  });

  it('reports null calories without a bodyweight, but still counts the work', () => {
    const card = weekCardFromHistory([session(T0, [log('bb_bench_press', 60)])], T0, null, 'kg', MEMBER_SINCE);
    expect(card!.kcal).toBeNull();
    expect(card!.moved).toBe(480);
  });
});

describe('cardioCardFromActivity (founder 2026-08-23 — the run she posts)', () => {
  const activity = (id: string, km: number, extras: Record<string, unknown> = {}) => ({
    kind: 'cardio' as const,
    id,
    gait: 'run' as const,
    startedAt: '2026-08-23T07:00:00.000Z',
    durationSec: 37 * 60 + 41,
    distanceKm: km,
    avgPaceSec: 365,
    calories: 442,
    splits: [
      { km: 1, durationSec: 362, paceSec: 362, gait: 'run' as const },
      { km: 2, durationSec: 371, paceSec: 371, gait: 'run' as const },
    ],
    ...extras,
  });

  it('carries the saved facts, and each finished kilometre as its own time', () => {
    const card = cardioCardFromActivity(activity('a', 6.2), []);
    expect(card).not.toBeNull();
    expect(card!.distanceKm).toBe(6.2);
    expect(card!.durationSec).toBe(37 * 60 + 41);
    expect(card!.avgPaceSec).toBe(365);
    expect(card!.kcal).toBe(442);
    expect(card!.splits).toEqual([{ km: 1, sec: 362 }, { km: 2, sec: 371 }]);
  });

  it('a run with no distance is not a card', () => {
    expect(cardioCardFromActivity(activity('a', 0), [])).toBeNull();
  });

  it('an activity too short for an average carries none — never a 0:00', () => {
    expect(cardioCardFromActivity(activity('a', 0.4, { avgPaceSec: 0 }), [])!.avgPaceSec).toBeNull();
  });

  it('⛔ "longest" needs a BEFORE — a first run is a first run, not a record', () => {
    expect(cardioCardFromActivity(activity('a', 6.2), [])!.longest).toBe(false);
  });

  it('…and is claimed only strictly past every prior run', () => {
    const prior = [activity('p1', 5.0), activity('p2', 6.2)];
    expect(cardioCardFromActivity(activity('a', 6.2), prior)!.longest).toBe(false); // a tie is not further
    expect(cardioCardFromActivity(activity('a', 6.3), prior)!.longest).toBe(true);
  });

  it('…and the activity itself, already in the log, does not compete with itself', () => {
    const self = activity('a', 6.3);
    expect(cardioCardFromActivity(self, [activity('p1', 5.0), self])!.longest).toBe(true);
  });

  it('a missing calorie estimate is null on the card, never 0', () => {
    expect(cardioCardFromActivity(activity('a', 6.2, { calories: undefined }), [])!.kcal).toBeNull();
  });
});

describe('the record rides the session card (founder, device QA 2026-08-23)', () => {
  it('a session that set a record carries it as a line', () => {
    const history = [
      session(T0 - 7 * 86_400_000, [log('bb_deadlift', 50)]),
      session(T0, [log('bb_deadlift', 55)]),
    ];
    const card = sessionCardFromHistory(history, 'kg', 80);
    expect(card).not.toBeNull();
    expect(card!.record).toEqual({ exerciseId: 'bb_deadlift', weight: 55, unit: 'kg', reps: expect.any(Number) });
  });

  it('a session that set none carries none — no line, never a stub', () => {
    const history = [
      session(T0 - 7 * 86_400_000, [log('bb_deadlift', 60)]),
      session(T0, [log('bb_deadlift', 55)]),
    ];
    expect(sessionCardFromHistory(history, 'kg', 80)!.record).toBeUndefined();
  });
});

describe('trained together rides the story card (founder, 2026-08-23)', () => {
  it('the names she stamped on the session appear on the card', () => {
    const withPartners = { ...session(T0, [log('bb_bench_press', 60)]), partners: ['דנה', 'אורי'] };
    const card = sessionCardFromHistory([withPartners], 'kg', 80);
    expect(card!.partners).toEqual(['דנה', 'אורי']);
  });

  it('a session trained alone carries no partners field — never an empty list', () => {
    expect(sessionCardFromHistory([session(T0, [log('bb_bench_press', 60)])], 'kg', 80)!.partners).toBeUndefined();
  });
});
