/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A MUSCLE THAT IS RESTING IS DRAWN ON HER BODY — NOT ONLY WRITTEN BESIDE IT.
 *
 * ⛔ FOUNDER, 2026-08-22, on the redesign's standing preference: *"העדפה להראות במקום לכתוב כי העין
 * של בן אדם אוהבת לצפות במקום לקרוא."*
 *
 * ── THE DEFECT THIS FILE WAS WRITTEN FOR, AND IT WAS TWO SCREENS WIDE ───────────────────────────
 * A pain report rests a muscle for three, seven or fourteen days. Both surfaces that knew about it
 * stated it in a SENTENCE and neither drew it:
 *
 *   `PainWhere`'s receipt   — the one screen whose entire job is to prove the report was acted on.
 *                             A headline, one line, and **fifty-five percent empty black.**
 *   `BodyMapEdit`          — stated the window only inside the sheet a TAP opens, so the fact the
 *                             whole feature exists to make visible was visible to nobody who did
 *                             not already know which limb to press.
 *
 * `BodyMapEdit`'s own header names the failure it was built for — *"she reports a painful shoulder,
 * the engine rests it and rebuilds her week, and no surface anywhere says so"* — and half of that
 * was still true on the screen written to fix it.
 *
 * ── ⚠️ AND THE COLOUR IS NOT A TASTE ────────────────────────────────────────────────────────────
 * `tokens.alert` is reserved: *"the ONLY thing pain and destruction may draw in"* (founder
 * 2026-07-29, after `down` moved to blue and everything that had borrowed clay FOR ITS CLAY went
 * blue with it — §13.2's severity grades and **the body map's tender halo** among them). This is
 * that halo, back, in the colour that was reserved for it. A resting muscle drawn in moss would say
 * a decision was made; drawn in blue it would say a load came down. It is neither.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { BodyMapFigure } from '@/components/BodyMapFigure';
import { initI18n } from '@/i18n';
import { alert, signal, down } from '@/design/tokens';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];
function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(el);
  });
  mounted.push(r);
  return r;
}
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

/** Every fill and stroke anywhere in the drawn figure. */
function paints(r: ReactTestRenderer): string[] {
  const out: string[] = [];
  const visit = (n: ReactTestInstance): void => {
    for (const k of ['fill', 'stroke'] as const) {
      if (typeof n.props?.[k] === 'string') out.push(n.props[k]);
    }
    n.children.forEach((c) => typeof c !== 'string' && visit(c));
  };
  visit(r.root);
  return out;
}

const figure = (tender: string[]) => (
  <BodyMapFigure face="front" map={{}} tender={tender} selected={null} onSelect={() => {}} height={300} />
);

describe('a resting muscle is drawn', () => {
  it('⛔ wears the clay, and it is the reserved clay', () => {
    const paint = paints(mount(figure(['Chest'])));
    expect(paint).toContain(alert.stage); // the edge that states it
    expect(paint).toContain(alert.wash); // the fill that carries it
  });

  it('⛔ …and a body with nothing resting has no clay on it at all', () => {
    /*
     * The half that makes the first assertion mean something. A palette that always contains the
     * colour proves nothing about whether the colour is being used to SAY anything.
     */
    const paint = paints(mount(figure([])));
    expect(paint).not.toContain(alert.stage);
    expect(paint).not.toContain(alert.wash);
  });

  it('⚠️ never borrows a direction hue — a rested muscle is not a decision and not an eased load', () => {
    /*
     * The exact mistake the 2026-07-29 ruling was written to end, aimed at this drawing: moss says
     * *a decision was made*, blue says *a load came down*, and a muscle resting because she said it
     * hurt is neither of those things.
     */
    const paint = paints(mount(figure(['Chest'])));
    // The tender limb's own paints, isolated by difference from the same body with nothing tender.
    const quiet = new Set(paints(mount(figure([]))));
    const added = paint.filter((c) => !quiet.has(c));
    expect(added.length).toBeGreaterThan(0);
    expect(added).not.toContain(signal[0]);
    expect(added).not.toContain(down.stage);
  });

  it('⛔ the spoken state follows the drawn one', () => {
    /*
     * A limb drawn in clay and announced as "normal" is the screen reader being told a different
     * thing from the eye. Asserted at the source, because the label is assembled from a copy key and
     * a translated string is not a stable thing to match a rendered tree against.
     */
    // Whitespace-insensitive: the law is the BRANCH, not how a formatter chose to wrap it.
    const fig = read('components/BodyMapFigure.tsx').replace(/\s+/g, ' ');
    expect(fig).toContain("isTender(z.muscle) ? tg('pain.stanceResting')");
  });
});

describe('and both surfaces that know about an ease hand it to the body', () => {
  /*
   * ⚠️ BY SOURCE, AND DELIBERATELY CRUDE. The failure was never subtle — the prop simply was not
   * passed — and a law that mounted each screen would need a profile, a store and a live clock to
   * assert a thing that is visible in one line.
   */
  it('⛔ the receipt draws the muscle it just rested', () => {
    const pain = read('screens/pain/PainWhere.tsx');
    expect(pain).toContain('tender={restsTheMuscle(done.severity) ? [done.muscle] : []}');
  });

  it('⛔ the editable map draws every window still standing', () => {
    const edit = read('screens/profile/BodyMapEdit.tsx');
    expect(edit).toContain('tender={activeEases(eases, Date.now()).map((e) => e.muscle)}');
  });

  /**
   * ⚠️ A TWINGE RESTS NOTHING, AND THE DRAWING MUST NOT SAY IT DOES.
   *
   * `painReport` states the rule in as many words — *"a TWINGE is a warning: keep training the
   * muscle, leave the movement that provoked it alone"* — and `restsTheMuscle('twinge')` is false.
   * The receipt already learned this once, in words, on 2026-08-19: she reported a twinge, was told
   * her muscle rests for three days, and met it in her next session. A clay limb would be the same
   * lie in the louder medium.
   */
  it('⛔ …and a twinge paints nothing, because a twinge rests nothing', () => {
    const pain = read('screens/pain/PainWhere.tsx');
    expect(pain).toContain('restsTheMuscle(done.severity) ? [done.muscle] : []');
  });
});
