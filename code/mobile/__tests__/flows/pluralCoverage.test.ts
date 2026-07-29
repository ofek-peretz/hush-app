/**
 * Plural coverage — every locale must supply every plural form its LANGUAGE has.
 *
 * Found 2026-07-12. Hebrew has a DUAL: `Intl.PluralRules('he').select(2) === 'two'`. Three
 * keys in he.json carried only `_one` and `_other`, so for exactly two of anything i18next
 * resolved nothing in Hebrew and fell back to `en` — printing an English sentence into a
 * Hebrew screen ("2 sessions left", "moved across 2 weeks"). Two of the three predate the
 * design batch, which means this had been shipping.
 *
 * It is invisible in review (the keys look complete), invisible in a typecheck, and invisible
 * in the app unless a tester happens to have exactly two of something. So it is a test.
 */
import en from '@/i18n/locales/en.json';
import he from '@/i18n/locales/he.json';

type Tree = { [k: string]: string | Tree };

const LOCALES: Array<{ tag: 'en' | 'he'; resource: Tree }> = [
  { tag: 'en', resource: en as unknown as Tree },
  { tag: 'he', resource: he as unknown as Tree },
];

const SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Every dotted key in a locale resource. */
function flatten(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : flatten(v, `${prefix}${k}.`),
  );
}

/**
 * The plural categories a language actually uses for CARDINAL counts, straight from ICU —
 * never a hand-maintained list, which is exactly how the Hebrew dual went missing.
 */
function categoriesFor(tag: string): Set<string> {
  const pr = new Intl.PluralRules(tag);
  const out = new Set<string>();
  // 0–200 covers every rule boundary in every language Hush is likely to add (Arabic's
  // `zero`/`few`/`many`, Russian's `few`/`many`, Hebrew's `two`, Welsh's `three`…).
  for (let n = 0; n <= 200; n++) out.add(pr.select(n));
  return out;
}

describe('every locale carries every plural form its language has', () => {
  for (const { tag, resource } of LOCALES) {
    const keys = flatten(resource);
    const bases = new Set(keys.filter((k) => SUFFIX.test(k)).map((k) => k.replace(SUFFIX, '')));
    const needed = categoriesFor(tag);

    it(`${tag}: every pluralised key carries every category ICU can select`, () => {
      expect(bases.size).toBeGreaterThan(0); // otherwise this test passes vacuously

      const missing: string[] = [];
      for (const base of bases) {
        const have = new Set(
          keys.filter((k) => k.startsWith(`${base}_`) && SUFFIX.test(k)).map((k) => k.match(SUFFIX)![1]),
        );
        for (const category of needed) {
          if (!have.has(category)) missing.push(`${base}_${category}`);
        }
      }
      // Listed, not counted — a failure should name the exact keys to write.
      expect(missing).toEqual([]);
    });
  }

  it('Hebrew really does have a dual (the bug this test exists for)', () => {
    expect(new Intl.PluralRules('he').select(2)).toBe('two');
    expect(new Intl.PluralRules('en').select(2)).toBe('other');
  });

  it('the two locales agree on which keys are plural at all', () => {
    // A key pluralised in one locale and flat in the other resolves inconsistently.
    //
    // The GENDER context is stripped first, and it has to be: Hebrew conjugates a sentence that
    // counts things, so `weekly.intro` legitimately becomes `intro_female_one / _two / _other`,
    // while English has no context at all (`useCopy` injects it only for `he`). Comparing the raw
    // stems would read `weekly.intro_female` as a Hebrew-only PLURAL key and fail — punishing the
    // locale for having the grammar this whole file exists to serve.
    const basesOf = (r: Tree) =>
      new Set(
        flatten(r)
          .filter((k) => SUFFIX.test(k))
          .map((k) => k.replace(SUFFIX, '').replace(/_female$/, '')),
      );
    expect([...basesOf(en as unknown as Tree)].sort()).toEqual([...basesOf(he as unknown as Tree)].sort());
  });
});
