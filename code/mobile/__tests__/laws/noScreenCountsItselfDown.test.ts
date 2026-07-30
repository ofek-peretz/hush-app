/**
 * NO WORKOUT SCREEN COUNTS ITSELF DOWN (founder, build 36 — A.11 / C.14).
 *
 * *"Remove from every workout screen the line saying it moves on in 3 seconds — the text AND the
 * bar itself."*
 *
 * Four surfaces did it, in the same shape: a legend narrating the wait ("Set 3 begins in 3",
 * "Logged · rest begins in 3", "Logged · back to run in 3") over a filling progress track. Each
 * beat already lasts a breath and then hands over on its own; describing that, and then drawing a
 * bar to watch while it happens, made the athlete wait ON PURPOSE — it turned a transition into a
 * thing to look at. The beat still lasts exactly as long. Only the narration is gone.
 *
 * This is a copy law rather than a render test because the offence is a KIND of sentence, and the
 * next one would arrive under a new key on a new screen. Screens are checked for the machinery
 * (a "track"/"fill" pair beside a countdown) by their own render tests; what cannot be re-added
 * quietly is the sentence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = join(__dirname, '../../src/i18n/locales');

/** Every leaf string in a locale file, with its dotted key. */
function strings(locale: string): { key: string; text: string }[] {
  const json = JSON.parse(readFileSync(join(LOCALES, `${locale}.json`), 'utf8')) as Record<string, unknown>;
  const out: { key: string; text: string }[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') return void out.push({ key: path, text: node });
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(json, '');
  return out;
}

/**
 * A sentence that narrates its own screen's dwell. It names something that is ABOUT to happen by
 * itself, and counts the seconds — `{{n}}` / `{{s}}` beside "begins in" / "back to" / "in N".
 * The cardio 3·2·1 START countdown is a different thing entirely: the athlete is being counted
 * INTO an act she chose, not told to watch a screen expire.
 */
const COUNTS_ITSELF_DOWN = /(begins in|back to \w+ in|resumes in|continues in|moves on in)\s*\{\{[nsm]\}\}/i;

describe('no workout screen counts itself down', () => {
  for (const locale of ['en', 'he'] as const) {
    it(`${locale} carries no self-narrating dwell`, () => {
      const offenders = strings(locale)
        .filter(({ text }) => COUNTS_ITSELF_DOWN.test(text))
        .map(({ key, text }) => `${key} — "${text}"`);
      expect({ [`${locale}CountdownCopy`]: offenders }).toEqual({ [`${locale}CountdownCopy`]: [] });
    });
  }

  it('the three keys the founder had removed are gone from both locales', () => {
    const gone = ['workout.setBeginsIn', 'workout.restBeginsIn', 'workout.loggedRestBeginsIn', 'cardio.kmMomentBack'];
    for (const locale of ['en', 'he'] as const) {
      const keys = new Set(strings(locale).map((s) => s.key.replace(/_(one|other|female|male)$/, '')));
      expect({ locale, stillPresent: gone.filter((k) => keys.has(k)) }).toEqual({ locale, stillPresent: [] });
    }
  });

  it("the guard is not vacuous — it would catch the sentence that was there", () => {
    // The exact string that shipped in build 36. If the regex ever stops matching it, the law has
    // quietly stopped guarding anything.
    expect(COUNTS_ITSELF_DOWN.test('Set {{n}} begins in {{s}}')).toBe(true);
    expect(COUNTS_ITSELF_DOWN.test('Logged · rest begins in {{n}}')).toBe(true);
    expect(COUNTS_ITSELF_DOWN.test('Logged · back to run in {{n}}')).toBe(true);
    // …and that it does not sweep up the cardio START countdown, which is a different act.
    expect(COUNTS_ITSELF_DOWN.test('Go')).toBe(false);
    expect(COUNTS_ITSELF_DOWN.test('{{count}} workouts left in your trial')).toBe(false);
  });
});
