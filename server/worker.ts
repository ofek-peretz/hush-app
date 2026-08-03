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
/**
 * ⛔ THIS CAP INCLUDES THINKING, AND AT 8192 IT WAS CUTTING PROGRAMMES IN HALF.
 *
 * ⚠️ WATCHED HAPPEN, 2026-08-02: two replies came back as JSON that stopped mid-string. The app
 * reports that as `not_json`, which reaches her as "Not sent" — a whole turn lost, looking exactly
 * like a network failure and caused by nothing of the sort.
 *
 * `thoughtsTokenCount` is billed at the output rate on 3.x, and it is COUNTED AGAINST
 * `maxOutputTokens` too. Measured on a deliberately heavy build — six days, 90 minutes, "as
 * detailed as possible", supersets and running:
 *
 *     prompt          4,688
 *     thinking        5,444      <- 79% of the budget, before a single visible character
 *     visible         1,424
 *                    ──────
 *     against          8,192      finishReason STOP, with ~1,300 to spare
 *
 * That one survived. A seven-day programme, or a week with more items, does not — and the failure
 * is silent, because a truncated reply is indistinguishable from a dropped call.
 *
 * 16,384 leaves the thinking room to run and the programme room to be written. It is a SAFETY NET
 * against a runaway generation, not a budget: the model stops when it is finished, so the usual
 * call is unaffected and only the worst case moves (about $0.12 rather than $0.061 — on a call that
 * has never once happened).
 */
const MAX_OUTPUT_TOKENS = 16_384;
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
  /**
   * ════ WHAT SHE SHOWED IT ════
   *
   * Base64, and the mime type it was encoded as. A photographed programme from a previous coach, the
   * plate markings on an unfamiliar machine, a rack whose numbers she cannot read.
   *
   * ⚠️ THE SIZE LIMIT IS NOT TIDINESS. An image is billed as tokens like everything else, and it
   * arrives base64 — a third larger than the file. `MAX_IMAGE_BYTES` is enforced HERE rather than in
   * the app because the app is the part an attacker controls: a client that skipped its own resize
   * would otherwise be able to spend whatever a phone can encode.
   */
  images?: { mime: string; data: string }[];
}

/**
 * What an image may be, and how many.
 *
 * ~1.3 MB of base64 is roughly a 1 MB JPEG, which is a long way past what the model needs — the app
 * resizes to 1024px before it ever gets here, landing around 150 KB. This is the ceiling that stops
 * a broken or hostile client, not the size we expect.
 */
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 1_400_000;
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

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
    /*
     * ⚠️ AND THE IMAGES GO LAST, AFTER EVERY BLOCK OF TEXT.
     *
     * Not a style choice — it is the same cache rule as above, read one level down. The preamble is
     * byte-identical for every athlete alive and that is what makes the prefix cacheable; a picture
     * inserted anywhere before it, or between the blocks, would push unique bytes into the shared
     * region and every call after it would pay full price, silently.
     *
     * Last also happens to be where a person would put it: the sheet, the question, then "here,
     * look at this".
     */
    const images = Array.isArray(call.images) ? call.images.slice(0, MAX_IMAGES) : [];
    for (const img of images) {
      if (typeof img?.data !== 'string' || !IMAGE_MIME.includes(String(img?.mime))) {
        return json({ error: 'bad_request' }, 400);
      }
      if (img.data.length > MAX_IMAGE_BYTES) return json({ error: 'image_too_large' }, 413);
    }

    const contents = [{
      role: 'user',
      parts: [
        ...call.blocks.map((b) => ({ text: String(b.text ?? '') })),
        ...images.map((img) => ({ inlineData: { mimeType: img.mime, data: img.data } })),
      ],
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
    /*
     * ⛔ AND THE DEADLINES ARE STAGED, BECAUSE A FLAT ONE MAKES HER PAY THE WORST CASE EVERY TIME.
     *
     * ⚠️ FOUNDER, ON BUILD 39: *"it still takes him a very, very long time to answer messages."*
     * Measured on the exact call the app makes, twelve runs:
     *
     *     1.4 · 1.5 · 1.5 · 1.5 · 1.6 · 1.6 · 1.7 · 1.8 · 2.4 · 7.0 · 8.5 · 41.6 · (one 60s failure)
     *
     * **A healthy conversational turn is under two seconds.** The stall is not slowness and it is
     * not thinking — `minimal` was no faster than `low` in the good case. It is a call that gets no
     * response at all, about one in six.
     *
     * The flat 20s deadline was sized from the slowest HEALTHY call, which meant every stall cost
     * 20 seconds before we even asked again — and two of them cost 40. That is the founder's
     * complaint exactly: not that the coach is slow, but that when it hangs she pays for it in full.
     *
     * Staged instead. The first attempt is sized to the TYPICAL call, so a stall is abandoned while
     * she is still expecting an answer, and the retry that follows usually lands in a second and a
     * half. Each later attempt gets more room, because by then the question is no longer "is this
     * hung" but "is everything slow right now".
     */
    /*
     * ⛔ HEDGED, NOT RETRIED — AND THE DIFFERENCE IS THE WHOLE FIX.
     *
     * ⚠️ FOUNDER, ON BUILD 39: *"it still takes him a very, very long time to answer messages."*
     *
     * Two earlier attempts at this were both wrong, and the second was worse than the first:
     *
     *   · A FLAT 20s DEADLINE, then retry. Twelve measured calls: 1.4 · 1.5 · 1.5 · 1.5 · 1.6 · 1.6
     *     · 1.7 · 1.8 · 2.4 · 7.0 · 8.5 · 41.6, plus one outright failure at 60s. About one call in
     *     six gets no response at all, and every one of those cost her the full 20 seconds BEFORE
     *     we even asked again.
     *   · SO I SHORTENED IT to 7s, staged. Fourteen calls, median 5.4s and several at 14–19s —
     *     **worse than what it replaced.** Because a 7s cut cannot tell a stalled call from a live
     *     one that is merely slow: it killed real work at 7s and paid to start over.
     *
     * **You cannot distinguish "hung" from "slow" by waiting. So stop waiting.** A second attempt
     * starts alongside the first without cancelling it, and whichever answers first wins. A slow-
     * but-alive call still wins if it finishes; a truly hung one is simply overtaken. Nobody ever
     * waits out a deadline to discover there is nothing coming.
     *
     * It costs a second call on the minority that are slow — a few tenths of a cent of prompt, on
     * roughly one turn in six — and buys back tens of seconds of somebody staring at a typing
     * indicator. That is a trade this product should take every time.
     *
     * `HEDGE_MS` is set just above the typical call so the common case never spawns a second one.
     * `OVERALL_MS` is the point where we stop hoping; the app waits longer still (`coachClient`).
     */
    /*
     * ⚠️ TUNED FROM THE FAST CASE, NOT THE SLOW ONE. Three identical requests, seconds apart:
     * **1.79s, 9.42s, 1.82s.** A healthy conversational turn is under two seconds, so a call still
     * silent at 2.5 is already the bad draw — and hedging at 4s was firing after the damage.
     *
     * Just above the fast case is the right place: the common turn never spawns a second call at
     * all, and a bad draw gets its replacement while she is still watching the dots.
     */
    const HEDGE_MS = conversational ? 1_800 : 20_000;
    const OVERALL_MS = conversational ? 45_000 : 110_000;
    const MAX_IN_FLIGHT = 3;

    let upstream: Response;
    {
      const controllers: AbortController[] = [];
      /** Resolves with the first attempt that comes back with usable headers. */
      let win!: (r: Response) => void;
      const firstGood = new Promise<Response>((r) => (win = r));
      /** Whose body we are going to read — the only one that must NOT be aborted. */
      let keep: AbortController | undefined;
      let settled = 0;
      let lastStatus: number | undefined;
      let lastWhy: string | undefined;
      let allDone!: () => void;
      const exhausted = new Promise<void>((r) => (allDone = r));

      const launch = () => {
        const controller = new AbortController();
        controllers.push(controller);
        void fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            // The key rides in a header, never in the URL — a URL ends up in logs and referrers.
            'x-goog-api-key': env.GEMINI_API_KEY,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
          .then((res) => {
            // A non-ok status is a real answer about our request and every attempt will get the
            // same one — so it is remembered, not raced. Only a usable response wins.
            if (res.ok) {
              keep = controller;
              win(res);
              return undefined;
            }
            lastStatus = res.status;
            /*
             * ⚠️ THE BODY GOES TO THE TAIL, NEVER TO THE CALLER. An upstream 400 commonly quotes the
             * offending request back, and the request is an athlete's record — relaying it would put
             * her training history into whatever log the app's error path happens to write to.
             * `npx wrangler tail` is the owner's own console.
             */
            return res.text().then((detail) => {
              console.log(`gemini ${res.status} :: ${detail.slice(0, 800)}`);
              /*
               * ONE NARROW EXCEPTION, AND ONLY FOR 404 — a 404 is the one status whose message is
               * about the URL rather than the payload ("models/X is not found for API version
               * v1beta"), so it names our own configuration and nothing of hers. It turns a
               * deploy-per-guess into a single answer, and it cost an hour to learn that the fix is
               * usually to WAIT: Google enables the read path and the billed path on different
               * clocks, so a fresh key 404s on `:generateContent` while `GET /models` already works.
               */
              if (res.status === 404) {
                try {
                  lastWhy = String((JSON.parse(detail) as { error?: { message?: string } })?.error?.message ?? '');
                } catch {
                  lastWhy = '';
                }
              }
            });
          })
          .catch(() => {
            /* aborted, stalled, or the connection died. Nothing to say; another attempt may land. */
          })
          .finally(() => {
            /*
             * ⛔ EVERYTHING IN FLIGHT HAS FAILED — DO NOT SIT OUT THE HEDGE TIMER.
             *
             * ⚠️ Found in the live battery, 2026-08-02: a build came back 503 and the athlete got
             * nothing. The hedge is timed for a call that is STILL RUNNING — waiting 1.8s before
             * asking again makes sense when the first attempt might yet answer. A 503 already
             * answered: it said no. Waiting is then pure delay, and three of them in a row is the
             * difference between a slow programme and no programme.
             *
             * So this fires whenever nothing is left in flight, and the loop below either launches
             * the next attempt at once or gives up because there are none left. It replaces the
             * immediate-503-retry that the move to hedging quietly dropped.
             */
            settled += 1;
            if (settled >= controllers.length) allDone();
          });
      };

      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      launch();
      let winner: Response | null = null;
      const stopAt = Date.now() + OVERALL_MS;
      for (let n = 1; n <= MAX_IN_FLIGHT && !winner; n += 1) {
        const remaining = stopAt - Date.now();
        if (remaining <= 0) break;
        const waitFor = n < MAX_IN_FLIGHT ? Math.min(HEDGE_MS, remaining) : remaining;
        winner = await Promise.race([
          firstGood,
          // Nothing is in flight any more and none of it was usable — go again NOW rather than
          // waiting out a hedge that was timed for a call still running.
          exhausted.then(() => null),
          sleep(waitFor).then(() => null),
        ]);
        if (!winner && n < MAX_IN_FLIGHT) {
          // A failure that came back FAST deserves a breath before the next ask; a hedge does not,
          // because the first attempt is still going.
          if (settled >= controllers.length) await sleep(700);
          launch();
        }
      }
      // Whoever is still running is no longer wanted. Aborting them stops the bytes and the bill.
      // ⚠️ Except the winner: its body has not been read yet, and aborting it would cancel the very
      // stream we are about to consume.
      for (const c of controllers) if (c !== keep) c.abort();

      if (!winner) {
        // Nothing usable from any attempt. If one of them was told something specific, relay THAT
        // rather than a generic unreachable — a 401 must not be reported as a bad connection.
        if (lastStatus === 404) {
          return json({ error: 'upstream_error', status: 404, why: (lastWhy ?? '').slice(0, 300), url }, 502);
        }
        if (lastStatus !== undefined) return json({ error: 'upstream_error', status: lastStatus }, 502);
        // Nothing was decided, and the app knows what to do: nothing is written, the update waits.
        return json({ error: 'upstream_unreachable' }, 502);
      }
      upstream = winner;
    }

    /*
     * NOTE: there is no `!upstream.ok` branch here, and that is not an omission. Only a response
     * with usable headers can win the hedge above, so by the time we reach this line the status is
     * good by construction. Everything that used to live here — the never-relay-Google's-body rule
     * and the one narrow 404 exception — moved INTO the launch handler, which is the only place
     * that now sees a failing attempt.
     */
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
    const deadline = Date.now() + OVERALL_MS;
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
  },
};
