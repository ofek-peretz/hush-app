// @ts-nocheck
// 
import { loadNews, showsPerSide } from '@/domain/loadNews';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LOAD CARRIES ITS OWN NEWS — and says nothing when there is none.
 *
 * ⛔ FOUNDER, 2026-08-04: *"we show how many reps were done, but we are not showing how much weight
 * was lifted last time."*
 *
 * He found the one thing on that screen that could actively mislead her. A row of last time's reps
 * with no load beside it invites exactly the wrong conclusion: **8 reps at 32.5 kg is not better
 * than 7 reps at 34**, and the row alone would have said it was.
 *
 * The fix is a delta on the hero rather than a second number to subtract from — `↑1.5` IS the fact,
 * where "32.5 last time" is a sum she has to do.
 *
 * ── ⚠️ WHAT THIS FILE GUARDS ────────────────────────────────────────────────────────────────────
 * A delta that appears when nothing happened. It sits on the largest figure on the screen, so a
 * spurious "↑0" — or a "↑0.0000001" out of plate maths — is a claim about her training printed at
 * the size of a fist.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('what it compares against', () => {
  it('⛔ on the FIRST set, last time — that is the only comparison available', () => {
    expect(loadNews({ currentLoadKg: 34, lastTimeKg: 32.5 })).toEqual({ direction: 'up', deltaKg: 1.5 });
  });

  it('⛔ mid-lift, THE SET BEFORE — a correction outranks last week', () => {
    /*
     * Loop 1 has just moved the load and she is standing at a bar that needs re-loading. Last week's
     * weight is context; this is an instruction, and context never outranks an instruction on a
     * screen read between sets.
     */
    expect(loadNews({ currentLoadKg: 31.5, previousSetKg: 34, lastTimeKg: 30 }))
      .toEqual({ direction: 'down', deltaKg: 2.5 });
  });

  it('and never both — the previous set wins whenever it exists', () => {
    // Same current load, same history: only the presence of a previous set changes the answer.
    expect(loadNews({ currentLoadKg: 34, previousSetKg: 34, lastTimeKg: 30 })).toBeNull();
    expect(loadNews({ currentLoadKg: 34, lastTimeKg: 30 })).toEqual({ direction: 'up', deltaKg: 4 });
  });
});

describe('⛔ and it is silent far more often than it speaks', () => {
  it('nothing moved → nothing is drawn', () => {
    // The common case, on most sets of most lifts. Not a zero, not a dash — absent.
    expect(loadNews({ currentLoadKg: 34, previousSetKg: 34 })).toBeNull();
    expect(loadNews({ currentLoadKg: 34, lastTimeKg: 34 })).toBeNull();
  });

  it('⚠️ a float hair is not a change', () => {
    /*
     * Loads come out of plate maths and lb⇄kg conversion, so two weights that ARE the same weight
     * differ in the fifteenth decimal. A "↑0" on the hero of the set screen is worse than no delta.
     */
    expect(loadNews({ currentLoadKg: 34.000000000001, previousSetKg: 34 })).toBeNull();
    expect(loadNews({ currentLoadKg: 60 / 3, previousSetKg: 20 })).toBeNull();
  });

  it('a lift she has never done has nothing to compare to', () => {
    expect(loadNews({ currentLoadKg: 34 })).toBeNull();
    expect(loadNews({ currentLoadKg: 34, lastTimeKg: null, previousSetKg: null })).toBeNull();
  });

  it('⚠️ a BODYWEIGHT lift has no load, so it has no news', () => {
    // The hero there is the rep count, and "↑1.5 kg" beside a pull-up is a fabrication.
    expect(loadNews({ currentLoadKg: null, lastTimeKg: 34 })).toBeNull();
  });

  it('and nonsense never becomes a figure', () => {
    expect(loadNews({ currentLoadKg: Number.NaN, lastTimeKg: 30 })).toBeNull();
    expect(loadNews({ currentLoadKg: 34, previousSetKg: Number.NaN, lastTimeKg: 30 }))
      .toEqual({ direction: 'up', deltaKg: 4 }); // falls through to the usable comparison
  });
});

describe('the per-side figure, and when it is worth a line', () => {
  it('⛔ the first set of a lift — she is loading the bar', () => {
    // The founder's own ruling stands: the athlete never calculates. Deleting this puts
    // `(34 − 20) ÷ 2` back in her head at the rack.
    expect(showsPerSide({ setNumber: 1, news: null })).toBe(true);
  });

  it('and not on the sets after it — the bar has not moved', () => {
    expect(showsPerSide({ setNumber: 2, news: null })).toBe(false);
    expect(showsPerSide({ setNumber: 4, news: null })).toBe(false);
  });

  it('⛔ but it RETURNS the moment the load does', () => {
    /*
     * This is the half that makes the rule correct rather than merely tidy. Loop 1 changes the load
     * mid-exercise — the product's signature — and at that moment the bar must be re-loaded and the
     * per-side figure is the most useful line on the screen.
     */
    expect(showsPerSide({ setNumber: 3, news: { direction: 'down', deltaKg: 2.5 } })).toBe(true);
  });
});
