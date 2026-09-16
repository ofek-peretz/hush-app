/**
 * Equipment-native load presentation (UX items 5 & 12). Verifies the headline ALWAYS equals the
 * prescribed load (no display-side rounding), and that each equipment style yields the right setup
 * data. Plate breakdowns appear only when they sum exactly to the load.
 */
// @ts-nocheck

// 

import fs from 'fs';
import path from 'path';
import { BAND_FONT_SIZE, HERO_FONT_SIZE, bandType, heroFontSize, loadSetup, platesPerSide } from '@/domain/loadPresentation';

describe('barbell load setup', () => {
  it('NEVER changes the prescribed load — the headline equals the engine value', () => {
    // A learned-grid odd value (39) is shown verbatim; it is NOT snapped to 40.
    const s = loadSetup('bb_bench_press', 39, 'kg')!;
    expect(s.style).toBe('barbell');
    expect(s.headline).toBe(39);
    expect(s.barKg).toBe(20);
    expect(s.perSide).toBe(9.5);
    // 9.5/side is not a standard plate stack → no plate breakdown (numeric per-side instead).
    expect(s.plates).toBeUndefined();
  });

  it('shows a plate breakdown when the load decomposes exactly', () => {
    const s = loadSetup('bb_bench_press', 40, 'kg')!;
    expect(s.headline).toBe(40);
    expect(s.perSide).toBe(10);
    expect(s.plates).toEqual([10]);
  });

  it('an empty bar shows the bar with no plates', () => {
    const s = loadSetup('bb_bench_press', 20, 'kg')!;
    expect(s.headline).toBe(20);
    expect(s.perSide).toBe(0);
    expect(s.plates).toEqual([]);
  });

  it('decomposes a side greedily, largest plates first', () => {
    // 100 kg total → 40 / side → 20 + 20 (athletes think in 20s on a kg bar).
    const s = loadSetup('bb_back_squat', 100, 'kg')!;
    expect(s.headline).toBe(100);
    expect(s.perSide).toBe(40);
    expect(s.plates).toEqual([20, 20]);
  });

  it('works in pounds with a 45 lb bar', () => {
    const s = loadSetup('bb_bench_press', 135, 'lb')!;
    expect(s.headline).toBe(135);
    expect(s.barKg).toBe(45);
    expect(s.perSide).toBe(45);
    expect(s.plates).toEqual([45]);
  });
});

describe('plate-loaded machine', () => {
  it('splits the total per side with no bar', () => {
    const s = loadSetup('leg_press', 80, 'kg')!;
    expect(s.style).toBe('plate_loaded');
    expect(s.headline).toBe(80);
    expect(s.perSide).toBe(40);
    expect(s.plates).toEqual([20, 20]);
    expect(s.barKg).toBeUndefined();
  });
});

describe('per-equipment conventions', () => {
  it('dumbbell is per hand, never combined', () => {
    const s = loadSetup('db_bench_press', 20, 'kg')!;
    expect(s.style).toBe('dumbbell');
    expect(s.perHand).toBe(20);
    expect(s.headline).toBe(20);
  });

  it('selectorized machine is a pin', () => {
    const s = loadSetup('machine_chest_press', 24, 'kg')!;
    expect(s.style).toBe('selectorized');
    expect(s.pin).toBe(24);
  });

  it('cable is a pin', () => {
    const s = loadSetup('triceps_pushdown', 28, 'kg')!;
    expect(s.style).toBe('cable');
    expect(s.pin).toBe(28);
  });

  it('bodyweight and null loads return no setup', () => {
    expect(loadSetup('push_up', null, 'kg')).toBeNull();
    expect(loadSetup('pull_up', 0, 'kg')).toBeNull();
    expect(loadSetup('bb_bench_press', null, 'kg')).toBeNull();
  });
});

describe('helpers', () => {
  it('platesPerSide is exported and pure', () => {
    expect(platesPerSide(40, 'kg')).toEqual([20, 20]);
    expect(platesPerSide(0, 'kg')).toEqual([]);
  });
});

/**
 * THE LIT FIGURE FITS THE STAGE (founder, build 36 — C.9).
 *
 * He photographed "36.5" with its last digit on the screen edge and "8.25 kg a sid" cut off. The
 * hero was a fixed 118px and the stage gives it 333pt on a 393pt phone (paddingHorizontal: 30) —
 * measured in the app's own IBM Plex Mono Medium at 118/-5.6, a glyph costs ~65pt:
 *
 *     "37" 130   ·   "100" / "7.5" 196   ·   "36.5" 261   ·   "102.5" 326
 *
 * So it was never a decimal bug — **100 kg overflowed too**, once the `kg` chip was beside it. The
 * numbers below are those real measurements, kept here so the budget cannot drift unnoticed: the
 * glyph cost is what makes the rule true, and it lives nowhere else.
 */
describe('the lit figure fits the stage', () => {
  /**
   * ⛔ RE-MEASURED FOR THE VERTICAL STAGE (2026-08-12). Browser, IBM Plex Mono Medium at 92/-4.4:
   * "137.5" → 261pt over 5 glyphs, "8–10" → 208 over 4. Both give **52.2pt per glyph**.
   */
  const GLYPH_PT_AT_92 = 52.2;
  /** The screen, not the content box — the unit is absolute and may sit in the padding. */
  const PHONE = 390;
  /** The figure is centred on the screen's axis. */
  const AXIS = PHONE / 2;
  /** `KG` beside the figure: 22px mono tracked, + the 10pt it hangs by. */
  const UNIT_CHIP = 37 + 10;
  /** The screen edge is not a place to land on. */
  const EDGE_MARGIN = 8;

  const widthOf = (figure: string) =>
    figure.length * GLYPH_PT_AT_92 * (heroFontSize(figure) / HERO_FONT_SIZE);
  /** Where the unit's right edge lands, which is the thing that went off the screen. */
  const unitRightEdge = (figure: string) => AXIS + widthOf(figure) / 2 + UNIT_CHIP;

  /** Every load the engine can prescribe, from the smallest rung to well past a real lifter. */
  const FIGURES = ['5', '7.5', '20', '37', '42.5', '100', '102.5', '137.5', '200'];

  it('⛔ no prescribable load pushes the figure or its unit off the SCREEN', () => {
    /*
     * The founder photographed `137.5` with `KG` at x=398 on a 390-point phone. The figure held the
     * centre axis exactly and the unit was past the edge — because the centring device of the hour
     * was an empty spacer mirroring the unit, which bought the axis with 144 points of the width the
     * figure needed. **A budget that only counts the figure cannot see that.** It counts the unit's
     * right edge now, which is the thing that actually left the screen.
     */
    const over = FIGURES.filter((f) => unitRightEdge(f) > PHONE - EDGE_MARGIN).map(
      (f) => `${f} → unit ends at ${Math.round(unitRightEdge(f))} of ${PHONE}`,
    );
    expect({ figuresOverflowingTheScreen: over }).toEqual({ figuresOverflowingTheScreen: [] });
  });

  it('leaves every load a barbell can hold at its full designed size — 5 kg to 137.5 kg', () => {
    for (const f of ['5', '7.5', '20', '37', '42.5', '100', '102.5', '137.5']) {
      expect({ figure: f, size: heroFontSize(f) }).toEqual({ figure: f, size: HERO_FONT_SIZE });
    }
  });

  it('a decimal point costs a whole glyph, because the figure is tabular', () => {
    // This is WHY the rule counts characters and not digits: under `fontVariant: tabular-nums` the
    // point occupies a full digit cell, so "7.5" is exactly as wide as "100".
    expect(widthOf('7.5')).toBeCloseTo(widthOf('100'), 5);
  });

  it('⛔ AND THE SCREEN ACTUALLY CALLS IT — the hole that let `137.5` reach him', () => {
    /*
     * ════════════════════════════════════════════════════════════════════════════════════════════
     * THE RULE WAS RIGHT, THE LAWS WERE GREEN, AND THE SCREEN HAD STOPPED ASKING.
     *
     * The 2026-08-12 redesign hardcoded `fontSize: 92` into `rxFigure` and `heroFontSize` survived
     * in this codebase only as a word inside a comment. Every test above kept passing — they test a
     * PURE FUNCTION against its own constants, and a pure function cannot notice that nobody calls
     * it. `noGlyphIsClipped` compared `heroType` to `heroFontSize`: two things that agree with each
     * other whether or not the app agrees with either.
     *
     * ⚠️ SO THIS IS THE ONLY ASSERTION IN THE FILE THAT READS THE SCREEN. It is deliberately crude —
     * it looks for the call — because the failure was not subtle: the wiring was simply cut, and no
     * amount of precision about sizes would have found that.
     * ════════════════════════════════════════════════════════════════════════════════════════════
     */
    const flow = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src/screens/session/SessionFlow.tsx'),
      'utf8',
    );
    /*
     * ⛔ ONE RULE PER FIGURE, NOT ONE RULE FOR BOTH (founder 2026-08-22).
     *
     * This read *"both figures on the stage — the load and the rep band — take their type from the
     * rule"* and asserted `heroType(` twice. It was pinning a SIZE COLLISION as if it were a
     * guarantee: the band was drawn at the load's own size, so the stage had two anchors and no
     * subject. The band has its own tier now (`bandType`).
     *
     * ⚠️ THE PROPERTY THIS TEST EXISTS FOR IS UNCHANGED AND IS THE ONLY REASON IT IS CRUDE: **the
     * screen must CALL a rule, never write a size into a style.** That is what was cut in the
     * 2026-08-12 redesign and survived a week of green laws. So: one call each, and neither style
     * may hardcode a size the rule does not own.
     */
    /*
     * ⛔ REWRITTEN AGAIN FOR THE ATHLETE-AS-HERO PASS (founder, 2026-08-31), and the rewrite is the
     * interesting part.
     *
     * The 2026-08-26 cut left the stage with NO static figure at all — both facts were the engraved
     * dial, whose numerals are sized inside the instrument (`NUM_SIZE`, guarded by
     * `everyWheelIsTheSameWheel`). This probe then read: *"what can regress is someone
     * reintroducing a hand-set poster figure beside the dials"*, and asserted the old styles stayed
     * deleted.
     *
     * ⚠️ AND THEN THE FOUNDER REINTRODUCED EXACTLY THAT, ON PURPOSE — the athlete took the stage,
     * the two dials moved into her slot, and their numbers stayed as a prescription row. Which
     * forces the question this file has to answer honestly: was the assertion protecting the
     * PROPERTY, or protecting the 2026-08-26 composition?
     *
     * The property. It has never been "no static figure"; it is **the screen must CALL a rule,
     * never write a size into a style** — the absence of which let a hardcoded 118 over a 106 line
     * box clip "37" for a week while every other test in this file stayed green. So the probe now
     * requires the call and forbids the literal, which holds against ANY composition:
     *
     *   · the prescription figures are sized by `rxType` (the third tier), once each;
     *   · and `rxFigure`, the style they wear, carries no `fontSize` of its own.
     *
     * ⚠️ `heroType`/`bandType` STAY AT ZERO. Those two tiers were built for a 338-point full-width
     * poster and are unreachable from a 169-point cell; a call to either from this screen would be
     * the old composition creeping back in under the new one.
     *
     * ⚠️ AND THE `<WheelPicker` CLAUSE IS GONE, which is the third composition this probe has
     * outlived in nine days. It required two dials on the stage; the founder replaced them with a
     * number pad (*"בהקלדה"*) because on this screen she is REPORTING a result rather than choosing
     * one from a ladder. Asserting the instrument was asserting the furniture. What the figures are
     * SIZED by is the thing that has never changed and is what stays under test.
     */
    expect((flow.match(/rxType\(/g) ?? []).length).toBe(2);
    expect(flow).toMatch(/rxFigure: \{[^}]*\}/);
    expect(flow.match(/rxFigure: \{[^}]*\}/)![0]).not.toContain('fontSize');
    expect(flow).not.toContain('rxBandFigure: {');
    expect(flow.match(/heroType\(/g) ?? []).toHaveLength(0);
    expect(flow.match(/bandType\(/g) ?? []).toHaveLength(0);
  });

  it('steps down only when it must, and never continuously', () => {
    // A figure that resized by a few px per rung would breathe differently every session and the
    // athlete would read the SIZE as meaning something. Four distinct sizes at most.
    expect(new Set(FIGURES.map(heroFontSize)).size).toBeLessThanOrEqual(3);
  });
});
