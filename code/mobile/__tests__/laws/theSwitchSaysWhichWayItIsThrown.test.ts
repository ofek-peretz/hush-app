/**
 * ⛔ A SWITCH SAYS WHICH WAY IT IS THROWN — BY ITS KNOB, AND IN BOTH DIRECTIONS. (2026-09-18)
 *
 * Found on the coach track's consent screen, which is the one screen in the product whose entire
 * job is telling her exactly what leaves her phone — and whose two most consequential controls
 * could not be read as on or off.
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────────────────────────────
 * `Switch` drew its ON knob as `rgba(241,238,229,0.05)` — five per cent of near-white, composited
 * over `signal[0]` (#a9c49f). That resolves to #aac5a1: **1.01:1 against its own track.** Every ON
 * switch in the product was one solid moss capsule with no knob in it, so the control's state was
 * carried entirely by HUE. The design's own intent, written in its header, is that the knob is a
 * *"gap punched through"* the mark — and a hole shows what is BEHIND, which on this app is the
 * stage. `color.bg` is that, by name, at 15.3:1.
 *
 * And the knob's TRAVEL is the other half of the same sentence. `transform` is the one style RN's
 * RTL never mirrors (see `the-ltr-island-lesson`), so a knob translated `+travel` slid toward the
 * START edge in Hebrew: ON and OFF drawn in the place a Hebrew reader reads OFF.
 *
 * ── THE LAW ────────────────────────────────────────────────────────────────────────────────────
 * The ON knob may not be a translucent film (its contrast against the moss track is then whatever
 * the film's alpha leaves, which is nothing), the travel must be signed by the `bidi.rtl` latch,
 * and the control must carry a hit target the 46 × 28 drawing does not.
 */
// @ts-nocheck

//

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../../src/components/ds/Switch.tsx'), 'utf8');

describe('the switch says which way it is thrown', () => {
  it('⛔ the ON knob is an opaque hole, never a translucent film over the mark', () => {
    const knobOn = /knobOn:\s*\{([^}]*)\}/.exec(SRC);
    expect(knobOn).toBeTruthy();
    // No `rgba(...)` at all: an alpha under ~0.5 on a LIGHT track is invisible, and the one that
    // shipped was 0.05. The hole is a named colour — the ground the mark sits on.
    expect(knobOn[1]).not.toMatch(/rgba\s*\(/i);
    expect(knobOn[1]).toMatch(/color\.bg/);
  });

  it('⛔ the travel is mirrored by the direction latch — RN never mirrors a transform', () => {
    expect(SRC).toMatch(/import\s*\{\s*rtl\s*\}\s*from\s*'@\/i18n\/bidi'/);
    // The signed travel, and nothing else may compute it.
    expect(SRC).toMatch(/const\s+travel\s*=\s*\(g\.w\s*-\s*g\.knob\s*-\s*PAD\s*\*\s*2\)\s*\*\s*\(rtl\s*\?\s*-1\s*:\s*1\)/);
  });

  it('⛔ a 28-point drawing does not get to be a 28-point finger', () => {
    expect(SRC).toMatch(/hitSlop=\{\{[^}]*top:\s*\d+/);
  });

  it('the two states never share a track colour', () => {
    const off = /trackOff:\s*\{([^}]*)\}/.exec(SRC)[1];
    const on = /trackOn:\s*\{([^}]*)\}/.exec(SRC)[1];
    expect(off).not.toEqual(on);
    expect(on).toMatch(/color\.accent/);
  });
});
