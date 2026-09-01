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
  /**
   * ════ REAL AUTHENTICATION, BORROWED FROM THE WORKER THAT ALREADY HAS IT ════
   *
   * The same KV namespace `hush-identity` writes its sessions into (`session:<token>` → Apple
   * `sub`, TTL 90 d). Sign-in is a hard wall at onboarding, so every real athlete holds one of
   * these tokens in her Keychain — which means the coach can finally tell an athlete from a script
   * by asking a question the script cannot answer. This worker only ever READS sessions; renewal
   * stays hush-identity's job, one writer per key family.
   *
   * Optional at runtime for the same reason COACH_LIMIT is: a deploy without the binding still
   * works, it is simply back to the speed-bump world it lived in before.
   */
  HUSH_KV?: {
    get(key: string, opts?: { cacheTtl?: number }): Promise<string | null>;
    put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  };
  /**
   * '1' → a call with no valid session is refused outright. Ships as '0' so every build already in
   * the field (none of them send a bearer) keeps its coach; the founder flips it once the first
   * bearer-sending build is the fleet. The flag is the migration, not a setting.
   */
  REQUIRE_AUTH?: string;
  /** Per-account calls per UTC day. Default 40 — a real athlete's heaviest day is under ten. */
  DAILY_ACCOUNT_CALLS?: string;
  /**
   * All accounts together, per UTC day — the kill switch that bounds the worst possible bill no
   * matter what else fails. Default 2000; with hedging at 3 upstream launches per call and
   * MAX_OUTPUT_TOKENS pricing, that is a ceiling the founder chose instead of one Google chose.
   */
  DAILY_GLOBAL_CALLS?: string;
}

/**
 * The model, and the ceiling on what one call may cost.
 *
 * Named here rather than taken from the request on purpose — see the header. Changing the model is
 * an edit and a deploy, which is exactly the friction it should have.
 */
/*
 * The model, and the three readings it took to get here (3.5 → 3.6 → 3.7).
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
/*
 * ── ⚠️ 3.7 FLASH IS OUT, AND THE CASE FOR IT IS SPEED RATHER THAN MONEY (2026-08-30) ────────────
 *
 * Founder: *"יצא gemini flash 3.7 אולי זה יותר זול ועדיף ממה שיש לנו כעת."* Cheaper, no — the two
 * are priced IDENTICALLY: $0.75 / $3.75 per million on the introductory rate that runs to the end
 * of 2026, and $1.50 / $7.50 for both from 1 January 2027. The "50% price cut" in the coverage is
 * 3.7's introductory discount against its OWN standard rate, which is the same arrangement 3.6 is
 * already on. Switching saves nothing.
 *
 * Better, probably, and on the axis this product actually spends: Artificial Analysis measures
 * 3.7 at **329.7 output tokens/sec against 3.6's 173.1**, and time-to-first-token at **9.13s
 * against 18.03s** — roughly twice as fast on both, at the same price.
 *
 * ⚠️ THOSE ARE `high`-REASONING BENCHMARKS AND OURS IS A `low` CALL, so do not read the absolutes:
 * our whole build already completes in 5–8 seconds, well inside 3.6's benchmarked 18-second TTFT.
 * The RATIO is the signal, and it points at the one thing the plan-build screen is designed around
 * — the wait she watches.
 *
 * It also clears the bar that kept us off Pro: `gemini-3.7-flash` is GENERALLY AVAILABLE, not a
 * `preview` id, so it is not a model Google may retire under a product with no second decider.
 * Same tunable thinking levels, so `think: 'low'` carries over unchanged; 64k max output, so
 * `MAX_OUTPUT_TOKENS` is untouched.
 *
 * ⛔ SWITCHED ON THE FOUNDER'S INSTRUCTION, 2026-08-30: *"תחליף את gemini ל 3.7."* — and switched
 * back the same day on the measurement below, which is the whole reason the instruction was worth
 * carrying out rather than debating.
 *
 * ⛔ AND THE COMPARISON WAS RUN, AND **3.7 LOST** — REVERTED THE SAME DAY (2026-08-30).
 *
 * Both arms deployed for real, same Worker code, same sixteen plan builds, minutes apart:
 *
 *     3.7 ── 10/16 usable · 6 TRUNCATED · median 9.8s · five calls hit the 45s ceiling
 *     3.6 ── 16/16 usable · 0 truncated · median 5.0s · slowest 7.0s
 *
 * Confirmed on a second run of sixteen REAL athlete sentences: 16/16, median 4.2s, slowest 12.3s,
 * nothing over thirteen seconds. **Thirty-two consecutive builds without a failure.**
 *
 * ⚠️ AND EVERY WORD OF THE ARGUMENT ABOVE FOR 3.7 IS STILL TRUE — generally available, same
 * thinking levels, better published ratios. It was a good argument. On this call, with this schema
 * at `think: 'low'`, it is beaten by the older model on the only two numbers that reach an athlete:
 * whether an answer arrives, and when. Published benchmarks are not a measurement OF OUR CALL.
 *
 * ⛔ SO THE FOUNDER'S INSTRUCTION IS RECORDED AS CARRIED OUT AND MEASURED, NOT AS DECLINED. He
 * asked for the switch on a cost-and-quality hunch — *"אולי זה יותר זול ועדיף ממה שיש לנו כעת"* —
 * which is a hypothesis, and it was tested rather than argued with. Anyone tempted to try 3.7
 * again: run the sixteen-call probe first, and expect truncation to be the thing that breaks.
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

/**
 * The same ceiling, for text — because until 2026-09-01 there was NONE. `blocks` was checked for
 * being a non-empty array and nothing else, so a hostile client could post megabytes of text and
 * bill it at Gemini input rates, times three once hedging launched its extra calls.
 *
 * The real app's heaviest request — preamble + athlete file + a season of history — measures in
 * the tens of thousands of characters. These are the hostile-client ceilings, not the expectation,
 * exactly like MAX_IMAGE_BYTES one comment up: generous to every request the app can make, a wall
 * to the one it never would.
 */
const MAX_BLOCKS = 32;
const MAX_TEXT_CHARS = 240_000;
/** Everything together, pre-parse: all four images at ceiling, all the text, and JSON overhead. */
const MAX_BODY_BYTES = 8_000_000;

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
  'access-control-allow-headers': 'content-type, x-hush-token, x-hush-install, authorization',
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
     * ════ WHO IS ASKING — THE QUESTION A SCRIPT CANNOT ANSWER ════
     *
     * The bearer is the hush-identity session token from her Keychain. Looked up in the shared KV
     * (`session:<token>` → Apple sub) with a 60 s edge cache so the read costs a KV round trip once
     * a minute per athlete, not once per call. An invalid or absent bearer is not an error by
     * itself — REQUIRE_AUTH decides below whether the legacy speed-bump world is still open.
     *
     * The 401 here is deliberately the SAME 401 as a bad shared token: an attacker probing which
     * half of the gate refused them learns nothing.
     */
    let sub: string | null = null;
    if (env.HUSH_KV) {
      const auth = (request.headers.get('authorization') ?? '').trim();
      const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (bearer.length > 0) {
        sub = await env.HUSH_KV.get(`session:${bearer}`, { cacheTtl: 60 }).catch(() => null);
      }
    }
    if (env.REQUIRE_AUTH === '1' && !sub) return json({ error: 'unauthorized' }, 401);

    /*
     * A body too large to be honest is refused before it is read. Content-length can be absent on a
     * chunked request — the per-field ceilings after the parse catch that path; this one exists so
     * a hundred-megabyte body is never even buffered.
     */
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);

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
      // The session outranks the install as a key: an install id is minted by whoever sends it,
      // a session was minted by us. Only the legacy (pre-bearer) world still keys on the install.
      const key = sub ? `s:${sub}`
        : install.length > 0 ? `i:${install}`
        : `ip:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`;
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
    // The text ceilings — see MAX_BLOCKS for why an unbounded body was the worker's biggest hole.
    if (call.blocks.length > MAX_BLOCKS) return json({ error: 'too_large' }, 413);
    let textChars = 0;
    for (const b of call.blocks) textChars += String(b?.text ?? '').length;
    if (textChars > MAX_TEXT_CHARS) return json({ error: 'too_large' }, 413);

    /*
     * ════ THE DAY'S BUDGET — COUNTED AFTER VALIDATION, SPENT BEFORE THE MODEL ════
     *
     * Two approximate counters in KV, reset by the UTC date in their key and erased by TTL:
     *
     *   quota:c:<sub>:<day>   what one account may spend in a day. A real athlete's heaviest
     *                         honest day — intake, a build, a retry, a review — is under ten calls;
     *                         the default of 40 is invisible to her and a wall to her shortcut.
     *   quota:g:<day>         what EVERYONE together may spend — the kill switch. Every other layer
     *                         here can be wrong at once and the worst possible day still costs what
     *                         this number says, times the hedge factor of 3.
     *
     * KV counters race: two concurrent calls can both read n and both write n+1. That undercount is
     * bounded by the per-key rate limit above (30/60 s), and a budget that can be exceeded by a few
     * concurrent calls is a budget; the alternative — a Durable Object serializing every coach call
     * on one object — is a global bottleneck bought to make a ceiling exact that only needs to be
     * real. Counted after validation so a malformed loop cannot starve honest athletes for free.
     */
    if (env.HUSH_KV) {
      const day = new Date().toISOString().slice(0, 10);
      const spend = async (key: string, ceiling: number): Promise<boolean> => {
        const n = Number((await env.HUSH_KV!.get(key).catch(() => null)) ?? '0');
        if (n >= ceiling) return false;
        await env.HUSH_KV!.put(key, String(n + 1), { expirationTtl: 172_800 }).catch(() => {});
        return true;
      };
      /*
       * ⚠️ NOT `Number(x) || default` — zero is falsy, and the first test ever written against this
       * worker proved the kill switch could not be set to KILL: an explicit '0' fell through to
       * 2000 and the call went upstream. An operator who writes 0 means 0.
       */
      const ceiling = (raw: string | undefined, fallback: number) => {
        const n = Number(raw);
        return raw != null && raw !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
      };
      const globalCeiling = ceiling(env.DAILY_GLOBAL_CALLS, 2000);
      if (!(await spend(`quota:g:${day}`, globalCeiling))) {
        // 503, not 429: the day's budget being gone is our weather, not her behaviour.
        return json({ error: 'budget' }, 503);
      }
      if (sub) {
        const accountCeiling = ceiling(env.DAILY_ACCOUNT_CALLS, 40);
        if (!(await spend(`quota:c:${sub}:${day}`, accountCeiling))) {
          return json({ error: 'rate_limited' }, 429);
        }
      }
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
    /*
     * ⛔ RESIZED FOR COMPLETION, NOT HEADERS (2026-08-30) — see the race below for why the meaning
     * of this number changed under it.
     *
     * ⚠️ 1,800 ms WOULD NOW BE A DISASTER. It was measured against the moment headers come back,
     * which is sub-second for everything; against the moment an ANSWER is finished it is under the
     * fastest call this Worker has ever served, so every single request would spawn all three
     * attempts. The same constant, unchanged, would have tripled the bill silently.
     *
     * The two call shapes finish on completely different clocks, so they get different numbers:
     *
     *   · A CHAT TURN completes in about 1.8s (twelve measured: 1.4 · 1.5 · 1.5 · 1.5 · 1.6 · 1.6
     *     · 1.7 · 1.8 · 2.4 · 7.0 · 8.5 · 41.6). 3s is just past the healthy band.
     *   · A PLAN BUILD has a median of 8.4s (sixteen measured, listed at the race). 9s sits just
     *     past it, so the ordinary build never spawns a second call and the tail — 11.6, 13.1,
     *     16.4, 19.1, 21.5 — gets a fresh attempt running beside it with time left to win.
     *
     * `schema` is the discriminator because it is the honest one: a structured call IS the build,
     * and a flag would be a second opinion about the same fact.
     */
    const BUILD_HEDGE_MS = 9_000;
    const CHAT_HEDGE_MS = 3_000;
    const HEDGE_MS = conversational ? (call.schema ? BUILD_HEDGE_MS : CHAT_HEDGE_MS) : 20_000;
    const OVERALL_MS = conversational ? 45_000 : 110_000;
    const MAX_IN_FLIGHT = 3;

    /*
     * ════════════════════════════════════════════════════════════════════════════════════════════
     * ⛔ THE RACE IS ON A FINISHED ANSWER, NOT ON HEADERS (2026-08-30).
     *
     * ⚠️ MEASURED ON THIS WORKER, 16 consecutive plan builds, one attempt each:
     *
     *     4.6  4.7✗  5.1  6.1  6.3  6.4✗  7.3  8.2  8.4  8.8  11.6  13.1  16.4  19.1  21.5  3.4✗
     *
     * Three came back TRUNCATED — `finishReason` null, at 4, 465 and 1,124 characters — and four of
     * the thirteen healthy ones arrived after the intake could still use them. Nine in sixteen.
     *
     * ── WHY THE HEDGE COULD NOT SAVE ANY OF THEM ────────────────────────────────────────────────
     * It raced `res.ok` — HEADERS. Headers come back fast from every attempt, healthy or not, so
     * the first one always won within a few hundred milliseconds and every sibling was aborted on
     * the spot. **From that moment there was no recourse.** If the winner's stream then died
     * mid-document, or ground on for twenty-one seconds, the hedge had already thrown away the
     * calls that could have covered for it. It was racing the one part of a streaming call that
     * never varies, and standing down before the part that does.
     *
     * A response with good headers is not an answer. `finishReason === 'STOP'` is an answer. So the
     * attempt now OWNS its whole life — fetch, then read the stream to the end — and the race is
     * decided on the first attempt that comes back complete. Both failures fall out of the same
     * change: a dead stream loses to its sibling, and so does a slow one.
     *
     * ⚠️ AND `HEDGE_MS` HAD TO MOVE WITH IT. 1.8s was tuned against headers; against COMPLETION it
     * would spawn three calls for every build on earth. It is sized from the measurement above:
     * just past the median, so the ordinary call never spawns a second, and the tail gets its
     * replacement while she is still watching the muscles light.
     * ════════════════════════════════════════════════════════════════════════════════════════════
     */
    type Answer = { text: string; finishReason: string | null; usage: Record<string, number> | null };
    type Chunk = {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: Record<string, number>;
    };

    /*
     * READING THE STREAM.
     *
     * Server-sent events: `data: {…}` lines, one GenerateContentResponse each. The text arrives in
     * pieces and is joined; `finishReason` and `usageMetadata` turn up on the last chunks and simply
     * overwrite, so what we answer with is the final word on both.
     *
     * `AbortSignal.timeout` covers the headers, not the body — a stream that stalled mid-way would
     * hang here for ever without the deadline, which is the one failure mode streaming introduces
     * that a plain request could not have.
     */
    const readStream = async (res: Response, deadline: number): Promise<Answer> => {
      const reader = res.body?.getReader();
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
      return { text, finishReason, usage };
    };

    const stopAt = Date.now() + OVERALL_MS;
    const controllers: AbortController[] = [];
    /*
     * ⚠️ HELD ON AN OBJECT, NOT IN TWO `let`s, AND THE COMPILER IS THE REASON.
     *
     * Both are written from inside an async callback, which TypeScript's flow analysis does not
     * follow — so a bare `let winner: Answer | null = null` is still narrowed to `null` at the
     * bottom of this function, `winner ?? salvage` becomes `never`, and reading `.text` off it is
     * an error. Narrowing on a property is invalidated by any intervening call, which is exactly
     * the truth here: something else may well have assigned it.
     */
    const race: {
      /** The first attempt that came back COMPLETE. Nothing else ends the race. */
      winner: Answer | null;
      salvage: Answer | null;
    } = { winner: null, salvage: null };
    /*
     * ⚠️ `race.salvage` IS THE BEST INCOMPLETE ANSWER, KEPT AS A LAST RESORT — never as a result.
     *
     * A truncated reply is still information: the app reads `finishReason`, counts it, and retries
     * or falls back deliberately. Throwing it away to report `upstream_unreachable` would tell the
     * app the network failed when in fact the model answered and stopped short, which are different
     * problems with different fixes. The race simply refuses to be WON by one.
     */
    let lastStatus: number | undefined;
    let lastWhy: string | undefined;
    let settled = 0;
    let resolveWin!: () => void;
    const won = new Promise<void>((r) => (resolveWin = r));
    /*
     * ⛔ A ONE-SHOT PROMISE IS NOT A REPEATABLE SIGNAL — AND THIS COST A BAD DEPLOY (2026-08-30).
     *
     * This was `const exhausted = new Promise(r => allDone = r)`, raced once per round. A promise
     * stays resolved: the moment the FIRST attempt settled, every later round's `Promise.race`
     * returned instantly, so the loop stopped waiting and fired all three attempts within
     * milliseconds of each other. Three identical calls at once, and the measurement said so —
     * **eleven of sixteen truncated**, against three before the change, with repeated 45-second
     * exhaustions where the old code had none.
     *
     * ⚠️ IT WAS LATENT IN THE OLD CODE TOO. Racing HEADERS meant round one almost always won, so
     * this path was never reached. Moving the race to completion is what walked into it — a bug I
     * did not write so much as uncover, which is the kind that ships.
     *
     * So the signal is re-armed per round, and `idle()` is asked as a QUESTION rather than
     * remembered as an event.
     */
    /** Nothing is in flight: every attempt launched so far has finished, none of them usably. */
    const idle = () => settled >= controllers.length;
    /** Resolves the next time that becomes true. Re-armed each round; a missed edge only costs a wait. */
    let wake: (() => void) | null = null;
    const nextIdle = () => new Promise<void>((r) => (wake = r));
    const allDone = () => {
      const w = wake;
      wake = null;
      w?.();
    };

    const launch = () => {
      const controller = new AbortController();
      controllers.push(controller);
      void (async (): Promise<void> => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            // The key rides in a header, never in the URL — a URL ends up in logs and referrers.
            'x-goog-api-key': env.GEMINI_API_KEY,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          // A non-ok status is a real answer about our request and every attempt will get the same
          // one — so it is remembered, not raced.
          lastStatus = res.status;
          /*
           * ⚠️ THE BODY GOES TO THE TAIL, NEVER TO THE CALLER. An upstream 400 commonly quotes the
           * offending request back, and the request is an athlete's record — relaying it would put
           * her training history into whatever log the app's error path happens to write to.
           * `npx wrangler tail` is the owner's own console.
           */
          const detail = await res.text();
          console.log(`gemini ${res.status} :: ${detail.slice(0, 800)}`);
          /*
           * ONE NARROW EXCEPTION, AND ONLY FOR 404 — a 404 is the one status whose message is about
           * the URL rather than the payload ("models/X is not found for API version v1beta"), so it
           * names our own configuration and nothing of hers. It turns a deploy-per-guess into a
           * single answer, and it cost an hour to learn that the fix is usually to WAIT: Google
           * enables the read path and the billed path on different clocks, so a fresh key 404s on
           * `:generateContent` while `GET /models` already works.
           */
          if (res.status === 404) {
            try {
              lastWhy = String((JSON.parse(detail) as { error?: { message?: string } })?.error?.message ?? '');
            } catch {
              lastWhy = '';
            }
          }
          return;
        }
        const answer = await readStream(res, stopAt);
        if (answer.finishReason === 'STOP') {
          if (!race.winner) {
            race.winner = answer;
            resolveWin();
          }
          return;
        }
        // Short, or stopped for a reason of its own. It does not win; it waits in case nothing does.
        if (!race.salvage || answer.text.length > race.salvage.text.length) race.salvage = answer;
      })()
        .catch(() => {
          /* aborted, stalled, or the connection died. Nothing to say; another attempt may land. */
        })
        .finally(() => {
          /*
           * ⛔ EVERYTHING IN FLIGHT HAS FAILED — DO NOT SIT OUT THE HEDGE TIMER.
           *
           * ⚠️ Found in the live battery, 2026-08-02: a build came back 503 and the athlete got
           * nothing. The hedge is timed for a call that is STILL RUNNING — waiting before asking
           * again makes sense when the first attempt might yet answer. A 503 already answered: it
           * said no. Waiting is then pure delay, and three of them in a row is the difference
           * between a slow programme and no programme.
           */
          settled += 1;
          if (idle()) allDone();
        });
    };

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    launch();
    for (let n = 1; n <= MAX_IN_FLIGHT && !race.winner; n += 1) {
      const remaining = stopAt - Date.now();
      if (remaining <= 0) break;
      const waitFor = n < MAX_IN_FLIGHT ? Math.min(HEDGE_MS, remaining) : remaining;
      /* ⚠️ ASKED, NOT REMEMBERED. If everything has already finished there is nothing to wait for
         — and waiting on a stale resolved promise is what fired three calls at once. */
      if (!idle()) {
        await Promise.race([
          won,
          // Nothing is in flight any more and none of it was usable — go again NOW rather than
          // waiting out a hedge that was timed for a call still running.
          nextIdle(),
          sleep(waitFor),
        ]);
      }
      if (!race.winner && n < MAX_IN_FLIGHT) {
        // A failure that came back FAST deserves a breath before the next ask; a hedge does not,
        // because the first attempt is still going.
        if (settled >= controllers.length) await sleep(700);
        launch();
      }
    }
    /*
     * Whoever is still running is no longer wanted. Aborting them stops the bytes and the bill.
     *
     * ⚠️ AND THERE IS NO `keep` EXCEPTION ANY MORE, WHICH IS THE POINT: the winner's body was read
     * to the end inside its own attempt, so by the time we are here there is no stream left to
     * cancel. That exception existed only because the old race handed back an unread `Response`.
     */
    for (const c of controllers) c.abort();

    const answer = race.winner ?? race.salvage;
    if (!answer) {
      // Nothing usable from any attempt. If one of them was told something specific, relay THAT
      // rather than a generic unreachable — a 401 must not be reported as a bad connection.
      if (lastStatus === 404) {
        return json({ error: 'upstream_error', status: 404, why: (lastWhy ?? '').slice(0, 300), url }, 502);
      }
      if (lastStatus !== undefined) return json({ error: 'upstream_error', status: lastStatus }, 502);
      // Nothing was decided, and the app knows what to do: nothing is written, the update waits.
      return json({ error: 'upstream_unreachable' }, 502);
    }

    return json({
      text: answer.text,
      finishReason: answer.finishReason,
      // Passed through so the app can count what a call actually cost, per model, on real data —
      // the only honest way to compare a cheap model with an expensive one.
      usage: answer.usage,
      model: MODEL,
    });
  },
};
