/**
 * App-level navigation ref. Lets non-component code (notification taps) drive
 * navigation into the main stack. Only the main stack's routes are reachable;
 * a navigate() before the container is ready (or while Onboarding is mounted)
 * is a safe no-op.
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import type { MainParamList, HomeTabsParamList } from './navigation';

export const navigationRef = createNavigationContainerRef<MainParamList>();

/** Navigate only when the container is mounted; otherwise ignore (no throw). */
export function navigateMain<Name extends keyof MainParamList>(name: Name, params?: MainParamList[Name]): void {
  if (navigationRef.isReady()) {
    // Notification-routed targets take no REQUIRED params; the optional param lets the quarterly
    // notification open Progress in its 12-week window (window: 'quarter').
    (navigationRef.navigate as (n: Name, p?: MainParamList[Name]) => void)(name, params);
  }
}

/**
 * Navigate to a TAB (Home / Progress / History / Settings), which lives one level down under
 * `HomeTabs`. A bare `navigate('Progress')` from the ref would look on the Main stack and miss it —
 * the tabs are a child navigator — so the nested form names the host and the screen. This is what
 * the quarterly-report notification uses to open Progress's 12-week window.
 */
export function navigateTab<Name extends keyof HomeTabsParamList>(name: Name, params?: HomeTabsParamList[Name]): void {
  if (navigationRef.isReady()) {
    (navigationRef.navigate as (n: 'HomeTabs', p: object) => void)('HomeTabs', { screen: name, params });
  }
}
