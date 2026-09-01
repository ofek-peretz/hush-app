/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE IDENTITY WORKER — Sign in with Apple, verified; the circle, carried. (2026-08-24)
 *
 * Deploy target: Cloudflare Workers, as its OWN project (`hush-identity`), beside the coach worker
 * and deliberately not inside it — the coach spends money per call and holds an API key; this one
 * holds PEOPLE, and the two must be deployable, rate-limited and revocable separately.
 *
 *   npx wrangler init hush-identity   →  copy this file over src/index.ts
 *   add the KV + rate-limit bindings below to wrangler.toml
 *   npx wrangler kv namespace create HUSH_KV       (paste the id into wrangler.toml)
 *   npx wrangler deploy
 *   then:  eas env:create --name EXPO_PUBLIC_CIRCLE_URL --value https://<worker-url>
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────────────────────────
 * 1 · POST /auth/apple — the ONLY door in. The app sends Apple's identity token (a JWT Apple
 *     signed on the device's own sheet); this verifies it against Apple's published keys
 *     (iss/aud/exp/signature, WebCrypto RS256 — no dependency), and answers with a session token.
 *     No password exists anywhere; the account IS her Apple ID, server-side too.
 * 2 · THE CIRCLE — a handful of people who train together, by invite code. What crosses the wire
 *     is the ALLOW-LIST the app's `domain/circle` builds and NOTHING else: a first name, workouts
 *     done of planned this week, a timestamp. No loads, no history, no bodyweight, no body map —
 *     the same law `planShare` already keeps for links.
 * 3 · THE PAIR (2026-08-31) — TWO athletes on one bar, live, for the length of one workout.
 *     `/pair/open` and `/pair/join` mint a one-minute ticket; `/pair/room` upgrades it into a
 *     WebSocket inside `HushPairRoom`, one Durable Object per pair. The room is a RELAY: it
 *     validates a frame field-by-field and hands it to the other socket. See the class header for
 *     why it never touches `state.storage`, and `domain/sharedSession` for what a frame may hold.
 *
 * ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────────────────────────
 * · Trust a client-claimed identity. The Apple token is verified cryptographically, every time.
 * · Store anything the allow-list did not name. The week payload is rebuilt field-by-field here;
 *   unknown keys are dropped on the floor, whatever the client sent.
 * · Let a circle grow into a feed. MAX_MEMBERS is 6 — partners, not an audience.
 * · Pass upstream/internal error text to the caller.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface Env {
  /** KV namespace — users, sessions, circles, week states. */
  HUSH_KV: KVNamespace;
  /** Optional Cloudflare rate limiter (same shape as the coach's). Absent = unlimited. */
  ID_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
  /** One Durable Object per live pair — see `HushPairRoom`. */
  PAIR_ROOM: DurableObjectNamespace;
  /**
   * THE RESEARCH SINK'S FORWARD ADDRESS (2026-09-01) — where `/events` batches go, e.g. PostHog's
   * `/batch` endpoint. Both optional ON PURPOSE: a deploy without them keeps `/events` answering
   * 204 and dropping the batch, so an app that ships events is never broken by a worker that has
   * nowhere to put them. The analytics key lives HERE, in Cloudflare's secret store, and never in
   * the app bundle — the exact reason the coach worker exists.
   *   npx wrangler secret put EVENTS_URL   (e.g. https://eu.i.posthog.com/batch)
   *   npx wrangler secret put EVENTS_KEY   (the PostHog project api_key)
   */
  EVENTS_URL?: string;
  EVENTS_KEY?: string;
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE TWO PUBLIC DOORS — the only things this worker answers without a token. (2026-08-31)
 *
 * A pair invite goes out over WhatsApp, and until now it carried a `hush://` scheme link, which
 * does exactly nothing for the one person who most needs it to do something: somebody who has not
 * installed the app. A UNIVERSAL link fixes that, and needs two things served from this origin —
 * the association file Apple fetches, and a page for a browser that opens it anyway.
 *
 * ⚠️ BOTH ARE PUBLIC AND BOTH ARE STATIC. They read no KV, take no body, and echo nothing back
 * except a code that has been filtered down to the invite alphabet — see `safeCode`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const APPLE_TEAM_ID = 'T6ZRTBRT2U';
/** The App Store listing, for a phone with no app on it (`ascAppId`, `code/mobile/eas.json`). */
const APP_STORE_URL = 'https://apps.apple.com/app/id6780763348';

const APPLE_ISS = 'https://appleid.apple.com';
const APPLE_JWKS = 'https://appleid.apple.com/auth/keys';
/** The ONE app this worker answers — the token's `aud` must be this bundle id. */
const BUNDLE_ID = 'com.hushfitness.app';
const SESSION_TTL_S = 90 * 24 * 60 * 60; // sessions renew on use; a quiet quarter signs out
const WEEK_TTL_S = 14 * 24 * 60 * 60; // a stale member simply fades from the circle's week
const MAX_MEMBERS = 6;
/**
 * ⛔ A PAIR CODE OUTLIVES ONE WORKOUT AND NOTHING MORE. Four hours: long enough for the longest
 * session anyone trains, plus the walk to the gym and a phone that needed charging on the way.
 * Beyond that the code is gone, and a code that is gone cannot be walked into by a stranger who
 * screenshotted it last week.
 */
const PAIR_TTL_S = 4 * 60 * 60;
/** A room ticket is single-use and one minute old at most (see the `/pair/room` header). */
const TICKET_TTL_S = 60;
/** Unambiguous invite alphabet — no 0/O, no 1/I/L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

// ───────────────────────────── small utilities ─────────────────────────────

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const b64urlToBytes = (s: string): Uint8Array => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const randomToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * ⛔ A CODE FROM A QUERY STRING IS UNTRUSTED INPUT, AND IT IS ABOUT TO BE PUT IN AN HTML PAGE.
 *
 * Filtered down to the invite alphabet rather than escaped: there is exactly one shape a pair code
 * can have, so anything else is not a code that needs rendering safely — it is not a code. Nothing
 * that survives this can close a tag, open a script, or be anything but six letters and digits.
 */
const safeCode = (raw: string): string =>
  raw.toUpperCase().split('').filter((c) => CODE_ALPHABET.includes(c)).join('').slice(0, CODE_LENGTH);

const randomCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
};

/** What a room ticket carries. Minted by an authenticated POST, spent by the socket, then gone. */
interface TicketRec {
  code: string;
  sub: string;
  role: 'host' | 'guest';
}

/**
 * A single-use pass to one room, good for one minute.
 *
 * ⛔ THE ROLE IS DECIDED HERE, NOT CLAIMED BY THE CLIENT. Whoever opened the code is the host, and
 * the ticket says so; the room reads it off the ticket and ignores anything the socket asserts.
 * `domain/sharedSession.turnAtLift` gives the host every tie, so a phone that could name itself
 * host would be a phone that could take the bar whenever it liked.
 */
async function mintTicket(env: Env, code: string, sub: string, role: 'host' | 'guest'): Promise<string> {
  const ticket = randomToken();
  await env.HUSH_KV.put(`ticket:${ticket}`, JSON.stringify({ code, sub, role } satisfies TicketRec), {
    expirationTtl: TICKET_TTL_S,
  });
  return ticket;
}

// ───────────────────────────── Apple token verification ─────────────────────────────

/** Apple's signing keys, cached per isolate — they rotate rarely, and a cold fetch is ~50 ms. */
let jwksCache: { keys: JsonWebKey[]; at: number } | null = null;

async function appleKeys(): Promise<JsonWebKey[]> {
  if (jwksCache && Date.now() - jwksCache.at < 60 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(APPLE_JWKS);
  if (!res.ok) throw new Error('jwks_unreachable');
  const body = (await res.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  jwksCache = { keys: body.keys, at: Date.now() };
  return body.keys;
}

/**
 * Verify an Apple identity token: signature against Apple's JWKS, issuer, audience, expiry.
 * Returns the stable `sub` (her per-team Apple user id) — or null, never a reason (the caller
 * gets 401 either way; reasons are for logs, and even logs get no token contents).
 */
async function verifyAppleToken(idToken: string): Promise<string | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let header: { kid?: string; alg?: string };
  let payload: { iss?: string; aud?: string; exp?: number; sub?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;
  if (payload.iss !== APPLE_ISS) return null;
  if (payload.aud !== BUNDLE_ID) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  if (!payload.sub) return null;

  const keys = await appleKeys();
  const jwk = keys.find((k) => (k as { kid?: string }).kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  return ok ? payload.sub : null;
}

// ───────────────────────────── the allow-list, rebuilt server-side ─────────────────────────────

interface WeekState {
  name: string;
  done: number;
  planned: number;
  at: number;
}

/** Rebuild the week payload FIELD BY FIELD — anything the allow-list does not name is dropped,
 *  whatever the client sent. The same discipline `domain/circle` keeps on the way out. */
function readWeekState(raw: unknown): WeekState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.slice(0, 40) : '';
  const done = typeof r.done === 'number' && Number.isFinite(r.done) ? Math.max(0, Math.min(14, Math.round(r.done))) : null;
  const planned = typeof r.planned === 'number' && Number.isFinite(r.planned) ? Math.max(0, Math.min(14, Math.round(r.planned))) : null;
  if (!name || done == null || planned == null) return null;
  return { name, done, planned, at: Date.now() };
}

// ───────────────────────────── KV shapes ─────────────────────────────
//
//   session:<token>  → sub                       (TTL 90 d, renewed on use)
//   user:<sub>       → { circle?: string }
//   circle:<code>    → { members: string[] }
//   week:<code>:<sub>→ WeekState                 (TTL 14 d)

interface UserRec {
  circle?: string;
}
interface CircleRec {
  members: string[];
}

async function userOf(env: Env, sub: string): Promise<UserRec> {
  return ((await env.HUSH_KV.get(`user:${sub}`, 'json')) as UserRec | null) ?? {};
}

// ───────────────────────────── the worker ─────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    /*
     * ⛔ APPLE'S ASSOCIATION FILE — public, unauthenticated, and fetched by Apple's CDN rather than
     * by the phone. Without it a universal link is just a web page.
     *
     * `components` restricts the association to `/pair…` and nothing else: this origin is an
     * IDENTITY worker, and handing the app every path on it would mean an app that opens on
     * `/auth/apple`.
     */
    if (path === '/.well-known/apple-app-site-association') {
      return new Response(
        JSON.stringify({
          applinks: {
            details: [{ appIDs: [`${APPLE_TEAM_ID}.${BUNDLE_ID}`], components: [{ '/': '/pair*' }] }],
          },
        }),
        // ⚠️ `application/json`, and Apple is strict about it. The file has no extension by design.
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    /*
     * ⛔ AND THE PAGE A BROWSER LANDS ON WHEN THE LINK DID NOT OPEN AN APP.
     *
     * This is the whole answer to *"what happens if I send a pair invite to somebody with no
     * account?"* — until now, nothing at all. Two lines and two links: open it in the app if it is
     * there, install it if it is not, and the CODE printed large either way, because the code is
     * the half that keeps working when everything clever fails.
     *
     * No KV read, no session, no state. It is a signpost.
     */
    if (req.method === 'GET' && path === '/pair') {
      const code = safeCode(url.searchParams.get('c') ?? '');
      const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Train together</title>
<style>
 body{margin:0;background:#131210;color:#f1eee5;font:400 17px/1.5 -apple-system,system-ui,sans-serif;
      display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
 main{max-width:22rem;width:100%}
 h1{font:400 28px/1.2 Georgia,serif;margin:0 0 8px}
 p{color:#a8a290;margin:0 0 24px}
 .code{font:600 40px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;margin:0 0 28px}
 a{display:block;text-align:center;text-decoration:none;border-radius:19px;padding:18px;margin-bottom:12px}
 .primary{background:#f1eee5;color:#131210;font-weight:600}
 .ghost{color:#a8a290}
</style></head><body><main>
 <h1>Train together</h1>
 <p>One bar, taking turns. The weights stay personal.</p>
 ${code ? `<div class="code">${code}</div>` : ''}
 <a class="primary" href="hush://pair?c=${code}">Open in the app</a>
 <a class="ghost" href="${APP_STORE_URL}">Get the app</a>
</main></body></html>`;
      return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    /*
     * ════ /plan — THE SHARED WEEK'S LANDING (2026-09-01, audit lever 2) ════
     *
     * The plan link used to be `hush://plan?p=…` — inert for anyone without the app, which is
     * every recipient worth acquiring. The pair invite solved this exact problem with a landing
     * page months of work ago; the plan simply never got the same treatment. Same pattern: the
     * page says what arrived, opens the app when it exists, and points at the store when it does
     * not. The token stays opaque — nothing about her week is readable here or logged.
     */
    if (req.method === 'GET' && path === '/plan') {
      const token = (url.searchParams.get('p') ?? '').slice(0, 4096).replace(/[^A-Za-z0-9\-_=%.]/g, '');
      const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:title" content="A training week, shared with you">
<meta property="og:description" content="Someone built you a week in Hush — a strength coach that measures instead of guessing.">
<title>A training week, shared with you</title>
<style>
 body{margin:0;background:#131210;color:#f1eee5;font:400 17px/1.5 -apple-system,system-ui,sans-serif;
      display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
 main{max-width:22rem;width:100%}
 h1{font:400 28px/1.2 Georgia,serif;margin:0 0 8px}
 p{color:#a8a290;margin:0 0 28px}
 a{display:block;text-align:center;text-decoration:none;border-radius:19px;padding:18px;margin-bottom:12px}
 .primary{background:#f1eee5;color:#131210;font-weight:600}
 .ghost{color:#a8a290}
</style></head><body><main>
 <h1>A training week, shared with you</h1>
 <p>Open it in Hush and it becomes yours — loads and all, adjusted to you from the first set.</p>
 ${token ? `<a class="primary" href="hush://plan?p=${token}">Open in the app</a>` : ''}
 <a class="ghost" href="${APP_STORE_URL}">Get the app</a>
</main></body></html>`;
      return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    /*
     * ════ / — A FRONT DOOR INSTEAD OF A 404 (2026-09-01, the audit's finding 09) ═════════════════
     *
     * The origin existed, served the pair page, and answered its own root with an error. This is
     * the smallest owned web presence: the name, the one-sentence claim, the App Store link. Not a
     * marketing site — a signpost, like /pair — and the copy is the founder's to rewrite in a
     * redeploy. Static, no KV, cacheable.
     */
    if (req.method === 'GET' && path === '/') {
      const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Hush reads the reps you just did and moves the iron before your next set. No streaks, no scores — measured coaching for the gym floor.">
<title>Hush</title>
<style>
 body{margin:0;background:#000;color:#f1eee5;font:400 17px/1.6 -apple-system,system-ui,sans-serif;
      display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
 main{max-width:23rem;width:100%;text-align:center}
 .mark{color:#a9c49f;letter-spacing:.18em;font-size:12px;text-transform:uppercase;margin-bottom:16px}
 h1{font:400 34px/1.25 Georgia,serif;margin:0 0 14px}
 p{color:#a8a290;margin:0 0 32px}
 a{display:block;text-decoration:none;border-radius:19px;padding:18px;background:#f1eee5;color:#131210;font-weight:600}
</style></head><body><main>
 <div class="mark">hush</div>
 <h1>It saw your last set. It already changed your next.</h1>
 <p>A strength coach that measures instead of guessing. Your reps in, the next weight out — in about ninety seconds.</p>
 <a href="${APP_STORE_URL}">Get Hush on the App Store</a>
</main></body></html>`;
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
      });
    }

    /*
     * ════ THE HOSTED LEGAL PAGES (2026-09-01, audit finding 4) ════
     *
     * App Store Connect requires a privacy-policy URL; `platform/legal.ts` points here. The
     * in-app LegalSheet stays the athlete-facing summary; these are the documents of record —
     * same voice, fuller facts. ⚠️ The TEXT is a draft pending the founder's legal review; the
     * route and the wiring are not.
     */
    if (req.method === 'GET' && (path === '/privacy' || path === '/terms')) {
      const page = (title: string, sections: [string, string][]) =>
        `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Hush — ${title}</title>
<style>body{margin:0;background:#000;color:#f1eee5;font:400 17px/1.65 -apple-system,system-ui,sans-serif;padding:48px 24px}
main{max-width:38rem;margin:0 auto}.mark{color:#a9c49f;letter-spacing:.18em;font-size:12px;text-transform:uppercase;margin-bottom:16px}
h1{font:400 30px/1.25 Georgia,serif;margin:0 0 8px}h2{font:600 15px/1.4 -apple-system,system-ui,sans-serif;margin:28px 0 6px;color:#d8d3c4}
p{color:#a8a290;margin:0 0 12px}.stamp{color:#6d675a;font-size:13px;margin-top:36px}</style></head><body><main>
<div class="mark">hush</div><h1>${title}</h1>
${sections.map(([h, b]) => `<h2>${h}</h2><p>${b}</p>`).join('\n')}
<p class="stamp">Hush · com.hushfitness.app · privacy@hushfitness.app · Last updated 2026-09-01</p>
</main></body></html>`;
      const body =
        path === '/privacy'
          ? page('Privacy Policy', [
              ['What stays on your device', 'Your workouts, loads, body map, pain reports and training history are stored on your phone. An encrypted backup lives in iCloud under your own Apple ID; we cannot read it.'],
              ['The coach', 'When you ask the coach to build or review a week, the training data needed for that request is processed on our behalf by Google (Gemini) over our own relay. It is not used to train Google’s models, and we never store the request.'],
              ['Measurement', 'Product usage is measured with PostHog under a random install identifier — never your name, email or Apple ID. Crash reports reach Sentry with personal data disabled. Neither is sold or used for advertising, ever.'],
              ['The circle', 'If you join a circle or a shared workout, your first name and weekly workout counts are held on Cloudflare servers so your partners can see them, until you leave or delete the account.'],
              ['Sign in', 'Sign in with Apple gives us a pseudonymous identifier and, if you share it, your name. We never receive your password.'],
              ['Deletion', 'Delete Account, in the You tab, erases what our servers hold and what the device holds, immediately. The iCloud backup is under your Apple ID and yours to remove. You can also write to us for any access, correction or deletion request.'],
              ['Where and on what basis', 'Data is processed in the EU and the US by the processors named above, under our instructions, on the basis of performing the service you asked for. Server records live only as long as the account does; sessions expire within 90 days.'],
            ])
          : page('Terms of Use', [
              ['The service', 'Hush is a personal training programme. It is not medical advice: before a major change in your training — and especially after an injury — consult a professional.'],
              ['Your licence', 'You receive a personal, non-transferable licence to use the app. Its content, code and figures are Hush’s property.'],
              ['Membership', 'The subscription is billed by Apple under their terms; the trial is free and takes no card. Your history, records and export stay yours with or without a membership.'],
              ['Conduct', 'Use that breaks the law or harms the service can close the account.'],
            ]);
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
      });
    }

    // Rate limit per caller IP — identity endpoints are where credential-stuffing scripts go.
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    if (env.ID_LIMIT) {
      const { success } = await env.ID_LIMIT.limit({ key: ip });
      if (!success) return json(429, { error: 'rate_limited' });
    }

    /*
     * ════ /config — REMOTE TUNABLES (2026-09-01, the audit's finding 03) ═════════════════════════
     *
     * The app fetches this at boot (`platform/remoteConfig`). The body is whatever an operator put
     * in ONE KV entry — `wrangler kv key put --binding=HUSH_KV config:app '{"trialSessionLimit":14}'`
     * — so retuning a constant costs an edit, not a binary and an Apple review. Public and cached:
     * it holds tuning numbers, never secrets, and the app re-sanitizes every field anyway.
     */
    if (req.method === 'GET' && path === '/config') {
      const cfg = (await env.HUSH_KV.get('config:app')) ?? '{}';
      return new Response(cfg, {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
      });
    }

    /*
     * ════ /events — THE RESEARCH SINK (2026-09-01, the audit's finding 01) ═══════════════════════
     *
     * The app's telemetry outbox POSTs here (`platform/telemetry.shipToSink`); this rebuilds each
     * event FIELD-BY-FIELD (the circle's own discipline — a tampered client cannot store more than
     * the allow-list) and forwards the batch to the analytics store named in `EVENTS_URL`, signing
     * it with the key that never leaves Cloudflare.
     *
     * ⚠️ UNAUTHENTICATED, DELIBERATELY: the single most important funnel is the one BEFORE an
     * account exists (sign-in → fork → intake), and a sink that requires a session cannot see it.
     * The rate limiter above is the guard; the allow-list caps what a stranger can even say.
     * ⚠️ NO PII BY CONSTRUCTION: the only identity is the app's self-generated install id.
     */
    if (req.method === 'POST' && path === '/events') {
      let body: { v?: number; events?: unknown[] };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return json(400, { error: 'bad_json' });
      }
      if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > 200) {
        return json(400, { error: 'bad_batch' });
      }
      const batch = body.events.flatMap((raw) => {
        const e = raw as Record<string, unknown>;
        if (typeof e.type !== 'string' || e.type.length === 0 || e.type.length > 64) return [];
        const props: Record<string, unknown> = {};
        // The envelope, field by field. Unknown keys are dropped on the floor, whatever was sent.
        for (const k of ['seq', 'client_monotonic'] as const) if (typeof e[k] === 'number') props[k] = e[k];
        for (const k of ['session_id', 'app_version', 'os', 'locale', 'network'] as const)
          if (typeof e[k] === 'string' && (e[k] as string).length <= 128) props[k] = e[k];
        if (e.data && typeof e.data === 'object' && !Array.isArray(e.data)) {
          for (const [k, v] of Object.entries(e.data as Record<string, unknown>)) {
            if (props[`d_${k}`] !== undefined) continue;
            if (typeof v === 'string' ? v.length <= 256 : typeof v === 'number' || typeof v === 'boolean')
              props[`d_${k}`] = v;
          }
        }
        return [
          {
            event: e.type,
            distinct_id: typeof e.device_id === 'string' && e.device_id.length <= 64 ? e.device_id : 'unknown',
            timestamp: typeof e.client_ts === 'string' && e.client_ts.length <= 40 ? e.client_ts : undefined,
            properties: props,
          },
        ];
      });
      if (batch.length === 0) return json(400, { error: 'bad_batch' });
      /*
       * ⚠️ REVERSED 2026-09-01 (audit finding 2). This used to answer 204 — a success — and the
       * app, told its batch was delivered, cleared the outbox. An unarmed sink was therefore a
       * fully-instrumented pipeline that PROVABLY DELETED every event in production, silently,
       * with a green test suite. "The app is never broken by an unarmed sink" was the design; the
       * app was never broken by a 503 either — its client keeps the outbox on any non-2xx and
       * retries at the next flush, which is exactly what "not delivered" should do. A sink that
       * cannot deliver says so.
       */
      if (!env.EVENTS_URL || !env.EVENTS_KEY) return json(503, { error: 'sink_unarmed' });
      try {
        const res = await fetch(env.EVENTS_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ api_key: env.EVENTS_KEY, batch }),
        });
        // A sink-side failure keeps the client's outbox (it retries next flush).
        return res.ok ? new Response(null, { status: 204 }) : json(502, { error: 'sink_unavailable' });
      } catch {
        return json(502, { error: 'sink_unavailable' });
      }
    }

    /*
     * ════ APP STORE SERVER NOTIFICATIONS V2 — THE CHURN THE DATASET COULD NOT SEE ════
     * (2026-09-01, audit finding 2)
     *
     * Apple POSTs `{ signedPayload: <JWS> }` here for every subscription lifecycle event —
     * DID_RENEW, EXPIRED, DID_CHANGE_RENEWAL_STATUS, REFUND, GRACE_PERIOD… Until this route
     * existed, a cancellation was invisible everywhere except App Store Connect: the product
     * dataset could see a purchase (client-side event) and then nothing, forever. Churn — the
     * number a subscription business lives or dies by — was not measurable at all.
     *
     * ⚠️ MEASUREMENT-GRADE, NOT ENTITLEMENT-GRADE, and the difference is the design:
     * nothing is granted, stored, or revoked from what arrives here. It is decoded, reduced to an
     * allow-list, and forwarded to the analytics store — the same trust level as `/events` one
     * block up, which is also unauthenticated by explicit decision. A forged POST can pollute a
     * chart; it cannot touch an athlete's access, because the entitlement authority stays where it
     * always was (StoreKit, on the device). The day this worker starts ANSWERING entitlement
     * questions, the x5c chain must be verified to Apple's root first — that line is the boundary
     * between the two grades, and it is load-bearing.
     *
     * The URL for App Store Connect (per environment): https://<worker>/appstore/notifications
     */
    if (req.method === 'POST' && path === '/appstore/notifications') {
      let signed: string;
      try {
        const body = (await req.json()) as { signedPayload?: string };
        signed = String(body.signedPayload ?? '');
      } catch {
        return json(400, { error: 'bad_request' });
      }
      // A JWS is three dot-joined base64url parts; a payload past 64 KB is not one of Apple's.
      const parts = signed.split('.');
      if (parts.length !== 3 || signed.length > 65_536) return json(400, { error: 'bad_request' });
      try {
        const outer = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as {
          notificationType?: string; subtype?: string; data?: {
            bundleId?: string; environment?: string; signedTransactionInfo?: string; signedRenewalInfo?: string;
          };
        };
        // Not our app → not our chart. (Also the cheapest possible forgery filter.)
        if (outer.data?.bundleId !== 'com.hushfitness.app') return json(400, { error: 'bad_request' });
        // The transaction JWS inside carries the ids that make the event joinable.
        let originalTransactionId = '';
        let productId = '';
        const txJws = String(outer.data?.signedTransactionInfo ?? '');
        const txParts = txJws.split('.');
        if (txParts.length === 3) {
          const tx = JSON.parse(new TextDecoder().decode(b64urlToBytes(txParts[1]))) as {
            originalTransactionId?: string; productId?: string;
          };
          originalTransactionId = String(tx.originalTransactionId ?? '').slice(0, 64);
          productId = String(tx.productId ?? '').slice(0, 64);
        }
        // Rebuilt field-by-field like every other inbound body in this worker. Apple's own retry
        // policy handles a 5xx from us, so an unarmed sink answers 503 here too — Apple re-sends.
        if (!env.EVENTS_URL || !env.EVENTS_KEY) return json(503, { error: 'sink_unarmed' });
        const event = {
          event: `appstore_${String(outer.notificationType ?? 'UNKNOWN').toLowerCase().slice(0, 48)}`,
          distinct_id: originalTransactionId || 'unknown',
          properties: {
            subtype: String(outer.subtype ?? '').slice(0, 48),
            product_id: productId,
            environment: String(outer.data?.environment ?? '').slice(0, 16),
          },
        };
        const res = await fetch(env.EVENTS_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ api_key: env.EVENTS_KEY, batch: [event] }),
        });
        return res.ok ? new Response(null, { status: 204 }) : json(502, { error: 'sink_unavailable' });
      } catch {
        return json(400, { error: 'bad_request' });
      }
    }

    if (req.method === 'POST' && path === '/auth/apple') {
      let body: { identityToken?: string };
      try {
        body = (await req.json()) as { identityToken?: string };
      } catch {
        return json(400, { error: 'bad_request' });
      }
      if (!body.identityToken) return json(400, { error: 'bad_request' });
      let sub: string | null = null;
      try {
        sub = await verifyAppleToken(body.identityToken);
      } catch {
        return json(503, { error: 'unavailable' });
      }
      if (!sub) return json(401, { error: 'unauthorized' });
      const token = randomToken();
      await env.HUSH_KV.put(`session:${token}`, sub, { expirationTtl: SESSION_TTL_S });
      const user = await userOf(env, sub);
      await env.HUSH_KV.put(`user:${sub}`, JSON.stringify(user));
      return json(200, { token });
    }

    /*
     * ⛔ THE ONE DOOR THAT IS NOT OPENED BY THE BEARER TOKEN — and deliberately so.
     *
     * A WebSocket URL is a URL: it lands in proxy logs, in crash reports, in whatever a phone's OS
     * decides to keep. The 90-day session token must never be written into one. So the room is
     * entered with a SINGLE-USE ticket, minted a moment ago by an ordinary authenticated POST,
     * naming exactly one room and expiring in a minute. It is spent on arrival — a ticket read
     * twice is a ticket that opens nothing the second time.
     */
    if (path === '/pair/room') {
      const ticket = url.searchParams.get('ticket') ?? '';
      if (!ticket) return json(401, { error: 'unauthorized' });
      const rec = (await env.HUSH_KV.get(`ticket:${ticket}`, 'json')) as TicketRec | null;
      if (!rec) return json(401, { error: 'unauthorized' });
      await env.HUSH_KV.delete(`ticket:${ticket}`); // single use, spent
      // The room is handed facts the SERVER established. Nothing the socket claims about who it is
      // is believed, because nothing it claims about who it is is ever read.
      const inner = new Request(req.url, req);
      inner.headers.set('x-hush-sub', rec.sub);
      inner.headers.set('x-hush-role', rec.role);
      return env.PAIR_ROOM.get(env.PAIR_ROOM.idFromName(rec.code)).fetch(inner);
    }

    // Everything below requires a session.
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!bearer) return json(401, { error: 'unauthorized' });
    const sub = await env.HUSH_KV.get(`session:${bearer}`);
    if (!sub) return json(401, { error: 'unauthorized' });
    // A used session stays alive — renew the TTL. Awaited: a Worker may cancel promises still
    // floating when the response returns, and a silently dropped renewal is a slow sign-out.
    await env.HUSH_KV.put(`session:${bearer}`, sub, { expirationTtl: SESSION_TTL_S });

    /*
     * ════ THE DELETION THAT FINALLY DELETES (2026-09-01, audit finding 4) ════
     *
     * Until this route existed, the app's "Delete Account" wiped the phone and NOTHING here: the
     * Apple sub → circle mapping sat in KV forever, written with no TTL. That fails GDPR Art. 17
     * and Apple's own account-deletion rule for apps with Sign in with Apple. This is the erase
     * hook the client's `deleteAccount` was always written to call FIRST, before the local wipe.
     *
     * What goes: her user record, her week publications, her circle membership (the circle itself
     * dies only when she was its last member — the other members keep theirs), and the session
     * that made this call. Sessions on OTHER devices cannot be enumerated (KV has no index by
     * sub) — they expire on their own inside 90 days, and from this moment they point at nobody:
     * every authenticated route resolves the sub to an empty record.
     */
    if (req.method === 'POST' && path === '/account/delete') {
      const user = await userOf(env, sub);
      if (user.circle) {
        const circle = (await env.HUSH_KV.get(`circle:${user.circle}`, 'json')) as CircleRec | null;
        if (circle) {
          const members = circle.members.filter((m) => m !== sub);
          if (members.length === 0) await env.HUSH_KV.delete(`circle:${user.circle}`);
          else await env.HUSH_KV.put(`circle:${user.circle}`, JSON.stringify({ members }));
        }
        await env.HUSH_KV.delete(`week:${user.circle}:${sub}`);
      }
      await env.HUSH_KV.delete(`user:${sub}`);
      await env.HUSH_KV.delete(`session:${bearer}`);
      return json(200, { ok: true });
    }

    if (req.method === 'POST' && path === '/circle/create') {
      const user = await userOf(env, sub);
      if (user.circle) return json(409, { error: 'already_in_circle' });
      // Collisions are astronomically unlikely (31^6) — but a taken code is retried, not clobbered.
      let code = randomCode();
      for (let i = 0; i < 3 && (await env.HUSH_KV.get(`circle:${code}`)); i++) code = randomCode();
      await env.HUSH_KV.put(`circle:${code}`, JSON.stringify({ members: [sub] } satisfies CircleRec));
      await env.HUSH_KV.put(`user:${sub}`, JSON.stringify({ ...user, circle: code }));
      return json(200, { code });
    }

    if (req.method === 'POST' && path === '/circle/join') {
      let body: { code?: string };
      try {
        body = (await req.json()) as { code?: string };
      } catch {
        return json(400, { error: 'bad_request' });
      }
      const code = (body.code ?? '').toUpperCase().trim();
      const circle = (await env.HUSH_KV.get(`circle:${code}`, 'json')) as CircleRec | null;
      if (!circle) return json(404, { error: 'not_found' });
      const user = await userOf(env, sub);
      if (user.circle && user.circle !== code) return json(409, { error: 'already_in_circle' });
      if (!circle.members.includes(sub)) {
        if (circle.members.length >= MAX_MEMBERS) return json(409, { error: 'circle_full' });
        circle.members.push(sub);
        await env.HUSH_KV.put(`circle:${code}`, JSON.stringify(circle));
      }
      await env.HUSH_KV.put(`user:${sub}`, JSON.stringify({ ...user, circle: code }));
      return json(200, { code });
    }

    if (req.method === 'POST' && path === '/circle/leave') {
      const user = await userOf(env, sub);
      if (user.circle) {
        const circle = (await env.HUSH_KV.get(`circle:${user.circle}`, 'json')) as CircleRec | null;
        if (circle) {
          const members = circle.members.filter((m) => m !== sub);
          if (members.length === 0) await env.HUSH_KV.delete(`circle:${user.circle}`);
          else await env.HUSH_KV.put(`circle:${user.circle}`, JSON.stringify({ members }));
        }
        await env.HUSH_KV.delete(`week:${user.circle}:${sub}`);
      }
      await env.HUSH_KV.put(`user:${sub}`, JSON.stringify({}));
      return json(200, { ok: true });
    }

    if (req.method === 'POST' && path === '/circle/week') {
      const user = await userOf(env, sub);
      if (!user.circle) return json(404, { error: 'no_circle' });
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return json(400, { error: 'bad_request' });
      }
      const state = readWeekState(raw);
      if (!state) return json(400, { error: 'bad_request' });
      await env.HUSH_KV.put(`week:${user.circle}:${sub}`, JSON.stringify(state), { expirationTtl: WEEK_TTL_S });
      return json(200, { ok: true });
    }

    if (req.method === 'GET' && path === '/circle') {
      const user = await userOf(env, sub);
      if (!user.circle) return json(200, { circle: null });
      const circle = (await env.HUSH_KV.get(`circle:${user.circle}`, 'json')) as CircleRec | null;
      if (!circle) return json(200, { circle: null });
      const members: WeekState[] = [];
      for (const m of circle.members) {
        const w = (await env.HUSH_KV.get(`week:${user.circle}:${m}`, 'json')) as WeekState | null;
        if (w) members.push(w);
      }
      return json(200, { circle: { code: user.circle, members } });
    }

    /*
     * ════ THE PAIR'S TWO HTTP DOORS ════
     *
     * Both answer with a ticket for `/pair/room`. The registry they write is a CODE and who opened
     * it, for four hours — no lift, no set, no load, no name. The live session lives in the room's
     * memory and is never written down anywhere at all.
     */
    if (req.method === 'POST' && path === '/pair/open') {
      let code = randomCode();
      for (let i = 0; i < 3 && (await env.HUSH_KV.get(`pair:${code}`)); i++) code = randomCode();
      await env.HUSH_KV.put(`pair:${code}`, JSON.stringify({ host: sub }), { expirationTtl: PAIR_TTL_S });
      return json(200, { code, ticket: await mintTicket(env, code, sub, 'host') });
    }

    if (req.method === 'POST' && path === '/pair/join') {
      let body: { code?: string };
      try {
        body = (await req.json()) as { code?: string };
      } catch {
        return json(400, { error: 'bad_request' });
      }
      const code = (body.code ?? '').toUpperCase().trim();
      const open = (await env.HUSH_KV.get(`pair:${code}`, 'json')) as { host?: string } | null;
      /*
       * ⛔ A TYPO IS ANSWERED HERE, NOT BY A SOCKET THAT CLOSES.
       *
       * "That code opened no room" is a sentence she can act on — check it with her brother, type
       * it again. A WebSocket that connects and then hangs up is not; it is indistinguishable from
       * bad reception, which is the one thing a gym always has.
       */
      if (!open) return json(404, { error: 'not_found' });
      // The opener rejoining her own room (a phone that died) is still the host — the role is a
      // property of the room, not of which button was pressed last.
      const role = open.host === sub ? 'host' : 'guest';
      return json(200, { ticket: await mintTicket(env, code, sub, role) });
    }

    return json(404, { error: 'not_found' });
  },
};

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ROOM — one Durable Object per live pair. (2026-08-31)
 *
 * A Durable Object is a single-threaded, single-instance authority addressed by name, and the name
 * here is the pair code. Two sockets, one object, no coordination problem: the two phones cannot
 * reach two different copies of this, which is the whole reason it is not a stateless Worker with
 * KV behind it.
 *
 * ── ⛔ IT NEVER TOUCHES `state.storage`, AND THAT IS THE FEATURE ─────────────────────────────────
 *
 * `domain/sharedSession`'s header makes a promise about the one weight this product lets off the
 * phone: *"it is NEVER STORED. Not in KV, not in the Durable Object, not in either phone's record.
 * It is relayed between two open sockets and dropped."* This class is where that promise is either
 * kept or broken, and it is kept the only way a promise like that can be — by there being no line
 * of code that could break it. There is no `state.storage` call in this file. A law reads the file
 * and says so (`theBarIsSharedAndNothingElseIs`).
 *
 * The cost of that choice is that the object may NOT hibernate: everything it knows lives in the
 * two fields below, and hibernation would require serialising them. A pair is a live workout —
 * sixty minutes of two sockets — so this is duration billed for as long as two people are actually
 * training together, which is a rounding error, and it buys a guarantee that reads in one glance.
 *
 * ── WHAT IT DOES, IN ONE SENTENCE ───────────────────────────────────────────────────────────────
 * It validates a frame field-by-field and hands it to the other socket. It has no opinion about
 * whose turn it is, how long anyone rests, or where the pair is in the workout — all of that is
 * DERIVED on both phones from the frames (`domain/sharedSession.sharedStanding`), so there is no
 * server-side truth here that either screen could disagree with.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Frames are small by construction; anything larger is not one of ours. */
const MAX_FRAME_BYTES = 4096;
/** A socket may speak this often. A real athlete's phone sends a frame per set and per phase. */
const FRAME_BUDGET = 60;
const FRAME_WINDOW_MS = 10_000;
/** Close codes, so the app can tell "the room was full" from "the wifi died". */
const CLOSE_PAIR_FULL = 4001;
const CLOSE_MISBEHAVED = 4002;

type PairRole = 'host' | 'guest';

interface PairBar {
  exerciseId: string;
  kg: number;
  reps: number;
}

interface PairProgress {
  v: number;
  name: string;
  presence: string;
  done: number[];
  at: number;
  bar?: PairBar;
}

interface PairPlan {
  v: number;
  lifts: { exerciseId: string; sets: number }[];
}

interface Side {
  sub: string;
  role: PairRole;
  ws: CfWebSocket;
  progress: PairProgress | null;
  /** Frame budget, refilled every `FRAME_WINDOW_MS`. */
  spent: number;
  windowAt: number;
}

// ───────────────────────── the allow-list, rebuilt server-side ─────────────────────────
//
// The same discipline `readWeekState` keeps for the circle, and for the same reason: whatever a
// client sends, what this room relays is what these functions built. They are a deliberate
// DUPLICATE of `domain/sharedSession`'s readers — the app and the worker cannot import from each
// other, and a law asserts the two agree key for key rather than trusting that they do.

const PRESENCES = ['lifting', 'resting', 'paused', 'done'];

const numOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function readPairBar(raw: unknown): PairBar | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const exerciseId = typeof r.exerciseId === 'string' ? r.exerciseId.trim().slice(0, 64) : '';
  const kg = numOf(r.kg);
  const reps = numOf(r.reps);
  if (!exerciseId || kg == null || reps == null) return undefined;
  if (kg < 0 || kg > 500 || reps < 0 || reps > 100) return undefined;
  return { exerciseId, kg: Math.round(kg * 100) / 100, reps: Math.round(reps) };
}

function readPairProgress(raw: unknown): PairProgress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const v = numOf(r.v);
  const at = numOf(r.at);
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 20) : '';
  const presence = PRESENCES.find((p) => p === r.presence);
  if (v == null || at == null || !name || !presence || !Array.isArray(r.done)) return null;
  const done: number[] = [];
  for (const d of r.done) {
    const n = numOf(d);
    if (n == null || n < 0 || n > 20) return null;
    done.push(Math.round(n));
  }
  if (done.length > 40) return null;
  const bar = readPairBar(r.bar);
  return { v: Math.round(v), name, presence, done, at: Math.round(at), ...(bar ? { bar } : {}) };
}

function readPairPlan(raw: unknown): PairPlan | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const v = numOf(r.v);
  if (v == null || !Array.isArray(r.lifts)) return null;
  const lifts: PairPlan['lifts'] = [];
  for (const entry of r.lifts) {
    if (typeof entry !== 'object' || entry === null) return null;
    const e = entry as Record<string, unknown>;
    const exerciseId = typeof e.exerciseId === 'string' ? e.exerciseId.trim().slice(0, 64) : '';
    const sets = numOf(e.sets);
    if (!exerciseId || sets == null || sets < 1 || sets > 20) return null;
    lifts.push({ exerciseId, sets: Math.round(sets) });
  }
  if (lifts.length === 0 || lifts.length > 40) return null;
  return { v: Math.round(v), lifts };
}

/** An exercise id, for the swap frames — the only other free string that crosses. */
const readId = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 64 ? v.trim() : null;

// ───────────────────────────── the room ─────────────────────────────

export class HushPairRoom {
  /** The two sockets. Never more; see `CLOSE_PAIR_FULL`. */
  private sides: Side[] = [];
  /** The host's plan, as last published. In memory only, for the life of the room. */
  private plan: PairPlan | null = null;

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(_state: unknown, _env: unknown) {
    /* Deliberately empty. `_state` is NOT retained: a field holding it is a field somebody can
       later write `state.storage.put` through, and this room's promise is that nobody can. */
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const sub = req.headers.get('x-hush-sub') ?? '';
    const role = (req.headers.get('x-hush-role') === 'host' ? 'host' : 'guest') as PairRole;
    if (!sub) return new Response('unauthorized', { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const upgraded = (): Response => new Response(null, { status: 101, webSocket: client } as CfResponseInit);

    /*
     * ⛔ A RECONNECT REPLACES; IT DOES NOT QUEUE.
     *
     * Her phone slept, the socket died, the app woke and dialled again. That is the SAME athlete,
     * and if the old socket still counted the room would be "full" of one person twice — and she
     * would be locked out of her own workout by her own dead connection. Keyed by `sub`, so the
     * question never comes up.
     */
    const existing = this.sides.find((s) => s.sub === sub);
    if (existing) {
      try {
        existing.ws.close(1000, 'replaced');
      } catch {
        /* already gone */
      }
      this.sides = this.sides.filter((s) => s !== existing);
    } else if (this.sides.length >= 2) {
      // Two. Not three (founder ruling 3, 2026-08-31) — and the third is told why, not dropped.
      server.send(JSON.stringify({ t: 'error', error: 'pair_full' }));
      server.close(CLOSE_PAIR_FULL, 'pair_full');
      return upgraded();
    }

    const side: Side = {
      sub,
      role,
      ws: server,
      progress: existing?.progress ?? null,
      spent: 0,
      windowAt: Date.now(),
    };
    this.sides.push(side);

    server.addEventListener('message', (ev) => this.onMessage(side, ev));
    server.addEventListener('close', () => this.onClose(side));
    server.addEventListener('error', () => this.onClose(side));

    /*
     * What she needs the moment she is in the room: her role (server-decided), whether anyone else
     * is here, the plan if one has been published, and where her partner already is.
     *
     * ⛔ THE `partner: 'joined'` GOES BOTH WAYS, and the first build only sent it outward. The
     * athlete already in the room was told somebody had arrived; the one ARRIVING was told nothing,
     * and had to wait for the other phone's next frame to discover she was not alone. Up to twenty
     * seconds of "nobody else is in it" on the one screen whose whole question is whether it worked.
     */
    const other = this.other(side);
    side.ws.send(JSON.stringify({ t: 'room', role }));
    if (this.plan) side.ws.send(JSON.stringify({ t: 'plan', plan: this.plan }));
    if (other) {
      side.ws.send(JSON.stringify({ t: 'partner', state: 'joined' }));
      other.ws.send(JSON.stringify({ t: 'partner', state: 'joined' }));
      if (other.progress) side.ws.send(JSON.stringify({ t: 'peer', p: other.progress }));
    }

    return upgraded();
  }

  private other(side: Side): Side | undefined {
    return this.sides.find((s) => s !== side);
  }

  private relay(from: Side, frame: unknown): void {
    const to = this.other(from);
    if (!to) return;
    try {
      to.ws.send(JSON.stringify(frame));
    } catch {
      /* a socket that cannot be written to is one that is about to close itself */
    }
  }

  /** A budget, not a ban: a phone under a bad connection retries, and retrying is not an attack. */
  private withinBudget(side: Side): boolean {
    const now = Date.now();
    if (now - side.windowAt > FRAME_WINDOW_MS) {
      side.windowAt = now;
      side.spent = 0;
    }
    side.spent += 1;
    return side.spent <= FRAME_BUDGET;
  }

  private onMessage(side: Side, ev: { data: unknown }): void {
    if (typeof ev.data !== 'string' || ev.data.length > MAX_FRAME_BYTES) {
      side.ws.close(CLOSE_MISBEHAVED, 'frame');
      return;
    }
    if (!this.withinBudget(side)) {
      side.ws.close(CLOSE_MISBEHAVED, 'flood');
      return;
    }
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(ev.data) as Record<string, unknown>;
    } catch {
      return; // a frame we cannot read is a frame we ignore; it is never a reason to end a workout
    }

    switch (msg.t) {
      case 'progress': {
        const p = readPairProgress(msg.p);
        if (!p) return;
        side.progress = p;
        this.relay(side, { t: 'peer', p });
        return;
      }
      case 'plan': {
        /*
         * ⛔ ONLY THE HOST OWNS THE STRUCTURE (`SHARED_SESSION_V1.md` §3). A guest publishing a
         * plan is not a feature that exists; if it ever does, it arrives through a swap the host
         * accepts, which is the frame below.
         */
        if (side.role !== 'host') return;
        const plan = readPairPlan(msg.plan);
        if (!plan) return;
        // A plan version never goes backwards — a late frame cannot un-swap a lift both athletes
        // have already moved on from.
        if (this.plan && plan.v <= this.plan.v) return;
        this.plan = plan;
        this.relay(side, { t: 'plan', plan });
        return;
      }
      case 'lead': {
        /*
         * ⛔ WHOSE LIFTS THE WORKOUT RUNS ON — handed over, and only before there is a workout.
         *
         * The role decides two things: who may publish the structure, and who takes every tie in
         * `turnAtLift`. Both are settled the moment a plan exists, so a lead handed over mid-session
         * would make the alternation JUMP — the athlete who was next would suddenly not be. Once a
         * plan is published the lead is final, and this frame is ignored rather than argued with.
         *
         * ⚠️ AND ONLY WITH TWO PEOPLE IN THE ROOM. Swapping a lone side's role would leave a room
         * with a guest and no host — nobody able to publish a plan, and a pair that never starts.
         */
        if (this.plan || this.sides.length !== 2) return;
        for (const sd of this.sides) sd.role = sd.role === 'host' ? 'guest' : 'host';
        for (const sd of this.sides) sd.ws.send(JSON.stringify({ t: 'room', role: sd.role }));
        return;
      }
      case 'swapAsk': {
        const from = readId(msg.from);
        const to = readId(msg.to);
        if (!from || !to) return;
        this.relay(side, { t: 'swapAsk', from, to });
        return;
      }
      case 'swapAnswer': {
        this.relay(side, { t: 'swapAnswer', accept: msg.accept === true });
        return;
      }
      case 'bye': {
        side.ws.close(1000, 'bye');
        return;
      }
      default:
        return; // an unknown frame is from a newer app; silence is the compatible answer
    }
  }

  private onClose(side: Side): void {
    if (!this.sides.includes(side)) return;
    this.sides = this.sides.filter((s) => s !== side);
    const other = this.other(side) ?? this.sides[0];
    if (other) {
      try {
        other.ws.send(JSON.stringify({ t: 'partner', state: 'left' }));
      } catch {
        /* both gone; the room empties and the object is collected */
      }
    }
    // ⛔ NOTHING IS FLUSHED ANYWHERE ON THE WAY OUT. When the last socket closes, everything this
    // room knew stops existing — which is exactly what was promised about it.
  }
}

/* ════ ADD TO `wrangler.toml` IN THE `hush-identity` PROJECT ════
 *
 * [[kv_namespaces]]
 * binding = "HUSH_KV"
 * id = "<from `npx wrangler kv namespace create HUSH_KV`>"
 *
 * [[unsafe.bindings]]
 * name = "ID_LIMIT"
 * type = "ratelimit"
 * namespace_id = "1"
 * simple = { limit = 60, period = 60 }
 *
 * ⛔ AND THE PAIR'S ROOM (2026-08-31) — a Durable Object class needs a binding AND a migration,
 * and forgetting the second is a deploy that fails with a message about an unknown class:
 *
 * [[durable_objects.bindings]]
 * name = "PAIR_ROOM"
 * class_name = "HushPairRoom"
 *
 * [[migrations]]
 * tag = "v1"
 * new_classes = ["HushPairRoom"]
 */

// ───────── Cloudflare Workers ambient types — kept local so this file compiles standalone ────────

interface KVNamespace {
  get(key: string): Promise<string | null>;
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface DurableObjectId {
  readonly name?: string;
}
interface DurableObjectStub {
  fetch(req: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
/**
 * The Workers runtime's socket, under its own name.
 *
 * ⚠️ NOT a declaration-merge onto the DOM's `WebSocket`. This file is a module, so an interface of
 * that name declared here SHADOWS the global one instead of extending it — every `send` and
 * `close` in the room then fails to compile while the error blames the runtime. Cost twenty
 * minutes on 2026-08-31; naming the type is both cheaper and clearer.
 */
interface CfWebSocket {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message', fn: (ev: { data: unknown }) => void): void;
  addEventListener(type: 'close' | 'error', fn: () => void): void;
}
/** The Workers runtime's socket pair — `[0]` goes back to the client, `[1]` stays here. */
declare class WebSocketPair {
  0: CfWebSocket;
  1: CfWebSocket;
}
/** `Response` carries the client half of the pair on a 101 — a Workers-only init field. */
interface CfResponseInit extends ResponseInit {
  webSocket?: CfWebSocket;
}
