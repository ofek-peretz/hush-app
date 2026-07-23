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
import { recordCardFromHistory, weekCardFromHistory } from '@/domain/shareCard';
import type { Session, SetLog } from '@/data/local/models';

const T0 = Date.parse('2026-03-02T09:00:00.000Z'); // a Monday
const DAY = 86_400_000;

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
    const card = weekCardFromHistory(hist, T0, 80, 'kg');
    expect(card).not.toBeNull();
    expect(card!.kind).toBe('week');
    expect(card!.trainedDays).toBe(2);
    expect(card!.moved).toBe(980);
    expect(card!.days[0].trained).toBe(true); // Monday
    expect(card!.days[2].trained).toBe(true); // Wednesday
    expect(card!.days[1].trained).toBe(false);
    // +104% vs last week's 480 → round((980-480)/480*100)
    expect(card!.deltaPct).toBe(Math.round(((980 - 480) / 480) * 100));
    expect(card!.weekNumber).toBe(2); // first-ever session was the prior week
  });

  it('leaves the delta null when there is no prior week', () => {
    const card = weekCardFromHistory([session(T0, [log('bb_bench_press', 60)])], T0, 80, 'kg');
    expect(card!.deltaPct).toBeNull();
    expect(card!.weekNumber).toBe(1);
  });

  it('reports null calories without a bodyweight, but still counts the work', () => {
    const card = weekCardFromHistory([session(T0, [log('bb_bench_press', 60)])], T0, null, 'kg');
    expect(card!.kcal).toBeNull();
    expect(card!.moved).toBe(480);
  });
});
