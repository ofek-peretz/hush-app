/**
 * Equipment Occupied (V1) — the current exercise moves exactly one position later; no
 * replacement, no structure change. Tests the pure plan transform.
 */
// @ts-nocheck

// 

import { deferCurrentExercise, type Step } from '@/state/stores/sessionStore';
import type { SetTarget } from '@/data/local/models';

function step(exerciseId: string, setIndex: number, total: number, globalIndex: number): Step {
  const target: SetTarget = { exerciseId, setIndex, recommendedWeight: 60, recommendedReps: 5 };
  return {
    exerciseId,
    globalIndex,
    exerciseSetIndex: setIndex,
    totalSetsInExercise: total,
    target,
    lastSetOfExercise: setIndex === total - 1,
    lastSetOfSession: false,
  };
}

// Bench(2 sets), Incline(1), Fly(1) — flattened plan.
function plan(): Step[] {
  return [
    step('bench', 0, 2, 0),
    step('bench', 1, 2, 1),
    step('incline', 0, 1, 2),
    step('fly', 0, 1, 3),
  ];
}

describe('deferCurrentExercise', () => {
  it('moves the current exercise one position later (Bench → after Incline)', () => {
    const out = deferCurrentExercise(plan(), 0); // at Bench set 0
    expect(out.map((s) => s.exerciseId)).toEqual(['incline', 'bench', 'bench', 'fly']);
    // globalIndex re-derived contiguously
    expect(out.map((s) => s.globalIndex)).toEqual([0, 1, 2, 3]);
    // structure preserved: same exercises, same set counts
    expect(out.filter((s) => s.exerciseId === 'bench')).toHaveLength(2);
    // exactly one final step flagged
    expect(out.filter((s) => s.lastSetOfSession)).toHaveLength(1);
    expect(out[out.length - 1].lastSetOfSession).toBe(true);
  });

  it('is a no-op when the current exercise is already last', () => {
    const out = deferCurrentExercise(plan(), 3); // at Fly (last)
    expect(out.map((s) => s.exerciseId)).toEqual(['bench', 'bench', 'incline', 'fly']);
  });

  it('preserves all loads/targets (no replacement)', () => {
    const before = plan();
    const out = deferCurrentExercise(before, 0);
    expect(new Set(out.map((s) => s.target!.recommendedWeight))).toEqual(new Set([60]));
    expect(out.every((s) => s.target!.recommendedReps === 5)).toBe(true);
  });
});
