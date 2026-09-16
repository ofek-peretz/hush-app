/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * NO ONBOARDING TITLE ENDS ON A WORD ALONE.
 *
 * ⛔ FOUNDER'S SCREENSHOT, 2026-08-21: **"Connect health / data"** — one word on its own line, under
 * a serif set at 40 pt, as the first thing on the screen. An orphan there does not read as a
 * sentence that wrapped; it reads as a layout that came out wrong, on the third screen of the app.
 *
 * The fix is a typographic rule rather than eleven reworded strings — see `noOrphan`. This holds the
 * rule itself, because the failure it prevents is invisible in every environment a test runs in:
 * nothing under jest has a line width, so a title that orphans looks identical to one that does not
 * until it is on a phone.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { noOrphan } from '@/components/onboarding/OnboardingScaffold';

const NBSP = ' ';
const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'components', 'onboarding', 'OnboardingScaffold.tsx'),
  'utf8',
);

describe('no onboarding title ends on a word alone', () => {
  it('binds the last two words, so the last line can never hold one', () => {
    expect(noOrphan('Connect health data')).toBe(`Connect health${NBSP}data`);
    expect(noOrphan('Anything you’d rather I trained around?')).toBe(
      `Anything you’d rather I trained${NBSP}around?`,
    );
  });

  it('works in Hebrew, where the same orphan is the same defect', () => {
    expect(noOrphan('בשביל מה אתה מתאמן?')).toBe(`בשביל מה אתה${NBSP}מתאמן?`);
  });

  /**
   * ⚠️ TWO WORDS HAVE NOTHING TO FIX, and binding them would force the whole title onto one line —
   * which on a narrow device is a shrink or a clip, both worse than the wrap they replace.
   */
  it('leaves a one- or two-word title exactly as it is', () => {
    expect(noOrphan('Ready')).toBe('Ready');
    expect(noOrphan('About you')).toBe('About you');
  });

  it('binds only the LAST pair — a wider bind breaks worse than the orphan it prevents', () => {
    const out = noOrphan('How much time have you got?');
    expect(out.split(NBSP)).toHaveLength(2);
    expect(out).toBe(`How much time have you${NBSP}got?`);
  });

  /** The rule is only a rule if the title actually goes through it. */
  it('is applied to the title the scaffold draws', () => {
    expect(SRC).toContain('{noOrphan(title)}');
  });
});
