/**
 * Local notification lifecycle → research dataset. Payload schema + scheduled /
 * coalesced / canceled events flow through the durable telemetry pipeline so the
 * full lifecycle is reconstructable. (Granted-permission mock so scheduling runs.)
 */
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly' },
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  scheduleNotificationAsync: jest.fn(async () => 'mock-id'),
  cancelScheduledNotificationAsync: async () => {},
  cancelAllScheduledNotificationsAsync: async () => {},
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  getLastNotificationResponseAsync: async () => null,
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifier, buildPayload, NOTIF_PAYLOAD_VERSION } from '@/platform/notifications';
import { db } from '@/data/local/db';
import { __resetForTest } from '@/platform/telemetry';
import { NOTIFICATION_EVENTS } from '@/platform/events';

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetForTest();
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

describe('notification lifecycle telemetry', () => {
  it('scheduling the weekly note records coalesced + scheduled', async () => {
    await notifier.scheduleWeeklyProgramReady();
    await settle();
    const types = await loggedTypes();
    expect(types).toContain(NOTIFICATION_EVENTS.coalesced);
    expect(types).toContain(NOTIFICATION_EVENTS.scheduled);
  });

  it('cancelAll records a canceled event', async () => {
    await notifier.cancelAll();
    await settle();
    expect(await loggedTypes()).toContain(NOTIFICATION_EVENTS.canceled);
  });
});
