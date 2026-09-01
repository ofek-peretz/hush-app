/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ASKING THE MODEL FOR A WEEK — and why this is not the call that was deleted.
 *
 * ⛔ FOUNDER, 2026-08-29: *"עכשיו אני דווקא כן חושב שצריך להחזיר את הבינה המלאכותית בעת בניית תוכנית
 * האימון כי היא עושה את זה כל כך טוב עבור כל מטרה. וזה כל כך קצר וקולע ולא מצריך מכל משתמש להתחיל
 * לבנות בעצמו את כל התוכנית. הבעיה שהייתה בפעם הקודמת היא שזה לקח המון המון זמן."*
 *
 * He is naming both halves exactly: the ANSWER was good and the WAIT was the product. So the
 * question is not "should the model write a week" — it is "why did the old call take two minutes",
 * and that has a measured answer, on the record in `server/worker.ts`:
 *
 *   · the preamble was **34,878 characters**; halving it to 16,330 took the same call from a
 *     125-second Cloudflare cut-off to **15.7 seconds** (`worker.ts`, prompt v15);
 *   · the whole 136-lift catalogue went with it, WITH tiers, equipment, patterns and loadability —
 *     the columns a coach needs in order to converse, none of which name a lift;
 *   · the schema was four deep (`sessions → blocks → items`), required at every level, and it was
 *     also PRINTED in the prompt — 1,841 characters duplicating what Google already enforces;
 *   · thinking ran **4,105 tokens against 452 visible** on a real four-day build (82% of the bill),
 *     because the model was planning a conversation's worth of programme;
 *   · and a programme build is not `conversational`, so the worker HEDGES a second whole call at
 *     20s and a third after that, up to 110s — three of the most expensive call in the product,
 *     racing each other, behind a 125s ceiling.
 *
 * ── WHAT THIS CALL IS INSTEAD ──────────────────────────────────────────────────────────────────
 * It is `importPrompt`'s shape, not `coachPrompt`'s, and every difference answers one cause above:
 *
 *   · **A lean catalogue** — every NAME a lift has, and none of the coach's columns (no tier, no
 *     equipment, no pattern, no loadability). The model is choosing FROM a list, not reasoning
 *     about equipment it cannot see. See `catalogueLines` for why the names had to grow.
 *   · **A flat schema, two deep.** `days → lifts`, each lift an id, a set count, and one boolean
 *     that couples it to the next lift (2026-08-31 — see `pair`). No blocks, no loads, no rest, no
 *     reps — every one of those is the ENGINE's, and asking for them was asking the model to think
 *     about answers we would then throw away. Loads especially: S-38 sets the opening load from her
 *     FIRST SET, so a weight here would be a number nothing had measured.
 *   · **No preamble.** No coach doctrine, no conversation history, no fact pack beyond the four
 *     things that decide a split. The whole stable half of this prompt is the catalogue.
 *   · **Thinking at `low`, and MEASURED rather than inherited.** The worker's warning against it
 *     was written about the 35,000-character call; on this one, `low` answers in 6.5–8.1 seconds
 *     with a full week and the default takes 3–5× longer for no better a week. The table of live
 *     runs is at the `think` field itself, where the value is chosen.
 *
 * ── ⛔ AND IT IS GIVEN A FREE HAND (founder, 2026-08-29, on reading the first cut) ──────────────
 * *"אני לא רוצה דוגמאות כלשהן כך שתנעל את הבינה. אלא שתיתן לו יד חופשית לבצע מה שהוא רוצה בהתאם
 * להוראת המשתמש אבל שישתמש רק במאגר התרגילים שיש לנו. פשוט מאוד."*
 *
 * My first cut told it *"compounds first, isolation after"*, *"train each muscle twice on four days
 * or more"*, *"2-4 sets is the ordinary range"*, and named three day names as examples. Every one of
 * those was **me capping a frontier model at my own level** — a coach that needs to be told
 * compounds go first is not the coach he asked for, and three example names is how every answer
 * comes back sounding like the examples. They are deleted, and nothing replaced them.
 *
 * ⚠️ THE DISTINCTION THAT SURVIVES IS SYSTEM BOUNDARY vs COACHING OPINION, and only the first kind
 * is allowed to be in here:
 *   · the catalogue is a VOCABULARY, not a syllabus — *"שזה לא ישפיע על ההחלטות שלו באיזשהו אופן,
 *     כי אם כן נוסיף עוד תרגילים ככל שנצטרך"*. Hence `missing`: the model NAMES what it wanted and
 *     could not find, and that list is the shopping list for the catalogue rather than a silent
 *     distortion of her week;
 *   · load, reps and rest are the ENGINE's (S-38, her band, S-17) — refused by schema, not by
 *     instruction, so there is nothing to argue with;
 *   · the day count is HER answer, not ours;
 *   · and the day name is written in her language because she reads it.
 *
 * Everything else — the split, the order, the volume, the exercise choice — is the model's, and her
 * own instruction is the only thing steering it.
 *
 * ⚠️ AND THE ANSWER IS STILL NOT TRUSTED, which is what makes the free hand safe. Every id is
 * checked against the catalogue, every set count is clamped to the builder's own bounds, and the
 * week is built THROUGH the builder's verbs (`coachDraft`) — priced by `builderMinutes`, judged by
 * `builderAdvice`, and edited by her before it is sealed. A model with a free hand and a week she
 * cannot see would be a gamble; a free hand into a draft she reads is just a better first draft.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import { EXERCISES, isSwapOnly } from '@/data/exercises';
/*
 * ⛔ THE HEBREW NAMES ARE READ FROM THE FILE, NOT THROUGH `i18next` — and that is not a shortcut.
 *
 * `i18next.t(key, { lng: 'he' })` answers with the DEFAULT VALUE until `initI18n()` has run, and it
 * fails silently: the catalogue simply comes out English, the model stops recognising half the
 * lifts it is offered, and nothing anywhere is red. This module is a pure prompt builder with no
 * boot order of its own, so it may not depend on somebody else's. The file is already bundled —
 * `i18n/index` imports the same JSON — so this costs nothing and cannot be un-initialised.
 */
import heCopy from '@/i18n/locales/he.json';
import type { PromptBlock } from '@/domain/coachPrompt';

/** Bumped when the wording below changes in a way that could change an answer. */
export const BUILD_PROMPT_VERSION = 2;

/** What a week may be. Both ends are the engine's own range — `fixtureModel` builds 2–6. */
export const BUILD_MIN_DAYS = 2;
export const BUILD_MAX_DAYS = 6;
/*
 * ⛔ PER DAY, AND DELIBERATELY WIDE. It was 4–8, with the prompt saying so in words — which is a
 * COACHING OPINION about what a session is, and the founder struck those (see the free-hand note in
 * the header). What is left is a sanity bound on the SHAPE: one lift is a day, twelve is a day, and
 * a reply outside that is a malformed answer rather than a different opinion.
 *
 * ⚠️ THE JUDGEMENT DID NOT DISAPPEAR, IT MOVED TO WHERE SHE CAN SEE IT. `builderAdvice` prices every
 * day and states the finding — "Workout A comes to 28 min, under the 45-minute floor" — on the
 * screen, in her language, as advice she can act on or ignore. That is the right place for an
 * opinion about her week; a bound inside a prompt is the same opinion with nobody to argue with.
 */
export const BUILD_MIN_LIFTS = 1;
export const BUILD_MAX_LIFTS = 12;

/**
 * ⛔ TWO LEVELS, AND THAT IS THE LATENCY FIX MADE STRUCTURAL.
 *
 * `COACH_PLAN_SCHEMA` was `sessions → blocks → items`, required at every level, and it stringified
 * to 1,841 characters. A schema is not free: it is the shape the model has to hold while it plans,
 * and depth is what makes structured output slow. This one is a week, a day, a lift, a number.
 *
 * ⚠️ NO LOAD, NO REPS, NO REST FIELD ANYWHERE — not omitted for brevity, refused. Those are the
 * engine's three jobs (S-38 opening loads, her rep band, S-17 learned rests), and a field the model
 * can fill is a field somebody downstream will eventually read.
 */
export const BUILD_WEEK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['days'],
  properties: {
    /*
     * ⛔ WHAT IT WANTED AND COULD NOT FIND (founder 2026-08-29): *"שזה לא ישפיע על ההחלטות שלו
     * באיזשהו אופן, כי אם כן נוסיף עוד תרגילים ככל שנצטרך."*
     *
     * A catalogue is a vocabulary, and a vocabulary silently bends what gets said. Without this
     * field the only trace of a gap is a week quietly worse than the one the model wanted to write,
     * and nobody ever learns which lift was missing. With it, the gap arrives as a NAME — logged,
     * countable, and the actual shopping list for the catalogue.
     *
     * ⚠️ IT CHANGES NOTHING ABOUT HER WEEK. Nothing downstream reads it into a programme; it is
     * telemetry, and the week is built only from `days`.
     */
    missing: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string' },
    },
    days: {
      type: 'array',
      minItems: BUILD_MIN_DAYS,
      maxItems: BUILD_MAX_DAYS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'lifts'],
        properties: {
          /** What she reads at the top of the day, in her language. What it says is the model's. */
          name: { type: 'string' },
          lifts: {
            type: 'array',
            minItems: BUILD_MIN_LIFTS,
            maxItems: BUILD_MAX_LIFTS,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['ex', 'sets'],
              properties: {
                /** A catalogue id, checked by the caller. A hallucinated one is dropped. */
                ex: { type: 'string' },
                /** Working sets. Clamped by the caller to the builder's own bounds. */
                sets: { type: 'integer' },
                /*
                 * ⛔ THE ONE THING THE MODEL COULD NOT SAY, AND THE ATHLETE COULD (founder,
                 * 2026-08-31): *"וביצירת התוכנית הבינה מלאכותית יודעת להוסיף את זה בתוכנית האימון
                 * במידה והיא מציעה סופר סט?"* — she could not, and this field is the answer.
                 *
                 * A superset is not a prescription. Load, reps and rest are the engine's three jobs
                 * and stay refused by shape; a pair is STRUCTURE — the same mark her finger writes
                 * on the seam between two rows, and the exact thing the session runner has known how
                 * to run since coach circuits existed. Refusing it did not protect anything: it just
                 * meant a model that wanted to superset had no way to say so, and the week came back
                 * as two ordinary lifts with nobody ever knowing that was not what it meant.
                 *
                 * ⚠️ ITS MEANING LIVES HERE AND NOT IN `instructions`, and that placement is the
                 * whole reason this field is affordable. The instruction block is MEASURED — 337
                 * characters, and 168 live calls say her own sentence gets heard less as it grows
                 * (the table is at `instructions`). A `description` rides the `responseSchema` that
                 * is sent anyway, is carried verbatim by `geminiSchema` (and by the Worker's copy of
                 * it), and defines a field rather than instructing a coach. So the model learns the
                 * vocabulary and her sentence keeps every character of its volume.
                 *
                 * ⚠️ AND IT SAYS WHAT THE FIELD IS, NEVER WHEN TO USE ONE. Whether this week wants a
                 * superset is a coaching decision, and coaching decisions are the model's —
                 * *"כל השאר אני לא רוצה שננעל אותו בכלום."*
                 *
                 * ⚠️ NOT TRUSTED, like everything else here: `draftFromCoachWeek` drops a mark whose
                 * partner did not survive the catalogue check, and `materializeTemplate` puts it on
                 * through `togglePair` — so no chains, adjacent seats only, set counts synced.
                 */
                pair: {
                  type: 'boolean',
                  description:
                    'Run this exercise and the next one as a superset: alternate them, with no pause between the two.',
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export interface BuildAsk {
  daysPerWeek: number;
  sex: 'female' | 'male';
  weightKg?: number;
  /**
   * ⛔ WHAT SHE ACTUALLY WANTS, IN HER OWN WORDS (founder 2026-08-29: *"שתיתן לו יד חופשית לבצע מה
   * שהוא רוצה בהתאם להוראת המשתמש"*).
   *
   * Without it this call knows three facts about her, every one of which a shelf also knows — and a
   * model handed exactly what a template is handed has no way to be better than the template. That
   * is the honest answer to *"why this door if there are ready-made ones"*: the shelf is a week
   * that was right for somebody; this is a week written for what SHE said. `ask` is the difference.
   *
   * Optional, and empty is a real answer: she can pick her days and press.
   */
  ask?: string;
  /** Her language, so the DAY NAMES come back in it — they are the only prose in the answer. */
  locale?: 'en' | 'he';
}

/**
 * The catalogue — EVERY NAME WE KNOW A LIFT BY, not just the English one.
 *
 * ⛔ FOUNDER, 2026-08-29: *"אני לא רוצה שיהיה מצב שהוא רוצה להציע תרגיל והוא חושב שהוא לא קיים."*
 *
 * He said it after seeing the model report `Lat Pulldown` as missing. THAT instance was a defect in
 * a throwaway probe script — the app has always sent all 128 offered lifts — **but the failure mode
 * he named is real, and this catalogue was inviting it.** Every line was `id = English Name`, and:
 *
 *   · the athlete writes her ask in HEBREW, so the model reasons in Hebrew about a list that is not.
 *     Nothing connected *"משיכת פולי עליון"* to `lat_pulldown` except a translation, and a
 *     translation that goes slightly wide reads to the model as "they do not have it";
 *   · one lift has many ordinary names — `chest_dip` is `Chest Dip` here and "dips" in every gym on
 *     earth — and we ALREADY HOLD 71 of those in `synonyms`, used by the importer's matcher and
 *     never once shown to the model that has to choose;
 *
 *     ⚠️ ONLY 48 OF THE 128 CARRY ANY SYNONYM, so this closes the gap rather than the whole of it.
 *     `cable_row` is `Seated Cable Row` here and "seated row" everywhere else, and holds none. The
 *     Hebrew name does most of the remaining work; the rest is catalogue authoring, and `missing`
 *     is now the instrument that says which lift to author next;
 *   · and the cost of the silence is invisible. Not an error: a slightly worse week, and a lift the
 *     athlete is never offered.
 *
 * A line now carries the id, the English name, the Hebrew name and every synonym. Whatever the
 * model knows a lift by, it finds it — and `missing` starts meaning what it says.
 *
 * ⚠️ ALWAYS SENT, NEVER SWITCHED ON LOCALE, because this is the CACHED half of the call: identical
 * for every athlete on earth, so the Hebrew costs its tokens once rather than per athlete, and one
 * catalogue means one cache entry instead of two.
 *
 * ⚠️ SWAP-ONLY LIFTS ARE STILL WITHHELD, which is the rule the builder's add sheet keeps and the
 * engine's pools keep: they are REGRESSIONS, offered when she says "I cannot do the loaded one
 * yet", never handed to somebody who did not ask. A model given the bare list has no way to know
 * that, and an assisted dip in a first programme is exactly the founder's 2026-08-23 finding.
 */
function catalogueLines(): string {
  return EXERCISES.filter((e) => !e.id.startsWith('_') && !isSwapOnly(e.id))
    .map((e) => {
      /* Hebrew always, never the ACTIVE locale — a string that changes with her language is a
         cached block that never hits. */
      const he = (heCopy as { exercise: Record<string, string> }).exercise[e.id] ?? '';
      const names = [e.name, he && he !== e.name ? he : null, ...(e.synonyms ?? [])].filter(Boolean);
      return `${e.id} = ${names.join(' | ')}`;
    })
    .join('\n');
}

/**
 * The instructions — 337 characters, and only what the founder named.
 *
 * ⛔ HIS LIST, VERBATIM (2026-08-30): *"הכי קצר שיש ושיכיל את כל התרגילים, ובמידה והוא מנסה להשתמש
 * בתרגיל שלא קיים במאגר שזה יתריע לנו שנוסיף את זה, ושלא יהיה מצב שהוא מתכוון לתרגיל מסוים והוא לא
 * מוצא את זה במאגר כי זה שם שונה. כל השאר אני לא רוצה שננעל אותו בכלום."*
 *
 * Four things, and the block is exactly them:
 *   1. the WHOLE catalogue — every offered lift, on `catalogueLines`;
 *   2. a lift we lack comes back as a NAME in `missing`, which is the shopping list;
 *   3. one lift under every name we know it by, so nothing is lost to a synonym;
 *   4. the day name in the language she reads.
 *   (+ the day COUNT, which is not us locking anything — it is her own answer, and see below.)
 *
 * ── WHAT CAME OUT AT THIS PASS, AND WHY IT WAS SAFE ────────────────────────────────────────────
 *   · **"never repeat one within a day"** — `draftFromCoachWeek` de-dups on the RESOLVED id, so the
 *     rule was already kept in code, where it cannot be talked out of.
 *   · **"Use the nearest one and…"** — us telling the model how to behave when it is short of a
 *     lift, which is exactly the *"אל תנעל אותו"* he is objecting to. The `missing` half stayed;
 *     the instruction half went.
 *
 * ── ⚠️ AND THE FLOOR IS BELOW THIS, MEASURED TWICE ─────────────────────────────────────────────
 * 48 live calls at four lengths, two athlete conditions. `emphasis` is the share of the week's
 * lifts on the muscles she named — how loudly HER sentence was heard:
 *
 *     chars   emphasis   notes
 *     ─────   ────────   ──────────────────────────────────────────────────────────────────────
 *       403     0.43     the previous block
 *       337     0.44     ← THIS. Nothing lost, 66 characters cheaper.
 *       284     0.42     dropping the day-count line: still five days, but an invented id appeared
 *       250     0.40     his four things alone — clean, and the quietest her sentence has been
 *
 * Every variant wrote five days with Hebrew day names. **Nothing BREAKS as it shrinks; her sentence
 * simply gets heard less**, which is the same drift a second experiment found on 2026-08-29 across
 * a different set of cuts (0.46 → 0.39 from 468 to 135). Two independent runs pointing the same
 * way is why the cutting stops here rather than at 250.
 *
 * ⚠️ THE DAY-COUNT LINE STAYS FOR THAT REASON AND NOT BECAUSE THE COUNT NEEDS IT. Every variant got
 * the number right from the facts block alone. It is the cheapest line in the file and the one
 * whose removal correlated with the only defect of the run.
 *
 * ⚠️ THE TEST FOR A LINE BELONGING HERE: *could a better coach than me disagree with it?* If yes it
 * is an opinion and belongs to the model — or to `builderAdvice`, where she can read it and argue
 * back. And there are no EXAMPLES of any kind: an example is the strongest instruction a prompt
 * contains, which is what *"אני לא רוצה דוגמאות כלשהן כך שתנעל את הבינה"* is about.
 */
function instructions(locale: 'en' | 'he'): string {
  return [
    'Write a training week for the athlete below.',
    '',
    '· Exactly the number of days the athlete asked for.',
    '· Only ids from the CATALOGUE. A line is `id = name | name | name` — one lift under all the',
    '  names we know it by. Never invent an id.',
    '· A lift you want that is not there: put the name in `missing`.',
    `· Write each day’s name in ${locale === 'he' ? 'Hebrew' : 'English'}.`,
  ].join('\n');
}

/**
 * The call.
 *
 * ⚠️ THE CATALOGUE IS THE CACHE BREAKPOINT — identical for every athlete on earth, and most of the
 * tokens. Her four facts go below it, where nothing is reused. Same discipline as `importRequest`.
 */
export function buildWeekRequest({
  daysPerWeek,
  sex,
  weightKg,
  ask,
  locale = 'en',
  cache = true,
}: BuildAsk & { cache?: boolean }): {
  v: number;
  blocks: PromptBlock[];
  think: 'low';
  schema: Record<string, unknown>;
} {
  const stable = `${instructions(locale)}\n\nCATALOGUE\n${catalogueLines()}`;
  /*
   * ⚠️ HER WORDS GO LAST AND ARE LABELLED AS HERS. Last, because it is the freshest thing in the
   * context and the thing that should steer; labelled, because a sentence dropped in among our
   * facts reads as one more of our constraints, and it is the opposite of one.
   *
   * ⛔ AND `goal: build muscle` IS DELETED FROM THIS BLOCK. It was our answer to a question she was
   * never asked — true of the product (Hush is hypertrophy-first, register Part 9 §A) and wrong to
   * state HERE, because it told the model to ignore her the moment she asked for anything else. If
   * she says she is training for a marathon, the coach should hear a marathon.
   *
   * ⚠️ CAPPED AT 400 CHARACTERS, and that is a cost bound rather than an opinion about her: this
   * block is the un-cached half of every call, so an unbounded free-text field is an unbounded
   * bill. 400 is longer than anyone types into a one-line field and short enough to be free.
   */
  const said = (ask ?? '').trim().slice(0, 400);
  const her = [
    'ATHLETE',
    `- days per week: ${daysPerWeek}`,
    `- sex: ${sex}`,
    ...(weightKg != null ? [`- bodyweight: ${weightKg} kg`] : []),
    ...(said ? ['', 'WHAT THE ATHLETE ASKED FOR, in their own words:', said] : []),
  ].join('\n');
  return {
    v: BUILD_PROMPT_VERSION,
    blocks: [{ text: stable, ...(cache ? { cache: true as const } : {}) }, { text: her }],
    /*
     * ⛔ `low`, AND IT IS MEASURED ON THE LIVE WORKER (2026-08-29) — not inherited from the note
     * that warned against it.
     *
     * `server/worker.ts` says plainly that *"`low` answered in 3.9s and wrote a one-exercise week"*,
     * and that warning was true OF THE CALL IT WAS MEASURED ON: 35,000 characters of coach doctrine
     * and a four-deep required schema. The model had to reason about a mountain before it could
     * write a line. This call is 786 characters of instruction over a flat two-level schema, and
     * choosing exercises from a list is a far smaller planning problem — so the warning does not
     * transfer, and the way to know that is to measure rather than to inherit it.
     *
     * Five days, real athlete facts, a free-text ask, against the production Worker:
     *
     *     think        wall clock            week that came back
     *     ─────────    ──────────────────    ────────────────────────────────────────────────
     *     minimal      5.9 / 8.7 / 10.1s     ⛔ ONE RUN IN THREE CAME BACK EMPTY (33 tokens)
     *     low          6.5 / 7.3 / 8.1s      5 days, 24-28 lifts, no invented ids, 3 of 3 good
     *     (default)    21.8 / 35.7 / 39.7s   5 days, 26-33 lifts — good, and 3-5× the wait
     *
     * ⚠️ `minimal` IS THE ONE THE OLD WARNING ACTUALLY DESCRIBES, and it reproduced exactly: a week
     * with nothing in it, on a third of the calls. It is not a cheaper `low`; it is a coin flip.
     *
     * The founder's bar for this door is *"gemini בונה לי תוכנית תוך 10 שניות"*. `low` clears it;
     * the default misses it by a factor of three for a week that is no better.
     */
    think: 'low',
    schema: BUILD_WEEK_SCHEMA as unknown as Record<string, unknown>,
  };
}
