/**
 * The engine's receipt (2026-09-01, audit M2) — decisions counted off the log, and the fixed-plan
 * counterfactual whose every number is either logged or the named rule's own arithmetic.
 */
// @ts-nocheck

//

import { engineReceipt } from '@/domain/engineReceipt';

const T0 = Date.parse('2026-08-01T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const session = (startMs, sets) => ({
  id: `s_${startMs}`,
  startedAt: new Date(startMs).toISOString(),
  sets,
});

const rx = (exerciseId, recommendedWeight, opts = {}) => ({
  exerciseId,
  setIndex: 0,
  recommendedWeight,
  recommendedReps: 8,
  actualWeight: recommendedWeight,
  actualReps: 8,
  edited: false,
  ...opts,
});

describe('engineReceipt', () => {
  it('no history → an empty receipt, nothing invented', () => {
    expect(engineReceipt([])).toEqual({ decisions: 0, raises: 0, holds: 0, eases: 0, counterfactual: null });
  });

  it('counts decisions and directions off consecutive prescriptions of the same lift', () => {
    const h = [
      session(T0 + 0 * DAY, [rx('bb_bench_press', 60)]),
      session(T0 + 2 * DAY, [rx('bb_bench_press', 62.5)]), // raise
      session(T0 + 4 * DAY, [rx('bb_bench_press', 62.5)]), // hold
      session(T0 + 6 * DAY, [rx('bb_bench_press', 60)]), // ease
    ];
    const r = engineReceipt(h);
    expect(r.decisions).toBe(3);
    expect(r.raises).toBe(1);
    expect(r.holds).toBe(1);
    expect(r.eases).toBe(1);
  });

  it('approach sets and repeat sets in one session never count as occurrences', () => {
    const h = [
      session(T0, [
        rx('bb_bench_press', 55, { isApproach: true }), // warm-up bridge — not a prescription read
        rx('bb_bench_press', 60),
        rx('bb_bench_press', 60, { setIndex: 1 }), // set 2 of the same occurrence
      ]),
      session(T0 + 2 * DAY, [rx('bb_bench_press', 62.5)]),
    ];
    const r = engineReceipt(h);
    expect(r.decisions).toBe(1); // two occurrences → one decision between them
    expect(r.raises).toBe(1);
  });

  it('the counterfactual states where "+1 step per session" would stand, off HER OWN first word', () => {
    // Engine holds her at 60 for 5 sessions (she never met the target). Barbell grain = 2.5.
    const h = Array.from({ length: 5 }, (_, i) => session(T0 + i * 2 * DAY, [rx('bb_bench_press', 60)]));
    const r = engineReceipt(h);
    expect(r.counterfactual).toEqual({
      exerciseId: 'bb_bench_press',
      occurrences: 5,
      fixedKg: 70, // 60 + 4 steps × 2.5 — the named rule's own arithmetic
      engineKg: 60, // read off her latest logged prescription
    });
  });

  it('under two grains apart there is no story — the receipt says nothing', () => {
    // Engine raised every session: engine 70 vs fixed 70 after 5 occurrences — identical.
    const h = Array.from({ length: 5 }, (_, i) => session(T0 + i * 2 * DAY, [rx('bb_bench_press', 60 + i * 2.5)]));
    expect(engineReceipt(h).counterfactual).toBeNull();
  });

  it('young lifts stay out of the counterfactual — two plans need time to differ', () => {
    const h = [
      session(T0, [rx('bb_bench_press', 60)]),
      session(T0 + 2 * DAY, [rx('bb_bench_press', 60)]),
      session(T0 + 4 * DAY, [rx('bb_bench_press', 60)]),
    ];
    expect(engineReceipt(h).counterfactual).toBeNull(); // 3 occurrences < the floor of 4
  });
});
