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
 *  - Receipts are NEVER notifications — receipts surface in-session only (§8.6).
 *  - The Weekly Update note fires at the ROLL — Saturday 20:30 local, the exact instant the new
 *    week opens (domain/weekCadence). It is the ONE recurring CALENDAR push this product sends.
 *  - The kilometre note is not scheduled at all — it is delivered the instant a split closes.
 *  - THERE IS NO REMINDER, of any kind, ever (founder 2026-07-29). See NotificationKind.
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tg } from '@/i18n';
import { WEEK_OPEN_DOW, WEEK_OPEN_HOUR, WEEK_OPEN_MINUTE } from '@/domain/weekCadence';
import { track } from '@/platform/telemetry';
import { NOTIFICATION_EVENTS } from '@/platform/events';

/**
 * ════ THE WHOLE CATALOGUE (founder 2026-07-29) ════
 *
 * "I do not want a reminder. At all. Only: rest about to end, rest over, the Saturday update we
 * designed, and one for each kilometre in cardio."
 *
 * That is four, and it is exhaustive. Two of them are the REST backstop and live in
 * `platform/restHaptics` (they are anchored to an instant, not to a calendar, and they are
 * cancelled the moment the rest ends). The two that live here are the Saturday letter and the
 * kilometre. A **quarterly report** note used to be here as well — it was not on the founder's
 * list, and the one screen that announced it (8.2) no longer promises it, so it is gone. The
 * twelve-week window it opened is still a place she can walk to on Progress; nothing pushes it.
 */
export type NotificationKind = 'weekly_program_ready' | 'cardio_km';

export type NotificationIntent =
  | { kind: 'weekly_program_ready' } // -> Program / Weekly Update
  | { kind: 'cardio_km' }; // -> the run already on screen; a tap just brings the app forward

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
  if (kind === 'cardio_km') return { kind: 'cardio_km' };
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
  /**
   * Cancel notes this build no longer sends but a PREVIOUS build already scheduled on the device.
   *
   * Deleting the code that schedules a repeating note does not cancel the note: it is sitting in
   * iOS's own queue and will go on firing every twelve weeks, forever, on every install that has
   * it — with copy this build no longer even contains. Retiring a recurring push is therefore two
   * jobs, and this is the second one. Called on every boot; a no-op once the queue is clean.
   */
  cancelRetiredNotes(): Promise<void>;
  /**
   * A kilometre just closed on a run — delivered NOW, so a pocketed phone says it (founder
   * 2026-07-29). It is the only note in the product that is not scheduled ahead: the split is a
   * fact that has already happened, and the tracker calls this the instant it happens.
   * Suppressed while the app is in the foreground — 3.4b is already on screen saying it.
   */
  kilometre(km: number, paceLabel: string): Promise<void>;
  /** Cancel everything (e.g. on sign-out). */
  cancelAll(): Promise<void>;
}

/** Stable identifiers so re-scheduling is idempotent and cancel is targeted. */
const WEEKLY_ID = 'hush.weekly_program_ready';
/** Ids this build no longer schedules — swept on boot (see `cancelRetiredNotes`). */
const RETIRED_IDS = ['hush.quarterly_report'] as const;

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

/**
 * 8.2 · THE HONEST ASK — has the athlete already been asked, in our own words?
 *
 * iOS grants ONE system prompt. The pre-ask (screens/onboarding/NotificationAsk) exists so that
 * prompt is only ever spent on someone who has already said yes to us in plain language — so this
 * flag is set the moment she ANSWERS, whichever way she answers. Asking a second time would be the
 * nagging the screen is written to avoid.
 */
const ASKED_KEY = 'hush.notifications.asked';

/** True only when the pre-ask has never been shown AND iOS has not already decided. */
export async function shouldAskForNotifications(): Promise<boolean> {
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return false;
    // Already granted, or already denied beyond asking → there is nothing left to ask for.
    const current = await Notifications.getPermissionsAsync();
    return !current.granted && current.canAskAgain !== false;
  } catch {
    return false; // no native module (web / Expo Go) — never block a completion screen on this
  }
}

/** Remember that she answered, either way. */
export async function markNotificationsAsked(): Promise<void> {
  try {
    await AsyncStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* a lost flag costs one extra ask, never a crash */
  }
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

  async kilometre(km, paceLabel) {
    try {
      // No permission PROMPT here — a run is the worst possible moment to put a system dialog in
      // front of someone. If she never allowed notifications, the kilometre is simply silent (the
      // on-screen moment and the haptic still land).
      if (!(await hasNotificationPermission())) return;
      await Notifications.scheduleNotificationAsync({
        // Each kilometre is its own note: they are a RECORD of the run, and coalescing them onto
        // one id would erase km 3 the moment km 4 landed.
        identifier: `hush.cardio_km.${km}`,
        content: {
          title: tg('notifications.kmTitle', { km }),
          body: tg('notifications.kmBody', { pace: paceLabel }),
          data: buildPayload('cardio_km'),
        },
        trigger: null, // now
      });
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'cardio_km', km });
    } catch {
      // never throw — a notification failure must not interrupt a run
    }
  },

  async cancelRetiredNotes() {
    for (const id of RETIRED_IDS) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
        void track(NOTIFICATION_EVENTS.canceled, { kind: id });
      } catch {
        /* not scheduled on this device — the common case, and the goal */
      }
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
  async kilometre() {},
  async cancelRetiredNotes() {},
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
 * running), or null. Used once at launch to deep-link to the Weekly Update.
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
