/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WHEEL DRAWS ITS NUMBER WHOLE, OR IT IS NOT DRAWING A NUMBER.
 *
 * This control has now broken the same value four times, in three different ways, and each fix
 * treated the shape of that day's damage:
 *
 *   build 36   "82…"            an 86pt cell against a 42pt numeral   → widened the cell
 *   2026-08-12 "37…"            a flex child squeezed by its row      → added `flexShrink: 0`
 *   2026-08-12 "37…" again      a declared width is not a given one   → made it absolute, dropped
 *                                                                       `numberOfLines`
 *   2026-08-21 a huge lone "5"  absolute WITHOUT left/right is still  → this file
 *              with "41." clipped   laid out against the parent's
 *              above it              width, so it wrapped instead
 *
 * ⚠️ THE FOURTH IS THE WORST OF THEM, and that is why the guard is here rather than in a comment.
 * "41…" tells the athlete a number is cut off. A lone `5` **reads as the value** — at the largest
 * size on the screen, on the one control that writes into her training history. The header beside it
 * said "planned 41.5" and the wheel said 5.
 *
 * ── WHAT IS PINNED, AND WHY IT IS THE SOURCE ────────────────────────────────────────────────────
 * Layout cannot be measured under jest — react-test-renderer has no Yoga pass — so the assertions
 * are about the two properties that, together, make both failure modes impossible:
 *
 *   1. a DEFINITE box, wider than the widest value the engine can prescribe at the active size, so
 *      the text has a real width to centre in and can neither wrap nor be squeezed;
 *   2. `numberOfLines={1}`, so that if anything ever did overflow, it ELLIPSISES — which says a
 *      number was cut — rather than wrapping, which lies about which number it is.
 *
 * Either one alone is what the last three attempts each shipped.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'components', 'ds', 'WheelPicker.tsx'),
  'utf8',
);
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** IBM Plex Mono advances 0.6 em; the widest load the engine prescribes is "137.5" — five glyphs. */
const GLYPH_EM = 0.6;
const WIDEST_GLYPHS = 5;

function num(name: string): Record<string, number> {
  const m = SRC.match(new RegExp(`const ${name} = \\{([^}]*)\\}`));
  if (!m) throw new Error(`${name} not found`);
  return Object.fromEntries(
    [...m[1].matchAll(/(\w+):\s*\[?\s*([\d.]+)/g)].map((x) => [x[1], Number(x[2])]),
  );
}

describe('the wheel never breaks its own number', () => {
  it('gives the active numeral a box wider than the widest value it can be asked to draw', () => {
    const itemW = num('ITEM_W');
    const active = num('NUM_SIZE'); // first entry of each ladder = the active size
    for (const size of Object.keys(itemW)) {
      const box = Math.ceil(active[size] * GLYPH_EM * 6);
      const widest = active[size] * GLYPH_EM * WIDEST_GLYPHS;
      expect({ size, fits: box >= widest }).toEqual({ size, fits: true });
      // …and the box must actually be wider than the CELL, or the insets do nothing.
      expect({ size, wider: box > itemW[size] }).toEqual({ size, wider: true });
    }
  });

  /**
   * ⛔ THE TWO PROPERTIES TOGETHER. A definite width with no `numberOfLines` wraps; a
   * `numberOfLines` with no definite width ellipsises. Every previous fix shipped one of the two.
   */
  it('anchors the numeral horizontally AND caps it at one line', () => {
    const at = code.indexOf('<Text');
    expect(at).toBeGreaterThan(-1);
    const tag = code.slice(at, code.indexOf('>', code.indexOf('style={[', at)));
    expect(tag).toContain('numberOfLines={1}');
    /* ⚠️ The identifier changed on 2026-08-27 (`numInset` → `inset`) because the overhang stopped
       being ONE number for the whole wheel — see the test below. What this law is about is that the
       box is anchored on BOTH edges by a negative inset, whatever it is called. */
    expect(tag).toMatch(/left: -\w+/);
    expect(tag).toMatch(/right: -\w+/);
  });

  /**
   * ⛔ THE OVERHANG IS DERIVED — AND SINCE 2026-08-27, DERIVED PER NUMERAL.
   *
   * This asserted `const numInset = … numCellW(size) … ITEM_W[size]`: one overhang, computed once
   * from the CENTRE numeral's size and handed to every numeral on the wheel. That is what broke
   * `2.2d`: a neighbour drawn at 34 points carried the 78-point numeral's 281-point box and hung it
   * 77 points off the edge of the phone, measured — `135` rendered −77→204 on a 390-point frame.
   *
   * The principle the law was written for is *"derived from the cell and the numeral, never from a
   * constant"*, and it holds harder now: the SIZE is derived too (`centreSize` gives a five-glyph
   * value only as much of the numeral as fits before the neighbour's ink), and the box and the
   * overhang follow the size actually drawn. So the assertion moves up a level — it pins that all
   * three are computed from each other, and that none of them is a literal.
   */
  it('derives the size, the box and the overhang from each other, never from a constant', () => {
    /* The size a five-glyph value gets is computed from the room, not chosen. */
    expect(code).toMatch(/const centreSize = [\s\S]*?ITEM_W|const inkRoom = [\s\S]*?ITEM_W/);
    /* The box follows the numeral ACTUALLY drawn, not the ladder's first entry. */
    expect(code).toMatch(/const numCellW = \(size[^)]*, px: number\)/);
    /* And the overhang follows the box. */
    expect(code).toMatch(/const inset = Math\.max\(0, \(box - itemW\) \/ 2\)/);
    /* Nothing in the trio may be a bare literal. */
    expect(code).not.toMatch(/const numInset = \d/);
  });
});
