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
 *  - Quarterly Report: every ~3 months; opens the peak-weight comparison.
 *  - Receipts are NEVER notifications — receipts surface in-session only (§8.6).
 *  - The Weekly Update note fires at the ROLL — Saturday 20:30 local, the exact instant the new
 *    week opens (domain/weekCadence). It is the ONE recurring push this product sends.
 *
 * THE WEEKLY NOTE IS BACK, AND IT IS BACK ON PURPOSE (founder 2026-07-13). It was retired on
 * 2026-07-09 as noise: the plan swapped in silently at Sat 23:59 and the athlete would meet it
 * whenever they next opened the app. But "silently, at midnight" is precisely why the product does
 * not READ as one that manages a program — the single most important thing Hush does for an
 * athlete happened while they were asleep, and by Sunday it was indistinguishable from the app
 * simply looking the way it looks. The note is not a nag and it is not marketing: it is the
 * receipt for the week's work, delivered at the moment the work is folded in. One per week, on the
 * quietest evening of the week, no sound, no badge — and a tap opens the Weekly Update itself.
 *
 * Calm defaults: no sound, no badge (a quiet product, §8.6). Copy flows through
 * i18n (project copy law) — never a string literal here.
 */
import * as Notifications from 'expo-notifications';
import { tg } from '@/i18n';
import { WEEK_OPEN_DOW, WEEK_OPEN_HOUR, WEEK_OPEN_MINUTE } from '@/domain/weekCadence';
import { track } from '@/platform/telemetry';
import { NOTIFICATION_EVENTS } from '@/platform/events';

export type NotificationKind = 'weekly_program_ready' | 'quarterly_report';

export type NotificationIntent =
  | { kind: 'weekly_program_ready' } // -> Program / Weekly Update
  | { kind: 'quarterly_report' }; // -> Progress, windowed to 12 weeks (Root.tsx)

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
  /**
   * Schedule the weekly update note on the roll itself — every Saturday at
   * WEEK_OPEN_HOUR:WEEK_OPEN_MINUTE local (20:30), repeating. A tap opens the Weekly Update.
   * Idempotent: it coalesces onto one stable id, so re-scheduling never stacks.
   *
   * `ask` decides whether this call may RAISE THE iOS PERMISSION DIALOG, and it defaults to false
   * on purpose. This is re-scheduled on every boot (so it self-heals), and a product that opens a
   * system permission prompt in the athlete's face at launch — for a note they never asked for —
   * is exactly the kind of app Hush is not. The prompt is asked ONCE, at the end of onboarding,
   * where the athlete has just chosen to be here. Everywhere else: schedule if already granted,
   * and otherwise stay silent.
   */
  scheduleWeeklyUpdate(ask?: boolean): Promise<void>;
  /** Remove the weekly note (sign-out, or an install that had the old 20:00 one). Idempotent. */
  cancelWeeklyProgramReady(): Promise<void>;
  /** Schedule the recurring quarterly progress report note (every ~3 months). A tap
   *  opens Progress in its 12-week window (`window: 'quarter'`). Idempotent. */
  scheduleQuarterlyReport(): Promise<void>;
  /** Cancel everything (e.g. on sign-out). */
  cancelAll(): Promise<void>;
}

/** Stable identifiers so re-scheduling is idempotent and cancel is targeted. */
const WEEKLY_ID = 'hush.weekly_program_ready';
const QUARTERLY_ID = 'hush.quarterly_report';
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

/**
 * The weekly note's slot — the roll itself, derived from the cadence rather than hardcoded, so the
 * note can never drift away from the thing it announces.
 *
 * iOS weekdays are 1-based from SUNDAY (1=Sun … 7=Sat) while `WEEK_OPEN_DOW` is a JS
 * `Date.getDay()` (0=Sun … 6=Sat) — the +1 is the whole conversion, and getting it wrong would
 * deliver the week's receipt on a Friday. Pinned by a test.
 *
 * WEEKLY, not CALENDAR. Both can express "Saturday at 20:30", but a CALENDAR trigger only recurs
 * if you also remember to pass `repeats: true` — a weekly note that silently fires once and never
 * again is a failure nobody would notice for a week. WEEKLY repeats by construction, and the
 * device's own calendar makes it LOCAL time, which is what "Saturday evening" has to mean.
 */
const WEEKLY_TRIGGER = {
  weekday: WEEK_OPEN_DOW + 1,
  hour: WEEK_OPEN_HOUR,
  minute: WEEK_OPEN_MINUTE,
} as const;

/**
 * Is notification permission ALREADY granted? Reads, never asks — the boot-time re-schedule must
 * be able to arm a note without ever putting a system dialog in front of an athlete who is simply
 * opening the app.
 */
export async function hasNotificationPermission(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted === true;
  } catch {
    return false; // no native module (web / Expo Go) → nothing to schedule
  }
}

/** Real, on-device notifier (active in dev/preview/production builds). */
export const notifierExpo: Notifier = {
  async scheduleWeeklyUpdate(ask = false) {
    try {
      const granted = ask ? await ensureNotificationPermission() : await hasNotificationPermission();
      if (!granted) return;
      // Idempotent: coalesce onto a stable id so re-scheduling (every boot) never stacks.
      await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID).catch(() => {});
      void track(NOTIFICATION_EVENTS.coalesced, { kind: 'weekly_program_ready' });
      await Notifications.scheduleNotificationAsync({
        identifier: WEEKLY_ID,
        content: {
          title: tg('notifications.weeklyReadyTitle'),
          body: tg('notifications.weeklyReadyBody'),
          data: buildPayload('weekly_program_ready'),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          ...WEEKLY_TRIGGER,
        },
      });
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'weekly_program_ready', ...WEEKLY_TRIGGER });
    } catch {
      // never throw — a notification failure must not break boot
    }
  },

  async cancelWeeklyProgramReady() {
    try {
      await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID);
      void track(NOTIFICATION_EVENTS.canceled, { kind: 'weekly_program_ready' });
    } catch {
      /* nothing scheduled / no native module */
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
        // data carries the routing intent so a tap opens Progress (12-week window).
        content: { title: tg('notifications.quarterlyReportTitle'), body: '', data: buildPayload('quarterly_report') },
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
  async scheduleWeeklyUpdate() {},
  async cancelWeeklyProgramReady() {},
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
 * Consume the native "last notification response". It survives until cleared, so a tap
 * that has already been ROUTED must be consumed — otherwise a later manual launch reads
 * it again and deep-links the athlete somewhere they never asked to go. Called on BOTH
 * routing paths (the cold-start read below and Root's stash-and-flush). Never throws.
 */
export async function consumeLastNotificationResponse(): Promise<void> {
  try {
    await Notifications.clearLastNotificationResponseAsync();
  } catch {
    /* older module without clear — the per-process cold-start guard still bounds it */
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
    if (intent) {
      void track(NOTIFICATION_EVENTS.opened, { kind: intent.kind, coldStart: true });
      await consumeLastNotificationResponse();
    }
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
