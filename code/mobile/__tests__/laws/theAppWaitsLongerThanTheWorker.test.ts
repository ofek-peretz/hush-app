import fs from 'fs';
import path from 'path';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE APP WAITS LONGER THAN THE WORKER DOES.
 *
 * Two timeouts, in two repositories' worth of file, on the same call. If the APP's is the shorter
 * one it hangs up on an answer that is still coming — and reports `timed_out` for a decision that
 * arrived a second later and was thrown away. There is no way to see that from either side alone.
 *
 * ── ⚠️ AND THE WORKER'S SIDE IS NO LONGER ONE NUMBER (2026-08-02) ───────────────────────────────
 * It used to be `TIMEOUT_MS`, raised 90s → 170s on the reasoning that the post-session call is
 * heavy and deserves longer. **That reasoning was wrong**, and this file repeated it confidently:
 * there is no call that takes two minutes and arrives. Cloudflare cuts the Worker's outbound
 * subrequest at 125s, so every second budgeted past that measured nothing but how long she waited
 * to be told nothing happened.
 *
 * ── ⚠️ AND THEN SEQUENTIAL RETRY WAS WRONG TOO, WHICH IS WHY THIS FILE BROKE ────────────────────
 * Its replacement was a per-attempt deadline (`attemptMs`) with `ATTEMPTS` tries in a row — and
 * MEASURED, it made latency worse, not better: median 1.6s → 5.4s, because a 7s deadline kills
 * calls that are alive but slow and pays for them twice.
 *
 * What ships now is HEDGING. The first attempt is never cancelled for being slow; after `HEDGE_MS`
 * a SECOND one starts beside it and whichever answers first wins. A stall costs the hedge delay
 * instead of a whole deadline, and a slow-but-alive call is still allowed to arrive.
 *
 * This law was left parsing `attemptMs` and `ATTEMPTS`, which the hedge deleted — so it threw on
 * load and asserted nothing at all, silently, while the two timeouts it exists to compare went
 * unwatched. A law that reads another repository's constants by regex fails this way whenever that
 * file is rewritten; the cost of the coupling is that it must be re-pointed with the rewrite.
 *
 * So the question is the same one, against the hedge's real worst case.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const num = (source: string, re: RegExp, what: string): number => {
  const m = re.exec(source);
  if (!m) throw new Error(`no ${what}`);
  return Number(m[1].replace(/_/g, ''));
};

const worker = read('server/worker.ts');
/** Both hedge delays, from `const HEDGE_MS = cond ? A : B;`. */
const hedgeMs = (() => {
  const m = /const HEDGE_MS = [^?]+\?\s*([\d_]+)\s*:\s*([\d_]+);/.exec(worker);
  if (!m) throw new Error('no HEDGE_MS');
  return [Number(m[1].replace(/_/g, '')), Number(m[2].replace(/_/g, ''))];
})();
/** Both overall budgets — the point at which the Worker stops hoping and answers. */
const overallMs = (() => {
  const m = /const OVERALL_MS = [^?]+\?\s*([\d_]+)\s*:\s*([\d_]+);/.exec(worker);
  if (!m) throw new Error('no OVERALL_MS');
  return [Number(m[1].replace(/_/g, '')), Number(m[2].replace(/_/g, ''))];
})();
const inFlight = num(worker, /const MAX_IN_FLIGHT = (\d+);/, 'MAX_IN_FLIGHT');
const app = num(read('code/mobile/src/platform/coach/coachClient.ts'), /const TIMEOUT_MS = ([\d_]+);/, 'app TIMEOUT_MS');

describe('the two timeouts on one call', () => {
  it('⚠️ the app outlasts everything the Worker can spend', () => {
    // Equal is not enough: they start at different instants — the app's clock begins before the
    // request has crossed the network — so the app must have real headroom, not a tie.
    expect(app).toBeGreaterThan(Math.max(...overallMs));
  });

  it('⚠️ the whole budget ends before Cloudflare cuts the call at 125s', () => {
    /*
     * THE WALL, AND IT IS NOT OURS. Cloudflare kills the Worker's outbound subrequest at ~125s and
     * returns a 524 — so a budget past that buys nothing except a longer wait for the same failure.
     * This is the number the founder actually felt as "Not sent" after two minutes.
     */
    for (const ms of overallMs) expect(ms).toBeLessThan(125_000);
  });

  it('hedges rather than giving up — a slow call is still allowed to arrive', () => {
    /*
     * ⚠️ THE LESSON FROM THE VERSION THIS REPLACED. Sequential retry cancelled the first attempt to
     * start the second, and MEASURED that made the median worse (1.6s → 5.4s) because most slow
     * calls were alive. Hedging starts the second one ALONGSIDE, so nothing in flight is thrown
     * away. More than one in flight is the whole mechanism.
     */
    expect(inFlight).toBeGreaterThanOrEqual(2);
    expect(worker).toContain('Promise.race');
  });

  it('waits for the typical call before spawning a second one', () => {
    /*
     * Observed: 1.5–12s conversational, 14–20s for a whole programme. A hedge that fires below the
     * common case doubles the bill on every ordinary turn to buy nothing.
     *
     * ⚠️ The conversational hedge is deliberately BELOW that range (1.8s) and it is not a mistake:
     * a chat turn is cheap, she is watching the screen, and the second call is worth its cost to
     * cut the tail. The programme hedge is not — it is the expensive call — so it sits at the top
     * of the healthy range instead.
     */
    expect(Math.max(...hedgeMs)).toBeGreaterThanOrEqual(14_000);
    // …and every hedge leaves room for at least one more attempt inside the budget.
    for (let i = 0; i < hedgeMs.length; i += 1) expect(hedgeMs[i]).toBeLessThan(overallMs[i] / 2);
  });
});
