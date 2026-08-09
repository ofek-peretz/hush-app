// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';
import { heroType, heroFontSize } from '@/domain/loadPresentation';

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

  it('gives the stage hero a line box taller than its size at every step it can take', () => {
    // Every glyph count the figure can reach, from "5" to a four-decimal absurdity.
    for (const figure of ['5', '37', '100', '37.5', '102.5', '1000.5']) {
      const { fontSize, lineHeight } = heroType(figure);
      expect({ figure, fits: lineHeight >= fontSize }).toEqual({ figure, fits: true });
      expect(fontSize).toBe(heroFontSize(figure)); // one source for the size, still
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
