/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ASKING THE MODEL ABOUT A WEEK SHE HAS — the plan review's own prompt (2026-09-28).
 *
 * ⛔ FOUNDER, 2026-09-28: *"כן, תכתוב לסקירה פרומפט ייעודי אבל אל תשפיע על ההחלטות של הבינה אלא תן
 * לה את חופש הפעולה על סמך מה שהמשתמש מזין לבינה."*
 *
 * Until today the review was sent the coach's whole doctrine (`coachPrompt.preamble`, 19,687
 * characters) — written for a coach that ran her whole training, chatted, and wrote programmes, a
 * role the app retired on 2026-08-12. Read as the model reads it, it told the reviewer:
 *   · "You are Hush" (the app is FERROX);
 *   · to answer with fields the review schema does not have (`sessions`, `next`, `brief`, `hurts`);
 *   · to "ask how bad it is before deciding anything" — and, a page later, that she cannot answer;
 *   · that the rep band is corrected mid-set — and, later, that nothing moves during the workout;
 *   · and, in its own ask line, a coaching checklist (coverage, dose, balance, order).
 *
 * ── WHAT THIS PROMPT IS INSTEAD — the same shape as `buildPrompt` and `importPrompt` ─────────────
 * Only what is TRUE, and nothing about what to decide:
 *   · what each field of her sheet IS (so the model can read it), never what to do with it;
 *   · what each of the five edits DOES in the app — derived from `planBuilder`'s own constants, so
 *     the prompt cannot describe a different app from the one that applies the edit;
 *   · what the app decides by itself (loads, rests), and what no edit can express, so a wish the
 *     app cannot carry out is said in words rather than lost;
 *   · the catalogue — every name each lift has, the build prompt's vocabulary plus the easier
 *     versions (she has a week here, and may have asked for exactly that);
 *   · her language, named;
 *   · and her words, LAST and labelled as hers — the only steering in the call.
 *
 * ⚠️ THE TEST FOR A LINE BELONGING HERE is `buildPrompt`'s: *could a better coach than me disagree
 * with it?* If yes, it is an opinion, and it is the model's — the founder's ruling above.
 *
 * ⚠️ AND THE ANSWER IS STILL NOT TRUSTED: `parsePlanReview` drops a malformed edit alone, and every
 * edit she approves lands through `planBuilder`'s own verbs (`applyPlanSuggestion`).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { Program } from '@/data/local/models';
import { catalogueLines } from '@/domain/buildPrompt';
import type { CoachFacts, FactProgrammeDay } from '@/domain/coachFacts';
import { languageName, type PromptBlock } from '@/domain/coachPrompt';
import { BUILDER_SETS_DEFAULT, BUILDER_SETS_MAX, BUILDER_SETS_MIN } from '@/domain/planBuilder';

/** Bumped when the wording below changes in a way that could change an answer. */
export const REVIEW_PROMPT_VERSION = 1;

/** The cached half: identical for every athlete, so it goes first (OpenAI caches the prefix). */
function instructions(): string {
  return [
    'Review a training week an athlete has in this app, and reply with the edits you would make to it.',
    '',
    'WHAT YOU ARE GIVEN',
    '· "programme" — her week as it stands. Every day carries "number", its number in her week: the "day" of',
    '  any edit on it. Each item is one exercise: "ex" its id, "rounds" its working sets, "reps" its rep range,',
    '  "load" the kilograms the app has planned for her next time (null: not decided yet, or bodyweight). Items',
    '  that share a "block" number are a superset — she alternates them with no pause between. A day with no',
    '  items is one she has not filled yet.',
    '· "athlete" — what she told the app. "trainingFor" and "limits" are her own words. A field that is absent',
    '  was never given. "resting" lists muscles rested for an injury she reported, with how bad it was and',
    '  "untilMs" (epoch ms), when the rest ends. "units" is only how the app displays weights: every weight',
    '  here is in kilograms.',
    '· "performed" — what the app recorded her lifting, per exercise: "recent" (newest first; "ago" in days,',
    '  the load, and each set\'s reps) and "rungs" (every load she has used on it).',
    '· "swappedByHer" — exercises the app planned that she replaced, and with what. "keepsByHer" — ones she',
    '  was offered a change on and kept.',
    '· "alsoDid" — training her watch recorded outside this app. "ranOwn" — runs she did on her own.',
    '· "equipment" — each equipment type\'s smallest load step and lowest load, in kilograms.',
    '· "decided" and "brief" — notes an earlier version of this app wrote about her, when there are any.',
    '',
    'THE EDITS THE APP CAN MAKE — each one is one exercise on one day. She applies each herself, one at a',
    'time, and may decline any.',
    `· "add" — "ex" goes at the end of that day, with ${BUILDER_SETS_DEFAULT} working sets. An exercise already on that day`,
    '  cannot be added to it again.',
    '· "remove" — "ex" comes off that day.',
    `· "sets" — the working sets of "ex" on that day become "n" (${BUILDER_SETS_MIN} to ${BUILDER_SETS_MAX}).`,
    '· "swap" — "to" takes the place of "ex" on that day, keeping its sets. "to" cannot already be on that day.',
    '· "pair" — "ex" and "to" become a superset on that day ("to" moves to just after "ex"). Not applied if',
    '  either is already in a superset.',
    'The app sets every load and every rest from what she actually lifts. There is no edit for a rep range,',
    'for moving an exercise to another day, or for adding or removing a day — if what you would change needs',
    'one, say so in "say".',
    '',
    'HOW YOU ANSWER',
    '· "say" — your reply to her. She reads it on her phone, above your edits.',
    '· "suggestions" — your edits, in the order you would make them, each with its own one-line reason in its',
    '  "say". It may be empty.',
    '· Exercise ids only from the CATALOGUE below. A line is `id = name | name | name` — one exercise under',
    '  every name it is known by.',
  ].join('\n');
}

/**
 * ⛔ HER WEEK, WITH EVERY DAY'S REAL NUMBER (2026-09-28, found writing this file).
 *
 * `coachPlanFromProgram` leaves out every day with no lifts, and the old prompt let the model count
 * the days it was shown — while `applyPlanSuggestion` counts HER days (`draft.days[day - 1]`). One
 * empty day in the middle of her week and every edit after it landed on the day before the one the
 * model meant: an "add" on the wrong day, a "swap" silently doing nothing. So each day now carries
 * its own number, the empty ones included (she may be asking to fill them), and the model is told
 * that `number` is the `day` of an edit. Rest days are left out: no edit is meant for one.
 */
export function numberedDays(draft: Program, programme: readonly FactProgrammeDay[]): Record<string, unknown>[] {
  let next = 0;
  return draft.days.flatMap((d, i) => {
    if (d.isRest) return [];
    /* The same filter `coachPlanFromProgram` applies, so `programme[next]` IS this day. */
    const written = d.slots.length > 0 ? programme[next++] : undefined;
    if (!written) return [{ number: i + 1, name: d.name, items: [] }];
    const { day: weekday, ...rest } = written;
    return [{ number: i + 1, ...rest, ...(weekday ? { weekday } : {}) }];
  });
}

/**
 * The call. `ask` is what she typed; absent, she asked for an opinion and nothing more.
 *
 * ⚠️ THE CATALOGUE IS THE CACHE BREAKPOINT, as in `buildWeekRequest`: the instructions and the
 * catalogue are byte-identical for every athlete; her sheet and her words go below them.
 */
export function reviewRequest({
  facts,
  draft,
  ask,
  cache = true,
}: {
  facts: CoachFacts;
  draft: Program;
  ask?: string;
  cache?: boolean;
}): { v: number; blocks: PromptBlock[] } {
  const stable = `${instructions()}\n\nCATALOGUE\n${catalogueLines({ regressions: true })}`;
  /* Her sheet without the coach's catalogue columns (the lines above replace them), without a
     session (a review is not after one), and with her week numbered as she has it. */
  const { catalogue: _catalogue, movements: _movements, session: _session, programme, ...hers } = facts;
  const sheet = { ...hers, programme: numberedDays(draft, programme) };
  const said = (ask ?? '').trim().slice(0, 400);
  return {
    v: REVIEW_PROMPT_VERSION,
    blocks: [
      { text: stable, ...(cache ? { cache: true as const } : {}) },
      {
        text:
          `HER SHEET:\n${JSON.stringify(sheet)}\n\n` +
          /* Named, not tagged — `coachRequest` has the two leaks that taught this (`languageName`). */
          `Everything you write is read by her, and she reads this app in ${languageName(facts.athlete.language)}. ` +
          'Write "say" and every suggestion\'s "say" in that language and in NO OTHER — not one word, not one ' +
          'article, not one connective borrowed from a neighbouring script. Exercise ids stay exactly as the ' +
          'catalogue spells them.',
      },
      /* Her words LAST and labelled as hers: the freshest thing in the context, and the only steer. */
      {
        text: said
          ? `WHAT SHE ASKED FOR, in her own words:\n${said}`
          : 'She asked for your opinion of this week, without a request of her own.',
      },
    ],
  };
}
