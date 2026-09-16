/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * STRENGTH TRANSFERS BETWEEN LIFTS. IT DOES NOT TRANSFER BETWEEN MUSCLES.
 *
 * `smartSeed` exists so an athlete who has trained does not restart from a beginner's number when a
 * lift changes under her (founder 2026-07-09, B-1/S-9): *"a year-trained bencher moving to the
 * chest-press machine must not begin at ~half their real pushing load."* It carries her proven
 * e1RM across, scaled by the two lifts' `baseKg` ratio.
 *
 * ⛔ IT CARRIED IT ACROSS MUSCLES TOO, AND THE NUMBERS WERE DANGEROUS. The donor search matched on
 * `enginePattern`, which has SIX buckets keyed off the display `capability` — and the catalogue
 * files the small muscles under the big lift's capability. `bb_curl` is `horizontal_pull`, the same
 * bucket as `bb_row`. `triceps_pushdown` is `horizontal_push`, the same bucket as `bb_bench_press`.
 * Measured on a male 80 kg athlete with no history on the recipient lift:
 *
 *     bb_row 100 kg × 8         →  bb_curl             cold 20 kg,  seeded  50 kg
 *     bb_bench_press 100 kg × 8 →  triceps_pushdown    cold 20 kg,  seeded  50 kg
 *     bb_overhead_press 60 × 8  →  lateral_raise       cold  7 kg,  seeded  16 kg
 *
 * A 50 kg barbell curl for someone who rows 100 kg is an elbow injury, and a 16 kg lateral raise is
 * a shoulder. Reachable by the ordinary path: she trains rows for a month, the engine rotates her
 * (S-25.2) or she swaps (S-69) onto a curl, the lift has no history of its own, and this fills it.
 *
 * ⚠️ LOOP 1 IS NOT THE ANSWER HERE. It corrects from set 1, but she has to perform set 1 first, and
 * S-49's "her own eyes are the guard" is not a guard against a number that looks deliberate — the
 * whole product promise is that the number is trustworthy.
 *
 * The guard is two equalities, both the narrowest that work: the donor must share the MUSCLE, and
 * the TIER. Every transfer the feature was built for is compound→compound within one muscle and is
 * untouched — this file pins both halves so neither can be relaxed without a failing test.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { smartSeed } from '@/data/api/fixtureModel';
import { exerciseById } from '@/data/exercises';
import type { Session } from '@/data/local/models';

const male = { sex: 'male', weightKg: 80 } as const;

/** A history in which she demonstrated `w × reps` on one lift, and nothing else. */
const did = (exerciseId: string, w: number, reps: number): Session[] => [{
  id: 's', programDayId: 'd', startedAt: '2026-08-01T10:00:00.000Z', state: 'SAVED', earlyFinish: false,
  sets: [0, 1, 2].map((i) => ({
    exerciseId, setIndex: i, recommendedWeight: w, recommendedReps: reps,
    actualWeight: w, actualReps: reps, edited: false, persistedAt: '2026-08-01T10:00:00.000Z', restBeforeS: 90,
  })),
}] as unknown as Session[];

const cold = (id: string) => smartSeed(id, male, [], 8);
const seeded = (id: string, donor: string, w: number, reps: number) => smartSeed(id, male, did(donor, w, reps), 8);

describe('⛔ a donor from another muscle does not price a lift', () => {
  it('a heavy ROW does not load her biceps curl', () => {
    expect(exerciseById('bb_row')!.muscle).toBe('Back');
    expect(exerciseById('bb_curl')!.muscle).toBe('Biceps');
    expect(seeded('bb_curl', 'bb_row', 100, 8)).toBe(cold('bb_curl'));
  });

  it('a heavy BENCH does not load her triceps pushdown', () => {
    expect(seeded('triceps_pushdown', 'bb_bench_press', 100, 8)).toBe(cold('triceps_pushdown'));
  });
});

describe('⛔ nor does a compound price an isolation on the SAME muscle', () => {
  it('a heavy OVERHEAD PRESS does not load her lateral raise', () => {
    // Both are Shoulders and both are `vertical_push`; only the tier tells them apart, and the
    // leverage difference between them is the whole reason the number was 16 kg.
    expect(exerciseById('bb_overhead_press')!.muscle).toBe(exerciseById('lateral_raise')!.muscle);
    expect(exerciseById('bb_overhead_press')!.tier).not.toBe(exerciseById('lateral_raise')!.tier);
    expect(seeded('lateral_raise', 'bb_overhead_press', 60, 8)).toBe(cold('lateral_raise'));
  });
});

describe('⚠️ and the transfer the feature exists for still happens', () => {
  it('a squat carries onto the leg press — same muscle, same tier', () => {
    const s = seeded('leg_press', 'bb_back_squat', 140, 8);
    expect(s).toBeGreaterThan(cold('leg_press'));
    expect(s).toBeGreaterThan(200); // her real pushing strength, not a beginner's 85 kg
  });

  it("the founder's own example — a bencher meeting the chest-press machine", () => {
    const s = seeded('machine_chest_press', 'bb_bench_press', 100, 8);
    expect(s).toBeGreaterThan(cold('machine_chest_press'));
  });

  it('…and her OWN history on a lift always outranks any transfer', () => {
    // She has done the curl herself, badly. That fact wins over anything inferred.
    expect(seeded('bb_curl', 'bb_curl', 25, 8)).toBeGreaterThan(cold('bb_curl'));
  });
});
