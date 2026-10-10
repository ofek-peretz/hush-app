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
// @ts-nocheck

// 

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

  /**
   * THE SCREEN THAT EXPLAINS THE ENGINE MAY NOT EXPLAIN A DIFFERENT ENGINE.
   *
   * "Why this load" is the one surface whose entire job is the engine's reasoning, and on
   * 2026-07-17 every sentence in it was v4's, in both locales:
   *
   *   · `note`     — "I never move a load on a single session. I read the pattern, then act."
   *                  The exact OPPOSITE of v5. Loop 1 moves the next set's load from the set she
   *                  just finished, mid-workout, and L7 decides at the end of EVERY workout.
   *   · `lineUp`   — "Your last SESSIONS cleared the top of the range" — the engine reads the last
   *                  OCCURRENCE, not a multi-session pattern.
   *   · `learning` — "From NEXT WEEK I match the loads…" — there is no next week.
   *   · `learningTitle` — "A WEEK of getting to know each other" — the first SET measures her.
   *
   * This is the worst class of the lot: an athlete who taps "why" is asking the product to explain
   * itself, and it described a machine that was deleted.
   */
  it('the "why this load" sheet describes THIS engine — it decides per set and per workout', () => {
    for (const loc of [en, he] as Tree[]) {
      const flat = flatten(loc);
      const why = (k: string) => (flat.find(([x]) => x === `whyLoad.${k}`) ?? ['', ''])[1];

      // The engine acts on ONE session — that is L7's whole point. Any claim that it waits for a
      // pattern, or refuses to act on a single session, is v4 talking.
      for (const k of ['note', 'lineUp', 'lineDown', 'lineHold', 'learning', 'learningTitle']) {
        expect({ key: `whyLoad.${k}`, copy: why(k) }).toEqual({
          key: `whyLoad.${k}`,
          copy: expect.not.stringMatching(/never move a load|read the pattern|next week|השבוע הבא|הדפוס|אימון אחד/i),
        });
      }
    }
  });

  /**
   * A STEP MAY NOT BE NAMED AFTER A CONTROL IT NO LONGER HAS.
   *
   * The schedule step asks ONE thing: sessions per week. Experience was cut with v5 (the first set
   * measures her, so a self-report never touches a load) and the wheel went with it — but on
   * 2026-07-17 the screen was still TITLED `ob.trainTitle` = "Experience and frequency", over a sub
   * that was entirely about experience ("Experience only sets the starting point…"), in both
   * locales. A screen introducing a control that is not on it.
   *
   * Scoped to this step's own keys rather than a global ban on the word: "the best training
   * EXPERIENCE in the world" is a different sense of the word, and a law that cannot tell the two
   * apart would either miss this or force a rewrite of the front door's hero line.
   */
  it('the schedule step does not name a control it no longer has', () => {
    for (const loc of [en, he] as Tree[]) {
      const flat = flatten(loc);
      for (const key of ['ob.trainTitle', 'ob.trainSub']) {
        const v = (flat.find(([k]) => k === key) ?? ['', ''])[1];
        expect({ key, copy: v, mentionsExperience: /experience|ניסיון/i.test(v) }).toEqual({
          key,
          copy: v,
          mentionsExperience: false,
        });
      }
    }
  });

  /**
   * SEX DOES NOT SHAPE THE PROGRAMME. It seeds ONE number and is then overwritten.
   *
   * This is the deepest v4 rule of them all — the gendered split — and the body map exists to kill
   * it. The brief is blunt about the screen that asks: "Say plainly what sex is for now: a physical
   * seed for the first starting weight… **not** what they train."
   *
   * `ob.sexWhy` was still shipping "starting loads and **weekly volume**" in BOTH locales on
   * 2026-07-17. Weekly volume comes from `weeklyTargets(map)` and `STARTING_WEEKLY_SETS` — the body
   * map's stance — and nothing in `src/engine/v5` reads sex at all. Sex reaches exactly one line of
   * code: a `sexFactor` on the first prescribed load (`domain/startingLoad`), which the athlete's
   * own first session then replaces.
   *
   * So the line was telling every new athlete, on the step where she states her sex, that it would
   * shape how much she trains. That is v4's central claim, surviving as a caption.
   */
  it('no line claims sex shapes VOLUME — the body map does, and sex only seeds a first load', () => {
    const volumeFromSex = ALL.filter(
      ([, v]) =>
        /\bsex\b|\bמין\b|\bgender\b|\bמגדר\b/i.test(v) &&
        /\bvolume\b|\bנפח\b|how (much|many)|what you train|מה (אתה |את )?מאמנ?/i.test(v),
    ).map(([k, v]) => `${k} — "${v}"`);
    expect({ sexShapingTheProgramme: volumeFromSex }).toEqual({ sexShapingTheProgramme: [] });

    // The caption this rule was written against (`ob.sexWhy*`) is DELETED — founder 2026-07-28: a
    // note defending a control nobody had objected to, pointing at a body map two steps ahead that
    // she has not seen. So the assertion above is the whole law now, and it is the stronger half:
    // it scans EVERY line in both locales rather than one key, so the claim cannot come back under
    // a different name. Reading the dead key here would have been an assertion about nothing.
    expect(flatten(en as Tree).some(([k]) => k.startsWith('ob.sexWhy'))).toBe(false);
    expect(flatten(he as Tree).some(([k]) => k.startsWith('ob.sexWhy'))).toBe(false);
  });

  /**
   * HEART RATE IS SHOWN, NEVER USED TO DECIDE — and the screen that asks for it must say so.
   *
   * The brief makes this an ENGINE LAW, not a nicety: "it must state the truth: heart rate and
   * cardio are shown, never used to decide anything." The Health step asked for the permission and
   * said only what it would READ. The Hebrew went further and sold ("to give you the best
   * experience") — a claim Hush cannot measure, on a screen the brief says sells nothing.
   */
  it('the Health step says the data is shown and never decides anything', () => {
    for (const loc of [en, he] as Tree[]) {
      const sub = (flatten(loc).find(([k]) => k === 'ob.healthSub') ?? ['', ''])[1];
      expect(sub).toMatch(/never decide|never change|לא קובעים|לא משנים/i);
    }
  });
});
