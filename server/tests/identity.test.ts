/**
 * hush-identity — the routes, driven for real (2026-09-01, audit finding 6's missing half).
 *
 * The worker is import-free and self-contained, so Node 24's native type-stripping runs it as-is:
 * an in-memory KV, a permissive rate limiter, and `Request` objects straight into `fetch`. These
 * are not unit tests of helpers — they are the worker's actual front door, which is the thing that
 * was deployed for months with zero coverage.
 *
 * Run: `node --test server/tests/` (wired as `npm run test:server` in code/mobile, and in CI).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../hush-identity/src/index.ts';

function memKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string, opts?: unknown) {
      const v = store.get(key) ?? null;
      if (v != null && opts === 'json') return JSON.parse(v);
      if (v != null && typeof opts === 'object' && opts != null) return v; // cacheTtl form
      return v;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

function env(extra: Record<string, unknown> = {}) {
  return {
    HUSH_KV: memKv(),
    ID_LIMIT: { limit: async () => ({ success: true }) },
    PAIR_ROOM: { idFromName: () => ({}), get: () => ({ fetch: async () => new Response(null) }) },
    ...extra,
  } as never;
}

const BASE = 'https://hush-identity.test';
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('the front door and the legal pages answer', async () => {
  const e = env();
  for (const path of ['/', '/privacy', '/terms', '/plan?p=abc']) {
    const res = await worker.fetch(new Request(`${BASE}${path}`), e);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  }
  const privacy = await (await worker.fetch(new Request(`${BASE}/privacy`), env())).text();
  // The policy must name its processors — the audit's finding 4 was that it named none.
  for (const name of ['Google', 'PostHog', 'Sentry', 'Cloudflare']) assert.match(privacy, new RegExp(name));
});

test('an unarmed sink says so — 503, never a lying 204 (audit finding 2)', async () => {
  const res = await worker.fetch(post('/events', { v: 1, events: [{ type: 'probe' }] }), env());
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'sink_unarmed' });
});

test('an armed sink forwards the allow-list and NOTHING a tampered client adds', async () => {
  let forwarded: { api_key?: string; batch?: Record<string, unknown>[] } | null = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    forwarded = JSON.parse(String(init?.body));
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    const res = await worker.fetch(
      post('/events', {
        v: 1,
        events: [{ type: 'app_open', device_id: 'd1', session_id: 's1', data: { kind: 'cold' }, injected: 'evil' }],
      }),
      env({ EVENTS_URL: 'https://sink.example/batch', EVENTS_KEY: 'k' }),
    );
    assert.equal(res.status, 204);
    assert.equal(forwarded!.batch!.length, 1);
    const ev = forwarded!.batch![0] as { event: string; distinct_id: string; properties: Record<string, unknown> };
    assert.equal(ev.event, 'app_open');
    assert.equal(ev.distinct_id, 'd1');
    assert.equal(ev.properties.d_kind, 'cold');
    assert.equal('injected' in ev, false);
    assert.equal('injected' in ev.properties, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a garbage batch is refused before anything is forwarded', async () => {
  assert.equal((await worker.fetch(post('/events', { v: 1, events: [] }), env())).status, 400);
  assert.equal((await worker.fetch(post('/events', { nope: true }), env())).status, 400);
});

test('deletion requires a session, and then really deletes (audit finding 4)', async () => {
  const e = env();
  const kv = (e as { HUSH_KV: ReturnType<typeof memKv> }).HUSH_KV;
  // No bearer → refused.
  assert.equal((await worker.fetch(post('/account/delete', {}), e)).status, 401);
  // Seed: a session, a user in a two-member circle, a published week.
  kv.store.set('session:tok1', 'sub1');
  kv.store.set('user:sub1', JSON.stringify({ circle: 'ABC123' }));
  kv.store.set('circle:ABC123', JSON.stringify({ members: ['sub1', 'sub2'] }));
  kv.store.set('week:ABC123:sub1', JSON.stringify({ name: 'x', done: 1, planned: 3, at: 1 }));
  const res = await worker.fetch(post('/account/delete', {}, { authorization: 'Bearer tok1' }), e);
  assert.equal(res.status, 200);
  assert.equal(kv.store.has('user:sub1'), false, 'user record erased');
  assert.equal(kv.store.has('session:tok1'), false, 'the calling session erased');
  assert.equal(kv.store.has('week:ABC123:sub1'), false, 'week publication erased');
  // The circle survives for its OTHER member.
  assert.deepEqual(JSON.parse(kv.store.get('circle:ABC123')!), { members: ['sub2'] });
});

test('the last member takes the circle with her', async () => {
  const e = env();
  const kv = (e as { HUSH_KV: ReturnType<typeof memKv> }).HUSH_KV;
  kv.store.set('session:tok1', 'sub1');
  kv.store.set('user:sub1', JSON.stringify({ circle: 'ABC123' }));
  kv.store.set('circle:ABC123', JSON.stringify({ members: ['sub1'] }));
  await worker.fetch(post('/account/delete', {}, { authorization: 'Bearer tok1' }), e);
  assert.equal(kv.store.has('circle:ABC123'), false);
});

test('App Store notifications: wrong app refused, unarmed sink 503, armed sink forwards (audit finding 2)', async () => {
  const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jws = (payload: unknown) => `${b64u({ alg: 'ES256' })}.${b64u(payload)}.sig`;
  const signed = (bundleId: string) =>
    jws({
      notificationType: 'DID_RENEW',
      subtype: 'BILLING_RECOVERY',
      data: { bundleId, environment: 'Production', signedTransactionInfo: jws({ originalTransactionId: 'ot1', productId: 'hush.pro.annual' }) },
    });
  // Not our bundle → not our chart.
  assert.equal(
    (await worker.fetch(post('/appstore/notifications', { signedPayload: signed('com.someone.else') }), env())).status,
    400,
  );
  // Ours, unarmed → 503 so Apple's own retry policy re-delivers once the sink is armed.
  assert.equal(
    (await worker.fetch(post('/appstore/notifications', { signedPayload: signed('com.hushfitness.app') }), env())).status,
    503,
  );
  // Armed → one event, joinable by the original transaction.
  let forwarded: { batch?: { event: string; distinct_id: string; properties: Record<string, unknown> }[] } | null = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    forwarded = JSON.parse(String(init?.body));
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    const res = await worker.fetch(
      post('/appstore/notifications', { signedPayload: signed('com.hushfitness.app') }),
      env({ EVENTS_URL: 'https://sink.example/batch', EVENTS_KEY: 'k' }),
    );
    assert.equal(res.status, 204);
    assert.equal(forwarded!.batch![0].event, 'appstore_did_renew');
    assert.equal(forwarded!.batch![0].distinct_id, 'ot1');
    assert.equal(forwarded!.batch![0].properties.product_id, 'hush.pro.annual');
  } finally {
    globalThis.fetch = realFetch;
  }
});
