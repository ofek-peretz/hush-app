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

  it('⛔ never pads with a different MOVEMENT — except the ONE both-rooms fill, same stem only', () => {
    /*
     * Amended 2026-08-25 (founder gym finding #7): a dumbbell-row menu of three FREE-iron rows
     * could not answer "I don't want free weights today" — the machine row he actually performed
     * never appeared. The both-rooms rule now lets AT MOST ONE different-`pattern` row into a menu
     * that would otherwise sit entirely in one room (free iron vs stations) — and only when it
     * shares the movement STEM (`row` ↔ `row_supported`, `squat` ↔ `squat_supported`): a fly still
     * never yields its seat to a press. Everything else about the old law holds, and this test now
     * asserts the amended law rather than merely tolerating it.
     */
    const stem = (p: string) => p.replace(/_(supported|shortened|lengthened)$/, '');
    const isStation = (e: { equipment: string }) => e.equipment === 'machine' || e.equipment === 'cable';
    const violations: string[] = [];
    for (const ex of generatable) {
      const choices = swapChoices(ex.id, { sessionExerciseIds: [] });
      const synonyms = swapCandidates(ex.id, { sessionExerciseIds: [] }).filter((c) => c.pattern === ex.pattern);
      if (synonyms.length === 0) continue; // the six that have none — covered below
      const crossPattern = choices.filter((c) => !c.sameMovement);
      for (const c of crossPattern) {
        const sameStem = stem(c.exercise.pattern) === stem(ex.pattern);
        // "the other room" is judged against the REST OF THE MENU, not the current lift: a Smith
        // row is itself a station, but its synonym menu is all free iron — the fill is the menu's
        // missing room, which is exactly what the rule promises.
        const others = choices.filter((x) => x.exercise.id !== c.exercise.id);
        const otherRoom = others.length > 0 && others.every((x) => isStation(x.exercise) !== isStation(c.exercise));
        if (!(sameStem && otherRoom)) violations.push(`${ex.id} → ${c.exercise.id}`);
      }
      if (crossPattern.length > 1) violations.push(`${ex.id}: ${crossPattern.length} cross-pattern rows`);
    }
    expect(violations).toEqual([]);
  });

  it('the both-rooms fill exists: a free-iron row offers its machine, and a sled offers its bar', () => {
    // The finding itself: the dumbbell row's menu now spans both rooms…
    const dbRow = swapChoices('db_row', { sessionExerciseIds: [] });
    expect(dbRow.some((c) => c.exercise.equipment === 'machine' || c.exercise.equipment === 'cable')).toBe(true);
    // …and symmetrically, an all-station menu earns one free-iron stem-mate.
    const legPress = swapChoices('leg_press', { sessionExerciseIds: [] });
    expect(legPress.some((c) => c.exercise.equipment !== 'machine' && c.exercise.equipment !== 'cable')).toBe(true);
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
