/**
 * Local notification lifecycle → research dataset. Payload schema + scheduled /
 * coalesced / canceled events flow through the durable telemetry pipeline so the
 * full lifecycle is reconstructable. (Granted-permission mock so scheduling runs.)
 */
// Mutable so a test can revoke permission and assert what the app does WITHOUT it.
const permission = { granted: true, canAskAgain: true };

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', CALENDAR: 'calendar', TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler: () => {},
  getPermissionsAsync: jest.fn(async () => permission),
  requestPermissionsAsync: jest.fn(async () => permission),
  scheduleNotificationAsync: jest.fn(async () => 'mock-id'),
  cancelScheduledNotificationAsync: async () => {},
  cancelAllScheduledNotificationsAsync: async () => {},
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  getLastNotificationResponseAsync: async () => null,
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { notifier, buildPayload, NOTIF_PAYLOAD_VERSION } from '@/platform/notifications';
import { WEEK_OPEN_DOW, WEEK_OPEN_HOUR, WEEK_OPEN_MINUTE } from '@/domain/weekCadence';
import { initI18n } from '@/i18n';
import { db } from '@/data/local/db';
import { __resetForTest } from '@/platform/telemetry';
import { NOTIFICATION_EVENTS } from '@/platform/events';

// The note's copy comes from i18n (`tg`) — an uninitialised copy layer would schedule a note with
// no title, which is exactly the bug this suite exists to catch.
beforeAll(async () => {
  await initI18n();
});

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetForTest();
  (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
  (Notifications.requestPermissionsAsync as jest.Mock).mockClear();
  permission.granted = true;
  permission.canAskAgain = true;
});

/** The notifier records telemetry fire-and-forget (`void track`). Drain pending
 *  microtasks so the durable write lands before we read it. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

async function loggedTypes(): Promise<string[]> {
  return (await db.loadTelemetry<{ type: string }>()).map((e) => e.type);
}

describe('notification payload schema (versioned, reconstructable)', () => {
  it('carries the routing intent + a payload version', () => {
    expect(buildPayload('weekly_program_ready')).toEqual({ intent: 'weekly_program_ready', v: NOTIF_PAYLOAD_VERSION });
  });
});

/**
 * THE WEEK'S RECEIPT (founder 2026-07-13). The one recurring push this product sends, and it must
 * land on the roll ITSELF — Saturday 20:30 local, the instant the new week opens. If the trigger
 * ever drifts from `domain/weekCadence`, the note announces an update that has not happened yet
 * (or arrives long after the athlete has already seen it), which is worse than no note at all.
 */
describe('the weekly update note fires on the roll', () => {
  it('is a WEEKLY trigger on the exact week-open instant — repeating by construction', async () => {
    await notifier.scheduleWeeklyUpdate();
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.at(-1)![0];
    expect(call.trigger).toEqual({
      type: 'weekly', // never CALENDAR: that one only recurs if somebody remembers `repeats: true`
      // iOS weekdays are 1-based from Sunday; WEEK_OPEN_DOW is a JS getDay() (0=Sun).
      weekday: WEEK_OPEN_DOW + 1,
      hour: WEEK_OPEN_HOUR,
      minute: WEEK_OPEN_MINUTE,
    });
    expect(call.trigger.weekday).toBe(7); // Saturday
    expect([call.trigger.hour, call.trigger.minute]).toEqual([20, 30]);
  });

  it('a tap on it can only lead to the Weekly Update (the payload is the routing)', async () => {
    await notifier.scheduleWeeklyUpdate();
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.at(-1)![0];
    expect(call.content.data).toEqual(buildPayload('weekly_program_ready'));
    expect(call.content.title).toBeTruthy();
    expect(call.content.body).toBeTruthy();
  });

  it('re-scheduling coalesces onto one id — a note per week, never a stack', async () => {
    await notifier.scheduleWeeklyUpdate();
    await notifier.scheduleWeeklyUpdate();
    await settle();
    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
    const ids = new Set(calls.map((c) => c[0].identifier));
    expect(ids.size).toBe(1);
    expect(await loggedTypes()).toContain(NOTIFICATION_EVENTS.coalesced);
  });
});

/**
 * A PERMISSION DIALOG IS NOT A GREETING. The weekly note is re-scheduled on EVERY boot (so it
 * self-heals a lost note), which means the boot path must never be able to raise the iOS prompt —
 * an athlete opening the app to train would be met by a system dialog for a note they never asked
 * for. The prompt is asked exactly once, at the end of onboarding.
 */
describe('the permission is asked once, and never at launch', () => {
  it('boot re-scheduling READS the permission and never requests it', async () => {
    permission.granted = false;
    await notifier.scheduleWeeklyUpdate(); // the boot call — no `ask`
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('onboarding — and only onboarding — may ask', async () => {
    permission.granted = false;
    await notifier.scheduleWeeklyUpdate(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('a granted install arms the note at boot without a word', async () => {
    await notifier.scheduleWeeklyUpdate();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
  });
});

describe('notification lifecycle telemetry', () => {
  it('canceling the weekly note records a canceled event', async () => {
    await notifier.cancelWeeklyProgramReady();
    await settle();
    expect(await loggedTypes()).toContain(NOTIFICATION_EVENTS.canceled);
  });

  it('cancelAll records a canceled event', async () => {
    await notifier.cancelAll();
    await settle();
    expect(await loggedTypes()).toContain(NOTIFICATION_EVENTS.canceled);
  });
});
