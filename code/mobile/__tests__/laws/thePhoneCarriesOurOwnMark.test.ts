// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * THE PHONE CARRIES OUR OWN MARK TOO (2026-10-11)
 *
 * On the wrist the founder read the closing screen's old "range mark" as a dumbbell: *"מה קשור
 * המשקולת הזאת? הסמל שלנו אחר בכלל"* (`theWristCarriesOurOwnMark`). The full sweep of the phone he
 * then asked for found the same drawing in the two most-seen places it had left:
 *
 *   · the Ready screen — the screen that hands her the week — opened on "a moss rule between two
 *     end caps with a dot at its centre";
 *   · the Today tab's icon was "a span between two end ticks with the dot landed at its centre",
 *     on the one control every session passes.
 *
 * Both are Hush's glyph, kept through the 2026-09-16 rename. Both are the horns and the dot now.
 *
 * ⚠️ WHAT IS NOT A LOGO IS LEFT ALONE. The week meter on Today and the rep "caliper" on the set
 * screen are INSTRUMENTS that happen to have end ticks — a rail that measures something. They say
 * nothing about whose app this is, and they stay.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8');
const code = (src: string): string => src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const MASTER = fs.readFileSync(path.join(MOBILE, '..', '..', 'brand', 'logo', 'export', 'ferrox-mark.svg'), 'utf8');
const HORNS = MASTER.match(/<path fill="[^"]+" d="([^"]+)"/)![1];

describe('the Ready screen is signed with the FERROX mark', () => {
  const ready = code(read('src/screens/onboarding/ProgramCreated.tsx'));

  it('the mark at its head is the brand component, not a rule with two caps', () => {
    expect(ready).toContain("import { FerroxMark } from '@/components/FerroxLogo';");
    expect(ready).toContain('<FerroxMark width={46} />');
    expect(ready).not.toContain('StartFinishMark');
    for (const style of ['markBar', 'markCapStart', 'markCapEnd', 'markDot']) expect(ready).not.toContain(style);
  });
});

describe('the Today tab wears the FERROX mark', () => {
  const icon = read('src/components/Icon.tsx');
  const glyph = code(icon).slice(code(icon).indexOf("case 'todayRange':"), code(icon).indexOf("case 'lineChart':"));

  it("it is the brand master's geometry, scaled into the cell — never redrawn", () => {
    expect(glyph).toContain(`d="${HORNS}"`);
    expect(MASTER).toContain('<circle cx="50" cy="64" r="10"');
    expect(glyph).toContain('<Circle cx="50" cy="64" r="10"');
    // The master's box (9.5,16 · 81×59) fitted to 24 points: 81 × 0.2667 = 21.6 wide.
    expect(glyph).toContain('transform="translate(1.2 3.6) scale(0.2667) translate(-9.5 -16)"');
  });

  it('in the one tint the tab bar gives it — horns and dot alike, so it reads active and idle', () => {
    expect(glyph.match(/fill=\{stroke\}/g)).toHaveLength(2);
    expect(glyph.match(/stroke="none"/g)).toHaveLength(2);
    // The old glyph's rule and ticks are gone.
    expect(glyph).not.toContain('M4 12h16M4 8.5v7M20 8.5v7');
  });

  it('…and it is what the Today tab draws', () => {
    expect(read('src/app/HushTabBar.tsx')).toContain("Today: 'todayRange',");
  });
});

describe('the mark is never drawn by hand anywhere else on the phone', () => {
  it('no screen outside the brand component builds a "rule with end caps and a dot" as a logo', () => {
    const screens = ['src/screens/onboarding/ProgramCreated.tsx', 'src/screens/home/HomeView.tsx', 'src/screens/session/WellDone.tsx', 'src/screens/onboarding/Authentication.tsx'];
    for (const f of screens) {
      const src = code(read(f));
      expect({ f, handDrawn: /markCap(Start|End)/.test(src) }).toEqual({ f, handDrawn: false });
    }
  });
});
