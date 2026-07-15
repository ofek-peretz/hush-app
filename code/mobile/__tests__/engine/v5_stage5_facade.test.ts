/**
 * Engine v5 · Stage 5 — the integration façade (v5Engine). Proves Loop 2 + the rail persist and
 * drive the prescription end-to-end over history, exercise-keyed, at the weekly roll.
 */
import { ensureExercisesV5, advanceV5, currentV5Targets, resetV5 } from '@/engine/v5/v5Engine';
import { bandFor } from '@/engine/v5/repBand';
import type { Session, SetLog } from '@/data/local/models';

const BAND = bandFor('8-10'); // [8,10]
const seed = (id: string) => (id === 'bb_bench_press' ? 60 : null);

const set = (exerciseId: string, w: number | null, reps: number, rest = 90): SetLog => ({
  exerciseId, setIndex: 0, recommendedWeight: w, recommendedReps: 8, actualWeight: w, actualReps: reps, edited: false, persistedAt: '', restBeforeS: rest,
});
const session = (startedAt: string, sets: SetLog[]): Session => ({
  id: `s_${startedAt}`, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false, sets,
});

// The week roll happens at Sat 20:30. ROLL1 anchors on Sat Jul 11 20:30; the week-1 session sits
// AFTER that anchor and before ROLL2's Sat Jul 18 20:30 roll, so it is folded on the second advance.
const WEEK1 = new Date('2026-07-15T10:00:00Z').getTime(); // Wed, inside week 1's window
const ROLL1 = new Date('2026-07-16T10:00:00Z').getTime(); // establishes the anchor (Sat Jul 11 20:30)
const ROLL2 = new Date('2026-07-20T10:00:00Z').getTime(); // Mon after → rolls (Sat Jul 18 20:30)

describe('Stage 5 · the façade drives the prescription from exercise-keyed state', () => {
  beforeEach(async () => { await resetV5(); });

  it('S-9 · established from history — no cold start', async () => {
    const history: Session[] = [session('2026-07-08T10:00:00Z', [set('bb_bench_press', 70, 9), set('bb_bench_press', 70, 8)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    const t = await currentV5Targets(history);
    expect(t['bb_bench_press'].weight).toBe(70); // her demonstrated load, not the 60 seed
    expect(t['bb_bench_press'].reps).toBe(8); // Tlo
    expect(t['bb_bench_press'].bandHi).toBe(10); // Thi
    expect(t['bb_bench_press'].isApproach).toBe(false);
  });

  it('S-8 · never performed (loaded) → the prescription is an approach set', async () => {
    await ensureExercisesV5(['bb_bench_press'], BAND, [], seed);
    const t = await currentV5Targets([]);
    expect(t['bb_bench_press'].weight).toBe(60); // the seed
    expect(t['bb_bench_press'].isApproach).toBe(true);
  });

  it('S-22 · a full-clear week rolls the load UP at the Saturday boundary', async () => {
    // Establish the anchor at ROLL1 with a week-1 session already logged.
    let history: Session[] = [session(new Date(WEEK1).toISOString(), [set('bb_bench_press', 60, 8), set('bb_bench_press', 60, 8), set('bb_bench_press', 60, 8)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL1); // sets the anchor, no roll yet
    let t = await currentV5Targets(history);
    const before = t['bb_bench_press'].weight;

    // A week later the roll folds week-1's full-clear → load up.
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL2);
    t = await currentV5Targets(history);
    expect(t['bb_bench_press'].weight!).toBeGreaterThan(before!);
  });

  it('S-24 · a mixed week (one set short) holds the load', async () => {
    const history: Session[] = [session(new Date(WEEK1).toISOString(), [set('bb_bench_press', 60, 8), set('bb_bench_press', 60, 8), set('bb_bench_press', 60, 6)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL1);
    const beforeT = await currentV5Targets(history);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL2);
    const t = await currentV5Targets(history);
    expect(t['bb_bench_press'].weight).toBe(beforeT['bb_bench_press'].weight); // held
  });
});
