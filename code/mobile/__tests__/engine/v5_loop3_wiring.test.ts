/**
 * Engine v5 · D — Loop 3 (the Muscle loop) wired into advanceV5. Proves the LEARNED per-muscle set
 * target moves on facts, per occurrence: it grows when she completed the muscle's sets AND a lift
 * advanced (S-32), holds when she completed but nothing advanced (S-32b), and is trimmed after two
 * unfinished occurrences (S-34) — never below one exercise at the floor. It seeds from her real
 * (time-trimmed) prescription and never grows past one set beyond it (S-64), so a muscle can never
 * spiral past her minutes. Without a prescription source, Loop 3 no-ops (back-compat).
 */
// @ts-nocheck

// 

import { advanceV5, getVolumeTargetsV5, resetV5 } from '@/engine/v5/v5Engine';
import { bandFor } from '@/engine/v5/repBand';
import { muscleOf } from '@/data/exercises';
import type { Session, SetLog } from '@/data/local/models';

const BAND = bandFor('8-10'); // [8,10]
const seed = () => 60;
const CHEST = muscleOf('bb_bench_press')!; // 'Chest'

const set = (w: number, reps: number): SetLog => ({
  exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: w, recommendedReps: 8, actualWeight: w, actualReps: reps, edited: false, persistedAt: '', restBeforeS: 90,
});
const session = (startedAt: string, sets: SetLog[], earlyFinish = false): Session => ({
  id: `s_${startedAt}`, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish, sets,
});
const T = (n: number) => new Date(2026, 6, 8 + n, 10).toISOString(); // successive days, folded oldest-first

const prescribed3 = (id: string) => (id === 'bb_bench_press' ? 3 : 0);
const prescribed4 = (id: string) => (id === 'bb_bench_press' ? 4 : 0);

describe('D · Loop 3 — the learned per-muscle set target moves on facts', () => {
  beforeEach(async () => { await resetV5(); });

  it('S-32 · completed every set AND the lift advanced → +1 set (seeded from the real prescription)', async () => {
    const history = [session(T(0), [set(60, 9), set(60, 9), set(60, 9)])]; // 3 prescribed, 3 completed, a rep to spare → advances (S-22b)
    await advanceV5(['bb_bench_press'], BAND, history, seed, Date.now(), undefined, prescribed3);
    const vol = await getVolumeTargetsV5();
    expect(vol[CHEST]).toBe(4); // seed 3 → earned one → 4
  });

  it('S-32b · completed everything but nothing advanced → HOLD at the seed', async () => {
    // A stalled lift: she logs 3 sets but only 5 reps (below Tlo=8) → no advance, and completedAll is
    // still about SET COUNT, so she "completed everything" yet earned no volume (more volume ≠ a fix).
    const history = [session(T(0), [set(60, 5), set(60, 5), set(60, 5)])];
    await advanceV5(['bb_bench_press'], BAND, history, seed, Date.now(), undefined, prescribed3);
    const vol = await getVolumeTargetsV5();
    expect(vol[CHEST]).toBe(3); // held at the seed — nothing advanced
  });

  it('S-34 · unfinished twice in a row → −1 set (a first unfinished only holds)', async () => {
    // Prescribed 4, she logs only 2 each occurrence → unfinished. First holds (S-33), second cuts.
    const history = [
      session(T(0), [set(60, 8), set(60, 8)]),
      session(T(1), [set(62.5, 8), set(62.5, 8)]),
    ];
    await advanceV5(['bb_bench_press'], BAND, history, seed, Date.now(), undefined, prescribed4);
    const vol = await getVolumeTargetsV5();
    expect(vol[CHEST]).toBe(3); // seed 4 → hold → cut → 3
  });

  it('S-35 · a cut never drops the muscle below one exercise at the floor (3)', async () => {
    // Start already at the floor (prescribed 3) and miss twice → decideVolume returns at_floor (3).
    const history = [
      session(T(0), [set(60, 8)]),
      session(T(1), [set(62.5, 8)]),
    ];
    await advanceV5(['bb_bench_press'], BAND, history, seed, Date.now(), undefined, prescribed3);
    const vol = await getVolumeTargetsV5();
    expect(vol[CHEST]).toBe(3); // never below the floor
  });

  it('S-64 · an early-finished occurrence never grows volume, even with a completed count', async () => {
    const history = [session(T(0), [set(60, 8), set(60, 8), set(60, 8)], /* earlyFinish */ true)];
    await advanceV5(['bb_bench_press'], BAND, history, seed, Date.now(), undefined, prescribed3);
    const vol = await getVolumeTargetsV5();
    expect(vol[CHEST]).toBe(3); // held — she left the session early, so the muscle is not "completed"
  });

  it('D · a MULTI-DAY muscle seeds its WEEKLY volume, never one occurrence (no silent halving)', async () => {
    // Chest is trained twice this week (bench on one upper day, incline on another) → weekly 6 sets.
    // This session trained only bench. Seeding from ONE occurrence (bench=3) would store 3 and HALVE
    // the muscle at the next regeneration; seeding from the WEEKLY figure (6) stores 6 → grows to 7.
    const history = [session(T(0), [set(60, 9), set(60, 9), set(60, 9)])]; // bench: 3 done, a rep to spare → advances
    const prescribed = (id: string) => (id === 'bb_bench_press' ? 3 : id === 'incline_bb_press' ? 3 : 0);
    await advanceV5(['bb_bench_press', 'incline_bb_press'], BAND, history, seed, Date.now(), undefined, prescribed, { [CHEST]: 6 });
    const vol = await getVolumeTargetsV5();
    expect(vol[CHEST]).toBe(7); // seeded from WEEKLY 6, earned one → 7 (NOT the per-occurrence 3 → 4)
  });

  it('no prescription source → Loop 3 no-ops (back-compat: load still advances, volume untouched)', async () => {
    const history = [session(T(0), [set(60, 8), set(60, 8), set(60, 8)])];
    await advanceV5(['bb_bench_press'], BAND, history, seed); // no prescribedSets
    const vol = await getVolumeTargetsV5();
    expect(vol[CHEST]).toBeUndefined();
  });
});
