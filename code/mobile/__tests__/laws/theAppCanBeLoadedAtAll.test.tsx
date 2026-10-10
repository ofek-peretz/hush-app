/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE APP'S OWN ENTRY GRAPH IS EVALUATED AT LEAST ONCE, BY SOMETHING OTHER THAN A PHONE.
 *
 * ⛔ FOUND THE HARD WAY, 2026-08-20. Builds 46 and 47 died on the splash screen — founder: *"לחצתי
 * על האפליקציה זה נכנס ויצא ישר"*. Two builds were spent bisecting a native module that turned out
 * to be innocent, and only then did anyone ask the obvious question: **does anything, anywhere, ever
 * import `App.tsx`?**
 *
 * Nothing did. 312 suites and 3,109 tests, and not one of them evaluated the module graph the device
 * actually loads. `tsc` did not cover it either — nearly every file in `src` carries `@ts-nocheck`.
 * So a throw at module scope on the boot path was invisible to every gate this repo has, and the
 * first thing that could see it was a TestFlight build, ten minutes and one upload away.
 *
 * ── WHY MODULE SCOPE IS THE DANGEROUS PART ──────────────────────────────────────────────────────
 * `App.tsx` calls `installGlobalFontDefault()` while it is being imported, and the graph beneath it
 * reaches `appStore`, `sessionStore`, `Root`, the whole screen tree and every platform seam. A throw
 * anywhere in that evaluation is not an error the app can render — React Native has no app yet — so
 * the process exits. There is no red box, no console line, and nothing in the crash that names the
 * offending file in JavaScript terms.
 *
 * ── WHAT THIS TEST IS AND IS NOT ────────────────────────────────────────────────────────────────
 * It is a smoke test: it imports, it does not render. Rendering the real provider tree would drag in
 * SQLite, HealthKit and the store, which is what `App.web.tsx` refuses to do for the same reason.
 * Importing is enough — module-scope evaluation is the failure mode, and it is the one no other gate
 * in this repo covers.
 *
 * ⚠️ IT WILL BREAK WHEN SOMEONE ADDS A NATIVE DEPENDENCY WITHOUT A MOCK. That is the test working,
 * not the test being brittle: a native module with no jest mock is a native module nobody has
 * checked, and the next place it would have surfaced is the splash screen of a real build.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

describe('the app can be loaded at all', () => {
  /**
   * Every seam below `App.tsx` in turn, smallest first, so a failure NAMES the layer it is in
   * rather than reporting "the app does not load".
   */
  it('evaluates the domain and platform seams the boot path touches', () => {
    expect(() => require('@/domain/entitlement')).not.toThrow();
    expect(() => require('@/platform/billing')).not.toThrow();
    expect(() => require('@/platform/telemetry')).not.toThrow();
    expect(() => require('@/data/local/db')).not.toThrow();
  });

  it('evaluates the stores', () => {
    expect(() => require('@/state/stores/appStore')).not.toThrow();
    expect(() => require('@/state/stores/sessionStore')).not.toThrow();
  });

  it('evaluates the navigation host', () => {
    expect(() => require('@/app/Root')).not.toThrow();
  });

  /**
   * ⛔ THE ONE THAT MATTERS. This is the module the device loads, side effects and all.
   */
  it('evaluates App.tsx itself — the module the device actually loads', () => {
    expect(() => require('../../App')).not.toThrow();
  });
});
