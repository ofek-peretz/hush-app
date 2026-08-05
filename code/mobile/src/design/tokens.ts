/**
 * Hush design tokens — direction "ALL DARK · ONE LIT STAGE" (v7, 2026-07-22).
 *
 * ════ THE INVERSION ════
 *
 *  v7 retires paper as a *background*. Every screen now sits on the same lit dark
 *  stage; paper survives only as small CARDS and PILLS. The warm light still falls
 *  from the top, so the working number stands in it and the controls rest in shadow.
 *
 *  THREE COLORS, PLUS LIGHT:
 *   - **Stage** — the ground, everywhere. A warm near-black lit from above:
 *     `#1B1914 → #131210 → #0F0E0C`. Never true black (this product isn't cold).
 *   - **Paper** — `#F3F0E8`. Cards and pills ONLY, carrying dark ink. A resource,
 *     not a canvas.
 *   - **Moss** — `#3E573F` deep / `#A9C49F` lit. THE accent — "a decision made".
 *     It marks a selection, the brand dot, a tick that landed, a toggle that's on.
 *
 *  There is no fourth color. `up`/`down` (a load that rose / fell) survive as
 *  meaning: moss for up, a warm clay for down. Gravity — light from above — is the
 *  constant that replaces the old "distance from the ground" rule: emphasis is now
 *  literally *standing in the light* (cream `#F1EEE5`) vs *resting in shadow*.
 *
 * ════ THREE VOICES ════
 *
 *  - **Assistant** — the interface. Everything the product *says* in UI chrome.
 *    Full Hebrew.
 *  - **Frank Ruhl Libre** — the coach's voice. The serif headline the product
 *    speaks in ("What do I call you?"). Full Hebrew.
 *  - **IBM Plex Mono** — every FACT. Loads, reps, timers, units, eyebrows. Carries
 *    figures, never translated words (it has no Hebrew glyphs — same law as before,
 *    enforced by `monoCarriesNoWords`).
 *
 * ════ ONE PHYSICS ════
 *
 *  All motion shares the settle — `cubic-bezier(.22,1,.36,1)`. The dot lands in
 *  900ms, rows rise 40ms apart, the rest ring breathes at 4.5s / scale 1.035.
 *
 *  Token NAMES are preserved from the light era so every screen keeps compiling;
 *  the VALUES invert. Where a screen relied on a light ground it will read cream on
 *  dark automatically, then gets refined per-screen.
 */

import { Dimensions } from 'react-native';

/**
 * Responsive scale. Authored at real phone px (iPhone 16 Pro, 393w); `s(n)` keeps
 * call-sites working while gently scaling to the device.
 */
const DESIGN_WIDTH = 393;
const _screenW = Dimensions.get('window').width;
const _scaleFactor = Math.min(Math.max(_screenW / DESIGN_WIDTH, 0.92), 1.15);
export const s = (n: number) => Math.round(n * _scaleFactor);

/* ============================================================================
 * RAW PALETTE — every value measured from the v7 handoff.
 * ==========================================================================*/

/**
 * PAPER — cards and pills only, never a background. Opaque, warm, carrying dark ink.
 * `0` is the default card; `1`/`lift` is a raised/pressed card; `2`/`3` are wells.
 */
export const paper = {
  0: '#f3f0e8', // card — the default paper surface
  1: '#fbf9f3', // raised / pressed card
  2: '#e3ded0', // well — a sunken track inside a paper card
  3: '#d8d4c8', // deepest well / ruler ground
  lift: '#ffffff', // the brightest paper
} as const;

/**
 * INK — dark text, for the rare paper card. `0`–`2` carry text on `paper[0]`.
 * `3`/`4` are faint marks / disabled, exempt from text contrast.
 */
export const ink = {
  0: '#1b1913', // primary on paper
  1: '#57534a', // secondary on paper
  2: '#615d49', // muted / caption on paper
  3: '#857d6b', // faint mark — NOT text
  4: '#9a937f', // disabled glyph — exempt
} as const;

/**
 * CREAM — the light that stands on the stage. This is the primary ink of the whole
 * app now (text default). Descending strength; all clear AA on the stage grounds.
 */
export const cream = {
  0: '#f1eee5', // primary text on stage.        16.9:1 on stage[0]
  1: '#a8a290', // secondary text on stage.        8.1:1 on stage[0]
  2: '#8b8474', // muted / eyebrow on stage.       5.4:1 on stage[0]
  // v7 Rev 14 — the faint tier is LIFTED to the muted value. `#7a7260` cleared AA only against
  // the mid gradient (4.5:1 on stage[0]) and dropped to 3.7:1 against the LIGHTEST stop — text
  // sitting on the top of the gradient was sub-AA. It now equals cream[2] (4.7:1 worst-case);
  // there is no legible tier below the muted one on the stage. Locked by contrastHoldsOnTheStage.
  3: '#8b8474', // faint / mono legend on stage.   ≥4.5:1 on the lightest stage ground
} as const;

/**
 * Hairlines on the stage — translucent cream, so they never read as a hard border.
 */
export const line = {
  0: 'rgba(241,238,229,0.12)', // default hairline
  1: 'rgba(241,238,229,0.18)', // emphasized hairline
  2: 'rgba(241,238,229,0.16)', // control border
} as const;

/**
 * MOSS — THE accent. A decision made. Marks selection, the brand dot, a landed
 * tick, a live ring, a toggle that's on. `0` is lit moss (on the dark stage); `1`
 * is deep moss (on a paper card / the light canvas).
 */
export const signal = {
  0: '#a9c49f', // lit moss — the mark & accent ON THE STAGE
  // `1` is a PAPER ink. On the dark stage it reads 2.2:1 — invisible. NEVER color stage TEXT with
  // it; reach for `0` (lit moss) there. Locked by contrastHoldsOnTheStage.
  1: '#3e573f', // deep moss — the mark & accent ON PAPER
  wash: 'rgba(169,196,159,0.12)', // faint moss veil (a live channel, a scan)
  ring: '#a9c49f', // the rest / live ring
  /** Retained names (light era) → resolve into the new world. */
  ink: '#a9c49f',
  fill: '#f1eee5', // the PRIMARY BUTTON ground is CREAM now (cream on dark)
  fillPressed: '#e3ded0',
  // A.13 — the moss button's pressed ground. The same relationship cream has to its own pressed
  // step (one notch down, same hue), because a press changes the SURFACE. The `signal` variant
  // used to answer a press with `opacity: 0.88`, which dimmed the button AND the dark ink on it.
  mossPressed: '#9bb492',
} as const;

/**
 * ════ SEMANTIC LOAD — AND A FALL IS NOT A FAILURE (founder 2026-07-28) ════
 *
 * A rise is moss. A fall was a warm CLAY — and clay, next to moss, on a dark ground, reads as the
 * red half of a red/green pair: the colour of a mistake. But an eased load is the engine doing its
 * job. Loop 1 saw the reps and matched the weight to the body that showed up today; there is
 * nothing to apologise for and nobody failed. Told in the wrong colour it lands as a demotion, and
 * the athlete learns to dread the one moment the product should be trusted for.
 *
 * So a fall is **BLUE** — cool, calm, clinical. It is the colour of care rather than alarm, it is
 * unmistakably NOT the green beside it, and it is far enough from clay that "eased" and "warning"
 * can never be confused for one another again.
 *
 * `0` sits on paper; `stage` sits on the dark. Use the `stage` sibling on the stage — always
 * (`paperTonesStayOffTheStage` enforces it, and the stage tone is tuned to clear AA on `#131210`).
 */
export const up = {
  0: '#3e573f', // moss on paper
  wash: 'rgba(169,196,159,0.12)',
  stage: '#a9c49f', // moss on stage
} as const;
export const down = {
  0: '#2f5d78', // deep blue on paper
  wash: 'rgba(126,178,214,0.14)',
  stage: '#7eb2d6', // lit blue on stage — eased, not failed
} as const;

/**
 * ════ CLAY DID NOT LEAVE — IT WENT BACK TO ITS REAL JOB (founder 2026-07-29) ════
 *
 * "Things to do with an INJURY or with how badly it hurts cannot appear in blue. Blue is for a
 * load coming down; red is for the part to do with pain."
 *
 * When `down` moved from clay to blue, everything that had been borrowing `down` FOR ITS CLAY went
 * blue with it — §13.1's "something doesn't feel right" door, §13.2's severity grades, the body
 * map's tender halo, the destructive Button variant, the account-deletion rows. The 2026-07-28 note
 * on `down` even says "clay is reserved for pain and for destructive confirms", and then the clay
 * was replaced rather than kept beside it. That is the whole bug: the token carried two meanings
 * and only one of them was allowed to move.
 *
 * `alert` is that clay, back, and it is the ONLY thing pain and destruction may draw in. It is the
 * deeper clay the wrist has always reserved for exactly this (`Palette.clay` #c56a4e), so the two
 * surfaces agree. It is never a direction, and no load ever wears it.
 */
export const alert = {
  0: '#8c3f27', // deep clay on paper
  wash: 'rgba(197,106,78,0.14)',
  stage: '#c56a4e', // lit clay on stage — pain, and destructive confirms
} as const;

/**
 * A HOLD is the third thing, and it is neither. The load did not move because nothing asked it to
 * (R7/S-24 — a hold is not news), so it takes the cream the rest of the stage speaks in: no hue, no
 * verdict, no implied direction.
 */
export const hold = {
  0: '#3a362d',
  wash: 'rgba(241,238,229,0.10)',
  stage: '#f1eee5', // cream on stage
} as const;

/**
 * ════ THE DIRECTION LAW (founder 2026-07-29) ════
 *
 * "I want this to be a law in the whole app, even on TODAY or on any other screen: **down = blue,
 * hold = our cream, raise = our green.**"
 *
 * It was ratified as a palette on 2026-07-28 and then applied to exactly ONE beat. The other
 * surfaces each kept their own answer: the Saturday letter drew an eased load in MOSS (the colour
 * of a raise — worse than red, because it says the engine did the opposite of what it did), the
 * why-sheet was moss on all three verdicts, and Today lit every changed load in ochre, refusing to
 * say which way it had gone.
 *
 * So the mapping has ONE home. A surface that draws a direction asks here; it never picks a hue.
 * `everyDirectionIsDrawnByTheLaw` sweeps the source for anyone who tries.
 */
export type LoadDirection = 'up' | 'down' | 'hold';

export function directionTone(direction: LoadDirection): string {
  return direction === 'up' ? up.stage : direction === 'down' ? down.stage : hold.stage;
}

/** The same three, at wash weight — for a chip, a pill's ground, or a filled span. */
export function directionWash(direction: LoadDirection): string {
  return direction === 'up' ? up.wash : direction === 'down' ? down.wash : hold.wash;
}

/**
 * THE STAGE — the ground of the entire app. Lit from above.
 */
export const stage = {
  /**
   * ⛔ THE GROUND IS ABSOLUTE BLACK (founder 2026-08-05): *"the app's background, on the watch and
   * on the phone — take the blackish background to absolute black. I think everything will stand
   * out better that way. Only the app's main background; do not touch anything else."*
   *
   * It was `#131210`, a warm near-black chosen so a raised surface could sit ABOVE it. That still
   * works, and it works harder here: `surface` is a cream wash at 5% and every one of those washes
   * gains contrast against zero that it did not have against a lit ground. Nothing else moves —
   * `stage[1]` is still the card, `stage[2]` is still the rule, and the inks are untouched.
   *
   * ⚠️ Contrast only IMPROVES. `ink2` (#8b8474) was 4.7:1 against the old lightest gradient stop
   * and is 5.3:1 on black, so no legend that passed before can fail now.
   */
  0: '#000000', // stage ground — absolute black
  1: '#1b1914', // raised on stage (a floating dark card)
  2: '#2a2822', // faint rule / higher raised
  ink0: '#f1eee5', // primary on stage
  ink1: '#a8a290', // secondary on stage
  ink2: '#8b8474', // muted on stage
  lift: '#ffffff',
  /**
   * ⚠️ THE POSTER GRADIENT, AND ONLY THE POSTER. The lit-from-above wash is no longer the app's
   * ground — it survives on the two SHARE CARDS, which are pictures of a stage rather than the
   * stage itself. A poster rendered on absolute black has no edge against a phone's own black
   * screenshot, and the founder's ruling was explicitly scoped to the app's background.
   */
  gradient: ['#1b1914', '#131210', '#0f0e0c'] as const,
  gradientLocations: [0, 0.38, 1] as const,
} as const;

/* ============================================================================
 * SEMANTIC COLORS — what components reference. Names preserved; values inverted
 * so the whole app flips to the lit-stage theme while continuing to compile.
 * ==========================================================================*/
export const color = {
  // Backgrounds / surfaces — the stage is the ground now.
  bg: stage[0],
  surface: 'rgba(241,238,229,0.05)', // raised on stage (a card floating on the dark)
  surface2: 'rgba(241,238,229,0.10)', // segmented track / higher raise
  surface3: 'rgba(241,238,229,0.14)', // sunken well inside a raised surface
  lift: stage.lift,

  // Opaque PAPER — cards & pills only. Dark ink lives on these.
  paper: paper[0],
  paperRaised: paper[1],
  onPaper: ink[0],
  onPaperSecondary: ink[1],
  onPaperMuted: ink[2],

  // Text — cream at descending strength on the stage.
  textPrimary: cream[0],
  textSecondary: cream[1],
  textMuted: cream[2],
  textTertiary: cream[2],
  textDim: cream[1], // coaching line / captions
  textDisabled: 'rgba(241,238,229,0.35)',

  // Lines / chrome
  border: line[0],
  borderStrong: line[1],
  borderControl: line[2],
  tabInactive: cream[2],

  // Subtle fills (tracks, wells, pills)
  fillSubtle: 'rgba(241,238,229,0.05)',
  fillSubtleStrong: 'rgba(241,238,229,0.10)',

  // ---- the accent: MOSS ----
  accent: signal[0], // lit moss on the stage
  accentDeep: signal[1], // deep moss on paper
  accentHover: signal[1],
  accentText: signal[0],
  accentWash: signal.wash,
  /** The primary button's label — INK on cream now. */
  onAccent: stage[0],
  /** The primary button's ground — CREAM. */
  accentFill: signal.fill,
  accentFillPressed: signal.fillPressed,

  // Semantic load states
  up: up.stage,
  upWash: up.wash,
  down: down.stage,
  downWash: down.wash,
  hold: cream[2],

  // PAIN + DESTRUCTION — clay, never the direction blue (see `alert`).
  alert: alert.stage,
  alertWash: alert.wash,

  // ---- legacy aliases ----
  accentBlue: cream[0], // links are weight, not hue
  accentGreen: signal[0], // live timer / rest ring / progress → moss
  danger: alert.stage, // destructive — a confirm she cannot undo is not a load coming down

  // DONE chip
  doneText: cream[2],
  doneBorder: line[1],

  // Brand mark — moss dot
  logoGradStart: signal[0],
  logoGradEnd: signal[1],

  // ---- backward-compat aliases ----
  bgBase: stage[0],
  bgSurface: 'rgba(241,238,229,0.05)',
  borderSubtle: line[0],
  onSurface: cream[0],
} as const;

/* ============================================================================
 * TYPOGRAPHY — three voices.
 * ==========================================================================*/

/**
 * Font families (loaded via expo-font in app entry). Each weight is its own file,
 * so callers must set `fontFamily` — `fontWeight` alone cannot select the file.
 *
 * MONO CARRIES FIGURES, NEVER WORDS — IBM Plex Mono has no Hebrew glyphs, so any
 * translated string routed through it would fall back mid-line. Digits, ×, :, /,
 * kg, lb only. Enforced by `__tests__/laws/monoCarriesNoWords.test.ts`.
 */
export const font = {
  // Assistant — the interface voice.
  sans: 'Assistant',
  sansMedium: 'Assistant-Medium',
  sansSemibold: 'Assistant-SemiBold',
  sansBold: 'Assistant-Bold',
  // Frank Ruhl Libre — the coach's serif voice.
  serif: 'FrankRuhlLibre',
  serifMedium: 'FrankRuhlLibre-Medium',
  serifBold: 'FrankRuhlLibre-Bold',
  // IBM Plex Mono — every fact.
  mono: 'IBMPlexMono',
  monoMedium: 'IBMPlexMono-Medium',
  monoSemibold: 'IBMPlexMono-SemiBold',
} as const;

/**
 * Size scale (px).
 * 2xs 13 · xs 14 · sm 15 · base 16 · md 18 · lg 20 · xl 24 · 2xl 30 · 3xl 38 ·
 * 4xl 44 · 5xl 64 · data 84.
 *
 * ════ THE FLOOR IS 13, AND IT IS A GYM FLOOR (founder 2026-07-28) ════
 *
 * "There is text here so small nobody notices it — let alone mid-workout." The bottom four rungs
 * were 11 / 12 / 13 / 15, sizes chosen while looking at a screen held still, at a desk, in good
 * light. None of that describes the room this app is used in: the phone is on the floor or propped
 * on a rack, she is two paces away, her eyes are moving and her heart is at 150. Eleven points is
 * decoration there, not information.
 *
 * So the small end moves up and the large end does not — the hierarchy is unchanged, the bottom of
 * it is simply legible now. `2xs` is the mono eyebrow, which is the smallest thing the product is
 * allowed to say, and 13 is where it stops being a whisper.
 */
export const textScale = {
  '2xs': 13,
  xs: 14,
  sm: 15,
  base: 16,
  md: 18,
  lg: 20,
  xl: 24,
  '2xl': 30,
  '3xl': 38,
  '4xl': 44,
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
  display: -0.01, // em — serif headline (Frank Ruhl Libre, tight)
  tight: -0.012,
  normal: 0,
  wide: 0.04,
  legend: 0.16, // uppercase mono legends/eyebrows
};

/**
 * Type tiers — preserve the prior export shape. `mono` measures (loads, reps,
 * timers, eyebrows); `serif` is the coach's headline voice; the rest are Assistant.
 */
export const type = {
  hero: { size: textScale.data, lineHeight: textScale.data, weight: weight.regular, mono: true }, // live load
  display: { size: 76, lineHeight: 76, weight: weight.regular, mono: true }, // big timers / load
  titleXL: { size: textScale['4xl'], lineHeight: 46, weight: weight.regular, serif: true }, // 44 — coach headline
  titleL: { size: textScale['2xl'], lineHeight: 36, weight: weight.regular, serif: true }, // 30 — section headline
  titleM: { size: textScale.xl, lineHeight: 30, weight: weight.medium, serif: true }, // 24 — screen headline
  bodyL: { size: textScale.md, lineHeight: 27, weight: weight.regular }, // 18 — emphasized body
  bodyM: { size: textScale.base, lineHeight: 24, weight: weight.regular }, // 16 — body / default UI
  caption: { size: textScale.sm, lineHeight: 21, weight: weight.regular }, // 15 — secondary UI
  micro: { size: textScale.xs, lineHeight: 19, weight: weight.regular }, // 14 — legend / caption
  legend: { size: textScale['2xs'], lineHeight: 17, weight: weight.medium, mono: true }, // 13 — mono eyebrow
  unit: { size: textScale.base, lineHeight: 17, weight: weight.medium, mono: true }, // unit beside a value
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
  gutter: 26, // screen side padding (v7 phone gutter)
  sheetGutter: 26,
  stackTight: 8,
  stack: 16,
  stackLoose: 32,
  section: 44,
} as const;

/** Control geometry. */
export const control = {
  hSm: 34,
  h: 46,
  hLg: 58, // v7 primary action height
  padX: 20,
} as const;

export const layout = {
  screenMargin: 26,
  referenceWidth: 393,
  referenceHeight: 852,
} as const;

/* ============================================================================
 * RADIUS — v7 is softer than the light era: pills, 19px buttons, 22-24px cards.
 * Plain borderRadius only (no continuous-curve smoothing — RN has none natively).
 * ==========================================================================*/
export const radius = {
  xs: 4,
  sm: 8,
  md: 12, // default control
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 999,
  // semantic
  button: 19, // v7 primary/secondary buttons
  control: 14, // segmented cells / inner controls
  card: 22, // paper card / sheet card
  sheet: 24,
  done: 8,
  pill: 999,
} as const;

export const border = { width: 1, widthStrong: 1.5 } as const;
export const hairline = { width: 1, color: color.border } as const;

/* ============================================================================
 * ELEVATION — deep, warm, low-alpha. On the dark stage a lift is felt, not seen.
 * ==========================================================================*/
export const shadow = {
  md: {
    shadowColor: 'rgb(11,10,8)',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  lg: {
    shadowColor: 'rgb(11,10,8)',
    shadowOpacity: 0.45,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  stage: {
    shadowColor: 'rgb(5,4,3)',
    shadowOpacity: 0.55,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 24 },
    elevation: 18,
  },
} as const;

/* ============================================================================
 * BUTTONS — the primary action is CREAM: light standing on the dark stage.
 * ==========================================================================*/
export const button = {
  primary: {
    height: control.hLg, // 58
    radius: radius.button, // 19
    bg: signal.fill, // CREAM
    fg: stage[0], // ink on cream
    pressedBg: signal.fillPressed,
    fontSize: textScale.md, // 17
    fontWeight: weight.semibold,
    pressedOpacity: 1, // press settles to 0.98 scale, no opacity dip
  },
  homeCta: {
    height: control.hLg,
    radius: radius.button,
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

/** Press feedback: settles to 0.98 scale and back (the v7 press), never glows. */
export const press = { scale: 0.98, translateY: 0, opacity: 1, durationMs: 120 } as const;

/* ============================================================================
 * MOTION — one physics: the settle. No bounce/overshoot except the dot's land.
 * ==========================================================================*/
export const motion = {
  // The settle — everything eases on this curve.
  easeStandard: [0.22, 1, 0.36, 1] as const,
  easeOut: [0.22, 1, 0.36, 1] as const,
  easeIn: [0.4, 0, 1, 1] as const,
  dur: { instant: 80, 1: 120, 2: 180, 3: 240, 4: 360, 5: 600, land: 900, breath: 4500 },
} as const;

/* ============================================================================
 * Font-feature helpers.
 * ==========================================================================*/
export const trackingPx = (size: number, em: number) => size * em;
export const heroTitle = (size: number, em = tracking.display) => ({
  fontFamily: font.serif,
  letterSpacing: size * em,
  textAlign: 'left',
});
