/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * PAIN IS ONLY EVER DRAWN IN CLAY — founder ruling 2026-07-29, enforced end to end 2026-08-24.
 *
 * The ruling, verbatim: *"דברים שיש להם קשר לפציעה או לכמה שכואב לא יכולים להופיע בכחול. כחול זה
 * לעומס שיורד; אדום זה החלק שקשור לכאב."* `tokens.alert` is that clay, and `tokens.ts` states it is
 * *"the ONLY thing pain and destruction may draw in. It is never a direction, and no load ever
 * wears it."*
 *
 * It was written when `down` moved from clay to blue and dragged the pain surfaces with it. The
 * blue leak was fixed. A quieter one survived on the screen the ruling is most about.
 *
 * ── WHAT THE DESIGN AUDIT FOUND ─────────────────────────────────────────────────────────────────
 * `PainWhere` — "איפה כואב?", the screen where she points at what hurts — passed the figure only
 * `selected`, and `selected` in `BodyMapFigure` widens a STROKE. The FILL is read from her training
 * stance, so the muscle she pointed at rendered:
 *
 *   · moss `#A9C49F` if that muscle is one she asked to lead with — the exact fill the product uses
 *     for "a decision made" and for a load going UP, now sitting on a pain report; or
 *   · plain cream if it is not — the same as every muscle she did not point at.
 *
 * Either way the pain answer had no colour of its own. The RECEIPT screen beside it was already
 * correct (`tender={[done.muscle]}` → `alert.wash` + `alert.stage`), so the two halves of one
 * conversation disagreed about what pain looks like.
 *
 * The fix is that pointing IS the report: the pointed muscle is tender from the touch.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('1 · both pain screens mark the muscle tender', () => {
  const painWhere = read('src/screens/pain/PainWhere.tsx');

  it('the screen that ASKS marks the pointed muscle tender', () => {
    expect(painWhere).toMatch(/tender=\{muscle \? \[muscle\] : \[\]\}/);
  });

  it('the screen that ANSWERS still marks the rested muscle tender', () => {
    expect(painWhere).toMatch(/tender=\{restsTheMuscle\(done\.severity\) \? \[done\.muscle\] : \[\]\}/);
  });

  it('every BodyMapFigure on a pain screen is given a tender prop', () => {
    const mounts = painWhere.split('<BodyMapFigure').slice(1);
    expect(mounts.length).toBeGreaterThan(0);
    const withoutTender = mounts.filter((m) => !m.slice(0, m.indexOf('/>')).includes('tender='));
    expect(withoutTender.length).toBe(0);
  });
});

describe('2 · the figure keeps clay for tender and moss for emphasis', () => {
  const figure = read('src/components/BodyMapFigure.tsx');

  it('tender resolves to the alert token, never a literal or the signal', () => {
    const branch = figure.slice(figure.indexOf('if (tender) {'), figure.indexOf('const base ='));
    expect(branch).toContain('alert.wash');
    expect(branch).toContain('alert.stage');
    expect(branch).not.toMatch(/#[Aa]9[Cc]4|signal/);
  });

  it('tender wins over every training stance — a sore lift she leads with is still sore', () => {
    // The tender branch must RETURN before `base` is computed from the stance, or an emphasised
    // muscle would keep its moss and the report would be invisible on exactly the athlete most
    // likely to file one.
    expect(figure.indexOf('if (tender) {')).toBeLessThan(figure.indexOf('const base ='));
    expect(figure.slice(figure.indexOf('if (tender) {'), figure.indexOf('const base ='))).toContain('return');
  });
});

describe('2b · a tender muscle carries no emphasis badge', () => {
  const figure = read('src/components/BodyMapFigure.tsx');

  it('the moss badge is suppressed wherever the muscle is tender', () => {
    expect(figure).toMatch(/stance === 'emphasis' && i === 0 && !isTender\(z\.muscle\)/);
  });

  it('the badge is still the moss dot everywhere else', () => {
    const badge = figure.slice(figure.indexOf('  badge: {'), figure.indexOf('  badge: {') + 200);
    expect(badge).toContain('#A9C49F');
  });
});

describe('3 · no load and no direction ever wears the clay', () => {
  it('the direction tone is moss and blue only', () => {
    const tokens = read('src/design/tokens.ts');
    const up = tokens.slice(tokens.indexOf('export const up ='), tokens.indexOf('export const down ='));
    const down = tokens.slice(tokens.indexOf('export const down ='), tokens.indexOf('export const down =') + 320);
    for (const block of [up, down]) expect(block).not.toContain('alert');
  });
});
