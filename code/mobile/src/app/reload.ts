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
import { relatchDirection } from '@/i18n/bidi';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Reload the app tree so a just-applied writing direction takes effect immediately. */
export function reloadApp(): void {
  // The JS-side latch first, so everything the remount re-renders computes from the NEW direction
  // (`bidi.rtl` was a module-load const, and its staleness was the founder's left-stuck Hebrew).
  relatchDirection();
  if (__DEV__ && DevSettings && typeof DevSettings.reload === 'function') {
    DevSettings.reload();
    return;
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
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-restart');
    const restart = mod?.default ?? mod;
    const fn = restart?.restart ?? restart?.Restart; // the package renamed the verb across versions
    if (typeof fn === 'function') {
      fn();
      return;
    }
  } catch {
    /* module absent on this host — remount below */
  }
  for (const l of listeners) l();
}

/** Root subscribes so it can remount its subtree when `reloadApp()` is called. */
export function onReloadRequested(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
