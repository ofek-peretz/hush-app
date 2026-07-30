/**
 * Equipment-native load presentation (UX items 5 & 12). Verifies the headline ALWAYS equals the
 * prescribed load (no display-side rounding), and that each equipment style yields the right setup
 * data. Plate breakdowns appear only when they sum exactly to the load.
 */
import { HERO_FONT_SIZE, heroFontSize, loadSetup, platesPerSide } from '@/domain/loadPresentation';

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
  /** Measured in the browser at the hero's exact typography: IBM Plex Mono Medium, -5.6 tracking. */
  const GLYPH_PT_AT_118 = 65.2;
  /** 393pt phone − stageBody's 30pt each side. */
  const STAGE_WIDTH = 333;
  /** The `kg` chip that always rides beside the figure (26px mono + 10 marginStart). */
  const UNIT_CHIP = 45;

  const widthOf = (figure: string) =>
    figure.length * GLYPH_PT_AT_118 * (heroFontSize(figure) / HERO_FONT_SIZE);

  /** Every load the engine can prescribe, from the smallest rung to well past a real lifter. */
  const FIGURES = ['5', '7.5', '20', '37', '42.5', '100', '102.5', '137.5', '200'];

  it('no prescribable load pushes the figure or its unit off the stage', () => {
    const over = FIGURES.filter((f) => widthOf(f) + UNIT_CHIP > STAGE_WIDTH).map(
      (f) => `${f} → ${Math.round(widthOf(f) + UNIT_CHIP)}pt of ${STAGE_WIDTH}`,
    );
    expect({ figuresOverflowingTheStage: over }).toEqual({ figuresOverflowingTheStage: [] });
  });

  it('leaves the common case at its full designed size — 5 kg to 99.5 kg is untouched', () => {
    for (const f of ['5', '7.5', '20', '37', '42.5']) {
      expect({ figure: f, size: heroFontSize(f) }).toEqual({ figure: f, size: HERO_FONT_SIZE });
    }
  });

  it('a decimal point costs a whole glyph, because the figure is tabular', () => {
    // This is WHY the rule counts characters and not digits: under `fontVariant: tabular-nums` the
    // point occupies a full digit cell, so "7.5" is exactly as wide as "100".
    expect(widthOf('7.5')).toBeCloseTo(widthOf('100'), 5);
  });

  it('steps down only when it must, and never continuously', () => {
    // A figure that resized by a few px per rung would breathe differently every session and the
    // athlete would read the SIZE as meaning something. Four distinct sizes at most.
    expect(new Set(FIGURES.map(heroFontSize)).size).toBeLessThanOrEqual(3);
  });
});
