/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SPLASH IS HELD UNTIL THERE IS SOMETHING TO SEE.
 *
 * ⛔ FOUNDER, 2026-09-16: *"כשאני נכנס לאפליקציה לאחר שהורדתי אותה זה לא נפתח בצורה חלקה אלא יש
 * קפיצה של מסך."*
 *
 * ── WHAT HE IS DESCRIBING, EXACTLY ──────────────────────────────────────────────────────────────
 * Nothing in this app controlled the native splash, so iOS hid it at the instant the React root
 * mounted — which is the instant BEFORE the app has anything to draw. Three waits then ran in a
 * row, on an empty black screen:
 *
 *   1. the three typefaces decode (`useFonts` in `App`);
 *   2. `initI18n` reads her language off disk;
 *   3. `AppProvider` hydrates — profile, programme, entitlement, the week (`app.booted`, and `Root`
 *      draws a bare canvas until it is true).
 *
 * On a warm launch that is a flicker. On the FIRST launch after an install — cold disk, nothing in
 * any cache, the case he was describing — it is long enough to read as a broken screen, and then the
 * first real screen appears all at once, which is the "jump".
 *
 * ── THE FIX, AND WHY IT IS A MODULE RATHER THAN A LINE ──────────────────────────────────────────
 * The hold belongs to the app's ENTRY (before React renders anything) and the release belongs to
 * `Root` (the only place that knows the first real screen is mounted). Two files, one fact — so the
 * fact lives here, and neither side can hold or release a second time by accident.
 *
 * ⚠️ IT CAN NEVER STRAND HER BEHIND A LOGO. A held splash that nothing releases is a dead app, and
 * every step above is an I/O path that can hang: a corrupt font, a disk that never answers. So the
 * hold is self-limiting — `SPLASH_MAX_MS` releases it regardless, and the athlete meets the canvas
 * she would have met anyway. A slow boot may look worse than it does today; it may never look like
 * an app that did not start.
 *
 * ⚠️ AND THE COLOURS ALREADY MATCH, which is what makes the handover invisible: the splash's
 * background is `#000000` (app.json) and so is the app's ground (`stage[0]`, absolute black by the
 * founder's own 2026-08-05 ruling). There is no step to see — only the moment content appears.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as SplashScreen from 'expo-splash-screen';

/**
 * The longest the logo may stand over a boot that has not finished.
 *
 * Measured against what it is covering: fonts + i18n + the store's hydration. A healthy cold start
 * is a few hundred milliseconds; four seconds is the far edge of a first launch on an old phone,
 * and past it the honest thing is to show her the app's own ground rather than a frozen logo.
 */
const SPLASH_MAX_MS = 4000;

let released = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Hold the native splash. Called ONCE, at module scope in the app's entry — before React renders,
 * because the auto-hide fires on the first mount and a hold asked for afterwards arrives too late.
 */
export function holdSplash(): void {
  /* Best-effort on purpose: on web and in jest there is no native splash, and an unhandled
     rejection at the app's entry would be a worse bug than the flicker this prevents. */
  void SplashScreen.preventAutoHideAsync().catch(() => {});
  timer = setTimeout(() => {
    void releaseSplash();
  }, SPLASH_MAX_MS);
}

/**
 * Let it go — the first real screen is mounted. Idempotent: the timeout above and `Root` race by
 * design, and whichever arrives first is the one that matters.
 */
export async function releaseSplash(): Promise<void> {
  if (released) return;
  released = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await SplashScreen.hideAsync().catch(() => {});
}
