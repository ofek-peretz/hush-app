/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * COACH CLIENT — the app's only door to the coach.
 *
 * It posts a `CoachRequest` to the Worker and hands back the text. That is the whole job. It knows
 * nothing about Gemini — not the model, not the URL, not the schema dialect. All of that lives in
 * `server/worker.ts`, which is why changing provider is one file and a deploy.
 *
 * ── EVERY FAILURE IS THE SAME FAILURE ───────────────────────────────────────────────────────────
 * No key, no network, a timeout, a 500, a body that will not parse — all of them mean one thing to
 * this app, and it is a rule the founder already ruled on:
 *
 *   > **No connection → nothing is decided. The app says so, and the update waits.**
 *
 * So there is no error taxonomy for the caller to branch on. There is a reason, for counting, and
 * a single boolean for deciding. A client that returned five kinds of failure would invite five
 * kinds of handling, and four of them would be wrong.
 *
 * ── WHAT NEVER HAPPENS HERE ─────────────────────────────────────────────────────────────────────
 * · It never retries by itself. A post-session call that quietly retries three times is three
 *   bills for one workout, and the athlete is not waiting on it — she has finished and left.
 * · It never falls back to a local decision. That is the ruling: there is no second decider, and a
 *   deterministic floor would reintroduce the exact thing it removed.
 * · It never logs the request. The request is her training record.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { CoachRequest } from '@/domain/coachPrompt';
import { deviceContext } from '@/platform/deviceContext';

/**
 * Where the Worker lives, and the token it expects.
 *
 * Both are `EXPO_PUBLIC_*`, which means both are **embedded in the app bundle** — that is a
 * property of shipping a client, not a choice. The URL is not a secret. The token is a speed bump
 * that stops the scanners which find every new `*.workers.dev` hostname within days; anyone willing
 * to unpack the app can read it, and `server/worker.ts` says so in as many words.
 *
 * **The Gemini key is in neither.** It never leaves Cloudflare's secret store, which is the entire
 * reason the Worker exists.
 */
const COACH_URL = process.env.EXPO_PUBLIC_COACH_URL || '';
const COACH_TOKEN = process.env.EXPO_PUBLIC_COACH_TOKEN || '';

/**
 * The install id, read once and remembered.
 *
 * `deviceContext()` reads storage; doing that on every call would put a disk read in front of every
 * message she sends. It cannot change while the app is running.
 */
let installIdCache: string | null = null;
async function installId(): Promise<string> {
  if (installIdCache) return installIdCache;
  try {
    installIdCache = (await deviceContext()).device_id;
  } catch {
    // A device with no readable id is still allowed to train. The Worker falls back to the IP.
    installIdCache = '';
  }
  return installIdCache;
}

/** Both configured — otherwise the app is on its own and should not pretend otherwise. */
export function coachIsReachable(): boolean {
  return COACH_URL.length > 0 && COACH_TOKEN.length > 0;
}

/**
 * Why no answer arrived. An enum so it can be COUNTED — the same reason `UnreadableReason` is one.
 *
 * Between this and the parse's reasons there is a complete picture of where a call died, per model,
 * on real data. That count is the only honest way to compare a cheap model with an expensive one,
 * and it is measurement rather than enforcement: nothing here scores an answer, only records that
 * one did or did not arrive.
 */
export type CoachFailure =
  | 'not_configured'
  | 'offline'
  | 'timed_out'
  | 'refused'
  /**
   * Too many calls too quickly — the Worker's limit, keyed on this install.
   *
   * Kept apart from `upstream` because it is the one failure that is about US rather than the
   * weather, and the sentence she is owed is different: "in a moment", not "no connection". A real
   * athlete cannot reach it by hand; a loop reaches it at once.
   */
  | 'rate_limited'
  | 'upstream'
  | 'empty';

export type CoachReply =
  | {
      ok: true;
      text: string;
      /** Which model actually answered — stamped by the Worker, never chosen by the app. */
      model: string;
      /** Token counts as the provider reported them, for measuring what a call really cost. */
      usage: Record<string, number> | null;
    }
  | { ok: false; reason: CoachFailure };

/**
 * How long to wait before calling it a failed call.
 *
 * Generous, because thinking is slow and the alternative is a call that succeeded upstream, was
 * paid for, and got thrown away here. The Worker gives up at 90s; this waits a little longer so a
 * near-miss comes back as the Worker's own answer rather than as this timer firing first.
 */
const TIMEOUT_MS = 100_000;

/**
 * Ask the coach.
 *
 * `schema` is `COACH_PLAN_SCHEMA` when a programme is wanted and absent when prose is — a chat
 * answer locked to a plan schema would come back as JSON nobody reads.
 */
export async function askCoach(
  request: CoachRequest,
  schema?: Record<string, unknown>,
): Promise<CoachReply> {
  if (!coachIsReachable()) return { ok: false, reason: 'not_configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(COACH_URL, {
      method: 'POST',
      /*
       * THE INSTALL'S OWN ID RIDES ALONG, and it is the only thing that lets the Worker tell one
       * athlete from a script.
       *
       * The shared token ships in the app bundle — that is a property of shipping a client, not a
       * choice — so anyone who unpacks the app holds a working key to our Gemini spend. A limit
       * that can only see "somebody with the token" has to be set low enough to hurt real athletes.
       * Keyed on the install, the limit can be generous to her and still stop a loop.
       *
       * It is NOT an identity: it is the same non-crypto install id telemetry already uses, it
       * survives no reinstall, and it says nothing about who she is. It never leaves as anything
       * but a rate-limit key.
       */
      headers: { 'content-type': 'application/json', 'x-hush-token': COACH_TOKEN, 'x-hush-install': await installId() },
      body: JSON.stringify({ blocks: request.blocks, ...(schema ? { schema } : {}) }),
      signal: controller.signal,
    });
  } catch (e) {
    // A gym basement and a dead Worker are the same event from here. `AbortError` is separated only
    // because a timeout and a missing signal mean different things to whoever reads the count.
    return { ok: false, reason: (e as Error)?.name === 'AbortError' ? 'timed_out' : 'offline' };
  } finally {
    clearTimeout(timer);
  }

  // A 401 is OURS — a wrong or missing token, i.e. a build shipped misconfigured. Kept apart from a
  // generic upstream failure so it cannot hide inside the noise of ordinary outages.
  if (response.status === 401) return { ok: false, reason: 'refused' };
  // 429 is ours, not the weather — see `rate_limited`.
  if (response.status === 429) return { ok: false, reason: 'rate_limited' };
  if (!response.ok) return { ok: false, reason: 'upstream' };

  let body: { text?: unknown; model?: unknown; usage?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return { ok: false, reason: 'upstream' };
  }

  const text = typeof body.text === 'string' ? body.text : '';
  // An empty 200 is not an answer. Handing "" to the parse would count as an unreadable PLAN and
  // blame the model for something that happened in the pipe.
  if (text.length === 0) return { ok: false, reason: 'empty' };

  return {
    ok: true,
    text,
    model: typeof body.model === 'string' ? body.model : 'unknown',
    usage: (body.usage as Record<string, number> | null) ?? null,
  };
}
