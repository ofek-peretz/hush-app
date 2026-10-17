/**
 * Local notification lifecycle → research dataset. Payload schema + scheduled /
 * coalesced / canceled events flow through the durable telemetry pipeline so the
 * full lifecycle is reconstructable. (Granted-permission mock so scheduling runs.)
 */
// @ts-nocheck

// 

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
 * THE WEEK'S RECEIPT — AND WHEN IT ARRIVES (the rotation, founder 2026-09-28).
 *
 * It was a repeating Saturday 20:30 note, the instant the calendar week opened. Her week closes when
 * she finishes it now, so the repeating note is RETIRED (every install from before the rotation has
 * it armed, so re-scheduling sweeps it) and the receipt is ONE-SHOT, armed by the roll.
 */
describe('the weekly note: the Saturday slot is retired, the week-closed note is one-shot', () => {
  it('re-scheduling the old note cancels the repeating trigger and schedules nothing', async () => {
    await notifier.scheduleWeeklyUpdate();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    await settle();
    expect(await loggedTypes()).toContain(NOTIFICATION_EVENTS.canceled); // the sweep is recorded
  });

  it('the week-closed note fires once, at the instant it was given, and routes to the Weekly Update', async () => {
    const fireAt = Date.now() + 10 * 60 * 60 * 1000;
    await notifier.scheduleWeekClosed(fireAt);
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.at(-1)![0];
    expect(call.trigger.type).toBe('timeInterval');
    expect(Math.abs(call.trigger.seconds - 10 * 60 * 60)).toBeLessThanOrEqual(2);
    expect(call.content.data).toEqual(buildPayload('weekly_program_ready'));
    expect(call.content.title).toBeTruthy();
    expect(call.content.body).toBeTruthy();
  });

  it('a second close before it fires replaces it — one id, never a stack', async () => {
    await notifier.scheduleWeekClosed(Date.now() + 5 * 60 * 60 * 1000);
    await notifier.scheduleWeekClosed(Date.now() + 9 * 60 * 60 * 1000);
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

  it('a granted install is never asked at boot — and the retired Saturday note is not re-armed', async () => {
    await notifier.scheduleWeeklyUpdate();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
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
