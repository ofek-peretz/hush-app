/**
 * A WIPED IDENTITY REALLY IS A WIPED IDENTITY.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * `db.clearAll()` — sign out, erase account — removes exactly `Object.values(K)`. Nothing else.
 * So a persisted key declared ANYWHERE ELSE in the source simply survives the wipe, and the next
 * athlete on that phone inherits it. For a once-per-athlete flag that is not a leak of data, it is
 * a leak of MEMORY: the app silently believes it has already spoken to someone it has never met.
 *
 * On 2026-07-29 three of them had it at once — `hush.notifications.asked` (8.2's honest ask),
 * `hush.recovery.sealed` (3.5's once-a-week seal) and the freshly-added `hush.watch.offered`
 * (1.3 + 10.4). A wiped phone would have shown the second athlete none of the three, forever, and
 * no test could see it because each one works perfectly in isolation.
 *
 * So the rule is mechanical: every `hush.*` constant in the source is either IN `K` (and therefore
 * wiped), or named below with the reason it must outlive an account. There is no third option, and
 * "nobody thought about it" stops being expressible.
 */
// @ts-nocheck

// 

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';

const SRC = join(__dirname, '../../src');

/**
 * Keys that MUST survive `clearAll`, and why. A device is not an account: erasing the athlete
 * must not change the phone's language or give the device a new identity for telemetry.
 */
const SURVIVES_A_WIPE: Record<string, string> = {
  'hush.locale': 'a DEVICE preference — erasing the athlete must not change the phone language',
  'hush.device.id': 'the device identity for telemetry, deliberately outlives every account',
  'hush.billing.stub.entitlement': 'the dev-only stub store, never present in a real build',
};

/**
 * Identifiers that are not storage at all — iOS notification ids and a background-task name. They
 * are `hush.`-prefixed for the same namespacing reason, and `clearAll` is not how they are
 * retired (`cancelRetiredNotes` / `cancelAll` is).
 */
const NOT_STORAGE = new Set([
  'hush.weekly_program_ready',
  'hush.quarterly_report',
  'hush.rest_warn',
  'hush.rest_done',
  'hush.cardio_km',
  'hush.cardio.location',
]);

/** The `K` map in db.ts, read as source — the one place the wipe list is written. */
function wipedKeys(): Set<string> {
  const src = readFileSync(join(SRC, 'data/local/db.ts'), 'utf8');
  const start = src.indexOf('const K = {');
  const block = src.slice(start, src.indexOf('} as const;', start));
  return new Set([...block.matchAll(/'(hush\.[^']+)'/g)].map((m) => m[1]));
}

/** Every `const X = 'hush.…'` declared anywhere in the source, with the file that declares it. */
function declaredKeys(): { key: string; file: string }[] {
  const out: { key: string; file: string }[] = [];
  for (const f of globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })) {
    const rel = f.replace(/\\/g, '/').slice(f.replace(/\\/g, '/').indexOf('/src/') + 1);
    if (rel.includes('/data/local/db.ts')) continue; // K itself is the list, not an entry on it
    for (const m of readFileSync(f, 'utf8').matchAll(/=\s*'(hush\.[A-Za-z0-9_.]+)'/g)) {
      out.push({ key: m[1], file: rel });
    }
  }
  return out;
}

describe('every persisted key is either wiped with the account or excused', () => {
  const wiped = wipedKeys();

  it('no key is left to outlive the athlete by accident', () => {
    const unaccounted = declaredKeys()
      .filter(({ key }) => !wiped.has(key) && !SURVIVES_A_WIPE[key] && !NOT_STORAGE.has(key))
      .map(({ key, file }) => `${key} (${file})`);
    expect({ neitherWipedNorExcused: unaccounted }).toEqual({ neitherWipedNorExcused: [] });
  });

  it('the three once-per-athlete flags are wiped — each one is "we already said this to HER"', () => {
    for (const key of ['hush.notifications.asked', 'hush.watch.offered', 'hush.recovery.sealed']) {
      expect({ key, wipedOnAccountReset: wiped.has(key) }).toEqual({ key, wipedOnAccountReset: true });
    }
  });

  it('every excuse named here is still a key the source declares', () => {
    const declared = new Set(declaredKeys().map((d) => d.key));
    const stale = Object.keys(SURVIVES_A_WIPE).filter((k) => !declared.has(k));
    expect({ staleExcuses: stale }).toEqual({ staleExcuses: [] });
  });
});
