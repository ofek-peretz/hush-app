/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SET-NUDGE BACKSTOP — a pocketed phone still asks (founder, 2026-08-30/31).
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"אני לפעמים שוכח להזין את תוצאות הסט וכבר ממתין לסט הבא… כעבור זמן מסוים שכבר הייתי אמור
 *   > לסיים את הסט צריך להשלח התראה של להזין את התוצאה."*
 *
 * ⛔ AND THE POCKET IS THE WHOLE CASE. The failure the founder described does not happen while he
 * is looking at the screen — it happens because he finished the set, put the phone away and turned
 * his attention to resting. A JS timer is suspended the moment the phone is locked, so an in-app
 * line alone would say nothing at exactly the moment it is needed. This is an OS-level local
 * notification, scheduled AHEAD, which is the only thing that can speak into a pocket.
 *
 * It is the same shape as `restHaptics`, and deliberately so — that module solved this exact class
 * of problem for the rest countdown and its argument transfers whole:
 *
 *   · **FOREGROUND is not this module's job.** `set_nudge` is suppressed by the notification
 *     handler while the app is active, because the stage draws the line itself and one moment must
 *     never produce two tells. (`notifications.ts` — the same rule `rest_*` gets.)
 *   · **`timeSensitive`**, because a locked screen must light up. The whole point is a phone that
 *     is not being looked at.
 *   · **SILENT when the wrist is there** (`phoneOwnsRestHaptics`), for the same reason the rest
 *     alerts are: the watch will have tapped, and two buzzes for one thought is the pile the
 *     founder objected to in 2026-07-29.
 *   · **One stable id**, so re-arming coalesces instead of stacking a banner per set.
 *
 * ⚠️ IT IS ASKED ONCE PER SET AND NEVER REPEATS. `repeats: false`, one id, and the arming side
 * disarms on every exit from the set. A coach says "still going?" once; an app that says it three
 * times is an alarm clock, and the founder's own ruling on the ramp — *"לא לקבוע מראש לאף אחד"* —
 * is the same instinct about the same product.
 */

//

import * as Notifications from 'expo-notifications';
import { tg } from '@/i18n';
import { hasNotificationPermission } from '@/platform/notifications';
import { phoneOwnsRestHaptics } from '@/platform/restHaptics';
import { track } from '@/platform/telemetry';
import { NOTIFICATION_EVENTS } from '@/platform/events';

/** One stable id: a re-arm replaces, never stacks. */
const NUDGE_ID = 'hush.set_nudge';

export interface SetNudge {
  /**
   * Ask, `afterS` seconds from now, if the set has not been logged by then. Idempotent — any
   * pending ask is cleared first, so arming on a new set can never leave the previous set's
   * question in the queue.
   */
  arm(afterS: number): Promise<void>;
  /** Drop the pending ask (the set was logged, the workout paused, the screen left). */
  disarm(): Promise<void>;
}

async function cancel(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NUDGE_ID).catch(() => {});
}

export const setNudge: SetNudge = {
  async arm(afterS) {
    try {
      await cancel();
      if (!Number.isFinite(afterS) || afterS < 1) return; // expo requires a positive interval
      /* ⛔ NO PERMISSION PROMPT HERE. Standing at a loaded bar is the worst moment in the product
         to raise a system dialog — the same ruling `kilometre` carries for a run. If she never
         allowed notifications the nudge is simply silent in the pocket, and the on-screen line
         still lands the moment she looks. */
      if (!(await hasNotificationPermission())) return;
      await Notifications.scheduleNotificationAsync({
        identifier: NUDGE_ID,
        content: {
          title: tg('notifications.setNudgeTitle'),
          body: tg('notifications.setNudgeBody'),
          data: { kind: 'set_nudge' }, // suppressed in the foreground by the handler
          sound: phoneOwnsRestHaptics(), // silent when the wrist has already tapped
          interruptionLevel: 'timeSensitive', // a pocketed, locked phone must light up
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(afterS), repeats: false },
      });
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'set_nudge', afterS: Math.round(afterS) });
    } catch {
      // never throw — a notification failure must not interrupt a workout
    }
  },

  async disarm() {
    try {
      await cancel();
    } catch {
      /* nothing scheduled / no native module */
    }
  },
};
