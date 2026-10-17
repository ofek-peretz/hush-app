/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * LOOP 3 · S-32b — SHE FINISHED EVERYTHING AND NOTHING GOT HEAVIER.
 *
 * ⛔ MUTATION TESTING SCORED `loop3.ts` AT 89.7%, AND ALL FOUR SURVIVORS SIT ON ONE LINE:
 *
 *     if (completedAll && !anyAdvanced) return { sets, decision: 'hold' };
 *
 *     condition → false · `&&` → `||` · `!anyAdvanced` → `anyAdvanced` · body → {}
 *
 * Every one of them survived for the same reason: delete this branch and execution falls through to
 * the "not completed" path, which — for an occurrence with no unfinished streak — also returns her
 * set count unchanged. **The number is identical; only the NAME of the decision differs.** Every
 * existing test asserted the number.
 *
 * ⚠️ THE NAME IS NOT DECORATION. `decision` is what the weekly surface reads to tell her WHY her
 * volume did or did not move, and S-32b is a specific thing worth saying: she did all the work asked
 * of her and nothing got heavier, so volume holds and the stall belongs to Loop 2, not here. Losing
 * it would report "cut" or a bare hold on a week she completed in full — the app misreading effort
 * it had itself recorded.
 *
 * So these assert the WHOLE result, and both halves of the condition from both sides.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { decideVolume, type VolumeInput } from '@/engine/v5/loop3';

/** A muscle mid-range, so neither the floor nor the ceiling can explain any decision below. */
const at = (over: Partial<VolumeInput> = {}): VolumeInput => ({
  sets: 9,
  minSets: 6,
  maxSets: 15,
  completedAll: true,
  anyAdvanced: true,
  unfinishedStreak: 0,
  ...over,
});

describe('⛔ S-32b · completed everything, nothing advanced → HOLD, and it is called that', () => {
  it('holds the set count AND names the decision', () => {
    // The whole result, not just the number — the number is what let four mutants live here.
    expect(decideVolume(at({ completedAll: true, anyAdvanced: false })))
      .toEqual({ sets: 9, decision: 'hold' });
  });

  it('⛔ …and the neighbouring case is NOT a hold — the `&&` is a real conjunction', () => {
    /*
     * `completedAll && !anyAdvanced` mutated to `||` keeps returning 'hold' for the case that must
     * PROGRESS (finished everything, something advanced) — which is the whole of S-32, the rule that
     * earns her a set. Asserting only the flat case can never see that.
     */
    expect(decideVolume(at({ completedAll: true, anyAdvanced: true })))
      .toEqual({ sets: 10, decision: 'progress' });
  });

  it('⛔ …and `!anyAdvanced` flipped would hold the week that earned a set', () => {
    // The same mutant from the other side: with the negation removed, "everything advanced" reads as
    // "nothing advanced" and she is held at nine for ever while her lifts keep getting heavier.
    const advanced = decideVolume(at({ anyAdvanced: true }));
    const flat = decideVolume(at({ anyAdvanced: false }));
    expect({ advanced: advanced.decision, flat: flat.decision })
      .toEqual({ advanced: 'progress', flat: 'hold' });
    expect(advanced.sets).toBeGreaterThan(flat.sets);
  });

  it('⛔ …and an UNFINISHED occurrence is never a hold, whatever advanced', () => {
    /*
     * The fall-through the deleted branch exposed. Without S-32b, a completed-but-flat occurrence
     * lands in the "not completed" path — and it must not, because that path is about work she did
     * NOT do. Pinned from the other direction: the unfinished cases keep their own names.
     */
    expect(decideVolume(at({ completedAll: false, anyAdvanced: false, unfinishedStreak: 2 })))
      .toEqual({ sets: 8, decision: 'cut' });
    // One unfinished occurrence is not yet a cut — S-34 waits for two.
    expect(decideVolume(at({ completedAll: false, anyAdvanced: false, unfinishedStreak: 1 })).decision)
      .not.toBe('cut');
  });

  it('⚠️ the hold is a HOLD, not a capped progression', () => {
    /*
     * `capped` and `hold` both leave the number where it was, and they mean opposite things: capped
     * is *"you earned a set and your hour has no room for it"*, hold is *"nothing was earned"*. A
     * muscle at its ceiling with nothing advancing must read as the second.
     */
    expect(decideVolume(at({ sets: 15, maxSets: 15, anyAdvanced: false })))
      .toEqual({ sets: 15, decision: 'hold' });
    expect(decideVolume(at({ sets: 15, maxSets: 15, anyAdvanced: true })))
      .toEqual({ sets: 15, decision: 'capped' });
  });
});
