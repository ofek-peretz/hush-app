/**
 * Her file (2026-09-01, audit M5) — the counted answer to "what would I lose by leaving?".
 *
 * The contract: day one is ZERO (a padded number teaches her not to believe it), a single rung is
 * an entry and not knowledge (the `knowsAnything` bar), approach sets never speak, and the count
 * only ever states what the engine's own evidence gates have earned.
 */
// @ts-nocheck

//

import { athleteFile } from '@/domain/athleteFile';

const T0 = Date.parse('2026-08-01T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const session = (startMs, sets) => ({
  id: `s_${startMs}`,
  startedAt: new Date(startMs).toISOString(),
  sets,
});

const set = (exerciseId, actualWeight, actualReps, isApproach = false) => ({
  exerciseId,
  setIndex: 0,
  recommendedWeight: actualWeight,
  recommendedReps: 8,
  actualWeight,
  actualReps,
  edited: false,
  isApproach,
});

describe('athleteFile', () => {
  it('day one is zero — and zero is stated, never padded', () => {
    expect(athleteFile([]).totalFacts).toBe(0);
    expect(athleteFile([]).lifts).toEqual([]);
  });

  it('one set AT target earns exactly one fact — the ceiling (L11) — and nothing else is claimed', () => {
    const h = [session(T0, [set('bb_bench_press', 60, 8)])];
    const file = athleteFile(h);
    expect(file.lifts).toHaveLength(1);
    expect(file.lifts[0].facts).toBe(1);
    expect(file.lifts[0].knowledge.ceiling).toBe(62.5); // one rung above her demonstrated 60
    expect(file.totalFacts).toBe(1);
  });

  it('one set BELOW target earns nothing — a single rung is an entry, not knowledge', () => {
    const h = [session(T0, [set('bb_bench_press', 60, 5)])]; // 5 < Tlo(8): no rail, one rung
    const file = athleteFile(h);
    expect(file.lifts).toEqual([]);
    expect(file.totalFacts).toBe(0);
  });

  it('two rungs make a grid fact; approach sets never contribute a rung', () => {
    const h = [
      session(T0, [set('bb_bench_press', 60, 8), set('bb_bench_press', 55, 10, true)]),
      session(T0 + 2 * DAY, [set('bb_bench_press', 62.5, 8)]),
    ];
    const file = athleteFile(h);
    const bench = file.lifts.find((l) => l.exerciseId === 'bb_bench_press');
    expect(bench).toBeDefined();
    expect(bench.knowledge.rungs).toEqual([60, 62.5]); // the approach 55 never became a rung
    expect(file.totalFacts).toBeGreaterThanOrEqual(1);
  });

  it('the most-known lift leads the file', () => {
    const h = [
      session(T0, [set('bb_bench_press', 60, 8), set('lat_pulldown', 50, 10)]),
      session(T0 + 2 * DAY, [set('bb_bench_press', 62.5, 8), set('lat_pulldown', 52.5, 10)]),
      session(T0 + 4 * DAY, [set('bb_bench_press', 65, 8)]),
    ];
    const file = athleteFile(h);
    expect(file.lifts[0].exerciseId).toBe('bb_bench_press'); // deeper grid → first
    // …and every listed lift carries at least one earned fact.
    for (const l of file.lifts) expect(l.facts).toBeGreaterThanOrEqual(1);
  });

  it('the headline is the sum of the per-lift facts — one accounting, no second derivation', () => {
    const h = [
      session(T0, [set('bb_bench_press', 60, 8), set('lat_pulldown', 50, 10)]),
      session(T0 + 2 * DAY, [set('bb_bench_press', 62.5, 8), set('lat_pulldown', 52.5, 10)]),
    ];
    const file = athleteFile(h);
    expect(file.totalFacts).toBe(file.lifts.reduce((n, l) => n + l.facts, 0));
  });
});
