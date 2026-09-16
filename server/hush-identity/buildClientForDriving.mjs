/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE REAL CLIENT, MADE RUNNABLE IN NODE — so two of them can talk to a real room. (2026-08-31)
 *
 * ⛔ IT TRANSPILES THE SHIPPING FILES; IT DOES NOT REIMPLEMENT THEM. `drivePair.mjs` is worth
 * something only if what it drives is `src/platform/sharedClient.ts` itself — a second
 * implementation of the protocol would prove that the second implementation works.
 *
 * Two imports are stubbed and only two, both of them native seams that have nothing to do with the
 * protocol: the identity worker's base URL + authenticated POST (`circleClient`), and telemetry.
 * Everything else — the backoff, the fence, the reconnect, the frame handling — is the real thing.
 *
 * Run by `drivePair.mjs`; it has no other caller.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..', '..', 'code', 'mobile');
const require = createRequire(join(MOBILE, 'package.json'));
const ts = require('typescript');

const OUT = join(HERE, '.driven');
mkdirSync(OUT, { recursive: true });

const strip = (rel) =>
  ts.transpileModule(readFileSync(join(MOBILE, 'src', rel), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;

// The pure half has no imports at all — that is the whole point of it.
writeFileSync(join(OUT, 'sharedSession.mjs'), strip('domain/sharedSession.ts'));

const client = strip('platform/sharedClient.ts')
  .replace("'@/platform/circleClient'", "'./stubs.mjs'")
  .replace("'@/platform/telemetry'", "'./stubs.mjs'")
  .replace("'@/domain/sharedSession'", "'./sharedSession.mjs'");
writeFileSync(join(OUT, 'sharedClient.mjs'), client);

/**
 * The two native seams, and nothing else.
 *
 * `identityCall` hands out pre-planted tickets in order, because a ticket is single-use and a
 * RECONNECT needs a fresh one — which is exactly the property the reconnect scenario is testing.
 */
writeFileSync(
  join(OUT, 'stubs.mjs'),
  `let base = 'http://127.0.0.1:8787';
let pool = [];
export const setBase = (b) => { base = b; };
export const setTickets = (t) => { pool = [...t]; };
export const ticketsLeft = () => pool.length;
export const identityBaseUrl = () => base;
export const circleSignedIn = async () => true;
export const identityCall = async (path) => {
  if (path === '/pair/open' || path === '/pair/join') {
    const ticket = pool.shift();
    return ticket ? { code: 'DRIVEN', ticket } : null;
  }
  return null;
};
export const track = () => {};
`,
);

console.log('built', OUT);
