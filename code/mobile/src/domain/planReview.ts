/**
 * ════ THE AI'S OPINION ON A WEEK SHE BUILT (founder, 2026-08-25) ════
 *
 * *"אפשר להוסיף אפשרות לחוות דעת מהבינה מלאכותית על התוכנית. וכך היא יכולה לכוון ולשדרג את
 * התוכנית אף יותר."*
 *
 * This is the SECOND sanctioned AI surface (the first is the import), and it inherits the import's
 * whole discipline: the model READS, it never writes. Its reply is a sentence plus a list of
 * SUGGESTIONS — atomic verbs she applies one at a time, each one a `planBuilder` operation on her
 * own draft. Nothing here can author a programme, replace a week, or fire on its own; the wire
 * lives in `platform/coach/planReview` behind her tap, and `theAiHasOneJob` pins both files.
 *
 * The verb set mirrors `LiveEdit`'s shape (one verb, one lift, small payload) because that shape
 * already proved itself: a bad item is DROPPED alone (`readToday`'s grace), never the whole reply.
 *
 * ⚠️ AND THERE IS NO `unpair` (2026-08-31). `pair` had to exist — a superset is a thing only the
 * couple's two lifts can express, and she cannot act on advice she is only told about. Its opposite
 * is one tap on a seam that already says "superset" in her own week, so a verb for it would be a
 * fifth thing for the model to weigh in order to save her nothing.
 */

//

import type { Program } from '@/data/local/models';
import { exerciseById } from '@/data/exercises';
import { addLift, moveLift, removeLift, replaceLift, setLiftSets, togglePair, isPaired, BUILDER_SETS_MAX, BUILDER_SETS_MIN } from '@/domain/planBuilder';

/** One approvable atom of the AI's opinion. `day` is 1-based — the way a coach counts. */
export interface PlanSuggestion {
  day: number;
  do: 'add' | 'remove' | 'sets' | 'swap' | 'pair';
  ex: string;
  /** `swap`: the lift to put in its place. `pair`: the lift to superset it with. */
  to?: string;
  /** `sets` only: the set count to move to. */
  n?: number;
  /** The coach's reason, in her language — rendered beside the Apply button, verbatim. */
  say: string;
}

export interface PlanReview {
  say: string;
  suggestions: PlanSuggestion[];
}

/** JSON Schema for the reply — sent as the provider's responseSchema, never printed in the prompt. */
export const PLAN_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer' },
          do: {
            type: 'string',
            enum: ['add', 'remove', 'sets', 'swap', 'pair'],
            /*
             * ⛔ THE VERBS ARE NAMED HERE AND NOWHERE ELSE (2026-08-31). `add`/`remove`/`sets`/`swap`
             * say what they do; `pair` does not, and a verb the model has to guess at is a verb it
             * uses wrongly or never. The description rides the `responseSchema` we already send, so
             * it costs the preamble nothing — the same trade `BUILD_WEEK_SCHEMA.pair` makes.
             */
            description:
              '"pair" makes the two lifts a superset — "ex" and "to", alternated, in one block on that day.',
          },
          ex: { type: 'string' },
          to: { type: 'string' },
          n: { type: 'integer' },
          say: { type: 'string' },
        },
        required: ['day', 'do', 'ex', 'say'],
      },
    },
  },
  required: ['say', 'suggestions'],
} as const;

const VERBS = new Set(['add', 'remove', 'sets', 'swap', 'pair']);

/** One suggestion's own validity — catalogue facts only; draft facts are the apply's job. */
function validSuggestion(s: unknown): s is PlanSuggestion {
  if (typeof s !== 'object' || s == null) return false;
  const x = s as Record<string, unknown>;
  if (typeof x.day !== 'number' || !Number.isInteger(x.day) || x.day < 1) return false;
  if (typeof x.do !== 'string' || !VERBS.has(x.do)) return false;
  if (typeof x.ex !== 'string' || !exerciseById(x.ex)) return false;
  if (typeof x.say !== 'string' || x.say.trim() === '') return false;
  if (x.do === 'swap' && (typeof x.to !== 'string' || !exerciseById(x.to))) return false;
  /* A pair needs TWO real lifts, and two DIFFERENT ones — "superset the bench with the bench" is a
     reply that did not mean anything, and `togglePair` would have no second seat to reach. */
  if (x.do === 'pair' && (typeof x.to !== 'string' || !exerciseById(x.to) || x.to === x.ex)) return false;
  if (x.do === 'sets' && (typeof x.n !== 'number' || !Number.isInteger(x.n) || x.n < BUILDER_SETS_MIN || x.n > BUILDER_SETS_MAX)) return false;
  return true;
}

/**
 * Read the model's reply. A malformed ITEM is dropped alone (`readToday`'s grace — one bad verb
 * must not cost her the review); a reply with no readable sentence is unreadable outright.
 */
export function parsePlanReview(raw: unknown): { ok: true; review: PlanReview } | { ok: false; reason: 'not_json' | 'nothing_said' } {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'not_json' };
    }
  }
  if (typeof obj !== 'object' || obj == null) return { ok: false, reason: 'not_json' };
  const x = obj as Record<string, unknown>;
  if (typeof x.say !== 'string' || x.say.trim() === '') return { ok: false, reason: 'nothing_said' };
  const list = Array.isArray(x.suggestions) ? x.suggestions : [];
  return { ok: true, review: { say: x.say.trim(), suggestions: list.filter(validSuggestion) } };
}

/**
 * Apply ONE approved suggestion to the draft. Every path lands on a `planBuilder` operation, so
 * every rule she enjoys (duplicate guard, set clamp, capability from the catalogue) binds the AI
 * exactly as it binds her fingers. An inapplicable suggestion (day gone, lift gone) is a no-op —
 * the draft may have moved since the model looked at it, and a stale opinion must not throw.
 */
export function applyPlanSuggestion(draft: Program, s: PlanSuggestion): Program {
  const di = s.day - 1;
  const day = draft.days[di];
  if (!day) return draft;
  switch (s.do) {
    case 'add':
      return addLift(draft, di, s.ex);
    case 'remove': {
      const si = day.slots.findIndex((sl) => sl.exerciseId === s.ex);
      return si < 0 ? draft : removeLift(draft, di, si);
    }
    case 'sets': {
      const si = day.slots.findIndex((sl) => sl.exerciseId === s.ex);
      return si < 0 || s.n == null ? draft : setLiftSets(draft, di, si, s.n);
    }
    case 'swap': {
      const si = day.slots.findIndex((sl) => sl.exerciseId === s.ex);
      return si < 0 || !s.to ? draft : replaceLift(draft, di, si, s.to);
    }
    /*
     * ════ THE COACH MAY PROPOSE A COUPLE, ON THE SAME TERMS SHE WRITES ONE ════
     *
     * ⛔ FOUNDER, 2026-08-31: *"וביצירת התוכנית הבינה מלאכותית יודעת להוסיף את זה בתוכנית האימון
     * במידה והיא מציעה סופר סט?"* — three surfaces had to answer yes, and this is the third: the
     * reviewer could already SEE her supersets (`coachFacts`, same day), and now it can suggest one.
     *
     * ⚠️ IT MOVES THE PARTNER, because `togglePair` couples ADJACENT seats and a coach naming two
     * lifts is naming a couple, not a seat number. The move is `moveLift` — her own verb, which
     * dissolves every pair it disturbs and normalises after itself — so the draft that comes out is
     * one her fingers could have produced, which is the whole rule for this file.
     *
     * ⚠️ AND IT REFUSES RATHER THAN REARRANGES. If either lift is already half of a couple, this is
     * a no-op: breaking a pair SHE made in order to build the one the model wants is a second edit
     * she never approved, hiding inside the one she did. She unpairs with one tap and applies again.
     */
    case 'pair': {
      const si = day.slots.findIndex((sl) => sl.exerciseId === s.ex);
      const pi = day.slots.findIndex((sl) => sl.exerciseId === s.to);
      if (si < 0 || pi < 0 || si === pi) return draft;
      /*
       * Every seat `moveLift` would touch — its own, the one it leaves, and both of their
       * neighbours above. A couple standing on any of them is HERS, and it dissolves silently on a
       * move; that is a second edit riding inside the one she approved, so this refuses instead.
       */
      if ([si - 1, si, si + 1, pi - 1, pi].some((i) => i >= 0 && isPaired(draft, di, i))) return draft;
      // The partner takes the seat directly under `ex`; already there, the move is skipped entirely.
      const moved = pi === si + 1 ? draft : moveLift(draft, di, pi, si + 1);
      const at = moved.days[di]?.slots.findIndex((sl) => sl.exerciseId === s.ex) ?? -1;
      /* ⚠️ AND THE COUPLE IS CONFIRMED BY NAME BEFORE IT IS MADE. `togglePair` couples a seat with
         whatever sits under it, so a move that landed one seat off would couple her with a stranger
         — valid, silent, and not what anybody asked for. If the two are not adjacent now, nothing. */
      if (at < 0 || moved.days[di]?.slots[at + 1]?.exerciseId !== s.to) return draft;
      return togglePair(moved, di, at);
    }
  }
}
