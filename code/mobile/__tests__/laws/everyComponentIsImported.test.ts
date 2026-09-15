/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY COMPONENT A SCREEN RENDERS IS ONE IT ACTUALLY IMPORTED.
 *
 * ⛔ FOUNDER, 2026-08-12, after the app was opened in a browser for the first time and did not
 * start: *"תבדוק אם יש עוד ts-nocheck שמסתיר קריסות כאלה."*
 *
 * ── THE THREE BUGS THAT MADE THIS FILE, ALL IN ONE EDIT ────────────────────────────────────────
 * A door was added to `AboutYou` on 2026-08-11 — a `<Pressable>` wrapping a `<Text>`, with a style
 * reading `font.sans` and `color.textMuted`. None of the four names was imported. Each failed
 * differently, and the third is why a law exists rather than a fix:
 *
 *   `font` / `color`  ⛔ threw at MODULE scope. `StyleSheet.create` runs on import and `Root` imports
 *                        every screen eagerly, so THE WHOLE APP died on launch, on every platform.
 *   `Pressable`       ⛔ threw at RENDER — step two of onboarding, invisible until she pressed
 *                        Continue on the front door.
 *   `Text`            ⛔ threw NOTHING. `window.Text` is a DOM constructor, so the name resolved to
 *                        the browser's global and React tried to call it: *"Please use the 'new'
 *                        operator."* On Hermes there is no such global and it is a plain crash.
 *
 * ⚠️ AND NOTHING IN THIS REPOSITORY COULD SEE ANY OF IT. The file carries `@ts-nocheck` — 234 files
 * do — so the typechecker never looked. No test mounts `AboutYou`. 2,639 laws passed, `tsc` was
 * clean, and the product did not start.
 *
 * ⚠️ LIFTING `@ts-nocheck` AND READING `TS2304` FINDS THE FIRST TWO AND NOT THE THIRD, which is the
 * whole reason this is a source law and not a typecheck. `lib.dom` declares `Text`, `Image`,
 * `Option`, `Audio`, `Range`, `Comment`, `Selection`, `Notification` and more — every one of them a
 * React Native component name, and every one of them a name TypeScript considers perfectly defined.
 *
 * So the rule is mechanical and has nothing to do with what is "defined": **a JSX tag must be bound
 * in the file that renders it.**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const SRC = path.resolve(__dirname, '..', '..', 'src');

/** Comments and strings blanked, so a tag named in prose or in a string is not read as a render. */
function code(text: string): string {
  /*
   * ⚠️ ORDER MATTERS, AND GETTING IT WRONG COST TWO FALSE FAILURES. Strings are blanked BEFORE line
   * comments, so a `//` inside a string cannot eat the rest of a line — and line comments are
   * stripped wherever they begin, not only at the margin. With comments stripped only at the start
   * of a line, a trailing `// …` in the exercise catalogue survived and read as live code.
   */
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/\/\/.*$/gm, '');
}

/** Every name this module binds — imported, declared, destructured or taken as a parameter. */
function bound(src: string, body: string): Set<string> {
  const out = new Set<string>(['React']);
  /*
   * ⚠️ `import Svg, { Path } from 'react-native-svg'` IS THE COMMON FORM HERE, and the first cut of
   * this regex required the brace to follow `import` directly — so every SVG primitive in the app
   * came back "never imported". A law's own parser is the first thing to doubt when it reports
   * eighty-four failures in a codebase whose screens demonstrably render.
   */
  for (const m of src.matchAll(/import\s+(?:type\s+)?(?:\w+\s*,\s*)?\{([^}]*)\}\s*from/g))
    for (const part of m[1].split(','))
      out.add(part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()!.trim());
  for (const m of src.matchAll(/import\s+(?:type\s+)?(\w+)\s*(?:,\s*\{[^}]*\}\s*)?from/g)) out.add(m[1]);
  for (const m of src.matchAll(/import\s+\*\s+as\s+(\w+)/g)) out.add(m[1]);
  /*
   * ⚠️ DECLARATIONS ARE READ FROM THE RAW SOURCE, NOT THE BLANKED BODY, and the difference is the
   * last false failure this law produced. A regex comment-stripper cannot see that a `/*` sits
   * inside a string, so it eats from there to the next `*​/` — sometimes hundreds of real lines,
   * declarations included. `<Promise>`, `<SessionScan>`, `<LetterFact>`, `<PlanCard>` and `<AllTime>`
   * were all reported missing while being declared in plain sight further down their own files.
   *
   * Reading declarations from the raw text can only ADD names — the failure mode is a miss, never a
   * false accusation, which is the right way round for a law that gates a commit.
   */
  for (const m of src.matchAll(/(?:const|let|var|function|class)\s+(\w+)/g)) out.add(m[1]);
  for (const m of src.matchAll(/\{([^{}]*)\}\s*(?::[^=]*)?=/g))
    for (const part of m[1].split(',')) out.add(part.trim().split(':').pop()!.split('=')[0].trim());
  return out;
}

describe('⛔ a rendered component is an imported component', () => {
  it('⛔ every JSX tag is bound in the file that renders it', () => {
    const missing: string[] = [];
    for (const file of globSync('**/*.tsx', { cwd: SRC, absolute: true })) {
      const src = fs.readFileSync(file, 'utf8');
      const body = code(src);
      const names = bound(src, body);
      const seen = new Set<string>();
      /*
       * Capitalised tags only — lowercase ones are host elements, not components.
       *
       * ⚠️ AND NOT A GENERIC. `useState<CompleteResult>(…)` is not a render, and reading it as one
       * made this law report every typed hook in the app. A type argument always follows an
       * IDENTIFIER; a JSX tag never does — but it very often follows `>`, as in `<View><Row/>`, so
       * only a word character or a dot before the `<` rules a tag out.
       *
       * ⚠️ AND THE CLOSING DELIMITER IS A LOOKAHEAD, NOT A MATCH. Consuming it moved `lastIndex` past
       * the `>` that the NEXT tag needs as its own opening context — so in `<View><Row/>` the second
       * tag was invisible. Caught by this file's own can-it-fail test, which is the entire reason
       * that test exists.
       */
      for (const m of body.matchAll(/(?:^|[^\w.])<([A-Z]\w*)(?:\.(\w+))?(?=[\s/>])/gm)) {
        const root = m[1];
        if (seen.has(root) || names.has(root)) continue;
        seen.add(root);
        const line = src.split('\n').findIndex((l) => new RegExp(`<${root}[\\s/>.]`).test(l)) + 1;
        missing.push(`${path.relative(SRC, file).split(path.sep).join('/')}:${line} — <${root}> is rendered and never imported`);
      }
    }
    /*
     * ⚠️ A NAME THAT COLLIDES WITH A DOM GLOBAL IS THE DANGEROUS ONE, and it looks identical here to
     * one that does not — which is the point. `<Text>` unimported is a silent misrender on web and a
     * hard crash on device; this law cannot tell them apart and does not need to.
     */
    expect(missing).toEqual([]);
  });

  it('⛔ …and the style tokens a module reads at import time are bound too', () => {
    /*
     * The other half of the same edit. `StyleSheet.create` runs at MODULE scope, so an unbound token
     * there is not a bad screen — it is an app that does not launch, because `Root` imports every
     * screen eagerly and one throw takes the bundle with it.
     */
    const TOKENS = ['font', 'color', 'stage', 'textScale', 'space', 'radius', 'press', 'signal', 'control', 'motion', 'tracking', 'hold', 'shadow', 'button', 'layout'];
    const missing: string[] = [];
    for (const file of globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })) {
      const src = fs.readFileSync(file, 'utf8');
      const body = code(src);
      const names = bound(src, body);
      for (const tok of TOKENS) {
        if (names.has(tok)) continue;
        if (!new RegExp(`(?<![\\w.$])${tok}\\s*\\.`).test(body)) continue;
        const line = src.split('\n').findIndex((l) => new RegExp(`(?<![\\w.$])${tok}\\s*\\.`).test(l)) + 1;
        missing.push(`${path.relative(SRC, file).split(path.sep).join('/')}:${line} — reads \`${tok}.\` and never binds it`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('the law can actually fail — it is not a regex that matches nothing', () => {
    // A source law that silently stops finding anything is worse than none. This proves the finder
    // sees a real unbound tag, so an empty result above means "clean" rather than "broken".
    const body = code('const X = () => (<View><Missing /></View>);');
    const names = bound("import { View } from 'react-native';", body);
    const found = [...body.matchAll(/(?:^|[^\w.])<([A-Z]\w*)(?:\.(\w+))?(?=[\s/>])/gm)].map((m) => m[1]).filter((n) => !names.has(n));
    expect(found).toEqual(['Missing']);
  });
});
