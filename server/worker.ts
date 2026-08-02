/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH WORKER — the only thing between the app and Gemini.
 *
 * Deploy target: Cloudflare Workers. Copy this file over the generated `src/index.ts` in the
 * `hush-coach` project and run `npx wrangler deploy`.
 *
 * IT EXISTS FOR EXACTLY ONE REASON: **an API key cannot ship inside a phone app.** Anything in the
 * bundle is readable by anyone who downloads it, and a leaked Gemini key is someone else's bill on
 * your card. So the key lives in Cloudflare's secret store, the app never sees it, and this file is
 * the only code that does.
 *
 * It is deliberately thin. It holds no opinion about training, never edits a prompt, and never
 * inspects a plan — `coachPrompt` builds the call, `coachPlan` reads the answer, and both live in
 * the app where they are tested. Everything Gemini-specific is here and nowhere else: the URL, the
 * model name, the request shape, the schema dialect. That is what keeps "swap the provider" a
 * change to one file.
 *
 * ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────────────────────────
 * · It will not answer a caller that does not present the shared token. Without that, the URL is a
 *   public endpoint spending your money for anyone who finds it — and they are found, by scanners,
 *   within days.
 * · It will not accept a `model` from the caller. A request that picks its own model is a request
 *   that can pick the most expensive one.
 * · It will not accept an unbounded output. `maxOutputTokens` is set here, not by the app.
 * · It will not pass Google's error text back verbatim. An upstream error can quote the request,
 *   and the request contains an athlete's record.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface Env {
  /** Set with `npx wrangler secret put GEMINI_API_KEY`. Never in a file, never in the repo. */
  GEMINI_API_KEY: string;
  /**
   * Shared token the app sends in `x-hush-token`. Set with `npx wrangler secret put HUSH_TOKEN`.
   *
   * **This is a speed bump, not authentication.** It ships inside the app binary, so anyone willing
   * to unpack an IPA can read it. What it does buy is real: it stops the automated scanners that
   * find every new `*.workers.dev` hostname within days and spend whatever they can reach. Real
   * authentication arrives with real accounts; until then this is the difference between a bill you
   * chose and a bill you did not.
   */
  HUSH_TOKEN: string;
  /**
   * Cloudflare's rate limiter, declared in `wrangler.toml`. Optional at runtime on purpose: a
   * deploy that has not been given the binding yet still works, it is simply unlimited — and a
   * Worker that refused to start would be a worse failure than one that spends.
   */
  COACH_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

/**
 * The model, and the ceiling on what one call may cost.
 *
 * Named here rather than taken from the request on purpose — see the header. Changing the model is
 * an edit and a deploy, which is exactly the friction it should have.
 */
/*
 * `gemini-3.6-flash`, and the two readings it took to get here.
 *
 * ⚠️ FIRST: GOOGLE'S PRICE PAGE MIXES TWO CURRENCIES INSIDE ONE ROW SET. The Hebrew page prints
 * some figures in USD and some in shekels — `ש"ח` means USD x 4. Verified against the English page
 * line by line (3.6 output reads "30 ₪" / $7.50; 3.5 reads "36 ש"ח" / $9.00; 2.5-flash-lite reads
 * "1.6 ש"ח" / $0.40). Read the English page. A 4x error on OUTPUT price picks the wrong model.
 *
 * Real prices per million tokens, and one athlete's year at 156 sessions (5,138 in, ~1,200 out):
 *
 *     2.5-flash-lite     $0.10 / $0.40      $0.15/yr
 *     3.1-flash-lite     $0.25 / $1.50      $0.48/yr
 *     3.5-flash-lite     $0.30 / $2.50      $0.71/yr
 *     3.6-flash          $1.50 / $7.50      $2.61/yr      <- this one
 *     3.5-flash          $1.50 / $9.00      $2.89/yr
 *     3.1-pro-preview    $2.00 / $12.00     $3.85/yr
 *
 * WHY NOT THE CHEAP TIER: the whole gap between the cheapest model and this one is $2.46 a year per
 * athlete, against $99.99 of revenue. The ruling on the record is that the post-session call is the
 * only decision the product sells and is not where you save.
 *
 * WHY 3.6 AND NOT 3.5, WHICH GOOGLE'S OWN LIST CALLS "most intelligent": the version numbers are
 * not a capability ranking and this took measuring. Artificial Analysis scores them IDENTICALLY
 * (index 50 each). 3.5 leads on HLE, broad knowledge, 41% to 38%. 3.6 leads on knowledge work
 * (GDPval 1421 vs 1349) and on every agentic and tool benchmark, runs about twice as fast, and
 * spends FEWER output tokens for the same task — so the real saving is larger than the 17% headline.
 * A tie on intelligence, a win on everything operational. And speed is not only money here: intake
 * is a live conversation and it produces the brief everything else rests on.
 *
 * NOT Pro, though it is affordable: `preview` means Google may retire it and its rate limits are
 * stricter, and this product has no second decider to fall back on when a model disappears.
 *
 * ── ⚠️ MEASURED, AND THE ESTIMATE ABOVE IS WRONG BY 2.5x ────────────────────────────────────────
 * The table is what the price page implies. Here is what a real programme build actually cost, from
 * `usage` on a live call — a full 4-day half-marathon plan built from a two-turn conversation:
 *
 *     prompt              4,746 tokens
 *     visible output        452 tokens
 *     THINKING            4,105 tokens      <- billed at the OUTPUT rate
 *                        ──────
 *     per call           $0.0413            (estimate said $0.0167)
 *     per athlete/year   $6.44              (estimate said $2.61) — 6.4% of $99.99
 *
 * **Thinking is 9x the visible output and 82% of the bill.** Any cost estimate for a 3.x model that
 * counts only the reply is wrong by roughly that factor. Still comfortably affordable; the number
 * is corrected here rather than quietly left standing.
 *
 * ── AND WHY `thinkingLevel` IS NOT SET ──────────────────────────────────────────────────────────
 * `generationConfig.thinkingLevel` takes `minimal`/`low`/`medium`/`high` and defaults to `medium`.
 * The obvious move after the number above is to turn it down. The measurements say do not:
 *
 *     "reply with the word OK"        83 thinking tokens
 *     build a 4-day programme      4,105 thinking tokens
 *
 * Fifty times the spend for fifty times the task. **The model is already proportional**, so there is
 * no waste to trim — only a ceiling to lower on the one call the product sells. It is one line here
 * if volume ever changes that arithmetic.
 *
 * MAX_OUTPUT_TOKENS caps the worst case at $0.061 per call meanwhile.
 *
 * None of this is settled by argument. Unreadable-response counts per model on real athlete data
 * are the honest comparison, and switching is this line plus a deploy.
 */
const MODEL = 'gemini-3.6-flash';
const MAX_OUTPUT_TOKENS = 8192;
/**
 * ⚠️ THIS CONSTANT IS GONE, AND THE REASONING THAT SET IT WAS WRONG — kept here as a warning.
 *
 * It was raised 90s → 170s on the theory that the post-session call is simply heavy and deserves
 * longer: "a call that takes two minutes and arrives is worth far more than one cut off at ninety
 * seconds". Reasonable, and false. **There is no call that takes two minutes and arrives.** The
 * ceiling at 125s belongs to Cloudflare (see the fetch below), so every second we waited past it
 * bought nothing, and a healthy call of any kind has never once needed more than about twenty.
 *
 * The deadline is per-ATTEMPT now and set from what healthy calls actually cost — see `attemptMs`.
 * A number chosen from what the infrastructure ALLOWS, rather than from what the work COSTS, is a
 * number that only ever measures how long she waits to be told nothing happened.
 */

/** What the app sends. Mirrors `domain/coachPrompt.CoachRequest`, plus the schema to lock onto. */
interface CoachCall {
  blocks: { text: string; cache?: true }[];
  /**
   * How hard to think. Absent means Google's default, `medium`.
   *
   * ⛔ THIS IS NOT A COST KNOB. It is what makes the heaviest call POSSIBLE — see the ceiling
   * documented at the fetch below. The model emits nothing at all while it thinks, so thinking time
   * is dead air on the wire, and dead air is what the ceiling counts.
   *
   * ⚠️ Turning it DOWN is not the fix it looks like. Measured on the same post-session call:
   * `low` answered in 3.9s and wrote a one-exercise week; the default wrote a real one. Thinking
   * level buys the quality of the programme. What we cut instead was the prompt.
   */
  think?: 'minimal' | 'low' | 'medium' | 'high';
  /** `COACH_PLAN_SCHEMA`, in JSON Schema. Absent for a plain chat turn, where prose is the answer. */
  schema?: Record<string, unknown>;
}

/* ─────────────────────────────────────────────────────────── the schema dialect (see geminiSchema) */

const TYPE: Record<string, string> = {
  object: 'OBJECT', array: 'ARRAY', string: 'STRING',
  number: 'NUMBER', integer: 'INTEGER', boolean: 'BOOLEAN',
};

/**
 * JSON Schema → Gemini's `responseSchema` (a subset of OpenAPI 3.0).
 *
 * A verbatim copy of `src/domain/geminiSchema.ts` in the app, where it is covered by
 * `__tests__/domain/geminiSchema.test.ts`. It is duplicated rather than imported because a Worker
 * is a separate deployable with its own bundle; the app's copy is the one under test, and this one
 * must be changed with it. Three things do not survive untranslated: `additionalProperties` (not in
 * the subset — dropped, since `parseCoachPlan` enforces what it was buying), union types like
 * `["number","null"]` (Gemini spells it `nullable`), and lowercase type names.
 */
function geminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const rawType = schema.type;
  const out: Record<string, unknown> = {};

  if (typeof rawType === 'string') {
    if (TYPE[rawType]) out.type = TYPE[rawType];
  } else if (Array.isArray(rawType)) {
    const real = rawType.find((t) => typeof t === 'string' && t !== 'null') as string | undefined;
    if (real && TYPE[real]) out.type = TYPE[real];
    if (rawType.includes('null')) out.nullable = true;
  }

  if (typeof schema.description === 'string') out.description = schema.description;

  if (Array.isArray(schema.enum)) {
    out.enum = [...schema.enum];
    // Without `format: "enum"` the constraint is silently ignored and any string is allowed.
    if (out.type === 'STRING') out.format = 'enum';
  }

  if (schema.items && typeof schema.items === 'object') {
    out.items = geminiSchema(schema.items as Record<string, unknown>);
  }
  if (typeof schema.minItems === 'number') out.minItems = schema.minItems;
  if (typeof schema.maxItems === 'number') out.maxItems = schema.maxItems;

  if (schema.properties && typeof schema.properties === 'object') {
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const keys = Object.keys(props);
    out.properties = Object.fromEntries(keys.map((k) => [k, geminiSchema(props[k])]));
    out.propertyOrdering = keys;
  }
  if (Array.isArray(schema.required) && schema.required.length > 0) {
    out.required = [...schema.required];
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────────────── the worker */

/**
 * The headers that let a browser talk to this at all.
 *
 * The app is not a browser origin and does not need them. The GALLERY is, and driving this from a
 * desktop browser is how it gets looked at before it ships — which is not a nicety: see the OPTIONS
 * handler below for the bug that only a browser could find.
 */
const CORS = {
  'access-control-allow-origin': '*',
  /*
   * ⚠️ EVERY HEADER THE APP SENDS HAS TO BE NAMED HERE, AND `x-hush-install` WAS NOT.
   *
   * It was added to the client for the rate limit — the one thing that tells one athlete from a
   * script — and this list was not updated with it. A browser then asks permission for a header the
   * answer does not grant, the preflight fails, **the real POST is never sent**, and the app reports
   * `offline` because from its side nothing came back. Nothing appears in any log, on either side.
   *
   * A phone never sees it: a native fetch sends no preflight. So this breaks exactly one thing —
   * driving the coach from a browser, which is the only way anybody looks at it before a build.
   * That is the SECOND time this precise trap has cost an hour (the first was `OPTIONS` answering
   * with a body at a null-body status, 2026-07-31), and both times the symptom was a bare failure
   * with nothing to read.
   */
  'access-control-allow-headers': 'content-type, x-hush-token, x-hush-install',
  'access-control-allow-methods': 'POST, OPTIONS',
  // Cache the preflight for a day. Without it every single call is TWO round trips, and the first
  // one carries no data — pure latency, on a screen where she is waiting for an answer.
  'access-control-max-age': '86400',
} as const;

/** One JSON reply, with the headers the app needs to read it from a phone. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

/**
 * Compare two secrets without leaking their contents through how long the comparison took.
 *
 * `a === b` on strings returns early at the first differing character, which is enough to recover a
 * token one character at a time given enough attempts. Overkill for a shared speed-bump token, and
 * it costs three lines.
 */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    /*
     * ⚠️ THE BODY MUST BE null, AND THIS COST A LIVE BUG.
     *
     * This used to be `json({}, 204)`. 204 means NO CONTENT, and constructing a Response with a
     * body at a null-body status throws — so the preflight failed, so the browser never sent the
     * real request, and every POST from a browser died as a bare "Failed to fetch" with nothing in
     * any log. The Worker had answered `OK` from PowerShell an hour earlier and looked finished.
     *
     * **PowerShell never sends a preflight.** A POST carrying `x-hush-token` from a browser always
     * does. The whole class was invisible to the only client it had been tested with — the same
     * lesson this project keeps paying for: what the harness cannot drive, nobody sees.
     */
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // A GET returns a liveness answer and NOTHING else — no version, no model name, no config. An
    // endpoint that describes itself to a stranger is an endpoint that has told them what to try.
    if (request.method === 'GET') return json({ ok: true });
    if (request.method !== 'POST') return json({ error: 'method' }, 405);

    if (!env.GEMINI_API_KEY || !env.HUSH_TOKEN) {
      // Misconfigured rather than unauthorised — and said without naming which secret is missing.
      return json({ error: 'unconfigured' }, 500);
    }
    /*
     * BOTH SIDES TRIMMED.
     *
     * A secret set through a shell pipe arrives with the shell's trailing newline attached, and on
     * Windows that is two characters. The length check below then fails and the answer is a flat
     * 401 with nothing to distinguish it from a genuinely wrong token — which is exactly the hour
     * this cost on the first real deploy. Trailing whitespace in a credential is always an accident
     * of how it was typed, never part of the value.
     */
    const sent = (request.headers.get('x-hush-token') ?? '').trim();
    const stored = (env.HUSH_TOKEN ?? '').trim();
    if (!sameSecret(sent, stored)) return json({ error: 'unauthorized' }, 401);

    /*
     * ════ THE LIMIT, AND WHY IT IS KEYED ON THE INSTALL ════
     *
     * The token above is a speed bump, not a secret — it ships inside the app bundle, because that
     * is what shipping a client means. Anyone who unpacks the app holds a working key to our Gemini
     * spend, and there was NO limit of any kind here: a loop could have run all night.
     *
     * Keyed on the shared token alone the ceiling would have to be low enough to hurt a real
     * athlete. Keyed on the INSTALL it can be generous to her and still stop a script — an attacker
     * has to mint a new id per request to get past it, which is possible and which makes this a
     * speed bump too. That is the honest description: it turns an open tap into work.
     *
     * The IP is the fallback for a client that sends no id, and the harder key of the two.
     */
    if (env.COACH_LIMIT) {
      const install = (request.headers.get('x-hush-install') ?? '').trim();
      const key = install.length > 0 ? `i:${install}` : `ip:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`;
      const { success } = await env.COACH_LIMIT.limit({ key }).catch(() => ({ success: true }));
      if (!success) {
        // 429 so the app can say "too many, in a moment" rather than "no connection" — a different
        // sentence, and the only one of the two that is true.
        return json({ error: 'rate_limited' }, 429);
      }
    }

    let call: CoachCall;
    try {
      call = (await request.json()) as CoachCall;
    } catch {
      return json({ error: 'bad_request' }, 400);
    }
    if (!Array.isArray(call.blocks) || call.blocks.length === 0) {
      return json({ error: 'bad_request' }, 400);
    }

    /*
     * THE PREAMBLE GOES FIRST AND IS SENT VERBATIM.
     *
     * Gemini's implicit caching keys on the START of the request, so the block order the app chose
     * is the whole saving — one reordering here and every call pays full price, silently. The app
     * already marks which block is the stable one; this only has to not disturb it.
     */
    const contents = [{
      role: 'user',
      parts: call.blocks.map((b) => ({ text: String(b.text ?? '') })),
    }];

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Nested, not beside: a bare `thinkingLevel` in `generationConfig` is a 400, in 0.3s.
        ...(call.think ? { thinkingConfig: { thinkingLevel: call.think } } : {}),
        ...(call.schema
          ? {
              // Structured output: the reply is JSON of this shape or it is an error. It is what
              // keeps the app from being handed prose where it expects a programme.
              responseMimeType: 'application/json',
              responseSchema: geminiSchema(call.schema),
            }
          : {}),
      },
    };

    /*
     * A 404 HERE IS NOT ALWAYS A WRONG MODEL ID — and an hour went into learning that.
     *
     * On a freshly enabled project, `GET /v1beta/models` answers immediately while
     * `:generateContent` still 404s: Google enables the read path and the billed path on different
     * clocks. The first live call failed this way against TWO different model ids, both of which the
     * key's own model list contained. The fix was neither id. It was waiting.
     *
     * So if this 404s right after a new key: change nothing, wait, call again. Guessing a third id
     * costs a deploy and proves nothing.
     */
    /*
     * ⛔ THERE IS A 125-SECOND CEILING ON THIS CALL AND IT IS NOT OURS TO RAISE.
     *
     * Measured 2026-08-02, once Gemini was healthy again: the post-session call failed at
     * **125.18s / 125.15s / 125.11s** — the same second every time, with an eight-token call
     * answering in 1.6s either side of it. Not an outage, and not `TIMEOUT_MS` (170s). The status
     * that comes back is 524, a CLOUDFLARE code: it is the Worker's own outbound subrequest being
     * cut off, so no timeout we set on either side can move it.
     *
     * Switching to `:streamGenerateContent?alt=sse` was the obvious fix and **it did not work** —
     * failed at 125.14s, identically. The model emits nothing while it thinks, so a stream is just
     * as idle as a plain request until the first token, and idle is what gets cut.
     *
     * The streaming endpoint is kept anyway: it costs nothing, it removes any ceiling on how long
     * the ANSWER may take once it has started, and it is the honest shape for a long generation. The
     * app cannot tell — we join the chunks and reply with exactly the same JSON as before.
     *
     * ── WHAT ACTUALLY FIXED IT ──────────────────────────────────────────────────────────────────
     * Thinking is the dead air, so the fix was to give the model less to think about. Prompt v15
     * halved the preamble (34,878 → 16,330 chars: a compact catalogue, and rationale moved out of
     * the prompt and into comments). The same call answers in 15.7s now — and answers BETTER. See
     * `coachPrompt.howToAnswer`, where the measurements are.
     *
     * ⚠️ REDUCED, NOT ELIMINATED: one v15 run still hit 125s. That is what the retry below and
     * `retryWaitingUpdate()` in the app are for. Anything that grows this prompt again spends the
     * margin that keeps her week arriving.
     */
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;
    /*
     * HOW LONG ONE ATTEMPT MAY TAKE, and how many attempts there are.
     *
     * Both numbers come from measurement, not from what the infrastructure allows:
     *
     *     a conversational turn (`low`)    1.5–12s observed   →  20s, three attempts
     *     a programme, full thinking        14–20s observed   →  45s, three attempts
     *
     * ⚠️ ONE STALL IN FOUR, AND THEN ONE IN EIGHT. The first cut of this used a single retry at 30s
     * and still lost a call out of eight — 502 at 60.2s, two stalls in a row. A stall is
     * independent of the request (four identical turns went 9.9s, 8.4s, 125.1s, 2.0s), so the
     * answer to a 12% failure is a third attempt, not a longer wait: three chances at 20s is 60s
     * of worst case against roughly one call in six hundred.
     *
     * A stalled attempt is abandoned before it produces anything, so this buys reliability with
     * prompt tokens — about three quarters of a cent in the worst case, and nothing at all in the
     * usual one, because a healthy call never comes near the deadline.
     */
    const conversational = call.think === 'low' || call.think === 'minimal';
    const attemptMs = conversational ? 20_000 : 45_000;
    const ATTEMPTS = 3;

    /** `n` is which attempt this is, from 1. */
    const attempt = async (n: number): Promise<Response> => {
      const lastAttempt = n >= ATTEMPTS;
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // The key rides in a header, never in the URL — a URL ends up in logs and referrers.
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(attemptMs),
      });
    } catch {
      /*
       * ⛔ A STALL MUST NOT COST HER TWO MINUTES — founder, on the device, 2026-08-02: *"it takes
       * him a huge amount of time to answer, and if he doesn't answer it just says Not sent."*
       *
       * ⚠️ MEASURED, AND IT IS NOT THINKING TIME. Four identical three-line conversational turns at
       * `low`: **9.9s, 8.4s, 125.1s, 2.0s.** The same request, the same short reply. One call in
       * four simply hangs, and until now it hung all the way to the 125s ceiling and came back as
       * nothing — after she had watched a typing indicator for two minutes.
       *
       * So the deadline below is set from what a HEALTHY call actually costs rather than from what
       * the ceiling allows, and a call that blows through it is abandoned and asked again. The
       * retry is cheap: the first attempt produced nothing at all, and the second one has been
       * answering in seconds.
       *
       * Worst case is now two attempts instead of one 125s wall — and the typical case is
       * untouched, because a healthy call never comes near this.
       */
      if (!lastAttempt) return attempt(n + 1);
      // A second stall, or a gym basement. Nothing was decided, and the app knows what to do:
      // nothing is written, and the update waits.
      return json({ error: 'upstream_unreachable' }, 502);
    }

    if (!upstream.ok) {
      /*
       * NEVER RELAY GOOGLE'S ERROR BODY.
       *
       * An upstream 400 commonly quotes the offending request back — and the request contains an
       * athlete's record. Relaying it would put her training history into whatever log the app's
       * error path happens to write to. The status is enough to act on; the detail belongs in the
       * Worker's own tail (`npx wrangler tail`), which only the owner can read.
       */
      /*
       * The body goes to the TAIL, never to the caller.
       *
       * `npx wrangler tail` is the owner's own console, so the detail — including anything Google
       * quotes back from the request — stays where only he can read it. Returning it to the app
       * would put an athlete's record into whatever log the error path happens to write to, which
       * is the distinction this whole branch exists to hold.
       */
      const detail = await upstream.text().catch(() => '');
      console.log(`gemini ${upstream.status} :: ${detail.slice(0, 800)}`);

      /*
       * ONE NARROW EXCEPTION, AND ONLY FOR 404.
       *
       * The rule above stands: Google's error body is not relayed, because it quotes the REQUEST
       * back and the request is an athlete's record. A 404 is the one status where the message is
       * about the URL rather than the payload — "models/X is not found for API version v1beta" —
       * so it names our own configuration and nothing of hers. Relaying just that one string turns
       * a deploy-per-guess into a single answer.
       *
       * `message` only, never the whole body, and never for any other status.
       */
      if (upstream.status === 404) {
        let why = '';
        try {
          why = String((JSON.parse(detail) as { error?: { message?: string } })?.error?.message ?? '');
        } catch {
          why = '';
        }
        return json({ error: 'upstream_error', status: 404, why: why.slice(0, 300), url }, 502);
      }
      /*
       * ONE IMMEDIATE RETRY, AND ONLY FOR THE CHEAP FAILURES.
       *
       * A 503 is Gemini saying "busy, not you", and it costs seconds to be told — measured twice
       * today, at 3.7s and 2.2s, on calls that then succeeded on the very next attempt. Losing an
       * athlete's week to that would be absurd when asking again is nearly free.
       *
       * A 524 no longer reaches this branch at all: `attemptMs` abandons a stalled call at 20s or
       * 45s, long before Cloudflare's 125s cut, so a stall is handled as an abort above. The
       * distinction that matters is unchanged — a failure we were told about quickly is worth
       * asking again; one that costs two minutes to learn is not.
       *
       * `never retries — one workout is one call, and one bill` still holds: a 503 is not an answer
       * we were given and disliked, it is the call never having happened.
       */
      if ((upstream.status === 503 || upstream.status === 429) && !lastAttempt) {
        await new Promise((r) => setTimeout(r, 1_200));
        return attempt(n + 1);
      }
      return json({ error: 'upstream_error', status: upstream.status }, 502);
    }

    /*
     * READING THE STREAM.
     *
     * Server-sent events: `data: {…}` lines, one GenerateContentResponse each. The text arrives in
     * pieces and is joined; `finishReason` and `usageMetadata` turn up on the last chunks and simply
     * overwrite, so what we answer with is the final word on both.
     *
     * `AbortSignal.timeout` above covers the headers, not the body — a stream that stalled mid-way
     * would hang here for ever without the deadline below, which is the one failure mode streaming
     * introduces that a plain request could not have.
     */
    type Chunk = {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: Record<string, number>;
    };
    const deadline = Date.now() + attemptMs;
    const reader = upstream.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let finishReason: string | null = null;
    let usage: Record<string, number> | null = null;

    const take = (line: string) => {
      if (!line.startsWith('data:')) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      let chunk: Chunk;
      try {
        chunk = JSON.parse(payload) as Chunk;
      } catch {
        return;
      }
      const candidate = chunk.candidates?.[0];
      text += candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
    };

    try {
      while (reader) {
        if (Date.now() > deadline) throw new Error('stream_stalled');
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // The tail may be half a line; it waits for the next read.
        buffer = lines.pop() ?? '';
        for (const line of lines) take(line.trim());
      }
      take(buffer.trim());
    } catch {
      // Same ruling as a dropped connection above: a partial answer is not a decision that arrived.
      return json({ error: 'upstream_unreachable' }, 502);
    }

    return json({
      text,
      finishReason,
      // Passed through so the app can count what a call actually cost, per model, on real data —
      // the only honest way to compare a cheap model with an expensive one.
      usage,
      model: MODEL,
    });
    };

    return attempt(1);
  },
};
