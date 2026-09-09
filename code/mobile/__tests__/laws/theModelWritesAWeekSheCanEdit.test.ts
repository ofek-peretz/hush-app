/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE MODEL MAY WRITE HER WEEK — AND ONLY AS A DRAFT, AND ONLY FAST.
 *
 * ⛔ FOUNDER, 2026-08-29: *"עכשיו אני דווקא כן חושב שצריך להחזיר את הבינה המלאכותית בעת בניית תוכנית
 * האימון כי היא עושה את זה כל כך טוב עבור כל מטרה … הבעיה שהייתה בפעם הקודמת היא שזה לקח המון המון
 * זמן … כשאני משוחח עם gemini באפליקציה של גוגל הוא בונה לי תוכנית תוך 10 שניות."*
 *
 * The call was removed on 2026-08-10 for one reason and it is worth stating plainly, because this
 * file exists to stop the reason coming back with the feature: **the wait, not the answer.** The
 * measurements are the worker's own — a 34,878-character preamble, a four-deep required schema that
 * was ALSO printed in the prompt, the full coach catalogue with columns a build cannot use, and a
 * hedge that fires two more whole calls at 20s. Halving the preamble alone took the same call from
 * a 125-second Cloudflare cut-off to 15.7 seconds.
 *
 * So the guarantees below are of two kinds, and both are structural rather than advisory:
 *
 *   1 · **IT CANNOT GET SLOW AGAIN.** The prompt has no coach preamble, the catalogue is the lean
 *       `id = Name` line, and the schema is two deep with no prose copy of itself. Each of those is
 *       asserted, because each was a measured cause.
 *   2 · **IT CANNOT PRESCRIBE, AND IT CANNOT COMMIT.** No load, no reps, no rest anywhere in the
 *       schema — the engine's three jobs are out of reach by shape. The answer becomes a builder
 *       DRAFT she edits and seals; nothing it says reaches disk unread.
 *
 * ⚠️ AND IT CAN NEVER STRAND HER. Every failure path falls through to the local assembler — the
 * thing this door did on its own for nineteen days — which is what makes the reversal safe.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';

import { EXERCISES, exerciseById, isSwapOnly } from '@/data/exercises';
import { BUILD_WEEK_SCHEMA, buildWeekRequest, BUILD_MAX_DAYS, BUILD_MAX_LIFTS, BUILD_MIN_DAYS } from '@/domain/buildPrompt';
import { readCoachWeek, draftFromCoachWeek } from '@/domain/coachDraft';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { PLAN_BUILD_BUDGET_MS, PLAN_BUILD_SAID_MS } from '@/platform/coach/planBuild';
import { BUILDER_SETS_MAX, BUILDER_SETS_MIN, builderMinutes, sealAuthored } from '@/domain/planBuilder';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** A well-formed answer, of the shape the schema demands. */
const week = {
  days: [
    {
      name: 'Push',
      lifts: [
        { ex: 'bb_bench_press', sets: 4 },
        { ex: 'bb_overhead_press', sets: 3 },
        { ex: 'incline_db_press', sets: 3 },
        { ex: 'triceps_pushdown', sets: 3 },
      ],
    },
    {
      name: 'Pull',
      lifts: [
        { ex: 'bb_row', sets: 4 },
        { ex: 'lat_pulldown', sets: 3 },
        { ex: 'face_pull', sets: 3 },
        { ex: 'db_curl', sets: 3 },
      ],
    },
  ],
};

/* The catalogue's own heading — the seam between "what it is told" and "what it may name". The
   word also appears INSIDE an instruction, so slicing on the bare word cuts the rules in half. */
const CATALOGUE_HEADER = '\n\nCATALOGUE\n';

/** The catalogue block, alone — the cached half, without her four facts underneath it. */
const catalogueOf = (r: { blocks: { text: string }[] }): string =>
  r.blocks[0]!.text.slice(r.blocks[0]!.text.indexOf(CATALOGUE_HEADER) + CATALOGUE_HEADER.length);

describe('1 · the call cannot get slow again', () => {
  const req = buildWeekRequest({ daysPerWeek: 4, sex: 'female', weightKg: 62, locale: 'he' });
  const whole = req.blocks.map((b) => b.text).join('\n');

  it('⛔ carries NO coach preamble — the 34,878 characters that were the wait', () => {
    /*
     * The coach's preamble teaches a model to converse and to reason about equipment, tiers and
     * loadability. None of it names a lift, and all of it was thought about. Asserted by size AND
     * by the vocabulary that only the coach prompt has, so neither can creep back alone.
     */
    expect(whole.length).toBeLessThan(16_000);
    for (const coachOnly of ['capability', 'howToAnswer', 'CONVERSATION', 'plan_review']) {
      expect({ coachOnly, present: whole.includes(coachOnly) }).toEqual({ coachOnly, present: false });
    }
  });

  it('⛔ sends the LEAN catalogue — NAMES only, never the coach’s columns', () => {
    /*
     * "Lean" means the coach's PROGRAMMING columns are absent: tier, equipment, pattern,
     * loadability — the things it needs to converse and cannot use to pick a lift off a list.
     * Names are the opposite: they are the whole job, and more of them is cheaper than one
     * mis-recognition (see the naming law below).
     */
    const offered = EXERCISES.filter((e) => !e.id.startsWith('_') && !isSwapOnly(e.id));
    expect(offered.length).toBeGreaterThan(100);
    for (const e of offered.slice(0, 5)) expect(whole).toContain(`${e.id} = ${e.name}`);
    expect(whole).not.toContain('|barbell|');
    expect(whole).not.toContain('compound|');
    for (const column of ['loadStyle', 'bwScaled', 'capability:', 'tier:']) {
      expect({ column, present: whole.includes(column) }).toEqual({ column, present: false });
    }
  });

  it('⛔ offers the WHOLE catalogue — every lift the builder itself would offer', () => {
    /*
     * ⛔ FOUNDER, 2026-08-29: *"אני לא רוצה שיהיה מצב שהוא רוצה להציע תרגיל והוא חושב שהוא לא קיים."*
     *
     * He said it after a run reported `Lat Pulldown` as missing. That was a defect in a throwaway
     * probe — it rebuilt the catalogue with its own regex and got 123 of 128 — and the app was
     * never wrong. But *"the model thinks we do not have it"* is a whole class of failure that
     * leaves no error behind, only a worse week, so the completeness is asserted rather than
     * assumed: the list the model gets is exactly the list the builder's own add sheet offers.
     */
    const offered = EXERCISES.filter((e) => !e.id.startsWith('_') && !isSwapOnly(e.id));
    /* Out of the FIRST block only: `whole` joins both, so slicing to the end of it would count her
       four facts as four more lifts. */
    const sent = catalogueOf(req).split('\n');
    expect(sent).toHaveLength(offered.length);
    expect(sent.map((l) => l.split(' = ')[0]).sort()).toEqual(offered.map((e) => e.id).sort());
  });

  it('⛔ names every lift in BOTH languages, and by every synonym we hold', () => {
    /*
     * The athlete writes her ask in Hebrew, so the model reasons in Hebrew about the list — and
     * nothing connected *"משיכת פולי עליון"* to `lat_pulldown` but a translation, which is how a
     * lift we own comes back as one we do not. The 71 synonyms were already in the catalogue,
     * feeding the importer's matcher, and were never shown to the model that has to CHOOSE.
     *
     * ⚠️ ASSERTED ON THE WHOLE SET, not on a sample: a Hebrew name that goes missing for one lift
     * is exactly the invisible case.
     */
    const heNames = JSON.parse(read('src/i18n/locales/he.json')).exercise as Record<string, string>;
    const offered = EXERCISES.filter((e) => !e.id.startsWith('_') && !isSwapOnly(e.id));
    const byId = new Map(
      whole
        .slice(whole.indexOf(CATALOGUE_HEADER) + CATALOGUE_HEADER.length)
        .split('\n')
        .map((l) => [l.split(' = ')[0]!, l]),
    );
    const gaps: string[] = [];
    for (const e of offered) {
      const line = byId.get(e.id) ?? '';
      if (!line.includes(e.name)) gaps.push(`${e.id}: no English name`);
      if (heNames[e.id] && !line.includes(heNames[e.id]!)) gaps.push(`${e.id}: no Hebrew name`);
      for (const syn of e.synonyms ?? []) if (!line.includes(syn)) gaps.push(`${e.id}: no "${syn}"`);
    }
    expect(gaps).toEqual([]);
    // …and the model is TOLD they are one lift, or a row of names reads as a row of options.
    expect(whole).toContain('one lift under all the');
  });

  it('⚠️ …and withholds swap-only lifts, which are regressions nobody asked for', () => {
    // Founder, device QA 2026-08-23: an ab wheel in a first-week programme. Same rule the builder's
    // add sheet keeps — a model handed the bare list has no way to know.
    for (const id of ['ab_wheel', 'assisted_dip', 'nordic_curl']) {
      expect({ id, offered: whole.includes(`${id} = `) }).toEqual({ id, offered: false });
    }
  });

  it('⛔ the schema is TWO deep, and is not printed in the prompt as well', () => {
    // `COACH_PLAN_SCHEMA` was sessions → blocks → items, and stringified to 1,841 characters that
    // were ALSO sent as prose, duplicating what Google already enforces.
    const depth = (node: unknown, at = 0): number => {
      if (!node || typeof node !== 'object') return at;
      const n = node as Record<string, unknown>;
      const kids = [
        ...(n.properties ? Object.values(n.properties as Record<string, unknown>) : []),
        ...(n.items ? [n.items] : []),
      ];
      const deeper = n.type === 'object' ? at + 1 : at;
      return kids.length === 0 ? deeper : Math.max(...kids.map((k) => depth(k, deeper)));
    };
    expect(depth(BUILD_WEEK_SCHEMA)).toBeLessThanOrEqual(3);
    expect(whole).not.toContain('"additionalProperties"');
    expect(whole).not.toContain('minItems');
  });

  it('⛔ asks for `low` thinking — measured on the live Worker, not inherited', () => {
    /*
     * ⛔ THE WORKER'S OWN NOTE WARNS AGAINST `low` — *"answered in 3.9s and wrote a one-exercise
     * week"* — and that warning is TRUE OF THE CALL IT WAS MEASURED ON: 35,000 characters of coach
     * doctrine over a four-deep required schema. This call is 786 characters over a flat one, and
     * the way to know whether a warning transfers is to measure, not to inherit it.
     *
     * Five days, real facts, a free-text ask, against the production Worker (2026-08-29):
     *
     *     minimal      5.9 / 8.7 / 10.1s     ⛔ one run in three came back EMPTY — a coin flip
     *     low          6.5 / 7.3 / 8.1s      5 days, 24-28 lifts, no invented ids, 3 of 3 good
     *     (default)    21.8 / 35.7 / 39.7s   good, and 3-5× the wait for no better a week
     *
     * ⚠️ AND `minimal` IS WHAT THE OLD WARNING ACTUALLY DESCRIBES. It reproduced exactly. If this
     * ever moves, it moves UP — never to `minimal`, which is not a cheaper `low`.
     */
    expect(req.think).toBe('low');
    expect(read('src/platform/coach/planBuild.ts')).toContain('req.schema, req.think');
  });

  it('⚠️ the catalogue is the cache breakpoint, and her facts sit below it', () => {
    // Identical for every athlete on earth and most of the tokens — the same discipline the import
    // keeps. Her four facts are in the second block, where nothing is reused.
    expect(req.blocks).toHaveLength(2);
    expect(req.blocks[0]).toMatchObject({ cache: true });
    expect(req.blocks[1]?.text).toContain('days per week: 4');
    expect(req.blocks[1]?.text).not.toContain('CATALOGUE');
  });
});

describe('1b · the model is not locked in — a free hand, one vocabulary', () => {
  /*
   * ⛔ FOUNDER, 2026-08-29, on reading the first cut: *"אני לא רוצה דוגמאות כלשהן כך שתנעל את
   * הבינה. אלא שתיתן לו יד חופשית לבצע מה שהוא רוצה בהתאם להוראת המשתמש אבל שישתמש רק במאגר
   * התרגילים שיש לנו."*
   *
   * The first prompt told the model *"compounds first, isolation after"*, *"train each muscle twice
   * on four days or more"*, *"2-4 sets is the ordinary range"*, and named three day names as
   * examples. Each was me capping a frontier model at my own level, and the examples were the
   * worst of them — an example is the strongest instruction a prompt contains.
   *
   * ⚠️ THE TEST FOR A LINE BELONGING IN THE PROMPT: *could a better coach than me disagree with
   * it?* If yes, it is an opinion and it belongs to the model, or to `builderAdvice` where she can
   * read it and argue back. Asserted here so the next well-meaning "just one rule" is caught.
   */
  const req = buildWeekRequest({ daysPerWeek: 4, sex: 'female', weightKg: 62, locale: 'he' });
  const whole = req.blocks.map((b) => b.text).join('\n');

  it('⛔ carries no coaching opinion — the split, the order and the volume are the model’s', () => {
    for (const opinion of [
      'Compounds first',
      'isolation after',
      'at least twice',
      'ordinary range',
      'every major muscle',
      'hypertrophy training week',
    ]) {
      expect({ opinion, present: whole.includes(opinion) }).toEqual({ opinion, present: false });
    }
  });

  it('⛔ carries no EXAMPLES — an example is the strongest instruction a prompt contains', () => {
    // The catalogue is a list of ids, not a demonstration; nothing in the instructions shows the
    // model what an answer should look like. `"Push"`, `"Upper A"` and `"Legs"` were exactly that.
    const instructionsOnly = whole.slice(0, whole.indexOf(CATALOGUE_HEADER));
    for (const example of ['"Push"', '"Upper A"', '"Legs"', 'e.g.', 'for example']) {
      expect({ example, present: instructionsOnly.includes(example) }).toEqual({ example, present: false });
    }
  });

  it('⚠️ …and what remains is only what the founder named', () => {
    /*
     * ⛔ 475 CHARACTERS, DOWN FROM 950, AND MEASURED (founder 2026-08-29: *"אין עוד איפה להרזות
     * ולקצר אותו?"*). There was: a ROLE ("you are a strength coach" — roles have opinions), a grant
     * of freedom that turned out to buy nothing, and the justifications behind three rules.
     *
     * Over 20 live calls the shorter block scored BETTER on how closely the answer followed her own
     * sentence (0.48 of the week's lifts on the muscles she named, against 0.41) with every hard
     * constraint clean in both. The full table is in `buildPrompt`'s own note.
     *
     * ⛔ HIS LIST, 2026-08-30: *"הכי קצר שיש ושיכיל את כל התרגילים, ובמידה והוא מנסה להשתמש בתרגיל
     * שלא קיים במאגר שזה יתריע לנו… ושלא יהיה מצב שהוא מתכוון לתרגיל מסוים והוא לא מוצא את זה
     * במאגר כי זה שם שונה. כל השאר אני לא רוצה שננעל אותו בכלום."* Four things, and the block is
     * exactly them — plus the day COUNT, which is her own answer rather than a lock on the model.
     *
     * ⛔ AND THE FLOOR WAS MEASURED TWICE, 168 live calls across two experiments. Nothing BREAKS as
     * it shrinks — 135 characters still wrote five days with Hebrew names and no invented ids —
     * **her own sentence simply gets heard less**: 0.46 → 0.39 from 468 to 135 on 2026-08-29, and
     * 0.44 → 0.40 from 337 to 250 on 2026-08-30, over a different set of cuts. Two independent runs
     * pointing the same way is why the cutting stopped at 337 rather than at 250.
     *
     * ⚠️ SO THE SIZE IS A LAW IN BOTH DIRECTIONS. A rule added here spends her sentence's volume,
     * and a rule cut below the floor does the same — and neither bill arrives with an error
     * attached, which is why something has to watch this number.
     */
    const instructionsOnly = whole.slice(0, whole.indexOf(CATALOGUE_HEADER));
    expect(instructionsOnly.length).toBeLessThan(380);
    // the day count is hers; the catalogue is a vocabulary; load/reps/rest are the engine's; the
    // day name is read by her. Nothing else.
    expect(instructionsOnly).toContain('Exactly the number of days the athlete asked for');
    expect(instructionsOnly).toContain('Only ids from the CATALOGUE');
    expect(instructionsOnly).toContain('Hebrew');
    // …and NO ROLE. "You are a strength coach" is a bias against every athlete who wants something
    // else, and it is the exact species of line the founder's instruction forbids.
    for (const role of ['You are a', 'strength coach', 'hypertrophy']) {
      expect({ role, present: instructionsOnly.includes(role) }).toEqual({ role, present: false });
    }
    /*
     * ⛔ AND NO LINE FORBIDDING WHAT THE SCHEMA ALREADY MAKES IMPOSSIBLE. *"Sets are the only number
     * you give. No weights, reps, rest or advice"* was 65 characters instructing the model not to do
     * something it has no field for — measured as costing nothing to remove, because there was
     * nothing there. The guarantee is the schema's, and part 2 of this file asserts it.
     */
    for (const redundant of ['No weights', 'rest or advice', 'only number you give']) {
      expect({ redundant, present: instructionsOnly.includes(redundant) }).toEqual({ redundant, present: false });
    }
    /*
     * ⛔ AND NO LINE TELLING IT HOW TO BEHAVE — *"כל השאר אני לא רוצה שננעל אותו בכלום."*
     *   · "never repeat one within a day" — `draftFromCoachWeek` de-dups on the RESOLVED id, so
     *     the rule is kept in code, where it cannot be talked out of;
     *   · "use the nearest one" — us deciding what it does when it is short of a lift. The
     *     `missing` half is a system boundary and stayed; the instruction half went.
     */
    for (const behaviour of ['repeat one within a day', 'Use the nearest']) {
      expect({ behaviour, present: instructionsOnly.includes(behaviour) }).toEqual({ behaviour, present: false });
    }
    // …and the three things he DID name are all still there.
    expect(instructionsOnly).toContain('one lift under all the');
    expect(instructionsOnly).toContain('`missing`');
    expect(instructionsOnly).toContain('Only ids from the CATALOGUE');
  });

  it('⛔ HER OWN WORDS reach the model, and they go last', () => {
    /*
     * *"בהתאם להוראת המשתמש"* — and this is also the answer to *"why this door if there are
     * ready-made ones"*: without it the call knows the same three facts a shelf knows, and a model
     * handed exactly what a template is handed cannot beat the template.
     */
    const asked = buildWeekRequest({ daysPerWeek: 4, sex: 'female', ask: 'דגש על ישבן, בלי מוט ישר' });
    const her = asked.blocks[1]!.text;
    expect(her).toContain('דגש על ישבן, בלי מוט ישר');
    expect(her.indexOf('דגש על ישבן')).toBeGreaterThan(her.indexOf('days per week'));
    // …and it is labelled as HERS, so it does not read as one more of our constraints.
    expect(her).toContain('WHAT THE ATHLETE ASKED FOR');
  });

  it('⚠️ silence is a real answer — an empty ask sends nothing at all', () => {
    for (const empty of [undefined, '', '   ']) {
      const q = buildWeekRequest({ daysPerWeek: 3, sex: 'male', ...(empty != null ? { ask: empty } : {}) });
      expect(q.blocks[1]!.text).not.toContain('WHAT THE ATHLETE ASKED FOR');
    }
  });

  it('⛔ we no longer answer the goal question ON HER BEHALF', () => {
    /*
     * `goal: build muscle` was in this block. It is true of the product (hypertrophy-first,
     * register Part 9 §A) and wrong to state HERE: it told the model to ignore her the moment she
     * asked for anything else. `theAppNeverAnswersForHer` is the same law, one surface over.
     */
    expect(whole).not.toContain('goal: build muscle');
  });

  it('⚠️ the catalogue is a VOCABULARY, and its gaps come back as names', () => {
    // *"שזה לא ישפיע על ההחלטות שלו באיזשהו אופן, כי אם כן נוסיף עוד תרגילים ככל שנצטרך."*
    expect(whole).toContain('`missing`');
    expect(Object.keys(BUILD_WEEK_SCHEMA.properties)).toContain('missing');
    // …and a gap is READ, capped, and cleaned — never trusted straight off the wire.
    expect(readCoachWeek({ days: [{ name: 'Push', lifts: [{ ex: 'bb_bench_press', sets: 3 }] }], missing: ['Zercher Squat', '  ', 42] })).toMatchObject({
      missing: ['Zercher Squat'],
    });
    /*
     * ⛔ AND A LIFT WE ACTUALLY HAVE IS NOT A GAP, whatever the model meant (caught live
     * 2026-08-30). With the ask *"בלי מוט ישר"* a reply named `Barbell Bench Press` in `missing` —
     * meaning "I wanted it and she ruled it out", not "you do not stock it". Two sentences, one
     * field, and only one of them is a shopping list. Unfiltered, the list fills with lifts we
     * already carry and nobody can act on it.
     */
    expect(
      readCoachWeek({
        days: [{ name: 'Push', lifts: [{ ex: 'bb_bench_press', sets: 3 }] }],
        missing: ['Barbell Bench Press', 'pulldown', 'Zercher Squat'],
      }),
    ).toMatchObject({ missing: ['Zercher Squat'] });
    // …and it can never reach her week: the builder is handed the days and nothing else.
    expect(read('src/domain/coachDraft.ts')).toContain("week: Pick<CoachWeekDraft, 'days' | 'name'>");
  });

  it('⚠️ the per-day bound is a sanity check on SHAPE, kept by the READER — the schema cannot afford it (2026-09-07)', () => {
    /*
     * It was 4–8 with the prompt saying so in words — a coaching opinion twice over. Then 1–12 on
     * the schema. Then MEASURED OUT of the schema on 2026-09-07: Google prices a response schema by
     * its constrained-decoding states and the lift bound plus the day bound left no room for the
     * `reps` field (nine live probes; see the note at `lifts` in `buildPrompt`). The bound is the
     * reader's now — a day past twelve lifts is cut at twelve, an empty day is dropped — so the
     * refusal is unchanged and the schema is a field lighter.
     */
    const lifts = BUILD_WEEK_SCHEMA.properties.days.items.properties.lifts as Record<string, unknown>;
    expect(lifts.minItems).toBeUndefined();
    expect(lifts.maxItems).toBeUndefined();
    const { readCoachWeek: readW } = require('@/domain/coachDraft');
    const many = Array.from({ length: 20 }, (_, i) => ({ ex: `x${i}`, sets: 3 }));
    expect(readW({ days: [{ name: 'A', lifts: many }] }).days[0].lifts).toHaveLength(12);
    expect(BUILD_MAX_LIFTS).toBe(12);
  });

});

describe('2 · it cannot prescribe, and it cannot commit', () => {
  it('⛔ the schema has no LOAD and no REST anywhere in it — and the rep RANGE is the one exception, by ruling', () => {
    /*
     * S-38 sets the opening load from her FIRST SET and S-17 learns her rests. A field the model
     * can fill is a field somebody downstream eventually reads, so these are refused by shape
     * rather than by instruction.
     *
     * ⛔ `reps` LEFT THIS LIST ON 2026-09-07 (founder: *"תיקח את ההחלטה שתשדרג בצורה המקסימלית את
     * חווית המשתמש"*), on a live probe that showed an athletic split wearing a bodybuilder's
     * numbers. A rep RANGE per lift is structure the way `sets` and `pair` are; the load is still
     * priced by the engine at the range's floor and progressed inside it. The clauses below pin
     * the shape of the exception so it cannot widen into a load or a rest by accident.
     */
    const json = JSON.stringify(BUILD_WEEK_SCHEMA);
    for (const forbidden of ['load', 'weight', 'kg', 'rest', 'rir', 'tempo']) {
      expect({ forbidden, present: json.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
    const reps = (BUILD_WEEK_SCHEMA.properties.days.items.properties.lifts.items.properties as { reps: Record<string, unknown> }).reps;
    // No `minItems`/`maxItems` on it — the schema's state budget (see `lifts`); the READER refuses
    // anything but exactly two finite integers, low ≤ high, inside REPS_MIN..REPS_MAX.
    expect(reps).toMatchObject({ type: 'array', items: { type: 'integer' } });
    expect(reps.minItems).toBeUndefined();

    expect(String(reps.description)).toMatch(/^Optional\./);
    // …and it stays OPTIONAL: a lift without one takes her own band, exactly as before.
    expect((BUILD_WEEK_SCHEMA.properties.days.items.properties.lifts.items.required as readonly string[])).toEqual(['ex', 'sets']);
  });

  it('⛔ a rep range is carried into the seat, clamped, and dropped when it is nonsense', () => {
    const { readCoachWeek: readW } = require('@/domain/coachDraft');
    const week = readW({
      days: [
        { name: 'A', lifts: [
          { ex: 'bb_back_squat', sets: 4, reps: [3, 5] },
          { ex: 'leg_press', sets: 3, reps: [12, 20] },
          { ex: 'leg_curl', sets: 3, reps: [10, 8] }, // low > high — dropped, never repaired
          { ex: 'standing_calf_raise', sets: 3, reps: [1, 60] }, // outside the sane bounds — dropped
          { ex: 'hip_thrust', sets: 3 },
        ] },
      ],
    });
    expect(week.days[0].lifts.map((l: { reps?: [number, number] }) => l.reps ?? null)).toEqual([[3, 5], [12, 20], null, null, null]);
    const { draftFromCoachWeek: draft } = require('@/domain/coachDraft');
    const program = draft(week);
    expect(program.days[0].slots.map((s: { repBand?: [number, number] }) => s.repBand ?? null)).toEqual([[3, 5], [12, 20], null, null, null]);

  });


  it('⛔ the wire writes no CoachPlan and touches no disk', () => {
    const wire = read('src/platform/coach/planBuild.ts');
    for (const forbidden of ['recordCoachAnswer', "from '@/data/local/db'", 'saveProgram']) {
      expect({ forbidden, present: wire.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });

  it('⛔ the answer is replayed through the BUILDER’s verbs, never parsed into a programme', () => {
    // One path from "a list of ids and set counts" to a real week — the same one a proven shelf
    // takes. A second path is how the two would eventually price a day differently.
    const draft = read('src/domain/coachDraft.ts');
    expect(draft).toContain("from '@/domain/planTemplates'");
    expect(draft).toContain('materializeTemplate(');
  });
});

describe('3 · what it says is checked, and what survives is a real week', () => {
  it('builds a draft the builder itself would accept — priced, sealable, in day order', () => {
    const drafted = draftFromCoachWeek(week)!;
    expect(drafted).not.toBeNull();
    expect(drafted.days.map((d) => d.name)).toEqual(['Push', 'Pull']);
    for (const day of drafted.days) {
      const mins = builderMinutes(day);
      expect({ day: day.name, real: mins >= 25 && mins <= 70 }).toEqual({ day: day.name, real: true });
    }
    expect(sealAuthored(drafted)).not.toBeNull();
  });

  it('⛔ a NAME where an id was asked for is resolved, not dropped', () => {
    /*
     * ⛔ CAUGHT LIVE ON 2026-08-30: the model answered `"pulldown"`, which is `lat_pulldown`'s
     * synonym and not an id. It is a side effect of the catalogue enrichment the day before — we
     * taught it every name a lift has, and it used one — and the old code dropped the row, so a
     * lift it deliberately chose vanished from her week silently.
     *
     * ⚠️ RESOLVED WITH THE IMPORTER'S OWN `matchLift`, which is conservative by construction: exact
     * name, declared synonym, or a containment hitting exactly ONE lift. Never a fuzzy score.
     */
    const drafted = draftFromCoachWeek({
      days: [{ name: 'Pull', lifts: [{ ex: 'pulldown', sets: 3 }, { ex: 'Barbell Row', sets: 4 }] }],
    })!;
    expect(drafted.days[0]!.slots.map((s) => s.exerciseId)).toEqual(['lat_pulldown', 'bb_row']);
  });

  it('⚠️ …and a resolved name still cannot land twice in one day', () => {
    // `lat_pulldown` and `pulldown` are one lift. The de-dup runs on the RESOLVED id, or the row it
    // was meant to stop walks straight through under a second name.
    const drafted = draftFromCoachWeek({
      days: [{ name: 'Pull', lifts: [{ ex: 'lat_pulldown', sets: 3 }, { ex: 'pulldown', sets: 4 }] }],
    })!;
    expect(drafted.days[0]!.slots).toHaveLength(1);
  });

  it('⛔ drops an id the catalogue does not carry — models invent them', () => {
    const drafted = draftFromCoachWeek({
      days: [{ name: 'Push', lifts: [{ ex: 'bb_bench_press', sets: 3 }, { ex: 'zercher_good_morning', sets: 3 }] }],
    })!;
    const ids = drafted.days[0]!.slots.map((s) => s.exerciseId);
    expect(ids).toEqual(['bb_bench_press']);
    for (const id of ids) expect(exerciseById(id)).toBeTruthy();
  });

  it('⛔ drops a lift repeated inside one day — that is a mistake, never a superset', () => {
    const drafted = draftFromCoachWeek({
      days: [{ name: 'Push', lifts: [{ ex: 'bb_bench_press', sets: 3 }, { ex: 'bb_bench_press', sets: 4 }] }],
    })!;
    expect(drafted.days[0]!.slots).toHaveLength(1);
  });

  it('⚠️ CLAMPS a set count rather than dropping the lift — the lift is right, the number is a typo', () => {
    const drafted = draftFromCoachWeek({
      days: [{ name: 'Push', lifts: [{ ex: 'bb_bench_press', sets: 40 }, { ex: 'lat_pulldown', sets: 0 }] }],
    })!;
    const sets = drafted.days[0]!.slots.map((s) => s.setCount);
    expect(sets).toEqual([BUILDER_SETS_MAX, BUILDER_SETS_MIN]);
  });

  it('⛔ drops an empty day whole, and answers NULL when nothing at all survived', () => {
    const withEmpty = draftFromCoachWeek({
      days: [{ name: 'Push', lifts: [{ ex: 'bb_bench_press', sets: 3 }] }, { name: 'Ghost', lifts: [] }],
    })!;
    expect(withEmpty.days).toHaveLength(1);
    // …and nothing usable at all is `null`, so the caller falls back rather than opening an empty
    // builder over a failed call.
    expect(draftFromCoachWeek({ days: [{ name: 'Ghost', lifts: [{ ex: 'not_a_lift', sets: 3 }] }] })).toBeNull();
  });

  it('⚠️ a day the model did not name takes the BUILDER’s own name, in her language', () => {
    /*
     * ⛔ AND "LEAVE IT BLANK" IS NOT NEUTRAL, which is the whole reason `dayNamer` exists.
     * `renameDay` ignores an empty string and keeps what `blankDay` chose, and
     * `materializeTemplate` builds from `blankDraft()` with no namer — so a blank falls through to
     * the ENGLISH literal `Workout A` inside a Hebrew athlete's week. Asserted in both directions.
     */
    const named = draftFromCoachWeek(
      { days: [{ name: '   ', lifts: [{ ex: 'bb_bench_press', sets: 3 }] }] },
      { dayNamer: (i) => `אימון ${String.fromCharCode(65 + i)}` },
    )!;
    expect(named.days[0]!.name).toBe('אימון A');
    // …and with no namer it is the fall-through, which is exactly what the caller must not ship.
    const bare = draftFromCoachWeek({ days: [{ name: '   ', lifts: [{ ex: 'bb_bench_press', sets: 3 }] }] })!;
    expect(bare.days[0]!.name).toBe('Workout A');
    // …so the caller passes one. This is the half a type cannot enforce.
    expect(read('src/screens/plan/PlanBuilder.tsx')).toContain('dayNamer: (i) => dayNamer(String.fromCharCode(65 + i))');
  });

  it('⛔ a reply of the wrong shape is NOTHING, never a partial week', () => {
    for (const junk of [null, 42, 'a week', {}, { days: 'four' }, { days: [] }]) {
      expect({ junk: JSON.stringify(junk), read: readCoachWeek(junk) }).toEqual({ junk: JSON.stringify(junk), read: null });
    }
    // …and a day whose lifts are junk survives as a day with no lifts, which `draftFromCoachWeek`
    // then drops — one rejection per layer, neither of them guessing.
    expect(readCoachWeek({ days: [{ name: 'Push', lifts: [1, 'squat', null] }] })).toEqual({
      days: [{ name: 'Push', lifts: [] }],
      missing: [],
    });
  });
});

describe('4 · it can never strand her — and it can never fail her in silence', () => {
  /*
   * ⛔ FOUNDER, 2026-09-09, after writing "no leg days at all" and receiving two:
   *
   *   *"אבל למה יש כשלון בכלל? זה יצירת התוכנית והשלב הכי חשוב. אסור שיהיה כשלון בכלל ואם צריך
   *   נחליף מודל או נעשה כל דבר אחר. המתאמן צריך לקבל את התוכנית הטובה ביותר עבור מטרותיו האישיות
   *   ואם זה לא צולח נכשלנו עוד לפני שהמשתמש התחיל להתאמן."*
   *
   * The model had obeyed — six live calls the same hour, zero leg lifts, every one under seven
   * seconds (`__tests__/live/planBuildNoLegsLive.test.ts`). The DEVICE had fallen through to the
   * local assembler, which cannot read a sentence, and three of our own numbers had put it there:
   * one retry (a double truncation is one build in twenty-five), an 18.5 s budget pinned to the
   * length of the drawing (the measured tail runs to 21.5 s), and a 40-call daily wall on the
   * Worker that a founder testing the intake crosses by mid-afternoon. And nothing recorded which.
   *
   * This section used to ratify the fallback — *"every failure of the call falls through to the
   * local assembler"*. It now ratifies the opposite for a sentence she wrote: the call is retried,
   * the drawing keeps moving for as long as it takes, a failure is SAID with its true reason, the
   * local week is a door she opens, and every outcome is counted.
   */
  it('⛔ the wire tries again — bounded, on pipe failures only, inside one budget', () => {
    const wire = read('src/platform/coach/planBuild.ts');
    expect(wire).toContain('export const PLAN_BUILD_ATTEMPTS = 3;');
    expect(wire).toContain('while (attempts < PLAN_BUILD_ATTEMPTS && left() > 4_000) {');
    // a deterministic refusal breaks out at once — a second call against a wall we built is a bill
    expect(wire).toContain('if (!RETRYABLE.has(last)) break;');
    for (const r of ['truncated', 'empty', 'upstream', 'offline', 'timed_out', 'not_json', 'nothing_said']) {
      expect(wire).toMatch(new RegExp(`RETRYABLE[\\s\\S]{0,200}'${r}'`));
    }
    for (const r of ['not_configured', 'refused', 'rate_limited']) {
      expect(wire).not.toMatch(new RegExp(`RETRYABLE[^;]*'${r}'`));
    }
    // …and running out is its own reason, never a reply-shaped lie about what the server said
    expect(wire).toContain("last = 'too_slow';");
  });

  it('⛔ the budget is set where the measured tail ends, not where the drawing does', () => {
    // 45 s clears every healthy answer ever recorded here (slowest 21.5 s) with room for two more
    // attempts; the old 18.5 s was the placeholder walk's length, which no longer bounds anything.
    expect(PLAN_BUILD_SAID_MS).toBeGreaterThanOrEqual(40_000);
    expect(PLAN_BUILD_SAID_MS).toBeLessThanOrEqual(60_000);
    // …and the words are still what buy it — an empty ask keeps the short budget
    expect(PLAN_BUILD_BUDGET_MS).toBeLessThanOrEqual(PLAN_BUILD_SAID_MS);
    expect(read('src/platform/coach/planBuild.ts'))
      .toContain("const budget = her.ask?.trim() ? PLAN_BUILD_SAID_MS : PLAN_BUILD_BUDGET_MS;");
  });

  it('⛔ the drawing LOOPS while the call is out — the screen never runs dry under a slow answer', () => {
    /*
     * The old clause here proved `cover >= budget` — the placeholder walk had to outlast the call,
     * because past its last muscle the screen went static. That coupling is what capped the model
     * at the animation's length. Now the walk wraps: every muscle lit, and the rows keep moving
     * through the same ten in order, each for its own beat, until the answer lands.
     */
    const screen = read('src/screens/onboarding/BuildingProgramme.tsx');
    expect(screen).toContain('const [cycle, setCycle] = useState(0);');
    // the ticker only STOPS when there is a week in hand
    expect(screen).toContain('if (shownMuscles >= total && built) return;');
    expect(screen).toContain('shownMuscles >= total ? setCycle((c) => c + 1) : setShownMuscles((n) => n + 1)');
    // the loop draws real muscles with dashed rows — nothing invented
    expect(screen).toContain('placeholders().map((m) => ({ muscle: m, lifts: waitingRows }))');
    // …and the background catch-up walks the loop with the same arithmetic
    expect(screen).toContain('setCycle((cur) => Math.max(cur, beats - PLACEHOLDER_MUSCLES.length));');
  });

  it('⛔ a sentence she wrote and no answer ⇒ the screen STOPS and says the true reason', () => {
    const building = read('src/screens/onboarding/BuildingProgramme.tsx');
    // the reason travels, it is not folded into `null`
    expect(building).toContain("if (!res.ok) return { ok: false, reason: res.reason };");
    expect(building).toContain('if (answer && !answer.ok && coachAsk?.trim()) {');
    expect(building).toContain('setFailed(answer.reason);');
    // three different sentences for three different causes
    expect(building).toContain("t('ob.buildingOfflineTitle')");
    expect(building).toContain("t('ob.buildingBusyTitle')");
    expect(building).toContain("t('ob.buildingFailedTitle')");
    // her words are kept and shown, and the retry sends exactly them again
    expect(building).toContain("t('ob.buildingRetry')");
    for (const loc of ['en', 'he']) {
      const copy = JSON.parse(read(`src/i18n/locales/${loc}.json`)) as { ob: Record<string, string> };
      for (const k of ['buildingOfflineTitle', 'buildingBusyTitle', 'buildingWithoutCoach', 'readyCoachMissed', 'readyCoachRetry']) {
        expect({ loc, k, there: !!copy.ob[k] }).toEqual({ loc, k, there: true });
      }
      // the old line said "in time", which was false for two of the three causes
      expect(copy.ob.readyCoachMissed).not.toMatch(/in time|בזמן/);
    }
  });

  it('⛔ the local week is a DOOR she opens — never a substitution under her own words', () => {
    const building = read('src/screens/onboarding/BuildingProgramme.tsx');
    expect(building).toContain("t('ob.buildingWithoutCoach')");
    expect(building).toContain('onPress={() => void build({ withoutCoach: true })}');
    // the local assembler runs only past that door (or when she wrote nothing)
    expect(building).toContain('const answer = !authored && coachAsk != null && !skipCoach ? await askTheModel() : null;');
    expect(building).toContain('asked ?? (await model.generateProgram(profile))');
    // …and the reveal does not quote her sentence over a week it never touched
    expect(building).toContain('askedFor={coachAsk?.trim() && !withoutCoach ? coachAsk.trim() : null}');
    // the fact still travels to the reveal, where the ask is offered again
    expect(building).toContain('coachMissed.current = !authored && !!coachAsk?.trim() && asked == null;');
    expect(building).toContain('coachMissed.current ? { coachMissed: true,');
    const created = read('src/screens/onboarding/ProgramCreated.tsx');
    expect(created).toContain("t('ob.readyCoachMissed')");
    expect(created).toContain("t('ob.readyCoachRetry')");
  });

  it('⛔ THE WEEK THE MODEL WROTE IS SEALED AND SAVED BEFORE THE REVEAL MOVES ON (build 72)', () => {
    /*
     * ⛔ FOUNDER, 2026-09-09, on build 72: *"זה לא עובד. ביקשתי מהבינה בלי אימון רגליים והוא שם לי
     * כאן פעמיים אימון רגליים."*
     *
     * The model had obeyed and the reveal had DRAWN its week; nothing wrote it to disk.
     * `ProgramCreated` read the disk, found nothing, and `completeOnboarding` generated the engine's
     * week over the one she had just been shown. What she is shown must be what she trains, and the
     * only way to guarantee that is one record: sealed with the passport `engineMayRebuild` refuses,
     * and written by the same call the builder's intake road uses.
     */
    const building = read('src/screens/onboarding/BuildingProgramme.tsx');
    expect(building).toContain("import { sealAuthored } from '@/domain/planBuilder';");
    expect(building).toContain('const asked = answer?.ok ? sealAuthored(answer.program) : null;');
    expect(building).toContain('await app.saveBuiltProgram(asked);');
    // …and the save is inside the branch that has a week, before the frequency is re-stamped from it
    expect(building).toMatch(/if \(asked\) \{\s*await app\.saveBuiltProgram\(asked\);\s*const wrote = asked\.days/);
    // the gate the next screen asks is the one the passport answers
    const created = read('src/screens/onboarding/ProgramCreated.tsx');
    expect(created).toContain('engineMayRebuild(brought) ? app.model.generateProgram(profileForPreview) : brought');
  });

  it('⛔ off the Program tab the failure is SAID too — it was the quietest in the product', () => {
    const builder = read('src/screens/plan/PlanBuilder.tsx');
    expect(builder).toContain("Alert.alert(t('ob.buildingFailedTitle'), t('ob.buildingFailedSub'), [");
    expect(builder).toContain("{ text: t('ob.buildingWithoutCoach'), style: 'cancel', onPress: assembleLocally },");
    expect(builder).toContain("{ text: t('ob.buildingRetry'), onPress: () => letTheModelBuild(daysPerWeek, ask, minutes) },");
    // without a sentence the local week IS the answer, exactly as before
    expect(builder).toContain('const failed = ask.trim() ? () => { setBuildBusy(false); askAgainOrNot(); } : assembleLocally;');
    expect(builder).toContain('if (!res.ok) return failed();');
    expect(builder).toContain('if (!drafted) return failed();');
    expect(builder).toContain('.catch(() => failed());');
  });

  it('⛔ every outcome is COUNTED with its reason — a failure that leaves no trace cannot be fixed', () => {
    const wire = read('src/platform/coach/planBuild.ts');
    const events = read('src/platform/events.ts');
    expect(events).toContain("landed: 'build_landed',");
    expect(events).toContain("missed: 'build_missed',");
    expect(wire).toContain('void track(r.ok ? BUILD_EVENTS.landed : BUILD_EVENTS.missed, {');
    expect(wire).toContain("...(r.ok ? {} : { reason: r.reason }),");
    expect(wire).toContain('return done({ ok: true, week, attempts, ms: Date.now() - startedAt });');
    expect(wire).toContain('return done({ ok: false, reason: last, attempts, ms: Date.now() - startedAt });');
  });

  it('⛔ the Worker’s daily wall no longer lands on the most important call', () => {
    // 40 was crossed by a founder testing the intake, and every build after it fell through.
    const toml = fs.readFileSync(path.join(ROOT, '..', '..', 'server', 'wrangler.toml'), 'utf8');
    const m = /DAILY_ACCOUNT_CALLS = "(\d+)"/.exec(toml);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(200);
  });

  it('⚠️ and the door SAYS it is working — silence is what taught him a feature was broken', () => {
    const builder = read('src/screens/plan/PlanBuilder.tsx');
    expect(builder).toContain("t('ob.weekEngineBusy')");
    expect(builder).toContain('disabled={props.buildBusy}');
    for (const loc of ['en', 'he']) {
      const copy = JSON.parse(read(`src/i18n/locales/${loc}.json`)) as { ob: Record<string, string> };
      expect(typeof copy.ob.weekEngineBusy).toBe('string');
    }
  });

  it('⚠️ the week it may ask for stays inside what the engine itself builds', () => {
    // 2–6 days, which is `fixtureModel`'s range and the wheel's. A schema that allowed nine would
    // be the model deciding something the rest of the product cannot carry.
    expect(BUILD_MIN_DAYS).toBe(2);
    expect(BUILD_MAX_DAYS).toBe(6);
    expect(BUILD_WEEK_SCHEMA.properties.days.minItems).toBe(BUILD_MIN_DAYS);
    expect(BUILD_WEEK_SCHEMA.properties.days.maxItems).toBe(BUILD_MAX_DAYS);
  });
});
