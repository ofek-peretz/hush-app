/**
 * Motion tokens — spec §8.2 (final). Plus the Reduced Motion contract (§8.2 UX).
 *
 * Motion philosophy (UX §7): motion is opacity and calm, never spectacle.
 * No bounce, scale, glow, or spring on CONTENT. Springs are reserved for sheets.
 */

export const motion = {
  standardFadeMs: 150, // in-screen opacity-only (line fades, cross-fades)
  screenFadeMin: 220, // full-screen entries/exits (onboarding, major moments)
  screenFadeMax: 250,
  sheetPresentMs: 250, // iOS spring present
  sheetDismissMin: 150, // fade-down dismiss
  sheetDismissMax: 200,
  successPulse: { from: 1.0, mid: 1.03, to: 1.0, durationMs: 120 }, // timer 00:00 ONLY
  digitRollMs: 200, // per-digit roll on timers
  completeSetSuccessMs: 400, // "[reps] ✓" success state before rest
} as const;

/**
 * Reduced Motion overrides (§8.2). When the system setting is on:
 *  - slides become fades
 *  - Portrait bars appear fully drawn (no sequential fill)
 *  - timer 00:00 pulse suppressed (haptic STILL fires)
 *  - sheet springs become fades
 * No Hush moment depends on motion to be understood.
 */
export const reducedMotion = {
  slidesBecomeFades: true,
  portraitBarsInstant: true,
  suppressTimerPulse: true, // haptic still fires
  sheetSpringBecomesFade: true,
} as const;
