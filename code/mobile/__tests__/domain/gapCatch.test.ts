/**
 * The gap catch (2026-09-01) — the day-six note's arithmetic.
 *
 * The contract: armed only off a real history, always six days after the LAST session, made of
 * her heaviest completed working set (approach sets and zero-rep rows never speak), silent when
 * the moment has already passed, and silent for a beginner — a beginning is not a gap.
 */
// @ts-nocheck

//

import { gapCatchPlan, GAP_CATCH_DAYS } from '@/domain/gapCatch';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-08-01T10:00:00Z');

const session = (startMs, sets) => ({
  id: `s_${startMs}`,
  startedAt: new Date(startMs).toISOString(),
  sets,
});

const set = (exerciseId, actualWeight, actualReps, isApproach = false) => ({
  exerciseId,
  actualWeight,
  actualReps,
  isApproach,
});

describe('gapCatchPlan', () => {
  it('a beginning is not a gap — no history, no note', () => {
    expect(gapCatchPlan([], T0)).toBeNull();
  });

  it('fires six days after the LAST session, whatever order history arrives in', () => {
    const h = [
      session(T0 + 3 * DAY, [set('bb_bench_press', 70, 8)]),
      session(T0, [set('bb_bench_press', 60, 8)]), // older, listed later — must not win
    ];
    const plan = gapCatchPlan(h, T0 + 4 * DAY);
    expect(plan.fireAtMs).toBe(T0 + 3 * DAY + GAP_CATCH_DAYS * DAY);
  });

  it('the fact is her heaviest completed working set — approach sets and zero-rep rows never speak', () => {
    const h = [
      session(T0, [
        set('bb_back_squat', 100, 8, true), // approach — excluded (S-60)
        set('bb_bench_press', 72.5, 8),
        set('bb_bench_press', 80, 0), // zero reps — not performed
        set('lat_pulldown', 55, 10),
      ]),
    ];
    const plan = gapCatchPlan(h, T0 + DAY);
    expect(plan.fact).toEqual({ exerciseId: 'bb_bench_press', loadKg: 72.5 });
  });

  it('a bodyweight-only session arms the note with no fact — the no-fact copy carries it', () => {
    const h = [session(T0, [set('push_up', null, 12)])];
    const plan = gapCatchPlan(h, T0 + DAY);
    expect(plan).not.toBeNull();
    expect(plan.fact).toBeNull();
  });

  it('a fire-at already in the past schedules nothing — the comeback surface owns her return', () => {
    const h = [session(T0, [set('bb_bench_press', 70, 8)])];
    expect(gapCatchPlan(h, T0 + (GAP_CATCH_DAYS + 1) * DAY)).toBeNull();
    // …and exactly at the boundary it is also silent (<=, not <): a note "due now" is a note late.
    expect(gapCatchPlan(h, T0 + GAP_CATCH_DAYS * DAY)).toBeNull();
  });

  /*
   * ⛔ CARDIO IS TRAINING (the same-day correction). The first cut read only strength, so a
   * Tuesday run left the app saying "six days since your last workout" on Sunday — over a run
   * sitting in its own ledger. The clock counts every kind of training; the FACT stays a load.
   */
  it('a run pushes the note out — a fact must be made of all the facts', () => {
    const h = [session(T0, [set('bb_bench_press', 70, 8)])];
    const run = [{ kind: 'cardio', id: 'c1', startedAt: new Date(T0 + 3 * DAY).toISOString() }];
    expect(gapCatchPlan(h, T0 + 4 * DAY).fireAtMs).toBe(T0 + GAP_CATCH_DAYS * DAY); // strength only
    expect(gapCatchPlan(h, T0 + 4 * DAY, run).fireAtMs).toBe(T0 + 3 * DAY + GAP_CATCH_DAYS * DAY);
    // …and the run never becomes the subject: the standing fact is still her bench.
    expect(gapCatchPlan(h, T0 + 4 * DAY, run).fact).toEqual({ exerciseId: 'bb_bench_press', loadKg: 70 });
  });

  it('an athlete whose whole record is runs still gets the note, with no fact', () => {
    const run = [{ kind: 'cardio', id: 'c1', startedAt: new Date(T0).toISOString() }];
    const plan = gapCatchPlan([], T0 + DAY, run);
    expect(plan).not.toBeNull();
    expect(plan.fact).toBeNull();
    expect(plan.fireAtMs).toBe(T0 + GAP_CATCH_DAYS * DAY);
  });

  it('training again pushes the note out — the consistent athlete never sees it', () => {
    const h1 = [session(T0, [set('bb_bench_press', 70, 8)])];
    const p1 = gapCatchPlan(h1, T0 + DAY);
    const h2 = [...h1, session(T0 + 2 * DAY, [set('bb_bench_press', 72.5, 8)])];
    const p2 = gapCatchPlan(h2, T0 + 2 * DAY + 1);
    expect(p2.fireAtMs - p1.fireAtMs).toBe(2 * DAY);
    expect(p2.fact.loadKg).toBe(72.5); // and the fact follows the newest session
  });
});
