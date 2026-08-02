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
 * What replaced it is a per-ATTEMPT deadline set from what healthy calls actually cost, and three
 * attempts — because a stall is random and independent of the request. Measured, four identical
 * conversational turns: **9.9s, 8.4s, 125.1s, 2.0s**. Then, with one retry at 30s, still one loss
 * in eight. With three attempts at 20s: twelve out of twelve, median about three seconds.
 *
 * So the question this law asks is the same one, against a worst case instead of a ceiling.
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
/** The two per-attempt deadlines, from `const attemptMs = cond ? A : B;`. */
const attemptMs = (() => {
  const m = /const attemptMs = [^?]+\?\s*([\d_]+)\s*:\s*([\d_]+);/.exec(worker);
  if (!m) throw new Error('no attemptMs');
  return [Number(m[1].replace(/_/g, '')), Number(m[2].replace(/_/g, ''))];
})();
const attempts = num(worker, /const ATTEMPTS = (\d+);/, 'ATTEMPTS');
const app = num(read('code/mobile/src/platform/coach/coachClient.ts'), /const TIMEOUT_MS = ([\d_]+);/, 'app TIMEOUT_MS');

describe('the two timeouts on one call', () => {
  it('⚠️ the app outlasts everything the Worker can spend', () => {
    // Equal is not enough: they start at different instants — the app's clock begins before the
    // request has crossed the network — so the app must have real headroom, not a tie.
    const worst = Math.max(...attemptMs) * attempts;
    expect(app).toBeGreaterThan(worst);
  });

  it('⚠️ every attempt gives up well before Cloudflare cuts the call at 125s', () => {
    /*
     * THIS IS THE WHOLE MECHANISM. A stall is only survivable if we abandon it while there is still
     * time to ask again — an attempt allowed to run to the 125s wall converts a random hiccup into
     * a lost decision, which is exactly what the founder saw as "Not sent" after a two-minute wait.
     */
    for (const ms of attemptMs) expect(ms).toBeLessThan(100_000);
  });

  it('asks more than once, because one stall in four is not a rare event', () => {
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('still leaves a healthy call far more room than it has ever needed', () => {
    // Observed: 1.5–12s conversational, 14–20s for a whole programme. The smaller deadline has to
    // clear the conversational range and the larger one the programme's, or a slow-but-alive call
    // gets killed and billed twice for no reason.
    expect(Math.min(...attemptMs)).toBeGreaterThanOrEqual(20_000);
    expect(Math.max(...attemptMs)).toBeGreaterThanOrEqual(40_000);
  });
});
