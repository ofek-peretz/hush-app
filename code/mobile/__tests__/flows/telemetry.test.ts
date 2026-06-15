/**
 * Telemetry pipeline + secure token storage (alpha observability/hardening).
 */
jest.mock('@/data/api/config', () => ({
  getBaseUrl: () => 'http://test',
  getToken: async () => 'tok',
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { track, trackFirst, flush, __resetForTest } from '@/platform/telemetry';
import { db } from '@/data/local/db';

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetForTest();
});

describe('telemetry buffering', () => {
  it('persists events durably with the full research envelope', async () => {
    await track('set_completed', { sessionId: 'ws_1', reps: 5 });
    await track('forecast_resolved', { hit: true });
    const buffered = await db.loadTelemetry<Record<string, unknown>>();
    expect(buffered.map((e) => e.type)).toEqual(['set_completed', 'forecast_resolved']);
    const e0 = buffered[0];
    expect(typeof e0.event_id).toBe('string'); // idempotent dedupe key
    expect(typeof e0.client_ts).toBe('string'); // wall clock
    expect(typeof e0.client_monotonic).toBe('number'); // ordering immune to clock skew
    expect(typeof e0.seq).toBe('number');
    expect(e0.session_id).toBe('ws_1'); // promoted from data.sessionId → joinable column
    expect(typeof e0.os).toBe('string'); // device context for cohorting
    expect(typeof e0.device_id).toBe('string');
  });

  it('trackFirst fires an event at most once per install', async () => {
    await trackFirst('first_portrait_viewed');
    await trackFirst('first_portrait_viewed');
    const buffered = await db.loadTelemetry<{ type: string }>();
    expect(buffered.filter((e) => e.type === 'first_portrait_viewed')).toHaveLength(1);
    expect(await db.hasFirst('first_portrait_viewed')).toBe(true);
  });
});

describe('telemetry flush', () => {
  it('ships the buffer to /telemetry and clears it on success', async () => {
    let posted: unknown = null;
    (global as { fetch: jest.Mock }).fetch = jest.fn(async (url: string, init: { body: string }) => {
      if (url.endsWith('/telemetry')) posted = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ accepted: 1 }) };
    });
    await track('enrolled', {});
    await flush();
    expect(posted).toHaveProperty('events');
    expect(await db.loadTelemetry()).toHaveLength(0);
  });

  it('keeps the buffer when the sink is unreachable', async () => {
    (global as { fetch: jest.Mock }).fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    await track('crash', { message: 'x' });
    await flush();
    expect(await db.loadTelemetry()).toHaveLength(1); // not lost
  });
});

describe('secure token storage', () => {
  it('round-trips the token via SecureStore (not AsyncStorage)', async () => {
    const { setToken, getToken, clearToken } = jest.requireActual('@/data/api/config');
    await setToken('secret-token');
    expect(await getToken()).toBe('secret-token');
    // never written to AsyncStorage
    expect(await AsyncStorage.getItem('hush_auth_token')).toBeNull();
    await clearToken();
    expect(await getToken()).toBeNull();
  });
});
