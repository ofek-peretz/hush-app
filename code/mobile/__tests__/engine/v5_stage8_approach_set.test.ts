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
