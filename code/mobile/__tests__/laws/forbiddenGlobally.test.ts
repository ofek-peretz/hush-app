/**
 * §8.9 "Forbidden globally" regression guard. Scans the entire copy resource
 * for vocabulary the product bans forever (spec §4.1, §4.10, §8.9; UX Law 10/11).
 * This catches a future copy change that would re-introduce streaks, praise,
 * gamification, effort input, or interpreting language.
 */
import en from '@/i18n/locales/en.json';

const DENYLIST: { re: RegExp; why: string }[] = [
  { re: /\bstreaks?\b/i, why: 'no streaks (§8.9, Law 10)' },
  { re: /\bxp\b/i, why: 'no XP (§8.9)' },
  { re: /\bbadges?\b/i, why: 'no badges (§8.9)' },
  { re: /\bcalor/i, why: 'no calories (§4.1)' },
  { re: /\bweather\b/i, why: 'no weather (§4.1)' },
  { re: /\bgamif/i, why: 'no gamification (Law 10)' },
  { re: /\b(rpe|rir)\b/i, why: 'no effort input (Law 11)' },
  { re: /great session/i, why: 'History never interprets (§4.10)' },
  { re: /pr achieved/i, why: 'History never interprets (§4.10)' },
  { re: /recovery improved/i, why: 'History never interprets (§4.10)' },
  { re: /strong workout/i, why: 'History never interprets (§4.10)' },
  { re: /performance increased/i, why: 'History never interprets (§4.10)' },
  { re: /great job/i, why: 'no praise (Law 10)' },
  { re: /don'?t break/i, why: 'no streak guilt (Law 10)' },
  // Decision 1 (2026-06-14): no explicit time horizons until validated. Bans
  // duration/horizon expressions ("in two weeks", "eight weeks", "weeks ago"),
  // NOT structural weekly cadence ("this week's program", "days a week").
  { re: /\bin\s+(a|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(week|day|month)s?\b/i, why: 'no timing horizon (Decision 1)' },
  { re: /\b(week|day|month)s?\s+ago\b/i, why: 'no past timeframe (Decision 1)' },
  { re: /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(week|month)s?\b/i, why: 'no duration horizon (Decision 1)' },
  { re: /give me\s+\w+\s+weeks?/i, why: 'no timing promise (Decision 1)' },
];

function values(node: unknown, out: { path: string; v: string }[], path = ''): void {
  if (typeof node === 'string') {
    if (!path.split('.').pop()?.startsWith('_comment')) out.push({ path, v: node });
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
      values(child, out, path ? `${path}.${k}` : k);
    }
  }
}

describe('forbidden vocabulary never appears in copy', () => {
  const all: { path: string; v: string }[] = [];
  values(en, all);

  for (const { re, why } of DENYLIST) {
    it(why, () => {
      const hits = all.filter((x) => re.test(x.v));
      expect(hits.map((h) => `${h.path}: "${h.v}"`)).toEqual([]);
    });
  }
});
