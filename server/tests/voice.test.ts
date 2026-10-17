/**
 * hush-coach's voice doors (`voice.ts`, 2026-09-27) — the walls, and the two jobs, driven for real
 * with the providers faked. Nothing here reaches a real network: `fetch` is replaced per test, and
 * a call that escapes to an unexpected URL fails the test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.ts';
import { DEFAULT_VOICE, PINNED_MODEL, SHORT_LINE_CHARS, VOICES, VOICE_PITCH_HZ, pcmToWav, say as sayLine } from '../voice.ts';
import { wavPitch } from '../voicePitch.ts';

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
const INSTALL = 'a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d';
const post = (route: string, body: unknown, withSession = true, install: string | null = null) =>
  new Request(BASE + route, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hush-token': TOKEN,
      ...(withSession ? { authorization: `Bearer ${SESSION}` } : {}),
      ...(install != null ? { 'x-hush-install': install } : {}),
    },
    body: JSON.stringify(body),
  });
const AUDIO = btoa('RIFF'.padEnd(400, 'x'));

test('a stranger — no session and no install — is refused, and no provider is asked', async () => {
  const seen = fakeProviders();
  const hear = await worker.fetch(post('/voice/hear', { audio: AUDIO }, false), env());
  const say = await worker.fetch(post('/voice/say', { text: 'קדימה.' }, false), env());
  assert.equal(hear.status, 401);
  assert.equal(say.status, 401);
  // …and a header that is not an install id is not an install.
  assert.equal((await worker.fetch(post('/voice/say', { text: 'קדימה.' }, false, 'x y'), env())).status, 401);
  assert.equal(seen.length, 0);
});

/*
 * ⛔ THE FOUNDER'S FIRST WORKOUT WITH THE VOICE (2026-10-05): "כמו סירי", and "היא לא שומעת אותי". The
 * route refused every call with no session — and that morning the KV held no session for anyone:
 * half of all installs sign in AFTER their first workout, and the exchange that mints a session is
 * one fire-and-forget request. The first workout is the one that decides whether she stays.
 */
test('⛔ an athlete with no account yet is given the voice — out of the anonymous pool, never out of an account', async () => {
  const seen = fakeProviders();
  const e = env();
  const kv = (e as { HUSH_KV: ReturnType<typeof memKv> }).HUSH_KV;
  const say = await worker.fetch(post('/voice/say', { text: 'קדימה.', lang: 'he' }, false, INSTALL), e);
  const hear = await worker.fetch(post('/voice/hear', { audio: AUDIO, expect: 'reps', lang: 'he' }, false, INSTALL), e);
  assert.equal(say.status, 200);
  assert.equal(hear.status, 200);
  // Both providers were really asked: the ear once, the mouth three times for a short line (ONE VOICE, MEASURED, below).
  assert.equal(seen.filter((s) => s.url.includes('/v1/audio/transcriptions')).length, 1);
  assert.equal(seen.filter((s) => s.url.includes('/v1/audio/speech')).length, 3);
  const keys = [...kv.store.keys()];
  assert.equal(keys.some((k) => k.startsWith(`quota:vs:a:${INSTALL}:`)), true);
  assert.equal(keys.some((k) => k.startsWith(`quota:vh:a:${INSTALL}:`)), true);
  assert.equal(keys.some((k) => k.startsWith('quota:vag:')), true); // the anonymous wall counted both
  assert.equal(kv.store.get(keys.find((k) => k.startsWith('quota:vag:'))!), '2');
});

test('⛔ the anonymous pool has its own day per install and its own wall — and neither can shut a signed-in athlete out', async () => {
  fakeProviders();
  const e = env({ DAILY_VOICE_ANON_SAY: '2', DAILY_VOICE_ANON_GLOBAL: '3' });
  const anon = (install: string) => worker.fetch(post('/voice/say', { text: 'קדימה.' }, false, install), e);
  assert.equal((await anon(INSTALL)).status, 200);
  assert.equal((await anon(INSTALL)).status, 200);
  assert.equal((await anon(INSTALL)).status, 429); // this install's day is spent (the wall counted the try)
  // Another install id: the wall — every anonymous install together — is what stops a minted id.
  assert.equal((await anon('ffffffffffff4fffbfffffffffffffff')).status, 503);
  // A signed-in athlete is counted in her own pool and never sees the anonymous wall.
  assert.equal((await worker.fetch(post('/voice/say', { text: 'קדימה.' }), e)).status, 200);
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
  const body = (await res.json()) as { audio: string; voice: string; model: string; takes: number };
  const wav = atob(body.audio);
  assert.equal(wav.slice(0, 4), 'RIFF'); // the file the phone plays and caches
  assert.equal(body.voice, chosen.split(':').slice(1).join(':')); // the id's tail, exactly as the app asked for it
  assert.equal(body.model, PINNED_MODEL['gpt-4o-mini-tts']); // …and beside it, the dated version that spoke
  assert.equal(body.takes, 3); // a short line is chosen from three
  assert.match(seen[0].url, /api\.openai\.com\/v1\/audio\/speech/);
  assert.match(String((seen[0].body as { instructions: string }).instructions), /מאמנת/); // she speaks as a woman
  const before = seen.length;
  const rogue = await worker.fetch(post('/voice/say', { text: 'קדימה.', lang: 'he', voice: 'openai:gpt-9-tts:anyone' }), env());
  assert.equal(rogue.status, 200);
  const [, defaultModel, defaultVoice] = DEFAULT_VOICE.split(':');
  for (const s of seen.slice(before)) {
    const asked = s.body as { model: string; voice: string };
    assert.equal(asked.voice, defaultVoice);
    assert.equal(asked.model, PINNED_MODEL[defaultModel]);
  }
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

/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ONE VOICE, MEASURED (founder's phone, build 79, 2026-10-12)
 *
 * *"זה בוודאות לא נאמר באותו הקול. היה גם פעם אחת את הקול של כרמית ופעם אחת את הקול של נקבה של OpenAI
 * ופעם אחת היה קול של גבר."* — each of the three measured the same evening (`voiceDrift.cjs`), and
 * each answered in `voice.ts`. These drive `say` itself with a provider that answers in a chosen
 * pitch, stays silent, or refuses.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** A "voice" at one pitch — a fundamental and five harmonics with a speaker's small waver — as a 24 kHz WAV. */
function voiceAt(hz: number, seconds = 0.6): Uint8Array {
  const rate = 24_000;
  const n = Math.round(rate * seconds);
  const pcm = new Uint8Array(n * 2);
  const v = new DataView(pcm.buffer);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    // no voice holds a period exactly, and it is the waver that tells a period from twice the period
    phase += (2 * Math.PI * hz * (1 + 0.03 * Math.sin((2 * Math.PI * 6 * i) / rate))) / rate;
    let x = 0;
    for (let k = 1; k <= 6; k++) x += Math.sin(k * phase) / k;
    v.setInt16(i * 2, Math.round((x / 2.5) * 20_000), true);
  }
  return pcmToWav(pcm, rate);
}
const SILENCE = pcmToWav(new Uint8Array(4800), 24_000);

type Answer = Uint8Array | 'silent' | { status: number };
/** The speech provider, scripted: what the i-th request gets. A silent request ends only when it is abandoned. */
function speech(script: (i: number) => Answer) {
  const asked: { model: string; voice: string; input: string }[] = [];
  let abandoned = 0;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    assert.match(String(input), /api\.openai\.com\/v1\/audio\/speech/);
    const i = asked.push(JSON.parse(String(init?.body))) - 1;
    const a = script(i);
    if (a === 'silent') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          abandoned += 1;
          reject(new Error('The operation was aborted'));
        });
      });
    }
    if (a instanceof Uint8Array) return Promise.resolve(new Response(a, { status: 200 }));
    return Promise.resolve(new Response('{"error":{"message":"upstream detail"}}', { status: a.status }));
  }) as typeof fetch;
  return { asked, abandoned: () => abandoned };
}

const KEYS = { OPENAI_API_KEY: 'o' };
const SHORT = 'קדימה.';
const LONG = 'לחיצת חזה במוט. שישים קילו: המוט עשרים קילו, ועשרים קילו בכל צד. שמונה עד עשר חזרות.';
const QUICK = { settleMs: 40, hedgeMs: 70 };
const HERS = VOICE_PITCH_HZ.marin;
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

test('the ear: a clip’s pitch is read to within 3% by both readings — and what is no voice is given none', () => {
  for (const hz of [95, 154, 191, 250]) {
    const p = wavPitch(voiceAt(hz));
    assert.ok(Math.abs(p.hz - hz) / hz < 0.03, `${hz} Hz read as ${p.hz}`);
    assert.ok(Math.abs(p.strong - hz) / hz < 0.03, `${hz} Hz read as ${p.strong} by its strongest peak`);
    assert.ok(p.voiced >= 8);
  }
  assert.deepEqual({ ...wavPitch(SILENCE), seconds: 0 }, { hz: 0, strong: 0, voiced: 0, seconds: 0 });
  assert.equal(wavPitch(new Uint8Array(400)).voiced, 0); // not a WAV at all
  assert.equal(wavPitch(pcmToWav(new Uint8Array(0), 24_000)).voiced, 0);
});

test('⛔ CARMIT: the dated version is what is asked for — and a long line is asked for once', async () => {
  assert.equal(SHORT.length <= SHORT_LINE_CHARS && LONG.length > SHORT_LINE_CHARS, true);
  const s = speech(() => voiceAt(HERS));
  const r = await sayLine(KEYS, LONG, 'he', DEFAULT_VOICE, 500, QUICK);
  assert.equal(r.ok, true);
  assert.equal(s.asked.length, 1);
  assert.equal(s.asked[0].model, 'gpt-4o-mini-tts-2025-12-15');
  assert.equal(s.asked[0].voice, 'marin');
  if (r.ok) assert.deepEqual([r.model, r.spoke, r.takes], ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15', 1]);
});

test('⛔ ANOTHER WOMAN: a short line is asked for three times, and the take nearest her own pitch is the line', async () => {
  const takes = [voiceAt(250), voiceAt(HERS + 4), voiceAt(166)]; // what "קדימה." really came back as
  const s = speech((i) => takes[i]);
  const r = await sayLine(KEYS, SHORT, 'he', DEFAULT_VOICE, 500, QUICK);
  assert.equal(s.asked.length, 3);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(same(r.wav, takes[1]), true);
    assert.equal(r.takes, 3);
    assert.ok(Math.abs(r.hz - (HERS + 4)) <= 4);
  }
  // …whichever order they come in
  const other = [voiceAt(HERS - 3), voiceAt(240), voiceAt(170)];
  speech((i) => other[i]);
  const r2 = await sayLine(KEYS, SHORT, 'he', DEFAULT_VOICE, 500, QUICK);
  assert.equal(r2.ok && same(r2.wav, other[0]), true);
});

test('⛔ A MAN: a take at a man’s pitch is never the line — and when every take is his, there is no line at all', async () => {
  const man = voiceAt(95);
  const hers = voiceAt(HERS + 20);
  const s = speech((i) => (i === 1 ? hers : man));
  const r = await sayLine(KEYS, SHORT, 'he', DEFAULT_VOICE, 500, QUICK);
  assert.equal(s.asked.length, 3);
  assert.equal(r.ok && same(r.wav, hers), true);
  if (r.ok) assert.equal(r.takes, 1); // chosen from the one that was her

  // Three of him: she is asked for again — and again — and then the phone says the line itself.
  const only = speech(() => man);
  const none = await sayLine(KEYS, SHORT, 'he', DEFAULT_VOICE, 500, QUICK);
  assert.deepEqual([none.ok, none.ok ? '' : none.why], [false, 'not_her_voice']);
  assert.equal(only.asked.length, 5);

  // …and the fourth ask is worth making: it is the line when it is her.
  const late = speech((i) => (i < 3 ? man : hers));
  const r4 = await sayLine(KEYS, SHORT, 'he', DEFAULT_VOICE, 500, QUICK);
  assert.equal(r4.ok && same(r4.wav, hers), true);
  assert.equal(late.asked.length, 4);

  // A long line is one ask — and a man's long line is asked for once more, not sent.
  const long = speech((i) => (i === 0 ? man : hers));
  const rl = await sayLine(KEYS, LONG, 'he', DEFAULT_VOICE, 500, QUICK);
  assert.equal(rl.ok && same(rl.wav, hers), true);
  assert.equal(long.asked.length, 2);
});

test('a request that says nothing is not waited on alone — and with a take in hand, the silent ones are not waited on', async () => {
  // All three silent: past the hedge a fourth is sent, and it is the line.
  const hers = voiceAt(HERS);
  const s = speech((i) => (i < 3 ? 'silent' : hers));
  const t0 = Date.now();
  const r = await sayLine(KEYS, SHORT, 'he', DEFAULT_VOICE, 2_000, QUICK);
  assert.equal(r.ok && same(r.wav, hers), true);
  assert.equal(s.asked.length, 4);
  assert.ok(Date.now() - t0 < 1_000, 'the line did not wait for the deadline');
  assert.equal(s.abandoned(), 3); // the silent ones are let go, not left running

  // One answers, two are silent: the one in hand is the line once the others have had their wait.
  const one = speech((i) => (i === 0 ? hers : 'silent'));
  const t1 = Date.now();
  const r1 = await sayLine(KEYS, SHORT, 'he', DEFAULT_VOICE, 2_000, QUICK);
  assert.equal(r1.ok && same(r1.wav, hers), true);
  assert.equal(one.asked.length, 3); // no fourth: there was a take in hand
  assert.ok(Date.now() - t1 < 1_000);

  // A long line's one request, silent: a second is sent.
  const long = speech((i) => (i === 0 ? 'silent' : hers));
  const rl = await sayLine(KEYS, LONG, 'he', DEFAULT_VOICE, 2_000, QUICK);
  assert.equal(rl.ok, true);
  assert.equal(long.asked.length, 2);
});

test('nothing answers at all: no line at the deadline, and nothing is left running', async () => {
  const s = speech(() => 'silent');
  const r = await sayLine(KEYS, SHORT, 'he', DEFAULT_VOICE, 200, QUICK);
  assert.deepEqual([r.ok, r.ok ? '' : r.why], [false, 'timeout']);
  assert.equal(s.asked.length, 4); // three, and the hedge's one
  assert.equal(s.abandoned(), 4);
});

test('a provider that refuses is not asked again — a 5xx is', async () => {
  const refused = speech(() => ({ status: 402 }));
  const r = await sayLine(KEYS, SHORT, 'he', DEFAULT_VOICE, 500, QUICK);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.why, /^http_402/);
  assert.equal(refused.asked.length, 3);

  const hers = voiceAt(HERS);
  const down = speech((i) => (i === 0 ? { status: 503 } : hers));
  const rl = await sayLine(KEYS, LONG, 'he', DEFAULT_VOICE, 500, QUICK);
  assert.equal(rl.ok, true);
  assert.equal(down.asked.length, 2);
});

test('a clip too short to judge is a line all the same — the ear never silences a line it cannot hear', async () => {
  speech(() => SILENCE);
  const r = await sayLine(KEYS, 'כן.', 'he', DEFAULT_VOICE, 500, QUICK);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.takes, r.hz], [3, 0]);
  // …and a take that CAN be heard is preferred to ones that cannot
  const hers = voiceAt(HERS);
  speech((i) => (i === 2 ? hers : SILENCE));
  const r2 = await sayLine(KEYS, 'כן.', 'he', DEFAULT_VOICE, 500, QUICK);
  assert.equal(r2.ok && same(r2.wav, hers), true);
});

test('a voice with no pitch on file (a probe’s candidate) is never refused — the middle take of three is the line', async () => {
  assert.equal(VOICE_PITCH_HZ.cedar, undefined);
  const takes = [voiceAt(140), voiceAt(95), voiceAt(110)];
  const s = speech((i) => takes[i]);
  const r = await sayLine(KEYS, SHORT, 'he', 'openai:gpt-4o-mini-tts:cedar', 500, QUICK);
  assert.equal(s.asked.length, 3);
  assert.equal(r.ok && same(r.wav, takes[2]), true);
  // every offered voice has its pitch on file
  for (const v of VOICES) assert.ok(VOICE_PITCH_HZ[v.split(':')[2]] > 100, v);
});
