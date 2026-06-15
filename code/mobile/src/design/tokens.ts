/**
 * Hush design tokens — Production Implementation Spec §8.1 (final, frozen).
 *
 * LAWS ENFORCED HERE:
 *  - Dark mode only, #000000 base. No light theme.
 *  - No red, no green, no accent color ANYWHERE. Meaning comes from type
 *    size/position only (UX Law 9, spec §8.1/§8.9).
 *  - Destructive actions use the identical white button (no danger color).
 *
 * Nothing in the product may introduce a color outside this file.
 */

export const color = {
  // Backgrounds
  bgBase: '#000000', // canvas
  bgSurface: '#111111', // sheets / raised surfaces
  borderSubtle: '#2C2C2E',

  // Text
  textPrimary: '#FFFFFF', // hero, receipts
  textSecondary: '#A1A1AA', // errors, secondary/text actions, empty-state copy
  textTertiary: '#71717A',
  textDim: '#D4D4D8', // active-set exercise name, reason line
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
  // Home CTA is the one exception to height/radius (§4.1, §8.1).
  homeCta: {
    height: 60,
    radius: 18,
  },
  // Secondary / text action: no bg/border/icon/chevron. Min 44pt tap height.
  textAction: {
    color: color.textSecondary, // #A1A1AA
    fontSize: 16,
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
