/**
 * Telemetry pipeline + secure token storage (alpha observability/hardening).
 */
// @ts-nocheck

// 

// (The v4 `@/data/api/config` mock lived here. The module is deleted; nothing to mock.)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { track, trackFirst, flush, shipToSink, __resetForTest, __setSinkUrlForTest } from '@/platform/telemetry';
import { db } from '@/data/local/db';

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetForTest();
  __setSinkUrlForTest(''); // each suite opts into a sink explicitly
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

describe('telemetry flush — the journal contract (v4 sink deleted, 2026-08-25)', () => {
  /*
   * `flush()` used to POST to the v4 backend's /telemetry and clear what shipped. That sink is
   * gone (founder: "איזה V4? אנחנו ב-v8"), and in every real build it was unreachable anyway —
   * no base URL was ever set, so the journal was already the whole record in the field. The
   * contract its ~10 "ship before the wipe" call sites rely on is now: nothing recorded is lost,
   * nothing leaves the device, and the journal stays bounded.
   */
  it('keeps the record on the device — with no sink configured, flush persists and never fetches', async () => {
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchSpy;
    await track('enrolled', {});
    await flush();
    expect(await db.loadTelemetry()).toHaveLength(1); // delivered = durably journaled
    expect(fetchSpy).not.toHaveBeenCalled(); // no URL, no wire — a build without a sink says so
    expect(await db.loadTelemetryOutbox()).toHaveLength(0); // and no outbox accumulates for nobody
  });

  it('a crash event survives a flush — the case the wipe call sites exist for', async () => {
    await track('crash', { message: 'x' });
    await flush();
    expect(await db.loadTelemetry()).toHaveLength(1);
  });
});

/*
 * The 'secure token storage' suite ended here. It round-tripped `config.setToken` through
 * SecureStore — the vault for the v4 backend's bearer token. The module is deleted; the only
 * token Hush holds today is the circle session's, vaulted by `platform/circleClient` and covered
 * by its own tests.
 */

describe('the sink — the wire the journal never had (2026-09-01)', () => {
  /*
   * With a URL configured, `track` grows an OUTBOX beside the journal and `flush` ships it.
   * The journal's own contract above is untouched: it never shrinks on delivery, and a failed
   * ship costs nothing but a retry at the next flush.
   */
  const okResponse = { ok: true, status: 204 };

  it('ships the outbox on flush and empties it on success — the journal stays whole', async () => {
    __setSinkUrlForTest('https://sink.example/events');
    const fetchSpy = jest.fn(async () => okResponse);
    (global as unknown as { fetch: jest.Mock }).fetch = fetchSpy;
    await track('enrolled');
    await track('paywall_viewed', { source: 'gate' });
    expect(await db.loadTelemetryOutbox()).toHaveLength(2);
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1); // one batch, one POST
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.v).toBe(1);
    expect(body.events.map((e) => e.type)).toEqual(['enrolled', 'paywall_viewed']);
    expect(await db.loadTelemetryOutbox()).toHaveLength(0); // delivered
    expect(await db.loadTelemetry()).toHaveLength(2); // the journal never shrinks on delivery
  });

  it('⚠️ a funnel event ships THE MOMENT it happens — the abandoner never reaches a flush (audit 2)', async () => {
    __setSinkUrlForTest('https://sink.example/events');
    const fetchSpy = jest.fn(async () => okResponse);
    (global as unknown as { fetch: jest.Mock }).fetch = fetchSpy;
    await track('funnel_start_reached');
    // No flush was called. The event is already on the wire: the funnel's whole audience is the
    // athlete who abandons, and she, by definition, never reaches the screens that flush.
    await new Promise((r) => setTimeout(r, 0)); // the ship is fire-and-forget; let it land
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await db.loadTelemetryOutbox()).toHaveLength(0);
    expect(await db.loadTelemetry()).toHaveLength(1); // the journal, as ever, keeps its copy
  });

  it('a sink failure keeps the outbox — the next flush retries', async () => {
    __setSinkUrlForTest('https://sink.example/events');
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({ ok: false, status: 502 }));
    await track('enrolled');
    await flush();
    expect(await db.loadTelemetryOutbox()).toHaveLength(1); // nothing was lost to a bad sink
  });

  it('offline (fetch throws) is silent and lossless — telemetry may never crash the app', async () => {
    __setSinkUrlForTest('https://sink.example/events');
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    await track('enrolled');
    await expect(flush()).resolves.toBeUndefined(); // no throw reaches a caller
    expect(await db.loadTelemetryOutbox()).toHaveLength(1);
    // ...and the moment the network returns, the same events deliver.
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => okResponse);
    expect(await shipToSink()).toBe(true);
    expect(await db.loadTelemetryOutbox()).toHaveLength(0);
  });
});
