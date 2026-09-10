/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A LINT NOTHING RUNS IS NOT A LINT.
 *
 * The repo ships two checkers of its own — `scripts/lint-copy.cjs` (the voice laws, the Hebrew
 * completeness, plurals and interpolations agreeing across both locales) and `scripts/lint-rtl.cjs`
 * (no physical edge property, no text style frozen LTR). Both are real instruments, both are
 * `npm run` scripts, and on 2026-08-26 **neither was run by anything**: `.github/workflows/ci.yml`
 * gates `tsc --noEmit` and `jest`, and that is all.
 *
 * ⚠️ AND IT HAD ALREADY ROTTED, which is the whole argument. The RTL checker was found holding SIX
 * violations — four written that morning and **two that had been sitting in `SessionFlow` from an
 * earlier session** (`capUnit`, `capTimes`). Nobody had run it in long enough for a defect to age.
 *
 * ── WHY A LAW AND NOT A CI STEP ─────────────────────────────────────────────────────────────────
 * A CI step catches it on push. A law catches it on the machine where it was written, in the same
 * `npx jest` every other rule in this repo answers to — which is the difference between a checker
 * that gates the work and a checker that gates the merge. The CI step is added too; this is the one
 * that has to be true before the commit exists.
 *
 * ⚠️ IT RUNS THE REAL SCRIPTS, not a copy of their rules. A law that reimplemented the checks would
 * be a third instrument to keep in step with the two it is guarding.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const MOBILE = path.resolve(__dirname, '..', '..');
const REPO = path.resolve(MOBILE, '..', '..');

/** Run a checker exactly as `npm run` would, and hand back its own output on failure. */
function run(script: string, ...args: string[]): string {
  try {
    return execFileSync(process.execPath, [path.join('scripts', script), ...args], {
      cwd: MOBILE,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    throw new Error(`${script} FAILED:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  }
}

describe("the repo's own checkers are part of the gate", () => {
  /* 40 s: `lint-copy` parses both locale files and `lint-rtl` walks all 325 sources. */
  it('⛔ the copy laws hold — voice, Hebrew completeness, plurals, interpolations', () => {
    expect(run('lint-copy.cjs')).toContain('Copy-law lint passed');
  }, 40_000);

  it('⛔ the type checker passes — no physical edge, no tracked word, no synthetic italic', () => {
    /*
     * ⚠️ IT OUTGREW ITS NAME ON 2026-08-26 and the name is kept, because the file path is what
     * `package.json` and CI reference. What it checks is now three rules, and the two new ones are
     * the same shape as the first: a Latin typographic device applied blind to a Hebrew word.
     *   · no physical `left`/`right` edge — the original.
     *   · no POSITIVE tracking on a sans face — Hebrew reads an opened word as a rendering fault.
     *   · no `fontStyle: 'italic'` — no italic face is loaded, so every one was a synthetic shear.
     */
    expect(run('lint-rtl.cjs')).toContain('Type lint passed');
  }, 40_000);

  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ AND THE THIRD CHECKER (added 2026-08-31, from the founder's crash).
   *
   *   > *"יש גם באג נוסף שבעת יציאה ממסך האימון בתחילת האימון או בזמן שקרוב אליו האפליקציה קורסת."*
   *
   * `ActiveSet` guarded a null target — correctly — one line ABOVE its `useState`. On the single
   * frame a not-started session ends, the plan empties and the component rendered one hook fewer
   * than before, which React does not tolerate: *"Rendered more hooks than during the previous
   * render"* is thrown, and the app goes down. `tsc` cannot see it, no law mounted that frame, and
   * there is no eslint in this repo to hold the rule. So the repo holds it itself.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('⛔ no hook sits below a conditional return — the shape that crashed the workout screen', () => {
    expect(run('lint-hooks.cjs')).toContain('Hook-order lint passed');
  }, 40_000);

  it('⛔ …and it FAILS on a guard placed one line above a hook', () => {
    /* Planted in a temp directory for the reason the RTL probe records: jest runs suites in
       parallel workers over one filesystem, and a file in `src` is visible to every law that
       walks `src` while it is there. */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hush-hook-probe-'));
    fs.writeFileSync(
      path.join(dir, 'probe.tsx'),
      [
        "import React, { useState } from 'react';",
        "import { View } from 'react-native';",
        'export function Probe({ target }: { target: unknown }) {',
        '  if (!target) return <View />;',
        '  const [n, setN] = useState(0);',
        '  return <View onLayout={() => setN(n + 1)} />;',
        '}',
        '',
      ].join('\n'),
    );
    try {
      let caught = '';
      try {
        run('lint-hooks.cjs', dir);
      } catch (e) {
        caught = (e as Error).message;
      }
      expect(caught).toContain('A HOOK IS REACHED CONDITIONALLY');
      expect(caught).toContain('Probe()');
      expect(caught).toContain('useState');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 40_000);

  it('…and it does NOT fire on a return inside a callback, which is not the top level', () => {
    // The rule is about the FUNCTION's own statements. A guard inside a `.map` or a handler is
    // ordinary code, and a checker that flagged it would be turned off within a week.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hush-hook-ok-'));
    fs.writeFileSync(
      path.join(dir, 'probe.tsx'),
      [
        "import React, { useState } from 'react';",
        "import { View } from 'react-native';",
        'export function Probe({ rows }: { rows: number[] }) {',
        '  const [n, setN] = useState(0);',
        '  const drawn = rows.map((r) => {',
        '    if (r < 0) return null;',
        '    return r;',
        '  });',
        '  return <View onLayout={() => setN(drawn.length)} />;',
        '}',
        '',
      ].join('\n'),
    );
    try {
      expect(run('lint-hooks.cjs', dir)).toContain('Hook-order lint passed');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 40_000);
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ AND THE CHECKER MUST STILL BE ABLE TO FAIL (added 2026-08-27).
   *
   * The law above asserts `lint-rtl` PASSES. On 2026-08-27 it passed while ten violations stood in
   * `src`, and it had been passing over them for as long as they had existed — including one
   * (`WeekColumn.shape`) that drew every queued card's line on Today in a face with no Hebrew in
   * it. The rule was reading one line at a time, so a style written the way this app writes them —
   *
   *     heroLabel: {
   *       fontFamily: font.sansMedium,
   *       letterSpacing: trackingPx(13, tracking.legend),
   *     },
   *
   * — never had its face and its tracking in view at once. A green checker was the evidence that
   * nothing was wrong.
   *
   * So "the lint passes" is only half a gate. The other half is that it fails on the thing it
   * exists to catch, in the layout it will actually meet — which is what this plants and removes.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('⛔ …and it FAILS on a tracked Hebrew word written across several lines', () => {
    /*
     * ⚠️ PLANTED IN A TEMP DIRECTORY, NOT IN `src` (2026-08-27). It was planted in `src` at first,
     * for about a second and a half — and jest runs suites in PARALLEL WORKERS over one filesystem,
     * so every other law that walks `src` could see it while it was there. `nothingIsBuiltForNobody`
     * did, intermittently. A test that makes another test flaky depending on scheduling is worse
     * than the hole it was closing, so the checker takes its root as an argument now.
     */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hush-lint-probe-'));
    const planted = path.join(dir, 'probe.tsx');
    const source = [
      "import { StyleSheet } from 'react-native';",
      "import { font, tracking, trackingPx } from '@/design/tokens';",
      'export const probe = StyleSheet.create({',
      '  label: {',
      '    fontFamily: font.sansMedium,',
      '    fontSize: 17,',
      '    letterSpacing: trackingPx(13, tracking.legend),',
      "    textAlign: 'left',",
      '  },',
      '});',
      '',
    ].join('\n');
    fs.writeFileSync(planted, source);
    try {
      let caught = '';
      try {
        run('lint-rtl.cjs', dir);
      } catch (e) {
        caught = (e as Error).message;
      }
      /* It must complain, and it must complain about THIS, naming the style that opened. */
      expect({ complained: caught.length > 0 }).toEqual({ complained: true });
      expect(caught).toContain('probe.tsx');
      expect(caught).toContain('positive letter-spacing');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 40_000);


  it('⚠️ …and CI runs them too, so a push cannot land what a laptop skipped', () => {
    /*
     * The law above is the local gate. This asserts the remote one exists, because the two answer
     * different questions: a law is only as good as the person who ran it, and a CI step is only as
     * good as the branch it is configured on. The lint that had rotted for a session had BOTH holes.
     */
    const ci = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toContain('lint:copy');
    expect(ci).toContain('lint:rtl');
    expect(ci).toContain('lint:hooks'); // added 2026-08-31 with the checker itself
  });

  it('⚠️ the scripts are still reachable by the names `package.json` gives them', () => {
    /* A renamed script with a stale `npm run` entry fails the same way a missing gate does. */
    const pkg = JSON.parse(fs.readFileSync(path.join(MOBILE, 'package.json'), 'utf8'));
    expect(pkg.scripts['lint:copy']).toContain('lint-copy.cjs');
    expect(pkg.scripts['lint:rtl']).toContain('lint-rtl.cjs');
    expect(pkg.scripts['lint:hooks']).toContain('lint-hooks.cjs');
    expect(fs.existsSync(path.join(MOBILE, 'scripts', 'lint-copy.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(MOBILE, 'scripts', 'lint-rtl.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(MOBILE, 'scripts', 'lint-hooks.cjs'))).toBe(true);
  });
});
