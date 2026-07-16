/**
 * Engine v5 · Stage 7 — the Weekly Update from v5. advanceV5 records the week's from→to changes;
 * getWeeklyPlanV5 / getWeeklyUpdateV5 render them in the SAME shape the screens already consume, and
 * the gate follows the prescription swap (declared band → v5).
 */
import { ensureExercisesV5, advanceV5, getWeeklyPlanV5, getWeeklyUpdateV5, markWeeklyUpdateSeenV5, recordStructuralChangeV5, resetV5 } from '@/engine/v5/v5Engine';
import { bandFor } from '@/engine/v5/repBand';
import type { Session, SetLog, Program } from '@/data/local/models';

const BAND = bandFor('8-10');
const seed = (id: string) => (id === 'bb_bench_press' ? 60 : null);
const set = (w: number | null, reps: number): SetLog => ({ exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: w, recommendedReps: 8, actualWeight: w, actualReps: reps, edited: false, persistedAt: '', restBeforeS: 90 });
const session = (startedAt: string, sets: SetLog[]): Session => ({ id: `s_${startedAt}`, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false, sets });

const program: Program = {
  id: 'p', frequency: 1,
  days: [{ id: 'd1', name: 'Push', muscleGroups: ['Chest'], isRest: false, slots: [{ capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 3 }] }],
};

const WEEK1 = new Date('2026-07-15T10:00:00Z').toISOString();
const ROLL1 = new Date('2026-07-16T10:00:00Z').getTime();
const ROLL2 = new Date('2026-07-20T10:00:00Z').getTime();

describe('Stage 7 · v5 produces the Weekly Update the screens render', () => {
  beforeEach(async () => { await resetV5(); });

  it('a full-clear workout → a "load up" change in the closed-week mirror, unseen then seen', async () => {
    const history: Session[] = [session(WEEK1, [set(60, 8), set(60, 8), set(60, 8)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL1); // per-workout: folds WEEK1 now

    // The mirror reads the week that closed at the most recent Saturday. ROLL2 (Jul 20) → the closed
    // week [Jul 11 20:30, Jul 18 20:30) contains WEEK1's Jul 15 change.
    const update = await getWeeklyUpdateV5(ROLL2);
    expect(update).not.toBeNull();
    expect(update!.seen).toBe(false);
    expect(update!.explanations.length).toBe(1);
    expect(update!.explanations[0].observation.key).toBe('explain.progressLoad.observation');

    const view = await getWeeklyPlanV5(program, ROLL2);
    expect(view!.changedCount).toBe(1);
    const lift = view!.workouts[0].lifts[0];
    expect(lift.change).not.toBeNull();
    expect(lift.change!.snapshot.loadFrom).toBe(60);
    expect(lift.change!.snapshot.loadTo!).toBeGreaterThan(60);
    expect(lift.change!.snapshot.swapped).toBe(false);

    await markWeeklyUpdateSeenV5(ROLL2);
    expect((await getWeeklyUpdateV5(ROLL2))!.seen).toBe(true);
  });

  it('S-45 · a graduation and a learned/rotation swap are NAMED in the mirror', async () => {
    const at = new Date('2026-07-15T10:00:00Z').getTime(); // inside the closed week
    await recordStructuralChangeV5('chin_up', 'bb_bench_press', 'graduate', at); // S-52 graduation
    await recordStructuralChangeV5('bb_bench_press', 'db_bench_press', 'swap', at); // S-69/S-25.3 swap
    const update = await getWeeklyUpdateV5(ROLL2);
    expect(update).not.toBeNull();
    const keys = update!.explanations.map((e) => e.observation.key);
    expect(keys).toContain('explain.graduate.observation');
    expect(keys).toContain('explain.swap.observation');
  });

  it('S-45 · a re-enacted structural change is logged once per week (idempotent)', async () => {
    const at = new Date('2026-07-15T10:00:00Z').getTime();
    await recordStructuralChangeV5('bb_bench_press', 'db_bench_press', 'swap', at);
    await recordStructuralChangeV5('bb_bench_press', 'db_bench_press', 'swap', at + 3_600_000); // same week, regen re-enact
    const update = await getWeeklyUpdateV5(ROLL2);
    expect(update!.explanations.filter((e) => e.observation.key === 'explain.swap.observation').length).toBe(1);
  });

  it('a steady (all-hold) workout surfaces no changes — the plan is already right', async () => {
    const history: Session[] = [session(WEEK1, [set(60, 8), set(60, 6)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL1);
    const view = await getWeeklyPlanV5(program, ROLL2);
    expect(view!.changedCount).toBe(0);
  });
});
