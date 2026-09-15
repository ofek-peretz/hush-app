/**
 * One-tap swap (S4, approved 2026-07-06; taxonomy rebuilt 2026-07-12). Hush decides the
 * replacement — the athlete never evaluates a list mid-workout. Two pure pieces:
 *   • the swap LADDER — the athlete's standing substitute, then their backup, then the catalog's
 *     closest substitute by fidelity (domain/swapPool). Always in-muscle, de-duplicated, and never
 *     a lift already in today's session.
 *   • retargetPlanForSwap — the swapped-in exercise carries ITS OWN prescription (a bench 60 kg
 *     never rides onto a machine pin); remaining sets only, logged sets untouched.
 */
// @ts-nocheck

// 

import { swapLadder } from '@/domain/swapPool';
import { retargetPlanForSwap, type Step } from '@/state/stores/sessionStore';
import { exerciseById, muscleOf } from '@/data/exercises';
import type { SetTarget } from '@/data/local/models';

/** The ladder with nothing in the session — the plain catalog answer. */
const ladderOf = (id: string, prefs?: Parameters<typeof swapLadder>[1]['prefs']) =>
  swapLadder(id, { sessionExerciseIds: [], prefs });

describe('the swap ladder', () => {
  it("leads with the athlete's own standing choices, then fidelity", () => {
    const ladder = ladderOf('bb_bench_press', {
      substitutes: { bb_bench_press: 'machine_chest_press' },
      backups: { bb_bench_press: 'push_up' },
    });
    expect(ladder[0]).toBe('machine_chest_press'); // the athlete's standing choice leads
    expect(ladder[1]).toBe('push_up'); // then their equipment-busy backup
    expect(new Set(ladder).size).toBe(ladder.length); // no duplicates
    for (const id of ladder) expect(muscleOf(id)).toBe('Chest'); // never leaves the muscle
    expect(ladder).not.toContain('bb_bench_press'); // never offers itself
  });

  it('without preferences, leads with the CLOSEST substitute on other equipment', () => {
    const ladder = ladderOf('bb_bench_press');
    expect(ladder[0]).toBe('db_bench_press'); // same movement, same demand, off the rack
    expect(exerciseById(ladder[0])!.equipment).not.toBe('barbell'); // the busy station is the motive
  });

  it('ignores a cross-muscle or unknown preference (the capability contract holds)', () => {
    const ladder = ladderOf('bb_bench_press', {
      substitutes: { bb_bench_press: 'lat_pulldown' }, // Back — invalid here
      backups: { bb_bench_press: 'not_a_lift' },
    });
    for (const id of ladder) expect(muscleOf(id)).toBe('Chest');
    expect(ladder).not.toContain('lat_pulldown');
    expect(ladder).not.toContain('not_a_lift');
  });

  it('a preference never resurrects a lift already done today', () => {
    const ladder = swapLadder('bb_bench_press', {
      sessionExerciseIds: ['bb_bench_press', 'db_bench_press'],
      prefs: { substitutes: { bb_bench_press: 'db_bench_press' } },
    });
    expect(ladder).not.toContain('db_bench_press'); // pinned, but already in the workout
    expect(ladder.length).toBeGreaterThan(0);
  });

  it('every catalog exercise yields a non-empty ladder', () => {
    for (const id of ['bb_back_squat', 'leg_curl', 'lateral_raise', 'cable_crunch', 'pull_up', 'hip_abduction']) {
      expect(ladderOf(id).length).toBeGreaterThan(0);
    }
  });
});

describe('retargetPlanForSwap', () => {
  const step = (exerciseId: string, gi: number, si: number, w: number | null): Step => ({
    exerciseId,
    globalIndex: gi,
    exerciseSetIndex: si,
    totalSetsInExercise: 2,
    target: { exerciseId, setIndex: si, recommendedWeight: w, recommendedReps: 8 },
    lastSetOfExercise: si === 1,
    lastSetOfSession: gi === 3,
  });
  const plan: Step[] = [
    step('bb_bench_press', 0, 0, 60),
    step('bb_bench_press', 1, 1, 60),
    step('lateral_raise', 2, 0, 7),
    step('lateral_raise', 3, 1, 7),
  ];
  const targets: SetTarget[] = [
    { exerciseId: 'machine_chest_press', setIndex: 0, recommendedWeight: 35, recommendedReps: 8 },
    { exerciseId: 'machine_chest_press', setIndex: 1, recommendedWeight: 35, recommendedReps: 8 },
  ];

  it('the swapped-in exercise adopts ITS OWN prescription, remaining sets only', () => {
    const out = retargetPlanForSwap(plan, targets, 1, 'machine_chest_press');
    expect(out[0].exerciseId).toBe('bb_bench_press'); // set already behind the athlete
    expect(out[0].target!.recommendedWeight).toBe(60);
    expect(out[1].exerciseId).toBe('machine_chest_press');
    expect(out[1].target!.recommendedWeight).toBe(35); // the machine's own load — never 60
    expect(out[2].exerciseId).toBe('lateral_raise'); // other exercises untouched
  });

  it('falls back to carrying reps at the old target when no prescription is known', () => {
    const out = retargetPlanForSwap(plan, [], 0, 'db_bench_press');
    expect(out[0].exerciseId).toBe('db_bench_press');
    expect(out[0].target!.recommendedWeight).toBe(60); // carry-over (resume edge)
    expect(out[0].target!.exerciseId).toBe('db_bench_press');
  });
});
