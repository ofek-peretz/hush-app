/**
 * The WATCH's swap options — the surface the founder's bug actually shipped on.
 *
 * The phone's in-workout swap excluded the lifts already in the session. The watch's did not: it
 * called a different pool, with no exclusion at all. So an athlete who had squatted, reached the
 * leg press, and pressed Swap ON THE WRIST was offered a Barbell Back Squat — the lift they had
 * just finished. It had no test, which is why it survived.
 *
 * Both surfaces now ask the same function (domain/swapPool). This pins the watch's half of that.
 */
// @ts-nocheck

// 

import { buildMirrorSteps, type Step } from '@/state/stores/sessionStore';
import { exerciseById } from '@/data/exercises';

/** A minimal two-set run of one exercise. */
const run = (exerciseId: string, from: number): Step[] =>
  [0, 1].map((si) => ({
    exerciseId,
    globalIndex: from + si,
    exerciseSetIndex: si,
    totalSetsInExercise: 2,
    target: { exerciseId, setIndex: si, recommendedWeight: 60, recommendedReps: 8 },
    lastSetOfExercise: si === 1,
    lastSetOfSession: false,
  }));

/** A real leg session: back squat, then leg press, then an RDL. */
const plan: Step[] = [...run('bb_back_squat', 0), ...run('leg_press', 2), ...run('bb_rdl', 4)];

/** The swap options the watch is handed for a given exercise (attached to its FIRST set). */
const optionsFor = (exerciseId: string): string[] => {
  const step = buildMirrorSteps(plan).find(
    (s) => s.exerciseName === exerciseById(exerciseId)!.name && s.setIndexInExercise === 0,
  )!;
  return (step.swapOptions ?? []).map((o) => o.name);
};

describe('the watch never offers a lift already in the session', () => {
  it('does NOT offer the Back Squat at the leg press — the founder’s bug, on the wrist', () => {
    expect(optionsFor('leg_press')).not.toContain('Barbell Back Squat');
  });

  it('offers the nearest SUBSTITUTE instead — the same law the phone follows', () => {
    expect(optionsFor('leg_press')[0]).toBe('Hack Squat');
  });

  it('excludes every other lift in the session, not just the current one', () => {
    const inSession = ['Barbell Back Squat', 'Leg Press', 'Romanian Deadlift'];
    for (const step of buildMirrorSteps(plan)) {
      for (const opt of step.swapOptions ?? []) expect(inSession).not.toContain(opt.name);
    }
  });

  it('attaches options on EVERY set (2026-09-07 — the board): a machine taken mid-lift is the ordinary case', () => {
    const steps = buildMirrorSteps(plan);
    const first = steps.find((s) => s.setIndexInExercise === 0)!;
    const later = steps.find((s) => s.setIndexInExercise > 0 && s.exerciseName === first.exerciseName)!;
    expect(later.swapOptions ?? []).toEqual(first.swapOptions ?? []);
  });

  it('hands the wrist a short list — a watch is not a catalog', () => {
    for (const step of buildMirrorSteps(plan)) {
      expect((step.swapOptions ?? []).length).toBeLessThanOrEqual(2);
    }
  });
});
