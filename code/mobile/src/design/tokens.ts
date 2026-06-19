/**
 * Hush design tokens — HUSH_BUILD_SPEC §2 (final product spec, 2026-06-18).
 *
 * LAWS ENFORCED HERE:
 *  - Always dark. #000000 true-black base. No light theme.
 *  - Premium Apple finish: tabular figures on numerals, tight tracking on
 *    display type, translucent blurred bars. Typography is the UI.
 *  - Restraint: white is the only "action" fill; `accentBlue` is the lone
 *    interactive link color; `accentGreen` is reserved for live timers
 *    (Dynamic Island / Live Activity); `danger` for destructive only.
 *
 * Nothing in the product may introduce a color outside this file.
 *
 * NOTE (2026-06-18): the earlier "Living Dark · Aurora" violet→cyan accent was
 * superseded by HUSH_BUILD_SPEC. The `accent` export below is retained ONLY so
 * not-yet-migrated screens keep compiling; it is removed as those screens are
 * rebuilt to spec (StartOrb / AuroraBackground are being retired).
 */

import { Dimensions } from 'react-native';

/**
 * Responsive scale (HUSH_BUILD_SPEC §2.4). The prototype + the §2.2 type scale are
 * authored on a 232pt-wide device frame; on a real iPhone every size must scale by
 * `deviceWidth / 232` (≈1.6 on a 375pt phone, capped at 1.7). The app previously
 * used the raw 232-based values, so all type/spacing read ~1.7× too small.
 * `s(n)` scales a prototype pt value to the current device.
 */
const DESIGN_WIDTH = 232;
const _screenW = Dimensions.get('window').width;
const _scaleFactor = Math.min(Math.max(_screenW / DESIGN_WIDTH, 1.3), 1.5);
export const s = (n: number) => Math.round(n * _scaleFactor);
export const scaleFactor = _scaleFactor;

/**
 * MONOCHROME visual system (2026-06-19 founder direction — the "hush_iphone_v1"
 * prototype is now the sole source of truth for visuals). Pure black, white, and
 * white-with-opacity ONLY. No color, no semantic states, no decorative icons.
 * Hierarchy is weight / size / opacity. Token NAMES are kept so existing screens
 * keep compiling; the former blue/green/red accents now all resolve to white.
 */
export const color = {
  // Backgrounds / surfaces
  bg: '#000000', // app background (true black), always
  surface: '#161616', // bottom sheets (Pause, Edit Result, Menu)
  surface2: '#161616', // raised rows / sheet bg (monochrome — was a gray)
  surface3: '#1C1C1C', // cards inside sheets, circular icon buttons

  // Text — white at descending opacity (prototype values)
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.45)', // labels, captions, set counters
  textTertiary: 'rgba(255,255,255,0.28)', // eyebrows, dim context
  textDim: 'rgba(255,255,255,0.5)', // coaching line, cap-bar labels

  // Lines / chrome
  border: 'rgba(255,255,255,0.1)', // hairline dividers / borders
  tabInactive: 'rgba(255,255,255,0.28)', // (tab bar retired; kept for compat)

  // Subtle white fills (slide track, picker pill, Choose-workout pill, step btns)
  fillSubtle: 'rgba(255,255,255,0.12)',
  fillSubtleStrong: 'rgba(255,255,255,0.14)',

  // "Accents" — all monochrome now. White is the only action fill; destructive is
  // bold white, not red (no color even on destructive — matches the reference).
  accentBlue: '#FFFFFF', // actionable links ("Set as next") — white in monochrome
  accentGreen: '#FFFFFF', // live timer / rest ring — white in monochrome
  danger: '#FFFFFF', // destructive ("Delete Account") — bold white, not red

  // DONE chip — monochrome
  doneText: 'rgba(255,255,255,0.5)',
  doneBorder: 'rgba(255,255,255,0.14)',

  // Logo gradient (135°) §9 — kept (brand mark only, off the monochrome screens)
  logoGradStart: '#2D7DD2',
  logoGradEnd: '#185FA5',

  // ---- backward-compat aliases (retired as screens migrate to spec names) ----
  bgBase: '#000000',
  bgSurface: '#161616',
  borderSubtle: 'rgba(255,255,255,0.1)',
} as const;

/**
 * Accent — the single living color of Hush (Living Dark · Aurora). A violet→cyan
 * gradient. Used ONLY for: the aurora glow behind Home content, the Start ring,
 * and the session label. Restraint is the premium — one accent, nowhere else.
 */
export const accent = {
  start: '#7C5CFF', // violet
  end: '#22D3EE', // cyan
  text: '#9D8CFF', // legible accent for small labels on pure black
} as const;

/**
 * Type scale (§8.1). Sizes in pt. Line-height = size + 4 for display/title tiers.
 * Sentence case everywhere. Letter-spacing 0.
 */
export const type = {
  hero: { size: 92, lineHeight: 92, weight: '700' as const }, // hero weight number
  display: { size: 72, lineHeight: 76, weight: '600' as const, tabular: true }, // timers
  titleXL: { size: 48, lineHeight: 52, weight: '700' as const }, // workout name
  titleL: { size: 32, lineHeight: 36, weight: '600' as const },
  titleM: { size: 28, lineHeight: 32, weight: '500' as const },
  bodyL: { size: 18, lineHeight: 24, weight: '400' as const },
  bodyM: { size: 16, lineHeight: 22, weight: '400' as const },
  caption: { size: 14, lineHeight: 18, weight: '400' as const },
  micro: { size: 13, lineHeight: 16, weight: '400' as const },
  unit: { size: 16, lineHeight: 16, weight: '400' as const }, // "kg/lb" on hero
} as const;

/** Layout constants (§8.1). */
export const layout = {
  screenMargin: 24, // One Button: 100% width within 24px margins
  referenceWidth: 393, // iPhone 16 Pro reference
  referenceHeight: 852,
} as const;

/**
 * Button specs (§8.1). The "One Button" is the only primary button.
 * Forbidden forever: scale, bounce, glow, shadow, color variants.
 */
export const button = {
  primary: {
    height: 64,
    radius: 16,
    bg: color.textPrimary, // #FFFFFF
    fg: color.bgBase, // #000000
    fontSize: 18,
    fontWeight: '500' as const,
    pressedOpacity: 0.95, // pressed -> 95% opacity, 150ms linear
  },
  // Home CTA (Screen 01, canonical): 64px / 16px radius, 17px Semibold label.
  homeCta: {
    height: 64,
    radius: 16,
    fontSize: 17,
    fontWeight: '600' as const,
  },
  // Secondary / text action: no bg/border/icon/chevron. Min 44pt tap height.
  textAction: {
    color: color.textSecondary, // #A1A1AA
    fontSize: s(16),
    fontWeight: '500' as const,
    minTapHeight: 44,
  },
} as const;

/** Press feedback: background -> 95% opacity, 150ms linear. No scale/bounce/glow/shadow. */
export const press = {
  opacity: 0.95,
  durationMs: 150,
} as const;

/**
 * Dynamic Type bounds (spec §8.1). All text scales with the system setting, but
 * the largest elements (hero weight, timers, workout name) scale WITHIN bounds
 * that preserve their status as the largest thing on screen. Smaller text may
 * scale more freely because it reflows vertically and never truncates a decision.
 */
export const a11y = {
  heroMaxScale: 1.4, // 92px hero
  displayMaxScale: 1.4, // 72px timers
  titleMaxScale: 1.5, // 48/32px titles, workout name
  bodyMaxScale: 1.8, // body/caption reflow freely
} as const;

/**
 * Spacing & radii — HUSH_BUILD_SPEC §2.3.
 * `gutter` is the standard 18pt screen horizontal padding (some sheets use 16).
 */
export const space = {
  gutter: Math.round(18 * _scaleFactor), // standard screen horizontal padding (§2.3), scaled to device
  sheetGutter: Math.round(16 * _scaleFactor), // some sheets
} as const;

export const radius = {
  card: 14, // buttons / cards
  sheet: 24, // bottom sheets (top corners only)
  done: 10, // DONE chip
  pill: 20, // small segmented pills
  full: 999, // circular icon buttons / knob
} as const;

export const hairline = { width: 0.5, color: color.border } as const;

/**
 * Translucent tab bar (§2.3): rgba(10,10,10,0.72) + backdrop blur 20pt,
 * top border 0.5pt rgba(255,255,255,0.08), height 62pt above safe area.
 */
export const tabBar = {
  height: 62,
  bg: 'rgba(10,10,10,0.72)',
  blur: 20,
  topBorder: 'rgba(255,255,255,0.08)',
} as const;

/**
 * Font-feature helpers (§2.2). RN equivalents of the spec's CSS modifiers.
 *  - `tnum` → tabular figures (no width jitter on timers/counts/weights).
 *  - `heroNum` → tabular + tight tracking for large numerals.
 *  - `heroTitle` → tight tracking for display headings.
 * `tracking(size, em)` converts an em tracking value to RN letterSpacing points.
 */

type FontVariant = NonNullable<import('react-native').TextStyle['fontVariant']>;
const TABULAR: FontVariant = ['tabular-nums'];
export const tnum = { fontVariant: TABULAR };
export const tracking = (size: number, em: number) => size * em;
export const heroNum = (size: number, em = -0.03) => ({
  fontVariant: TABULAR,
  letterSpacing: size * em,
});
export const heroTitle = (size: number, em = -0.02) => ({
  letterSpacing: size * em,
});
