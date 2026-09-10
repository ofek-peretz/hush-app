// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';
import { heroType, heroFontSize, bandType, bandFontSize } from '@/domain/loadPresentation';

/**
 * ════ NO GLYPH IS CLIPPED (founder, build 36 — A.6: "37 is clipped") ════
 *
 * React Native clips text to its LINE BOX. A style that declares `lineHeight` below its `fontSize`
 * therefore shears the tops off tall glyphs — the mono digits worst of all, and every Hebrew letter
 * with a descender. The web does not clip; it lets the glyph spill out of the box and look fine.
 * That is precisely why this class of bug reached a founder's device: the gallery renders in a
 * browser, so it CANNOT show it. Only a rule over the source can.
 *
 * The stage's hero carried `fontSize: 118` over `lineHeight: 106`, with a comment directly above it
 * stating the very rule it broke. A comment is not a law. This is.
 *
 * A style with no `lineHeight` at all is fine and common — the font's natural line box is always
 * big enough. The law speaks only where a style states BOTH and puts the box under the size.
 */

const SRC = path.join(__dirname, '..', '..', 'src');

/** The tightest `{…}` enclosing `idx` — the object literal the property actually belongs to. */
function innermostBlock(s: string, idx: number): string | null {
  let depth = 0;
  let start = -1;
  for (let i = idx; i >= 0; i--) {
    if (s[i] === '}') depth++;
    else if (s[i] === '{') {
      if (depth === 0) { start = i; break; }
      depth--;
    }
  }
  if (start < 0) return null;
  depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('no glyph is clipped', () => {
  it('never states a lineHeight under its own fontSize', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const s = fs.readFileSync(file, 'utf8');
      const re = /fontSize:\s*([0-9.]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const block = innermostBlock(s, m.index);
        if (!block) continue;
        const lh = /(?:^|[,{\s])lineHeight:\s*([0-9.]+)/.exec(block);
        if (!lh) continue; // no leading stated — the font's own box, always tall enough
        if (parseFloat(lh[1]) < parseFloat(m[1])) {
          const line = s.slice(0, m.index).split('\n').length;
          offenders.push(
            `${path.relative(SRC, file).replace(/\\/g, '/')}:${line} — fontSize ${m[1]} over lineHeight ${lh[1]}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /*
   * ════ ⛔ A FIXED `height` IS A LINE BOX TOO, AND IT WAS THE HALF THIS LAW COULD NOT SEE ════
   *
   * The rule above compares `lineHeight` to `fontSize` INSIDE ONE STYLE OBJECT. Two clips shipped
   * anyway, and both were the same shape: a PARENT with a fixed `height` around a CHILD with a
   * `fontSize`, two objects apart in the same file.
   *
   *   · `ds/Badge`  — `height: 22` around `fontSize: textScale['2xs']`. The ACTIVE / TRIAL /
   *                   EXPIRED pill on Profile and on the Progress report, shearing its own caps.
   *   · `ds/Climb`  — `CALLOUT_H = 22` around `fontSize: 17`. The tapped-day reading on
   *                   Progress · LiftDetail, which is the entire point of tapping a day.
   *
   * Both boxes were drawn when `textScale['2xs']` was 11px. The token became **17** on 2026-08-12
   * and nothing went back for the geometry — which is the general lesson: a raised type floor does
   * not raise the boxes around the type, and only a law goes and looks.
   *
   * ⚠️ THE GENERIC SWEEP IS KEPT NARROW ON PURPOSE. A fixed `height` in the SAME object as a
   * `fontSize` is unambiguous and is closed forever below. A height in a DIFFERENT object cannot be
   * matched to its text mechanically — a 22px `height` may be a dot, a rule or a track — so those
   * are NAMED, exactly as `typeHasAFloor` names `Button.FONT` and `SegmentedControl.GEOM`. This
   * list is meant to grow.
   */

  /** 17pt Assistant occupies ~23px. A box under 1.35 × its type clips the caps. */
  const LINE_BOX = 1.35;

  it('never wraps type in a fixed height smaller than its own line box', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const s = fs.readFileSync(file, 'utf8');
      const re = /fontSize:\s*([0-9.]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const block = innermostBlock(s, m.index);
        if (!block) continue;
        // NESTED objects are flattened away first: `textShadowOffset: { width: 0, height: 0 }` is a
        // shadow, not a box, and reading its `height` reported four styles that are perfectly fine.
        const flat = block.replace(/\{[^{}]*\}/g, '{}');
        const h = /(?:^|[,{\s])height:\s*([0-9.]+)/.exec(flat);
        if (!h) continue;
        const px = parseFloat(h[1]);
        const size = parseFloat(m[1]);
        if (px < size * LINE_BOX) {
          const line = s.slice(0, m.index).split('\n').length;
          offenders.push(`${path.relative(SRC, file).replace(/\\/g, '/')}:${line} — fontSize ${size} in height ${px}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("⛔ …and the two chips whose box lives in a different object from their type", () => {
    const badge = fs.readFileSync(path.join(SRC, 'components', 'ds', 'Badge.tsx'), 'utf8');
    // The box may not be FIXED at all — a chip grows with its type, never the other way round.
    expect(/base:\s*\{[^}]*[\s,{]height:/.test(badge)).toBe(false);
    const badgeMin = /minHeight:\s*LINE\s*\+\s*([0-9.]+)/.exec(badge);
    const badgeLine = /const LINE = ([0-9.]+)/.exec(badge);
    expect(badgeLine).not.toBeNull();
    expect(badgeMin).not.toBeNull();
    // The stated line box clears the floor's type, and the chip clears the line box.
    expect(Number(badgeLine![1])).toBeGreaterThanOrEqual(17 * LINE_BOX);
    expect(Number(badgeLine![1]) + Number(badgeMin![1])).toBeGreaterThanOrEqual(17 * LINE_BOX);

    const climb = fs.readFileSync(path.join(SRC, 'components', 'ds', 'Climb.tsx'), 'utf8');
    const h = /const CALLOUT_H = ([0-9.]+)/.exec(climb);
    const size = /calloutText:\s*\{[^}]*fontSize:\s*([0-9.]+)/.exec(climb);
    expect(h).not.toBeNull();
    expect(size).not.toBeNull();
    expect(Number(h![1])).toBeGreaterThanOrEqual(Number(size![1]) * LINE_BOX);
    // …and the headroom above the trace still clears the box that hangs in it.
    const top = /const TOP = ([0-9.]+)/.exec(climb);
    expect(Number(top![1])).toBeGreaterThanOrEqual(Number(h![1]) * 0.5);
  });

  it('gives the stage hero a line box taller than its size at every step it can take', () => {
    // Every glyph count the figure can reach, from "5" to a four-decimal absurdity.
    for (const figure of ['5', '37', '100', '37.5', '102.5', '1000.5']) {
      const { fontSize, lineHeight } = heroType(figure);
      expect({ figure, fits: lineHeight >= fontSize }).toEqual({ figure, fits: true });
      expect(fontSize).toBe(heroFontSize(figure)); // one source for the size, still
    }
  });

  it('gives the REP BAND a line box taller than its size too — it is the same typeface, one tier down', () => {
    /*
     * ⛔ ADDED 2026-08-22 WITH THE TIER. The band used to borrow `heroType`, so it was covered by the
     * case above for free; the moment it got its own rule it got its own way to clip, and a law that
     * covers one figure and not its neighbour is how every defect in this codebase's audits got in.
     */
    for (const figure of ['8–10', '12–15', '5–5', '100–120']) {
      const { fontSize, lineHeight } = bandType(figure);
      expect({ figure, fits: lineHeight >= fontSize }).toEqual({ figure, fits: true });
      expect(fontSize).toBe(bandFontSize(figure));
    }
  });

  it('keeps the tracking proportional, so the hero reads as one design at every size', () => {
    for (const figure of ['37', '102.5', '1000.5']) {
      const { fontSize, letterSpacing } = heroType(figure);
      const em = letterSpacing / fontSize;
      // -5.6 at 118 was -.047em. A FIXED -5.6 at 80 would have been -.07em — a different typeface.
      // The half-pixel rounding at each step is why this is a tolerance and not an equality.
      expect({ figure, em: Math.abs(em - -0.0475) < 0.002 }).toEqual({ figure, em: true });
      expect(letterSpacing).toBeLessThan(0);
    }
  });
});
