/**
 * App-level navigation ref. Lets non-component code (notification taps) drive
 * navigation into the main stack. Only the main stack's routes are reachable;
 * a navigate() before the container is ready (or while Onboarding is mounted)
 * is a safe no-op.
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import type { MainParamList } from './navigation';

export const navigationRef = createNavigationContainerRef<MainParamList>();

/** Navigate only when the container is mounted; otherwise ignore (no throw). */
export function navigateMain<Name extends keyof MainParamList>(name: Name): void {
  if (navigationRef.isReady()) {
    // All notification-routed targets (Program, WeeklyUpdate, QuarterlyReport) take no required params.
    (navigationRef.navigate as (n: Name) => void)(name);
  }
}
