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
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
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

test('the front door and the legal pages moved to getferrox.com, and the old URLs still land there', async () => {
  const e = env();
  for (const path of ['/', '/privacy', '/terms']) {
    const res = await worker.fetch(new Request(`${BASE}${path}`), e);
    assert.equal(res.status, 301, path);
    assert.equal(res.headers.get('location'), `https://getferrox.com${path}`, path);
  }
  const plan = await worker.fetch(new Request(`${BASE}/plan?p=abc`), e);
  assert.equal(plan.status, 200);
  assert.match(plan.headers.get('content-type') ?? '', /text\/html/);
  // The policy must name its processors — the audit's finding 4 was that it named none. Its one
  // source is the site's legal.json now, in both languages.
  const legal = JSON.parse(readFileSync(new URL('../../brand/landing/src/legal.json', import.meta.url), 'utf8'));
  for (const lang of ['he', 'en']) {
    const privacy = legal.privacy.sections.map((s: Record<string, string[]>) => s[lang].join(' ')).join(' ');
    for (const name of ['Google', 'PostHog', 'Sentry', 'Cloudflare']) assert.match(privacy, new RegExp(name), `${lang}: ${name}`);
  }
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

/*
 * ════ THE CIRCLE TAB (2026-09-29) — the streak, the cheer, the friend who drifted ════
 */
const DAY = 24 * 60 * 60 * 1000;
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function circleOf(members: string[]) {
  const e = env();
  const kv = (e as { HUSH_KV: ReturnType<typeof memKv> }).HUSH_KV;
  for (const m of members) {
    kv.store.set(`session:tok_${m}`, m);
    kv.store.set(`user:${m}`, JSON.stringify({ circle: 'ABC123' }));
  }
  kv.store.set('circle:ABC123', JSON.stringify({ members }));
  const as = (m: string) => ({ authorization: `Bearer tok_${m}` });
  const get = async (m: string) =>
    (await (await worker.fetch(new Request(`${BASE}/circle`, { headers: as(m) }), e)).json()) as {
      circle: { members: { name: string; done: number; planned: number; id: string; me?: boolean; last?: number; cheered?: boolean }[]; streak: number; cheers: { from: string }[] };
    };
  return { e, kv, as, get };
}

test('the week carries her last workout to the hour and her week key — nothing else rides along', async () => {
  const { e, kv, as } = circleOf(['sub1', 'sub2']);
  const now = Date.now();
  const res = await worker.fetch(post('/circle/week', { name: 'Dana', done: 2, planned: 3, last: now - 90 * 60 * 1000 + 7, week: keyOf(now - 2 * DAY), loadKg: 120 }, as('sub1')), e);
  assert.equal(res.status, 200);
  const w = JSON.parse(kv.store.get('week:ABC123:sub1')!);
  assert.equal(w.last % (60 * 60 * 1000), 0, 'floored to the hour');
  assert.equal('loadKg' in w, false, 'the allow-list is rebuilt field by field');
  const h = JSON.parse(kv.store.get('hist:ABC123:sub1')!);
  assert.deepEqual(h.weeks, { [keyOf(now - 2 * DAY)]: [2, 3] });
  // A week key from last year, or a last workout in the future, is dropped — never trusted.
  await worker.fetch(post('/circle/week', { name: 'Dana', done: 2, planned: 3, last: now + DAY, week: '2025-01-04' }, as('sub1')), e);
  const w2 = JSON.parse(kv.store.get('week:ABC123:sub1')!);
  assert.equal('last' in w2, false);
  assert.equal('week' in w2, false);
});

test('the shared streak counts weeks everyone closed, and the running week never breaks it', async () => {
  const { e, kv, get } = circleOf(['sub1', 'sub2']);
  const now = Date.now();
  const k0 = keyOf(now - 1 * DAY);
  const k1 = keyOf(now - 8 * DAY);
  const k2 = keyOf(now - 15 * DAY);
  const k3 = keyOf(now - 22 * DAY);
  kv.store.set('hist:ABC123:sub1', JSON.stringify({ name: 'Dana', since: k3, weeks: { [k3]: [1, 3], [k2]: [3, 3], [k1]: [4, 3], [k0]: [1, 3] } }));
  kv.store.set('hist:ABC123:sub2', JSON.stringify({ name: 'Ron', since: k3, weeks: { [k3]: [3, 3], [k2]: [3, 3], [k1]: [3, 3], [k0]: [0, 3] } }));
  // k0 is still running (not closed by all) → counted from k1: k1, k2 closed by both; k3 was not.
  assert.equal((await get('sub1')).circle.streak, 2);
  // Once everyone closes the running week, it joins the streak.
  kv.store.set('hist:ABC123:sub1', JSON.stringify({ name: 'Dana', since: k3, weeks: { [k3]: [1, 3], [k2]: [3, 3], [k1]: [4, 3], [k0]: [3, 3] } }));
  kv.store.set('hist:ABC123:sub2', JSON.stringify({ name: 'Ron', since: k3, weeks: { [k3]: [3, 3], [k2]: [3, 3], [k1]: [3, 3], [k0]: [3, 3] } }));
  assert.equal((await get('sub2')).circle.streak, 3);
  // A friend who joined this week does not break the weeks before her — but she is due from now on.
  kv.store.set('circle:ABC123', JSON.stringify({ members: ['sub1', 'sub2', 'sub3'] }));
  kv.store.set('hist:ABC123:sub3', JSON.stringify({ name: 'Noa', since: k0, weeks: { [k0]: [1, 2] } }));
  kv.store.set('user:sub3', JSON.stringify({ circle: 'ABC123' }));
  kv.store.set('session:tok_sub3', 'sub3');
  assert.equal((await get('sub3')).circle.streak, 2);
});

test('a circle of one has no shared streak', async () => {
  const { kv, get } = circleOf(['sub1']);
  const k = keyOf(Date.now() - DAY);
  kv.store.set('hist:ABC123:sub1', JSON.stringify({ name: 'Dana', since: k, weeks: { [k]: [3, 3] } }));
  assert.equal((await get('sub1')).circle.streak, 0);
});

test('a cheer goes by circle handle, once a day, never to herself — and she sees who sent it', async () => {
  const { e, kv, as, get } = circleOf(['sub1', 'sub2']);
  kv.store.set('week:ABC123:sub1', JSON.stringify({ name: 'Dana', done: 1, planned: 3, at: Date.now() }));
  kv.store.set('week:ABC123:sub2', JSON.stringify({ name: 'Ron', done: 2, planned: 3, at: Date.now() }));
  const view = await get('sub1');
  const me = view.circle.members.find((m) => m.me)!;
  const ron = view.circle.members.find((m) => !m.me)!;
  assert.equal(me.name, 'Dana');
  assert.match(ron.id, /^[0-9a-f]{16}$/);
  assert.equal(JSON.stringify(view).includes('sub2'), false, 'no account id ever reaches a friend');
  assert.equal((await worker.fetch(post('/circle/cheer', { to: me.id }, as('sub1')), e)).status, 400, 'not to herself');
  assert.equal((await worker.fetch(post('/circle/cheer', { to: 'ffffffffffffffff' }, as('sub1')), e)).status, 400);
  assert.equal((await worker.fetch(post('/circle/cheer', { to: ron.id }, as('sub1')), e)).status, 200);
  const again = await worker.fetch(post('/circle/cheer', { to: ron.id }, as('sub1')), e);
  assert.deepEqual(await again.json(), { ok: true, already: true });
  assert.equal(JSON.parse(kv.store.get('cheers:ABC123:sub2')!).length, 1);
  assert.equal((await get('sub1')).circle.members.find((m) => !m.me)!.cheered, true);
  assert.deepEqual((await get('sub2')).circle.cheers.map((c) => c.from), ['Dana']);
});

test('the friend who drifted still appears — at zero, from her history', async () => {
  const { kv, get } = circleOf(['sub1', 'sub2']);
  const k = keyOf(Date.now() - 20 * DAY);
  kv.store.set('week:ABC123:sub1', JSON.stringify({ name: 'Dana', done: 1, planned: 3, at: Date.now() }));
  kv.store.set('hist:ABC123:sub2', JSON.stringify({ name: 'Ron', since: k, last: Date.now() - 20 * DAY, weeks: { [k]: [2, 4] } }));
  const ron = (await get('sub1')).circle.members.find((m) => m.name === 'Ron')!;
  assert.equal(ron.done, 0);
  assert.equal(ron.planned, 4);
  assert.ok(ron.last);
});

test('leaving the circle takes her history and her cheers with her', async () => {
  const { e, kv, as } = circleOf(['sub1', 'sub2']);
  kv.store.set('hist:ABC123:sub1', JSON.stringify({ name: 'Dana', since: '2026-09-26', weeks: {} }));
  kv.store.set('cheers:ABC123:sub1', JSON.stringify([{ fromId: 'x', from: 'Ron', at: Date.now() }]));
  await worker.fetch(post('/circle/leave', {}, as('sub1')), e);
  assert.equal(kv.store.has('hist:ABC123:sub1'), false);
  assert.equal(kv.store.has('cheers:ABC123:sub1'), false);
});

/*
 * ⛔ APP STORE NOTIFICATIONS ARE ENTITLEMENT-GRADE AS OF 2026-09-18, and this test was rewritten on
 * that day. It used to hand the route a JWS with the literal signature "sig" and expect a 204: the
 * route decoded without verifying, because all it did was draw a churn chart. It now moves the
 * coach track's SEATS (`coaches.seat_limit`), so a payload Apple did not sign is refused outright —
 * and the only way to drive the route without Apple is the local test gate, which needs a loopback
 * hostname, the `BILLING_TEST` var and an HMAC over the exact body. See `src/appleBilling.ts`.
 */
test('App Store notifications: an unsigned payload is refused; only a signed one is charted', async () => {
  const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jws = (payload: unknown) => `${b64u({ alg: 'ES256' })}.${b64u(payload)}.sig`;
  const signed = (bundleId: string) =>
    jws({
      notificationType: 'DID_RENEW',
      subtype: 'BILLING_RECOVERY',
      data: { bundleId, environment: 'Production', signedTransactionInfo: jws({ originalTransactionId: 'ot1', productId: 'hush.pro.annual' }) },
    });
  // ⛔ Nobody's signature is anybody's: neither bundle id gets past the chain check.
  for (const bundle of ['com.someone.else', 'com.hushfitness.app']) {
    const res = await worker.fetch(post('/appstore/notifications', { signedPayload: signed(bundle) }), env());
    assert.equal(res.status, 401, bundle);
    assert.equal((await res.json() as { error: string }).error, 'bad_signature');
  }

  const KEY = 'identity-test-local-billing-key';
  const body = {
    test: {
      notificationType: 'DID_RENEW',
      subtype: 'BILLING_RECOVERY',
      productId: 'hush.coach.30.month',
      originalTransactionId: 'ot1',
      expiresDate: Date.now() + 86_400_000,
    },
  };
  const raw = JSON.stringify(body);
  const mac = createHmac('sha256', KEY).update(raw).digest('hex');
  const inject = (origin: string, signature: string) =>
    new Request(`${origin}/appstore/notifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hush-billing-test': signature },
      body: raw,
    });

  // ⛔ The var alone is not the gate: this worker's own hostname is not a loopback one.
  assert.equal((await worker.fetch(inject(BASE, mac), env({ BILLING_TEST: KEY }))).status, 401);
  // ⛔ Nor is the loopback alone, without the var…
  assert.equal((await worker.fetch(inject('http://127.0.0.1:8787', mac), env())).status, 401);
  // …nor with the var and the wrong HMAC.
  assert.equal((await worker.fetch(inject('http://127.0.0.1:8787', 'f'.repeat(64)), env({ BILLING_TEST: KEY }))).status, 401);

  // All three, and the route runs exactly as it does for Apple — including the chart.
  let forwarded: { batch?: { event: string; distinct_id: string; properties: Record<string, unknown> }[] } | null = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    forwarded = JSON.parse(String(init?.body));
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    const res = await worker.fetch(
      inject('http://127.0.0.1:8787', mac),
      env({ BILLING_TEST: KEY, EVENTS_URL: 'https://sink.example/batch', EVENTS_KEY: 'k' }),
    );
    assert.equal(res.status, 200);
    // No COACH_DB in this env, so there are no seats to move — and that is not an error.
    assert.deepEqual(await res.json(), { applied: 'off', charted: true });
    assert.equal(forwarded!.batch![0].event, 'appstore_did_renew');
    assert.equal(forwarded!.batch![0].distinct_id, 'ot1');
    assert.equal(forwarded!.batch![0].properties.product_id, 'hush.coach.30.month');
    assert.equal(forwarded!.batch![0].properties.subtype, 'BILLING_RECOVERY');
  } finally {
    globalThis.fetch = realFetch;
  }
});
