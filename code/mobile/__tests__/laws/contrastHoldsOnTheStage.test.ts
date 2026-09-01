/**
 * CONTRAST HOLDS ON THE STAGE (v7 Rev 14).
 *
 * v7 puts every screen on one lit dark ground — a top-lit gradient `#1b1914 → #131210 → #0f0e0c`.
 * Light text sits ON that gradient, and the LIGHTEST stop (`#1b1914`, the top) is the worst case for
 * a light foreground: the smaller the gap between text and ground, the lower the contrast. So AA is
 * proven against the lightest ground, not the mid one the token comments were originally measured on.
 *
 * Two laws, both mechanical:
 *
 *  1. Every token that carries TEXT on the stage clears WCAG AA (≥4.5:1) against the lightest ground.
 *     This is what caught the old faint tier `#7a7260` — a comfortable 4.5:1 on `stage[0]` but only
 *     3.7:1 on the top of the gradient. Lifting it to `#8b8474` (Rev 14) restores the margin. Remap a
 *     stage text token to anything darker and this fails.
 *
 *  2. Deep moss `#3e573f` (signal[1]) is BANNED as stage text. It is a paper ink — on the dark stage
 *     it reads ~2.2:1, present in the markup and gone to the eye. The guard asserts it genuinely fails
 *     AA on the stage (so the ban has teeth) AND that no stage text token resolves to it.
 */
// @ts-nocheck

// 

import { cream, signal, stage, color, up, down, hold, alert } from '@/design/tokens';

/** sRGB hex → relative luminance (WCAG 2.x). */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two hex colors (order-independent). */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The worst-case ground for light text: the LIGHTEST stop of the stage gradient (its top). */
const LIGHTEST_GROUND = stage.gradient[0]; // '#1b1914'
const AA = 4.5;

describe('contrast holds on the stage', () => {
  // Every token that renders TEXT on the stage, by its role. If a value here regresses below AA
  // against the lightest ground, a real screen has illegible text.
  const stageText: Record<string, string> = {
    'cream[0] (primary)': cream[0],
    'cream[1] (secondary)': cream[1],
    'cream[2] (muted)': cream[2],
    'cream[3] (faint)': cream[3],
    'color.textPrimary': color.textPrimary,
    'color.textSecondary': color.textSecondary,
    'color.textMuted': color.textMuted,
    'color.textTertiary': color.textTertiary,
    'color.textDim': color.textDim,
    'color.accentText (lit moss label)': color.accentText,
    // ⚠️ `color.tabInactive` AND `color.doneText` LEFT THIS LIST WITH THE TOKENS THEMSELVES
    // (2026-08-18). They were two of nineteen light-era aliases with no caller anywhere in `src/`
    // or `targets/`, and this law was the only thing in the repository still naming them. Both
    // resolved to `cream[2]`, which is asserted three rows above — so nothing stopped being proven.
    // The DIRECTION tones carry text too — "+2.5", "31.5", "HOLDS" — and they were never in this
    // list, so the one palette decision most likely to be made by eye was the one nothing checked.
    // It mattered the moment `down` moved from clay to blue (founder 2026-07-28: an eased load is
    // the engine working, not a failure, and clay beside moss reads as the red half of red/green).
    'up.stage (a load that rose)': up.stage,
    'down.stage (a load that eased)': down.stage,
    'hold.stage (a load that held)': hold.stage,
    // …and the ALERT clay, which carries the words on the pain door (13.1) and the severity
    // grades (13.2). It is a separate token precisely so it can stop following `down` around.
    'alert.stage (pain, and destructive confirms)': alert.stage,
  };

  it.each(Object.entries(stageText))('%s clears AA on the lightest stage ground', (_role, hex) => {
    expect(contrast(hex, LIGHTEST_GROUND)).toBeGreaterThanOrEqual(AA);
  });

  it('deep moss #3e573f fails AA on the stage — this is WHY it is banned as stage text', () => {
    expect(contrast(signal[1], LIGHTEST_GROUND)).toBeLessThan(AA);
  });

  it('no stage text token resolves to deep moss', () => {
    for (const [role, hex] of Object.entries(stageText)) {
      expect(`${role}=${hex.toLowerCase()}`).not.toBe(`${role}=${signal[1].toLowerCase()}`);
    }
  });
});
