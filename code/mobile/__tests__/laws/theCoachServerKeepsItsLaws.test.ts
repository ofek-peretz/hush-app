/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH TRACK'S SERVER KEEPS ITS LAWS — the server half of laws 4, 6, 7 and 8. (2026-09-17)
 *
 * ⛔ FOUNDER, 2026-09-17: *"אני רוצה להוסיף מסלול למאמנים שנותנים למתאמנים שלהם להתאמן איתנו."*
 * `docs/architecture/COACH_TRACK_V1.md` §2 names eight laws. The app holds its half on the phone;
 * this file holds what only `server/hush-identity` can hold, the way every law about that worker
 * does — by reading its source. And because the readers in `src/coach.ts` are pure and import
 * nothing, it also TRANSPILES that file and runs them: a law that only grepped for a 140 would pass
 * on a 140 in a comment.
 *
 *   4 · the coach sees only link-date-onward, allow-listed fields; the server rebuilds every payload
 *       field by field — and never hands a coach the trainee's `sub`.
 *   6 · (server half) access stops at `ended_at`; the rows are purged 30 days after, by a cron.
 *   7 · a per-lift note of at most 140 characters is the only prose, enforced server-side.
 *   8 · account deletion cascades: coach → links ended, invites + templates gone; trainee → uploads
 *       gone, link ended — before anything in KV is touched.
 *
 * The wire itself is driven against a real local D1 by `server/hush-identity/driveCoach.mjs`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const readRepo = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n');

const coachSrc = readRepo('server/hush-identity/src/coach.ts');
const indexSrc = readRepo('server/hush-identity/src/index.ts');
const migration = readRepo('server/hush-identity/migrations/0001_coach.sql');
const toml = readRepo('server/hush-identity/wrangler.toml');

/** `src/coach.ts`, compiled and loaded — the readers as they will actually run. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const coach: any = (() => {
  const js = ts.transpileModule(coachSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
})();

/**
 * Every SQL statement handed to `db.prepare(…)` in a piece of source that mentions `needle` — cut at
 * the call's own close, `).bind(` / `).first(` / `).all(` / `).run(`, so a comment's apostrophe or a
 * `''` inside the SQL cannot split a statement the way a string-literal regex would.
 */
const sqlWith = (src: string, needle: string): string[] =>
  src
    .split('.prepare(')
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.search(/\)\s*\.(bind|first|all|run)\(/)))
    .filter((q) => q.includes(needle));

/** The body of the route function — everything a caller's request can execute. */
const routeBody = coachSrc.slice(coachSrc.indexOf('async function route('), coachSrc.indexOf('export async function coachAccountDeleted'));

const SINCE = Date.parse('2026-09-17T08:00:00.000Z');
const NOW = SINCE + 2 * 24 * 60 * 60 * 1000;
const upload = (extra: Record<string, unknown> = {}) => ({
  id: 'sess_1',
  at: '2026-09-18T07:00:00.000Z',
  day: 'Push',
  minutes: 50,
  early: false,
  sets: [{ ex: 'bb_bench_press', load: 80, reps: 8 }],
  ...extra,
});
const week = (note?: string) => ({
  v: 1,
  days: [{ name: 'Upper', lifts: [{ ex: 'bb_bench_press', sets: 4, band: [6, 8], ...(note === undefined ? {} : { note }) }] }],
});

describe('law 4 · the coach sees the allow-list and nothing else', () => {
  it('a session is rebuilt, not passed through: unknown keys are gone, even nested ones', () => {
    const raw = upload({ healthKit: { hr: 150 }, gps: [[32, 34]], sets: [{ ex: 'bb_bench_press', load: 80, reps: 8, rpe: 9 }] });
    const out = coach.readSessionUpload(raw, { consentBodyweight: true, sinceMs: SINCE, nowMs: NOW });
    expect(out).not.toBe(raw);
    expect(Object.keys(out).sort()).toEqual(['at', 'day', 'early', 'id', 'minutes', 'sets']);
    expect(Object.keys(out.sets[0]).sort()).toEqual(['ex', 'load', 'reps']);
  });

  it('⛔ nothing from before the link date is accepted', () => {
    const early = upload({ at: '2026-09-17T07:59:59.000Z' });
    expect(coach.readSessionUpload(early, { consentBodyweight: false, sinceMs: SINCE, nowMs: NOW })).toBeNull();
    const run = { id: 'r', at: '2026-09-16T07:00:00.000Z', kind: 'run', metres: 5000, seconds: 1500 };
    expect(coach.readCardioUpload(run, { sinceMs: SINCE, nowMs: NOW })).toBeNull();
    // …and the route hands the link's own date to both readers.
    expect(routeBody).toContain('sinceMs: link.since');
    expect(routeBody.match(/sinceMs: link\.since/g)?.length).toBe(2);
  });

  it('⛔ bodyweight without consent is dropped at WRITE, and gated again at READ', () => {
    const withBw = upload({ bodyweightKg: 70 });
    expect(coach.readSessionUpload(withBw, { consentBodyweight: false, sinceMs: SINCE, nowMs: NOW })).not.toHaveProperty('bodyweightKg');
    expect(coach.readSessionUpload(withBw, { consentBodyweight: true, sinceMs: SINCE, nowMs: NOW }).bodyweightKg).toBe(70);
    // write: the link's consent decides; cardio is not even read without it
    expect(routeBody).toContain('consentBodyweight: consent.bodyweight, sinceMs: link.since');
    expect(routeBody).toMatch(/if \(consent\.cardio\) \{\s*for \(const raw of rawCardio\)/);
    // read: every session leaves through `sessionOut`, which attaches weight only under consent now
    expect(coachSrc).toContain('if (s && consentBodyweight && row.bodyweight_kg != null) s.bodyweightKg = row.bodyweight_kg;');
    expect(routeBody).toContain('sessionOut(r, consent.bodyweight)');
    expect(routeBody).toContain("sessionOut(r, l.consent_bodyweight === 1)");
    expect(routeBody).toMatch(/if \(consent\.bodyweight\) \{\s*const bw = await db/);
    expect(routeBody).toMatch(/if \(consent\.cardio\) \{\s*const c = await db/);
  });

  it('withdrawing consent erases what it covered, in the database too', () => {
    expect(routeBody).toContain("UPDATE coach_sessions SET bodyweight_kg = NULL WHERE link_id = ?");
    expect(routeBody).toContain('DELETE FROM coach_cardio WHERE link_id = ?');
  });

  it('what is stored is what a reader built — never the request body', () => {
    expect(routeBody).toContain('JSON.stringify(rest)');
    expect(routeBody).toContain('JSON.stringify(c)');
    expect(routeBody.match(/JSON\.stringify\(week\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(routeBody).not.toMatch(/JSON\.stringify\((body|raw)\b/);
    // a week keeps only its named fields
    const w = coach.readCoachWeek({ ...week('Slow down'), secret: 1, days: [{ ...week().days[0], x: 1 }] });
    expect(JSON.stringify(w)).not.toMatch(/secret|"x"/);
  });

  it('⛔ no statement a request can run ever SELECTs the trainee’s sub', () => {
    expect(coachSrc).not.toMatch(/SELECT\s+\*/);
    expect(coachSrc).not.toMatch(/\bl\.\*/);
    for (const q of sqlWith(coachSrc, 'SELECT')) {
      // the column list of every SELECT (up to its first FROM) names no trainee_sub
      for (const cols of q.split(/SELECT/).slice(1).map((part) => part.split(/\bFROM\b/)[0])) {
        expect({ q, leaks: cols.includes('trainee_sub') }).toEqual({ q, leaks: false });
      }
    }
    expect(coachSrc).not.toContain('RETURNING trainee_sub');
    expect(coachSrc).toContain("const LINK_COLUMNS = 'id, trainee_name, sex, days, since, consent_bodyweight, consent_cardio';");
  });
});

describe('law 6 · unlinking takes nothing — the server half', () => {
  it('⛔ a coach reaches a link only while `ended_at IS NULL`', () => {
    // Everything a request can run: the route AND the query helpers above it (`coachLink`,
    // `liveLinkOf`, `seatsUsed`) — only the deletion cascade and the purge sit below.
    const requestReachable = coachSrc.slice(0, coachSrc.indexOf('export async function coachAccountDeleted'));
    const touching = sqlWith(requestReachable, 'FROM coach_links');
    expect(touching.length).toBeGreaterThanOrEqual(5);
    for (const q of touching) expect({ q, live: q.includes('ended_at IS NULL') }).toEqual({ q, live: true });
    // the ends: coach remove and trainee leave both SET ended_at, neither DELETEs
    expect(routeBody).toContain('UPDATE coach_links SET ended_at = ? WHERE id = ? AND coach_sub = ? AND ended_at IS NULL');
    expect(routeBody).toContain('UPDATE coach_links SET ended_at = ? WHERE trainee_sub = ? AND ended_at IS NULL');
    expect(routeBody).not.toContain('DELETE FROM coach_links');
  });

  it('one coach at a time — held by the database, not only by a read', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX coach_links_one_live_per_trainee ON coach_links(trainee_sub) WHERE ended_at IS NULL;');
    expect(routeBody).toContain("return json(409, { error: 'already_linked' });");
  });

  it('⛔ the rows go 30 days after, every day, by cron', () => {
    expect(coachSrc).toContain('export const PURGE_AFTER_MS = 30 * DAY_MS;');
    expect(coachSrc).toContain('const DAY_MS = 24 * 60 * 60 * 1000;');
    const purge = coachSrc.slice(coachSrc.indexOf('export async function purgeCoach'));
    expect(purge).toContain('const cutoff = now - PURGE_AFTER_MS;');
    for (const table of ['coach_sessions', 'coach_cardio', 'coach_weeks']) {
      expect(purge).toContain(`DELETE FROM ${table} WHERE link_id IN (\${ENDED})`);
    }
    expect(purge).toContain("const ENDED = 'SELECT id FROM coach_links WHERE ended_at IS NOT NULL AND ended_at < ?';");
    expect(purge).toContain("DELETE FROM coach_links WHERE ended_at IS NOT NULL AND ended_at < ?').bind(cutoff)");
    expect(purge).toContain("DELETE FROM coach_invites WHERE expires_at < ?').bind(now)");
    // the cron exists, and it is wired to the purge
    expect(toml).toContain('crons = ["17 3 * * *"]');
    expect(indexSrc).toMatch(/async scheduled\([^)]*\): Promise<void> \{\s*await purgeCoach\(env\);/);
    // and a child row cannot outlive its link even if the explicit DELETE were lost
    expect(migration.match(/REFERENCES coach_links\(id\) ON DELETE CASCADE/g)?.length).toBe(3);
  });
});

describe('law 7 · a note, not a chat', () => {
  it('⛔ 140 characters is sent; 141 refuses the whole week — never cut short', () => {
    expect(coach.readCoachWeek(week('n'.repeat(140))).days[0].lifts[0].note).toHaveLength(140);
    expect(coach.readCoachWeek(week('n'.repeat(141)))).toBeNull();
    expect(coach.WEEK_LIMITS.note).toBe(140);
    // a template goes through the same reader as a sent week
    expect(routeBody.match(/readCoachWeek\(body\.week\)/g)?.length).toBe(2);
  });

  it('there is nowhere for prose to go: no message table, no message route', () => {
    expect(migration).not.toMatch(/CREATE TABLE \w*(message|chat|thread)/i);
    expect(coachSrc).not.toMatch(/['`]\/(me\/)?coach\/(message|chat|thread)/i);
  });
});

describe('law 8 · account deletion cascades', () => {
  const del = indexSrc.slice(indexSrc.indexOf("path === '/account/delete'"), indexSrc.indexOf("path === '/circle/create'"));

  it('⛔ the coach track goes FIRST, and a failure stops the deletion with a retryable 503', () => {
    const cascade = del.indexOf('await coachAccountDeleted(env, sub);');
    expect(cascade).toBeGreaterThan(-1);
    expect(cascade).toBeLessThan(del.indexOf('await userOf(env, sub)'));
    expect(cascade).toBeLessThan(del.indexOf('env.HUSH_KV.delete'));
    expect(del).toMatch(/await coachAccountDeleted\(env, sub\);\s*\} catch \{\s*return json\(503, \{ error: 'unavailable' \}\);/);
  });

  it('as a coach: links ended, invites and templates deleted', () => {
    const fn = coachSrc.slice(coachSrc.indexOf('export async function coachAccountDeleted'), coachSrc.indexOf('export async function purgeCoach'));
    expect(fn).toContain("UPDATE coach_links SET ended_at = ? WHERE coach_sub = ? AND ended_at IS NULL");
    expect(fn).toContain("DELETE FROM coach_invites WHERE coach_sub = ?");
    expect(fn).toContain("DELETE FROM coach_templates WHERE coach_sub = ?");
  });

  it('as a trainee: every upload deleted now, the link ended', () => {
    const fn = coachSrc.slice(coachSrc.indexOf('export async function coachAccountDeleted'), coachSrc.indexOf('export async function purgeCoach'));
    expect(fn).toContain('DELETE FROM coach_sessions WHERE link_id IN (SELECT id FROM coach_links WHERE trainee_sub = ?)');
    expect(fn).toContain('DELETE FROM coach_cardio WHERE link_id IN (SELECT id FROM coach_links WHERE trainee_sub = ?)');
    expect(fn).toMatch(/UPDATE coach_links SET ended_at = COALESCE\(ended_at, \?\).*WHERE trainee_sub = \?/);
  });
});

describe('the deploy cannot break what already works', () => {
  it('no database → 503 coach_not_configured, and the binding is optional in the type', () => {
    expect(coachSrc).toContain("if (!db) return json(503, { error: 'coach_not_configured' });");
    expect(indexSrc).toContain('COACH_DB?: D1Database;');
    expect(toml).toContain('binding = "COACH_DB"');
    expect(toml).toContain('migrations_dir = "migrations"');
  });
});
