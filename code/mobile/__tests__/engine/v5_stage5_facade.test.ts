/**
 * Engine v5 · Stage 5 — the integration façade (v5Engine). Proves Loop 2 + the rail persist and
 * drive the prescription end-to-end over history, exercise-keyed, at the weekly roll.
 */
import { ensureExercisesV5, advanceV5, currentV5Targets, perRungForV5, resetV5 } from '@/engine/v5/v5Engine';
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

describe('Loop 1 · perRungForV5 — her fitted reps-per-rung from history (F-13)', () => {
  it('null until enough like-for-like pairs (B-5 → one cautious rung)', () => {
    const history = [session('2026-07-08T10:00:00Z', [set('bb_bench_press', 60, 9)])]; // one point → no slope
    expect(perRungForV5('bb_bench_press', history)).toBeNull();
  });

  it('a real slope once she has spread of loads at like-for-like rest (heavier costs reps)', () => {
    // Same rest (90s), reps fall as load rises → a positive reps-per-rung.
    const history = [
      session('2026-07-01T10:00:00Z', [set('bb_bench_press', 55, 12), set('bb_bench_press', 60, 10)]),
      session('2026-07-03T10:00:00Z', [set('bb_bench_press', 65, 8), set('bb_bench_press', 70, 6)]),
    ];
    const pr = perRungForV5('bb_bench_press', history);
    expect(pr).not.toBeNull();
    expect(pr!).toBeGreaterThan(0);
  });

  it('bodyweight has no load axis → null (Loop 1 never corrects it)', () => {
    const history = [session('2026-07-01T10:00:00Z', [set('pull_up', null, 10), set('pull_up', null, 8)])];
    expect(perRungForV5('pull_up', history)).toBeNull();
  });
});

describe('Stage 5 · the façade drives the prescription from exercise-keyed state', () => {
  beforeEach(async () => { await resetV5(); });

  it('S-9 · established from history — no cold start', async () => {
    const history: Session[] = [session('2026-07-08T10:00:00Z', [set('bb_bench_press', 70, 9), set('bb_bench_press', 70, 8)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    const t = await currentV5Targets(history);
    expect(t['bb_bench_press'].weight).toBe(70); // her demonstrated load, not the 60 seed
    expect(t['bb_bench_press'].reps).toBe(8); // Tlo
    expect(t['bb_bench_press'].bandHi).toBe(10); // Thi
  });

  it('S-1 / S-8 · never performed (loaded) → the prescription is the working seed from set 1 (no approach set)', async () => {
    await ensureExercisesV5(['bb_bench_press'], BAND, [], seed);
    const t = await currentV5Targets([]);
    expect(t['bb_bench_press'].weight).toBe(60); // the seed, shown as the working load from the first set
  });

  it('S-22 · a full-clear workout advances the load PER WORKOUT (not at Saturday — L7)', async () => {
    const history: Session[] = [session(new Date(WEEK1).toISOString(), [set('bb_bench_press', 60, 8), set('bb_bench_press', 60, 8), set('bb_bench_press', 60, 8)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    const before = (await currentV5Targets(history))['bb_bench_press'].weight;
    // ONE advance folds the completed workout immediately — no waiting for a weekly boundary.
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL1);
    expect((await currentV5Targets(history))['bb_bench_press'].weight!).toBeGreaterThan(before!);
    // A second advance with no new session folds nothing (idempotent on the cursor).
    const after1 = (await currentV5Targets(history))['bb_bench_press'].weight;
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL2);
    expect((await currentV5Targets(history))['bb_bench_press'].weight).toBe(after1);
  });

  it('S-29/S-5 · two workouts of a lift in one week EACH advance it (per-workout, builds on itself)', async () => {
    // Monday: full clear at 60 → up. Thursday: full clear at 62.5 → up again. Per-workout gives ~65;
    // a weekly bundle (the old, wrong cadence) would combine them and give only ~62.5.
    const mon = new Date('2026-07-13T10:00:00Z').toISOString();
    const thu = new Date('2026-07-16T10:00:00Z').toISOString();
    const history: Session[] = [
      session(thu, [set('bb_bench_press', 62.5, 8), set('bb_bench_press', 62.5, 8), set('bb_bench_press', 62.5, 8)]), // newest first
      session(mon, [set('bb_bench_press', 60, 8), set('bb_bench_press', 60, 8), set('bb_bench_press', 60, 8)]),
    ];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL2); // folds Mon then Thu, in order
    const w = (await currentV5Targets(history))['bb_bench_press'].weight!;
    expect(w).toBeGreaterThan(62.5); // Thursday built on Monday's gain
  });

  it('S-43 · changing T recomputes the load from her history at the new Tlo', async () => {
    // She did 70×8 and 60×12. At band 8-10 (Tlo 8) → load 70 (heaviest at ≥8). At 12-15 (Tlo 12) →
    // load 60 (the heaviest load she performed ≥12 reps at). No conversion formula — her own history.
    const history: Session[] = [session('2026-07-10T10:00:00Z', [set('bb_bench_press', 70, 8), set('bb_bench_press', 60, 12)])];
    await ensureExercisesV5(['bb_bench_press'], bandFor('8-10'), history, seed);
    expect((await currentV5Targets(history))['bb_bench_press'].weight).toBe(70);
    await ensureExercisesV5(['bb_bench_press'], bandFor('12-15'), history, seed);
    const t = await currentV5Targets(history);
    expect(t['bb_bench_press'].weight).toBe(60);
    expect(t['bb_bench_press'].reps).toBe(12); // Tlo now 12
  });

  it('S-24 · a mixed workout (one set short) holds the load', async () => {
    const history: Session[] = [session(new Date(WEEK1).toISOString(), [set('bb_bench_press', 60, 8), set('bb_bench_press', 60, 8), set('bb_bench_press', 60, 6)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    const before = (await currentV5Targets(history))['bb_bench_press'].weight;
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL1);
    expect((await currentV5Targets(history))['bb_bench_press'].weight).toBe(before); // held
  });
});
