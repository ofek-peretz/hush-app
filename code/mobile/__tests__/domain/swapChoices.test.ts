/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THREE OPTIONS — AND NOT ONE OF THEM PADDING.
 *
 * ⛔ FOUNDER, 2026-08-16, approving the three-option swap and setting its bar in the same sentence:
 * *"רק תוודא שאכן החלופות הגיוניות ושזה לא יציע סתם אופציות."*
 *
 * The bar is not decoration. Measured across the 111 generatable lifts, only 62 have three TRUE
 * synonyms (a substitute that trains the same movement pattern); 25 have two, 18 have one, and six
 * have none at all. A menu that always showed three would fill 49 of them with a different movement
 * — and the worst case measured was a cable kickback whose third option was a HIP THRUST.
 *
 * `swapPool`'s own header is the law being kept here: *"a swap is a SYNONYM, not a variation."*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { swapChoices, swapCandidates, SWAP_CHOICES } from '@/domain/swapPool';
import { EXERCISES, exerciseById, isSwapOnly } from '@/data/exercises';

const generatable = EXERCISES.filter((e) => !isSwapOnly(e.id));

describe('⛔ the menu is capped at three and never stretched to three', () => {
  it('never offers more than the cap', () => {
    for (const ex of generatable) {
      expect(swapChoices(ex.id, { sessionExerciseIds: [] }).length).toBeLessThanOrEqual(SWAP_CHOICES);
    }
  });

  it('⛔ never pads with a different MOVEMENT when her own movement has options', () => {
    const padded: string[] = [];
    for (const ex of generatable) {
      const choices = swapChoices(ex.id, { sessionExerciseIds: [] });
      const synonyms = swapCandidates(ex.id, { sessionExerciseIds: [] }).filter((c) => c.pattern === ex.pattern);
      if (synonyms.length === 0) continue; // the six that have none — covered below
      if (choices.some((c) => !c.sameMovement)) padded.push(`${ex.id} → ${choices.filter((c) => !c.sameMovement).map((c) => c.exercise.id).join(',')}`);
    }
    expect(padded).toEqual([]);
  });

  it('⚠️ a lift with NO synonym still gets one honest answer, marked as a different movement', () => {
    // The station is busy and she still needs to train the muscle (S-20). Offering nothing is worse
    // than offering something labelled — but it is exactly ONE, never a menu of near-misses.
    const noSynonym = generatable.filter(
      (ex) => swapCandidates(ex.id, { sessionExerciseIds: [] }).filter((c) => c.pattern === ex.pattern).length === 0,
    );
    expect(noSynonym.length).toBeGreaterThan(0); // the measurement this law is built on
    for (const ex of noSynonym) {
      const choices = swapChoices(ex.id, { sessionExerciseIds: [] });
      expect(choices.length).toBe(1);
      expect(choices[0].sameMovement).toBe(false);
    }
  });

  it('⛔ every offer is the same MUSCLE — the swap never leaves the slot it is standing in', () => {
    for (const ex of generatable) {
      for (const c of swapChoices(ex.id, { sessionExerciseIds: [] })) {
        expect(c.exercise.muscle).toBe(ex.muscle);
      }
    }
  });

  it('⛔ and never a lift she has already done today', () => {
    const ex = exerciseById('bb_bench_press');
    const first = swapChoices(ex.id, { sessionExerciseIds: [] })[0].exercise.id;
    const after = swapChoices(ex.id, { sessionExerciseIds: [ex.id, first] });
    expect(after.map((c) => c.exercise.id)).not.toContain(first);
  });

  it('⚠️ the order is the ranked order — the closest substitute leads', () => {
    for (const ex of generatable.slice(0, 40)) {
      const ranked = swapCandidates(ex.id, { sessionExerciseIds: [] }).map((e) => e.id);
      const offered = swapChoices(ex.id, { sessionExerciseIds: [] }).map((c) => c.exercise.id);
      const positions = offered.map((id) => ranked.indexOf(id));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it('is deterministic — the same lift and session give the same menu (I-24)', () => {
    for (const ex of generatable.slice(0, 30)) {
      expect(swapChoices(ex.id, { sessionExerciseIds: [] })).toEqual(swapChoices(ex.id, { sessionExerciseIds: [] }));
    }
  });
});

describe('⚠️ what she actually sees, for lifts a reader can check by eye', () => {
  const menu = (id: string) => swapChoices(id, { sessionExerciseIds: [] }).map((c) => `${c.exercise.id}${c.sameMovement ? '' : ' (other movement)'}`);

  it('a barbell bench press offers other flat presses', () => {
    for (const id of swapChoices('bb_bench_press', { sessionExerciseIds: [] })) {
      expect(id.exercise.pattern).toBe(exerciseById('bb_bench_press').pattern);
    }
    expect(menu('bb_bench_press').length).toBeGreaterThan(1);
  });

  it('⛔ a cable kickback is NOT offered a hip thrust', () => {
    // The measured worst case: 170 points away, a different pattern and a different tier.
    expect(menu('cable_kickback')).not.toContain('hip_thrust');
    expect(menu('cable_kickback')).not.toContain('hip_thrust (other movement)');
  });
});
