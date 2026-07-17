/**
 * Hush design tokens — direction "READOUT" (founder-ratified 2026-07-17).
 *
 * Reference standard: Leica · Braun · Linear · Teenage Engineering. The emotional
 * target is "I trust this," never "that's cool."
 *
 * ════ THE LAW ════
 *
 *  **There is no accent hue. Emphasis is DISTANCE FROM THE GROUND.**
 *
 *  A surface that is active moves AWAY from the page: on paper it lifts toward
 *  `paper.lift` (white); on the stage it lifts toward `stage.lift`. A mark or a
 *  letter that matters moves the other way — to full-strength `ink[0]` on paper,
 *  to `stage.ink0` on the stage. Both gestures are the same gesture: *separate
 *  further from what you sit on*. That is the only emphasis this product has.
 *
 *  This is not a new idea imposed on the app. It is the app's OWN best instinct,
 *  promoted to law: the two most confident screens it already had (the run timer,
 *  and "Upper A complete.") are fully achromatic. The ochre only ever lived on the
 *  three most generic elements it owns — the kg/lb pill, the EN/עב pill, and the
 *  Begin button.
 *
 *  Colour touches MARKS, never GROUNDS. Concretely:
 *   - `signal` (ochre) is THE BRAND MARK — the dot and the dial in HushMark.
 *     It appears nowhere else. It never carries text; it never fills a control.
 *   - `up` (sage) and `down` (clay) survive, because a load that rose and a load
 *     that fell are *meaning*, not decoration. They colour a tick or a figure —
 *     never a surface. (Their `wash` slots are retired to `paper[1]`.)
 *   - Everything else is paper + ink.
 *
 *  Consequence, and it is the point: **nothing coloured carries text, so nothing
 *  coloured can fail contrast.** The three-round ochre-contrast argument
 *  (2026-07-13) is not resolved — it is RETIRED. Every value in this file clears
 *  WCAG AA against the ground it sits on. Enforced by
 *  `__tests__/render/founderBatchRender.test.tsx`.
 *
 * ════ THE LADDER ════
 *
 *  Founder finding, 2026-07-17: the old ladder was UPSIDE DOWN. `paper[0]` was
 *  #fbfaf8 — 95.7% luminance, which is not paper, it is white wearing a hint.
 *  Real paper, a Braun housing and a lab bench all sit near 78%. The founder
 *  picked #e8e5e0 by eye three separate times without knowing it (this project's
 *  own page chrome, the "Index" ground, and — within [4,2,2] — his own
 *  `paper[3]`, which he was using as the DEEPEST WELL).
 *
 *  Dropping the ground buys three things:
 *   1. **White becomes a resource** (`paper.lift`) — the app had none before,
 *      because everything already sat between 92% and 96%.
 *   2. **Cards separate by TONE, not a hairline.** That was already the law on the
 *      stage ("separation on the stage is carried by TONE, never by a border") and
 *      had simply never been granted to the light world. It is now.
 *   3. A 96% screen in a dim gym is a lamp. 78% is not. "Calm and certain" was
 *      never going to survive a white screen.
 *
 * ════ WARMTH ════
 *
 *  Warmth is R−B. Both ramps converge on the same warm middle from opposite ends:
 *  paper GAINS warmth as it darkens (0 → 5 → 8 → 10 → 14), ink GAINS warmth as it
 *  lightens (4 → 11 → 15). That is physical: a light ink on warm paper *is the
 *  paper showing through*. The old ink ramp was flat (5, 5, 6, 5) — graphite at
 *  50% opacity, computed rather than observed, which is why the old greys sat ON
 *  the paper instead of belonging to it.
 *
 *  Corollary the founder caught by eye: "no accent hue" is NOT "no hue at all".
 *  Those are separate axes — Braun has no accent AND warm beige-grey housings. A
 *  near-neutral grey (R−B ≈ 3) reads as silver, and reads as a default, because it
 *  is one. Nothing in this file is neutral.
 *
 * ════ UNCHANGED ════
 *
 *  - Space is the primary hierarchy tool (strict 4px grid).
 *  - Two type voices: Hanken Grotesk for everything the product *says*;
 *    JetBrains Mono (tabular) for everything it *measures*.
 *  - The stage stays the founder's own #131110 — warm graphite, never true #000.
 *    That law was written for the ochre's sake; the ochre is gone and the law
 *    stands anyway, for the reason above: neutral reads cold, and this product isn't.
 *
 *  Token NAMES are preserved so every screen keeps compiling; the values move.
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
 * RAW PALETTE
 *
 * Every value below is measured, not chosen. `L` is WCAG relative luminance;
 * `warmth` is R−B. See the header for why both columns move the way they do.
 * ==========================================================================*/

/**
 * The light world. Emphasis moves UP this ladder — `lift` is the active thing.
 *
 * Note the inversion from the pre-2026-07-17 file: `0` used to be the LIGHTEST
 * value (the page at 95.7%) and `3` the darkest. Now `0` is the GROUND and the
 * ladder climbs above it. A raised card is now genuinely lighter than the page,
 * which is what "raised" has meant everywhere except here.
 */
export const paper = {
  0: '#e8e5e0', // ground — the page.        L 78.6%  warmth  8
  1: '#f4f2ef', // raised — cards, sheets.   L 89.0%  warmth  5
  2: '#dedad4', // well — tracks, sunken.    L 70.4%  warmth 10
  3: '#d5cfc7', // deepest well.             L 62.9%  warmth 14
  /** The active thing. A resource the app did not have before the ground dropped. */
  lift: '#ffffff', //                        L  100%  warmth  0
} as const;

/**
 * Warm graphite ink. Gains warmth as it lightens — a light ink on warm paper IS
 * the paper showing through.
 *
 * `0`–`2` are the only tiers licensed to carry TEXT, and they are measured against
 * the DARKEST ground text is allowed to sit on — `paper[2]`, the well — not against
 * `paper[0]`. That is the binding constraint: a caption at 4.59:1 on the ground is
 * only 4.14:1 in a wheel's channel, and the athlete reads it there too.
 *
 * `3` and `4` are non-text (a faint mark, a disabled glyph) and are exempt by WCAG.
 * Do not promote them to text without re-measuring against the well.
 */
export const ink = {
  0: '#1b1917', // primary text.     13.95:1 ground · 12.59:1 well   warmth  4
  1: '#5d5852', // secondary text.    5.60:1 ground ·  5.06:1 well   warmth 11
  2: '#625c53', // muted / caption.   5.26:1 ground ·  4.75:1 well   warmth 15
  3: '#8b857e', // faint mark — NOT text                             warmth 13
  4: '#b0aaa1', // disabled glyph — exempt                           warmth 15
} as const;

/**
 * Hairlines. Deliberately quiet: with a real ground, a card separates by TONE and
 * a rule is for a genuine hard edge only — a control's border, a list divider.
 * If you are reaching for `line[1]` to make a card visible, the card wants
 * `paper[1]`, not a border.
 */
export const line = {
  0: '#d8d4cd', // default hairline           warmth 11
  1: '#cbc6bf', // emphasized hairline        warmth 12
  2: '#b8b2a9', // control border             warmth 15
} as const;

/**
 * THE BRAND MARK — and nothing else, ever.
 *
 * The ochre survives in exactly one place: the dot and the dial in `HushMark`.
 * It is a seal, not a UI colour. It does not fill a control, mark a selection,
 * stroke a ring, or sit behind a letter.
 *
 * This retires the ruling of 2026-07-13. That ruling was correct given its
 * question — cream-on-ochre (2.6:1) was ugly to fix and the founder chose the
 * familiar brown over an AA pass, twice. The v5 redesign dissolves the question
 * instead of re-answering it: the primary button is now INK, so there is no
 * ochre for a letter to sit on. `fill` and `ink` below are kept as names so
 * call-sites compile, and both now resolve to graphite.
 */
export const signal = {
  0: '#c8873a', // THE MARK — HushMark only.
  1: '#b8792e', // the mark, pressed.
  /** Retired: there is no coloured text. Resolves to primary ink. */
  ink: '#1b1917',
  /** Retired: there are no tinted grounds. Resolves to the raised surface. */
  wash: '#f4f2ef',
  /** The primary button's ground. It is INK now — 15.7:1 with its label. */
  fill: '#1b1917',
  fillPressed: '#2e2a26',
} as const;

/**
 * Semantic: load + progress. These SURVIVE the accent's removal, because a load
 * that rose and a load that fell are meaning, not decoration — an instrument's
 * red zone is not its accent.
 *
 * They colour a TICK or a FIGURE. Never a surface: both `wash` slots are retired
 * to `paper[1]`, because a tinted ground is exactly what this direction removed.
 *
 * ONE HUE CANNOT SERVE BOTH WORLDS — and this is arithmetic, not taste. Clearing
 * 4.5:1 against a 78.6% ground requires L ≤ 0.136; clearing it against the 1.1%
 * stage requires L ≥ 0.223. There is no overlap. So each has a `stage` sibling,
 * exactly as `ink` does. **Use `up.stage` / `down.stage` on the stage. Always.**
 *
 * Retuned 2026-07-17. The previous single values (#597f60 / #a0604c) were failing
 * AA on the STAGE already — 4.15:1 and 3.83:1 — and had been since they shipped.
 * The old contrast test never reached them. The new ground did not break these;
 * it exposed them.
 */
export const up = {
  0: '#476849', // sage on paper.    5.00:1 on ground
  wash: '#f4f2ef', // retired — no tinted grounds
  stage: '#7fa886', // sage on stage.   7.04:1 on stage[0]
} as const;
export const down = {
  0: '#8d5342', // clay on paper.    4.85:1 on ground
  wash: '#f4f2ef', // retired — no tinted grounds
  stage: '#c9907e', // clay on stage.   6.97:1 on stage[0]
} as const;

/**
 * The stage — the live workout. Unchanged from the founder's own 2026-07-12
 * values, except `ink2` (see below) and the new `lift`.
 *
 * Founder 2026-07-12: deepened toward black (OLED: darker pixels, less battery on
 * a long session) while KEEPING the warm graphite law — a true #000 would break
 * the ochre-as-foil reading. **The ochre is gone and the law stands anyway**: a
 * neutral black reads cold, and this product isn't. Separation on the stage is
 * carried by TONE, never by a border — the light world now works the same way.
 */
export const stage = {
  0: '#131110', // stage background — near-black, still warm
  1: '#201d1a', // raised on stage (floating card: LOAD, TOP SET)
  2: '#2f2c29', // faint rule on stage
  ink0: '#f4f3f0', // primary on stage.    16.97:1 stage[0] · 14.90:1 stage[1]
  ink1: '#b3b1ad', // secondary on stage.   8.79:1 stage[0] ·  7.83:1 stage[1]
  /**
   * FIXED 2026-07-17. Was #767471 — 4.04:1 on stage[0], i.e. it had been failing AA
   * on the stage since it shipped. The old contrast test asserted `ink0` and `ink1`
   * and never reached this tier, so it went unseen for four builds. Not part of the
   * redesign; found while measuring for it.
   *
   * Measured against `stage[1]`, the raised card — the LIGHTEST stage ground text is
   * allowed to sit on, and therefore the binding one. (The same trap as `ink[2]` on
   * paper: a value tuned against the background alone fails the moment it lands on a
   * card.) The new law's test now asserts both grounds for every stage tier.
   */
  ink2: '#878581', // muted on stage.       5.11:1 stage[0] ·  4.55:1 stage[1]
  /** The active thing on the stage — the mirror of `paper.lift`. */
  lift: '#ffffff',
} as const;

/* ============================================================================
 * SEMANTIC COLORS — what components reference.
 * Existing key names are preserved (remapped to the new palette) so the whole
 * app flips to the paper/ink theme while continuing to compile.
 * ==========================================================================*/
export const color = {
  // Backgrounds / surfaces
  bg: paper[0], // ground — the page
  surface: paper[1], // raised surface / card
  surface2: paper[1], // sheet bg
  surface3: paper[2], // sunken well / cards inside sheets
  /** The active thing on paper. Emphasis is distance from the ground. */
  lift: paper.lift,

  // Text — warm graphite ink at descending strength.
  // All three text tiers clear AA on `bg`; see `ink` for why there is no fourth.
  textPrimary: ink[0],
  textSecondary: ink[1],
  textMuted: ink[2],
  /**
   * Eyebrows / faint context. Promoted from `ink[3]` to `ink[2]` on 2026-07-17:
   * `ink[3]` is 2.9:1 and an eyebrow is text. It loses nothing — an eyebrow is
   * already set apart by uppercase, tracking and 11px. Using colour to repeat
   * what the typography has already said is exactly the redundancy this
   * direction removes.
   */
  textTertiary: ink[2],
  textDim: ink[2], // coaching line / captions
  textDisabled: ink[4],

  // Lines / chrome
  border: line[0], // default hairline
  borderStrong: line[1],
  borderControl: line[2],
  tabInactive: ink[2],

  // Subtle fills (tracks, wells, pills)
  fillSubtle: paper[2],
  fillSubtleStrong: paper[3],

  // ---- the mark, and the retired accent slots ----
  /** THE BRAND MARK. HushMark only — see `signal`. */
  accent: signal[0],
  accentHover: signal[1],
  /** Retired: no coloured text. Resolves to primary ink. */
  accentText: signal.ink,
  /** Retired: no tinted grounds. Resolves to the raised surface. */
  accentWash: signal.wash,
  /** The primary button's label. Cream on INK now — 15.7:1, not 2.6:1. */
  onAccent: paper[1],
  /** The primary button's ground. Graphite. */
  accentFill: signal.fill,
  accentFillPressed: signal.fillPressed,

  // Semantic load states
  up: up[0],
  upWash: up.wash,
  down: down[0],
  downWash: down.wash,
  hold: ink[2],

  // ---- legacy aliases (all three are dead call-sites as of 2026-07-17) ----
  accentBlue: ink[0], // actionable links — a link is weight, not hue
  accentGreen: up[0], // live timer / rest ring / progress
  danger: down[0], // destructive ("Delete Account")

  // DONE chip
  doneText: ink[2],
  doneBorder: line[1],

  // Brand mark — the level-at-rest dot is the one ochre in the product
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

/**
 * Font families (loaded via expo-font in app entry).
 *
 * THE MONO VOICE CARRIES FIGURES, NEVER WORDS — and in Hebrew that is not a matter of taste:
 * **JetBrains Mono contains no Hebrew glyphs at all.** Every mono string that carried a translated
 * word ("סט 1 מתוך 4", "משקל גוף", "9.5 בכל צד", "קק״ל", a milestone's date) fell back to whatever
 * face the OS could find, mid-line, in an app whose whole claim is that it is precisely made.
 * Digits, ×, :, /, kg, lb are what mono is for. Anything a translator touches is Hanken.
 * Enforced by `__tests__/laws/monoCarriesNoWords.test.ts`.
 */
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
 * BUTTONS — the primary action is the darkest thing on the page.
 *
 * It used to be the ochre. Under READOUT the strongest affordance is the one
 * furthest from the ground, and on paper that is ink. This is also, not by
 * coincidence, what "Continue with Apple" already looked like on the sign-in —
 * the one button on that screen nobody ever complained about.
 * ==========================================================================*/
export const button = {
  primary: {
    height: control.hLg, // 56
    radius: radius.md, // 6
    bg: signal.fill, // GRAPHITE — the ochre button is retired (see `signal`)
    fg: paper[1], // cream on ink: 15.7:1
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
