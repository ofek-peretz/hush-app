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
 * ── AND WHY THE NUMBER MOVED (2026-08-02) ───────────────────────────────────────────────────────
 * The Worker's ceiling was 90 seconds, and the post-session call — the one this product is built
 * around — hit it three times out of three: 90.08, 90.20, 90.08. Ours, not Google's. The same
 * Worker had answered an intake in 24 seconds an hour before.
 *
 * That call is simply the heaviest thing we ask for: ~11,000 tokens of prompt, a REQUIRED whole
 * programme, and real work to do — a lift stalled for three sessions with falling reps, a
 * 92-minute match on her watch, four weeks of history. The model thinks in proportion to the task,
 * so the call that deserves the most thought is the one that runs longest. A call that takes two
 * minutes and arrives beats one cut off at ninety seconds that leaves her without a week.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** `const TIMEOUT_MS = 170_000;` → 170000 */
function timeoutOf(source: string): number {
  const m = /const TIMEOUT_MS = ([\d_]+);/.exec(source);
  if (!m) throw new Error('no TIMEOUT_MS');
  return Number(m[1].replace(/_/g, ''));
}

describe('the two timeouts on one call', () => {
  const app = timeoutOf(read('code/mobile/src/platform/coach/coachClient.ts'));
  const worker = timeoutOf(read('server/worker.ts'));

  it('⚠️ the app is the more patient of the two', () => {
    // Equal is not enough: they start at different instants — the app's clock begins before the
    // request has crossed the network — so the app must have real headroom, not a tie.
    expect(app).toBeGreaterThan(worker);
  });

  it('leaves room for the heaviest call we make', () => {
    // Measured: the post-session call was aborted three times at a 90-second ceiling. Anything at
    // or under two minutes is a ceiling that has already been proven too low once.
    expect(worker).toBeGreaterThanOrEqual(120_000);
  });
});
