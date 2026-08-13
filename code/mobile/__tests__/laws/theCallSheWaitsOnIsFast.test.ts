// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const worker = () => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'server/worker.ts'), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CALLS SHE WAITS ON RUN FAST. THE ONES SHE HAS WALKED AWAY FROM THINK.
 *
 * ⛔ FOUNDER'S PLAN, move 3: *"Spotify plays instantly. We think for 20 seconds."*
 *
 * Measured first. **The app's own work is not the problem** — with a full year of training in the
 * record (208 sessions, 3,744 sets), every screen's on-mount work is under 2ms: `coachFacts` 1.27,
 * `liftClimb` 1.13, `lastTimeOn` 0.20, `coachWeek` 0.01. Nothing drops a frame. The latency is
 * entirely the coach.
 *
 * ── ⛔ AND ONE CALL WAS ON THE WRONG PATH ──────────────────────────────────────────────────────
 * `in_session` — she is MID-WORKOUT, at the rack, having just typed "my shoulder is tight" — passed
 * no thinking level. So it took Gemini's default and, in the Worker, the slow branch:
 * **no hedge for 20 seconds, and a 110-second budget.**
 *
 * The chat has used `low` since it shipped: hedge at 1.8s, median about three seconds. It is the
 * same interaction — she typed something and is watching for an answer — except here she is also
 * holding a barbell.
 *
 * ── ⚠️ AND WHY NOT EVERYWHERE ──────────────────────────────────────────────────────────────────
 * Thinking level buys PROGRAMME quality, and that is measured, not assumed: `low` on a post-session
 * call answered in 3.9 seconds and wrote a one-exercise week. `in_session` is not writing a
 * programme — its schema is `COACH_PLAN_SCHEMA`, where `sessions` is optional, and what it produces
 * is "drop this, ease that" against a session already running.
 *
 * The line is: **is she watching the screen right now?**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('the thinking level follows who is waiting', () => {
  it('⛔ the in-session call runs on the fast path', () => {
    expect(read('src/platform/coach/afterSession.ts')).toContain("occasion.kind === 'in_session' ? 'low' : undefined,");
  });

  it('⛔ …and there is no chat left to run on it (2026-08-12)', () => {
    /*
     * This asserted `useCoach` asked at `'low'` — the right thinking level for a person watching a
     * cursor blink. The hook is deleted with the two screens that mounted it: the in-workout window
     * is an action sheet and the pain report is the body map again.
     *
     * ⚠️ THE RULE THIS FILE IS ABOUT STILL STANDS AND NOW HAS ONE SUBJECT: the IMPORT is the only
     * call an athlete waits on, and it is the one that must be fast.
     */
    const fs = require('fs');
    const path = require('path');
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'src/screens/coach/useCoach.ts'))).toBe(false);
    expect(read('src/domain/importPrompt.ts')).toContain("think: 'low'");
  });

  it('⚠️ but the post-session call and a rebuild still THINK', () => {
    /*
     * She has left the screen for one and the other rewrites her whole programme. Turning either
     * down is the regression that produced a one-exercise week — the single worst thing that has
     * happened to this product's output.
     */
    const src = read('src/platform/coach/afterSession.ts');
    expect(src).not.toMatch(/kind === 'after_session' \? 'low'/);
    expect(src).not.toMatch(/kind === 'revise' \? 'low'/);
  });
});

describe('and the Worker treats that level as the fast path', () => {
  it('⛔ `low` is what selects the short hedge and the short budget', () => {
    // The app asking for `low` buys nothing unless the Worker branches on it. This is the pair.
    expect(worker()).toContain("const conversational = call.think === 'low' || call.think === 'minimal';");
  });

  it('and the fast branch hedges in seconds, not tens of seconds', () => {
    const hedge = /const HEDGE_MS = [^?]+\?\s*([\d_]+)\s*:\s*([\d_]+);/.exec(worker())!;
    const fast = Number(hedge[1].replace(/_/g, ''));
    const slow = Number(hedge[2].replace(/_/g, ''));
    expect(fast).toBeLessThan(3_000);
    expect(slow).toBeGreaterThan(fast * 5); // the two paths are genuinely different, not cosmetic
  });
});
