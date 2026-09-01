// @ts-nocheck
//
import fs from 'fs';
import path from 'path';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY PAID CALL PASSES A CEILING BEFORE IT PASSES TO THE MODEL.
 *
 * Until 2026-09-01 the coach Worker's whole defence was a shared token in the app bundle and a
 * rate limit keyed on a header the CALLER supplies (`x-hush-install`) — the Worker's own comment
 * conceded a script could mint a fresh id per request and walk past it. There was no cap on body
 * size, and hedging turned one hostile request into three paid Gemini calls. The bill had no owner.
 *
 * The audit's finding 1 closed it with four walls, and this law pins all four to the source so a
 * refactor cannot quietly remove one:
 *
 *   1. TEXT CEILINGS      — blocks are counted and their characters summed, like images always were
 *   2. A REAL IDENTITY    — the hush-identity session is read from the shared KV, and REQUIRE_AUTH
 *                           can make it the price of entry
 *   3. THE DAY'S BUDGET   — per-account and global KV counters, spent BEFORE the upstream call
 *   4. THE CLIENT SENDS IT — the bearer rides on every app call, or none of the above can see her
 *
 * Source-reading, like every law here: the Worker has no test harness of its own yet, and a law
 * that pins the shape today beats a harness that arrives someday.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('the coach door has a ceiling', () => {
  const worker = read('server/worker.ts');
  const client = read('code/mobile/src/platform/coach/coachClient.ts');
  const config = read('server/wrangler.toml');

  it('caps the text, not only the images', () => {
    expect(worker).toContain('MAX_BLOCKS');
    expect(worker).toContain('MAX_TEXT_CHARS');
    expect(worker).toMatch(/call\.blocks\.length > MAX_BLOCKS/);
    expect(worker).toMatch(/textChars > MAX_TEXT_CHARS/);
  });

  it('asks who is calling, and can refuse a caller with no answer', () => {
    expect(worker).toContain("session:${bearer}");
    expect(worker).toMatch(/REQUIRE_AUTH === '1' && !sub/);
  });

  it('⚠️ spends the day\'s budget BEFORE the model is called', () => {
    const upstream = worker.indexOf('generativelanguage.googleapis.com');
    expect(upstream).toBeGreaterThan(0);
    const globalSpend = worker.indexOf('quota:g:');
    const accountSpend = worker.indexOf('quota:c:');
    expect(globalSpend).toBeGreaterThan(0);
    expect(accountSpend).toBeGreaterThan(0);
    expect(globalSpend).toBeLessThan(upstream);
    expect(accountSpend).toBeLessThan(upstream);
  });

  it('the deploy config carries the KV the sessions live in', () => {
    expect(config).toContain('binding = "HUSH_KV"');
    expect(config).toContain('REQUIRE_AUTH');
  });

  it('the app sends the bearer that makes any of it enforceable', () => {
    expect(client).toContain('identitySessionToken');
    expect(client).toMatch(/'authorization':\s*`Bearer \$\{session\}`/);
  });
});
