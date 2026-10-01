/**
 * hush-coach's voice doors (`voice.ts`, 2026-09-27) — the walls, and the two jobs, driven for real
 * with the providers faked. Nothing here reaches a real network: `fetch` is replaced per test, and
 * a call that escapes to an unexpected URL fails the test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.ts';
import { DEFAULT_VOICE, VOICES, pcmToWav } from '../voice.ts';

function memKv(sessions: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(sessions));
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
const SESSION = 'sess-1';
function env(extra: Record<string, unknown> = {}) {
  return {
    OPENAI_API_KEY: 'o',
    HUSH_TOKEN: TOKEN,
    REQUIRE_AUTH: '1',
    VOICE_LIMIT: { limit: async () => ({ success: true }) },
    HUSH_KV: memKv({ [`session:${SESSION}`]: 'apple-sub-1' }),
    ...extra,
  } as never;
}

type Seen = { url: string; body: unknown };
function fakeProviders(): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body;
    seen.push({ url, body: typeof body === 'string' ? JSON.parse(body) : body });
    if (url.includes('/v1/audio/transcriptions')) return new Response(JSON.stringify({ text: 'עשר' }), { status: 200 });
    // 0.1 s of silence at 24 kHz, as a WAV — what `gpt-4o-mini-tts` answers with `response_format: 'wav'`.
    if (url.includes('/v1/audio/speech')) return new Response(pcmToWav(new Uint8Array(4800), 24_000), { status: 200 });
    throw new Error(`unexpected network call: ${url}`);
  }) as typeof fetch;
  return seen;
}

const BASE = 'https://hush-coach.test';
const post = (route: string, body: unknown, withSession = true) =>
  new Request(BASE + route, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hush-token': TOKEN,
      ...(withSession ? { authorization: `Bearer ${SESSION}` } : {}),
    },
    body: JSON.stringify(body),
  });
const AUDIO = btoa('RIFF'.padEnd(400, 'x'));

test('the voice doors are for a signed-in athlete — no session, no call', async () => {
  const seen = fakeProviders();
  const hear = await worker.fetch(post('/voice/hear', { audio: AUDIO }, false), env());
  const say = await worker.fetch(post('/voice/say', { text: 'קדימה.' }, false), env());
  assert.equal(hear.status, 401);
  assert.equal(say.status, 401);
  assert.equal(seen.length, 0);
});

test('a body too large, or empty, is refused before any provider is asked', async () => {
  const seen = fakeProviders();
  assert.equal((await worker.fetch(post('/voice/say', { text: 'א'.repeat(401) }), env())).status, 413);
  assert.equal((await worker.fetch(post('/voice/say', { text: '   ' }), env())).status, 400);
  assert.equal((await worker.fetch(post('/voice/hear', { audio: 'short' }), env())).status, 400);
  assert.equal((await worker.fetch(post('/voice/hear', { audio: 'x'.repeat(900_001) }), env())).status, 413);
  assert.equal(seen.length, 0);
});

test('HEAR: the words come back — the recognizer is told what the question expects', async () => {
  const seen = fakeProviders();
  const res = await worker.fetch(post('/voice/hear', { audio: AUDIO, expect: 'reps', lang: 'he' }), env());
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { text: string }).text, 'עשר');
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /api\.openai\.com\/v1\/audio\/transcriptions/);
  const form = seen[0].body as FormData;
  assert.equal(form.get('model'), 'gpt-transcribe');
  assert.match(String(form.get('prompt')), /כמה חזרות/);
  assert.deepEqual(form.getAll('languages[]'), ['he']);
});

test('SAY: a line becomes a WAV in the chosen voice — and a voice not on the list is never synthesized', async () => {
  const seen = fakeProviders();
  const chosen = VOICES[1];
  const res = await worker.fetch(post('/voice/say', { text: 'קדימה.', lang: 'he', voice: chosen }), env());
  assert.equal(res.status, 200);
  const body = (await res.json()) as { audio: string; voice: string };
  const wav = atob(body.audio);
  assert.equal(wav.slice(0, 4), 'RIFF'); // the file the phone plays and caches
  assert.equal(body.voice, chosen.split(':').slice(1).join(':'));
  assert.match(seen[0].url, /api\.openai\.com\/v1\/audio\/speech/);
  assert.match(String((seen[0].body as { instructions: string }).instructions), /מאמנת/); // she speaks as a woman
  const rogue = await worker.fetch(post('/voice/say', { text: 'קדימה.', lang: 'he', voice: 'openai:gpt-9-tts:anyone' }), env());
  assert.equal(rogue.status, 200);
  const asked = seen[1].body as { model: string; voice: string };
  assert.equal(`openai:${asked.model}:${asked.voice}`, DEFAULT_VOICE);
});

test('SAY: a reply that is not a WAV is no line — a short 502, and the phone says it itself', async () => {
  globalThis.fetch = (async () => new Response(new Uint8Array(400), { status: 200 })) as typeof fetch;
  const res = await worker.fetch(post('/voice/say', { text: 'קדימה.' }), env());
  assert.equal(res.status, 502);
});

test("the voice spends its own day, apart from the coach's — and stops at its ceiling", async () => {
  fakeProviders();
  const e = env({ DAILY_VOICE_SAY: '2' });
  const kv = (e as { HUSH_KV: ReturnType<typeof memKv> }).HUSH_KV;
  const say = () => worker.fetch(post('/voice/say', { text: 'קדימה.' }), e);
  assert.equal((await say()).status, 200);
  assert.equal((await say()).status, 200);
  assert.equal((await say()).status, 429);
  assert.equal([...kv.store.keys()].some((k) => k.startsWith('quota:vs:apple-sub-1:')), true);
  assert.equal([...kv.store.keys()].some((k) => k.startsWith('quota:c:')), false); // the coach's budget untouched
});

test('a provider failure is a short 502 the phone reads as "use the phone" — never its raw text', async () => {
  globalThis.fetch = (async () => new Response('{"error":{"message":"secret upstream detail about the request"}}', { status: 402 })) as typeof fetch;
  const res = await worker.fetch(post('/voice/say', { text: 'קדימה.' }), env());
  assert.equal(res.status, 502);
  const body = (await res.json()) as { error: string; why: string };
  assert.equal(body.error, 'upstream');
  assert.ok(body.why.length <= 24);
});
