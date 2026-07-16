/**
 * Engine v5 · Revision 7 — engine-initiated exercise changes (register S-52 graduate / S-25.3 rotate).
 * advanceV5 surfaces the wanted change; engineChanges resolves the target; the integration writes it to
 * substitutes (tested end-to-end via the assembler in v5_program_assembly's chain test).
 */
import { graduationTarget, rotationTarget, resolveEngineEnactments } from '@/domain/engineChanges';
import { ensureExercisesV5, advanceV5, resetV5 } from '@/engine/v5/v5Engine';
import { bandFor } from '@/engine/v5/repBand';
import { muscleOf } from '@/data/exercises';
import type { Session, SetLog } from '@/data/local/models';

const BAND = bandFor('8-10');
const bwSeed = () => null; // bodyweight lifts carry no external load
const set = (exerciseId: string, reps: number): SetLog => ({
  exerciseId, setIndex: 0, recommendedWeight: null, recommendedReps: 8, actualWeight: null, actualReps: reps, edited: false, persistedAt: '', restBeforeS: 90,
});
const session = (startedAt: string, sets: SetLog[]): Session => ({
  id: `s_${startedAt}`, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false, sets,
});

describe('Rev 7 · E — target resolution', () => {
  it('graduationTarget follows the bodyweight ladder; the top of a ladder holds (S-53)', () => {
    expect(graduationTarget('knee_push_up')).toBe('push_up');
    expect(graduationTarget('push_up')).toBe('chest_dip');
    expect(graduationTarget('pull_up')).toBeUndefined(); // nothing harder → holds honestly
    expect(graduationTarget('bb_bench_press')).toBeUndefined(); // loaded lift — no rep ladder
  });

  it('rotationTarget picks a same-muscle lift she has gone longest without', () => {
    const history = [session('2026-07-10T10:00:00Z', [set('bb_bench_press', 8)])];
    const target = rotationTarget('bb_bench_press', history);
    expect(target).toBeDefined();
    expect(muscleOf(target!)).toBe('Chest'); // same muscle
    expect(target).not.toBe('bb_bench_press'); // never itself
  });

  it('rotationTarget is undefined when the muscle has no other lift', () => {
    // A lift whose muscle pool is just itself has nothing to rotate to (guarded).
    // (Every real muscle has peers, so this asserts the guard shape, not a real catalogue gap.)
    expect(rotationTarget('___nonexistent___', [])).toBeUndefined();
  });
});

describe('Rev 7 · E — advanceV5 surfaces the wanted change', () => {
  beforeEach(async () => { await resetV5(); });

  it('a bodyweight lift held at the rep ceiling → graduate (S-52)', async () => {
    const history = [session('2026-07-15T10:00:00Z', [set('knee_push_up', 12), set('knee_push_up', 12), set('knee_push_up', 12)])];
    await ensureExercisesV5(['knee_push_up'], BAND, history, bwSeed);
    const changes = await advanceV5(['knee_push_up'], BAND, history, bwSeed, new Date('2026-07-16T10:00:00Z').getTime());
    expect(changes['knee_push_up']).toBe('graduate');
  });

  it('a progressing bodyweight lift wants NO change', async () => {
    const history = [session('2026-07-15T10:00:00Z', [set('knee_push_up', 9), set('knee_push_up', 9), set('knee_push_up', 9)])];
    await ensureExercisesV5(['knee_push_up'], BAND, history, bwSeed);
    const changes = await advanceV5(['knee_push_up'], BAND, history, bwSeed, new Date('2026-07-16T10:00:00Z').getTime());
    expect(changes['knee_push_up']).toBeUndefined();
  });
});

describe('Rev 7 · S-30/S-71/S-72 — resolveEngineEnactments honours a leave-it pin', () => {
  const history = [session('2026-07-10T10:00:00Z', [set('bb_bench_press', 8)])];

  it('a wanted rotation is enacted, and FLAGGED as a rotation (so it can be marked, S-71/S-72)', () => {
    const out = resolveEngineEnactments({ bb_bench_press: 'rotate' }, {}, history);
    expect(out.length).toBe(1);
    expect(out[0].from).toBe('bb_bench_press');
    expect(muscleOf(out[0].to)).toBe('Chest');
    expect(out[0].rotated).toBe(true); // a rotation → will be recorded in engineRotated
  });

  it('S-30/S-71 · a leave-it PIN is never rotated or graduated away — the change is dropped', () => {
    // Chest is pinned to bench (a learned leave-it). Even though the engine wants to rotate it, nothing
    // is enacted: the lift stays, keeping its load progression but never taken from her.
    expect(resolveEngineEnactments({ bb_bench_press: 'rotate' }, { Chest: 'bb_bench_press' }, history)).toEqual([]);
    expect(resolveEngineEnactments({ knee_push_up: 'graduate' }, { Chest: 'knee_push_up' }, history)).toEqual([]);
  });

  it('a pin on a DIFFERENT lift of the same muscle does not shield an unpinned one', () => {
    const out = resolveEngineEnactments({ bb_bench_press: 'rotate' }, { Chest: 'incline_bb_press' }, history);
    expect(out.length).toBe(1); // bench is not the pinned lift → it still rotates
  });

  it('a graduation is enacted but NOT flagged as a rotation (only rotations are resisted, S-71)', () => {
    const out = resolveEngineEnactments({ knee_push_up: 'graduate' }, {}, history);
    expect(out[0].kind).toBe('graduate');
    expect(out[0].rotated).toBe(false);
  });
});
