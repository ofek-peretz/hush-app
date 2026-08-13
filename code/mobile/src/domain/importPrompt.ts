/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE THING THE ENGINE CANNOT DO — reading a programme written by somebody else.
 *
 * ⛔ FOUNDER, 2026-08-11: *"אתה לא צריך לכתוב פרומפט כלשהו לבינה שלנו?"* Yes, and it must not be the
 * coach's one. `coachPrompt` is 935 lines that teach a model to CONVERSE and to BUILD a programme —
 * the two things this call must never do. Sending it here would pay for 4,700 tokens of training
 * doctrine to answer "what is a Zercher squat", and would invite the model to improve her week on
 * the way past.
 *
 * ── WHAT THIS CALL IS FOR, AND HOW SMALL IT IS ─────────────────────────────────────────────────
 * `importedPlan.matchWeek` already resolves her programme against the catalogue deterministically —
 * measured, it matches 117 of 117 lifts by their own name and all 46 declared synonyms. The model is
 * handed ONLY the leftovers: the handful of names nothing local answered.
 *
 * For each one it does exactly two things:
 *   · says which catalogue lift it IS, when it is one of ours under a name we do not list
 *     ("Barbell Hip Thrust" written as "Glute Bridge Barbell", a Hebrew or Spanish name, a typo);
 *   · or says it is not ours, and names the CLOSEST lift we do carry, with one line of why.
 *
 * ⚠️ AND IT NEVER DECIDES. The reply is a SUGGESTION rendered on the review screen, and she taps to
 * accept it. `importedPlan` refuses to guess for exactly this reason — a substitution she did not
 * agree to is the one failure this whole feature exists to prevent, and moving the guess from a
 * local scorer to a remote model does not make it hers.
 *
 * ── THE MODEL ──────────────────────────────────────────────────────────────────────────────────
 * Not chosen here, and deliberately not choosable by the app: `server/worker.ts` names
 * `gemini-3.6-flash` and refuses a `model` from the caller, so a client cannot spend our money on a
 * model we did not pick. That decision is documented there against real prices and real usage.
 *
 * What IS chosen here is `think: 'low'`, and the reasoning is the worker's own measurements:
 * thinking was 4,105 tokens of a 4,557-token programme build — 82% of the bill — because building a
 * week is a planning problem. Naming a lift is a recall problem. The worker's note warns that
 * turning thinking down cost programme QUALITY ("`low` answered in 3.9s and wrote a one-exercise
 * week"), and that warning is about the call that PLANS. It does not transfer to this one.
 *
 * ⚠️ `minimal` is not used. These names arrive misspelled, abbreviated, translated and occasionally
 * invented, and telling "not one of ours" from "ours under another name" is the whole job.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { EXERCISES } from '@/data/exercises';
import type { PromptBlock } from '@/domain/coachPrompt';

/** Bumped when the wording below changes in a way that could change an answer. */
export const IMPORT_PROMPT_VERSION = 1;

/**
 * ⛔ THE SCHEMA IS THE GUARD RAIL, NOT THE PROSE.
 *
 * `id` is nullable on purpose and the prompt says why: "not one of ours" is a real, correct, common
 * answer, and a schema that demanded an id would force the model to invent one for every lift the
 * catalogue genuinely lacks. That is the failure mode this feature cannot have.
 *
 * `alternative` carries the closest lift we DO have, and it is separate from `id` so the two can
 * never be confused downstream: `id` means "this IS that lift", `alternative` means "this is not
 * ours, and here is the nearest thing". The review screen renders them as different sentences,
 * because they are different claims.
 */
export const IMPORT_MATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lifts'],
  properties: {
    lifts: {
      type: 'array',
      minItems: 1,
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          /** Echoed back exactly as it was sent, so the caller can pair answers to questions. */
          name: { type: 'string' },
          /** The catalogue id when this IS one of ours under another name. Null when it is not. */
          id: { type: 'string', nullable: true },
          /** The closest lift we carry, when `id` is null. Never a stand-in for `id`. */
          alternative: { type: 'string', nullable: true },
          /** One short sentence, in her language, for the review screen to show her. */
          why: { type: 'string', nullable: true },
        },
      },
    },
  },
} as const;

/**
 * The catalogue, as the shortest thing that can answer the question.
 *
 * `coachFacts` sends a far richer catalogue because the coach has to PROGRAMME from it — tiers,
 * equipment, patterns, loadability. None of that helps name a lift. Id and name is the whole of
 * what a matcher needs, and it is about a fifth of the tokens.
 */
function catalogueLines(): string {
  return EXERCISES.map((e) => `${e.id} = ${e.name}`).join('\n');
}

export interface ImportAsk {
  /** The names `matchWeek` could not resolve. Nothing else is sent — her week stays here. */
  unmatched: string[];
  /** Her language, so `why` comes back in it. */
  locale?: 'en' | 'he';
}

/**
 * The instructions, kept deliberately short.
 *
 * ⚠️ THE FOUR RULES ARE THE PRODUCT DECISION, not prompt decoration:
 *
 *   1. Answer only about the names sent. The model never sees her week, so it cannot rewrite it,
 *      cannot comment on her volume, and cannot suggest a better split — which is the founder's
 *      standing line on where AI belongs in this app.
 *   2. `null` is a correct answer. Said twice, because a model asked for an id will produce an id.
 *   3. Never invent an id. Every id it returns is checked against the catalogue by the caller, and a
 *      hallucinated one is dropped — but saying so here costs nothing and avoids the round trip.
 *   4. One sentence of `why`, for HER, not for us. The review screen shows it beside her own words.
 */
function instructions(locale: 'en' | 'he'): string {
  return [
    'You are matching exercise names against a fixed catalogue. You are not writing a programme,',
    'not judging one, and not giving training advice. Answer only about the names listed below.',
    '',
    'For each name:',
    '· If it IS one of the catalogue lifts under a different name, a translation, an abbreviation or',
    '  a misspelling, set `id` to that catalogue id.',
    '· If the catalogue does not contain it, set `id` to null and set `alternative` to the id of the',
    '  closest lift we do carry — closest in the movement trained, not in the name.',
    '',
    'Rules:',
    '· `id: null` is a correct and expected answer. Many real exercises are not in this catalogue.',
    '· Never return an id that is not in the list below. If unsure, use null.',
    '· `why` is ONE short sentence written for the athlete, in ' + (locale === 'he' ? 'Hebrew' : 'English') + '.',
    '· Echo `name` back exactly as it was given.',
  ].join('\n');
}

/**
 * The call.
 *
 * ⚠️ THE CATALOGUE IS THE CACHE BREAKPOINT, and it is the only thing here worth caching: it is
 * identical on every import for every athlete, and it is most of the tokens. Her unmatched names go
 * below it, where nothing is reused. Same discipline as `coachRequest`, one flag rather than a
 * rewrite — see the economics note in `coachPrompt`.
 */
export function importRequest({ unmatched, locale = 'en', cache = false }: ImportAsk & { cache?: boolean }): {
  v: number;
  blocks: PromptBlock[];
  think: 'low';
  schema: Record<string, unknown>;
} {
  const stable = `${instructions(locale)}\n\nCATALOGUE\n${catalogueLines()}`;
  return {
    v: IMPORT_PROMPT_VERSION,
    blocks: [
      { text: stable, ...(cache ? { cache: true as const } : {}) },
      { text: `NAMES\n${unmatched.map((n) => `- ${n}`).join('\n')}` },
    ],
    // Recall, not planning — see the header.
    think: 'low',
    schema: IMPORT_MATCH_SCHEMA as unknown as Record<string, unknown>,
  };
}

/* ═════════════════════════════ reading a photograph of her programme ═════════════════════════════ */

/**
 * ⛔ THE READ CALL DOES NOT GET THE CATALOGUE, AND THAT IS THE WHOLE DESIGN.
 *
 * FOUNDER, 2026-08-11: *"פשוט נעשה שאפשר לשלוח רק תמונה… והבינה סורקת ומיישמת?"*
 *
 * The tempting build is one call: hand the model her photograph AND the catalogue, and let it come
 * back with a finished programme in our ids. It is one round trip and it feels simpler. It is the
 * wrong shape, and the reason is not cost.
 *
 * `matchWeek` resolves names against this catalogue PERFECTLY — measured, 117 of 117 lifts by their
 * own name and all 46 declared synonyms. Handing the matching to a model replaces a matcher that
 * cannot be wrong with one that can, on the one step where being wrong is invisible: she gets a lift
 * she did not write, at the sets she did write, and nothing on any screen says so.
 *
 * So the two jobs are split along the line the founder drew for AI in this app:
 *
 *     READING a photograph  — we genuinely cannot do it. The model does it.
 *     MATCHING to our ids   — we do it perfectly, deterministically, offline, for free.
 *
 * The read call therefore asks for her words VERBATIM and is told not to interpret them. It costs
 * 63 tokens of instruction instead of 1,258, and — more to the point — its output is checked by
 * code rather than trusted.
 */
export const IMPORT_READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sessions'],
  properties: {
    /** What she calls the programme, if the sheet says. Never invented. */
    title: { type: 'string', nullable: true },
    sessions: {
      type: 'array',
      minItems: 1,
      maxItems: 14,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'lifts'],
        properties: {
          name: { type: 'string' },
          lifts: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name'],
              properties: {
                /** Exactly as written on the sheet. Not translated, not corrected, not expanded. */
                name: { type: 'string' },
                /**
                 * ⛔ THE SAME LIFT'S ORDINARY ENGLISH NAME — and this field is why a Hebrew sheet works.
                 *
                 * The catalogue ships English names only, by product rule (`exerciseDisplayName`), so
                 * `matchLift` has no Hebrew in its vocabulary and a Hebrew programme would miss on
                 * EVERY line — every name would fall through to the second call, which is slower,
                 * costlier, and puts the whole match in the model's hands instead of ours.
                 *
                 * ⚠️ IT DOES NOT REPLACE `name`. Her words are what the review shows her and what a
                 * report about "I could not find this" has to quote. This is a second reading of the
                 * same line, used only to look the lift up. That keeps "do not translate" true where
                 * it matters — nothing she wrote is overwritten — while giving the local matcher, which
                 * cannot be wrong, a chance to answer first.
                 */
                nameEn: { type: 'string', nullable: true },
                /** Working sets, when the sheet states them. Absent when it does not — never guessed. */
                sets: { type: 'integer', nullable: true },
              },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * The read call.
 *
 * ⚠️ "DO NOT CORRECT" IS THE LOAD-BEARING INSTRUCTION. A model asked to read a training programme
 * will helpfully tidy it — expand "BP" to "Bench Press", fix a spelling, drop a lift it thinks is a
 * duplicate. Every one of those is a silent edit to a coach's programme, and it happens upstream of
 * every guard we built. Her words come back as her words, and `matchWeek` deals with them after.
 *
 * ⚠️ AND `sets` IS NULLABLE FOR THE SAME REASON `id` IS ON THE MATCH SCHEMA. A sheet that does not
 * state a set count must come back without one — `importedPlan` then carries F-1's floor and REPORTS
 * it, which is a question she can answer. A guessed number is a number she cannot tell from hers.
 */
export function importReadRequest({ locale = 'en', cache = false }: { locale?: 'en' | 'he'; cache?: boolean } = {}): {
  v: number;
  blocks: PromptBlock[];
  think: 'low';
  schema: Record<string, unknown>;
} {
  const text = [
    'Read the training programme in the image or images. Return its sessions in the order they',
    'appear, and for each session the exercises in the order they appear.',
    '',
    'For every exercise return:',
    '· `name` — EXACTLY as written on the sheet. Do not translate it, do not correct spelling, do',
    '  not expand abbreviations, do not replace it with a name you consider more standard.',
    '· `nameEn` — the ordinary ENGLISH name of the same exercise, if you recognise it. This is a',
    '  second reading used to look the lift up; it never replaces `name`. Omit it if unsure.',
    '· `sets` — the number of WORKING sets, only if the sheet states it. If it does not, omit it.',
    '',
    'Rules:',
    '· Copy, do not improve. Never add an exercise, never remove one, never reorder them.',
    '· Warm-ups and notes in the margin are not exercises; skip them.',
    '· If a session has no name on the sheet, use its day or its position ("Day 1").',
    '· If you cannot read something, leave it out rather than guessing at it.',
    locale === 'he' ? '· The sheet may be in Hebrew. Return the names in the language they are written.' : '',
  ]
    .filter(Boolean)
    .join(String.fromCharCode(10));
  return {
    v: IMPORT_PROMPT_VERSION,
    blocks: [{ text, ...(cache ? { cache: true as const } : {}) }],
    // Transcription, not planning. The worker's own measurement of thinking cost is about the call
    // that BUILDS a week; reading one back is not that.
    think: 'low',
    schema: IMPORT_READ_SCHEMA as unknown as Record<string, unknown>,
  };
}

/**
 * Read the transcription into the shape `importedPlan` takes.
 *
 * ⛔ NOTHING IS TRUSTED. A session with no lifts is dropped, a lift with no name is dropped, and a
 * set count that is not a positive whole number is treated as UNSTATED rather than coerced — a "0"
 * or a "3-4" becomes a question on the review screen instead of a number she never wrote.
 */
export function readImportedWeek(raw: unknown): { title?: string; sessions: { name: string; lifts: { name: string; nameEn?: string; sets?: number }[] }[] } {
  const src = raw as { title?: unknown; sessions?: unknown[] };
  const sessions = Array.isArray(src?.sessions) ? src.sessions : [];
  const out: { name: string; lifts: { name: string; nameEn?: string; sets?: number }[] }[] = [];
  for (const s of sessions) {
    const sess = s as { name?: unknown; lifts?: unknown[] };
    const name = typeof sess?.name === 'string' && sess.name.trim() ? sess.name.trim() : null;
    const lifts: { name: string; nameEn?: string; sets?: number }[] = [];
    for (const l of Array.isArray(sess?.lifts) ? sess.lifts : []) {
      const lift = l as { name?: unknown; nameEn?: unknown; sets?: unknown };
      const ln = typeof lift?.name === 'string' && lift.name.trim() ? lift.name.trim() : null;
      if (!ln) continue;
      const sets = typeof lift.sets === 'number' && Number.isInteger(lift.sets) && lift.sets > 0 ? lift.sets : undefined;
      const en = typeof lift.nameEn === 'string' && lift.nameEn.trim() ? lift.nameEn.trim() : undefined;
      lifts.push({ name: ln, ...(en ? { nameEn: en } : {}), ...(sets ? { sets } : {}) });
    }
    if (!name || lifts.length === 0) continue;
    out.push({ name, lifts });
  }
  const title = typeof src?.title === 'string' && src.title.trim() ? src.title.trim() : undefined;
  return { ...(title ? { title } : {}), sessions: out };
}

export interface ImportSuggestion {
  name: string;
  /** A catalogue id, when the model says this IS one of ours. Verified against the catalogue. */
  id: string | null;
  /** The closest lift we carry, when it is not ours. Verified against the catalogue. */
  alternative: string | null;
  why: string | null;
}

/**
 * Read the reply, and throw away anything it made up.
 *
 * ⛔ EVERY ID IS CHECKED AGAINST THE CATALOGUE. A model that answers `barbell_zercher_squat` has
 * invented a lift, and accepting it would put an exercise into her week that does not exist —
 * a crash on the session screen at best, and at worst a silent empty slot.
 *
 * ⚠️ AND AN ANSWER ABOUT A NAME WE DID NOT ASK ABOUT IS DROPPED. The model echoes `name` back; if
 * it echoes something else, that row is about a lift nobody asked for and has no place in her week.
 */
export function readImportReply(raw: unknown, asked: string[]): ImportSuggestion[] {
  const ids = new Set(EXERCISES.map((e) => e.id));
  const wanted = new Set(asked);
  const rows = (raw as { lifts?: unknown[] })?.lifts;
  if (!Array.isArray(rows)) return [];
  const out: ImportSuggestion[] = [];
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name : null;
    if (!name || !wanted.has(name)) continue;
    const id = typeof row.id === 'string' && ids.has(row.id) ? row.id : null;
    const alt = typeof row.alternative === 'string' && ids.has(row.alternative) ? row.alternative : null;
    out.push({
      name,
      id,
      // An `alternative` alongside a confirmed `id` is a contradiction; the id wins and the rest goes.
      alternative: id ? null : alt,
      why: typeof row.why === 'string' && row.why.trim() ? row.why.trim() : null,
    });
  }
  return out;
}
