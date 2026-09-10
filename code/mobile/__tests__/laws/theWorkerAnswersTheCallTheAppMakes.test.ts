// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WORKER ALLOWS EVERY HEADER THE APP SENDS.
 *
 * Found by trying to hold a real conversation with the live coach from the harness, 2026-08-02. The
 * message never left the browser. No request in the network log, nothing in the Worker's log, and
 * the app's own honest report: **offline**.
 *
 * `x-hush-install` had been added to the client for the rate limit — the one header that tells one
 * athlete from a script — and the Worker's `access-control-allow-headers` was not updated with it.
 * A browser asks permission for the headers it is about to send; the answer did not grant that one;
 * the preflight failed; **the real POST was never made.**
 *
 * ⚠️ A PHONE NEVER SEES THIS. A native fetch sends no preflight, so the app works perfectly while
 * the only way anyone can LOOK at the coach before a build is silently dead. That asymmetry is the
 * whole reason this is a law and not a fixed line: the next header added to the client will be added
 * for a phone, tested on a phone, and will break the same thing again.
 *
 * It is the second time this exact trap has cost an hour — the first was `OPTIONS` replying with a
 * body at a 204 (2026-07-31), which throws before any header is read. Both times the symptom was a
 * bare failure with nothing to read anywhere.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('the browser can reach the coach', () => {
  const client = read('code/mobile/src/platform/coach/coachClient.ts');
  const worker = read('server/worker.ts');

  it('finds both sides of the call', () => {
    expect(client).toContain('fetch(COACH_URL');
    expect(worker).toContain('access-control-allow-headers');
  });

  it('⚠️ names every header the client sends in the CORS answer', () => {
    // The headers object the client hands to `fetch`, read as source: quoted keys are literal, and
    // `content-type` is there under its own name.
    const headersBlock = /headers:\s*\{([^}]*)\}/.exec(client)?.[1] ?? '';
    const sent = [...headersBlock.matchAll(/'([a-z-]+)':/g)].map((m) => m[1]);
    expect(sent.length).toBeGreaterThan(1);

    const allowed = /'access-control-allow-headers':\s*'([^']*)'/.exec(worker)?.[1] ?? '';
    const allowedSet = allowed.split(',').map((h) => h.trim().toLowerCase());
    const missing = sent.filter((h) => !allowedSet.includes(h));
    expect(missing).toEqual([]);
  });

  it('answers the preflight with NO BODY — the first version of this trap', () => {
    // `json({}, 204)` throws: a 204 may not carry one. The preflight then fails before any header
    // is compared, and the browser reports a bare "Failed to fetch".
    const options = worker.slice(worker.indexOf("=== 'OPTIONS'"));
    expect(options.slice(0, 400)).toContain('new Response(null');
  });
});
