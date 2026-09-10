/**
 * AN SVG BACKGROUND IS SIZED ONE WAY, NOT TWO.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * `<Svg style={StyleSheet.absoluteFill} width="100%" height="100%">` gives the element two
 * independent ways to be sized — the absolute style and the percentages — and on the first native
 * frame, before the parent's height has settled, they disagree. The founder photographed exactly
 * that on his very first workout (build 36): the first-four card's gradient drew offset from the
 * card it was meant to fill.
 *
 * **The web harness never showed it**, because there the two happen to resolve to the same box —
 * which is why this is a source law and not a render test. Nothing we can run on this machine
 * would have caught it.
 *
 * `components/ds/Stage` has always had the shape that works, and it is the one to copy:
 *
 *     <View pointerEvents="none" style={StyleSheet.absoluteFill}>
 *       <Svg width="100%" height="100%"> … </Svg>
 *     </View>
 *
 * The wrapper positions; the percentages fill the wrapper. One answer to "how big is this".
 *
 * ── Scope ─────────────────────────────────────────────────────────────────────────────────────
 * Only PERCENTAGE sizing is ambiguous. An `<Svg>` given explicit numbers (`width={width}`) has one
 * answer already and may carry an absolute style — `components/share/ShareCard` does, correctly.
 */
// @ts-nocheck

// 

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';

const SRC = join(__dirname, '../../src');

/**
 * Comments blanked, line count preserved.
 *
 * ⚠️ THIS LAW USED TO READ ITS OWN DOCUMENTATION AND FAIL. The natural thing to write at a call
 * site that gets this right is a comment explaining what the WRONG shape looks like — and the
 * moment anyone did, the literal `<Svg style={absoluteFill} width="100%">` in that prose was
 * indistinguishable from the offence. A law you cannot describe without breaking is a law the next
 * person quietly deletes. Newlines survive so the reported line numbers still point at real code.
 */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

/** Every `<Svg …>` opening tag in the source, with its file and line. */
function svgTags(): { file: string; line: number; tag: string }[] {
  const out: { file: string; line: number; tag: string }[] = [];
  for (const f of globSync('**/*.tsx', { cwd: SRC, absolute: true })) {
    const text = withoutComments(readFileSync(f, 'utf8'));
    for (const m of text.matchAll(/<Svg\b[^>]*>/g)) {
      out.push({
        file: f.replace(/\\/g, '/').split('/src/')[1],
        line: text.slice(0, m.index).split('\n').length,
        tag: m[0],
      });
    }
  }
  return out;
}

describe('an SVG background is sized one way', () => {
  const tags = svgTags();

  it('finds the SVGs at all (the sweep is not silently empty)', () => {
    // A regex that matches nothing would pass the real assertion for free.
    expect(tags.length).toBeGreaterThan(3);
  });

  it('no <Svg> carries BOTH an absolute-fill style and percentage sizing', () => {
    const offenders = tags
      .filter((t) => /absoluteFill/.test(t.tag) && /(width|height)=\{?["']?\d+%/.test(t.tag))
      .map((t) => `${t.file}:${t.line} — ${t.tag.replace(/\s+/g, ' ')}`);
    expect({ svgsSizedTwoWays: offenders }).toEqual({ svgsSizedTwoWays: [] });
  });
});
