import fs from 'fs';
import path from 'path';
import { coachFacts } from '@/domain/coachFacts';
import type { Profile, Program, Session } from '@/data/local/models';

/**
 * ════ THE SHEET NAMES EVERY FIELD IT SENDS ════
 *
 * `coachFacts` is the one place in this app where local data leaves the device. What it carries is
 * therefore not a style question.
 *
 * The failure this prevents is not a bug anyone would write on purpose — it is a bug that arrives
 * LATER, by itself. Write `athlete: { ...profile }` and the sheet is correct today; then someone
 * adds an email, a device id or a health identifier to `Profile` for an unrelated reason, and that
 * field starts travelling to a third party on the next build, silently, with no diff that mentions
 * it. `domain/planShare` already established the rule for the share link. This is the same rule for
 * a bigger surface.
 *
 * So: every field is written by hand, and a spread of a source object anywhere in the builder fails
 * the build. Spreads of the sheet's OWN local literals are fine — they carry nothing they were not
 * already given — so the law names the sources rather than banning the syntax.
 */

const FILE = path.join(__dirname, '..', '..', 'src', 'domain', 'coachFacts.ts');

/**
 * The inputs whose contents must never be splatted wholesale into an outgoing object.
 *
 * The check looks for an OBJECT spread — `{ ...profile }` — because that is what forwards fields the
 * sheet never named. An ARRAY spread (`[...history]`) is a local copy taken before a sort; it emits
 * nothing by itself, and banning it would only push the sort somewhere less obvious.
 */
const SOURCES = ['profile', 'program', 'history', 'justFinished', 'src', 'ex', 'e', 'x', 's', 'p'];

/**
 * The file with its comments blanked to spaces (offsets preserved, so line numbers stay true).
 * Without this the law reads the prose that QUOTES the forbidden pattern and fails on a comment
 * explaining why the pattern is forbidden — which would teach the next reader to delete the
 * explanation rather than obey it.
 */
function code(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

describe('the sheet names every field it sends', () => {
  it('never spreads a source object into the outgoing sheet', () => {
    const src = code(fs.readFileSync(FILE, 'utf8'));
    const offenders: string[] = [];
    for (const name of SOURCES) {
      // `{ ...profile }` / `{ ...profile.bodyMap }` — an object spread rooted at a source we did
      // not author, which is exactly how an unnamed field starts travelling.
      const re = new RegExp(`\\{\\s*\\.\\.\\.${name}(?![A-Za-z0-9_])`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`coachFacts.ts:${line} — spreads \`${name}\``);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sends nothing from a profile field the sheet has never heard of', () => {
    // A profile carrying a field added tomorrow. If the builder spread it, the value would appear
    // in the JSON. It must not — this is the law's real assertion, not the syntax check above.
    const profile = {
      sex: 'male',
      weightKg: 80,
      units: 'kg',
      goal: 'hypertrophy',
      daysPerWeek: 3,
      healthConnected: true,
      name: 'Ofek Peretz',
      email: 'someone@example.com',
      heightCm: 181,
      age: 34,
      memberSince: '2026-01-01',
      appleHealthId: 'HK-9917-SECRET',
      pushToken: 'apns-token-do-not-send',
    } as unknown as Profile;

    const program: Program = { id: 'p', frequency: 3, days: [] };
    const history: Session[] = [];
    const json = JSON.stringify(coachFacts({ profile, program, history }));

    for (const leak of ['Ofek', 'Peretz', 'example.com', 'HK-9917-SECRET', 'apns-token', '181', '2026-01-01']) {
      expect({ leak, present: json.includes(leak) }).toEqual({ leak, present: false });
    }
    // And the fields that ARE hers to send are still there.
    expect(json).toContain('"weightKg":80');
    expect(json).toContain('"daysPerWeek":3');
  });

  it('passes the coach’s own brief back untouched, and omits it when there is none', () => {
    const profile = {
      sex: 'female', weightKg: 62, units: 'kg', goal: 'hypertrophy', daysPerWeek: 4, healthConnected: false,
    } as unknown as Profile;
    const program: Program = { id: 'p', frequency: 4, days: [] };
    const brief = 'Plays 5-a-side Thursdays. Right hamstring tweaked twice, both times sprinting cold.';

    const withBrief = coachFacts({ profile, brief, program, history: [] });
    // Byte for byte: nothing summarises the summariser, and nothing parses it either.
    expect(withBrief.athlete.brief).toBe(brief);

    // Absent, not empty. An athlete who has not been through the intake has no brief; an empty
    // string would read to the coach as "I asked her and she said nothing".
    expect('brief' in coachFacts({ profile, program, history: [] }).athlete).toBe(false);
  });

  it('reaches the network through nothing — the builder is pure', () => {
    const src = code(fs.readFileSync(FILE, 'utf8'));
    for (const forbidden of ['fetch(', 'httpClient', 'axios', 'from \'@/data/local/db\'', 'AsyncStorage']) {
      expect({ forbidden, present: src.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });
});
