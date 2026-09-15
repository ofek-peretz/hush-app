/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE TYPECHECKER IS ALLOWED TO LOOK, AND `@ts-nocheck` MAY NOT COME BACK.
 *
 * ⛔ 2026-08-23. Until this day 233 of 269 source files carried `// @ts-nocheck` — the checker ran
 * green on every build while looking at almost nothing, which is why the project memory literally
 * read *"a green typecheck is weak evidence."* The pragma came off everything in one day, and the
 * hour the checker was allowed to look it found ELEVEN live defects, each one a class the founder
 * had already photographed on a device:
 *
 *   · `stage.ink3` — a colour that DOES NOT EXIST; the line rendered in the platform default
 *   · `space.xs` / `space.sm` — spacing tokens that do not exist; rendered as 0
 *   · `styles.addFifteen` — the rest screen's "+15 sec" control had NO BODY (his screenshot shows it)
 *   · `useCopy().locale` — undefined on every device, so a Hebrew athlete's photographed programme
 *     was imported in English, always
 *   · the S-77 swap door — passed by the container, never declared on the view, REACHED NO ROW
 *   · a duplicate `rowSub` style silently winning by key order
 *   · `RangeMark size={20}` — not a prop; silently ignored
 *   · a required `LiftMatch.how` missing from a hand-built literal
 *   · `OpenItem` in a union eleven days after the type was deleted
 *   · a dead `r.key === 'age'` comparison two weeks after age left the requirements
 *   · `LiftChange.kind` missing `'detrain'`, which the engine has stamped since B-9 landed
 *
 * Not one was a "type error". Every one was the app doing something other than what its source
 * says — which is the entire argument for this ratchet.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────────────────────
 * Exactly ONE file may carry the pragma: the dev gallery, which mounts ~100 screens against
 * deliberately partial fixtures and documents that cost at its own head. Everything else is
 * checked, and a new `@ts-nocheck` anywhere in `src` fails the build by name.
 *
 * ⚠️ THIS TEST DOES NOT RUN `tsc` — the suite would pay ~40s on every run for a thing CI and the
 * `typecheck` script already do. What it pins is the PRAGMA: the way the checker goes blind again
 * is not a type error (those fail `npm run typecheck`), it is someone silencing one.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const SRC = path.resolve(__dirname, '..', '..', 'src');

describe('the checker is allowed to look', () => {
  it('⛔⛔ no file under src silences the typechecker — except the one that says why', () => {
    const carriers = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })
      .filter((f) => /^\s*\/\/\s*@ts-nocheck/m.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
      .sort();
    expect(carriers).toEqual(['screens/dev/gallery.tsx']);
  });

  it('⛔ …and no line-level expect-error/ignore creeps in as the quieter version of the same thing', () => {
    /*
     * `@ts-ignore` on one line is `@ts-nocheck` with better manners — it was how the 233 started.
     * `@ts-expect-error` at least fails when the error goes away, but in this codebase every
     * legitimate impossibility is expressed as a typed seam (`as never` at a documented boundary),
     * so neither pragma has a standing use. The gallery is exempt with the file above.
     */
    const carriers = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })
      .filter((f) => !f.includes(`screens${path.sep}dev`))
      .filter((f) => /@ts-(ignore|expect-error)/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
      .sort();
    expect(carriers).toEqual([]);
  });

  it('⚠️ the gallery states its cost at its own head', () => {
    // An exception without its reasoning attached is an exception someone widens.
    const gallery = fs.readFileSync(path.join(SRC, 'screens', 'dev', 'gallery.tsx'), 'utf8');
    // The pragma LINE, not the first mention — the reasoning block itself names `@ts-nocheck`.
    const head = gallery.slice(0, gallery.search(/^\/\/ @ts-nocheck$/m));
    expect(head).toContain('DELIBERATE HERE, AND ONLY HERE');
    expect(head).toContain('THE COST IS NAMED');
  });
});
