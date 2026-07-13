/**
 * Hush design tokens — translated 1:1 from the Claude Design "Design System"
 * project (2026-06-21). A near-monochrome *instrument* aesthetic: warm paper,
 * warm graphite ink, and a SINGLE restrained accent (ochre) used at ~1–2%
 * coverage — the system's voice, the active state, the affordance to begin.
 *
 * Reference standard: Leica · Braun · Linear · Apple at its best. The emotional
 * target is "I trust this," never "that's cool."
 *
 * LAWS (from the design system readme):
 *  - Color is information, never decoration. If a hue appears, it means
 *    something: progress reads sage (`up`), regression reads clay (`down`),
 *    the one accent is ochre (`signal`). Everything else is paper + ink.
 *  - A card sits on the page with a HAIRLINE, not a shadow. Elevation is earned
 *    — shadows appear only on things that truly float (sheets, dialogs, timer).
 *  - Space is the primary hierarchy tool (strict 4px grid). Restraint in color
 *    is repaid in generous, deliberate spacing.
 *  - Two type voices: Hanken Grotesk for everything the product *says*;
 *    JetBrains Mono (tabular) for everything it *measures*.
 *
 * NOTE (2026-06-21): this REPLACES the prior true-black "HUSH_BUILD_SPEC"
 * monochrome dark theme. OKLCH source values were converted to sRGB hex offline
 * (exact). Token names are preserved so screens keep compiling; legacy aliases
 * at the bottom are retired as screens migrate to the semantic names.
 */

import { Dimensions } from 'react-native';

/**
 * Responsive scale. The design is authored at real phone px; `s(n)` keeps the
 * prior call-sites working while gently scaling to the device. Kept conservative
 * so the instrument reads the same on every phone.
 */
const DESIGN_WIDTH = 393; // iPhone 16 Pro reference (the design's target frame)
const _screenW = Dimensions.get('window').width;
const _scaleFactor = Math.min(Math.max(_screenW / DESIGN_WIDTH, 0.92), 1.15);
export const s = (n: number) => Math.round(n * _scaleFactor);

/* ============================================================================
 * RAW PALETTE — OKLCH converted to sRGB hex (exact).
 * ==========================================================================*/

/** Warm off-white paper surfaces. */
export const paper = {
  0: '#fbfaf8', // page
  1: '#f7f6f3', // raised surface / card
  2: '#eeede9', // sunken / track / well
  3: '#e4e3de', // deepest well
} as const;

/** Warm graphite ink (text + marks). */
export const ink = {
  0: '#191714', // primary text, near-black
  1: '#43403e', // secondary text
  2: '#726f6c', // muted / captions
  3: '#a09e9b', // faint / placeholder
  4: '#c5c4c1', // disabled glyph
} as const;

/** Low-contrast hairlines. */
export const line = {
  0: '#dcdad8', // default hairline
  1: '#c5c4c0', // emphasized hairline
  2: '#b3b1ad', // control border
} as const;

/** The one accent: ochre. Used at ~1–2% coverage. */
export const signal = {
  0: '#cc9147', // the mark — index lines, dots, bars, rings. Never carries text.
  1: '#c7802b', // the mark, pressed
  ink: '#854a0b', // accent as text on paper
  wash: '#f8ebd7', // faint accent tint surface

  /**
   * THE OCHRE A LETTER SITS ON — and it is THE ochre (founder ruling 2026-07-13, final).
   *
   * This slot has now been tried three ways. Cream on `signal[0]` is the brown the founder built
   * the product around, and it is 2.6:1 — under AA. Charcoal on `signal[0]` passed AA and was
   * rejected on sight ("the black inside the brown, I liked it less"). Darkening the fill to
   * #9c6522 passed AA with cream on it and was rejected the moment it reached a device: "bring
   * back the familiar brown — this dark brown is not pretty."
   *
   * So the ruling is made and it is not a compromise: the accent is ONE brown, `signal[0]`, on
   * every surface — the ring, the dot, the primary button, the button's letters' ground. The
   * contrast cost is accepted knowingly and is bounded: it applies to the WHITE-ON-OCHRE PRIMARY
   * LABEL only, a short, semibold, 17px word on a large filled target — never to body copy, never
   * to a small glyph, never to anything an athlete must read to know what to lift. The load, the
   * reps, the timer and every instruction live in ink on paper or cream on graphite, all of which
   * clear AA comfortably. Do not "fix" this again without the founder.
   */
  fill: '#cc9147',
  fillPressed: '#c7802b',
} as const;

/** Semantic: load + progress (desaturated, calm). */
export const up = { 0: '#597f60', wash: '#e3f1e5' } as const; // sage — increase / progress
export const down = { 0: '#a0604c', wash: '#fee9e1' } as const; // clay — decrease

/**
 * Inverted "stage" palette — the live workout focus surface.
 *
 * Founder 2026-07-12: deepened toward black (OLED: darker pixels, less battery on a
 * long session) while KEEPING the warm graphite law — a true #000 would break the
 * ochre-as-foil reading the whole instrument is built on. Separation on the stage is
 * carried by TONE, never by a border: `1` is the raised card, `2` the faintest rule.
 */
export const stage = {
  0: '#131110', // stage background — near-black, still warm
  1: '#201d1a', // raised on stage (floating card: LOAD, TOP SET)
  2: '#2f2c29', // faint rule on stage
  ink0: '#f4f3f0', // primary text on stage
  ink1: '#b3b1ad', // secondary on stage
  ink2: '#767471', // muted on stage
} as const;

/* ============================================================================
 * SEMANTIC COLORS — what components reference.
 * Existing key names are preserved (remapped to the new palette) so the whole
 * app flips to the paper/ink theme while continuing to compile.
 * ==========================================================================*/
export const color = {
  // Backgrounds / surfaces
  bg: paper[0], // page
  surface: paper[1], // raised surface / card
  surface2: paper[1], // sheet bg
  surface3: paper[2], // sunken well / cards inside sheets

  // Text — warm graphite ink at descending strength
  textPrimary: ink[0],
  textSecondary: ink[1],
  textMuted: ink[2],
  textTertiary: ink[3], // eyebrows / faint context
  textDim: ink[2], // coaching line / captions
  textDisabled: ink[4],

  // Lines / chrome
  border: line[0], // default hairline
  borderStrong: line[1],
  borderControl: line[2],
  tabInactive: ink[3],

  // Subtle fills (tracks, wells, pills)
  fillSubtle: paper[2],
  fillSubtleStrong: paper[3],

  // The one accent (ochre) + its text/wash forms
  accent: signal[0],
  accentHover: signal[1],
  accentText: signal.ink,
  accentWash: signal.wash,
  /** Text/glyph ON an ochre fill — CREAM. See `signal.fill` for the ruling. */
  onAccent: paper[0],
  /** The ochre a letter sits on — now the same ochre as everything else. */
  accentFill: signal.fill,
  accentFillPressed: signal.fillPressed,

  // Semantic load states
  up: up[0],
  upWash: up.wash,
  down: down[0],
  downWash: down.wash,
  hold: ink[2],

  // ---- legacy "accent" aliases (remapped; retired as screens migrate) ----
  // White-fill action → now the ochre signal; live timer/progress → sage;
  // destructive → clay (still desaturated, still calm).
  accentBlue: signal.ink, // actionable links ("Set as next")
  accentGreen: up[0], // live timer / rest ring / progress
  danger: down[0], // destructive ("Delete Account")

  // DONE chip
  doneText: ink[2],
  doneBorder: line[1],

  // Brand mark — the level-at-rest dot is ochre
  logoGradStart: signal[0],
  logoGradEnd: signal[1],

  // ---- backward-compat aliases ----
  bgBase: paper[0],
  bgSurface: paper[1],
  borderSubtle: line[0],
  onSurface: ink[0],
} as const;

/* ============================================================================
 * TYPOGRAPHY — two voices.
 * ==========================================================================*/

/** Font families (loaded via expo-font in app entry; see fonts task). */
export const font = {
  sans: 'HankenGrotesk',
  sansMedium: 'HankenGrotesk-Medium',
  sansSemibold: 'HankenGrotesk-SemiBold',
  sansBold: 'HankenGrotesk-Bold',
  mono: 'JetBrainsMono',
  monoMedium: 'JetBrainsMono-Medium',
  monoSemibold: 'JetBrainsMono-SemiBold',
} as const;

/**
 * Size scale (px), from the design's rem scale at 16px base.
 * 2xs 11 · xs 12 · sm 13 · base 15 · md 17 · lg 20 · xl 24 · 2xl 30 · 3xl 38 ·
 * 4xl 48 · 5xl 64 · data 84.
 */
export const textScale = {
  '2xs': 11,
  xs: 12,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  '2xl': 30,
  '3xl': 38,
  '4xl': 48,
  '5xl': 64,
  data: 84,
} as const;

export const weight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const tracking = {
  display: -0.022, // em — tight display
  tight: -0.012,
  normal: 0,
  wide: 0.04,
  legend: 0.09, // uppercase instrument legends
};

/**
 * Type tiers — preserves the prior export shape (hero/display/titleXL/…) so
 * screens keep compiling, retuned to the new scale + the two font voices.
 * `mono: true` tiers measure (loads, reps, timers); the rest speak.
 */
export const type = {
  hero: { size: textScale.data, lineHeight: textScale.data, weight: weight.semibold, mono: true }, // 84 — live load
  display: { size: textScale['5xl'], lineHeight: 64, weight: weight.semibold, mono: true }, // 64 — timers
  titleXL: { size: textScale['4xl'], lineHeight: 52, weight: weight.bold }, // 48 — page display
  titleL: { size: textScale['2xl'], lineHeight: 34, weight: weight.semibold }, // 30 — section display
  titleM: { size: textScale.xl, lineHeight: 28, weight: weight.semibold }, // 24 — screen title
  bodyL: { size: textScale.md, lineHeight: 24, weight: weight.regular }, // 17 — emphasized body
  bodyM: { size: textScale.base, lineHeight: 22, weight: weight.regular }, // 15 — body / default UI
  caption: { size: textScale.sm, lineHeight: 18, weight: weight.regular }, // 13 — secondary UI
  micro: { size: textScale.xs, lineHeight: 16, weight: weight.regular }, // 12 — legend / caption
  legend: { size: textScale['2xs'], lineHeight: 14, weight: weight.medium }, // 11 — micro legend
  unit: { size: textScale.base, lineHeight: 15, weight: weight.medium }, // unit beside a value
} as const;

/* ============================================================================
 * SPACING — strict 4px grid.
 * ==========================================================================*/
export const space = {
  0: 0,
  px: 1,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 48,
  10: 64,
  11: 80,
  12: 96,
  // Semantic rhythm
  gutter: 20, // screen side padding (mobile)
  sheetGutter: 20,
  stackTight: 8,
  stack: 16,
  stackLoose: 32,
  section: 48,
} as const;

/** Control geometry. */
export const control = {
  hSm: 32,
  h: 44, // default touch target
  hLg: 56, // primary actions
  padX: 16,
} as const;

export const layout = {
  screenMargin: 20, // screen gutter
  referenceWidth: 393, // iPhone 16 Pro reference
  referenceHeight: 852,
} as const;

/* ============================================================================
 * RADIUS / BORDERS — small and precise; nothing playful.
 *
 * FOUNDER RULING 2026-07-12 — CLOSED: plain `borderRadius`, no "squircle" / continuous-curve
 * smoothing. React Native has no native corner smoothing, so it would mean an SVG-mask library
 * or a heavy dependency — paid for on EVERY screen render, forever, to satisfy something only a
 * designer with a loupe can see. The device's CPU would feel it; the athlete would not.
 * ==========================================================================*/
export const radius = {
  xs: 2,
  sm: 4,
  md: 6, // default control
  lg: 10, // card
  xl: 16, // sheet / large surface
  '2xl': 22, // full-screen sheet top
  full: 999,
  // ---- legacy aliases (retired as screens migrate) ----
  card: 10,
  sheet: 22,
  done: 4,
  pill: 999,
} as const;

export const border = { width: 1, widthStrong: 1.5 } as const;
export const hairline = { width: 1, color: color.border } as const;

/* ============================================================================
 * ELEVATION — warm, low-alpha. Earned, never default.
 * Shadow base colors are the OKLCH shadow tints converted to rgb.
 * ==========================================================================*/
export const shadow = {
  // 0 4px 12px / 0 1px 3px — cards that lift on press
  md: {
    shadowColor: 'rgb(26,21,18)',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  // 0 18px 48px — sheets / dialogs
  lg: {
    shadowColor: 'rgb(21,17,13)',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10,
  },
  // 0 24px 64px — the live stage / rest timer
  stage: {
    shadowColor: 'rgb(5,3,2)',
    shadowOpacity: 0.4,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 24 },
    elevation: 16,
  },
} as const;

/* ============================================================================
 * BUTTONS — primary carries the single signal color.
 * ==========================================================================*/
export const button = {
  primary: {
    height: control.hLg, // 56
    radius: radius.md, // 6
    bg: signal.fill, // the ochre — the familiar brown (see signal.fill)
    fg: paper[0], // cream
    pressedBg: signal.fillPressed,
    fontSize: textScale.md, // 17
    fontWeight: weight.semibold,
    pressedOpacity: 1, // press settles 1px down, no opacity dip
  },
  homeCta: {
    height: control.hLg, // 56
    radius: radius.md,
    fontSize: textScale.md,
    fontWeight: weight.semibold,
  },
  textAction: {
    color: color.textSecondary,
    fontSize: textScale.base,
    fontWeight: weight.semibold,
    minTapHeight: 44,
  },
} as const;

/** Press feedback: settles 1px down (translateY), never scales or glows. */
export const press = { translateY: 1, opacity: 1, durationMs: 120 } as const;

/* ============================================================================
 * MOTION — confirms, never performs. No bounce/overshoot/spring.
 * ==========================================================================*/
export const motion = {
  // Eases as cubic-bezier control points (for Reanimated / Easing.bezier).
  easeStandard: [0.2, 0, 0, 1] as const, // default
  easeOut: [0.16, 1, 0.3, 1] as const, // enter
  easeIn: [0.4, 0, 1, 1] as const, // exit
  // mechanical = linear (the rest timer sweep)
  dur: { instant: 80, 1: 120, 2: 180, 3: 240, 4: 360, 5: 600 },
} as const;

/* ============================================================================
 * Font-feature helpers.
 * ==========================================================================*/
export const trackingPx = (size: number, em: number) => size * em;
export const heroTitle = (size: number, em = tracking.display) => ({
  fontFamily: font.sansBold,
  letterSpacing: size * em,
  textAlign: 'left',
});
