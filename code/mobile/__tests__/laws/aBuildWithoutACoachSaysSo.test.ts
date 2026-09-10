// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A BUILD THAT CANNOT REACH THE COACH IS A BUILD THAT CANNOT DO ANYTHING.
 *
 * ⛔ FOUND ON THE DEVICE, 2026-08-02, by the founder: every message in the intake said "not sent".
 *
 * `EXPO_PUBLIC_COACH_URL` and `EXPO_PUBLIC_COACH_TOKEN` live in `.env`. `.env` is gitignored — it
 * has to be — so **EAS never uploaded it**, `eas.json` declared no `env` block, and the EAS project
 * had no environment variables at all. Both values were inlined into the bundle as empty strings,
 * `coachIsReachable()` returned false, and every single message failed instantly without a request
 * ever being made.
 *
 * The app is a conversation with a coach. Onboarding cannot be finished without one. So this was
 * not a degraded build — **it was a build that could not be used at all**, and it went to TestFlight
 * looking exactly like a working one.
 *
 * ── WHY NOBODY CAUGHT IT ────────────────────────────────────────────────────────────────────────
 * The whole chain was verified from the BROWSER, which reads the local `.env` and therefore always
 * had them. "App → Worker → Gemini, live end to end" was true of the harness and had never once
 * been true of a build. The same shape as every other defect this week: the thing that proves it
 * works is not the thing that ships.
 *
 * ── WHAT THIS FILE CAN AND CANNOT DO ────────────────────────────────────────────────────────────
 * It cannot read EAS's server-side variables. What it CAN do is make the requirement impossible to
 * forget: the names are declared here, and anyone who adds a third public variable to the client is
 * told, in a failing test, that a build needs to be given it somewhere other than `.env`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Every `EXPO_PUBLIC_*` the app reads, and where a BUILD is given it.
 *
 * `.env` covers a developer's machine and the web harness. A cloud build sees none of it: the file
 * is gitignored and never uploaded. These live in EAS project variables
 * (`eas env:create --environment production`), which is the only place a build can get them.
 */
const REQUIRED_AT_BUILD = ['EXPO_PUBLIC_COACH_URL', 'EXPO_PUBLIC_COACH_TOKEN'];

describe('a build has to be given what the app reads', () => {
  it('⚠️ every EXPO_PUBLIC var the app reads is one somebody has thought about', () => {
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name)) {
          for (const m of read(rel).matchAll(/process\.env\.(EXPO_PUBLIC_\w+)/g)) used.add(m[1]);
        }
      }
    };
    walk('src');

    /*
     * The ones that are allowed to be absent, and why. Anything else that turns up here is a
     * variable a cloud build will inline as an empty string — which is exactly how a coach-less
     * build reached TestFlight looking like a working one.
     */
    const mayBeAbsent = [
      // ⛔ THREE GHOSTS EXORCISED (2026-08-25): `EXPO_PUBLIC_API_BASE_URL`,
      // `EXPO_PUBLIC_DEV_AUTH_TOKEN` and `EXPO_PUBLIC_ENROLL_KEY` sat here for the decommissioned
      // v4 backend. The code that read them (`data/api/config`, `enroll`, `selectModel`,
      // `httpClient`, `authEvents`) is deleted — founder: "איזה V4? אנחנו ב-v8" — so an allow-list
      // entry for them would be permission for a dead name to come back unnoticed.
      // Crash reporting (platform/crash, 2026-08-24). Absent => Sentry never initializes — dev,
      // CI and the web harness stay silent BY CONSTRUCTION, which is the intended off-switch.
      // A production build gets it from EAS env (`eas env:create`), like the coach pair above.
      'EXPO_PUBLIC_SENTRY_DSN',
      // The circle's identity worker (platform/circleClient, 2026-08-24). Absent => the circle
      // does not exist in this build: Together draws its pre-circle self, every call answers
      // null, nothing throws. Set from EAS env once `server/hush-identity/src/index.ts` is deployed.
      'EXPO_PUBLIC_CIRCLE_URL',
      // The research sink (platform/telemetry, 2026-09-01, audit 01). An EXPLICIT override only:
      // absent, the sink derives from EXPO_PUBLIC_CIRCLE_URL (`<circle>/events`), and with neither
      // set the wire half is inert and the journal is the whole record — the pre-sink app, exactly.
      'EXPO_PUBLIC_TELEMETRY_URL',
      // Remote config (platform/remoteConfig, 2026-09-01, audit 03). Same shape: explicit override,
      // else derived `<circle>/config`, else inert — every compiled default stands.
      'EXPO_PUBLIC_CONFIG_URL',
    ];
    const unaccounted = [...used].filter((v) => !REQUIRED_AT_BUILD.includes(v) && !mayBeAbsent.includes(v));
    expect(unaccounted).toEqual([]);
  });

  it('the client treats an empty value as "not configured" rather than calling an empty URL', () => {
    // The one part of this the app itself gets right, and it must stay right: `fetch('')` would be
    // an unhandled failure instead of a state the product knows how to describe.
    const client = read('src/platform/coach/coachClient.ts');
    expect(client).toContain("process.env.EXPO_PUBLIC_COACH_URL || ''");
    expect(client).toContain('COACH_URL.length > 0 && COACH_TOKEN.length > 0');
  });

  it('names where a build gets them, so the next person does not have to find out the hard way', () => {
    // Prose, deliberately: this is the only place the answer can live, because the values
    // themselves must never be in the repo.
    expect(REQUIRED_AT_BUILD.length).toBe(2);
    // The values must never be in the repo, which is the whole reason a build has to be given them
    // somewhere else.
    // The repo root's ignore file, not the app's — which is itself part of the trap: a developer
    // looking for why `.env` did not reach a build will not find the answer inside `code/mobile`.
    expect(fs.readFileSync(path.join(ROOT, '..', '..', '.gitignore'), 'utf8')).toMatch(/^\.env$/m);
  });
});
