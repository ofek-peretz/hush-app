/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PRICE IS SAID IN FULL, AND ASKED FOR IN CREAM — design audit, 2026-08-24.
 *
 * Two findings on one screen, and they are the same finding twice: the till is where a product's
 * stated ethics either hold or quietly don't.
 *
 * ── ONE · THE ACT IS CREAM ──────────────────────────────────────────────────────────────────────
 * Every act in Hush is a cream slab — Complete set, Begin, Save, Continue. The subscribe button was
 * moss, and the note defending it was honest when written: the plan card above it used to be paper,
 * and cream under cream is two slabs of the same thing. That card is no longer paper (`plan` sets no
 * background; `planOn` answers a choice by brightening a 1px edge), so the collision it avoided
 * cannot happen — and what was left was a green BUY, which is the visual grammar of conversion
 * optimisation. This product sells against exactly that. The act is cream at the till like anywhere
 * else. If a paper surface ever returns behind the footer, change the surface, not the act.
 *
 * ── TWO · THE YEARLY CHARGE IS NEVER CLIPPED ────────────────────────────────────────────────────
 * The annual card leads with a per-month hero figure ("$5.00 /month") and carries the real charge in
 * the sub-line beneath it. At one line that sub-line truncated — "$59.99 billed once a ye…" — so the
 * card showed a small number loudly and clipped the large one. That is the shape of a dark pattern
 * whether or not it was meant as one, and it is unarguable in a product whose pitch is "easy to
 * cancel, same price on renewal".
 *
 * The rule: the sub-line may wrap, and the price token may never leave the string.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const paywall = read('src/screens/subscription/Paywall.tsx');

describe('1 · the act is cream', () => {
  it('the subscribe button is the primary variant, not the signal', () => {
    const footer = paywall.slice(paywall.indexOf('styles.footer'));
    const button = footer.slice(footer.indexOf('<Button'), footer.indexOf('/>', footer.indexOf('<Button')));
    expect(button).toContain('variant="primary"');
    expect(button).not.toContain('variant="signal"');
  });

  it('nothing on this screen paints an act in moss', () => {
    expect(paywall).not.toMatch(/variant="signal"/);
  });
});

describe('2 · the yearly charge is said in full', () => {
  it('the plan sub-line is allowed to wrap', () => {
    expect(paywall).toMatch(/styles\.planSub\}\s*numberOfLines=\{2\}/);
  });

  it('both languages still carry the price token inside the annual line', () => {
    for (const rel of ['src/i18n/locales/en.json', 'src/i18n/locales/he.json']) {
      const lang = JSON.parse(read(rel));
      expect(lang.paywall.billedOnce).toContain('{{price}}');
    }
  });
});
