/**
 * hush-coach — the door and its four walls, driven for real (2026-09-01, audit finding 1).
 *
 * Every test here stops BEFORE the model: the walls exist so that a refused request never costs a
 * Gemini call, so the tests never need to fake one. The ceilings that are exercised are exactly
 * the ones `theCoachDoorHasACeiling` pins as source — this file proves they refuse at runtime.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.ts';

function memKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

const TOKEN = 'shared-token';
function env(extra: Record<string, unknown> = {}) {
  return {
    GEMINI_API_KEY: 'k',
    HUSH_TOKEN: TOKEN,
    COACH_LIMIT: { limit: async () => ({ success: true }) },
    HUSH_KV: memKv(),
    ...extra,
  } as never;
}

/*
 * NO TEST HERE MAY REACH THE NETWORK. Every wall refuses before the model — so a fetch escaping
 * to Gemini is itself the failure (it happened on this file's first run: an explicit '0' ceiling
 * fell through `|| 2000` and a test call went to production Google with a fake key).
 */
globalThis.fetch = (async () => {
  throw new Error('a coach wall let a request through to the network');
}) as typeof fetch;

const BASE = 'https://hush-coach.test';
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hush-token': TOKEN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('the preflight has no body and the liveness answer says nothing', async () => {
  const opt = await worker.fetch(new Request(BASE, { method: 'OPTIONS' }), env());
  assert.equal(opt.status, 204);
  assert.equal(await opt.text(), '');
  const get = await worker.fetch(new Request(BASE), env());
  assert.deepEqual(await get.json(), { ok: true });
});

test('a wrong shared token is refused, and so is a missing one', async () => {
  const res = await worker.fetch(post({ blocks: [{ text: 'hi' }] }, { 'x-hush-token': 'wrong' }), env());
  assert.equal(res.status, 401);
});

test('REQUIRE_AUTH=1 makes a session the price of entry — and the same 401 hides which wall refused', async () => {
  const e = env({ REQUIRE_AUTH: '1' });
  const anonymous = await worker.fetch(post({ blocks: [{ text: 'hi' }] }), e);
  assert.equal(anonymous.status, 401);
  const wrongToken = await worker.fetch(post({ blocks: [{ text: 'hi' }] }, { 'x-hush-token': 'wrong' }), e);
  assert.deepEqual(await anonymous.json(), await wrongToken.json());
});

test('the text ceilings refuse before anything is billed (audit finding 1)', async () => {
  const e = env({ DAILY_GLOBAL_CALLS: '1000' });
  const tooMany = await worker.fetch(post({ blocks: Array.from({ length: 40 }, () => ({ text: 'x' })) }), e);
  assert.equal(tooMany.status, 413);
  const tooBig = await worker.fetch(post({ blocks: [{ text: 'x'.repeat(300_000) }] }), e);
  assert.equal(tooBig.status, 413);
  const declared = new Request(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hush-token': TOKEN, 'content-length': String(9_000_000) },
    body: '{}',
  });
  assert.equal((await worker.fetch(declared, e)).status, 413);
});

test("the day's global budget is the kill switch — spent means 503, our weather not her behaviour", async () => {
  const res = await worker.fetch(post({ blocks: [{ text: 'hi' }] }), env({ DAILY_GLOBAL_CALLS: '0' }));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'budget' });
});

test('an authenticated account has its own daily ceiling — 429 when spent', async () => {
  const e = env({ DAILY_ACCOUNT_CALLS: '0', DAILY_GLOBAL_CALLS: '1000' });
  (e as { HUSH_KV: ReturnType<typeof memKv> }).HUSH_KV.store.set('session:tok1', 'sub1');
  const res = await worker.fetch(post({ blocks: [{ text: 'hi' }] }, { authorization: 'Bearer tok1' }), e);
  assert.equal(res.status, 429);
});

test('the budget is counted AFTER validation — a malformed loop cannot starve honest athletes', async () => {
  const e = env({ DAILY_GLOBAL_CALLS: '1' });
  const kv = (e as { HUSH_KV: ReturnType<typeof memKv> }).HUSH_KV;
  await worker.fetch(post({ blocks: [] }), e); // bad_request — must not spend
  await worker.fetch(post('not json'), e); // bad_request — must not spend
  assert.equal([...kv.store.keys()].some((k) => k.startsWith('quota:g:')), false);
});
