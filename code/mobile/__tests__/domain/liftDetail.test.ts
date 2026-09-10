/**
 * ONE LIFT'S STORY (v7 3.2b) — the climb, the marks, and the engine's stamped ledger.
 *
 * The screen's whole claim is that it INVENTS nothing: every point is a day she trained, every mark
 * a threshold she actually crossed, every ledger row a decision the engine already made. These are
 * the tests that hold that claim.
 */
// @ts-nocheck

// 

import { liftClimb, liftMoments, liftChanges, changeDirection, pointIndexAt } from '@/domain/liftDetail';
import type { EngineV5State } from '@/data/local/db';
import type { Session } from '@/data/local/models';

const iso = (d: string) => `${d}T09:00:00.000Z`;

/** One logged session: a date, and this lift's working sets as [weight, reps] pairs. */
const session = (id: string, date: string, sets: [number | null, number][], exerciseId = 'bb_row'): Session =>
  ({
    id,
    startedAt: iso(date),
    sets: sets.map(([w, r], i) => ({
      exerciseId,
      setIndex: i,
      actualWeight: w,
      actualReps: r,
      persistedAt: iso(date),
    })),
  }) as unknown as Session;

const change = (at: string, loadFrom: number | null, loadTo: number | null, extra: Record<string, unknown> = {}) =>
  ({
    exerciseId: 'bb_row',
    decision: 'progress',
    loadFrom,
    loadTo,
    setsFrom: 3,
    setsTo: 3,
    bandFrom: [8, 10],
    bandTo: [8, 10],
    at: Date.parse(iso(at)),
    ...extra,
  }) as NonNullable<EngineV5State['changeLog']>[number];

describe('the climb', () => {
  it('draws one point per training DAY, as a running max', () => {
    const c = liftClimb(
      [
        session('a', '2026-06-02', [[34, 8], [34, 8]]),
        session('b', '2026-06-09', [[36, 9]]),
        // a day she came in under her peak — the line must HOLD, not dip
        session('c', '2026-06-16', [[34, 10]]),
        session('d', '2026-06-23', [[40, 8]]),
      ],
      'bb_row',
    );
    expect(c.points.map((p) => p.value)).toEqual([34, 36, 36, 40]);
    // …while the day's own reading stays honest beside it
    expect(c.points.map((p) => p.dayBest)).toEqual([34, 36, 34, 40]);
    expect(c.best).toBe(40);
    expect(c.current).toBe(40);
    expect(c.mode).toBe('load');
  });

  it('folds two sessions on one calendar day into a single point', () => {
    const c = liftClimb(
      [session('a', '2026-06-02', [[34, 8]]), session('b2', '2026-06-02', [[38, 8]])],
      'bb_row',
    );
    expect(c.points).toHaveLength(1);
    expect(c.points[0].dayBest).toBe(38);
  });

  it('climbs by REPS when the lift was never loaded', () => {
    const c = liftClimb(
      [session('a', '2026-06-02', [[null, 6]], 'pull_up'), session('b', '2026-06-09', [[null, 9]], 'pull_up')],
      'pull_up',
    );
    expect(c.mode).toBe('reps');
    expect(c.points.map((p) => p.value)).toEqual([6, 9]);
  });

  it('reports current BELOW best when she came back lifting less', () => {
    const c = liftClimb(
      [session('a', '2026-06-02', [[50, 8]]), session('b', '2026-07-02', [[40, 8]])],
      'bb_row',
    );
    expect(c.best).toBe(50);
    expect(c.current).toBe(40); // the honest reading — not the record
  });

  it('is empty, and does not throw, for a lift never trained', () => {
    const c = liftClimb([session('a', '2026-06-02', [[34, 8]])], 'bb_bench_press');
    expect(c.points).toEqual([]);
    expect(c.firstAtMs).toBeNull();
  });
});

describe('the few that mattered', () => {
  const history = [
    session('a', '2026-06-02', [[34, 8]]),
    session('b', '2026-06-09', [[36, 9]]),
    session('c', '2026-06-23', [[47.5, 8]]),
  ];

  it('opens with where she stands and closes with where she began', () => {
    const m = liftMoments(history, null, 'bb_row');
    expect(m[0].kind).toBe('best');
    expect(m[0].value).toBe(47.5);
    expect(m[m.length - 1].kind).toBe('origin');
    expect(m[m.length - 1].value).toBe(34);
  });

  it('says ONE thing when the lift was trained once — beginning and standing are the same day', () => {
    const m = liftMoments([session('a', '2026-06-02', [[34, 8]])], null, 'bb_row');
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe('origin');
  });

  it('has nothing to say about a lift never trained', () => {
    expect(liftMoments(history, null, 'bb_deadlift')).toEqual([]);
  });
});

describe('the stamped ledger', () => {
  const log = [
    change('2026-06-02', null, 34),
    change('2026-06-09', 34, 36),
    change('2026-06-16', 36, 36),
    change('2026-06-23', 36, 34, { decision: 'reprice' }),
    change('2026-06-30', 40, 40, { kind: 'graduate', toExercise: 'bb_pendlay_row' }),
    { ...change('2026-06-09', 20, 22.5), exerciseId: 'bb_bench_press' },
  ];

  it('keeps only this lift, newest first', () => {
    const rows = liftChanges(log, 'bb_row');
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.loadTo)).toEqual([40, 34, 36, 36, 34]);
  });

  it('claims both sides of a graduation — the lift it was, and the lift it became', () => {
    expect(liftChanges(log, 'bb_pendlay_row').map((r) => r.kind)).toEqual(['graduate']);
  });

  it('reads the direction off the stamped numbers, never off the decision word', () => {
    expect(changeDirection({ atMs: 0, loadFrom: 34, loadTo: 36, decision: 'x' })).toBe('up');
    expect(changeDirection({ atMs: 0, loadFrom: 36, loadTo: 34, decision: 'x' })).toBe('down');
    expect(changeDirection({ atMs: 0, loadFrom: 36, loadTo: 36, decision: 'x' })).toBe('hold');
    // a seed has no "from" — it moved nothing, so it held
    expect(changeDirection({ atMs: 0, loadFrom: null, loadTo: 34, decision: 'x' })).toBe('hold');
  });

  it('holds no rows at all before the engine has ever folded', () => {
    expect(liftChanges(undefined, 'bb_row')).toEqual([]);
  });
});

describe('a change finds its day on the climb', () => {
  const c = liftClimb(
    [session('a', '2026-06-02', [[34, 8]]), session('b', '2026-06-09', [[36, 9]])],
    'bb_row',
  );

  it('matches by calendar day, not by exact timestamp', () => {
    // A training day is a LOCAL day, so the probe is built in local time — the same clock the
    // athlete reads, and the one `dayKey` buckets on.
    const sameDayLater = new Date(c.points[1].atMs);
    sameDayLater.setHours(21, 44, 0, 0);
    expect(pointIndexAt(c.points, sameDayLater.getTime())).toBe(1);
  });

  it('says -1 when the change predates the days still on the climb', () => {
    expect(pointIndexAt(c.points, Date.parse(iso('2026-05-01')))).toBe(-1);
  });
});

describe('strengthEstimate — measured strength, said honestly (2026-09-09)', () => {
  const { strengthEstimate } = require('@/domain/liftDetail');

  it('reads Epley from the one working set that says the most, and names the set', () => {
    const est = strengthEstimate(
      [session('a', '2026-09-01', [[60, 8], [60, 8]]), session('b', '2026-09-03', [[70, 5], [65, 8]])],
      'bb_row',
    );
    // 65×8 → 82.3; 70×5 → 81.7; 60×8 → 76 — the 65×8 set wins, and it says so.
    expect(est).toMatchObject({ e1rm: 82.5, load: 65, reps: 8 });
  });

  it('ignores sets past ten reps, bodyweight sets, warm-ups and presumed sets', () => {
    const s = session('a', '2026-09-01', [[40, 20], [null, 8]]);
    s.sets.push({ exerciseId: 'bb_row', setIndex: 2, actualWeight: 100, actualReps: 5, isApproach: true, persistedAt: iso('2026-09-01') });
    s.sets.push({ exerciseId: 'bb_row', setIndex: 3, actualWeight: 100, actualReps: 5, presumed: true, persistedAt: iso('2026-09-01') });
    expect(strengthEstimate([s], 'bb_row')).toBeNull();
  });

  it('is null for a lift with no evidence', () => {
    expect(strengthEstimate([], 'bb_row')).toBeNull();
  });
});
