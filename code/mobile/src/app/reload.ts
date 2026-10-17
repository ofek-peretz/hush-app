/**
 * App reload seam — applies a just-changed layout direction (`I18nManager.forceRTL`)
 * without asking the user to relaunch.
 *
 * `forceRTL` flips the global flag, but already-mounted native views keep their old
 * direction; only views created AFTER the flip mirror. So a "reload" here recreates
 * the whole view tree: in a dev client a full JS reload (`DevSettings.reload`) is
 * cleanest; in a release build we remount the React root (a key bump on the tree in
 * `Root.tsx`), which recreates every native view with the new direction. No native
 * dependency, no process relaunch.
 *
 * NOTE: a JS remount applies the new direction to flexbox, text alignment, and the
 * navigator; a small set of native behaviors that latch `isRTL` at module load may
 * still need a true relaunch — verify the language switch on a Hebrew device.
 */

// 

import { DevSettings, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { launchedFacingWrongWay, relatchDirection, rtl } from '@/i18n/bidi';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Reload the app tree so a just-applied writing direction takes effect immediately. */
export function reloadApp(): void {
  // The JS-side latch first, so everything the remount re-renders computes from the NEW direction
  // (`bidi.rtl` was a module-load const, and its staleness was the founder's left-stuck Hebrew).
  relatchDirection();
  if (restartInstance()) return;
  for (const l of listeners) l();
}

/**
 * ════ THE FIRST LAUNCH WEARS THE WRONG DIRECTION, AND IT IS THE LAUNCH THE INTAKE RUNS IN ════
 *
 * Founder, build 75 (2026-10-01): the build screen of a fresh install had its legend, its label and
 * her quoted sentence on the LEFT edge, while the same phone's Program tab an hour later was right.
 *
 * `I18nManager.isRTL` is a constant read once at launch (RN 0.81 `I18nManager.js`), and the native
 * root takes its direction from the same launch-time answer. `initI18n` decides Hebrew and calls
 * `forceRTL(true)` — which writes the NEXT launch's direction and changes nothing in this one. So
 * every new athlete on a Hebrew phone did the whole intake mirrored the wrong way, and "it fixes
 * itself after a relaunch" is why nobody who already had the app installed ever saw it.
 *
 * Called once at boot, after `initI18n` decided: if this process was launched facing the other way,
 * restart it ONCE so it is born in the right direction — the same `react-native-restart` the
 * language switch already relies on. Returns true when a restart is on its way (the caller renders
 * nothing more).
 *
 * ⚠️ NEVER A LOOP. The direction it restarted FOR is written down first; a second launch still
 * facing the wrong way does not restart again — it renders under Root's explicit `direction`, which
 * now reads the decided direction rather than the launch constant. The note is cleared the moment a
 * launch faces the right way, so the next language change gets its one restart too.
 */
const RELAUNCH_KEY = 'hush.direction.relaunch';

export async function relaunchIntoDirection(): Promise<boolean> {
  if (Platform.OS === 'web') return false; // the document's `dir` is set at load; nothing to relaunch
  try {
    const want = rtl ? 'rtl' : 'ltr';
    if (!launchedFacingWrongWay()) {
      await AsyncStorage.removeItem(RELAUNCH_KEY);
      return false;
    }
    if ((await AsyncStorage.getItem(RELAUNCH_KEY)) === want) return false; // already tried once
    await AsyncStorage.setItem(RELAUNCH_KEY, want);
    return restartInstance();
  } catch {
    return false; // storage or the restart module failed: render, never strand her on a splash
  }
}

/** Recreate the whole React instance (dev reload, page reload, or `react-native-restart`). */
function restartInstance(): boolean {
  if (__DEV__ && DevSettings && typeof DevSettings.reload === 'function') {
    DevSettings.reload();
    return true;
  }
  /*
   * ════ THE REMOUNT WAS NOT ENOUGH, AND THE FOUNDER'S DEVICE PROVED IT (2026-08-26) ════
   *
   * *"כשאנחנו בוחרים בעברית הכל עדיין מופיע בצד שמאל, אבל אם אני יוצא מהאפליקציה וחוזר זה
   * מסתדר."* The old NOTE below predicted exactly this and asked for a device check; here it is.
   * The reason is structural: `forceRTL` latches onto the NATIVE ROOT VIEW at creation. A JS
   * remount recreates every child under the same root, so flexbox mirrors (the `direction` style
   * on Root's wrapper) but the platform layer that reads the root's own direction — navigation
   * gestures, scroll edges, text defaults — stays as launched. Only recreating the React instance
   * applies it all, which is what "leave and reopen" was doing for him by hand.
   *
   * `react-native-restart` does that relaunch on demand. Loaded lazily and defensively — jest,
   * web, and any build the module is missing from fall back to the remount, which remains the
   * best answer those hosts have.
   */
  // On web the document itself latches `dir` — only a page reload re-reads it.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    window.location.reload();
    return true;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-restart');
    const restart = mod?.default ?? mod;
    const fn = restart?.restart ?? restart?.Restart; // the package renamed the verb across versions
    if (typeof fn === 'function') {
      fn();
      return true;
    }
  } catch {
    /* module absent on this host — the caller remounts */
  }
  return false;
}

/** Root subscribes so it can remount its subtree when `reloadApp()` is called. */
export function onReloadRequested(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
