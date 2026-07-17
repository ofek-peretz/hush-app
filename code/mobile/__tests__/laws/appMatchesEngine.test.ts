/**
 * THE APP MAY NOT CONTRADICT THE ENGINE.
 *
 * v5 did not tune v4 — it REPLACED it, and it reversed v4's two central rules. Copy written for the
 * old engine does not fail a typecheck, does not fail a render test, and does not look like a bug.
 * It just quietly tells the athlete something that is not true, in Hush's voice, with Hush's
 * authority. Every instance found on 2026-07-17 had been shipping:
 *
 *   · `complete.saturday` — "What you lifted this week sets **next week's** loads." v5 sets them at
 *     the END OF THE WORKOUT (register L7 — there is no weekly boundary). Saturday only MIRRORS
 *     decisions already told (S-45).
 *   · `ob.readyBody` — "every Saturday at 20:30 I read how your week went and show you exactly what
 *     I changed." The FIRST promise Hush ever makes, and it described v4.
 *   · `ob.buildStep2` — "Designing your split." There is no split. `MEN_SPLITS`/`WOMEN_SPLITS` are
 *     fully deleted (register Part 5): "structure is an OUTPUT of volume, never a shelf chosen by
 *     sex × days."
 *
 * This file is the guard. It reads the SHIPPED COPY and refuses the v4 world, in both locales — the
 * Hebrew is where it would hide longest.
 */
import en from '@/i18n/locales/en.json';
import he from '@/i18n/locales/he.json';

type Tree = Record<string, unknown>;

/** Every leaf string in a locale, keyed by its dotted path. */
function flatten(tree: Tree, prefix = ''): Array<[string, string]> {
  return Object.entries(tree).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v as Tree, `${prefix}${k}.`)
      : typeof v === 'string'
        ? [[`${prefix}${k}`, v] as [string, string]]
        : [],
  );
}

const EN = flatten(en as Tree);
const HE = flatten(he as Tree);
const ALL = [...EN.map(([k, v]) => [`en:${k}`, v] as const), ...HE.map(([k, v]) => [`he:${k}`, v] as const)];

/** Copy that talks about SPLITS as a thing Hush picks or designs. Cardio "splits" are kilometres. */
const CARDIO_SPLIT = /^(en|he):cardio\./;

describe('there is no SPLIT — structure is an output of volume (register Part 5)', () => {
  it('no line offers, designs or picks a split', () => {
    // The demographic split is deleted from the engine entirely. A screen that says Hush "designs
    // your split" describes a shelf that no longer exists, and re-teaches the mental model the body
    // map replaced.
    const offenders = ALL.filter(
      ([k, v]) => !CARDIO_SPLIT.test(k) && /\b(your|a|the) split\b|\bsplits?\b.*\b(design|choose|pick|build)/i.test(v),
    );
    expect(offenders).toEqual([]);
  });

  it('no line promises a template or a plan to browse', () => {
    // The brief: "Not a template shop. The athlete does not browse and assemble a plan. Hush builds it."
    // Scoped to TRAINING copy: "Choose a plan when you're ready" on the paywall is a SUBSCRIPTION
    // plan, and the athlete really does choose one. The law is about the programme.
    const offenders = ALL.filter(
      ([k, v]) =>
        !/^(en|he):(profile|paywall|subscription)\./.test(k) &&
        /\b(choose|pick|browse|select) (a|your) (plan|programme|program|template)\b/i.test(v),
    );
    expect(offenders).toEqual([]);
  });
});

describe('the decision is made when the WORKOUT ends — never on a schedule (register L7)', () => {
  it('no line says a week of lifting sets NEXT week\'s loads', () => {
    // v4's rule, and the exact sentence Complete used to close on.
    const offenders = EN.filter(([, v]) => /next week'?s? (loads?|weights?)/i.test(v));
    expect(offenders).toEqual([]);
  });

  it('no line promises that Saturday is when loads CHANGE', () => {
    // Saturday mirrors (S-45) — it decides nothing. Copy may say Hush SHOWS or READS the week then;
    // it may not say Hush changes, sets, adjusts or updates anything then.
    // Saturday may SHOW, READ or MIRROR. It may not CHANGE, SET, ADJUST or UPDATE. Matched
    // ADJACENTLY, not "somewhere in the same string": a line that says "I set your next weights at
    // the end of every workout. Every Saturday I show you the whole week" is exactly the truth, and
    // a looser rule would refuse it.
    const near = /\b(change|set|adjust|updat)\w*\b[^.!?]{0,40}\bsaturday\b|\bsaturday\b[^.!?]{0,40}\b(change|set|adjust|updat)\w*\b/i;
    const offenders = EN.filter(([, v]) => near.test(v));
    expect(offenders).toEqual([]);
  });

  it('the hand-off promises the per-workout decision, because that is the deal', () => {
    // Not just "does not lie" — the FIRST promise Hush makes has to state the real one.
    const ready = (en as Tree).ob as Tree;
    expect(String(ready.readyBody)).toMatch(/end of every workout/i);
  });
});

describe('Hush never claims work it does not do', () => {
  it('the build steps name real assembly, in the order the engine really runs it', () => {
    // `programAssembly.ts:156` — weeklyTargets(map) → assignRegionDays(targets, days) → exercises →
    // seeds. Volume FIRST; the week's shape FOLLOWS from it. The old copy inverted the two and
    // invented a third that does not exist.
    const ob = (en as Tree).ob as Tree;
    expect(String(ob.buildStep1)).toMatch(/map/i); // the map is read first — everything follows from it
    expect(String(ob.buildStep2)).toMatch(/muscle/i); // then each muscle's volume
    expect(String(ob.buildStep3)).toMatch(/week/i); // …and the week is SHAPED AROUND that
    expect(String(ob.buildStep4)).toMatch(/weight|load/i); // seeds last
  });

  it('no build step states a figure — nothing on that screen is measuring anything', () => {
    // The pacing is a clock, not an observation (ProgramCreated: fixed marks at 700/1400/2100/2800).
    // A step that claimed a count or an outcome would be a claim Hush did not measure (R7).
    const ob = (en as Tree).ob as Tree;
    for (const k of ['buildStep1', 'buildStep2', 'buildStep3', 'buildStep4']) {
      expect(String(ob[k])).not.toMatch(/\d|\{\{/);
    }
  });
});

describe('the v4 world is gone from the copy, in both locales', () => {
  it('nothing survives that only made sense under the old engine', () => {
    // Hebrew is where a stale line hides longest — nobody re-reads it.
    const dead: Array<[RegExp, string]> = [
      [/experience level|רמת ניסיון/i, 'experience is deleted — the first set measures her (register Part 9 §A)'],
      [/\btoning\b|\bחיטוב\b/i, 'hypertrophy is the only goal'],
      [/lock(ed)? (in )?your (week|program)/i, 'the Lock System is deleted'],
    ];
    const offenders = ALL.flatMap(([k, v]) => dead.filter(([re]) => re.test(v)).map(([, why]) => `${k} — ${why}`));
    expect(offenders).toEqual([]);
  });
});
