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
// @ts-nocheck

// 

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

  /**
   * ⛔ …AND A WORD THAT ARRIVES THROUGH A VARIABLE IS STILL A WORD (found 2026-08-13).
   *
   * The sweep above requires the `t(...)` to sit INSIDE the tag. The paywall's price cadence did
   * not: `const cadence = perMonth || !annual ? t('paywall.perMonthShort') : t('paywall.perYearShort')`
   * three lines up, then `<Text style={styles.cadence}>{cadence}</Text>`. Same rendered string, same
   * mono face, invisible to the law — so "/חודש" has been sitting in a face with no Hebrew glyphs
   * on the one screen in the product that asks for money.
   *
   * ⚠️ It is the cheapest possible evasion of a rule and nobody chose it; the variable is there
   * because the value has two branches. So the law follows the identifier: a bare `{x}` in a
   * mono-styled `<Text>` where `x` is declared in the same file from a `t(...)` call.
   */
  it('⛔ no mono-styled <Text> renders a translated string handed to it through a const', () => {
    const violations: string[] = [];
    for (const file of tsxFiles(SRC)) {
      if (file.includes('screens\\dev') || file.includes('screens/dev')) continue;
      const src = readFileSync(file, 'utf8');
      const mono = styleKeysUsing(src, 'mono');
      const sans = styleKeysUsing(src, 'sans');
      if (mono.size === 0) continue;
      const jsx = /<Text[^>]*style=\{([^}]*|\[[^\]]*\])\}[^>]*>([\s\S]*?)<\/Text>/g;
      let j: RegExpExecArray | null;
      while ((j = jsx.exec(src))) {
        const [, styleExpr, body] = j;
        if (/\bt\(/.test(body)) continue; // the direct form — the sweep above owns it
        const bare = body.match(/^\s*\{\s*([A-Za-z_$][\w$]*)\s*\}\s*$/);
        if (!bare) continue;
        // Its declaration, anywhere in the file. A `t(` inside it means this slot draws a word.
        const decl = new RegExp('(?:const|let)\\s+' + bare[1] + '\\s*=([\\s\\S]{0,300}?);', 'm').exec(src);
        if (!decl || !/\bt\(/.test(decl[1])) continue;
        // Same escape hatch as above: a sans key in the style expression is the promise, kept.
        if ([...sans].some((k) => new RegExp('styles\\.' + k + '\\b').test(styleExpr))) continue;
        for (const k of mono) {
          if (!new RegExp('styles\\.' + k + '\\b').test(styleExpr)) continue;
          const line = src.slice(0, j.index).split('\n').length;
          violations.push(`${file.split(/[\\/]/).slice(-2).join('/')}:${line} — styles.${k} ← ${bare[1]}`);
        }
      }
    }
    expect(violations.sort()).toEqual([]);
  });

  /**
   * ⛔ AND THE LAW HAD NEVER BEEN POINTED AT THE WRIST (found in the 2026-08-05 audit).
   *
   * Everything above sweeps `src/`. The watch is Swift, so for its whole life the wrist has drawn
   * `WatchCopy.kg`, `WatchCopy.reps`, `WatchCopy.bodyweight` and "turn crown to set" inside
   * `design: .monospaced` runs — and in Hebrew those are ק"ג, חזרות, גוף and סובב את הכתר.
   *
   * SF Mono has no Hebrew either, so watchOS substitutes the system face for those glyphs: the
   * same mid-line swap this law exists to prevent, on the smallest screen in the product, on every
   * set of every workout. The per-side line was the worst — the figure and its unit were ONE mono
   * string, so the face changed inside a single run.
   *
   * ⚠️ It survived because the law could not see the file. Nobody ever argued for it.
   */
  it('⛔ no translated string is drawn in a monospaced run on the wrist', () => {
    const swift = readFileSync(join(__dirname, '../../targets/watch/WatchScreens.swift'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    /*
     * Every `WatchCopy.*` is a string the phone translates, so any of them inside a `.monospaced`
     * font is a Hebrew word in a face that cannot draw one. The figures beside them are Swift
     * expressions (`fmtW`, `fmtTime`, interpolation) and never `WatchCopy` — which is what makes
     * this a clean line to draw.
     */
    const offenders = swift
      .split('\n')
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /Text\((?:" " \+ )?WatchCopy\.\w+[^)]*\)[^\n]*design: \.monospaced/.test(l))
      .map(([n, l]) => `${n}: ${l.trim().slice(0, 90)}`);
    expect(offenders).toEqual([]);
  });

  it('⚠️ …and a figure is never concatenated INTO a translated string', () => {
    // One `Text` is one run, so the face cannot change at the unit however the string is built.
    const swift = readFileSync(join(__dirname, '../../targets/watch/WatchScreens.swift'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const bad = swift
      .split('\n')
      .filter((l) => /Text\("[^"]*WatchCopy\.\w+[^"]*"\)/.test(l) && /monospaced/.test(l))
      .map((l) => l.trim().slice(0, 90));
    expect(bad).toEqual([]);
  });
});
