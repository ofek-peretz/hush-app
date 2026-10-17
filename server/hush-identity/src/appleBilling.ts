/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * APPLE, ASKED DIRECTLY — the coach track's billing verification. (2026-09-18)
 *
 * The coach pays (founder ruling 1). Seats live in `coaches.seat_limit` on the worker, and this file
 * is the ONLY thing allowed to say what that number should be. Everything here exists so that the
 * answer comes from Apple's own signature and never from a phone.
 *
 * ── THE TWO WAYS APPLE SPEAKS, AND BOTH ARE SIGNED ──────────────────────────────────────────────
 * 1 · WE ASK (`appleSubscription`) — the App Store Server API, `GET /inApps/v1/subscriptions/{id}`.
 *     The request is authenticated with an ES256 JWT this worker signs with the In-App Purchase key
 *     (`APPLE_IAP_*` secrets). The answer's `signedTransactionInfo` is a JWS, and it is verified the
 *     same way as (2) — the HTTPS connection is not the proof, the signature is.
 * 2 · APPLE TELLS US (`/appstore/notifications` in `index.ts`) — App Store Server Notifications V2.
 *     Same JWS, same chain, no key needed at all: a notification proves itself.
 *
 * ── ⛔ WHAT "VERIFIED" MEANS HERE, EXACTLY ──────────────────────────────────────────────────────
 * `verifyAppleJws` walks the `x5c` chain the JWS carries and refuses it unless:
 *   · every certificate in the chain is inside its own validity window NOW;
 *   · each certificate is signed by the next one, checked with WebCrypto against the parent's key;
 *   · the LAST certificate's public key is Apple Root CA - G3's, byte for byte (pinned below);
 *   · the JWS body itself verifies (ES256) under the leaf certificate's key.
 * A chain that ends anywhere else is a chain anybody can mint. The root is pinned by its KEY rather
 * than by its name or its issuer string, because a name is something a forged certificate can copy.
 *
 * `index.ts` carried this line since 2026-09-01, and today is the day it is cashed:
 *   *"The day this worker starts ANSWERING entitlement questions, the x5c chain must be verified to
 *     Apple's root first — that line is the boundary between the two grades."*
 *
 * ── ⛔ THE TEST GATE, AND WHY PRODUCTION CANNOT REACH IT ────────────────────────────────────────
 * `testGateOpen` + `testSignatureOk` let `driveCoach.mjs` walk claim / renew / expire without an
 * Apple sandbox. It opens only when BOTH hold:
 *   · `env.BILLING_TEST` is set — a var that exists in NO wrangler.toml, in no `wrangler secret`
 *     step, and in no deploy instruction in this repo. It is passed by hand to `wrangler dev`.
 *   · the request arrived on a LOOPBACK hostname (`127.0.0.1`, `localhost`, `[::1]`). A deployed
 *     worker is reached by its own hostname; `url.hostname` is the routed name, not a header a
 *     caller can rename.
 * And the injected claim must still be HMAC-signed with that var, so even a dev machine with the
 * var set cannot be driven by a page it happened to open. A law
 * (`theCoachPlanCannotBeSelfGranted.test.ts`) reads all three facts back out of this file.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** The ONE app this worker sells for — a transaction for anything else is not ours. */
export const BILLING_BUNDLE_ID = 'com.hushfitness.app';

/**
 * ⛔ THE TIERS, AND THE SEAT COUNT IS THE SERVER'S. `code/mobile/src/platform/billing/products.ts`
 * holds the same three ids with the same three numbers for the CARD's line; this table is the one
 * that is enforced. They are deliberately duplicated rather than shared: the phone and the worker
 * ship separately, and a seat count that could arrive over the wire is a seat count for sale.
 */
export const COACH_TIER_SEATS: Readonly<Record<string, number>> = {
  'hush.coach.10.month': 10,
  'hush.coach.30.month': 30,
  'hush.coach.100.month': 100,
};

export const isCoachProduct = (id: string): boolean => Object.prototype.hasOwnProperty.call(COACH_TIER_SEATS, id);

/**
 * Apple Root CA - G3, as its SubjectPublicKeyInfo (DER, hex) — the trust anchor, pinned.
 *
 * Source: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer (583 bytes),
 * SHA-256 of that file: 63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179.
 * P-384, `CN=Apple Root CA - G3, OU=Apple Certification Authority, O=Apple Inc., C=US`,
 * valid to 2039-04-30. To re-derive it: `openssl x509 -inform der -in AppleRootCA-G3.cer -pubkey`.
 */
const APPLE_ROOT_G3_SPKI =
  '3076301006072a8648ce3d020106052b810400220362000498e92f3d4072a4ed93227281131cdd1095f1c5a34e71dc1416' +
  'd90ee5a6052a77647b5f4e38d3bb1c44b57ff51fb632625dc9e9845b4f304f115a00fd58580ca5f50f2c4d07471375da97' +
  '97976f315ced2b9d7b203bd8b954d95e99a43a510a31';

/** Apple's two App Store Server API hosts. Production is asked first; sandbox answers dev builds. */
const STOREKIT_PRODUCTION = 'https://api.storekit.itunes.apple.com';
const STOREKIT_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';
/** The JWT this worker signs for Apple lives twenty minutes; Apple's own cap is sixty. */
const API_TOKEN_TTL_MS = 20 * 60 * 1000;
const API_TIMEOUT_MS = 8000;

export interface AppleBillingEnv {
  /**
   * ⛔ THE THREE SECRETS, AND THEY ARE ABSENT UNTIL THE FOUNDER ADDS THEM (founder ops):
   *   npx wrangler secret put APPLE_IAP_KEY_ID       — the 10-character Key ID of the In-App
   *                                                    Purchase key (App Store Connect → Users and
   *                                                    Access → Integrations → In-App Purchase).
   *   npx wrangler secret put APPLE_IAP_ISSUER_ID    — the issuer UUID on that same page.
   *   npx wrangler secret put APPLE_IAP_PRIVATE_KEY  — the whole `AuthKey_XXXXXXXXXX.p8` file,
   *                                                    BEGIN/END lines and newlines included.
   * With any of them missing, `POST /coach/plan` answers 503 `billing_not_configured` and NOTHING
   * is logged about the body — a purchase that cannot be verified is a purchase we say nothing
   * about. The notification route keeps working without them: a notification proves itself.
   */
  APPLE_IAP_KEY_ID?: string;
  APPLE_IAP_ISSUER_ID?: string;
  APPLE_IAP_PRIVATE_KEY?: string;
  /** 'production' | 'sandbox' | absent (ask production, then sandbox — Apple's own guidance). */
  APPLE_IAP_ENVIRONMENT?: string;
  /**
   * ⛔ NEVER SET IN ANY DEPLOYMENT. See the file header: the local driver's key, and the only way
   * into the test injection path. There is no default and no fallback — absent means closed.
   */
  BILLING_TEST?: string;
}

export const appleBillingConfigured = (env: AppleBillingEnv): boolean =>
  !!(env.APPLE_IAP_KEY_ID && env.APPLE_IAP_ISSUER_ID && env.APPLE_IAP_PRIVATE_KEY);

// ════════════════════════════ bytes ════════════════════════════

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const text = (b: Uint8Array): string => new TextDecoder().decode(b);

const bytesOfB64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesOfB64Url = (s: string): Uint8Array =>
  bytesOfB64(s.replace(/-/g, '+').replace(/_/g, '/') + (s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))));

const b64urlOf = (b: Uint8Array): string => {
  let bin = '';
  for (const byte of b) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const hexOf = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ════════════════════════════ ASN.1 / X.509 — the smallest walk that can judge a chain ════════════════════════════
//
// Workers have no X.509 parser and no `node:crypto`, so the chain is walked by hand. Everything
// below reads DER and nothing below writes it; a malformed byte throws and the caller answers "no".

interface Der {
  tag: number;
  start: number;
  end: number;
  body: number;
  bodyEnd: number;
}

function der(b: Uint8Array, at: number): Der {
  if (at + 2 > b.length) throw new Error('der');
  const tag = b[at];
  let i = at + 1;
  let len = b[i++];
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('der');
    len = 0;
    for (let k = 0; k < n; k++) len = len * 256 + b[i++];
  }
  const bodyEnd = i + len;
  if (bodyEnd > b.length) throw new Error('der');
  return { tag, start: at, end: bodyEnd, body: i, bodyEnd };
}

function derChildren(b: Uint8Array, el: Der): Der[] {
  const out: Der[] = [];
  let at = el.body;
  while (at < el.bodyEnd) {
    const c = der(b, at);
    out.push(c);
    at = c.end;
  }
  return out;
}

/** An OID as the hex of its content bytes — comparing hex avoids writing a base-128 decoder. */
const oidHex = (b: Uint8Array, el: Der): string => {
  if (el.tag !== 0x06) throw new Error('der');
  return hexOf(b.slice(el.body, el.bodyEnd));
};

const OID_ECDSA_SHA256 = '2a8648ce3d040302';
const OID_ECDSA_SHA384 = '2a8648ce3d040303';
const OID_P256 = '2a8648ce3d030107';
const OID_P384 = '2b81040022';

/**
 * `YYMMDDHHMMSSZ` (UTCTime, tag 0x17) or `YYYYMMDDHHMMSSZ` (GeneralizedTime, 0x18), in ms.
 * UTCTime's two-digit year is read by RFC 5280's rule: under 50 is 20xx, 50 and over is 19xx.
 */
function derTime(b: Uint8Array, el: Der): number {
  if (el.tag !== 0x17 && el.tag !== 0x18) throw new Error('der');
  const s = text(b.slice(el.body, el.bodyEnd));
  const m = (el.tag === 0x18 ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/ : /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/).exec(s);
  if (!m) throw new Error('der');
  const y = Number(m[1]);
  const year = el.tag === 0x18 ? y : y < 50 ? 2000 + y : 1900 + y;
  const ms = Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  if (!Number.isFinite(ms)) throw new Error('der');
  return ms;
}

interface Cert {
  /** The bytes that were signed — `tbsCertificate`, tag and length included. */
  tbs: Uint8Array;
  /** The OID of the algorithm the PARENT used to sign this certificate. */
  sigAlg: string;
  /** This certificate's signature (an ECDSA `SEQUENCE {r, s}`). */
  sig: Uint8Array;
  /** This certificate's SubjectPublicKeyInfo, DER — what the pin compares and what WebCrypto imports. */
  spki: Uint8Array;
  curve: 'P-256' | 'P-384';
  notBefore: number;
  notAfter: number;
}

function parseCert(bytes: Uint8Array): Cert {
  const root = der(bytes, 0);
  const [tbsEl, algEl, sigEl] = derChildren(bytes, root);
  if (!tbsEl || !algEl || !sigEl || sigEl.tag !== 0x03) throw new Error('der');
  const parts = derChildren(bytes, tbsEl);
  // TBSCertificate ::= [0] version?, serial, signature, issuer, validity, subject, spki, …
  const i = parts[0] && parts[0].tag === 0xa0 ? 1 : 0;
  const validity = derChildren(bytes, parts[i + 3]);
  const spkiEl = parts[i + 5];
  if (!spkiEl || validity.length < 2) throw new Error('der');
  const alg = derChildren(bytes, derChildren(bytes, spkiEl)[0]);
  const curveOid = alg.length > 1 ? oidHex(bytes, alg[1]) : '';
  if (curveOid !== OID_P256 && curveOid !== OID_P384) throw new Error('der');
  return {
    tbs: bytes.slice(tbsEl.start, tbsEl.end),
    sigAlg: oidHex(bytes, derChildren(bytes, algEl)[0]),
    // A BIT STRING's first content byte counts its unused bits; for a signature it is always zero.
    sig: bytes.slice(sigEl.body + 1, sigEl.bodyEnd),
    spki: bytes.slice(spkiEl.start, spkiEl.end),
    curve: curveOid === OID_P256 ? 'P-256' : 'P-384',
    notBefore: derTime(bytes, validity[0]),
    notAfter: derTime(bytes, validity[1]),
  };
}

/** An X.509 ECDSA signature is `SEQUENCE {r, s}`; WebCrypto wants the two numbers, fixed width. */
function rawSignature(bytes: Uint8Array, size: number): Uint8Array {
  const seq = der(bytes, 0);
  const [r, s] = derChildren(bytes, seq);
  if (!r || !s) throw new Error('der');
  const out = new Uint8Array(size * 2);
  for (const [n, at] of [
    [r, 0],
    [s, size],
  ] as Array<[Der, number]>) {
    let from = n.body;
    while (from < n.bodyEnd && bytes[from] === 0) from++; // strip DER's sign padding
    const len = n.bodyEnd - from;
    if (len > size) throw new Error('der');
    out.set(bytes.slice(from, n.bodyEnd), at + size - len);
  }
  return out;
}

async function ecdsaVerify(signer: Cert, hash: 'SHA-256' | 'SHA-384', sig: Uint8Array, data: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey('spki', signer.spki, { name: 'ECDSA', namedCurve: signer.curve }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash }, key, sig, data);
}

/**
 * ⛔ THE WHOLE OF "APPLE SAID THIS" — see the file header for the five things this refuses.
 * Returns the JWS payload, or null. Never a reason: a caller that told them apart would be an
 * oracle, and every refusal here means the same thing anyway.
 */
export async function verifyAppleJws(jws: string, nowMs: number): Promise<Record<string, unknown> | null> {
  const parts = jws.split('.');
  if (parts.length !== 3 || jws.length > 131_072) return null;
  try {
    const head = JSON.parse(text(bytesOfB64Url(parts[0]))) as { alg?: string; x5c?: unknown };
    if (head.alg !== 'ES256') return null;
    if (!Array.isArray(head.x5c) || head.x5c.length < 2 || head.x5c.length > 5) return null;
    const chain = head.x5c.map((c) => parseCert(bytesOfB64(String(c))));

    // 1 · every certificate is inside its own window, now.
    for (const c of chain) if (nowMs < c.notBefore || nowMs > c.notAfter) return null;

    // 2 · the chain ENDS at Apple's root — pinned by key, not by name.
    if (hexOf(chain[chain.length - 1].spki) !== APPLE_ROOT_G3_SPKI) return null;

    // 3 · each certificate is signed by the next one up.
    for (let i = 0; i < chain.length - 1; i++) {
      const child = chain[i];
      const parent = chain[i + 1];
      const hash = child.sigAlg === OID_ECDSA_SHA256 ? 'SHA-256' : child.sigAlg === OID_ECDSA_SHA384 ? 'SHA-384' : null;
      if (!hash) return null; // Apple's chain is EC end to end; anything else is not Apple's.
      const raw = rawSignature(child.sig, parent.curve === 'P-256' ? 32 : 48);
      if (!(await ecdsaVerify(parent, hash, raw, child.tbs))) return null;
    }

    // 4 · and the body verifies under the leaf. (ES256's signature is already raw r‖s.)
    const sig = bytesOfB64Url(parts[2]);
    if (sig.length !== 64) return null;
    if (!(await ecdsaVerify(chain[0], 'SHA-256', sig, utf8(`${parts[0]}.${parts[1]}`)))) return null;

    const payload: unknown = JSON.parse(text(bytesOfB64Url(parts[1])));
    return isObj(payload) ? payload : null;
  } catch {
    return null;
  }
}

// ════════════════════════════ what a verified transaction says ════════════════════════════

/** The plan states this worker stores. `over_limit` is DERIVED at read (used > seats), never stored. */
export type PlanState = 'active' | 'grace' | 'expired';

export interface VerifiedPlan {
  productId: string;
  originalTransactionId: string;
  state: PlanState;
  /** When Apple says the paid period ends (ms), or null when nothing is running. */
  renewsAtMs: number | null;
  /** The environment Apple answered from — 'Production' | 'Sandbox' | '' (test injection). */
  environment: string;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const msOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null);

/**
 * Apple's `status` for a subscription (App Store Server API):
 *   1 active · 2 expired · 3 in billing retry · 4 in billing grace period · 5 revoked.
 *
 * ⛔ GRACE KEEPS THE SEATS AND BILLING RETRY DOES NOT. In grace, Apple still grants the athlete
 * access while it retries the card — so a coach mid-grace keeps his roster's seats. Billing retry
 * WITHOUT grace is a subscription that has already lapsed, and a lapsed plan cannot hold 30 seats.
 */
function planStateOf(status: number, tx: Record<string, unknown>, nowMs: number): PlanState {
  if (msOf(tx.revocationDate) !== null) return 'expired';
  if (status === 4) return 'grace';
  if (status === 1) {
    const ends = msOf(tx.expiresDate);
    return ends === null || ends > nowMs ? 'active' : 'expired';
  }
  return 'expired';
}

/** The ES256 JWT Apple's API wants — signed here, never stored, twenty minutes long. */
async function apiToken(env: AppleBillingEnv, nowMs: number): Promise<string> {
  const pem = String(env.APPLE_IAP_PRIVATE_KEY ?? '')
    .replace(/-----[A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', bytesOfB64(pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64urlOf(utf8(JSON.stringify({ alg: 'ES256', kid: env.APPLE_IAP_KEY_ID, typ: 'JWT' })));
  const body = b64urlOf(
    utf8(
      JSON.stringify({
        iss: env.APPLE_IAP_ISSUER_ID,
        iat: Math.floor(nowMs / 1000),
        exp: Math.floor((nowMs + API_TOKEN_TTL_MS) / 1000),
        aud: 'appstoreconnect-v1',
        bid: BILLING_BUNDLE_ID,
      }),
    ),
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${body}`));
  return `${header}.${body}.${b64urlOf(new Uint8Array(sig))}`;
}

const hostsFor = (env: AppleBillingEnv): string[] => {
  const e = String(env.APPLE_IAP_ENVIRONMENT ?? '').toLowerCase();
  if (e === 'sandbox') return [STOREKIT_SANDBOX];
  if (e === 'production') return [STOREKIT_PRODUCTION];
  // Apple's own guidance: ask production, and a 404 there means "try sandbox", not "no such thing".
  return [STOREKIT_PRODUCTION, STOREKIT_SANDBOX];
};

/**
 * ⛔ ASK APPLE WHAT THIS TRANSACTION IS — the client's word is never the answer.
 *
 * Returns the verified plan, or null when Apple knows no such transaction (in either environment).
 * THROWS when Apple could not be reached or answered something other than 200/404 — the caller
 * answers 503, because "we could not check" must never read as "it is not valid".
 */
export async function appleSubscription(env: AppleBillingEnv, transactionId: string, nowMs: number): Promise<VerifiedPlan | null> {
  const token = await apiToken(env, nowMs);
  for (const host of hostsFor(env)) {
    const res = await fetch(`${host}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    // A 404 in production is Apple saying "not here" — for a sandbox build that is the expected
    // answer, and the next host is where it lives. A 404 in both is a transaction that is nobody's.
    if (res.status === 404) continue;
    if (!res.ok) throw new Error('appstore_api');
    const body = (await res.json()) as {
      bundleId?: string;
      environment?: string;
      data?: Array<{ lastTransactions?: Array<{ originalTransactionId?: string; status?: number; signedTransactionInfo?: string }> }>;
    };
    if (body.bundleId && body.bundleId !== BILLING_BUNDLE_ID) return null;
    for (const group of body.data ?? []) {
      for (const last of group.lastTransactions ?? []) {
        const tx = await verifyAppleJws(String(last.signedTransactionInfo ?? ''), nowMs);
        // ⛔ THE ENVELOPE IS NOT THE EVIDENCE. Everything below is read off the SIGNED transaction:
        // the bundle id, the product and the original transaction id all come from inside the JWS.
        if (!tx || str(tx.bundleId, 64) !== BILLING_BUNDLE_ID) continue;
        const productId = str(tx.productId, 64);
        const original = str(tx.originalTransactionId, 64);
        if (!isCoachProduct(productId) || !original) continue;
        return {
          productId,
          originalTransactionId: original,
          state: planStateOf(Number(last.status ?? 0), tx, nowMs),
          renewsAtMs: msOf(tx.expiresDate),
          environment: str(body.environment, 16),
        };
      }
    }
    return null;
  }
  return null;
}

/**
 * What a VERIFIED App Store Server Notification means for a coach's seats. `payload` is the outer
 * notification's already-verified body; `tx` is its already-verified `signedTransactionInfo`.
 *
 * ⛔ NOTHING HERE TOUCHES A LINK OR A WEEK. It names a plan state and a seat count, and the caller
 * writes those two columns — seats may drop BELOW the coach's live links, and that is the design
 * (COACH_TRACK_V1 §6, `over_limit`): a lapsed plan takes the invite button, never an athlete.
 */
export function notificationToPlan(
  notificationType: string,
  subtype: string,
  tx: Record<string, unknown>,
  nowMs: number,
): VerifiedPlan | null {
  const productId = str(tx.productId, 64);
  const originalTransactionId = str(tx.originalTransactionId, 64);
  if (!isCoachProduct(productId) || !originalTransactionId) return null;
  const renewsAtMs = msOf(tx.expiresDate);
  const plan = (state: PlanState): VerifiedPlan => ({
    productId,
    originalTransactionId,
    state,
    renewsAtMs: state === 'expired' ? null : renewsAtMs,
    environment: str(tx.environment, 16),
  });
  if (msOf(tx.revocationDate) !== null) return plan('expired');
  switch (notificationType) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
    case 'OFFER_REDEEMED':
    case 'DID_CHANGE_RENEWAL_PREF':
      return plan(renewsAtMs !== null && renewsAtMs <= nowMs ? 'expired' : 'active');
    // Auto-renew switched off does NOT take a seat: the month he paid for is his. The EXPIRED that
    // follows, whenever it follows, is what drops the limit.
    case 'DID_CHANGE_RENEWAL_STATUS':
      return plan(renewsAtMs !== null && renewsAtMs <= nowMs ? 'expired' : 'active');
    case 'DID_FAIL_TO_RENEW':
      return plan(subtype === 'GRACE_PERIOD' ? 'grace' : 'expired');
    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
    case 'REFUND':
    case 'REVOKE':
      return plan('expired');
    default:
      return null; // CONSUMPTION_REQUEST, PRICE_INCREASE, TEST… — nothing to do with seats.
  }
}

// ════════════════════════════ ⛔ THE TEST GATE (local driver only — see the file header) ════════════════════════════

/**
 * Both locks at once: the var that no deployment has, and a loopback hostname. `url.hostname` is the
 * name this worker was ROUTED on — a deployed worker answers on its own hostname, so a caller cannot
 * rename it by sending a `Host:` header.
 */
export function testGateOpen(env: AppleBillingEnv, url: URL): boolean {
  const key = env.BILLING_TEST;
  if (typeof key !== 'string' || key.length < 16) return false;
  return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]' || url.hostname === '::1';
}

/** HMAC-SHA256(BILLING_TEST, message), hex, compared in constant time. */
export async function testSignatureOk(env: AppleBillingEnv, message: string, given: string | null): Promise<boolean> {
  const key = env.BILLING_TEST;
  if (typeof key !== 'string' || key.length < 16) return false;
  if (typeof given !== 'string' || given.length !== 64) return false;
  const mac = await crypto.subtle.importKey('raw', utf8(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = hexOf(new Uint8Array(await crypto.subtle.sign('HMAC', mac, utf8(message))));
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= want.charCodeAt(i) ^ given.toLowerCase().charCodeAt(i);
  return diff === 0;
}

/** A plan as the local driver injects it, once both locks above have opened. */
export function readTestPlan(raw: unknown, nowMs: number): VerifiedPlan | null {
  if (!isObj(raw)) return null;
  const productId = str(raw.productId, 64);
  const originalTransactionId = str(raw.originalTransactionId, 64);
  const state = raw.state;
  if (!isCoachProduct(productId) || !originalTransactionId) return null;
  if (state !== 'active' && state !== 'grace' && state !== 'expired') return null;
  const renewsAtMs = msOf(raw.renewsAtMs);
  return {
    productId,
    originalTransactionId,
    state,
    renewsAtMs: state === 'expired' ? null : (renewsAtMs ?? nowMs + 30 * 24 * 60 * 60 * 1000),
    environment: 'LocalTesting',
  };
}
