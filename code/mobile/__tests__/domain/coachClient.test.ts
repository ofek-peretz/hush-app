/**
 * ════ THE COACH CLIENT — every failure is the same failure ════
 *
 * No key, no network, a timeout, a 500, an empty body: all of them mean one thing to this app, and
 * it is a rule the founder already ruled on — *no connection, nothing is decided, the update waits.*
 *
 * So these tests are less about the happy path than about the shapes of failure, and about two
 * things this client must never do: retry by itself (a post-session call that quietly retries three
 * times is three bills for one workout, and she has already left the gym), and fall back to a local
 * decision (there is no second decider).
 */

const URL = 'https://hush-coach.example.workers.dev';
const TOKEN = 'a-shared-speed-bump-token';

/** Load the module with the environment set — it reads config at import time, as a bundle does. */
function load(env: { url?: string; token?: string } = { url: URL, token: TOKEN }) {
  jest.resetModules();
  process.env.EXPO_PUBLIC_COACH_URL = env.url ?? '';
  process.env.EXPO_PUBLIC_COACH_TOKEN = env.token ?? '';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/platform/coach/coachClient') as typeof import('@/platform/coach/coachClient');
}

const request = { v: 1, blocks: [{ text: 'PREAMBLE', cache: true as const }, { text: 'HER RECORD' }] };

/** A fetch that answers once, and records what it was asked. */
function fetchOnce(reply: Partial<Response> & { json?: () => Promise<unknown> }) {
  const spy = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), ...reply });
  (globalThis as { fetch: unknown }).fetch = spy;
  return spy;
}

afterEach(() => {
  delete process.env.EXPO_PUBLIC_COACH_URL;
  delete process.env.EXPO_PUBLIC_COACH_TOKEN;
});

describe('an answer', () => {
  it('returns the text, the model that answered, and what it cost', () => {
    const { askCoach } = load();
    fetchOnce({ json: async () => ({ text: '{"v":2}', model: 'gemini-2.5-flash-lite', usage: { totalTokenCount: 5138 } }) });
    return askCoach(request).then((r) => {
      expect(r).toEqual({
        ok: true,
        text: '{"v":2}',
        model: 'gemini-2.5-flash-lite',
        usage: { totalTokenCount: 5138 },
      });
    });
  });

  it('sends the blocks in the order the prompt chose, and the token in a header', async () => {
    const { askCoach } = load();
    const spy = fetchOnce({ json: async () => ({ text: 'ok', model: 'm' }) });
    await askCoach(request, { type: 'object' });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL);
    expect((init.headers as Record<string, string>)['x-hush-token']).toBe(TOKEN);
    const body = JSON.parse(init.body as string);
    // Block order IS the caching saving — Gemini keys implicit caching on the start of the request.
    expect(body.blocks.map((b: { text: string }) => b.text)).toEqual(['PREAMBLE', 'HER RECORD']);
    expect(body.schema).toEqual({ type: 'object' });
  });

  it('omits the schema entirely for a chat turn', async () => {
    // A prose answer locked to a plan schema comes back as JSON nobody reads.
    const { askCoach } = load();
    const spy = fetchOnce({ json: async () => ({ text: 'ok', model: 'm' }) });
    await askCoach(request);
    expect('schema' in JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toBe(false);
  });

  it('never sends the Gemini key, because it does not have one', async () => {
    const { askCoach } = load();
    const spy = fetchOnce({ json: async () => ({ text: 'ok', model: 'm' }) });
    await askCoach(request);
    const call = JSON.stringify(spy.mock.calls[0]);
    expect(call).not.toContain('GEMINI');
    expect(call).not.toMatch(/AIza/);
  });
});

describe('every failure is the same failure', () => {
  it('says so when the build shipped without configuration, without calling anything', async () => {
    const { askCoach, coachIsReachable } = load({ url: '', token: '' });
    const spy = fetchOnce({});
    expect(coachIsReachable()).toBe(false);
    expect(await askCoach(request)).toEqual({ ok: false, reason: 'not_configured' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('treats a half-configured build as unconfigured rather than trying it', async () => {
    // A URL with no token is a call that will 401 and cost a round trip to learn nothing.
    expect(load({ url: URL, token: '' }).coachIsReachable()).toBe(false);
    expect(load({ url: '', token: TOKEN }).coachIsReachable()).toBe(false);
  });

  it('reads a dead network as offline', async () => {
    const { askCoach } = load();
    (globalThis as { fetch: unknown }).fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    expect(await askCoach(request)).toEqual({ ok: false, reason: 'offline' });
  });

  it('tells a timeout apart from a dead network', async () => {
    // They mean different things to whoever reads the count: one is a gym basement, the other is a
    // model that thought for too long.
    const { askCoach } = load();
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    (globalThis as { fetch: unknown }).fetch = jest.fn().mockRejectedValue(abort);
    expect(await askCoach(request)).toEqual({ ok: false, reason: 'timed_out' });
  });

  it('keeps OUR misconfiguration apart from an upstream outage', async () => {
    // A 401 means the shipped token is wrong — a build problem, not weather. Folding it into
    // `upstream` would hide it inside the noise of ordinary outages.
    const { askCoach } = load();
    fetchOnce({ ok: false, status: 401 });
    expect(await askCoach(request)).toEqual({ ok: false, reason: 'refused' });
  });

  it('reads any other non-200 as upstream', async () => {
    const { askCoach } = load();
    for (const status of [400, 429, 500, 502]) {
      fetchOnce({ ok: false, status });
      expect({ status, r: await askCoach(request) }).toEqual({ status, r: { ok: false, reason: 'upstream' } });
    }
  });

  it('reads a body that will not parse as upstream, not as an answer', async () => {
    const { askCoach } = load();
    fetchOnce({ json: async () => { throw new SyntaxError('unexpected end of JSON'); } });
    expect(await askCoach(request)).toEqual({ ok: false, reason: 'upstream' });
  });

  it('refuses to call an empty 200 an answer', async () => {
    // Handing "" to the parse would count as an unreadable PLAN and blame the model for something
    // that happened in the pipe.
    const { askCoach } = load();
    fetchOnce({ json: async () => ({ text: '', model: 'm' }) });
    expect(await askCoach(request)).toEqual({ ok: false, reason: 'empty' });
    fetchOnce({ json: async () => ({ model: 'm' }) });
    expect(await askCoach(request)).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('what it never does', () => {
  it('never retries — one ask is one call', async () => {
    // A post-session call that quietly retries three times is three bills for one workout, and the
    // athlete is not waiting on it: she finished and left.
    const { askCoach } = load();
    const spy = fetchOnce({ ok: false, status: 500 });
    await askCoach(request);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('never answers with a decision of its own when the coach did not answer', async () => {
    // There is no second decider. A local fallback would reintroduce the exact thing the
    // architecture removed.
    const { askCoach } = load();
    fetchOnce({ ok: false, status: 500 });
    const r = await askCoach(request);
    expect(r.ok).toBe(false);
    expect('text' in r).toBe(false);
    expect('plan' in r).toBe(false);
  });
});
