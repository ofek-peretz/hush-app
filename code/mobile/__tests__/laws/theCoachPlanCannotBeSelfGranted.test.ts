/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH PLAN CANNOT BE SELF-GRANTED — the server half of "the coach pays". (2026-09-18)
 *
 * ⛔ FOUNDER RULING 1 (2026-09-17): *"The coach pays."* Free up to two linked trainees, then Coach
 * 10 / 30 / 100. `aCoachWithASeatFreeIsNeverSoldOne` pins the PHONE's half — that nothing sells a
 * seat to a coach who has one, and that the screen never writes a seat count. This file pins the
 * half that money actually turns on, in `server/hush-identity`:
 *
 *   1 · THE CLIENT CAN NEVER RAISE ITS OWN SEATS. `POST /coach/plan` carries a product id and a
 *       transaction id; the seat count comes from the product APPLE named in a signed transaction.
 *   2 · THE TEST-INJECTION PATH CANNOT BE REACHED IN PRODUCTION. Two locks — a var no deployment
 *       declares, and a loopback hostname — and an HMAC on top of both.
 *   3 · SEAT LOSS NEVER DELETES A LINK OR A WEEK. Seats may drop BELOW the live links; the coach
 *       goes over-limit and loses the invite button, and his athletes lose nothing at all.
 *   4 · A REFUNDED OR EXPIRED PLAN CANNOT KEEP SEATS.
 *
 * ── HOW IT READS THE SERVER ─────────────────────────────────────────────────────────────────────
 * The same two ways `theCoachServerKeepsItsLaws` does: the source as TEXT, and the pure functions
 * TRANSPILED AND RUN — including `verifyAppleJws` against a real certificate chain, because a law
 * that only grepped for the word "verify" would pass on a function that returned the payload.
 *
 * The wire itself is driven against a real local D1 by `server/hush-identity/driveCoach.mjs` § 13.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const readRepo = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n');

const coachSrc = readRepo('server/hush-identity/src/coach.ts');
const billingSrc = readRepo('server/hush-identity/src/appleBilling.ts');
const indexSrc = readRepo('server/hush-identity/src/index.ts');
const toml = readRepo('server/hush-identity/wrangler.toml');
const migration1 = readRepo('server/hush-identity/migrations/0001_coach.sql');
const migration2 = readRepo('server/hush-identity/migrations/0002_coach_plan.sql');
const driver = readRepo('server/hush-identity/driveCoach.mjs');
const clientSrc = readRepo('code/mobile/src/platform/coachTrackClient.ts');

/** A worker module, compiled and loaded — the functions as they will actually run. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (source: string): any => {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
};

const billing = load(billingSrc);
const coach = load(coachSrc);

/**
 * The source with its prose taken out. These files EXPLAIN themselves at length — "see
 * `appleBilling.testGateOpen`" is a sentence, not a call — so a law that counts call sites has to
 * count them in the code. Block comments and whole-line `//` comments go; nothing else does.
 */
const codeOf = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** The route bodies this law reads, cut at their own edges. */
const planRoute = coachSrc.slice(coachSrc.indexOf("path === '/coach/plan'"), coachSrc.indexOf("path === '/coach/invite'"));
const applier = coachSrc.slice(
  coachSrc.indexOf('export async function coachApplePlanEvent'),
  coachSrc.indexOf('// ════════════════════════════ LAW 8'),
);
const notificationRoute = indexSrc.slice(
  indexSrc.indexOf("path === '/appstore/notifications'"),
  indexSrc.indexOf("path === '/auth/apple'"),
);

const T10 = 'hush.coach.10.month';
const T100 = 'hush.coach.100.month';
const NOW = Date.UTC(2027, 0, 1);
const row = (extra: Record<string, unknown> = {}) => ({
  name: 'Rina',
  seat_limit: 10,
  plan_product_id: T10,
  plan_txn: 'T1',
  plan_state: 'active',
  plan_renews_at: NOW + 86_400_000,
  plan_event_at: NOW,
  ...extra,
});

describe('⛔ 1 — the client can never raise its own seats', () => {
  it('the claim reads three fields off the body, and a seat count is not one of them', () => {
    expect(planRoute.match(/body\.\w+/g)?.sort()).toEqual(['body.productId', 'body.test', 'body.transactionId']);
    expect(planRoute).not.toMatch(/body\.(seats|seatLimit|seat_limit|limit|plan)\b/);
  });

  it('⛔ the seat number comes from the product APPLE signed, never from the request', () => {
    expect(planRoute).toContain('const tierSeats = billing.seats(verified.productId);');
    expect(planRoute).toContain("if (verified.productId !== claimed) return json(409, { error: 'plan_mismatch' });");
    // `claimed` is only ever compared — it never reaches a seat count or a stored column.
    expect(planRoute).not.toMatch(/billing\.seats\(claimed\)\s*\|\||seats:\s*claimed|seat_limit\s*=\s*claimed/);
    expect(planRoute.match(/billing\.seats\(claimed\)/g)?.length).toBe(1); // the 400 shape check only
  });

  it('⛔ only two statements in the whole worker move `seat_limit`, and both name a verified tier', () => {
    const writes = coachSrc.split('.prepare(').slice(1).filter((q) => /seat_limit\s*=\s*\?/.test(q.slice(0, q.indexOf('`', 1) + 1) + q.slice(0, 400)));
    expect(writes.length).toBe(2);
    expect(planRoute).toContain('UPDATE coaches SET seat_limit = ?, plan_product_id = ?, plan_txn = ?, plan_state = ?, plan_renews_at = ?, plan_event_at = ?');
    expect(applier).toContain('UPDATE coaches SET seat_limit = ?, plan_product_id = ?, plan_state = ?, plan_renews_at = ?, plan_event_at = ?');
    // and nothing anywhere writes it from a request body
    expect(coachSrc).not.toMatch(/seat_limit\s*=\s*(body|raw|claim)/);
  });

  it('⛔ one purchase cannot raise two rosters — read AND index', () => {
    expect(planRoute).toContain("if (owner && owner.sub !== sub) return json(409, { error: 'plan_claimed' });");
    expect(migration2).toContain('CREATE UNIQUE INDEX coaches_plan_txn ON coaches(plan_txn) WHERE plan_txn IS NOT NULL;');
  });

  it('the phone sends exactly what Apple issued, and reads its seats back off the answer', () => {
    const claim = clientSrc.slice(clientSrc.indexOf('export function coachClaimPlan'), clientSrc.indexOf('/* ── the coach'));
    expect(claim).toContain("return req('POST', '/coach/plan', claim);");
    expect(claim).not.toMatch(/seats|COACH_PLAN_SEATS/);
  });

  it('a coach at his limit mints no invite — the same number `/coach/join` enforces', () => {
    expect(coachSrc).toContain("if ((await seatsUsed(db, sub)) >= seatsOf(env, coach)) return json(409, { error: 'seats_full' });");
    expect(coachSrc).toContain('const seats = seatsOf(env, coach);');
    expect(coachSrc).toContain("const seatsOf = (env: CoachEnv, coach: CoachRow): number => coach.seat_limit ?? freeSeats(env);");
  });
});

describe('⛔ 2 — the test-injection path cannot be reached in production', () => {
  const url = (host: string) => new URL(`https://${host}/coach/plan`);
  const KEY = 'drive-coach-local-billing-key';

  it('⛔ `BILLING_TEST` is declared in no deployment, and has no fallback in the source', () => {
    expect(toml).not.toMatch(/^\s*BILLING_TEST\s*[:=]/m);
    expect(toml).toMatch(/BILLING_TEST` IS NOT LISTED HERE/);
    for (const src of [billingSrc, indexSrc, coachSrc]) {
      expect(src).not.toMatch(/BILLING_TEST\s*(\?\?|\|\|)\s*['"`]/);
    }
    // it is passed on a command line, by the driver, and nowhere else
    expect(driver).toContain('--var BILLING_TEST:drive-coach-local-billing-key');
    expect(toml).not.toContain('wrangler secret put BILLING_TEST');
  });

  it('⛔ the gate wants BOTH the var and a loopback hostname', () => {
    expect(billing.testGateOpen({}, url('127.0.0.1'))).toBe(false);
    expect(billing.testGateOpen({ BILLING_TEST: KEY }, url('hush-identity.hush-app.workers.dev'))).toBe(false);
    expect(billing.testGateOpen({ BILLING_TEST: KEY }, url('getferrox.com'))).toBe(false);
    expect(billing.testGateOpen({ BILLING_TEST: 'short' }, url('127.0.0.1'))).toBe(false);
    expect(billing.testGateOpen({ BILLING_TEST: KEY }, url('127.0.0.1'))).toBe(true);
    expect(billing.testGateOpen({ BILLING_TEST: KEY }, url('localhost'))).toBe(true);
  });

  it('⛔ and an HMAC on top of both', async () => {
    const env = { BILLING_TEST: KEY };
    expect(await billing.testSignatureOk(env, 'plan|a|b|c', null)).toBe(false);
    expect(await billing.testSignatureOk(env, 'plan|a|b|c', 'f'.repeat(64))).toBe(false);
    expect(await billing.testSignatureOk({}, 'plan|a|b|c', 'f'.repeat(64))).toBe(false);
  });

  it('⛔ every door into an injected plan passes through both checks first', () => {
    // the claim, in `index.ts`'s gate object
    expect(indexSrc).toMatch(
      /test: async \(raw, message, signature\) => \{\s*if \(!testGateOpen\(env, url\)\) return null;\s*if \(!\(await testSignatureOk\(env, message, signature\)\)\) return null;\s*return readTestPlan\(raw, Date\.now\(\)\);/,
    );
    // the notification
    expect(notificationRoute).toContain(
      "const injected = testGateOpen(env, url) && (await testSignatureOk(env, raw, req.headers.get('x-hush-billing-test')));",
    );
    // `readTestPlan` is called from exactly one place, and that place is the gated one
    expect(indexSrc.match(/readTestPlan\(/g)?.length).toBe(1);
    // and `coach.ts` never reaches for a test path of its own — it only hands the body to the gate
    expect(codeOf(coachSrc)).not.toMatch(/testGateOpen\(|testSignatureOk\(|readTestPlan\(|BILLING_TEST/);
    expect(planRoute).toContain("let verified = await billing.test(body.test, message, req.headers.get('x-hush-billing-test'));");
  });

  it('with no Apple key and no open gate, the claim is a 503 that says nothing about the body', () => {
    expect(planRoute).toContain("if (!billing.configured()) return json(503, { error: 'billing_not_configured' });");
    expect(billing.appleBillingConfigured({})).toBe(false);
    expect(billing.appleBillingConfigured({ APPLE_IAP_KEY_ID: 'k', APPLE_IAP_ISSUER_ID: 'i' })).toBe(false);
    expect(billing.appleBillingConfigured({ APPLE_IAP_KEY_ID: 'k', APPLE_IAP_ISSUER_ID: 'i', APPLE_IAP_PRIVATE_KEY: 'p' })).toBe(true);
    // nothing on this path logs, and nothing on it echoes the transaction id back
    expect(planRoute).not.toMatch(/console\.|\.log\(/);
  });
});

describe('⛔ 3 — seat loss never deletes a link or a week', () => {
  it('⛔ the applier touches ONE table, and it is `coaches`', () => {
    expect(applier).not.toMatch(/DELETE\s+FROM/i);
    expect(applier).not.toMatch(/coach_links|coach_weeks|coach_sessions|coach_cardio|coach_invites/);
    expect(applier).not.toContain('ended_at');
    expect(applier.match(/\.prepare\(/g)?.length).toBe(2); // the read, and the one UPDATE
  });

  it('⛔ the notification route cannot reach the cascade or the purge', () => {
    expect(notificationRoute.match(/coachApplePlanEvent/g)?.length).toBe(1);
    expect(notificationRoute).not.toMatch(/coachAccountDeleted|purgeCoach|handleCoach|COACH_DB/);
  });

  it('over-limit is DERIVED, never stored — and it is the whole of what a lapse costs', () => {
    // three athletes, two seats: the plan says over_limit and the seats say two
    expect(coach.planOf(row({ seat_limit: null, plan_state: 'expired', plan_renews_at: null }), 2, 3)).toEqual({
      productId: T10,
      seats: 2,
      renewsAt: null,
      state: 'over_limit',
    });
    // the same shape from a DOWNGRADE, with the plan perfectly active
    expect(coach.planOf(row(), 10, 30)?.state).toBe('over_limit');
    expect(coach.planOf(row(), 10, 3)?.state).toBe('active');
    // 'over_limit' is not a value anything can write — it exists in one expression, at read time
    expect(coachSrc).toContain("state: used > seats ? 'over_limit' : state,");
    expect(codeOf(coachSrc).match(/'over_limit'/g)?.length).toBe(2); // the union type, and that line
    expect(codeOf(coachSrc)).not.toMatch(/plan_state\s*=\s*'over_limit'|bind\([^)]*'over_limit'/);
    expect(codeOf(billingSrc)).not.toContain("'over_limit'"); // never a stored PlanState
  });

  it('a coach who never bought anything has no plan — not an expired one', () => {
    expect(coach.planOf(row({ plan_product_id: null, plan_state: null, plan_txn: null }), 2, 0)).toBeNull();
    expect(coach.planOf(row({ plan_state: 'nonsense' }), 2, 0)).toBeNull();
  });
});

describe('⛔ 4 — a refunded or expired plan cannot keep seats', () => {
  const tx = { productId: T10, originalTransactionId: 'T1', expiresDate: NOW + 86_400_000 };

  it('⛔ every way a subscription can end drops the tier, and carries no renewal date', () => {
    for (const type of ['EXPIRED', 'REFUND', 'REVOKE', 'GRACE_PERIOD_EXPIRED']) {
      const plan = billing.notificationToPlan(type, '', tx, NOW);
      expect({ type, state: plan.state, renewsAtMs: plan.renewsAtMs }).toEqual({ type, state: 'expired', renewsAtMs: null });
    }
    // a revoked transaction is over whatever the notification is called
    expect(billing.notificationToPlan('DID_RENEW', '', { ...tx, revocationDate: NOW }, NOW).state).toBe('expired');
    // billing retry WITHOUT grace is a lapse; grace keeps the seats while Apple retries the card
    expect(billing.notificationToPlan('DID_FAIL_TO_RENEW', '', tx, NOW).state).toBe('expired');
    expect(billing.notificationToPlan('DID_FAIL_TO_RENEW', 'GRACE_PERIOD', tx, NOW).state).toBe('grace');
    // auto-renew switched off does NOT take the month he paid for
    expect(billing.notificationToPlan('DID_CHANGE_RENEWAL_STATUS', 'AUTO_RENEW_DISABLED', tx, NOW).state).toBe('active');
  });

  it('⛔ `expired` writes NULL into the seat column — the free tier, and nothing else moves', () => {
    expect(applier).toContain("plan.state === 'expired' ? null : event.seats,");
    expect(applier).toMatch(/plan_event_at IS NULL OR plan_event_at <= \?/); // a replayed renewal is ignored
    expect(applier).toContain("if (row.plan_event_at != null && row.plan_event_at > event.at) return 'stale';");
  });

  it('⛔ a lapsed receipt cannot be claimed back into seats', () => {
    expect(planRoute).toContain("if (verified.state === 'expired') return json(409, { error: 'plan_inactive' });");
  });

  it('nothing but the three coach tiers is a tier at all', () => {
    expect(billing.COACH_TIER_SEATS).toEqual({ [T10]: 10, 'hush.coach.30.month': 30, [T100]: 100 });
    expect(billing.isCoachProduct('hush.pro.annual')).toBe(false);
    expect(billing.notificationToPlan('DID_RENEW', '', { ...tx, productId: 'hush.pro.annual' }, NOW)).toBeNull();
    expect(billing.readTestPlan({ productId: 'hush.pro.annual', originalTransactionId: 'x', state: 'active' }, NOW)).toBeNull();
    expect(billing.readTestPlan({ productId: T10, originalTransactionId: 'x', state: 'whatever' }, NOW)).toBeNull();
  });
});

/*
 * ⛔ 5 — "VERIFIED" MEANS A CHAIN TO APPLE'S ROOT, AND THIS PROVES IT WALKS.
 *
 * The fixture is a real three-certificate chain (P-384 root → P-256 intermediate → P-256 leaf,
 * signed SHA-384 then SHA-256, exactly Apple's shape) made with OpenSSL, and a JWS the leaf signed.
 * No private key is in the repo: the certificates are public and the signature is already made.
 * `AT` is a fixed instant inside all three windows, so this never becomes a test that expires.
 *
 * It proves the two halves that matter: the SHIPPING pin refuses this otherwise-perfect chain
 * (because it does not end at Apple), and with the pin moved to the fixture's own root the whole
 * walk succeeds — so the walk is real, and the pin is what is holding it shut.
 */
describe("⛔ 5 — Apple's signature is the whole of what we believe", () => {
  const AT = NOW;
  const FIXTURE_ROOT_SPKI = '3076301006072a8648ce3d020106052b810400220362000488e63580c0402edcbdb60224f7d969b827bdd8f528a9202676dde0fdd407dd51383d1b6b9cfa3b606c0b020683fef5654aa254997e09937456edadc0e5f642fe2ad60147d21f4c57484f4d62b2980bb07fc130c967cbb6214d1e51fe43f6b270';
  const FIXTURE_JWS = 'eyJhbGciOiJFUzI1NiIsIng1YyI6WyJNSUlCYXpDQ0FSS2dBd0lCQWdJVU16eWxIMHhBazJOZStrUGpsdVI4Qll0UTM5OHdDZ1lJS29aSXpqMEVBd0l3RkRFU01CQUdBMVVFQXd3SlZHVnpkQ0JYVjBSU01CNFhEVEkyTURreE56SXlOVGN3TlZvWERUTXlNRE13T1RJeU5UY3dOVm93RkRFU01CQUdBMVVFQXd3SlZHVnpkQ0JNWldGbU1Ga3dFd1lIS29aSXpqMENBUVlJS29aSXpqMERBUWNEUWdBRWl3V1NGckZjc0J0N05VYjZKY3FQdG00ZXljbzY0Ri9tempXeTM1MHNjQlE1dHg4YUtvYjFaekJLVXRLQjhUR1l1UEVveUhlYTVzNzd5KzBXaStuQS9xTkNNRUF3SFFZRFZSME9CQllFRkYvZHlkMjBHL2NhREk3MEc3WHEwbU1SUmdOMU1COEdBMVVkSXdRWU1CYUFGTGltV1Zndnl1NEFiQXBLVVdVQjFwS3ZUb09FTUFvR0NDcUdTTTQ5QkFNQ0EwY0FNRVFDSUQxaU5lNlZ2eCtzOXBOaFUwWEwwYi9lUmxNT0g4cy84dzlZMTdtTWlTSXlBaUFpaGtIS2NxUlBZNUZIR1RRVjhIaGVQZnhWZnJHd3JjcFM4aDh4N1pRbXBRPT0iLCJNSUlCb0RDQ0FTYWdBd0lCQWdJVWZxVTFSRVZyb3pGRExGd2s0aDFrem11WmRLNHdDZ1lJS29aSXpqMEVBd013RnpFVk1CTUdBMVVFQXd3TVZHVnpkQ0JTYjI5MElFY3pNQjRYRFRJMk1Ea3hOekl5TlRjd05Wb1hEVE0wTVRJd05ESXlOVGN3TlZvd0ZERVNNQkFHQTFVRUF3d0pWR1Z6ZENCWFYwUlNNRmt3RXdZSEtvWkl6ajBDQVFZSUtvWkl6ajBEQVFjRFFnQUVQdEdrZ1dlUFdlM013eHRZSGQ2RTN1MHRuRnRLd1pGeDFMbWJGMkN5dDBiVFJYTVlFdk1LYjZWQjBzUUU2V0FySDVVSVMvNVJIazFrYk5LanhXUzU3cU5UTUZFd0R3WURWUjBUQVFIL0JBVXdBd0VCL3pBZEJnTlZIUTRFRmdRVXVLWlpXQy9LN2dCc0NrcFJaUUhXa3E5T2c0UXdId1lEVlIwakJCZ3dGb0FVMTlncStKMUErTmxpa1BaYlJVZ0U5cWR3Yitvd0NnWUlLb1pJemowRUF3TURhQUF3WlFJd1cvNVpXK1lyMVowT1NjR29veXlWd2RxRjI5NG1WT0FKVGp6Z1gyRW1VelExWlFqdFdNaUErSWxTN0ZFQmJlOXNBakVBOGJRcXZsUkZZYXZsZmpIVS9qMi91VTVUbW5jR3F5WmVtSEFJQjBpUW1aa2J0SUhlcVJCM1pndGZod3BYNk5ydiIsIk1JSUJ3RENDQVVhZ0F3SUJBZ0lVUXJZY1plTTNVQW9pVGdISjdIU0loQkkvSFI4d0NnWUlLb1pJemowRUF3TXdGekVWTUJNR0ExVUVBd3dNVkdWemRDQlNiMjkwSUVjek1CNFhEVEkyTURreE56SXlOVFkxTjFvWERUTTJNRGt4TkRJeU5UWTFOMW93RnpFVk1CTUdBMVVFQXd3TVZHVnpkQ0JTYjI5MElFY3pNSFl3RUFZSEtvWkl6ajBDQVFZRks0RUVBQ0lEWWdBRWlPWTFnTUJBTHR5OXRnSWs5OWxwdUNlOTJQVW9xU0FtZHQzZy9kUUgzVkU0UFJ0cm5QbzdZR3dMQWdhRC92VmxTcUpVbVg0SmszUlc3YTNBNWZaQy9pcldBVWZTSDB4WFNFOU5ZcktZQzdCL3dUREpaOHUySVUwZVVmNUQ5ckp3bzFNd1VUQWRCZ05WSFE0RUZnUVUxOWdxK0oxQStObGlrUFpiUlVnRTlxZHdiK293SHdZRFZSMGpCQmd3Rm9BVTE5Z3ErSjFBK05saWtQWmJSVWdFOXFkd2Irb3dEd1lEVlIwVEFRSC9CQVV3QXdFQi96QUtCZ2dxaGtqT1BRUURBd05vQURCbEFqRUFwdEhub0M1Z3BWOUVITExCZFYrTEViaFlvQmxJQjlTNldFbGk2eTgyUUtaSVlVd3o2QS9qeGRmaHNXSmRXb01YQWpBeWRWKzBQZCtpK0JkTFMzMTdQQ1NTb3F4aDhPR3FDSXRTSkJCcEVvZE51NWtyUE41ZTF0WDZHVE84OGpWeFIxbz0iXX0.eyJidW5kbGVJZCI6ImNvbS5odXNoZml0bmVzcy5hcHAiLCJwcm9kdWN0SWQiOiJodXNoLmNvYWNoLjMwLm1vbnRoIiwib3JpZ2luYWxUcmFuc2FjdGlvbklkIjoiMjAwMDAwMDkwMDAwMDAwMSIsImV4cGlyZXNEYXRlIjo0MTAyNDQ0ODAwMDAwfQ.9L_BfKXgkZpIim_i6lrOyGdonxTx1E2zx_n2b1cMW2jX_8llTlcyUw6KRYZNGmtv34cVM58sGhket-ErPEmwQA';
  const repinned = load(billingSrc.replace(/const APPLE_ROOT_G3_SPKI =[\s\S]*?';/, `const APPLE_ROOT_G3_SPKI = '${FIXTURE_ROOT_SPKI}';`));

  it('⛔ the root is pinned in the source — not fetched, not configured, not named', () => {
    expect(billingSrc).toMatch(/^const APPLE_ROOT_G3_SPKI =/m);
    expect(billingSrc).not.toMatch(/env\.[A-Z_]*ROOT|APPLE_ROOT_G3_SPKI\s*=\s*await|fetch\([^)]*certificateauthority/);
    // the pin is Apple Root CA - G3's public key; the file records where it came from
    expect(billingSrc).toContain('63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179');
    expect(billingSrc.replace(/[\s'+]/g, '')).toContain('3076301006072a8648ce3d020106052b8104002203620004');
  });

  it('⛔ a perfectly-signed chain that does not end at Apple is refused', async () => {
    expect(await billing.verifyAppleJws(FIXTURE_JWS, AT)).toBeNull();
  });

  it('…and with the pin moved to that chain’s own root, the walk verifies', async () => {
    const payload = await repinned.verifyAppleJws(FIXTURE_JWS, AT);
    expect(payload).not.toBeNull();
    expect(payload.bundleId).toBe('com.hushfitness.app');
    expect(payload.productId).toBe('hush.coach.30.month');
  });

  it('⛔ a payload edited after signing, an out-of-date certificate, a missing link, `alg: none`', async () => {
    const [h, b, s] = FIXTURE_JWS.split('.');
    const edited = Buffer.from(JSON.stringify({ productId: T100 })).toString('base64url');
    expect(await repinned.verifyAppleJws(`${h}.${edited}.${s}`, AT)).toBeNull();
    expect(await repinned.verifyAppleJws(FIXTURE_JWS, AT + 40 * 365 * 86_400_000)).toBeNull();
    expect(await repinned.verifyAppleJws(FIXTURE_JWS, AT - 40 * 365 * 86_400_000)).toBeNull();
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    const noAlg = Buffer.from(JSON.stringify({ ...header, alg: 'none' })).toString('base64url');
    expect(await repinned.verifyAppleJws(`${noAlg}.${b}.${s}`, AT)).toBeNull();
    const shortChain = Buffer.from(JSON.stringify({ ...header, x5c: [header.x5c[0], header.x5c[2]] })).toString('base64url');
    expect(await repinned.verifyAppleJws(`${shortChain}.${b}.${s}`, AT)).toBeNull();
    for (const junk of ['', 'not.a.jws', 'a.b', `${h}.${b}`]) expect(await repinned.verifyAppleJws(junk, AT)).toBeNull();
  });

  it('⛔ the notification route verifies BEFORE it reads anything, and refuses what does not', () => {
    expect(notificationRoute).toContain('outer = await verifyAppleJws(signed, now);');
    expect(notificationRoute).toContain("if (!outer) return json(401, { error: 'bad_signature' });");
    // the transaction inside is verified too — not merely decoded
    expect(notificationRoute).toContain("tx = await verifyAppleJws(String(data.signedTransactionInfo ?? ''), now);");
    expect(notificationRoute).not.toMatch(/b64urlToBytes/); // the old, unverified decode is gone
    expect(notificationRoute.match(/BUNDLE_ID/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("…and the API answer is read off the signed transaction, never off the envelope", () => {
    const api = billingSrc.slice(billingSrc.indexOf('export async function appleSubscription'));
    expect(api).toContain("const tx = await verifyAppleJws(String(last.signedTransactionInfo ?? ''), nowMs);");
    expect(api).toContain("if (!tx || str(tx.bundleId, 64) !== BILLING_BUNDLE_ID) continue;");
    expect(api).toContain('const productId = str(tx.productId, 64);');
    expect(api).toContain('const original = str(tx.originalTransactionId, 64);');
    // a non-200/404 is a throw, so "we could not check" can never read as "it is not valid"
    expect(api).toContain("if (!res.ok) throw new Error('appstore_api');");
    expect(planRoute).toContain("return json(503, { error: 'billing_unavailable' });");
  });
});

describe('the migration, and the deploy that cannot break what already works', () => {
  it('0002 adds columns beside `seat_limit` and takes nothing away', () => {
    for (const col of ['plan_product_id', 'plan_txn', 'plan_state', 'plan_renews_at', 'plan_event_at']) {
      expect(migration2).toContain(`ALTER TABLE coaches ADD COLUMN ${col}`);
    }
    expect(migration2).not.toMatch(/^\s*(DROP|CREATE TABLE|DELETE FROM|UPDATE|INSERT)\b/im);
    // 0001 is still the only place the tables are made
    expect(migration1).toContain('CREATE TABLE coaches (');
    expect(migration1).not.toMatch(/plan_product_id|plan_txn/);
  });

  it('the founder is told the three secrets by name, and no other', () => {
    for (const secret of ['APPLE_IAP_KEY_ID', 'APPLE_IAP_ISSUER_ID', 'APPLE_IAP_PRIVATE_KEY']) {
      expect(toml).toContain(`wrangler secret put ${secret}`);
      expect(billingSrc).toContain(`${secret}?: string;`);
    }
  });

  it('a worker with no Apple key still signs people in, and still runs the rest of the coach track', () => {
    // `billing_not_configured` can be reached from exactly one route, and it is the claim
    expect(codeOf(coachSrc).match(/billing_not_configured/g)?.length).toBe(1);
    expect(planRoute).toContain('billing_not_configured');
    // the three secrets are optional in the type, like every other one this worker can live without
    for (const secret of ['APPLE_IAP_KEY_ID', 'APPLE_IAP_ISSUER_ID', 'APPLE_IAP_PRIVATE_KEY', 'BILLING_TEST']) {
      expect(billingSrc).toMatch(new RegExp(`${secret}\\?: string;`));
    }
    expect(indexSrc).toContain('export interface Env extends AppleBillingEnv {');
    // and the notification half needs no key at all — a notification proves itself
    expect(notificationRoute).not.toMatch(/APPLE_IAP_|appleBillingConfigured/);
  });
});
