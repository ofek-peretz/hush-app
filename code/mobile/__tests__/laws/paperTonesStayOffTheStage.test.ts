/**
 * A LOAD TONE ON THE STAGE TAKES THE `.stage` SIBLING — NEVER THE PAPER `[0]`.
 *
 * v7 (All Dark · One Lit Stage) inverted the app onto a warm near-black ground, but the semantic
 * load tokens keep TWO variants each, because a rise/fall must read on BOTH surfaces:
 *
 *   up   = { 0: '#3e573f' (moss on PAPER),  stage: '#a9c49f' (lit moss on the STAGE) }
 *   down = { 0: '#9b5d45' (clay on PAPER),  stage: '#d08064' (lit clay on the STAGE) }
 *
 * The `[0]` variants are the deep paper tones — near-invisible on the dark stage. The bug this guards
 * is a paper tone leaking onto a dark screen: a Δ, a chip dot, a "SAVED" mark drawn in `up[0]` on the
 * stage is there in the markup and effectively gone to the eye. Every stage surface must reach for the
 * `.stage` sibling.
 *
 * The rule is mechanical: no source file may name `up[0]` / `down[0]` in real code — comments are
 * stripped first — EXCEPT the handful of components that genuinely draw on an opaque PAPER card, which
 * are named in `PAPER_SURFACES`. A new stage screen that reaches for the paper tone fails here.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '../../src');

/** Components that draw the tone on an opaque PAPER card (paper[…] ground) — the `[0]` variant is
 *  correct there, so they are exempt. Keep this list tiny and justified. */
const PAPER_SURFACES = new Set<string>([
  'FormMedia.tsx', // the form-media frame is a paper card; its "LOOPING" chip dot is paper moss.
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Remove block and line comments so a token named only in prose never counts as usage. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* … */
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // // … (the `[^:]` guard spares "https://")
}

describe('paper load-tones stay off the dark stage', () => {
  it('no real code names up[0] / down[0] outside an opaque-paper surface', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const base = file.split(/[\\/]/).pop()!;
      if (PAPER_SURFACES.has(base)) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      const re = /\b(up|down)\[0\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        const line = code.slice(0, m.index).split('\n').length;
        violations.push(`${file.split(/[\\/]/).slice(-2).join('/')}:${line} — ${m[0]} (use ${m[1]}.stage on the stage)`);
      }
    }
    expect(violations).toEqual([]);
  });
});
