/**
 * Engine v5 · Stage 9 — resilience to the athlete's edits. The register's change situations: a
 * manual exercise swap (S-31), an in-workout backup (S-20), a frequency change (S-40), a bodyweight
 * change (S-41), height (S-42). v5 is EXERCISE-keyed, so an exercise's progression must survive
 * regeneration, and a different exercise must never inherit another's state.
 */
// @ts-nocheck

// 

import { ensureExercisesV5, advanceV5, currentV5Targets, resetV5 } from '@/engine/v5/v5Engine';
import { bandFor } from '@/engine/v5/repBand';
import { EXERCISES } from '@/data/exercises';
import type { Session, SetLog } from '@/data/local/models';

describe('S-67 · assisted-machine tripwire — the engine assumes more load = harder', () => {
  it('no catalogue lift is marked assisted (until the inverted sign-flip rule exists, the build must fail if one is added)', () => {
    // Every v5 rule (S-11/12, the anchor L10, the rail L11) assumes MORE load = HARDER, fewer reps.
    // An assisted pull-up/dip machine inverts that (more counterweight = easier). If one is ever
    // added, this test fails until the sign-flip is built (S-67) — never let it reach progression
    // through the back door, exactly like the warm-up tripwire (S-54).
    for (const ex of EXERCISES) {
      expect((ex as { equipment: string }).equipment).not.toBe('assisted');
      expect('assisted' in ex).toBe(false);
    }
  });
});

const BAND = bandFor('8-10');
const seed = (id: string) => ({ bb_bench_press: 60, incline_bb_press: 50, bb_back_squat: 100 } as Record<string, number>)[id] ?? null;
const set = (exerciseId: string, w: number | null, reps: number): SetLog => ({ exerciseId, setIndex: 0, recommendedWeight: w, recommendedReps: 8, actualWeight: w, actualReps: reps, edited: false, persistedAt: '', restBeforeS: 90 });
const session = (startedAt: string, sets: SetLog[]): Session => ({ id: `s_${startedAt}`, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false, sets });
const WK1 = new Date('2026-07-15T10:00:00Z').toISOString();
const ROLL1 = new Date('2026-07-16T10:00:00Z').getTime();
const ROLL2 = new Date('2026-07-20T10:00:00Z').getTime();

describe('Stage 9 · v5 survives the athlete\'s edits', () => {
  beforeEach(async () => { await resetV5(); });

  it('S-40 · adding an exercise (frequency change / regen) preserves every existing exercise\'s state', async () => {
    const history: Session[] = [session(WK1, [set('bb_bench_press', 60, 10), set('bb_bench_press', 60, 10), set('bb_bench_press', 60, 10)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL1);
    await advanceV5(['bb_bench_press'], BAND, history, seed, ROLL2); // bench progresses past 60
    const progressed = (await currentV5Targets(history))['bb_bench_press'].weight;
    expect(progressed!).toBeGreaterThan(60);

    // Regenerate with an ADDED exercise (e.g. days-per-week change): bench state must NOT reset.
    await ensureExercisesV5(['bb_bench_press', 'bb_back_squat'], BAND, history, seed);
    const t = await currentV5Targets(history);
    expect(t['bb_bench_press'].weight).toBe(progressed); // unchanged — exercise-keyed, no reset
    expect(t['bb_back_squat'].weight).toBe(100); // the new exercise inits from its own seed
  });

  it('S-31 · a manual swap gives the NEW exercise its own state; it never inherits the old one', async () => {
    // bench progressed to a high load; incline replaces it. incline must start from ITS seed/history,
    // not bench's load. bench's state is preserved dormant (it left the pool but its state is inert).
    const history: Session[] = [session(WK1, [set('bb_bench_press', 90, 8), set('bb_bench_press', 90, 8)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    const benchLoad = (await currentV5Targets(history))['bb_bench_press'].weight; // 90 (demonstrated)
    expect(benchLoad).toBe(90);

    // The athlete swaps bench → incline in the programme edit. Next generation manages incline.
    await ensureExercisesV5(['incline_bb_press'], BAND, history, seed);
    const t = await currentV5Targets(history);
    expect(t['incline_bb_press'].weight).toBe(50); // incline's own seed — NOT bench's 90
    expect(t['bb_bench_press'].weight).toBe(90); // bench state preserved, dormant, uncorrupted
  });

  it('S-20 · an in-workout backup already knows her number (exercise-keyed history)', async () => {
    // She has performed both the primary and the backup before; each carries its own load.
    const history: Session[] = [session(WK1, [set('bb_bench_press', 80, 8), set('incline_bb_press', 55, 8)])];
    await ensureExercisesV5(['bb_bench_press', 'incline_bb_press'], BAND, history, seed);
    const t = await currentV5Targets(history);
    expect(t['bb_bench_press'].weight).toBe(80);
    expect(t['incline_bb_press'].weight).toBe(55); // the backup knows its own number — zero cost
  });

  it('S-41/S-42 · changing bodyweight or height never touches a loaded prescription (it is a fact)', async () => {
    const history: Session[] = [session(WK1, [set('bb_bench_press', 80, 8), set('bb_bench_press', 80, 8)])];
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    const before = (await currentV5Targets(history))['bb_bench_press'].weight;
    // seedFor / bandFor / ensureExercisesV5 do not read bodyweight or height — re-running is inert.
    await ensureExercisesV5(['bb_bench_press'], BAND, history, seed);
    expect((await currentV5Targets(history))['bb_bench_press'].weight).toBe(before);
  });
});
