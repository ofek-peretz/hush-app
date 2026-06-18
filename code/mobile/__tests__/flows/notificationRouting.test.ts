/**
 * Notification tap routing + durable threshold (audit defects 1 & 2).
 *
 * A tapped notification must map to the right intent so Root can deep-link it to
 * Program (1.20) / ThresholdAlert (1.10). The threshold that drives 1.10 must
 * survive a relaunch so a cold-start tap finds it (the screen reads it from the
 * store, hydrated from the durable copy).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { intentFromNotificationData } from '@/platform/notifications';
import { db } from '@/data/local/db';
import type { ThresholdEvent } from '@/data/local/models';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('intentFromNotificationData (pure routing map)', () => {
  it('maps the weekly note payload → Program intent', () => {
    expect(intentFromNotificationData({ intent: 'weekly_program_ready' })).toEqual({
      kind: 'weekly_program_ready',
    });
  });

  it('maps the threshold payload → ThresholdAlert intent', () => {
    expect(intentFromNotificationData({ intent: 'threshold_alert' })).toEqual({
      kind: 'threshold_alert',
    });
  });

  it('is a safe no-op for unknown / missing payloads (no mis-route)', () => {
    expect(intentFromNotificationData({ intent: 'something_else' })).toBeNull();
    expect(intentFromNotificationData({})).toBeNull();
    expect(intentFromNotificationData(null)).toBeNull();
    expect(intentFromNotificationData(undefined)).toBeNull();
  });
});

describe('durable pending threshold (survives relaunch §7.10)', () => {
  const ev: ThresholdEvent = { a: 'hip_dominant', b: 'knee_dominant', kind: 'reorder' };

  it('persists and reloads the crossing, then clears on dismissal', async () => {
    expect(await db.loadPendingThreshold()).toBeNull();
    await db.savePendingThreshold(ev);
    expect(await db.loadPendingThreshold()).toEqual(ev);
    await db.clearPendingThreshold();
    expect(await db.loadPendingThreshold()).toBeNull();
  });

  it('clearAll removes the persisted threshold (no leak across identities)', async () => {
    await db.savePendingThreshold(ev);
    await db.clearAll();
    expect(await db.loadPendingThreshold()).toBeNull();
  });
});
