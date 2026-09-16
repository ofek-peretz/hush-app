/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE APP NEVER OPENS ONTO NOTHING.
 *
 * FOUNDER, 2026-09-16: *"כשאני נכנס לאפליקציה לאחר שהורדתי אותה זה לא נפתח בצורה חלקה אלא יש קפיצה
 * של מסך."*
 *
 * Nothing controlled the native splash, so iOS hid it when the React root mounted — before the
 * typefaces had decoded, before `initI18n` had read her language, and before the store had hydrated.
 * Three I/O waits on an empty black screen, worst on the very first launch after an install, and
 * then the whole first screen at once. That is the jump.
 *
 * The contract, and each half is useless without the other:
 *   1. the ENTRY holds the splash, at module scope, before React renders anything;
 *   2. `Root` releases it on the first painted frame of the real screen;
 *   3. the hold is SELF-LIMITING, because every step it covers is an I/O path that can hang and a
 *      splash nothing releases is an app that never starts.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('the boot has a cover over it', () => {
  it('⛔ the entry holds the splash BEFORE React renders — an auto-hide cannot be undone later', () => {
    const app = read('App.tsx');
    expect(app).toContain("import { holdSplash } from '@/app/splash';");
    /* At module scope, not in an effect: the auto-hide fires on the first mount, so a hold asked for
       from inside the component has already lost the race it exists to win. */
    const beforeComponent = app.slice(0, app.indexOf('export default function App'));
    expect(beforeComponent).toContain('holdSplash();');
  });

  it('⛔ Root releases it — on a frame that has been painted, and only once booted', () => {
    const root = read('src/app/Root.tsx').replace(/\s+/g, ' ');
    expect(root).toContain('if (!app.booted) return;');
    expect(root).toContain('requestAnimationFrame(() => void releaseSplash())');
  });

  it('⛔ …and the hold can never strand her behind a logo', () => {
    const splash = read('src/app/splash.ts');
    // A ceiling, applied by the holder itself.
    expect(splash).toMatch(/const SPLASH_MAX_MS = \d+;/);
    expect(splash).toContain('timer = setTimeout(');
    // Idempotent: the timeout and Root race by design.
    expect(splash).toContain('if (released) return;');
    // Never a throw at the app's entry — web and jest have no native splash at all.
    expect(splash).toContain('preventAutoHideAsync().catch(() => {})');
    expect(splash).toContain('hideAsync().catch(() => {})');
  });

  it('⛔ the direction latch is re-read at boot — the first launch after an install faced the wrong way', () => {
    /*
     * `bidi.rtl` latches at MODULE LOAD. On a fresh install every module loads before `initI18n`
     * runs, so a Hebrew phone latched LTR and then `forceRTL(true)` turned the tree around
     * underneath it: everything computed from the latch (`PlanLifts` reverses the load row off it,
     * on every screen that prints a prescription) spent that one launch backwards, and looked
     * right from the second launch on.
     */
    const i18n = read('src/i18n/index.ts').replace(/\s+/g, ' ');
    const forced = i18n.indexOf('I18nManager.forceRTL(rtl);');
    const relatched = i18n.indexOf('relatchDirection();');
    expect(forced).toBeGreaterThan(-1);
    expect(relatched).toBeGreaterThan(forced); // …and AFTER the flip, or it latches the old answer
    expect(read('src/i18n/bidi.ts')).toContain('export function relatchDirection()');
  });

  it('⚠️ the cover and the ground are the same colour, so the handover has no step in it', () => {
    const splash = JSON.parse(read('app.json')).expo.splash as { backgroundColor?: string };
    const tokens = read('src/design/tokens.ts');
    // `stage[0]` — the app's own ground (absolute black, founder 2026-08-05).
    expect(tokens).toContain("0: '#000000', // stage ground");
    expect((splash.backgroundColor ?? '').toLowerCase()).toBe('#000000');
  });
});
