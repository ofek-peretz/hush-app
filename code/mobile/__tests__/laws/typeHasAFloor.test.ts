/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * NOTHING IN THIS PRODUCT IS SET SMALLER THAN THE FLOOR — ON EITHER SURFACE.
 *
 * ⛔ FOUNDER, 2026-08-04 and again 2026-08-05, after the fourth screenshot of the same complaint:
 *
 *   > *"Again the cardio screen for the thousandth time — I asked you to make the type bigger and
 *   > you are not listening to me. I want to issue a law of minimum type size across the whole app
 *   > because it cannot go on like this."*
 *   > *"I mean on the phone AND on the watch… make sure it holds for Hebrew as well as English."*
 *
 * He has asked four times. It came back four times. **A preference I keep agreeing to and keep
 * breaking is not a preference, it is an untested claim** — so it stops being something I promise
 * and becomes something a machine reads off the source.
 *
 * ── WHY THE SCALE WAS NOT ENOUGH ────────────────────────────────────────────────────────────────
 * `textScale` has had a floor of 13 since 2026-07-28 and the app still shipped 8.5 pt text. The
 * scale is a suggestion; a screen writes `fontSize: 9.5` and nothing objects. Every violation found
 * on the first run of this test was a raw number, never a scale rung.
 *
 * ── THE TWO FLOORS, AND WHY THEY DIFFER ─────────────────────────────────────────────────────────
 *   PHONE  13 pt of body, 11 pt for an uppercase tracked legend.
 *   WRIST  12 pt of body, 11 pt for a legend.
 *
 * A legend is allowed lower because it is three or four uppercase words at .16 em of tracking —
 * uppercase has no descenders and tracking buys back most of what the size costs — and because
 * 13 pt uppercase legends WRAP in Hebrew, where the words are longer. **A wrapped word is less
 * readable than a whole smaller one**, which is the trade this exemption buys and the reason it is
 * narrow rather than generous.
 *
 * ⚠️ THE WRIST FLOOR IS 12, NOT 13. On a 41 mm case four 13 pt figures do not fit one row and the
 * layout truncates. Truncation is the failure this law exists to prevent, so raising the number
 * past what the canvas holds would defeat it.
 *
 * ── WHAT THIS CANNOT SEE ────────────────────────────────────────────────────────────────────────
 * ⚠️ It reads DECLARED sizes. It cannot see wrapping, clipping, or a Hebrew string that is twice
 * the width of its English key at the same size — that is what the gallery's Hebrew pass is for
 * (`noGlyphIsClipped`). This law makes the floor true; that one makes it survive translation.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { textScale } from '@/design/tokens';

const SRC = join(__dirname, '../../src');
const WATCH = join(__dirname, '../../targets/watch');

/** The phone: body type, and the uppercase tracked legend that may go lower (see the header). */
export const PHONE_FLOOR = 13;
export const PHONE_LEGEND_FLOOR = 11;
/** The wrist: one point lower on both, because the canvas is one third the width. */
export const WRIST_FLOOR = 12;
export const WRIST_LEGEND_FLOOR = 11;

function files(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) files(p, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(p);
  }
  return out;
}

/** Comments are prose. A size named in a note about a size is not a size that renders. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const rel = (p: string) => p.split(/[\\/]/).slice(-2).join('/');

/**
 * Sizes that are not TYPE. A stroke width, an icon box, a border radius and a dot's diameter are
 * all numbers in points and none of them is read. Only the properties that set type are swept.
 */
describe('type has a floor, and it is measured', () => {
  it('the phone sets no type below the floor', () => {
    const violations: string[] = [];
    for (const file of files(SRC, ['.ts', '.tsx'])) {
      const code = stripComments(readFileSync(file, 'utf8'));

      // `fontSize: 9.5` — a style, wherever it is declared.
      for (const m of code.matchAll(/fontSize:\s*([0-9]+(?:\.[0-9]+)?)/g)) {
        const px = Number(m[1]);
        if (px < PHONE_FLOOR) violations.push(`${rel(file)} — fontSize: ${px}`);
      }
      // `<Legend size={10.5}>` — the legend's own prop, which bypasses the style sweep entirely.
      for (const m of code.matchAll(/\bsize=\{([0-9]+(?:\.[0-9]+)?)\}/g)) {
        const px = Number(m[1]);
        if (px < PHONE_LEGEND_FLOOR) violations.push(`${rel(file)} — size={${px}}`);
      }
    }
    expect(violations.sort()).toEqual([]);
  });

  it('the wrist sets no type below the floor', () => {
    const violations: string[] = [];
    for (const file of files(WATCH, ['.swift'])) {
      const code = stripComments(readFileSync(file, 'utf8'));

      // `.font(.system(size: 9.5, …))` — and the same inside `Fit.s(…)`, which SCALES UP from the
      // smallest case, so the number written is the number the 40 mm case renders.
      for (const m of code.matchAll(/\.system\(size:\s*(?:Fit\.s\()?\s*([0-9]+(?:\.[0-9]+)?)/g)) {
        const px = Number(m[1]);
        if (px < WRIST_FLOOR) violations.push(`${rel(file)} — size: ${px}`);
      }
      // `Legend("…", size: 11)` — the wrist's own legend view, held to the legend floor for the
      // same reason the phone's is: uppercase, tracked, and it wraps in Hebrew before it shrinks.
      for (const m of code.matchAll(/\bLegend\([^\n]*?size:\s*([0-9]+(?:\.[0-9]+)?)/g)) {
        const px = Number(m[1]);
        if (px < WRIST_LEGEND_FLOOR) violations.push(`${rel(file)} — Legend size: ${px}`);
      }
      // `Wrist.legend` and any other declared type constant.
      for (const m of code.matchAll(/static let (legend|label|body|figure)\w*:\s*CGFloat\s*=\s*([0-9.]+)/g)) {
        const px = Number(m[2]);
        // A `label` is a legend by another name — uppercase, tracked, two words.
        const floor = m[1] === 'legend' || m[1] === 'label' ? WRIST_LEGEND_FLOOR : WRIST_FLOOR;
        if (px < floor) violations.push(`${rel(file)} — ${m[1]} = ${px}`);
      }
    }
    expect(violations.sort()).toEqual([]);
  });

  /**
   * ⚠️ THE FLOOR IS ONLY A FLOOR IF THE SCALE OBEYS IT. `textScale['2xs']` is the smallest rung a
   * screen can reach for by name, and if it ever drops below the floor every call site becomes a
   * violation the sweep above cannot see — because a rung is not a literal.
   */
  it('the smallest rung of the scale is not below the floor', () => {
    expect(textScale['2xs']).toBeGreaterThanOrEqual(PHONE_FLOOR);
  });
});
