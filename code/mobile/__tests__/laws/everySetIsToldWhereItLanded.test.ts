import { bandPlacement } from '@/screens/session/SessionFlow';
import { up, down, hold } from '@/design/tokens';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY SET IS TOLD WHERE IT LANDED — including, and especially, the ones that landed right.
 *
 * ⛔ FOUNDER, 2026-08-04:
 *
 *   > *"I really did say that if the athlete is inside the range there would be a confirmation of
 *   > landing inside the range; if it falls out at the bottom that's out of the band in blue and the
 *   > weight comes down, and the same for going out at the top, in green."*
 *
 * ── HOW ONLY TWO OF THE THREE GOT BUILT ─────────────────────────────────────────────────────────
 * The band-and-dot lived inside `CorrectionBeat`, and a correction is by definition something Loop 1
 * only produces when the reps LEAVE the band. So the two edges were drawn and the middle could not
 * be — not by oversight in the drawing, but because the only thing that drew it was a decision that
 * never happens when she is right.
 *
 * Then build 36 removed the beat for ordinary sets. That note names its own replacement — *"the one
 * that matters is whether she landed inside or outside her band"* — and I read only the first half
 * of it. The result was an app that shows her the instrument measuring her ONLY when it disagrees.
 *
 * ── WHY THE PLACEMENT IS PURE, AND TESTED HERE ──────────────────────────────────────────────────
 * Because the interesting case is the one the screen cannot produce on demand: reps outside the band
 * with NO correction — the budget spent, the last set, the rail cancelling a raise. Three real
 * states in which the dot must sit outside while the load holds, and no fixture in a live session
 * reaches them.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const at = (reps: number, band?: [number, number]) =>
  bandPlacement({ weight: 34, reps, n: 2, m: 4, ...(band ? { band } : {}) });

describe('the three outcomes, each with its own colour', () => {
  it('⛔ INSIDE the band is a real outcome with a real mark — cream, and the load holds', () => {
    // The one that was missing. `hold.stage` is the law's middle colour (down = blue, hold = cream,
    // raise = moss) and this was the only surface never given it.
    const p = at(9, [8, 10]);
    expect(p?.tone).toBe(hold.stage);
    expect(p?.legend).toBe('landedInside');
  });

  it('below the band is blue, above is moss', () => {
    expect(at(6, [8, 10])?.tone).toBe(down.stage);
    expect(at(6, [8, 10])?.legend).toBe('landedBelow');
    expect(at(13, [8, 10])?.tone).toBe(up.stage);
    expect(at(13, [8, 10])?.legend).toBe('landedAbove');
  });

  it('⚠️ the EDGES of the band are inside it', () => {
    // A set at exactly Tlo met the contract and a set at exactly Thi did too — Loop 1 corrects on
    // `< lo` and `> hi`, and a mark that disagreed with the engine by one rep would be worse than
    // no mark at all.
    expect(at(8, [8, 10])?.legend).toBe('landedInside');
    expect(at(10, [8, 10])?.legend).toBe('landedInside');
  });
});

describe('where the dot sits', () => {
  it('inside, it moves with the reps — the top of the band LOOKS like the top of the band', () => {
    /*
     * This is the only warning she gets that the load is about to be raised: a dot creeping toward
     * the high tick over three sets says what is coming without a word of copy.
     */
    const lo = at(8, [8, 12])!.left;
    const mid = at(10, [8, 12])!.left;
    const hi = at(12, [8, 12])!.left;
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
  });

  it('⚠️ a one-rep band does not divide by zero', () => {
    // `reps === lo === hi` is a legal prescription (a heavy single), and `(reps-lo)/(hi-lo)` is NaN
    // there. A NaN `left` silently drops the dot off the mark, which draws an empty band.
    const p = at(5, [5, 5]);
    expect(Number.isFinite(p!.left)).toBe(true);
  });

  it('outside, the distance is not a measurement, so it does not scale', () => {
    // Twelve reps over is not "twice as far out" as six. Both are simply above the band.
    expect(at(13, [8, 10])?.left).toBe(at(30, [8, 10])?.left);
    expect(at(6, [8, 10])?.left).toBe(at(1, [8, 10])?.left);
  });
});

describe('and it says nothing when it has nothing to say', () => {
  it('a step with no band gets no mark', () => {
    // A plank, a 400 m repeat, a set logged on the wrist and read back — none of them has a rep
    // band, and a mark drawn against a band that does not exist would be an invention.
    expect(at(8)).toBeNull();
  });

  it('⚠️ a nonsense band is absence, not a mark at the wrong end', () => {
    expect(at(9, [10, 8])).toBeNull();
    expect(at(9, [Number.NaN, 10])).toBeNull();
  });
});
