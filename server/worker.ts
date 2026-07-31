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
 * Chosen from the model list this key actually returns, not from a price page. The first attempt
 * used `gemini-2.5-flash-lite` — which IS in the list and still answered `generateContent` with a
 * 404, so the id was never the whole story. `gemini-3.5-flash-lite` is two generations newer and
 * the current cheap tier.
 *
 * ⚠️ Its price has not been checked. Verify before this carries real volume; it is one line and a
 * deploy to change.
 */
const MODEL = 'gemini-3.5-flash-lite';
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
    if (request.method === 'GET' && new URL(request.url).pathname !== '/models') return json({ ok: true });

    /*
     * TEMPORARY — REMOVE WITH THE 401 DIAGNOSTIC.
     *
     * `GET /models`, behind the same token. A wrong model id comes back from Google as a bare 404
     * that names nothing, and the published marketing name is not always the API id. Asking the key
     * itself which models it can reach is the only authoritative answer, and it beats guessing
     * through deploys. Model names are not secret; the token still gates the route so it is not a
     * free directory for anyone who finds the host.
     */
    if (request.method === 'GET') {
      const sent = (request.headers.get('x-hush-token') ?? '').trim();
      if (!sameSecret(sent, (env.HUSH_TOKEN ?? '').trim())) return json({ error: 'unauthorized' }, 401);
      const list = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
        headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
      });
      if (!list.ok) return json({ error: 'list_failed', status: list.status }, 502);
      const data = (await list.json()) as {
        models?: { name?: string; supportedGenerationMethods?: string[] }[];
      };
      return json({
        // Only the ones that can actually answer a generateContent call — the list also carries
        // embedding and tuning endpoints, which are not what we are looking for.
        models: (data.models ?? [])
          .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m) => m.name)
          .filter(Boolean),
      });
    }
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
    if (!sameSecret(sent, stored)) {
      /*
       * TEMPORARY — REMOVE ONCE THE FIRST CALL SUCCEEDS.
       *
       * A bare 401 cannot tell "no header arrived" from "two different values" from "the same value
       * with a stray character", and guessing between them cost an hour. These are LENGTHS and a
       * single equality bit — no character of either secret is returned, and a length tells an
       * attacker nothing they could not learn by counting their own failed attempts.
       */
      return json({
        error: 'unauthorized',
        diag: {
          sentLength: sent.length,
          storedLength: stored.length,
          sameLength: sent.length === stored.length,
          headerArrived: request.headers.get('x-hush-token') !== null,
        },
      }, 401);
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
