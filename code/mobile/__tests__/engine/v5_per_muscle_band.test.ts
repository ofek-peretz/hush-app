/**
 * Engine v5 · Revision 7 — per-muscle T (register Part 9, section A).
 *
 * T is no longer one band for the athlete: each exercise reads the band of its PRIMARY muscle
 * (`exercise.muscle`). The engine already stores the band per exercise (`ExerciseState.band`); the
 * façade now feeds it a per-exercise resolver instead of one scalar. These tests prove:
 *   • two lifts of different muscles resolve to different bands from one resolver;
 *   • changing ONE muscle's band updates only its exercises (isolated — S-43 per muscle);
 *   • a single scalar Band still works for every exercise (back-compat, what the older tests pass).
 */
import { ensureExercisesV5, currentV5Targets, resetV5 } from '@/engine/v5/v5Engine';
import { bandFor } from '@/engine/v5/repBand';
import { muscleOf } from '@/data/exercises';
import type { Session, SetLog } from '@/data/local/models';

const seed = (id: string) => (id === 'bb_bench_press' ? 60 : id === 'bb_back_squat' ? 80 : null);

const set = (exerciseId: string, w: number | null, reps: number, rest = 90): SetLog => ({
  exerciseId, setIndex: 0, recommendedWeight: w, recommendedReps: 8, actualWeight: w, actualReps: reps, edited: false, persistedAt: '', restBeforeS: rest,
});
const session = (startedAt: string, sets: SetLog[]): Session => ({
  id: `s_${startedAt}`, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false, sets,
});

// A resolver keyed on the muscle — exactly how the façade builds it from `repBandByMuscle`.
const perMuscle = (byMuscle: Record<string, ReturnType<typeof bandFor>>) => (id: string) =>
  byMuscle[muscleOf(id) ?? ''] ?? bandFor('8-10');

describe('Rev 7 · per-muscle T — each exercise reads its muscle band', () => {
  beforeEach(async () => { await resetV5(); });

  it('the premise: bench trains Chest, squat trains Quads (distinct muscles)', () => {
    expect(muscleOf('bb_bench_press')).toBe('Chest');
    expect(muscleOf('bb_back_squat')).toBe('Quads');
  });

  it('bench (Chest) and squat (Quads) get DIFFERENT bands from one resolver', async () => {
    const bandOf = perMuscle({ Chest: bandFor('8-10'), Quads: bandFor('12-15') });
    await ensureExercisesV5(['bb_bench_press', 'bb_back_squat'], bandOf, [], seed);
    const t = await currentV5Targets([]);
    expect(t['bb_bench_press'].reps).toBe(8);    // Chest Tlo
    expect(t['bb_bench_press'].bandHi).toBe(10);  // Chest Thi
    expect(t['bb_back_squat'].reps).toBe(12);     // Quads Tlo
    expect(t['bb_back_squat'].bandHi).toBe(15);   // Quads Thi
  });

  it('changing ONE muscle band updates only its exercises (S-43 per muscle, isolated)', async () => {
    const history: Session[] = [session('2026-07-10T10:00:00Z', [set('bb_bench_press', 70, 8), set('bb_back_squat', 100, 8)])];
    // Both at 8-10 to start.
    await ensureExercisesV5(['bb_bench_press', 'bb_back_squat'], perMuscle({ Chest: bandFor('8-10'), Quads: bandFor('8-10') }), history, seed);
    const before = await currentV5Targets(history);
    expect(before['bb_bench_press'].bandHi).toBe(10);
    expect(before['bb_back_squat'].bandHi).toBe(10);
    // She sets ONLY Quads → 12-15. Bench (Chest) must be untouched, band and load.
    await ensureExercisesV5(['bb_bench_press', 'bb_back_squat'], perMuscle({ Chest: bandFor('8-10'), Quads: bandFor('12-15') }), history, seed);
    const after = await currentV5Targets(history);
    expect(after['bb_bench_press'].reps).toBe(8);     // unchanged
    expect(after['bb_bench_press'].bandHi).toBe(10);   // unchanged
    expect(after['bb_bench_press'].weight).toBe(before['bb_bench_press'].weight); // load untouched
    expect(after['bb_back_squat'].reps).toBe(12);      // changed
    expect(after['bb_back_squat'].bandHi).toBe(15);    // changed
  });

  it('a single scalar Band still applies to every exercise (back-compat)', async () => {
    await ensureExercisesV5(['bb_bench_press', 'bb_back_squat'], bandFor('10-12'), [], seed);
    const t = await currentV5Targets([]);
    expect(t['bb_bench_press'].reps).toBe(10);
    expect(t['bb_back_squat'].reps).toBe(10);
  });
});
