/**
 * Cross-exercise strength transfer (founder question, 2026-07-16): moving to a NEW lift after the
 * athlete already has data must ADAPT to her proven strength — NOT restart at the beginner cold-start.
 * This is the v4 behaviour the founder valued; it lives in `smartSeed` and is injected into the v5
 * engine as `seedFor` (initExercise → seedFor when a lift has no own history), so a program regen OR an
 * in-session swap onto a same-pattern lift both land here.
 *
 * This is also **S-10** ("the engine rotates in a new exercise — a rotation is nearly free, which is
 * what makes it safe to trust"): the rotation is cheap precisely BECAUSE the arriving lift inherits
 * her proven strength here instead of cold-starting.
 */
import { smartSeed } from '@/data/api/fixtureModel';
import { startingWeight } from '@/domain/startingLoad';
import { exerciseById } from '@/data/exercises';
import type { Session, SetLog } from '@/data/local/models';

const profile = { sex: 'male' as const, weightKg: 80 as const, age: 30 };

const set = (exerciseId: string, w: number, reps: number): SetLog => ({
  exerciseId, setIndex: 0, recommendedWeight: w, recommendedReps: 8,
  actualWeight: w, actualReps: reps, edited: false, persistedAt: '',
});
const session = (sets: SetLog[]): Session =>
  ({ id: 's1', programDayId: 'd', startedAt: '2026-07-10T10:00:00Z', state: 'SAVED', earlyFinish: false, sets });

describe('a new exercise inherits the athlete’s proven strength (same pattern)', () => {
  it('machine chest press 100×8 → barbell bench (never done) seeds in-range, NOT cold-start', () => {
    const history = [session([set('machine_chest_press', 100, 8)])];
    const seeded = smartSeed('bb_bench_press', profile, history)!;
    const cold = startingWeight(exerciseById('bb_bench_press')!, profile)!;

    // It transferred — the seed is FAR above the beginner cold-start, in the neighbourhood of her
    // machine strength (both are `press_flat`), scaled by the two lifts' baseKg ratio.
    expect(seeded).toBeGreaterThan(cold);
    expect(seeded).toBeGreaterThan(80); // same ballpark as her 100 kg machine press, not ~40 cold-start
  });

  it('her OWN history on the lift wins over a pattern transfer', () => {
    const history = [
      session([set('bb_bench_press', 90, 8)]),
      session([set('machine_chest_press', 150, 8)]),
    ];
    // She has benched — that demonstrated load anchors it, not the (higher) machine transfer.
    const seeded = smartSeed('bb_bench_press', profile, history)!;
    expect(seeded).toBeGreaterThanOrEqual(90);
    expect(seeded).toBeLessThan(150);
  });

  it('a genuinely new pattern with no related history falls back to the cold-start seed', () => {
    // No pressing history at all → the conservative starting weight (still real, sex/bw/age-scaled).
    const seeded = smartSeed('bb_bench_press', profile, [])!;
    const cold = startingWeight(exerciseById('bb_bench_press')!, profile)!;
    expect(seeded).toBe(cold);
  });
});
