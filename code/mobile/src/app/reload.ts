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
import { DevSettings } from 'react-native';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Reload the app tree so a just-applied writing direction takes effect immediately. */
export function reloadApp(): void {
  if (__DEV__ && DevSettings && typeof DevSettings.reload === 'function') {
    DevSettings.reload();
    return;
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
