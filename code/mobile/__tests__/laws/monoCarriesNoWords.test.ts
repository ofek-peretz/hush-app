/**
 * THE MONO VOICE CARRIES FIGURES, NEVER WORDS — and in Hebrew it is not a matter of taste.
 *
 * Two-voice law (design/tokens.ts): the sans/serif faces for everything the product SAYS, the mono
 * face for everything it MEASURES. That law was being broken quietly, and the app's second language
 * is where it showed: **the mono face contains no Hebrew glyphs at all**.
 *
 * ── ⚠️ MEASURED, 2026-08-05, BECAUSE THE FOUNDER ASKED WHETHER THIS IS EVEN FOUNDED ─────────────
 * It is, and the evidence had drifted: this header said JETBRAINS Mono, and the app ships IBM Plex
 * Mono. Same conclusion, wrong file named — so the cmap of the font actually in `node_modules` was
 * read rather than trusted:
 *
 *   · IBM Plex Mono     930 glyphs — alef, mem, qof, geresh: ALL ABSENT
 *   · Assistant (sans)  431 glyphs — every one present
 *   · Frank Ruhl (serif) 520 glyphs — every one present
 *
 * So a Hebrew word in a mono style is not "slightly off". There is no glyph, and the OS substitutes
 * a face of its own choosing, mid-line.
 *
 * ── ⚠️ AND THE FLIP SIDE, WHICH THIS TEST DOES NOT POLICE ───────────────────────────────────────
 * The same read found `↑` and `↓` present in MONO and absent from BOTH Hebrew faces. A symbol must
 * therefore travel the OTHER way — the load delta's `↑1.5` is mono for exactly that reason, and
 * moving it to sans "for consistency" would tofu it. Every arrow in the app was checked and every
 * one is mono today; there is no test for it because a rule with no violations and no obvious way
 * to acquire one is a comment, not a law. Every mono-styled string
 * that carried a translated word — "סט 1 מתוך 4", "משקל גוף", "9.5 בכל צד", "קק״ל", the milestone's
 * own date — fell back to whatever face the OS could find, mid-sentence, in an app whose entire
 * claim is that it is precisely made. The founder saw it as "a different font in the middle of the
 * line" and could not have named the cause; there is no reason a person should have to.
 *
 * So the rule is mechanical now: a `<Text>` styled with a mono family may not render a `t(...)`
 * call. Numbers, `×`, `:`, `/`, `kg`, `lb` — figures — are what mono is for. Anything a translator
 * touches goes in the voice that can draw it.
 *
 * (Props are outside this test's reach — Metric's `unit`, Badge's children, LoadDelta's hold label
 * all take translated words through a prop. Those components were moved to sans in the same pass;
 * this guards the far larger surface, the screens.)
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '../../src');

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (entry.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Style keys in this file whose definition names a given family. */
function styleKeysUsing(src: string, family: 'mono' | 'sans'): Set<string> {
  const keys = new Set<string>();
  const re = new RegExp('(\\w+):\\s*\\{[^}]*font\\.' + family + '[^}]*\\}', 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) keys.add(m[1]);
  return keys;
}

describe('the mono voice carries figures, never words', () => {
  it('no mono-styled <Text> renders a translated string (JetBrains Mono has no Hebrew)', () => {
    const violations: string[] = [];
    for (const file of tsxFiles(SRC)) {
      if (file.includes('screens\\dev') || file.includes('screens/dev')) continue; // internal debug surface
      const src = readFileSync(file, 'utf8');
      const mono = styleKeysUsing(src, 'mono');
      const sans = styleKeysUsing(src, 'sans');
      if (mono.size === 0) continue;
      const jsx = /<Text[^>]*style=\{([^}]*|\[[^\]]*\])\}[^>]*>([\s\S]*?)<\/Text>/g;
      let j: RegExpExecArray | null;
      while ((j = jsx.exec(src))) {
        const [, styleExpr, body] = j;
        if (!/\bt\(/.test(body)) continue;
        // A slot that holds a figure MOST of the time and a word in one state (a load that is
        // "bodyweight", a countdown that ends in "GO") is allowed to stay mono — provided it
        // hands the word to a sans style when that state arrives. Seeing a sans key in the same
        // style expression is exactly that promise, kept.
        if ([...sans].some((k) => new RegExp('styles\\.' + k + '\\b').test(styleExpr))) continue;
        for (const k of mono) {
          // Word-boundary: `styles.summaryCount` must not match `styles.summaryCountLabel`.
          if (!new RegExp('styles\\.' + k + '\\b').test(styleExpr)) continue;
          const line = src.slice(0, j.index).split('\n').length;
          violations.push(`${file.split(/[\\/]/).slice(-2).join('/')}:${line} — styles.${k}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
