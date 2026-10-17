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
 * ⛔ AND HE ASKED A FIFTH TIME ON 2026-08-12, which is when it was raised to 17 — see the floors
 * below. The paragraph above was written when the number was 13, and it was true then in the sense
 * that matters least: the law held, and the type was still too small to read.
 *
 * ── THE TWO FLOORS, AND WHY THEY DIFFER ─────────────────────────────────────────────────────────
 *   PHONE  17, for everything. There is no legend exemption any more — see below.
 *   WRIST  12 pt of body, 11 pt for a legend.
 *
 * ⚠️ THE LEGEND'S LOWER FLOOR IS GONE. It existed on a real argument — uppercase tracked type reads
 * larger than its point size, and long Hebrew legends WRAP at a bigger one — and it was being spent
 * as a licence for 11 pt labels on a phone. The wrapping cost is accepted instead: a legend that
 * takes two lines is legible, and one that takes one line and cannot be read is not.
 *
 * ⚠️ THE WRIST FLOOR IS 12, NOT 17, and the founder drew that line himself: *"אל תשכח שזה מסך של
 * פלאפון"* — the phone is the subject. On a 41 mm case four 17 pt figures do not fit one row and the
 * layout truncates. Truncation is the failure this law exists to prevent, so raising the number past
 * what the canvas holds would defeat it.
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

/*
 * ════ ⛔ THE FLOOR IS 17, AND HE NAMED IT HIMSELF ════
 *
 * FOUNDER, 2026-08-12: *"הכיתוב הקטן ביותר במסך מאוד מאוד קטן. אתה יכול לעשות חוק שתקף לכל המסכים
 * להגדיל אותו? אני אמרתי לך את זה בערך 999 פעמים. בוא נגיד שהגודל הקטן ביותר בכל האפליקציה הוא כמו
 * שכתוב 57.5 ליד הBarbell bench press. יותר קטן מזה פשוט לא רואים — זה בלתי אפשרי, אל תשכח שזה מסך
 * של פלאפון."*
 *
 * The reference he pointed at is `PlanLifts.planFigure`, and it is **17**.
 *
 * ── ⛔ WHY IT KEPT COMING BACK, WHICH IS THE PART WORTH RECORDING ────────────────────────────────
 * He is right that he has said this many times, and the reason it never stuck is that it was always
 * fixed **one screen at a time**, in the screen he happened to be looking at. The sweep that raised
 * this floor found **269 declarations under it across 49 files**. No amount of per-screen diligence
 * closes a gap that size; only a law does.
 *
 * ⚠️ AND THE LEGEND'S SEPARATE, LOWER FLOOR IS GONE. It existed on the argument that uppercase
 * tracked type reads larger than its point size — true, and it was being spent as a licence to set
 * 11px labels on a phone. A legend is text she has to read. There is one floor now.
 *
 * ⚠️ THE WRIST KEEPS ITS OWN, and he said why in the same breath: *"אל תשכח שזה מסך של פלאפון."*
 * The phone is the subject. A watch face is a third the width at arm's length and has its own
 * typography; forcing 17 there would push two words off the screen.
 */
export const PHONE_FLOOR = 17;
export const PHONE_LEGEND_FLOOR = 17;
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
      /*
       * `<Legend size={10.5}>` — the legend's own prop, which bypasses the style sweep entirely.
       *
       * ⛔ SCOPED TO `Legend`, NOT TO ANY `size=` (2026-08-12). The pattern used to match the bare
       * prop name, which was harmless while the floor was 11 — nothing in the product was smaller —
       * and became wrong the moment it rose to 17: **`<Icon size={15}>` is a glyph box, not type.**
       * The sweep that raised the floor caught 38 of them before this was fixed, and an icon grown
       * by a sixth because a law could not tell a picture from a word is a law doing damage.
       */
      /*
       * ⛔ AND IT READS THE WHOLE EXPRESSION, NOT ONLY A BARE NUMBER (2026-08-12).
       *
       * This matched `size={12.5}`. Type escaped it in two ways, and both were found by walking the
       * gallery after the floor was raised rather than by reading code:
       *
       *   · A CONSTANT. `<Legend size={RUN_SMALL_PT}>` — and `RUN_SMALL_PT = 12.5` sat at the foot
       *     of `screens/cardio/Cardio.tsx`. Those constants were introduced so four labels could not
       *     drift apart, which worked; nobody noticed they had also stepped out of this sweep's line
       *     of sight. **So the one screen the founder complained about most — "the cardio screen for
       *     the thousandth time" — kept its small type through every pass of the law written for
       *     it.**
       *   · A TERNARY. `<Legend size={size >= 220 ? 16 : textScale['2xs']}>` in `RestRing`, which is
       *     the word REST in the middle of the rest dial.
       *
       * So every numeric literal inside the expression is checked, and a bare identifier is resolved
       * against the module's own `const NAME = <number>`. An unresolvable identifier is left alone
       * rather than guessed at — `textScale.sm` is a token and the scale has its own assertion.
       */
      /*
       * ⚠️ ONE EXEMPTION, AND IT IS A PICTURE RATHER THAN A SCREEN. `components/share/ShareCard` is
       * authored at 296pt and drawn through `px(n) = round(n * width / 296)` so that ONE component
       * serves both the on-screen preview and the 1080px image she actually shares. Its `10` and
       * `11` are proportions of a poster, not points on a phone — forcing them to 17 would give the
       * exported artwork labels a sixth larger than its own design, on every share, forever.
       *
       * ⚠️ AND THE COST IS REAL AND IS NAMED RATHER THAN WAVED AWAY: `ShareCardModal` previews at
       * `min(300, width - 88)`, so k ≈ 1 and those labels do render at 10–11px on the preview. She
       * is looking at a thumbnail of a poster there, not reading an interface — but if the founder
       * says the preview is too small, the fix is a larger preview, not smaller artwork.
       */
      if (rel(file) === 'share/ShareCard.tsx') continue;

      const consts = new Map<string, number>();
      for (const m of code.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::\s*number\s*)?=\s*([0-9]+(?:\.[0-9]+)?)\s*;/g)) {
        consts.set(m[1], Number(m[2]));
      }
      for (const m of code.matchAll(/<Legend\b[^>]*?\bsize=\{([^}]*)\}/gs)) {
        const expr = m[1];
        const seen: number[] = [];
        for (const lit of expr.matchAll(/(?<![\w.$])([0-9]+(?:\.[0-9]+)?)(?![\w$])/g)) seen.push(Number(lit[1]));
        for (const id of expr.matchAll(/(?<![\w.$'"])([A-Z][A-Z0-9_]{2,})(?![\w$])/g)) {
          const v = consts.get(id[1]);
          if (v != null) seen.push(v);
        }
        for (const px of seen) {
          if (px < PHONE_LEGEND_FLOOR) violations.push(`${rel(file)} — <Legend size={${expr.trim()}}> → ${px}`);
        }
      }
    }
    expect(violations.sort()).toEqual([]);
  });

  it('⛔ …including the one string the whole screen exists to offer — the act', () => {
    /*
     * `components/ds/Button` maps its size names to font sizes in a plain lookup table of numbers.
     * It is consumed as `fontSize: FONT[size]` two functions later, so the sweep above — which reads
     * `fontSize:` and `<Legend size={…}>` — cannot see it, and **`lg`, `card` and `whySheet` sat at
     * 16, 15.5 and 16 through every pass of this law.** The primary act. "Begin Upper B".
     *
     * ⚠️ NAMED EXPLICITLY RATHER THAN GENERALISED. A rule that flagged every number in a `Record`
     * would flag `RADIUS.card: 17` on the next line, which is a corner. A blind spot with a name is
     * worth more than a sweep that cries wolf.
     */
    const src = readFileSync(join(SRC, 'components', 'ds', 'Button.tsx'), 'utf8');
    const line = /const FONT: Record<Size, number> = \{([^}]*)\}/.exec(src);
    expect(line).not.toBeNull();
    const sizes = [...line![1].matchAll(/:\s*([0-9]+(?:\.[0-9]+)?)/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(3); // the literals; the rest come off `textScale`
    expect(sizes.filter((px) => px < PHONE_FLOOR)).toEqual([]);
  });

  it('⛔ …and the segmented control, whose sizes hide inside a GEOMETRY map', () => {
    /*
     * The same blind spot, found by walking the gallery after the sweep rather than by reading code:
     * the You tab still drew **"kg" and "lb" at 14px** — on the screen where she sets the unit every
     * weight in the app is printed in.
     *
     * `SegmentedControl.GEOM` mixes `font` in with `track`, `cell` and `padX` — radii and padding —
     * so there is nothing generic to match on. Two of these tables have now been found this way,
     * which is the argument for the assertion being a NAMED LIST that grows rather than a clever
     * pattern: a font size hiding in a geometry map is a thing this codebase does.
     */
    const src = readFileSync(join(SRC, 'components', 'ds', 'SegmentedControl.tsx'), 'utf8');
    const sizes = [...stripComments(src).matchAll(/\bfont:\s*([0-9]+(?:\.[0-9]+)?)/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(2);
    expect(sizes.filter((px) => px < PHONE_FLOOR)).toEqual([]);
  });

  it('⛔ …and the milestone seal, whose caption size is COMPUTED from the drawing', () => {
    /*
     * The third name on this list, and the first one that is not a table. `MilestoneEmblem` sizes
     * its caption as a proportion of the seal — `Math.max(9, round(size * 0.06))` — and hands it to
     * `fontSize: captionSize` further down. A computed local is invisible to both sweeps above:
     * there is no literal after `fontSize:` and it is not a `<Legend>`.
     *
     * Every call site passes `size={216}`, so the clamp never bound and the unit under the
     * celebration figure rendered at **13pt — 11pt for a longer caption**. The word that says what
     * the number counts, on the screen the product exists to reach.
     *
     * ⚠️ THE CLAMP IS WHAT IS ASSERTED, not the product of the proportion, because the proportion
     * is allowed to grow the caption at a bigger seal. The floor has to hold at the SMALLEST seal
     * the component can be asked to draw, and that is what the clamp is for.
     */
    const src = stripComments(readFileSync(join(SRC, 'components', 'MilestoneEmblem.tsx'), 'utf8'));
    const clamp = /const captionSize = Math\.max\(\s*([0-9]+(?:\.[0-9]+)?)\s*,/.exec(src);
    expect(clamp).not.toBeNull();
    expect(Number(clamp![1])).toBeGreaterThanOrEqual(PHONE_FLOOR);
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
