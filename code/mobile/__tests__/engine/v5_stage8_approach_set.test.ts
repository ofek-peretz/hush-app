/**
 * Engine v5 · Stage 8 — legacy approach-set EXCLUSION from the fold.
 *
 * The approach / warm-up set was REMOVED as a prescription (founder ruling, 2026-07-16 — Build #33 QA):
 * no set is ever prescribed as an approach set again. But Build #33 shipped with it live, so testers'
 * on-device histories already contain sets marked `SetLog.isApproach`. Those must STAY excluded from
 * the fold (the decision, the anchor, the observed grid, the rail), or a 15 kg light set would pollute
 * her progression. This proves that legacy exclusion still holds.
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

  it('no approach set is ever prescribed — even after a long layoff the working load shows from set 1', async () => {
    const performedAt = new Date('2026-06-01T10:00:00Z');
    const history: Session[] = [session(performedAt.toISOString(), [set(80, 8), set(80, 8)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    const t = (await currentV5Targets(history))['bb_bench_press'];
    // The working load stands, from the very first set — no light measurement, no jump (founder ruling).
    expect(t.weight).toBe(80);
    // The field is gone entirely.
    expect((t as unknown as Record<string, unknown>).isApproach).toBeUndefined();
    expect((t as unknown as Record<string, unknown>).approachWeight).toBeUndefined();
  });

  it('a legacy week with ONLY an approach set banks no decision (nothing but a measurement happened)', async () => {
    const history: Session[] = [session(WEEK1, [set(40, 20, true)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL1);
    const before = (await currentV5Targets(history))['bb_bench_press'].weight;
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL2);
    const after = (await currentV5Targets(history))['bb_bench_press'].weight;
    expect(after).toBe(before); // no working sets → no change
  });
});
