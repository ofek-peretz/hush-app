/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CIRCLE CARRIES ONE FACT AND NOTHING ELSE — founder authorization, 2026-08-24.
 *
 * The review's retention finding, in Hush's language: belonging works; feeds do not belong here.
 * A circle is up to six PARTNERS, and what crosses the wire is `domain/circle`'s allow-list —
 * a first name, workouts done of planned this week — with the server rebuilding the same
 * allow-list field-by-field so a tampered client still cannot store more. This law holds:
 *
 *   1 · the payload is the three named fields, first name only, honestly counted and bounded;
 *   2 · no URL → no circle: every client call answers null, Together draws its pre-circle self,
 *       and the env var is one somebody has thought about (`aBuildWithoutACoachSaysSo`);
 *   3 · the identity worker VERIFIES Apple's token (issuer, audience, signature) and enforces
 *       the allow-list and the six-member ceiling server-side;
 *   4 · the front door is real where the binary allows: native Sign in with Apple behind the
 *       same degrade-cleanly probe every native seam keeps, cancel leaves her where she stood.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';
import { circleWeekPayload, CIRCLE_PAYLOAD_KEYS } from '@/domain/circle';
import type { Session } from '@/data/local/models';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const readRepo = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', rel), 'utf8');

const session = (startedAt: string, trained = true): Session =>
  ({ id: `s_${startedAt}`, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false, trained, sets: [{ exerciseId: 'x', setIndex: 0, recommendedWeight: 60, recommendedReps: 8, actualWeight: 60, actualReps: 8, edited: false, persistedAt: startedAt }] }) as unknown as Session;

describe('1 · the payload is the allow-list, and the allow-list is three facts', () => {
  const weekOpen = Date.parse('2026-08-22T20:30:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;

  it('first name only, done counted from THIS week’s whole workouts, planned bounded', () => {
    const p = circleWeekPayload({
      name: 'Sigal Ben-David',
      sessions: [
        session(new Date(weekOpen + DAY).toISOString()),
        session(new Date(weekOpen + 2 * DAY).toISOString()),
        session(new Date(weekOpen + 3 * DAY).toISOString(), false), // a partial finishes nothing
        session(new Date(weekOpen - DAY).toISOString()), // last week is last week
      ],
      plannedPerWeek: 4,
      weekOpenMs: weekOpen,
    });
    expect(p).toEqual({ name: 'Sigal', done: 2, planned: 4 });
    expect(Object.keys(p!).sort()).toEqual([...CIRCLE_PAYLOAD_KEYS].sort()); // nothing rides along
  });

  it('a nameless athlete sends nothing at all', () => {
    expect(circleWeekPayload({ name: '  ', sessions: [], plannedPerWeek: 3, weekOpenMs: weekOpen })).toBeNull();
  });

  it('no load, no tonnage, no bodyweight can even be expressed — the type is the fence', () => {
    // CODE only — the header is allowed to NAME what it bans.
    const src = read('src/domain/circle.ts')
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
      })
      .join('\n');
    for (const banned of ['loadKg', 'tonn', 'weightKg', 'bodyMap', 'actualWeight']) {
      expect({ banned, present: src.includes(banned) }).toEqual({ banned, present: false });
    }
  });
});

describe('2 · no URL → no circle, and the build knows the variable', () => {
  it('every wire call gates on the build-time URL and a stored session', () => {
    const client = read('src/platform/circleClient.ts');
    expect(client).toContain("process.env.EXPO_PUBLIC_CIRCLE_URL || ''");
    expect(client).toContain('CIRCLE_URL.length > 0');
    expect(client).toContain('if (!circleAvailable()) return null;');
    expect(client).toContain('if (res.status === 401)'); // a lapsed session signs out, never wedges
  });

  it('Together draws the circle ONLY behind circleReady — no door to nowhere', () => {
    const together = read('src/screens/together/Together.tsx');
    expect(together).toContain('props.circleReady ? (');
    expect(read('__tests__/laws/aBuildWithoutACoachSaysSo.test.ts')).toContain('EXPO_PUBLIC_CIRCLE_URL');
  });
});

describe('3 · the identity worker verifies, rebuilds, and caps', () => {
  const worker = readRepo('server/hush-identity/src/index.ts');
  it('Apple’s token is verified: issuer, audience, expiry, RS256 signature against Apple’s keys', () => {
    expect(worker).toContain("https://appleid.apple.com");
    expect(worker).toContain("payload.aud !== BUNDLE_ID");
    expect(worker).toContain("'com.hushfitness.app'");
    expect(worker).toContain('RSASSA-PKCS1-v1_5');
    expect(worker).toContain('crypto.subtle.verify');
  });
  it('the week payload is rebuilt field-by-field server-side — unknown keys die on arrival', () => {
    expect(worker).toContain('function readWeekState');
    expect(worker).toMatch(/Math\.max\(0, Math\.min\(14/);
  });
  it('six partners, never an audience', () => {
    expect(worker).toContain('const MAX_MEMBERS = 6;');
    expect(worker).toContain('circle_full');
  });
});

describe('4 · the front door is real where the binary allows', () => {
  const auth = read('src/platform/auth.ts');
  it('native Sign in with Apple behind the standing probe; cancel leaves her where she stood', () => {
    expect(auth).toContain("requireOptionalNativeModule?.('ExpoAppleAuthentication')");
    expect(auth).toContain('ERR_REQUEST_CANCELED');
    expect(auth).toContain('SignInCanceledError');
  });
  it('the config plugin declares the entitlement (EAS syncs the capability itself)', () => {
    const app = JSON.parse(read('app.json'));
    expect(app.expo.plugins).toContain('expo-apple-authentication');
  });
  it('sign-in trades the fresh token for the circle session, fire-and-forget', () => {
    expect(read('src/state/stores/appStore.tsx')).toContain('void circleExchange(result.identityToken)');
  });
});
