/**
 * THE BACKGROUND LOCATION TASK — the path a run takes with the phone in a pocket.
 *
 * iOS only delivers location to a backgrounded app through a registered TaskManager task, and a
 * task must be DEFINED AT MODULE SCOPE, before React renders: the system can wake the app straight
 * into this file with no component tree at all. That is the whole reason `cardioRun` is a module
 * singleton rather than a hook's ref — the task writes into it, and the screen reads out of it
 * whenever it happens to exist.
 *
 * The task is registered by importing this module (see `platform/cardio/cardioTracker`). It is
 * STARTED only when a run begins and STOPPED the moment it ends: Hush holds a location subscription
 * for exactly as long as there is a run to measure, and never one second longer. The blue location
 * bar stays up for that whole time, which is the honest statement of it.
 *
 * ⚠️ AND THE STOP DOES NOT DEPEND ON A SCREEN EXISTING (2026-08-18). It used to: the tracker hook's
 * cleanup was the only caller, so an evicted app left the subscription running for a run that was
 * over. The task now ends itself the first time it is woken with no live run — see the note in it.
 */

// 

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ingestFix, isRunning } from './cardioRun';

export const CARDIO_LOCATION_TASK = 'hush.cardio.location';

TaskManager.defineTask(CARDIO_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ NOBODY IS LISTENING → THE SUBSCRIPTION ENDS ITSELF (2026-08-18)
   *
   * `stopCardioLocationTask` was reachable from exactly one place: the tracker hook's cleanup. So
   * every way of leaving a run that does NOT tear that hook down — an app iOS evicted mid-run, a
   * crash, a relaunch straight into this task with no React tree at all — left the location
   * subscription running with nothing on the other end of it. Blue bar and battery, forever, for a
   * run that ended hours ago.
   *
   * The consumer is the only thing that can know it has stopped consuming. A fix arriving with no
   * live run is that fact, delivered: it is not a state to recover from, it is the end of the run
   * announcing itself late.
   * ════════════════════════════════════════════════════════════════════════════════════════════════
   */
  if (!isRunning()) {
    await stopCardioLocationTask();
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;
  // A background delivery can arrive BATCHED — several fixes at once after a stretch with the
  // screen off. They are fed in order, exactly as the foreground path feeds them one at a time, so
  // the gates see the same sequence either way.
  for (const loc of locations) {
    ingestFix({
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      tsMs: loc.timestamp,
      accuracyM: loc.coords.accuracy ?? null,
      speedMs: loc.coords.speed ?? null,
    });
  }
});

/** Begin background delivery for a run. Safe to call twice; never throws. */
export async function startCardioLocationTask(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(CARDIO_LOCATION_TASK)) return;
    await Location.startLocationUpdatesAsync(CARDIO_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
      // The blue "using your location" bar stays up for the whole run. Not a cost — the honest
      // statement that Hush is measuring, and the athlete's one-tap way back in.
      showsBackgroundLocationIndicator: true,
      // iOS otherwise stops updates when IT decides the athlete is stationary, and its idea of
      // stationary includes a traffic light. The movement proof is ours (cardioMath) and it needs
      // the fixes to keep arriving to make it.
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Fitness,
    });
  } catch {
    // No background grant, no native module, or a simulator — the foreground watcher still runs
    // and the athlete loses nothing while the screen is on.
  }
}

/** End background delivery. Called on every exit from a run, including an abandoned one. */
export async function stopCardioLocationTask(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(CARDIO_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(CARDIO_LOCATION_TASK);
    }
  } catch {
    /* nothing was started */
  }
}
