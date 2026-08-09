/**
 * ════ THE TESTS ARE TYPECHECKED ════
 *
 * `tsconfig.json` used to include only `src`, `App.tsx` and `index.js`. Nothing about that is
 * visible — every command passes, every suite is green, and a fixture can quietly claim a type
 * while holding values that type forbids. For as long as it was true it hid, in one day's work:
 *
 *   · `goal: 'hypertrophy'` and `repBand: '8-12'` on nine `Profile` fixtures. Neither value exists.
 *   · `state: 'completed'` on nine `Session` fixtures. `SessionState` is `'ACTIVE' | 'SAVED'`.
 *   · `loadSetup(ex, …)` handed an `Exercise` where the signature takes an id STRING — so every
 *     iteration of `theOpeningLoadIsLoadable` fell through a `continue` and **that law asserted
 *     nothing at all, for its entire life, while passing.**
 *   · an `experience` sweep over beginner/intermediate/advanced, and a `volume` sweep over
 *     moderate/high. Neither field exists. Both ran the SAME case two and three times while
 *     reporting two- and three-way coverage.
 *   · `onOpenWorkout` and `onSettings` passed to `HomeView`, which has neither. The assertions
 *     that read them (`expect(opened).toEqual([])`) could not fail.
 *   · a `SessionMirror` fixture nine fields behind the mirror the phone publishes.
 *
 * Not one of those is a typo. Every one is a test that believed something about the app that had
 * stopped being true, and went green about it. **A green suite is only worth what its fixtures are
 * worth**, and nothing was checking the fixtures.
 *
 * So this is the guard on the guard. It is cheap and it is exact: if `__tests__` ever leaves
 * `include`, this fails, and it fails with the list above attached.
 */
// @ts-nocheck

// 

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

describe('the tests are typechecked', () => {
  it('keeps __tests__ inside the compiler’s view', () => {
    const raw = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8');
    const include = (JSON.parse(raw) as { include?: string[] }).include ?? [];
    expect(include.some((p) => p.startsWith('__tests__'))).toBe(true);
  });

  it('keeps the jest globals typed, or the whole thing collapses to 5,000 phantom errors', () => {
    // Without `@types/jest`, adding `__tests__` to `include` produces ~5,400 errors that are almost
    // entirely "Cannot find name 'describe'" — noise that buries the 250 real ones and gets the
    // include reverted within the hour.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      devDependencies?: Record<string, string>;
    };
    for (const dep of ['@types/jest', '@types/react-test-renderer']) {
      expect({ dep, present: dep in (pkg.devDependencies ?? {}) }).toEqual({ dep, present: true });
    }
  });
});
