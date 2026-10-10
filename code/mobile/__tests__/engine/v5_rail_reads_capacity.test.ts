/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L11 · THE RAIL READS WHAT SHE DEMONSTRATED, NOT THE NUMBER THAT WAS ON THE BAR.
 *
 * The rail is the one hard ceiling on a raise: never more than one rung above the heaviest load she
 * has completed at `Tlo`. It was reading `s.load` raw — so a set of **20 reps at 40 kg** counted as
 * a 40 kg athlete, when it is a demonstration that she can do EIGHT reps at about 52.5 kg by the
 * same e1RM model the app already shows her.
 *
 * ── WHAT IT COST, MEASURED (2026-08-16) ─────────────────────────────────────────────────────────
 * `applyRail` is the LAST thing S-22's raise passes through, so wherever the rail was low it was the
 * binding constraint and `rungsForHeadroom` — the whole machinery that sizes a move to her own
 * measured headroom — was dead code. One occurrence at 60 kg, four sets, her real per-set decay:
 *
 *     set 1     the move the engine SIZED      old rail      this rail
 *      11 reps        1 rung                     62.5           62.5
 *      12 reps        1 rung                     62.5           62.5
 *      13 reps        1 rung                     62.5           62.5
 *      15 reps        3 rungs                    62.5           67.5
 *      18 reps        5 rungs                    62.5           72.5
 *
 * ⚠️ THE 11-REP ROW READS 60 SINCE 2026-09-10 and the table is left as it was measured. F-21 asks
 * the WORST set for two reps of headroom before any raise, and 11 on set 1 decays to 9 by set 4 —
 * one rep. The rail is not what holds it there; the raise is never sized at all. Every other row is
 * unchanged, which is the point: this file measures the CEILING, and the ceiling did not move.
 *
 * Every large move was flattened to one rung. The engine measured her, decided she had earned five
 * rungs, and then handed her one — with nothing in the change log to say a ceiling had done it.
 *
 * ⚠️ AND IT IS A NO-OP WHERE THE OLD RAIL WAS RIGHT — the first three rows. For a set performed AT
 * `Tlo` the conversion is the identity (`loadForReps(epley(L, Tlo), Tlo) === L`), so a lift she is
 * meeting on contract has exactly the ceiling it always had. It moves only for sets she BEAT the
 * contract on, which is the one case the raw reading could not see.
 *
 * ⚠️ L11's PURPOSE SURVIVES INTACT — see the note on `railRecord` for the three guards that still
 * stand between an implausible rep count and a load (F-16, settled-history-only, and the move being
 * sized by the occurrence's WORST set).
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { decideExercise } from '@/engine/v5/loop2';
import { bandFor } from '@/engine/v5/repBand';
import { epley, loadForReps } from '@/engine/loadMath';

const BAND = bandFor('8-10');
const meta = { equipment: 'barbell', bodyweight: false, observedLoads: undefined };

/** An occurrence at one load, carrying her real per-set decay (~0.8 reps per set). */
const occ = (load: number, first: number, n = 4) => ({
  load,
  sets: Array.from({ length: n }, (_, i) => ({ load, reps: Math.round(first - 0.8 * i), restBeforeS: 90 })),
});

/** Four settled occurrences at this shape, then one more — what does Loop 2 prescribe next? */
function nextLoad(first: number): number {
  const history = [occ(60, first), occ(60, first), occ(57.5, first), occ(55, first)];
  const r = decideExercise({ state: { load: 60, band: BAND, sets: 4, history }, session: occ(60, first).sets, meta });
  return r.load as number;
}

describe('a raise the engine sized is a raise she gets', () => {
  it('⛔ a big overshoot moves more than one rung', () => {
    expect(nextLoad(15)).toBeGreaterThan(62.5);
    expect(nextLoad(18)).toBeGreaterThan(nextLoad(15));
  });

  it('⚠️ …and an ORDINARY clear still moves exactly one — nothing was loosened', () => {
    // The common case. Set 1 at 12 leaves the WORST of four decaying sets at 10 — two reps over an
    // 8-floor, which is what F-21 has asked for since 2026-09-10. At 11 the worst set lands on 9
    // and the lift correctly HOLDS instead: that hold is the whole of the rule, and it is the one
    // change this fixture records.
    expect(nextLoad(11)).toBe(60);
    expect(nextLoad(12)).toBe(62.5);
    expect(nextLoad(13)).toBe(62.5);
  });

  it('⛔ the raise is still BOUNDED — it never runs to whatever the reps imply', () => {
    // 18 reps on set 1 implies far more than 72.5 kg; the rail still stops it one rung past what she
    // has settled at. A ceiling that moved is not a ceiling that is gone.
    const implied = loadForReps(epley(60, 18), BAND.lo);
    expect(nextLoad(18)).toBeLessThan(implied);
  });
});

describe('the conversion itself', () => {
  it('is the IDENTITY for a set performed at Tlo — which is why the ordinary case is untouched', () => {
    expect(loadForReps(epley(60, BAND.lo), BAND.lo)).toBeCloseTo(60, 9);
  });

  it('⚠️ F-16 caps what a rep count may claim — a mis-key is priced at the end of the continuum', () => {
    // 20 reps and 60 reps must read the same, or one fat-finger moves the ceiling by half her load.
    const history20 = [occ(60, 20, 1), occ(60, 20, 1)];
    const history60 = [occ(60, 60, 1), occ(60, 60, 1)];
    const at = (h) => decideExercise({ state: { load: 60, band: BAND, sets: 1, history: h }, session: occ(60, 20, 1).sets, meta }).load;
    expect(at(history60)).toBe(at(history20));
  });
});
