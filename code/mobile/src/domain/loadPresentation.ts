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

// 

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
  /** The bell's own weight (kettlebell) — one cast object, never per side or per hand. */
  bell?: number;
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
    case 'kettlebell':
      // One cast bell. The figure IS the bell — nothing is per side and nothing is per hand, even
      // when both hands are on it (a goblet squat) or one is (a single-arm row).
      return { style, headline: displayValue, bell: displayValue };
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ RE-MEASURED FOR THE VERTICAL STAGE (founder's screenshot of `137.5`, 2026-08-12)
 *
 * He photographed the widest-load state and it was broken in three places at once. The one that
 * matters here: **the screen had stopped calling this function at all.** The 2026-08-12 redesign
 * hardcoded `fontSize: 92` into `rxFigure`, and `heroFontSize` survived only as a word in a comment.
 *
 * ⚠️ AND EVERY LAW STAYED GREEN, which is the part worth keeping. `loadPresentation.test.ts` tests
 * the FUNCTION against its own constants, and a pure function cannot notice that nobody calls it.
 * `noGlyphIsClipped` compared `heroType` to `heroFontSize` — two things that agree with each other
 * whether or not the app agrees with either. The hole is closed by a law that reads the screen, in
 * `theLitFigureFitsTheStage`.
 *
 * ── THE NEW BUDGET, MEASURED IN THE BROWSER ─────────────────────────────────────────────────────
 * A 390pt phone. The figure is centred on the screen's axis (195) and the unit is ABSOLUTE, hanging
 * off its right edge — so the unit no longer costs the figure any width, which is what the old
 * mirrored spacer did. Measured at 92px/-4.4: **52.2pt per glyph** ("137.5" → 261, "8–10" → 208).
 *
 *     195 + w/2 + GAP(10) + UNIT("KG" ≈ 37) ≤ 390 − 8   →   w ≤ 280   →   5.36 glyphs
 *
 * So five glyphs — every load a barbell can hold, 137.5 included — keep the full 92.
 * ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The stage's lit figure at its full, designed size (the vertical stage, 2026-08-12). */
export const HERO_FONT_SIZE = 92;

/**
 * The size the lit figure may take for `figure`, so it and its unit always sit inside the stage.
 * Steps rather than a continuous scale: a figure that resized by a few px per rung would breathe
 * differently every session, and the athlete would read the SIZE as meaning something. Up to five
 * glyphs keep the full 92 — every load from 5 to 137.5 kg, which is the reason the common case and
 * the heaviest real case are both untouched. Only six step down, and only as far as they must.
 */
export function heroFontSize(figure: string): number {
  const glyphs = figure.length; // tabular-nums: '.' occupies a digit cell, so it counts as one
  if (glyphs <= 5) return HERO_FONT_SIZE;
  if (glyphs === 6) return 80;
  return 68; // 1000+ / 4 decimals — not reachable today, but never clipped either
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SECOND TIER — THE REP BAND, AND WHY IT IS NOT THE HERO
 *
 * ⛔ FOUNDER, 2026-08-22, on the live set screen: *"זה המסך היחיד שאני רוצה כמה שפחות שיהיה מלא
 * בדברים ומקסימום מה שהמתאמן צריך לראות בזמן אמת."*
 *
 * The load and the band were both drawn at `HERO_FONT_SIZE`, from this same function — a decision
 * this file's own law recorded approvingly (*"both figures on the stage take their type from the
 * rule"*). One rule was right. One SIZE was not.
 *
 * ── THEY ARE NOT THE SAME KIND OF FACT, AND THE ORDER IS PHYSICAL ───────────────────────────────
 *   · the LOAD is what she must do to the equipment **before the set** — she walks to the bar and
 *     puts this number on it;
 *   · the BAND is what she checks **during** it, to know when to stop.
 *
 * Sequential, not equal. Two figures of identical weight give the eye two anchors and no subject,
 * and the negative space between two equals reads as a VOID rather than as air around a thing —
 * which is the whole of why the stage reads empty in a photograph while every measured gap on it is
 * the size the founder last approved.
 *
 * ⚠️ SO THE HIERARCHY IS THE SPACING FIX. Nothing was added and nothing moved; the second figure
 * dropped a tier, and the room around the first one became room instead of absence.
 *
 * ⚠️ AND IT IS STILL ENORMOUS. 62 is three and a half times the type floor and legible at four
 * metres — this is a demotion relative to the load, never a small number in a gym.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The rep band's figure at its designed size — one tier under the load. */
export const BAND_FONT_SIZE = 62;

/**
 * The size the rep band may take. A band is `8–10` or `12–15` — four or five glyphs, always — so it
 * never reaches the width the load has to budget for. The step-down is kept anyway, derived from the
 * same measured glyph width, so a band nobody has thought of yet cannot be the thing that clips.
 */
export function bandFontSize(figure: string): number {
  return figure.length <= 6 ? BAND_FONT_SIZE : Math.round(BAND_FONT_SIZE * 0.8);
}

/**
 * The band's type, from the SAME leading and tracking ratios as the hero — so the two figures read
 * as one typeface at two sizes rather than as two designs. One rule per figure; no size is ever
 * written into a style on the screen (which is the property `loadPresentation.test` protects, and
 * the reason the 2026-08-12 hardcode went unnoticed for a week).
 */
export function bandType(figure: string): { fontSize: number; lineHeight: number; letterSpacing: number } {
  const fontSize = bandFontSize(figure);
  return {
    fontSize,
    lineHeight: Math.ceil(fontSize * HERO_LEADING),
    letterSpacing: Math.round(fontSize * HERO_TRACKING * 10) / 10,
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE THIRD TIER — THE PRESCRIPTION ROW (founder, 2026-08-31)
 *
 * ⛔ THE STAGE HAS A STATIC FIGURE AGAIN, AND THIS FILE'S LAW IS THE REASON IT IS SAFE.
 *
 * The 2026-08-26 redesign replaced both poster figures with the engraved dials, and the law under
 * this file inverted to say so: *"the stage draws NO poster figure any more… what can regress is
 * someone reintroducing a hand-set poster figure beside the dials."* That is exactly what the
 * athlete-as-hero pass did — the founder's ruling that the load is not the hero once it is on the
 * bar — so the two dials moved off the stage and their two numbers stayed, at gym size, side by
 * side, each one tap from its own wheel.
 *
 * The GUARD, though, is not about posters. It is: **the screen must call a rule, never write a size
 * into a style** — the property whose absence let a hardcoded size clip "37" for a week. So the new
 * figures get the third rule rather than a literal, and the law is rewritten to require the call.
 *
 * ── WHY 46 AND WHY IT STEPS SOONER THAN THE OTHERS ──────────────────────────────────────────────
 * The hero owned the full 338-point stage and could hold five glyphs at 92. These two share it:
 * each cell is 169 points, and the weight's cell also carries its `↑1.5` delta (about 47 points at
 * 17). So the budget for the figure itself is ~122 points, and IBM Plex Mono advances 0.6 em:
 *
 *     3 glyphs (`34`, `8`)      82  ✔ at 46        5 glyphs (`137.5`)  138 ✘ at 46, 120 ✔ at 40
 *     4 glyphs (`82.5`)        110  ✔ at 46        6+                       ✘ — steps to 34
 *
 * ⚠️ AND THE LEADING AND TRACKING ARE THE HERO'S OWN RATIOS, so all three tiers read as one typeface
 * at three sizes rather than as three designs — and `noGlyphIsClipped` holds here for free, because
 * the line box is derived from whatever size was chosen rather than typed beside it.
 */
export const RX_FONT_SIZE = 46;

export function rxFontSize(figure: string): number {
  const glyphs = figure.length; // tabular-nums: '.' occupies a digit cell, so it counts as one
  if (glyphs <= 4) return RX_FONT_SIZE;
  if (glyphs === 5) return 40;
  return 34;
}

export function rxType(figure: string): { fontSize: number; lineHeight: number; letterSpacing: number } {
  const fontSize = rxFontSize(figure);
  return {
    fontSize,
    lineHeight: Math.ceil(fontSize * HERO_LEADING),
    letterSpacing: Math.round(fontSize * HERO_TRACKING * 10) / 10,
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE NUMBER SHE ACTUALLY PUTS ON THE EQUIPMENT (founder, 2026-08-31)
 *
 *   > *"הרבה הרבה יותר נוח באמצע האימון לדעת כמה משקל לשים בכל צד מאשר המשקל הכולל. זה הרבה יותר
 *   > נוח. זה פחות נפוץ באפליקציות אחרות אבל זה באמת יותר נוח."*
 *
 * He is right, and the reason it is "less common in other apps" is that other apps are LOGBOOKS —
 * they record a total because a total is what a history is made of. This one is used standing at a
 * rack with plates in your hands, and the question there is never *"what is the total"*. It is
 * **what do I hang on this end**.
 *
 * ── THE RULE GENERALISES, WHICH IS WHY IT IS A RULE AND NOT A BARBELL SPECIAL CASE ──────────────
 *
 * "Per side" is the barbell's answer to a question every implement answers differently, and
 * `loadSetup` already computes all of them. The screen's figure is simply THE NUMBER SET ON THE
 * EQUIPMENT:
 *
 *     barbell        the weight on ONE end       (the bar is a constant she never handles)
 *     plate_loaded   the weight on ONE side
 *     dumbbell       the dumbbell she picks up
 *     selectorized   where the pin goes
 *     cable          where the pin goes
 *     fixed_barbell  the number painted on the bar
 *
 * For four of those six the equipment number IS the total and nothing changes on screen. Only the
 * two loaded-by-hand styles differ — and those are exactly the two where the athlete does
 * arithmetic in her head today.
 *
 * ⚠️ THE RECORD IS STILL THE TOTAL. Every engine, every history row, every record and every chart
 * is in total kilos and none of that moves: this is a DISPLAY and an ENTRY transform, and
 * `totalFromEquipment` is its exact inverse so the round trip is lossless.
 * ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface EquipmentLoad {
  /** The figure she sets on the equipment — per side, per hand, or the pin. */
  value: number;
  /** Which of the six answers this is, so the caller can name it in her language. */
  style: LoadStyle;
  /** The total the record will carry, when it is NOT the same number as `value`. */
  total: number | null;
}

export function equipmentLoad(setup: LoadSetup | null): EquipmentLoad | null {
  if (!setup) return null;
  switch (setup.style) {
    case 'barbell':
    case 'plate_loaded':
      if (setup.perSide == null) return null;
      return { value: setup.perSide, style: setup.style, total: setup.headline };
    case 'dumbbell':
      return { value: setup.perHand ?? setup.headline, style: setup.style, total: null };
    case 'selectorized':
    case 'cable':
      return { value: setup.pin ?? setup.headline, style: setup.style, total: null };
    case 'kettlebell':
      return { value: setup.bell ?? setup.headline, style: setup.style, total: null };
    case 'fixed_barbell':
      return { value: setup.fixedBar ?? setup.headline, style: setup.style, total: null };
    default:
      return null;
  }
}

/**
 * The exact inverse: what she typed on the equipment → what the record stores.
 *
 * ⛔ A NEGATIVE OR NONSENSE ENTRY RETURNS NULL rather than a clamped number. She is reporting a
 * fact; an unreadable report is not a fact with a default, and the caller must decline it.
 */
export function totalFromEquipment(exerciseId: string | null | undefined, value: number, units: Units): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  switch (loadStyleOf(exerciseId)) {
    case 'bodyweight':
      return null;
    case 'barbell':
      return round2(value * 2 + GEAR[units].bar);
    case 'plate_loaded':
      return round2(value * 2);
    default:
      return round2(value);
  }
}

/**
 * Any TOTAL, restated as the number set on the equipment — the display transform on its own, for
 * callers that hold a raw load rather than a `LoadSetup` (her history, the last-time row).
 *
 * ⛔ IT FALLS BACK TO THE TOTAL RATHER THAN TO NULL. A load the setup cannot classify is still a
 * load she lifted, and a row that prints nothing where a number belongs is worse than a row that
 * prints the only number it has.
 */
export function equipmentValue(exerciseId: string | null | undefined, total: number | null, units: Units): number | null {
  if (total == null) return null;
  const eq = equipmentLoad(loadSetup(exerciseId, total, units));
  return eq ? eq.value : total;
}
