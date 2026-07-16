/**
 * Engine v5 · Stage 8 — the approach set (S-60) end-to-end through the façade. A set marked
 * isApproach is a MEASUREMENT, not work: it is excluded from the weekly fold (the decision, the
 * anchor, the observed grid, the rail). The pure core already filters it; this proves the
 * persistence plumbing (SetLog.isApproach → setPerfs) carries the mark.
 */
import { ensureExercisesV5, advanceV5, currentV5Targets, resetV5 } from '@/engine/v5/v5Engine';
import { bandFor } from '@/engine/v5/repBand';
import type { Session, SetLog } from '@/data/local/models';

const BAND = bandFor('8-10');
const seed = (id: string) => (id === 'bb_bench_press' ? 40 : null);
const set = (w: number | null, reps: number, isApproach = false): SetLog => ({
  exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: w, recommendedReps: 8,
  actualWeight: w, actualReps: reps, edited: false, persistedAt: '', restBeforeS: 90,
  ...(isApproach ? { isApproach: true } : {}),
});
const session = (startedAt: string, sets: SetLog[]): Session => ({ id: `s_${startedAt}`, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false, sets });

const WEEK1 = new Date('2026-07-15T10:00:00Z').toISOString();
const ROLL1 = new Date('2026-07-16T10:00:00Z').getTime();
const ROLL2 = new Date('2026-07-20T10:00:00Z').getTime();

describe('Stage 8 · the approach set is excluded from the fold', () => {
  beforeEach(async () => { await resetV5(); });

  it('a light approach set does not drag the progression — only the working sets decide', async () => {
    // Week: an approach set at 40 (measurement) + three working sets at 60 that all meet Tlo.
    const history: Session[] = [session(WEEK1, [set(40, 20, true), set(60, 8), set(60, 8), set(60, 8)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL1);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL2);
    const t = await currentV5Targets(history);
    // Working sets (60×8) all met Tlo → progress from 60, NOT from the 40 approach set.
    expect(t['bb_bench_press'].weight!).toBeGreaterThan(60);
  });

  it('S-38 · after a long layoff (aged out of the recency window) the next set is an approach set', async () => {
    const performedAt = new Date('2026-06-01T10:00:00Z');
    const history: Session[] = [session(performedAt.toISOString(), [set(80, 8), set(80, 8)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    // 10 days later — within the window → NOT an approach set.
    const soon = performedAt.getTime() + 10 * 86400000;
    expect((await currentV5Targets(history, soon))['bb_bench_press'].isApproach).toBe(false);
    // 40 days later — aged out (> 28-day F-8 window) → approach set re-measures her (S-38).
    const later = performedAt.getTime() + 40 * 86400000;
    expect((await currentV5Targets(history, later))['bb_bench_press'].isApproach).toBe(true);
  });

  it('S-60 / B-1 · the approach set is prescribed LIGHT — a fraction of the working load, never cold on a stale number', async () => {
    const performedAt = new Date('2026-06-01T10:00:00Z');
    // She last benched 80 kg, then a long layoff aged it out of the window.
    const history: Session[] = [session(performedAt.toISOString(), [set(80, 8), set(80, 8)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    const later = performedAt.getTime() + 40 * 86400000; // > 28-day F-8 window → approach
    const t = (await currentV5Targets(history, later))['bb_bench_press'];
    expect(t.isApproach).toBe(true);
    expect(t.weight).toBe(80); // the working sets still stand at her real number (Loop 1 guards them)
    // The APPROACH set is light: strictly below the working load, and strictly above zero (reachable).
    expect(t.approachWeight).not.toBeNull();
    expect(t.approachWeight!).toBeLessThan(t.weight!);
    expect(t.approachWeight!).toBeGreaterThan(0);
    // A non-approach lift carries no approachWeight.
    const soon = performedAt.getTime() + 10 * 86400000;
    expect((await currentV5Targets(history, soon))['bb_bench_press'].approachWeight).toBeNull();
  });

  it('a week with ONLY an approach set banks no decision (nothing but a measurement happened)', async () => {
    const history: Session[] = [session(WEEK1, [set(40, 20, true)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL1);
    const before = (await currentV5Targets(history))['bb_bench_press'].weight;
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL2);
    const after = (await currentV5Targets(history))['bb_bench_press'].weight;
    expect(after).toBe(before); // no working sets → no change
  });
});
