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

// 

import type { CoachRequest } from '@/domain/coachPrompt';
import { identitySessionToken } from '@/platform/circleClient';
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
  | 'empty'
  /**
   * ⛔ THE ANSWER STOPPED HALFWAY — MEASURED AT ONE CALL IN FIVE (2026-08-30).
   *
   * The Worker reads `finishReason` off the SSE stream and has passed it through since it was
   * written. **Nothing on either side ever looked at it.** So a stream that died mid-sentence came
   * back as `{ ok: true }` carrying half a JSON document, and every caller blamed the model for it:
   * the plan build fell through to the local assembler, and the import told her the photograph of
   * her programme could not be read.
   *
   * Measured on the production Worker over 80 real calls: **16 of them stopped early**, at 11 to
   * 552 characters, after 2.6–5.5 seconds. `finishReason` is a perfect discriminator — `"STOP"` on
   * every answer that parsed, and `null` on every single one that did not. Prompt length made no
   * difference (the rate was the same across five variants from 468 characters down to 135), so
   * this was never a prompt problem; it is the stream ending without saying so.
   *
   * ⚠️ IT IS ITS OWN REASON, NOT `upstream`, for the same argument `rate_limited` makes: this one is
   * TRANSIENT and worth trying again, where a 500 is not. `planBuild` retries once on it, and the
   * difference between a silent downgrade and a second six-second call is her actual programme.
   */
  | 'truncated';

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
/*
 * Must stay ABOVE the Worker's own ceiling (170 s), or the app hangs up on a call that is still
 * coming back and reports `timed_out` for an answer that arrived. Measured 2026-08-02: the
 * post-session call — the heaviest one we make — was being aborted at ninety seconds.
 */
const TIMEOUT_MS = 180_000;

/**
 * The reply's JSON, whichever way the Worker sent it.
 *
 * A build that declared a wait is answered as an event stream (see `beat` in `askCoach`): comment
 * lines while the model thinks, then ONE `data:` line that is exactly the JSON a plain reply
 * holds. Everything else — and every Worker that predates the heartbeat — answers with that JSON
 * as the whole body, and is read as it always was.
 *
 * ⚠️ THE LAST `data:` LINE, AND ONLY A WHOLE ONE. A line cut before its end is a stream that died,
 * and it throws like any unreadable body — never half an answer handed on as an answer.
 */
export async function readReply(response: Response): Promise<unknown> {
  const type = response.headers?.get?.('content-type') ?? '';
  if (!type.includes('text/event-stream')) return response.json();
  const raw = await response.text();
  const data = raw.split('\n').filter((line) => line.startsWith('data: '));
  if (data.length === 0) throw new Error('no data event');
  return JSON.parse(data[data.length - 1].slice(6));
}

/**
 * Ask the coach.
 *
 * `schema` is `COACH_PLAN_SCHEMA` when a programme is wanted and absent when prose is — a chat
 * answer locked to a plan schema would come back as JSON nobody reads.
 */
export async function askCoach(
  request: CoachRequest,
  schema?: Record<string, unknown>,
  /**
   * ════ A TURN THAT TALKS AND A TURN THAT BUILDS ARE NOT THE SAME CALL ════
   *
   * ⚠️ FOUNDER, ON THE DEVICE, 2026-08-02: *"it takes him a huge amount of time to answer, and if he
   * doesn't answer it just says Not sent."* Measured on a real three-turn intake, at the default
   * thinking level: **14.8s, 20.8s, and 99.5s** — with a 125s failure in the middle of it. She is
   * sitting there watching a typing indicator for that.
   *
   * The two calls want opposite things, and we had been paying the programme's price for both:
   *
   *   asking her a question   thinking buys NOTHING — it is one sentence about what she just said
   *   building her week       thinking buys EVERYTHING — `low` writes a one-exercise week
   *
   * So a conversational turn asks for `low` and comes back in a few seconds, and the programme is
   * built by a deliberate second call at full strength (see `useCoach`). It also moves the whole
   * conversation well clear of the Worker's 125s ceiling, which is what turns a slow answer into no
   * answer at all.
   */
  think?: 'minimal' | 'low' | 'medium' | 'high',
  /**
   * What she showed it, already resized and base64'd — see `coachImage`.
   *
   * The Worker enforces its own count and size limits, because the app is the part an attacker
   * controls. These arrive AFTER every block of text so the cacheable prefix stays byte-identical.
   */
  images?: { mime: string; data: string }[],
  /**
   * ════ WHICH OF THE COACH'S JOBS THIS IS (2026-09-09) ════
   *
   * The Worker requires a session for every call EXCEPT an intake (`build`, `import`): her week is
   * built before she has an account, so those two ride on the install's own small daily budget
   * instead. Everything else — a review, a chat — is refused without a bearer. Absent = `chat`.
   */
  kind: 'build' | 'import' | 'review' | 'chat' = 'chat',
  /**
   * How long the caller will wait for this answer, in ms (2026-09-27). The Worker gives the week to
   * its strongest model only when this leaves room for it and a fast model after it; absent, the
   * fast model answers alone. Only `requestPlanBuild` sends it.
   */
  wait?: number,
): Promise<CoachReply> {
  if (!coachIsReachable()) return { ok: false, reason: 'not_configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  /*
   * ════ THE SESSION RIDES ALONG — THE HEADER THAT MAKES THE LIMIT REAL ════
   *
   * The install id below is a rate-limit KEY an attacker can mint; the session token is one they
   * cannot — hush-identity issued it at sign-in and the Worker verifies it against the same KV.
   * Sign-in is a hard wall at onboarding, so every athlete has one; its absence here means the
   * Keychain read failed or the exchange never landed, and the Worker's REQUIRE_AUTH flag decides
   * whether that is still allowed to work. Sent conditionally so the legacy world stays byte-
   * identical: no header at all, not an empty one.
   */
  const session = await identitySessionToken().catch(() => null);

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
      headers: { 'content-type': 'application/json', 'x-hush-token': COACH_TOKEN, 'x-hush-install': await installId(), ...(session ? { 'authorization': `Bearer ${session}` } : {}) },
      body: JSON.stringify({
        blocks: request.blocks,
        ...(schema ? { schema } : {}),
        ...(think ? { think } : {}),
        ...(images?.length ? { images } : {}),
        kind,
        ...(wait && wait > 0 ? { wait: Math.round(wait) } : {}),
        /*
         * ⛔ "I CAN READ A HEARTBEAT" (2026-10-11) — sent with every build that declares a wait.
         * The Worker then answers on a line it keeps alive (`readReply` below), and only such a
         * build may wait past a minute — which is what lets the strong model finish: its answers
         * for an athlete who states her lifts take 41–61 s, and half of them were being cut at
         * the old 47 s deadline and written by the fast lane instead.
         *
         * ⚠️ WHAT THE BEAT IS FOR, MEASURED RATHER THAN ASSUMED (2026-10-12,
         * `native-tests/net-probe`, on iOS's own networking in the simulator). Apple's request
         * timeout is an IDLE timer, 60 s by default, reset whenever data arrives — and a request
         * left at that default WAS cut at 60.3 s on a silent line. React Native does not leave it
         * at the default: `RCTNetworking.mm` sends `timeoutInterval = 0`, and with that a line
         * silent for 76 s still arrived. So on this app's own settings the sixty seconds were
         * never the wall I first took them for; the beat is what makes the wait independent of
         * that setting (and of every router between her phone and the edge that drops an idle
         * connection). With a beat every 10 s, a 110 s answer arrived with no silence over 11 s.
         */
        ...(kind === 'build' && wait && wait > 0 ? { beat: true } : {}),
      }),
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

  let body: { text?: unknown; model?: unknown; usage?: unknown; finishReason?: unknown; http?: unknown };
  try {
    body = (await readReply(response)) as typeof body;
  } catch {
    return { ok: false, reason: 'upstream' };
  }
  /*
   * On a kept-alive line the status was spent on the first heartbeat, so a failure inside the model
   * stage rides in the body as `http` — the status the plain reply would have carried. It is read
   * here exactly as a status is read above.
   */
  if (typeof body.http === 'number' && body.http !== 200) {
    if (body.http === 401) return { ok: false, reason: 'refused' };
    if (body.http === 429) return { ok: false, reason: 'rate_limited' };
    return { ok: false, reason: 'upstream' };
  }

  const text = typeof body.text === 'string' ? body.text : '';
  // An empty 200 is not an answer. Handing "" to the parse would count as an unreadable PLAN and
  // blame the model for something that happened in the pipe.
  if (text.length === 0) return { ok: false, reason: 'empty' };

  /*
   * ⛔ AND NEITHER IS HALF AN ANSWER — see `truncated` on the enum for the measurement.
   *
   * `STOP` is the model saying it finished. Anything else, including the `null` a died stream
   * leaves behind, means the text in hand is a fragment: it will fail to parse, and the caller will
   * report that as the MODEL's failure rather than the pipe's.
   *
   * ⚠️ A MISSING `finishReason` COUNTS AS TRUNCATED, which is the whole point — that is exactly the
   * shape of every one of the sixteen truncations measured, and treating "absent" as "fine" is how
   * this went unnoticed for as long as the field has existed.
   */
  if (body.finishReason !== 'STOP') return { ok: false, reason: 'truncated' };

  return {
    ok: true,
    text,
    model: typeof body.model === 'string' ? body.model : 'unknown',
    usage: (body.usage as Record<string, number> | null) ?? null,
  };
}
