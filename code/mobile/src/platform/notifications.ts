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

// 

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tg } from '@/i18n';
import { WEEK_OPEN_DOW, WEEK_OPEN_HOUR, WEEK_OPEN_MINUTE } from '@/domain/weekCadence';
import { GAP_CATCH_DAYS } from '@/domain/gapCatch';
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
/**
 * ⚠️ `watch_workout_saved` ADDED 2026-08-23 under the founder's free hand — and it obeys the same
 * decree the catalogue was cut to: it is a RECEIPT for a fact that has already happened (the km
 * note's own shape), never a reminder. A workout finished on the wrist with the phone away lands
 * here whenever the pair next syncs — often with the phone in a bag — and until now it landed in
 * total silence: the one workout whose save she never SAW. Delivered the instant the record is
 * reconciled, suppressed when the app is foreground (the screen already says it), no sound.
 */
/* ⚠️ `gap_catch` ADDED 2026-09-01 under the same released hand as `training_day` (the founder's
   2026-08-23 "אל תיתן לשום פסיקה או חוק כזה להגביל אותך"): ONE note on day six of a training
   silence, made of a standing measured fact — never "you haven't", never a streak, never guilt.
   The whole argument lives in `domain/gapCatch`; the voice law is enforced by its copy keys. */
/* ⚠️ ROUTABLE kinds only — `set_nudge` and the `rest_*` alerts are deliberately absent. They carry
   a bare `data.kind` (see `restHaptics` / `setNudge`) because there is nowhere to route TO: she is
   already inside the workout the note is about, so a tap just brings the app forward. */
export type NotificationKind =
  | 'weekly_program_ready'
  | 'cardio_km'
  | 'watch_workout_saved'
  | 'training_day'
  /* The day-six note (`domain/gapCatch`). Routes NOWHERE on purpose — like `training_day`, opening
   * the app IS the destination: Home already answers "what do I do today", and a gap under the
   * comeback threshold needs no ceremony in front of it. */
  | 'gap_catch'
  /* One free workout left (see Notifier.syncTrialLast). Routes nowhere for the same reason:
   * Home's own counter and the paywall carry the conversation the moment she opens. */
  | 'trial_last';

export type NotificationIntent =
  | { kind: 'weekly_program_ready' } // -> Program / Weekly Update
  | { kind: 'cardio_km' } // -> the run already on screen; a tap just brings the app forward
  | { kind: 'watch_workout_saved' }; // -> History, where the saved workout now sits

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
  if (kind === 'watch_workout_saved') return { kind: 'watch_workout_saved' };
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
   * is exactly the kind of app Hush is not. Since 2026-09-01 NO caller passes `true` any more:
   * the one honest prompt belongs to WellDone's pre-ask, after the first finished session (§8.2),
   * and it re-arms this letter itself on a yes. Everywhere else: schedule if already granted, and
   * otherwise stay silent.
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
  /**
   * ════ ⛔ THE REMINDER SHE ASKED FOR (founder, 2026-08-23) ════
   *
   * The 2026-07-13 decree — "I do not want a reminder. At all." — was written against the nagging
   * kind every fitness app ships uninvited, and the founder released his old rulings by name:
   * *"אל תיתן לשום פסיקה או חוק כזה להגביל אותך."* What changed is the CONSENT, not the taste: this
   * fires only when SHE flipped the switch in You (off by default), lands only on days her plan
   * actually holds a workout, and states a fact in the product's voice — never "you haven't",
   * never a streak, never guilt.
   *
   * `days` is the full desired set; the sync is idempotent (cancel-then-schedule on stable ids),
   * so callers pass the truth and never diff. Empty/null = opted out → everything cancelled.
   */
  syncTrainingReminders(days: { weekday: number; name: string }[] | null): Promise<void>;
  /**
   * A workout the WRIST ran alone just reconciled into her record (2026-08-23). Delivered NOW —
   * the save is a fact that already happened, exactly like a kilometre. The caller suppresses it
   * when the app is foreground; here it is only gated on permission, never prompted for.
   */
  watchWorkoutSaved(workoutName: string): Promise<void>;
  /**
   * ════ THE CATCH IN THE GAP (2026-09-01) — see `domain/gapCatch` for the whole argument. ════
   *
   * One note, on day six of a training silence, made of a standing fact — never a nag. Re-armed
   * onto ONE stable id after every completed session (training pushes it out; a consistent athlete
   * never sees it) and re-derived at boot. `null` cancels — the sweep half of the sync.
   *
   * `fact` carries display-ready strings (the exercise's English name by product law, the load
   * already converted and unit-labelled by the caller) so this layer stays a mover of strings.
   */
  syncGapCatch(arg: { fireAtMs: number; fact: { name: string; loadLabel: string } | null } | null): Promise<void>;
  /**
   * ════ THE LAST-WORKOUT NOTE (2026-09-01, audit finding 3 / lever 1) ════
   *
   * ONE note, once per install, ~a day after the session that left exactly one free workout in
   * the trial. The promise on the Ready screen ("no card, no charge — not until all N workouts
   * are behind you") warned her at the start; NOTHING warned her near the end, so the wall at
   * session 15 arrived as a surprise — the coldest possible way to meet a payment decision, and
   * the opposite of how Duolingo/Whoop close a trial. A fact, not an offer: the body names what
   * stays hers either way. Re-derived at boot and post-session like the gap catch; `null`
   * cancels (she subscribed, or the wall already stands — Home owns that conversation).
   */
  syncTrialLast(arg: { fireAtMs: number } | null): Promise<void>;
  /** Cancel everything (e.g. on sign-out). */
  cancelAll(): Promise<void>;
}

/** Stable identifiers so re-scheduling is idempotent and cancel is targeted. */
const WEEKLY_ID = 'hush.weekly_program_ready';
const GAP_CATCH_ID = 'hush.gap_catch';
const TRIAL_LAST_ID = 'hush.trial_last';
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
      /* The set nudge is the POCKET's copy of a line the stage already draws (`platform/setNudge`,
         founder 2026-08-30). Foregrounded, she is looking at the screen and it has already told
         her — a banner over the stage would be the same thought, twice, on top of the set. It is
         also dropped from the LIST: an unread notification saying "log your set" found an hour
         later, for a set long since logged, is worse than nothing. */
      if (kind === 'set_nudge') {
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
/* A FUNCTION, not a module constant (2026-09-01): `WEEK_OPEN_DOW` is a live binding now — her
 * preferred opening day — and a trigger frozen at module load would go on firing on Saturday for
 * an athlete whose week turns on Sunday. Re-read at every (re)schedule; boot re-schedules anyway. */
const weeklyTrigger = () => ({
  weekday: WEEK_OPEN_DOW + 1,
  hour: WEEK_OPEN_HOUR,
  minute: WEEK_OPEN_MINUTE,
});

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
          ...weeklyTrigger(),
        },
      });
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'weekly_program_ready', ...weeklyTrigger() });
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

  async syncTrainingReminders(days) {
    try {
      // Idempotent: sweep the seven stable ids, then schedule the truth. A day that moved off the
      // board (the week reshuffled) is swept by construction — no diffing, no drift.
      for (let wd = 1; wd <= 7; wd++) {
        try {
          await Notifications.cancelScheduledNotificationAsync(`hush.training.${wd}`);
        } catch {
          /* nothing scheduled under this id */
        }
      }
      if (!days || days.length === 0) return;
      if (!(await hasNotificationPermission())) return; // never a prompt from a background sync
      for (const d of days) {
        if (!(d.weekday >= 1 && d.weekday <= 7)) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: `hush.training.${d.weekday}`,
          content: {
            title: tg('notifications.trainingTitle', { name: d.name }),
            body: tg('notifications.trainingBody'),
            data: buildPayload('training_day'),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: d.weekday,
            hour: 17,
            minute: 30,
          },
        });
      }
    } catch {
      /* scheduling is best-effort — a missed reminder costs a reminder */
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

  async watchWorkoutSaved(workoutName) {
    try {
      if (!(await hasNotificationPermission())) return;
      await Notifications.scheduleNotificationAsync({
        // One stable id: if two records reconcile in one sync burst, the newest replaces the
        // oldest rather than stacking two banners for one glance at the phone.
        identifier: 'hush.watch_workout_saved',
        content: {
          title: tg('notifications.watchSavedTitle'),
          body: tg('notifications.watchSavedBody', { name: workoutName }),
          data: buildPayload('watch_workout_saved'),
        },
        trigger: null, // now — the save already happened
      });
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'watch_workout_saved' });
    } catch {
      // never throw — reconciliation must not care whether a banner could be shown
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

  async syncGapCatch(arg) {
    try {
      // Idempotent: one stable id — training again replaces the note six days further out.
      await Notifications.cancelScheduledNotificationAsync(GAP_CATCH_ID).catch(() => {});
      if (!arg) {
        void track(NOTIFICATION_EVENTS.canceled, { kind: 'gap_catch' });
        return;
      }
      if (!(await hasNotificationPermission())) return; // never a prompt from a background sync
      const seconds = Math.floor((arg.fireAtMs - Date.now()) / 1000);
      if (seconds <= 60) return; // already due/past — the comeback surface owns her return
      await Notifications.scheduleNotificationAsync({
        identifier: GAP_CATCH_ID,
        content: {
          title: arg.fact
            ? tg('notifications.gapTitle', { name: arg.fact.name, load: arg.fact.loadLabel })
            : tg('notifications.gapTitleNoFact'),
          body: tg('notifications.gapBody', { days: GAP_CATCH_DAYS }),
          data: buildPayload('gap_catch'),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
      });
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'gap_catch', seconds });
    } catch {
      /* scheduling is best-effort — a missed catch costs a catch */
    }
  },

  async syncTrialLast(arg) {
    try {
      // Idempotent like the gap catch: one stable id, cancel-then-schedule.
      await Notifications.cancelScheduledNotificationAsync(TRIAL_LAST_ID).catch(() => {});
      if (!arg) {
        void track(NOTIFICATION_EVENTS.canceled, { kind: 'trial_last' });
        return;
      }
      if (!(await hasNotificationPermission())) return; // never a prompt from a background sync
      const seconds = Math.floor((arg.fireAtMs - Date.now()) / 1000);
      if (seconds <= 60) return; // already due — Home's counter owns the conversation from here
      await Notifications.scheduleNotificationAsync({
        identifier: TRIAL_LAST_ID,
        content: {
          title: tg('notifications.trialLastTitle'),
          body: tg('notifications.trialLastBody'),
          data: buildPayload('trial_last'),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
      });
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'trial_last', seconds });
    } catch {
      /* best-effort — a missed note costs a note */
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
  async syncTrainingReminders() {},
  async syncGapCatch() {},
  async syncTrialLast() {},
  async kilometre() {},
  async watchWorkoutSaved(workoutName) {
    try {
      if (!(await hasNotificationPermission())) return;
      await Notifications.scheduleNotificationAsync({
        // One stable id: if two records reconcile in one sync burst, the newest replaces the
        // oldest rather than stacking two banners for one glance at the phone.
        identifier: 'hush.watch_workout_saved',
        content: {
          title: tg('notifications.watchSavedTitle'),
          body: tg('notifications.watchSavedBody', { name: workoutName }),
          data: buildPayload('watch_workout_saved'),
        },
        trigger: null, // now — the save already happened
      });
      void track(NOTIFICATION_EVENTS.scheduled, { kind: 'watch_workout_saved' });
    } catch {
      // never throw — reconciliation must not care whether a banner could be shown
    }
  },

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
