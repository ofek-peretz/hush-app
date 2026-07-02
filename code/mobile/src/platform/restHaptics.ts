/**
 * Rest-haptics backstop (Build #19, regression #3).
 *
 * The in-app rest "Approach" countdown (7/3/2/1) + rest-over GO are Core Haptics driven
 * by JS timers, which iOS SUSPENDS when the app is backgrounded or the phone is locked.
 * So a phone-only athlete who pockets the phone during rest felt nothing — no 7 s warning,
 * no GO. This module schedules OS-level LOCAL notifications (no APNs) as the
 * locked/background delivery path: a 7 s WARNING and a rest-COMPLETE alert, anchored to
 * the absolute rest-end instant (drift-proof, same anchor the timer uses).
 *
 * Ownership model (founder-ratified):
 *  - An active Apple Watch workout OWNS haptics → the phone schedules NOTHING.
 *  - No active watch workout → the PHONE owns → schedule the backstop.
 * The proxy for "watch workout active" is watch reachability. Until the watchOS target
 * ships, reachability is always false, so the phone owns by default (the desired
 * fallback). Reachability is snapshotted at arm() time (a watch that connects mid-rest
 * won't retroactively silence an already-scheduled phone alert — an accepted v1 limit).
 *
 * Foreground: the existing Core Haptics beats fire, and the notification handler
 * (notifications.ts) suppresses these `rest_*` alerts while foregrounded — no double buzz.
 * Locked/background: the handler doesn't run, so the scheduled alert plays (sound: true).
 */
import * as Notifications from 'expo-notifications';
import i18next from 'i18next';
import { ensureNotificationPermission } from '@/platform/notifications';
import { watchTransport } from '@/platform/watch/watchTransportNative';
import { track } from '@/platform/telemetry';
import { NOTIFICATION_EVENTS } from '@/platform/events';

/** Stable ids so a re-arm (+15s / resume) coalesces instead of stacking. */
const WARN_ID = 'hush.rest_warn';
const DONE_ID = 'hush.rest_done';
/** Lead time of the warning before rest ends (mirrors REST_APPROACH_BEATS[0]). */
export const REST_WARNING_LEAD_S = 7;

/** True when the PHONE should deliver rest haptics (i.e. NO active watch workout). */
export function phoneOwnsRestHaptics(): boolean {
  try {
    return !watchTransport.isReachable();
  } catch {
    return true; // no watch transport → phone owns
  }
}

/**
 * The two trigger delays (whole seconds from `nowMs`) for a rest ending at `endAtMs`.
 * Pure + exported for test. A delay < 1s is dropped to null: expo requires a positive
 * interval, and a beat whose window has effectively passed must not fire late.
 */
export function restAlertDelays(
  endAtMs: number,
  nowMs: number,
): { warnInS: number | null; doneInS: number | null } {
  const done = Math.round((endAtMs - nowMs) / 1000);
  const warn = Math.round((endAtMs - nowMs) / 1000 - REST_WARNING_LEAD_S);
  return { warnInS: warn >= 1 ? warn : null, doneInS: done >= 1 ? done : null };
}

export interface RestHaptics {
  /** (Re)arm the locked/background rest alerts for a rest ending at `endAtMs`. Idempotent
   *  — cancels any prior pair first. A no-op (after cancel) when a watch workout owns. */
  arm(endAtMs: number): Promise<void>;
  /** Cancel any scheduled rest alerts (rest ended / paused / workout exited). */
  disarm(): Promise<void>;
}

async function cancelBoth(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WARN_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(DONE_ID).catch(() => {});
}

export const restHaptics: RestHaptics = {
  async arm(endAtMs) {
    try {
      // Re-arm is idempotent: always clear the prior pair first (+15s / resume reschedule).
      await cancelBoth();
      if (!phoneOwnsRestHaptics()) return; // watch owns → nothing on the phone
      const { warnInS, doneInS } = restAlertDelays(endAtMs, Date.now());
      if (warnInS == null && doneInS == null) return; // rest already over / sub-second
      if (!(await ensureNotificationPermission())) return;

      if (warnInS != null) {
        await Notifications.scheduleNotificationAsync({
          identifier: WARN_ID,
          content: {
            title: i18next.t('notifications.restWarnTitle'),
            body: i18next.t('notifications.restWarnBody'),
            data: { kind: 'rest_warn' }, // rest_* → suppressed in foreground by the handler
            sound: true, // must alert when locked/backgrounded
            // A rest timer must pierce the LOCK SCREEN + Focus modes. Default `.active`
            // is held silently when the screen is off; `timeSensitive` is Apple's
            // sanctioned break-through level (needs the time-sensitive entitlement).
            interruptionLevel: 'timeSensitive',
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: warnInS, repeats: false },
        });
      }
      if (doneInS != null) {
        await Notifications.scheduleNotificationAsync({
          identifier: DONE_ID,
          content: {
            title: i18next.t('notifications.restDoneTitle'),
            body: i18next.t('notifications.restDoneBody'),
            data: { kind: 'rest_done' },
            sound: true,
            interruptionLevel: 'timeSensitive', // break through lock screen + Focus (see rest_warn)
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: doneInS, repeats: false },
        });
      }
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'rest_alerts', warnInS, doneInS });
    } catch {
      // never throw — a rest-notification failure must not break the workout
    }
  },

  async disarm() {
    try {
      await cancelBoth();
    } catch {
      /* nothing scheduled / no native module */
    }
  },
};
