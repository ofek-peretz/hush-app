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
}

/**
 * The model, and the ceiling on what one call may cost.
 *
 * Named here rather than taken from the request on purpose — see the header. Changing the model is
 * an edit and a deploy, which is exactly the friction it should have.
 */
/*
 * `gemini-3.5-flash`, and the price that chose it.
 *
 * Google's own price page serves this table with two currencies mixed into one row set — some
 * figures in USD, some in shekels — so it was decoded before anything was decided. Where the page
 * says `ש"ח` the number is USD x 4; two independent rows confirm it (2.5-flash reads "10.00 ש"ח"
 * against a real $2.50, 2.5-flash-lite reads "1.6 ש"ח" against a real $0.40). Real prices per
 * million tokens, and what one athlete costs for a year of 156 sessions:
 *
 *     2.5-flash-lite     $0.10 / $0.40      $0.15/yr
 *     3.1-flash-lite     $0.25 / $1.50      $0.48/yr
 *     3.5-flash-lite     $0.30 / $2.50      $0.71/yr
 *     3.5-flash          $1.50 / $9.00      $2.89/yr      <- this one
 *     3.1-pro-preview    $2.00 / $12.00     $3.85/yr
 *
 * Against $99.99 a year that is 2.9%, and the gap between the cheapest and this is $2.74 a year per
 * athlete. The ruling already on the record is that the post-session call is not where you save:
 * it is the only decision the product sells. So the smartest GA model, not the cheapest.
 *
 * Not Pro, even though it is affordable: `preview` means Google may retire it and its rate limits
 * are stricter, and this product has no second decider to fall back on when the model disappears.
 *
 * ⚠️ THINKING TOKENS ARE BILLED AS OUTPUT on the 3.x family, and 3.x thinks by default. The $2.89
 * assumes ~1,200 output tokens; heavy thinking could multiply it. Not guessed at here — `usage`
 * comes back with `thoughtsTokenCount` on every call, so the real figure is a measurement away.
 * MAX_OUTPUT_TOKENS is the ceiling on the damage meanwhile: 8192 tokens is $0.074, worst case.
 */
const MODEL = 'gemini-3.5-flash';
const MAX_OUTPUT_TOKENS = 8192;
/** Google's own upper bound on how long we will wait before calling it a failed call. */
const TIMEOUT_MS = 90_000;

/** What the app sends. Mirrors `domain/coachPrompt.CoachRequest`, plus the schema to lock onto. */
interface CoachCall {
  blocks: { text: string; cache?: true }[];
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

/** One JSON reply, with the headers the app needs to read it from a phone. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // The app is not a browser origin, but the gallery is — and being able to drive this from a
      // desktop browser is how it gets looked at before it ships.
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, x-hush-token',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
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
    if (request.method === 'OPTIONS') return json({}, 204);

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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
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
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // A timeout or a dropped connection is not a decision that arrived. The app already knows
      // what to do with that: nothing is written, and the update waits.
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
      return json({ error: 'upstream_error', status: upstream.status }, 502);
    }

    const data = (await upstream.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: Record<string, number>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

    return json({
      text,
      finishReason: data.candidates?.[0]?.finishReason ?? null,
      // Passed through so the app can count what a call actually cost, per model, on real data —
      // the only honest way to compare a cheap model with an expensive one.
      usage: data.usageMetadata ?? null,
      model: MODEL,
    });
  },
};
