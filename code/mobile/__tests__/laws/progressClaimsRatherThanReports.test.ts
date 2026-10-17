// @ts-nocheck
// 
import { progressClaim, progressClaimKey } from '@/domain/progressClaim';
import type { QuarterlyProgressEntry } from '@/domain/progressReport';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * PROGRESS CLAIMS. IT DOES NOT REPORT.
 *
 * ⛔ FOUNDER, 2026-08-04: *"I'm not sure how much we even need the Progress screen versus just
 * keeping the logs. Right now it looks like a banal graph with a collection of milestones — and
 * there's one for every single exercise, which nobody is ever going to open."*
 *
 * Every figure on that screen was true and none of them answered *am I getting stronger?* — so it
 * leads with an answer now, and this is the answer.
 *
 * ── ⚠️ WHAT THESE TESTS GUARD ───────────────────────────────────────────────────────────────────
 * A claim that is generous. This product shows what was measured (R7), and the moment a progress
 * screen says something the rows beneath it cannot support, every other figure in the app becomes
 * a thing the athlete has to check. **Each claim is falsifiable by the table under it**, and the
 * weakest of the three is the honest one for an athlete who has not gained yet.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const E = (deltaKg: number, mode: 'load' | 'reps' = 'load'): QuarterlyProgressEntry =>
  ({ exerciseId: `x${deltaKg}${mode}`, initialPeakKg: 40, periodPeakKg: 40 + deltaKg, currentKg: 40 + deltaKg,
     deltaKg, mode, series: [] } as unknown as QuarterlyProgressEntry);

describe('the claim states what is true of the table under it', () => {
  it('every lift risen → the strongest claim, and it names how many', () => {
    expect(progressClaim([E(5), E(2.5), E(10)])).toEqual({ kind: 'all', lifts: 3 });
  });

  it('some risen → the count IS the claim', () => {
    expect(progressClaim([E(5), E(0), E(10), E(0)])).toEqual({ kind: 'some', risen: 2, lifts: 4 });
  });

  it('⛔ none risen → it says so, rather than reaching for a kinder sentence', () => {
    /*
     * The first weeks, a layoff, a deload block. This is the case a progress screen is most tempted
     * to be generous about, and being generous once costs the credibility of every other number in
     * the app.
     */
    expect(progressClaim([E(0), E(0)])).toEqual({ kind: 'none' });
  });

  it('⚠️ a single lift that rose is "all", not "1 of 1"', () => {
    // "1 of 1 lifts is heavier" is a sentence that reads as a hedge about a fact.
    expect(progressClaim([E(7.5)])).toEqual({ kind: 'all', lifts: 1 });
  });

  it('nothing measured at all → no claim, and day one draws its own page', () => {
    expect(progressClaim([])).toBeNull();
  });
});

describe('⚠️ a bodyweight lift counts toward the claim', () => {
  it('a pull-up that gained reps is a lift that got stronger', () => {
    /*
     * The kg TOTAL beside the claim excludes reps-mode entries, and correctly — their gain is not
     * kilograms. But "is it heavier than when I met it" is a question they can answer, and leaving
     * them out would tell an athlete who trains mostly on a bar that nothing has happened.
     */
    expect(progressClaim([E(5, 'reps'), E(2.5)])).toEqual({ kind: 'all', lifts: 2 });
  });

  it('…and a reps lift that has not moved holds the count down like any other', () => {
    expect(progressClaim([E(0, 'reps'), E(2.5)])).toEqual({ kind: 'some', risen: 1, lifts: 2 });
  });
});

describe('the sentence is a key, never assembled', () => {
  it('each claim has its own key', () => {
    // A sentence built out of parts in JSX is a sentence with one language's grammar baked in — the
    // B.6 defect, and the reason every line in this app is one key.
    expect(progressClaimKey({ kind: 'all', lifts: 3 })).toBe('progress.claimAll');
    expect(progressClaimKey({ kind: 'some', risen: 2, lifts: 4 })).toBe('progress.claimSome');
    expect(progressClaimKey({ kind: 'none' })).toBe('progress.claimNone');
  });
});
