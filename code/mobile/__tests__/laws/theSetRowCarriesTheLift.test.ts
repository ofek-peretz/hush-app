import { setRow, landingOf } from '@/domain/setRow';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ROW OF FIGURES CARRIES THE WHOLE LIFT — and it may never invent one of them.
 *
 * ⛔ FOUNDER, 2026-08-04: *"during a workout everything has to be maximally clear. There can't be a
 * lot of copy and certainly not small type."*
 *
 * Two things came off the set stage for that: the rep-band graphic (250 px of rule to say "6 to 8")
 * and the ten-point "last time" line at the foot of the screen. This row replaces both — her sets in
 * large figures, last time's directly beneath them, and nothing labelled, because position IS the
 * set number.
 *
 * ── ⚠️ WHAT THESE TESTS ARE GUARDING ────────────────────────────────────────────────────────────
 * A figure on this screen that she did not perform. Every slot is read BY POSITION and every
 * mismatch between today and last time resolves to absence — because a padded, repeated or squeezed
 * ghost is the screen telling her she did a set she never did, at the exact moment she is deciding
 * how hard to push.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('where a set landed', () => {
  it('⚠️ the EDGES of the band are inside it — the row may not disagree with Loop 1 by one rep', () => {
    // Loop 1 corrects on `< lo` and `> hi`. A set at exactly Tlo met the contract.
    expect(landingOf(6, [6, 8])).toBe('in');
    expect(landingOf(8, [6, 8])).toBe('in');
    expect(landingOf(5, [6, 8])).toBe('below');
    expect(landingOf(9, [6, 8])).toBe('above');
  });

  it('⛔ NO band is no verdict — never "landed in"', () => {
    /*
     * A hold, a distance, a bodyweight step with no window. "in" is the quiet cream state, so a
     * missing band defaulting to it would silently claim every one of those sets was exactly right.
     */
    expect(landingOf(8, null)).toBeNull();
    expect(landingOf(8, undefined)).toBeNull();
    expect(landingOf(8, [10, 6])).toBeNull(); // reversed — nonsense, not a window
    expect(landingOf(8, [Number.NaN, 10])).toBeNull();
  });
});

describe('the row she reads', () => {
  const base = { totalSets: 4, currentSetIndex: 2, band: [6, 8] as [number, number] };

  it('two done, two ahead — and the ones ahead are EMPTY, not zero', () => {
    const row = setRow({ ...base, done: [8, 7], lastReps: [8, 8, 7, 6] });
    expect(row.map((s) => s.reps)).toEqual([8, 7, null, null]);
    // A zero would read as a set she did and failed. Absence is the only honest value.
    expect(row[2].reps).toBeNull();
    expect(row[2].landing).toBeNull();
  });

  it('every slot carries its verdict, and the current one is marked', () => {
    const row = setRow({ ...base, done: [9, 5], lastReps: [] });
    expect(row.map((s) => s.landing)).toEqual(['above', 'below', null, null]);
    expect(row.map((s) => s.current)).toEqual([false, false, true, false]);
  });

  it('⚠️ the ghost row is read BY POSITION — set 2 sits under set 2', () => {
    // The whole point of the row: the comparison is in place. Set 2 today (7) under set 2 last time
    // (8) is the sentence "you are a rep down", written in two digits and no words.
    const row = setRow({ ...base, done: [8, 7], lastReps: [8, 8, 7, 6] });
    expect(row.map((s) => s.ghost)).toEqual([8, 8, 7, 6]);
  });
});

describe('⛔ and it never invents a figure', () => {
  it('last time had FEWER sets — the extra slots have no ghost', () => {
    // The coach changes set counts week to week. Padding or repeating the last value would tell her
    // she did a fourth set she never did.
    const row = setRow({ totalSets: 4, currentSetIndex: 0, done: [], band: [6, 8], lastReps: [8, 8] });
    expect(row.map((s) => s.ghost)).toEqual([8, 8, null, null]);
  });

  it('last time had MORE sets — the surplus is dropped, not squeezed in', () => {
    // The row is about TODAY's sets. A fifth ghost with no set of its own has nowhere true to sit.
    const row = setRow({ totalSets: 3, currentSetIndex: 0, done: [], band: [6, 8], lastReps: [8, 8, 7, 6, 6] });
    expect(row).toHaveLength(3);
    expect(row.map((s) => s.ghost)).toEqual([8, 8, 7]);
  });

  it('a lift she has never done has a row and no ghosts at all', () => {
    const row = setRow({ totalSets: 3, currentSetIndex: 0, done: [], band: [6, 8] });
    expect(row).toHaveLength(3);
    expect(row.every((s) => s.ghost === null)).toBe(true);
  });

  it('⚠️ MORE logged than the exercise has slots — the row does not grow', () => {
    /*
     * Reachable: an in-session swap resets the exercise while its logged sets stay on the session,
     * and a resumed workout can carry sets for a lift whose set count the coach has since cut. The
     * row is the exercise's shape, and the surplus simply has no slot.
     */
    const row = setRow({ totalSets: 2, currentSetIndex: 1, done: [8, 7, 6, 6], band: [6, 8] });
    expect(row).toHaveLength(2);
    expect(row.map((s) => s.reps)).toEqual([8, 7]);
  });

  it('a zero-set exercise draws nothing rather than throwing', () => {
    expect(setRow({ totalSets: 0, currentSetIndex: 0, done: [], band: [6, 8] })).toEqual([]);
  });
});
