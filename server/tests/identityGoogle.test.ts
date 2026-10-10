/**
 * ════ `/auth/google` — DRIVEN WITH A REAL SIGNED TOKEN (2026-09-16) ════
 *
 * The founder, asking about Android: *"למה אנחנו לא עושים גם כניסה דרך הפייסבוק?"* — the answer was
 * that Google was not wired at all, which is what blocks Android before any question of a third
 * provider. This is the server half of wiring it.
 *
 * A verifier is the one kind of code that must be tested against a token it should ACCEPT and
 * tokens it must REFUSE, because every bug in it is silent and each one is an open door. So this
 * mints an RSA key, serves it as Google's JWKS through a stubbed `fetch`, and signs its own tokens:
 *
 *   · a good token          → 200, and a session that really resolves to the athlete
 *   · another app's token   → 401 (the audience check — the whole point of the file)
 *   · another issuer        → 401
 *   · an expired token      → 401
 *   · a token signed by somebody else's key → 401
 *   · and an UNCONFIGURED deployment refuses everything, which is what ships until the founder
 *     creates the OAuth clients.
 *
 * Run: `node --test server/tests/`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../hush-identity/src/index.ts';

const BASE = 'https://hush-identity.test';
const OUR_CLIENT = '1234567890-ios.apps.googleusercontent.com';
const OUR_WEB_CLIENT = '1234567890-web.apps.googleusercontent.com';

function memKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string, opts?: unknown) {
      const v = store.get(key) ?? null;
      if (v != null && opts === 'json') return JSON.parse(v);
      if (v != null && typeof opts === 'object' && opts != null) return v;
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
    GOOGLE_CLIENT_IDS: `${OUR_CLIENT}, ${OUR_WEB_CLIENT}`,
    ...extra,
  } as never;
}

const post = (path: string, body: unknown) =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const b64url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (s: string): string => b64url(new TextEncoder().encode(s));

async function makeKey(kid: string) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey & { kid?: string; alg?: string };
  return { pair, jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } };
}

async function sign(
  key: CryptoKey,
  kid: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const head = b64urlText(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const body = b64urlText(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

const hour = 3600;
const now = () => Math.floor(Date.now() / 1000);

/*
 * ⚠️ EVERY KEY IS MADE BEFORE THE FIRST FETCH, and the worker is why: it caches Google's JWKS per
 * isolate for an hour, so the FIRST verification that reaches the network decides what every later
 * one can verify against. A test that minted its key afterwards would be checking the cache, not the
 * verifier. So the whole key set is built once, served once, and each test picks the key it needs.
 */
const keys = (async () => ({
  good: await makeKey('k-good'),
  aud: await makeKey('k-aud'),
  iss: await makeKey('k-iss'),
  published: await makeKey('k-published'),
  /* The impersonator: the SAME kid as a published key, a different private key. */
  forger: await makeKey('k-published'),
}))();
let served: JsonWebKey[] = [];
async function allKeys() {
  const k = await keys;
  served = [k.good.jwk, k.aud.jwk, k.iss.jwk, k.published.jwk];
  return k;
}
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('googleapis.com/oauth2/v3/certs')) {
    return new Response(JSON.stringify({ keys: served }), { headers: { 'content-type': 'application/json' } });
  }
  return realFetch(input as never, init);
}) as typeof fetch;

test('⛔ an unconfigured deployment refuses every Google token — it does not know whose they are', async () => {
  const { good } = await allKeys();
  const token = await sign(good.pair.privateKey, 'k-good', {
    iss: 'https://accounts.google.com',
    aud: OUR_CLIENT,
    sub: '10987654321',
    exp: now() + hour,
  });
  const res = await worker.fetch(post('/auth/google', { identityToken: token }), env({ GOOGLE_CLIENT_IDS: '' }));
  assert.equal(res.status, 401);
});

test('a malformed body is refused before anything is verified', async () => {
  assert.equal((await worker.fetch(post('/auth/google', {}), env())).status, 400);
  assert.equal((await worker.fetch(post('/auth/google', { identityToken: 'not-a-jwt' }), env())).status, 401);
});

test("⛔ ANOTHER APP'S token is refused — the audience is the whole check", async () => {
  const { aud } = await allKeys();
  const token = await sign(aud.pair.privateKey, 'k-aud', {
    iss: 'https://accounts.google.com',
    aud: 'somebody-elses-app.apps.googleusercontent.com',
    sub: '10987654321',
    exp: now() + hour,
  });
  assert.equal((await worker.fetch(post('/auth/google', { identityToken: token }), env())).status, 401);
});

test('a wrong issuer and an expired token are both refused', async () => {
  const { iss } = await allKeys();
  const wrongIss = await sign(iss.pair.privateKey, 'k-iss', {
    iss: 'https://accounts.evil.example',
    aud: OUR_CLIENT,
    sub: '1',
    exp: now() + hour,
  });
  assert.equal((await worker.fetch(post('/auth/google', { identityToken: wrongIss }), env())).status, 401);

  const expired = await sign(iss.pair.privateKey, 'k-iss', {
    iss: 'accounts.google.com',
    aud: OUR_CLIENT,
    sub: '1',
    exp: now() - 60,
  });
  assert.equal((await worker.fetch(post('/auth/google', { identityToken: expired }), env())).status, 401);
});

test('⛔ a token signed by a key Google does not publish is refused', async () => {
  const { forger } = await allKeys();
  const forged = await sign(forger.pair.privateKey, 'k-published', {
    iss: 'https://accounts.google.com',
    aud: OUR_CLIENT,
    sub: '10987654321',
    exp: now() + hour,
  });
  assert.equal((await worker.fetch(post('/auth/google', { identityToken: forged }), env())).status, 401);
});

test('⛔ a REAL token opens a session, and the session resolves to her — namespaced away from Apple', async () => {
  const { good } = await allKeys();
  const e = env();
  const token = await sign(good.pair.privateKey, 'k-good', {
    iss: 'accounts.google.com', // the bare spelling — Google sends both
    aud: OUR_WEB_CLIENT,
    sub: '10987654321',
    exp: now() + hour,
  });
  const res = await worker.fetch(post('/auth/google', { identityToken: token }), e);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { token?: string };
  assert.ok(body.token, 'a session token comes back');

  const kv = (e as unknown as { HUSH_KV: { store: Map<string, string> } }).HUSH_KV;
  /* The session resolves to HER — and the id is namespaced, so a Google `sub` can never land on an
     Apple athlete's record however the two providers number their users. */
  assert.equal(kv.store.get(`session:${body.token}`), 'google:10987654321');
  assert.ok(kv.store.has('user:google:10987654321'));
});
