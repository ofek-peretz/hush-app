/**
 * ════ ⛔ THE ATHLETE IS DRAWN ONE WAY (design audit, 2026-09-29) ════
 *
 * The audit counted three athletes in one product: a thin line figure on Today and the Programme
 * tab, the full figure on the set stage and the rest, and a dark silhouette on cream in the form
 * card. They were one drawing on two palettes. `MOTION_PALETTE` (paper) is dark fills and light
 * hairlines for a CREAM ground; every surface but the form card had gone dark since it was written,
 * so on Today the fills sank into the card and only the hairlines were left — the "line" athlete.
 * The form card was still cream, so there she was ink on paper.
 *
 * `MOTION_PALETTE_STAGE` is the drawing re-cut for the dark ground (near limb brightest, far limb
 * still lit). Every surface that draws her is dark, so every one draws her that way — including
 * the form card, whose well is the stage's black now. A new call that forgets the prop gets the
 * paper ladder by default and would put the "line" athlete straight back; this law is the reason
 * it cannot.
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');
const files = globSync('**/*.tsx', { cwd: SRC, absolute: true }).filter((f) => !rel(f).startsWith('screens/dev/'));

/** Every opening tag of `name`, whole — attributes may span lines. */
function tags(src: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

describe('⛔ the athlete is drawn one way', () => {
  it('every figure and every still in the product is drawn on the stage ladder', () => {
    const paper: string[] = [];
    let seen = 0;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const name of ['MotionFigure', 'MotionThumb']) {
        for (const tag of tags(src, name)) {
          if (/^<\w+\s*$/.test(tag.replace(/>$/, '')) || /function |interface /.test(tag)) continue;
          seen++;
          if (!/\btone="stage"/.test(tag)) paper.push(`${rel(f)}: ${tag.replace(/\s+/g, ' ').slice(0, 120)}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(8); // the scan found the calls, not nothing
    expect(paper).toEqual([]);
  });

  it('the form card’s well is the stage’s black, not paper', () => {
    const src = fs.readFileSync(path.join(SRC, 'components/FormMedia.tsx'), 'utf8');
    const frame = src.slice(src.indexOf('  frame: {'), src.indexOf('},', src.indexOf('  frame: {')));
    expect(frame).toMatch(/backgroundColor: stage\[0\]/);
    expect(frame).not.toMatch(/paper\[/);
  });
});
