/**
 * hush-coach on OpenAI (2026-09-28) — the one provider, driven for real with the Responses API faked.
 *
 * Founder: *"בוא נשתמש רק ב-OPEN AI עבור כל המטרות שלנו."* Every job reaches the model the Worker
 * chose for it — never one the caller named — with its reasoning, the app's schema and the output
 * ceiling. The week goes to the strong model when her wait has room for it, and to the fast one
 * when the strong one misses. Nothing here reaches a real network: a call to any other URL fails.
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
    OPENAI_API_KEY: 'o',
    HUSH_TOKEN: TOKEN,
    COACH_LIMIT: { limit: async () => ({ success: true }) },
    HUSH_KV: memKv(),
    DAILY_GLOBAL_CALLS: '1000',
    ...extra,
  } as never;
}

type Asked = {
  model: string;
  reasoning: { effort: string };
  max_output_tokens: number;
  store: boolean;
  input: unknown;
  text?: { format: { type: string; name: string; schema: Record<string, unknown>; strict: boolean } };
};

function fakeOpenAI(answer: (asked: Asked) => Response): Asked[] {
  const seen: Asked[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url !== 'https://api.openai.com/v1/responses') throw new Error(`unexpected network call: ${url}`);
    const asked = JSON.parse(String(init?.body)) as Asked;
    seen.push(asked);
    return answer(asked);
  }) as typeof fetch;
  return seen;
}

/** A finished Responses reply — a reasoning item first, as a thinking model sends it, then the message. */
const finished = (text: string, model: string) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      model,
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text }] },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
    { status: 200 },
  );

const SCHEMA = { type: 'object', properties: { v: { type: 'integer', minimum: 1 } }, required: ['v'] };
const post = (body: unknown) =>
  new Request('https://hush-coach.test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hush-token': TOKEN },
    body: JSON.stringify(body),
  });
type Reply = { text?: string; finishReason?: string; model?: string; effort?: string; strongMiss?: string; error?: string; status?: number; why?: string };

test("each job gets the Worker's model and reasoning — never the caller's", async () => {
  const seen = fakeOpenAI((a) => finished('{"v":2}', a.model));
  const read = await worker.fetch(post({ blocks: [{ text: 'my routine' }], kind: 'import', schema: SCHEMA, model: 'gpt-6-astra' }), env());
  assert.equal(read.status, 200);
  const body = (await read.json()) as Reply;
  assert.equal(body.text, '{"v":2}');
  assert.equal(body.finishReason, 'STOP');
  assert.equal(body.model, 'gpt-6-sol');
  assert.equal(seen[0].model, 'gpt-6-sol');
  assert.equal(seen[0].reasoning.effort, 'medium');
  await worker.fetch(post({ blocks: [{ text: 'my week' }], kind: 'review', schema: SCHEMA }), env());
  await worker.fetch(post({ blocks: [{ text: 'hi' }] }), env());
  assert.deepEqual(seen.slice(1).map((a) => `${a.model}@${a.reasoning.effort}`), ['gpt-6-sol@medium', 'gpt-6-sol@low']);
});

test("the app's schema is the answer's shape; the ceiling includes the thinking; nothing is stored", async () => {
  const seen = fakeOpenAI((a) => finished('{"v":2}', a.model));
  await worker.fetch(post({ blocks: [{ text: 'a' }, { text: 'b' }], kind: 'build', schema: SCHEMA }), env());
  const a = seen[0];
  assert.equal(a.text?.format.type, 'json_schema');
  assert.equal(a.text?.format.strict, false); // some of our fields are optional
  assert.deepEqual(a.text?.format.schema, { type: 'object', properties: { v: { type: 'integer' } }, required: ['v'] });
  assert.equal(a.max_output_tokens, 16_384);
  assert.equal(a.store, false);
  assert.equal(a.input, 'a\n\nb');
});

test('the week is Sol thinking hard when her wait has room for it — and the reply says which call wrote it', async () => {
  const seen = fakeOpenAI((a) => finished('{"v":3}', a.model));
  const res = await worker.fetch(post({ blocks: [{ text: 'build' }], kind: 'build', schema: SCHEMA, wait: 40_000 }), env());
  const body = (await res.json()) as Reply;
  assert.equal(body.model, 'gpt-6-sol');
  assert.equal(body.effort, 'high');
  assert.equal(body.text, '{"v":3}');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].reasoning.effort, 'high');
  assert.equal(seen[0].max_output_tokens, 32_000); // high reasoning needs the room
  // …and a short wait has no room for it: the fast lane, first.
  const short = await worker.fetch(post({ blocks: [{ text: 'build' }], kind: 'build', schema: SCHEMA, wait: 12_000 }), env());
  assert.equal(((await short.json()) as Reply).effort, 'low');
});

test('a miss of the hard-thinking call is a fast week inside the same wait — and the reply says why', async () => {
  const seen = fakeOpenAI((a) =>
    a.reasoning.effort === 'high'
      ? new Response('{"error":{"message":"You exceeded your current quota"}}', { status: 429 })
      : finished('{"v":4}', a.model),
  );
  const res = await worker.fetch(post({ blocks: [{ text: 'build' }], kind: 'build', schema: SCHEMA, wait: 40_000 }), env());
  const body = (await res.json()) as Reply;
  assert.equal(res.status, 200);
  assert.equal(body.effort, 'low');
  assert.equal(body.text, '{"v":4}');
  assert.match(String(body.strongMiss), /^http_429/);
  assert.deepEqual(seen.map((a) => `${a.model}@${a.reasoning.effort}`), ['gpt-6-sol@high', 'gpt-6-sol@low']);
});

test('a cut answer never wins — it is returned only when nothing finished, marked as cut', async () => {
  fakeOpenAI(
    (a) =>
      new Response(
        JSON.stringify({ status: 'incomplete', model: a.model, incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [{ type: 'output_text', text: '{"v":' }] }] }),
        { status: 200 },
      ),
  );
  const res = await worker.fetch(post({ blocks: [{ text: 'hi' }], kind: 'review', schema: SCHEMA }), env());
  const body = (await res.json()) as Reply;
  assert.equal(body.finishReason, 'MAX_TOKENS');
  assert.equal(body.text, '{"v":');
});

test('a photographed routine is read at full detail', async () => {
  const seen = fakeOpenAI((a) => finished('{"v":5}', a.model));
  await worker.fetch(post({ blocks: [{ text: 'read this' }], kind: 'import', schema: SCHEMA, images: [{ mime: 'image/jpeg', data: 'AAAA' }] }), env());
  const input = seen[0].input as { role: string; content: { type: string; text?: string; detail?: string; image_url?: string }[] }[];
  assert.equal(input[0].content[0].text, 'read this');
  assert.equal(input[0].content[1].type, 'input_image');
  assert.equal(input[0].content[1].detail, 'high');
  assert.equal(input[0].content[1].image_url, 'data:image/jpeg;base64,AAAA');
});

test("OpenAI's refusal is relayed by its status alone — never its text", async () => {
  fakeOpenAI(() => new Response('{"error":{"message":"Incorrect API key provided: sk-...secret"}}', { status: 401 }));
  const res = await worker.fetch(post({ blocks: [{ text: 'hi' }] }), env());
  assert.equal(res.status, 502);
  const body = (await res.json()) as Reply;
  assert.equal(body.status, 401);
  assert.equal(body.why, undefined);
  assert.doesNotMatch(JSON.stringify(body), /secret/);
});
