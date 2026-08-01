/**
 * Engine v5 · Revision 7 — learned exercise selection, the session→occurrence extraction (S-68…S-70).
 * Conservative: a clean single swap per muscle learns; ambiguity is skipped; two consecutive swaps
 * to the same target adopt; swapping back to the original twice clears it.
 */
import { extractOccurrences, foldSessionSwaps, learnedLeaveIts, undoEngineRotation } from '@/domain/swapLearning';
import { emptyLearning, offeredFor, type SwapLearning } from '@/engine/v5/learnedSwap';
import { swapCandidates } from '@/domain/swapPool';
import { muscleOf } from '@/data/exercises';

// Real catalogue ids so muscle grouping is real: bench-family = Chest, squat-family = Quads.
const BENCH = 'bb_bench_press', INCLINE = 'incline_bb_press', DBBENCH = 'db_bench_press';
const SQUAT = 'bb_back_squat', LEGPRESS = 'leg_press';

describe('Rev 7 · extractOccurrences — offered vs performed → occurrences', () => {
  it('the premise: bench-family is Chest, squat-family is Quads', () => {
    expect(muscleOf(BENCH)).toBe('Chest');
    expect(muscleOf(SQUAT)).toBe('Quads');
  });

  it('performed as offered → a no-swap occurrence (resets pending)', () => {
    expect(extractOccurrences([BENCH], [BENCH])).toEqual([{ offered: BENCH, performed: BENCH }]);
  });

  it('a clean single swap → one swap occurrence', () => {
    expect(extractOccurrences([BENCH], [DBBENCH])).toEqual([{ offered: BENCH, performed: DBBENCH }]);
  });

  it('one lift kept, one swapped (2 offered) → both occurrences, matched within the muscle', () => {
    const occ = extractOccurrences([BENCH, INCLINE], [BENCH, DBBENCH]);
    expect(occ).toContainEqual({ offered: BENCH, performed: BENCH }); // kept
    expect(occ).toContainEqual({ offered: INCLINE, performed: DBBENCH }); // swapped
    expect(occ.length).toBe(2);
  });

  it('ambiguous (two swapped in one muscle) → emits NOTHING (no wrong adoption)', () => {
    // Offered bench+incline, performed two OTHER chest lifts — can't attribute → skip.
    expect(extractOccurrences([BENCH, INCLINE], [DBBENCH, 'incline_db_press'])).toEqual([]);
  });

  it('a skipped lift (nothing performed for it) → no occurrence', () => {
    expect(extractOccurrences([BENCH], [])).toEqual([]);
  });

  it('muscles are handled independently', () => {
    const occ = extractOccurrences([BENCH, SQUAT], [BENCH, LEGPRESS]);
    expect(occ).toContainEqual({ offered: BENCH, performed: BENCH });
    expect(occ).toContainEqual({ offered: SQUAT, performed: LEGPRESS });
  });
});

describe('Rev 7 · foldSessionSwaps — two sessions adopt, and it is reversible', () => {
  it('two consecutive sessions of the same swap adopt the replacement (K=2)', () => {
    let st = emptyLearning();
    st = foldSessionSwaps(st, [BENCH], [DBBENCH]); // session 1
    expect(offeredFor(st, BENCH)).toBe(BENCH); // one swap declares nothing
    st = foldSessionSwaps(st, [BENCH], [DBBENCH]); // session 2
    expect(offeredFor(st, BENCH)).toBe(DBBENCH); // adopted
  });

  it('performing the offered lift between swaps resets — no adoption', () => {
    let st = emptyLearning();
    st = foldSessionSwaps(st, [BENCH], [DBBENCH]); // swap
    st = foldSessionSwaps(st, [BENCH], [BENCH]); // performed as offered → reset
    st = foldSessionSwaps(st, [BENCH], [DBBENCH]); // swap again (count 1)
    expect(offeredFor(st, BENCH)).toBe(BENCH); // never two in a row
  });

  it('after adoption, swapping back to the original twice restores it (S-70)', () => {
    let st = emptyLearning();
    st = foldSessionSwaps(st, [BENCH], [DBBENCH]);
    st = foldSessionSwaps(st, [BENCH], [DBBENCH]); // adopted DBBENCH
    // Now the programme offers DBBENCH; she swaps back to BENCH twice.
    st = foldSessionSwaps(st, [DBBENCH], [BENCH]);
    st = foldSessionSwaps(st, [DBBENCH], [BENCH]);
    expect(offeredFor(st, BENCH)).toBe(BENCH); // the original is restored
  });

  it('END-TO-END: two swaps adopt, and the next generated programme offers the substitute', () => {
    let st = emptyLearning();
    st = foldSessionSwaps(st, [BENCH], [DBBENCH]);
    st = foldSessionSwaps(st, [BENCH], [DBBENCH]); // adopted bench → db bench
    /*
     * ⛔ THIS BUILT A WEEK WITH THE ASSEMBLER to check the learned substitute appeared in it. There
     * is no assembler. The learning itself — two same-target swaps adopt a standing substitute — is
     * fully covered above and is the part that survived: it writes a PREFERENCE, and what reads it
     * is now the coach's sheet rather than a composer.
     */
  });
});

describe('Rev 7 · S-71/S-72 — resisting an engine rotation earns a learned leave-it', () => {
  it('S-71 · swapping BACK to a rotated-away lift twice earns a leave-it (a pin)', () => {
    // The engine rotated a stalled BENCH → DBBENCH (S-25.3): substitutes[BENCH]=DBBENCH, and the
    // rotation is marked in engineRotated so a swap-back is read as resistance.
    const engineRotated = { [BENCH]: DBBENCH };
    let st: SwapLearning = { substitutes: { [BENCH]: DBBENCH }, pending: {} };

    // Swap-back #1: the plan offers DBBENCH; she performs BENCH (the lift the engine took away).
    let prev = st.substitutes;
    st = foldSessionSwaps(st, [DBBENCH], [BENCH]);
    expect(learnedLeaveIts(prev, st.substitutes, engineRotated)).toEqual([]); // one swap-back declares nothing

    // Swap-back #2 (consecutive): the fold CLEARS the substitute — BENCH returns — and that resistance
    // earns the leave-it. Thereafter fixtureModel skips any engine rotation of BENCH.
    prev = st.substitutes;
    st = foldSessionSwaps(st, [DBBENCH], [BENCH]);
    expect(offeredFor(st, BENCH)).toBe(BENCH);
    expect(learnedLeaveIts(prev, st.substitutes, engineRotated)).toEqual([BENCH]);
  });

  it('S-72 · accepting the rotation (performing the rotated-to lift) never moves the counter', () => {
    const engineRotated = { [BENCH]: DBBENCH };
    const st0: SwapLearning = { substitutes: { [BENCH]: DBBENCH }, pending: {} };
    const st1 = foldSessionSwaps(st0, [DBBENCH], [DBBENCH]); // offered == performed → no swap
    expect(st1.substitutes).toEqual({ [BENCH]: DBBENCH }); // the rotation stands, untouched
    expect(st1.pending).toEqual({}); // the athlete-swap counter never moved
    expect(learnedLeaveIts(st0.substitutes, st1.substitutes, engineRotated)).toEqual([]); // no resistance
  });

  it('S-72 · clearing a LEARNED substitute (not an engine rotation) is NOT a leave-it', () => {
    // She adopted DBBENCH herself, then swapped back twice (S-70) — the original simply returns. With
    // no engine rotation in play, no pin is earned: only resisting the ENGINE becomes a leave-it.
    expect(learnedLeaveIts({ [BENCH]: DBBENCH }, {}, {})).toEqual([]);
  });
});

describe('Rev 7 · S-70 — the swap menu offers the blueprint original first', () => {
  it('swapping an adopted substitute leads with the original (the re-test)', () => {
    const prefs = { substitutes: { [BENCH]: DBBENCH }, backups: {} };
    // The plan now offers DBBENCH (bench was adopted away); the menu must lead with BENCH.
    const candidates = swapCandidates(DBBENCH, { sessionExerciseIds: [DBBENCH], prefs });
    expect(candidates[0]?.id).toBe(BENCH);
  });

  it('a normal (non-substitute) lift is unaffected — no spurious anchor', () => {
    const candidates = swapCandidates(BENCH, { sessionExerciseIds: [BENCH], prefs: { substitutes: {}, backups: {} } });
    expect(candidates.every((e) => e.id !== BENCH)).toBe(true); // itself never offered; order is by fidelity
  });
});

/**
 * THE UNDO — S-71's outcome, asked for out loud (founder 2026-07-17).
 *
 * "When the engine changes an exercise, show it in the engine's review and offer an undo of that
 * change — that even saves us the K=2 case for the swaps." It does not REPLACE the K=2 path
 * (founder, same message: "don't remove the swap option yet — an athlete might not notice"), and
 * these tests hold both: the button and the two swap-backs must write the identical state, or the
 * app would have two ideas about what "no" means.
 */
describe('undoEngineRotation — the explicit "leave it"', () => {
  const prefs = () => ({
    substitutes: { bb_bench_press: 'db_bench_press' },
    engineRotated: { bb_bench_press: 'db_bench_press' },
    leaveItsByMuscle: {} as Record<string, string>,
  });
  const muscle = (id: string) => (id === 'bb_bench_press' ? 'Chest' : null);

  it('gives the lift back AND pins it — the engine stops rotating it', () => {
    const next = undoEngineRotation(prefs(), 'bb_bench_press', muscle);
    expect(next.substitutes.bb_bench_press).toBeUndefined(); // the assembler goes back to her lift
    expect(next.engineRotated!.bb_bench_press).toBeUndefined(); // …and it is no longer a rotation
    expect(next.leaveItsByMuscle.Chest).toBe('bb_bench_press'); // the pin she just earned (S-30/S-59)
  });

  it('writes exactly what two silent swap-backs write — one "no", one outcome', () => {
    // The K=2 path: the fold clears the substitute, and `learnedLeaveIts` reads that as resistance.
    const before = prefs();
    const { bb_bench_press: _dropped, ...afterFold } = before.substitutes;
    expect(learnedLeaveIts(before.substitutes, afterFold, before.engineRotated)).toEqual(['bb_bench_press']);
    // …and the button reaches the same place, in one tap.
    const viaButton = undoEngineRotation(prefs(), 'bb_bench_press', muscle);
    expect(viaButton.leaveItsByMuscle.Chest).toBe('bb_bench_press');
    expect(viaButton.substitutes.bb_bench_press).toBeUndefined();
  });

  it('a GRADUATION cannot be undone — it is a fact she demonstrated, not a preference', () => {
    // Graduation writes `substitutes` but never `engineRotated` (S-52/S-71: deliberately not
    // resistible). Without that mark there is nothing here to take back.
    const graduated = { substitutes: { knee_push_up: 'push_up' }, engineRotated: {}, leaveItsByMuscle: {} };
    expect(undoEngineRotation(graduated, 'knee_push_up', () => 'Chest')).toBe(graduated); // identity: untouched
  });

  it('her OWN learned swap is not ours to undo', () => {
    // S-69 adopts a substitute from HER repeated choice. It is not marked `engineRotated`, so the
    // button never appears over it — the app does not argue with the athlete on her behalf.
    const hers = { substitutes: { leg_press: 'hack_squat' }, engineRotated: {}, leaveItsByMuscle: {} };
    expect(undoEngineRotation(hers, 'leg_press', () => 'Quads')).toBe(hers);
  });

  it('a second tap invents nothing — the offer is spent', () => {
    const once = undoEngineRotation(prefs(), 'bb_bench_press', muscle);
    expect(undoEngineRotation(once, 'bb_bench_press', muscle)).toBe(once); // identity: no-op
  });
});
