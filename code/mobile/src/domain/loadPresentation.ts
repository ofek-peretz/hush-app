/**
 * Equipment-native load presentation (UX items 5 & 12). The headline IS the engine's prescribed
 * load — the same number the athlete lifts, logs, and that Hush learns. This layer NEVER changes
 * that number; it only explains how to set the equipment up so the athlete never has to calculate.
 *
 * RATIFIED RULE: display value = performed value = logged value = learned value. The engine's
 * `normalizeLoad` already maps every prescription onto a real, loadable rung (the learn-real-loads
 * grid, or the static equipment increment), so there is no display-side rounding here — doing so
 * would re-introduce the very divergence the grid was built to remove.
 *
 * The setup instruction is equipment-native, never a universal "per side": barbell plate math,
 * dumbbell-per-hand, a machine pin, a fixed bar. Plate breakdowns are shown ONLY when the load
 * decomposes EXACTLY onto standard plates; otherwise the per-side weight is shown as a plain number
 * (so we never print a plate stack that doesn't sum to the actual load).
 */
import { loadStyleOf, type LoadStyle } from '@/data/exercises';
import type { Units } from '@/data/local/models';
import { BAR_KG } from '@/engine/loadMath';

/** Bar weight + plate denominations per unit (standard commercial gym). */
const GEAR: Record<Units, { bar: number; plates: number[] }> = {
  // Athletes think in 20s on a kg bar (100 kg → 20 + 20 / side), so the big plate is 20, not 25.
  // The kg bar is the ENGINE's `BAR_KG` — the same number the engine floors a barbell load at. Two
  // copies of the bar's weight is two chances to disagree about what is loadable, and this file is
  // the one that does the athlete's plate maths against it.
  kg: { bar: BAR_KG, plates: [20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Greedy plate decomposition for ONE side (largest plates first). */
export function platesPerSide(perSide: number, units: Units): number[] {
  let remaining = round2(perSide);
  const out: number[] = [];
  for (const p of GEAR[units].plates) {
    while (remaining >= p - 1e-6) {
      out.push(p);
      remaining = round2(remaining - p);
    }
  }
  return out;
}

/** Plates for one side ONLY if they sum EXACTLY to the per-side weight, else null (not loadable on
 *  standard plates — e.g. a learned-grid value like 9.5 kg/side, or a lb-converted weight). */
function exactPlates(perSide: number, units: Units): number[] | null {
  if (perSide <= 0) return [];
  const plates = platesPerSide(perSide, units);
  const sum = round2(plates.reduce((a, p) => a + p, 0));
  return sum === round2(perSide) ? plates : null;
}

export interface LoadSetup {
  style: LoadStyle;
  /** The headline number — identical to the engine's load (no rounding). */
  headline: number;
  /** Per-side weight for the bar/carriage (barbell, plate_loaded). */
  perSide?: number;
  /** Plate stack for one side (largest first) — present ONLY when it sums exactly to `perSide`. */
  plates?: number[];
  /** Bar weight (barbell only). */
  barKg?: number;
  /** Per-hand weight (dumbbell). */
  perHand?: number;
  /** Stack pin weight (selectorized, cable). */
  pin?: number;
  /** Fixed-bar weight (fixed_barbell). */
  fixedBar?: number;
}

/**
 * Derive the load setup for an exercise at its prescribed DISPLAY load (already in the athlete's
 * units). Returns null for bodyweight (the caller keeps its existing "Bodyweight" copy) and for a
 * null load. The headline always equals `displayValue` — this never changes the prescribed load.
 */
export function loadSetup(exerciseId: string | null | undefined, displayValue: number | null, units: Units): LoadSetup | null {
  if (displayValue == null) return null;
  const style = loadStyleOf(exerciseId);
  switch (style) {
    case 'bodyweight':
      return null;
    case 'barbell': {
      const perSide = Math.max(0, round2((displayValue - GEAR[units].bar) / 2));
      const plates = exactPlates(perSide, units);
      return { style, headline: displayValue, perSide, plates: plates ?? undefined, barKg: GEAR[units].bar };
    }
    case 'plate_loaded': {
      const perSide = round2(displayValue / 2);
      const plates = exactPlates(perSide, units);
      return { style, headline: displayValue, perSide, plates: plates ?? undefined };
    }
    case 'dumbbell':
      return { style, headline: displayValue, perHand: displayValue };
    case 'selectorized':
    case 'cable':
      return { style, headline: displayValue, pin: displayValue };
    case 'fixed_barbell':
      return { style, headline: displayValue, fixedBar: displayValue };
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
 * HOW BIG THE HERO CAN BE (founder, build 36 — C.9)
 *
 * The lit figure on the set stage was a fixed 118px, and the stage gives it 333pt of width on a
 * 393pt phone. Measured in the app's own IBM Plex Mono at that size and tracking:
 *
 *     "37" → 130pt   ·   "100" / "7.5" → 196pt   ·   "36.5" → 261pt   ·   "102.5" → 326pt
 *
 * So the figure alone fits, but the `kg` chip (≈45pt) beside it does not once the figure reaches
 * three glyphs — and the per-side annex ("8.25 kg a side", ≈120pt) put every load except a
 * two-digit whole number past the edge. The founder photographed "36.5" with its last digit on the
 * screen edge and "8.25 kg a sid" cut off. It was never a decimal bug: **100 kg overflowed too.**
 *
 * `tabular-nums` is why a decimal costs so much — the point occupies a full digit cell, which is
 * exactly why "7.5" measures the same as "100".
 *
 * Pure and measured here rather than left to `adjustsFontSizeToFit`, which only shrinks against a
 * BOUNDED width — and the hero's row is content-sized, so it would have done nothing at all.
 * ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The stage's lit figure at its full, designed size (v7 2.2). */
export const HERO_FONT_SIZE = 118;

/**
 * The size the lit figure may take for `figure`, so it and its unit always sit inside the stage.
 * Steps rather than a continuous scale: a figure that resized by a few px per rung would breathe
 * differently every session, and the athlete would read the SIZE as meaning something. Two, three
 * and four glyphs keep the full 118 — which is every load from 5 to 99.5 kg, and the reason the
 * common case is untouched. Only five glyphs (102.5, 137.5) step down, and only as far as they must.
 */
export function heroFontSize(figure: string): number {
  const glyphs = figure.length; // tabular-nums: '.' occupies a digit cell, so it counts as one
  if (glyphs <= 4) return HERO_FONT_SIZE;
  if (glyphs === 5) return 96;
  return 80; // 1000+ / 4 decimals — not reachable today, but never clipped either
}

/**
 * ════ THE LINE BOX HOLDS THE WHOLE DIGIT (founder, build 36 — A.6) ════
 *
 * "37 is clipped." It was, and not horizontally — the stage's style carried `fontSize: 118` over
 * `lineHeight: 106`, and RN clips a glyph to its line box (web only spills, which is why every
 * gallery pass missed it). Measured in the browser: the box was 106 px and the glyphs needed 129.
 *
 * The style's own comment stated the rule — "lineHeight must be ≥ fontSize or RN clips the tall
 * mono digit tops" — and the style underneath it broke the rule. The 118 was raised from an
 * earlier size and the leading was left behind. So the leading is no longer a number anyone can
 * forget to update: it is DERIVED, here, from whatever size `heroFontSize` chose, and pinned by
 * `noGlyphIsClipped`, which fails the build on any style in the app whose lineHeight sits under
 * its fontSize.
 *
 * The tracking is derived for the same reason: -5.6 was -.0475em of 118 and would have read as a
 * different design at 96 and at 80.
 */
const HERO_LEADING = 1.1; // 129/118 measured, rounded up to a clean ratio
const HERO_TRACKING = -0.0475; // the design's -5.6 at 118

export function heroType(figure: string): { fontSize: number; lineHeight: number; letterSpacing: number } {
  const fontSize = heroFontSize(figure);
  return {
    fontSize,
    lineHeight: Math.ceil(fontSize * HERO_LEADING),
    letterSpacing: Math.round(fontSize * HERO_TRACKING * 10) / 10,
  };
}
