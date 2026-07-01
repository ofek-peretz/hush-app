/**
 * Notifications (spec §8.6, §1.25, §7.7).
 *
 * LOCAL notifications only — these do NOT require an Apple Push (APNs) key or
 * any Apple Developer remote-notification capability. They are scheduled and
 * delivered entirely on-device, so this surface is fully wired now and works in
 * any EAS dev/preview/production build without an Apple Developer account. (A
 * future remote/push channel would need APNs + the aps-environment entitlement;
 * that is explicitly out of scope for v1.)
 *
 * Contract (do not violate):
 *  - Weekly Program Ready: 20:00 LOCAL, title "Next week's program is ready.",
 *    opens the v4 Weekly Update (1.20). Weekly-repeating.
 *  - Quarterly Report: every ~3 months; opens the peak-weight comparison.
 *  - Receipts are NEVER notifications — receipts surface in-session only (§8.6).
 *
 * Calm defaults: no sound, no badge (a quiet product, §8.6). Copy flows through
 * i18n (project copy law) — never a string literal here.
 */
import * as Notifications from 'expo-notifications';
import i18next from 'i18next';
import { track } from '@/platform/telemetry';
import { NOTIFICATION_EVENTS } from '@/platform/events';

export type NotificationKind = 'weekly_program_ready' | 'quarterly_report';

export type NotificationIntent =
  | { kind: 'weekly_program_ready' } // -> Program / Weekly Update
  | { kind: 'quarterly_report' }; // -> QuarterlyReport

/**
 * Notification payload schema (the `content.data` dictionary). Versioned so a
 * future expansion (new kinds, richer routing) stays reconstructable and a payload
 * written by a newer build is parsed conservatively by an older one. Parsing is
 * intentionally tolerant of a MISSING version (v1 shipped without one).
 *
 * To add a kind later: extend NotificationKind + NotificationIntent, add it to
 * intentFromNotificationData, and route it in Root.routeNotificationIntent. The
 * payload shape does not otherwise change.
 */
export const NOTIF_PAYLOAD_VERSION = 1 as const;

/** Data key carried on every scheduled notification so a tap can be routed. */
const INTENT_KEY = 'intent';

/** Build the (versioned) data payload for a notification of `kind`. */
export function buildPayload(kind: NotificationKind): Record<string, unknown> {
  return { [INTENT_KEY]: kind, v: NOTIF_PAYLOAD_VERSION };
}

/**
 * Map a notification's `data` payload to a routing intent (pure; unit-tested).
 * Unknown/missing payloads return null so a tap on an unrelated notification is
 * a no-op rather than a mis-route.
 */
export function intentFromNotificationData(data: unknown): NotificationIntent | null {
  const kind = (data as { [k: string]: unknown } | null | undefined)?.[INTENT_KEY];
  if (kind === 'weekly_program_ready') return { kind: 'weekly_program_ready' };
  if (kind === 'quarterly_report') return { kind: 'quarterly_report' };
  return null;
}

/** Extract the intent from an expo NotificationResponse (defensive). */
function intentFromResponse(response: unknown): NotificationIntent | null {
  const data = (response as { notification?: { request?: { content?: { data?: unknown } } } } | null)
    ?.notification?.request?.content?.data;
  return intentFromNotificationData(data);
}

export interface Notifier {
  /** Schedule the calm weekly note at 20:00 local. Idempotent. `sessionCount`
   *  (the week's workout count) personalizes the body per §4.31 when known. */
  scheduleWeeklyProgramReady(sessionCount?: number): Promise<void>;
  /** Schedule the recurring quarterly progress report note (every ~3 months). A tap
   *  opens the QuarterlyReport comparison screen. Idempotent. */
  scheduleQuarterlyReport(): Promise<void>;
  /** Cancel everything (e.g. on sign-out). */
  cancelAll(): Promise<void>;
}

/** Stable identifiers so re-scheduling is idempotent and cancel is targeted. */
const WEEKLY_ID = 'hush.weekly_program_ready';
const QUARTERLY_ID = 'hush.quarterly_report';
const WEEKLY_HOUR = 20; // 20:00 local (§8.6)
const QUARTERLY_INTERVAL_S = 12 * 7 * 24 * 60 * 60; // ~3 months, repeating

/**
 * Calm foreground presentation: show the banner, but never play a sound or set
 * a badge. Set once at module load; harmless under test (the native call is
 * mocked / a no-op). Wrapped because it is unavailable until the native module
 * is present (Expo Go / web).
 */
try {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = (notification as { request?: { content?: { data?: { kind?: unknown } } } })
        ?.request?.content?.data;
      const kind = typeof data?.kind === 'string' ? data.kind : '';
      // Rest alerts (rest_warn / rest_done) are the LOCKED/BACKGROUND backstop for the
      // 7 s warning + rest-over cue. In the FOREGROUND the in-app Core Haptics countdown
      // already fires, so present nothing here — no double buzz, no banner over the stage.
      if (kind.startsWith('rest_')) {
        return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      }
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
    },
  });
} catch {
  /* native module unavailable — handler is a no-op until a real build */
}

/** Request notification permission once; never throws. Shared with the rest-haptics
 *  backstop (`platform/restHaptics.ts`) so both surfaces use one permission path. */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain === false) {
      void track(NOTIFICATION_EVENTS.permissionDenied, { canAskAgain: false });
      return false;
    }
    const req = await Notifications.requestPermissionsAsync();
    if (!req.granted) void track(NOTIFICATION_EVENTS.permissionDenied, { canAskAgain: true });
    return req.granted;
  } catch {
    return false; // no native module / denied → silently skip, never block the flow
  }
}

/** Real, on-device notifier (active in dev/preview/production builds). */
export const notifierExpo: Notifier = {
  async scheduleWeeklyProgramReady(sessionCount?: number) {
    try {
      if (!(await ensureNotificationPermission())) return;
      // Idempotent: clear any prior weekly before re-scheduling (a re-anchor
      // coalesces onto the same stable id rather than stacking).
      await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID).catch(() => {});
      void track(NOTIFICATION_EVENTS.coalesced, { kind: 'weekly_program_ready' });
      // Anchor the weekly cadence to the day the plan became ready, at 20:00
      // local. JS getDay() is 0–6 (Sun–Sat); expo weekday is 1–7 (Sun–Sat).
      const weekday = new Date().getDay() + 1;
      // Body per §4.31 (pluralized; generic when the count is unknown).
      const body =
        sessionCount == null || sessionCount <= 0
          ? i18next.t('notifications.weeklyReadyBodyGeneric')
          : sessionCount === 1
            ? i18next.t('notifications.weeklyReadyBodyOne')
            : i18next.t('notifications.weeklyReadyBody', { count: sessionCount });
      await Notifications.scheduleNotificationAsync({
        identifier: WEEKLY_ID,
        // data carries the routing intent so a tap opens Program (§4.31).
        content: { title: i18next.t('notifications.weeklyReadyTitle'), body, data: buildPayload('weekly_program_ready') },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: WEEKLY_HOUR,
          minute: 0,
        },
      });
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'weekly_program_ready', weekday, hour: WEEKLY_HOUR });
    } catch {
      // never throw — a notification failure must not break onboarding
    }
  },

  async scheduleQuarterlyReport() {
    try {
      if (!(await ensureNotificationPermission())) return;
      // Idempotent: coalesce onto a stable id so re-scheduling never stacks.
      await Notifications.cancelScheduledNotificationAsync(QUARTERLY_ID).catch(() => {});
      void track(NOTIFICATION_EVENTS.coalesced, { kind: 'quarterly_report' });
      await Notifications.scheduleNotificationAsync({
        identifier: QUARTERLY_ID,
        // data carries the routing intent so a tap opens QuarterlyReport.
        content: { title: i18next.t('notifications.quarterlyReportTitle'), body: '', data: buildPayload('quarterly_report') },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: QUARTERLY_INTERVAL_S,
          repeats: true,
        },
      });
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'quarterly_report', seconds: QUARTERLY_INTERVAL_S });
    } catch {
      // never throw — a notification failure must not break onboarding
    }
  },

  async cancelAll() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      void track(NOTIFICATION_EVENTS.canceled, {});
    } catch {
      /* nothing scheduled / no native module */
    }
  },
};

/** v1 no-op stub — the swap point for tests and any non-native environment. */
export const notifierStub: Notifier = {
  async scheduleWeeklyProgramReady() {},
  async scheduleQuarterlyReport() {},
  async cancelAll() {},
};

/**
 * Active notifier. Real expo-notifications implementation — local notifications
 * need no Apple Developer access and work in every EAS build. Every method is
 * defensively wrapped, so on a platform without the native module (web) it
 * degrades to a no-op rather than throwing.
 */
export const notifier: Notifier = notifierExpo;

/**
 * Subscribe to notification TAPS and route them via `handler`. Returns an
 * unsubscribe fn. Defensively wrapped — on a platform without the native module
 * it is a no-op rather than a throw.
 */
export function addNotificationResponseListener(
  handler: (intent: NotificationIntent) => void,
): () => void {
  try {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const intent = intentFromResponse(response);
      if (intent) {
        void track(NOTIFICATION_EVENTS.opened, { kind: intent.kind, coldStart: false });
        handler(intent);
      }
    });
    return () => {
      try {
        sub.remove();
      } catch {
        /* already removed / no native module */
      }
    };
  } catch {
    return () => {};
  }
}

/**
 * The intent of the notification the app was COLD-STARTED from (tapped while not
 * running), or null. Used once at launch to deep-link to the Weekly Update / Quarterly Report.
 */
export async function getInitialNotificationIntent(): Promise<NotificationIntent | null> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    const intent = intentFromResponse(response);
    if (intent) void track(NOTIFICATION_EVENTS.opened, { kind: intent.kind, coldStart: true });
    return intent;
  } catch {
    return null;
  }
}

/**
 * Subscribe to FOREGROUND deliveries (the only delivery JS can observe for local
 * notifications) → telemetry. With the calm handler the banner still shows; this
 * just records that a delivery happened so the dataset can reconstruct
 * delivered-vs-opened (an "ignored" notification = delivered, never opened).
 * Returns an unsubscribe fn; a no-op where the native module is absent.
 */
export function addNotificationDeliveryListener(): () => void {
  try {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = (notification as { request?: { content?: { data?: unknown } } })?.request?.content?.data;
      const intent = intentFromNotificationData(data);
      void track(NOTIFICATION_EVENTS.delivered, { kind: intent?.kind ?? 'unknown' });
    });
    return () => {
      try {
        sub.remove();
      } catch {
        /* already removed / no native module */
      }
    };
  } catch {
    return () => {};
  }
}
