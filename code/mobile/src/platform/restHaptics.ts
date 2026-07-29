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
 * Ownership model (founder-ratified; AMENDED 2026-07-11 — "the 7 s alert still doesn't light
 * the screen"):
 *  - The alerts are ALWAYS scheduled. A locked phone must light up and show the rest ending —
 *    that is the whole point of the backstop, and a paired watch does not change it. The old
 *    rule ("watch reachable → the phone schedules NOTHING") silenced the phone for every
 *    athlete who simply owns a watch, which is exactly the reported defect.
 *  - The WRIST still owns the BUZZ: when the watch is reachable it plays the countdown, so the
 *    phone's alert is scheduled SILENT (`sound: false`). It still breaks through the lock
 *    screen (timeSensitive) and lights the display — no double buzz, no dead screen.
 *
 * Foreground: the existing Core Haptics beats fire, and the notification handler
 * (notifications.ts) suppresses these `rest_*` alerts while the app is ACTIVE — no double buzz.
 * Locked/background: the handler doesn't run, so the scheduled alert wakes the screen.
 */
import * as Notifications from 'expo-notifications';
import { tg } from '@/i18n';
import { ensureNotificationPermission } from '@/platform/notifications';
import { watchTransport } from '@/platform/watch/watchTransportNative';
import { liveActivityRunning } from '@/platform/liveActivity';
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
      const { warnInS, doneInS } = restAlertDelays(endAtMs, Date.now());
      if (warnInS == null && doneInS == null) return; // rest already over / sub-second
      if (!(await ensureNotificationPermission())) return;
      // The wrist owns the BUZZ when it is there; the phone still lights up (silent).
      const sound = phoneOwnsRestHaptics();
      /**
       * ════ THE LIVE ACTIVITY OWNS THE WARNING (founder 2026-07-29) ════
       *
       * "If we have a Live Activity running in the background, how do you suggest combining this?
       * Because then I don't think we need a pile of notifications on the screen."
       *
       * Exactly right, and the resolution runs the other way from the obvious one. These alerts are
       * a BACKSTOP for a countdown the athlete cannot see: a JS timer is suspended the moment the
       * phone is locked, so without them the last seconds of a rest happen in the dark. A Live
       * Activity runs in ActivityKit, NOT in JS — while one is up, the countdown is already on the
       * lock screen, ticking. The "7 seconds left" note is then a second copy of a thing she is
       * looking at, and two alerts for one moment is the pile.
       *
       * So the WARNING stands down while a Live Activity is live. The rest-OVER alert always
       * fires: it is a discrete instant that needs a beat, not a number that needs reading, and a
       * glanceable ring reaching zero is not the same as being told to go.
       */
      const laOwnsTheWarning = liveActivityRunning();

      if (warnInS != null && !laOwnsTheWarning) {
        await Notifications.scheduleNotificationAsync({
          identifier: WARN_ID,
          content: {
            title: tg('notifications.restWarnTitle'),
            body: tg('notifications.restWarnBody'),
            data: { kind: 'rest_warn' }, // rest_* → suppressed in foreground by the handler
            sound, // silent when the wrist is buzzing; still wakes the screen (timeSensitive)
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
            title: tg('notifications.restDoneTitle'),
            body: tg('notifications.restDoneBody'),
            data: { kind: 'rest_done' },
            sound,
            interruptionLevel: 'timeSensitive', // break through lock screen + Focus (see rest_warn)
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: doneInS, repeats: false },
        });
      }
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'rest_alerts', warnInS, doneInS, sound, laOwnsTheWarning });
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
