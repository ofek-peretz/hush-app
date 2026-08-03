/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * COACH PLAN — what the coach writes back, and the parse that turns it into something the app runs.
 *
 * `coachFacts` is the message out. This is the message in. Between them there is ONE decider, and
 * it is not this file: **nothing here forms an opinion about whether a decision is a good one.** A
 * plan that says "drop her to two sets" is executed. A plan that says "raise the bench 5 kg" is
 * executed. The engine has no veto and this file gives it none.
 *
 * ── THE REWRITE, AND WHY (founder, 2026-07-31) ══════════════════════════════════════════════════
 * Version 1 of this schema said: days → lifts → { exercise, sets, rep band, load, rest }. It was
 * written a day after the product widened to **every goal, cardio included**, and it could not
 * express a single line of a marathon plan. "Tuesday, easy 5 km" has no field. "6 × 400 m at 5 k
 * pace, 90 seconds walk" has no field. No load, no sets, no reps.
 *
 * The founder's diagnosis was exact:
 *
 *   > *"Don't let the current screens influence you. Imagine this chat window went into the app and
 *   > someone asked you to manage their training — you'd behave normally, exactly like a chat, only
 *   > you also get their data after every workout. That's it."*
 *
 * So the question this file answers is: **what vocabulary does a session need so that anything a
 * coach could say in a chat can be rendered and run?** Four shapes, and two things on top.
 *
 * ── A SET, A LAP AND A CIRCUIT ROUND ARE THE SAME THING ─────────────────────────────────────────
 * The unifying move, and the reason there is no `sets` field anywhere below. A block is a group of
 * items done `rounds` times:
 *
 *   · 4 sets of bench          → one block, `rounds: 4`, one item
 *   · a 3-exercise circuit × 3 → one block, `rounds: 3`, three items
 *   · 6 × 400 m with a walk    → one block, `rounds: 6`, two items
 *
 * One structure, three things the old schema needed three ideas for — and "sets" stops being a
 * concept that only strength training has.
 *
 * ── THE FOUR SHAPES ─────────────────────────────────────────────────────────────────────────────
 *   `reps`      — reps, optionally at a load.        10 at 40 kg
 *   `time`      — a duration, optionally at a load.  a 45 s plank, 20 min on the bike
 *   `distance`  — a distance, optionally at a load.  5 km, a 40 m farmer's carry
 *   `open`      — no number worth stating.           mobility, skill work, a warm-up
 *
 * And on EVERY item, the thing the app could never carry before: **`say` — the execution
 * instruction, in the coach's own words.** "Take this one to a rep short of failure." "At a pace
 * where you could hold a conversation." A prescription used to be able to state how MUCH and never
 * how. That gap is why the record was ambiguous, and it is what the founder identified: an
 * instruction given up front is worth more than a measurement taken afterwards.
 *
 * ── THE ONE THING THAT IS NOT A DECISION ────────────────────────────────────────────────────────
 * Loads on LIFTS pass through `normalizeLoad`, the same function every load in this app passes
 * through, using her performed rungs. The coach is told each equipment's grain in the sheet, so a
 * well-behaved plan is identical in and out and `snapped` stays 0 — it is a typist, not an editor.
 * It exists for 32.4 kg on a machine whose pins move in 5s.
 *
 * A load on a MOVEMENT is left exactly as written: we do not know what she is carrying, and
 * snapping to a grid we do not have would be inventing one.
 *
 * Pure and I/O-free. Knows nothing about any model, provider or transport.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { EXERCISES, type Exercise } from '@/data/exercises';

/** Every muscle name the catalogue uses — the only vocabulary a rest window can be written in. */
const MUSCLES = new Set<string>(EXERCISES.map((e) => e.muscle));
import { MOVEMENTS, type Movement } from '@/data/movements';
import { normalizeLoad } from '@/engine/loadMath';
import type { CoachFacts } from './coachFacts';
import { LIVE_EDIT_VERBS, type LiveEdit } from './liveRevision';

/**
 * Bumped from 1 when the shape widened past lifts. Version 1 could not describe a run and never
 * reached a single athlete — there was no transport when it existed — so nothing migrates.
 */
export const COACH_PLAN_VERSION = 2;

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
const WEEKDAYS: readonly string[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** What every item carries, whatever its shape. */
interface ItemBase {
  /** A catalogue lift id or a movement id. Anything else makes the plan unreadable. */
  ex: string;
  /**
   * The execution instruction, in the coach's words, or absent.
   *
   * Never generated here and never checked here — the voice laws bind what the app STATES as its
   * own decision, and this is the coach speaking. A parser that edited a coach's sentence would be
   * a second author.
   */
  say?: string;
}

/** Reps, optionally at a load. `[8, 12]` is a band; `[5, 5]` is a fixed count. */
export interface RepsItem extends ItemBase {
  kind: 'reps';
  reps: [number, number];
  load: number | null;
}
/** Held or worked for a duration. */
export interface TimeItem extends ItemBase {
  kind: 'time';
  seconds: number;
  load?: number | null;
}
/** Covered. Metres, always — one unit in the record, converted for display. */
export interface DistanceItem extends ItemBase {
  kind: 'distance';
  metres: number;
  load?: number | null;
}
/** No number worth stating. */
export interface OpenItem extends ItemBase {
  kind: 'open';
}

export type PlannedItem = RepsItem | TimeItem | DistanceItem | OpenItem;

/** A group of items done `rounds` times — a set, a lap and a circuit round are one idea. */
export interface PlannedBlock {
  rounds: number;
  /** Rest BETWEEN rounds, in seconds. Absent = the coach did not prescribe one. */
  restS?: number;
  /** Rest after the block ends, before the next one. */
  restAfterS?: number;
  items: PlannedItem[];
}

export interface PlannedSession {
  name: string;
  /**
   * The day it belongs on, or absent.
   *
   * A hypertrophy programme does not care which day is which — the athlete trains four times a week
   * in whatever order suits her. A marathon plan cares enormously: the long run is on Sunday
   * because the week is built around it. Optional, so neither has to pretend to be the other.
   */
  day?: Weekday;
  blocks: PlannedBlock[];
}

export interface CoachPlan {
  v: number;
  /**
   * ════ WHAT THIS PROGRAMME IS CALLED ════
   *
   * ⛔ FOUNDER, 2026-08-04, on the product feeling like a generic AI app: *"my model from the start
   * of development was to be the SPOTIFY of the fitness world, and right now I don't recognise my
   * product."*
   *
   * The sharpest thing about Discover Weekly is not the algorithm — it is that what arrives is a
   * MADE OBJECT. It has a name, a cover and a shape, and the intelligence behind it is invisible.
   * A playlist without a name is a list of songs.
   *
   * Hush already had the week. It did not have the thing that makes a week a PROGRAMME she is on:
   * something to call it. "Twelve weeks to the half" is a commitment; "your plan" is a screen.
   *
   * ⚠️ OPTIONAL, because a coach that has nothing worth naming must not be forced to invent a name —
   * an obligatory title is how you get "Your Personalized Fitness Journey". Absent, every surface
   * falls back to what it said before.
   */
  title?: string;
  /** One line on why this programme exists, in the coach's own words. Her reason, given back. */
  why?: string;
  /**
   * The programme in full, not a patch. A patch has to be merged, and a merge is a second opinion
   * about what the coach meant. Stating it whole costs a few hundred output tokens and removes the
   * entire class of question.
   */
  sessions: PlannedSession[];
  /** What the coach says to the athlete about what it did, tied to the lift it is about. */
  notes?: { ex?: string; say: string }[];
}

/**
 * ════ ONE TURN OF THE COACH — WHAT IT SAID, AND WHAT IT DECIDED ════
 *
 * Every turn says something. Some turns also decide.
 *
 * That split is the whole reason this type exists, and it was missing for one build. The schema used
 * to REQUIRE `sessions`, which made every possible turn one of two broken things: ask "why did my
 * bench go down?" and the coach must emit an entire programme to answer a question; or drop the
 * schema for chat and the intake conversation can never build the programme it was just instructed
 * to build. Neither is a coach. **A real coaching turn is words, and sometimes a decision with them.**
 *
 * It also collapses the call types into ONE schema. Chat, intake and the post-session call now send
 * a byte-identical preamble, so they share a cache entry instead of holding three — see
 * `coachPrompt`'s economics.
 */
export interface CoachAnswer {
  /**
   * What she reads. **Always present.** A turn with nothing to say is not a turn, and a programme
   * that arrives with no sentence attached is the thing this app exists to not be.
   */
  say: string;
  /** The programme, whole, when this turn decided one. `null` when the coach only spoke. */
  plan: CoachPlan | null;
  /**
   * The reasons, when this turn decided something that attached NO programme.
   *
   * A hold changes nothing and is still a decision — the founder listed it himself. When a plan is
   * attached the reasons travel inside it (`plan.notes`); this carries them for the turns where
   * there is no plan to put them in, so the "Why?" screen sees them either way.
   */
  notes?: NonNullable<CoachPlan['notes']>;
  /**
   * What she has just said hurts, when she said so — see `hurts` on the schema.
   *
   * The app writes the rest window from this. It is her testimony, reported by the only part of the
   * product that hears her; nothing here decides whether it believes her.
   */
  hurts?: { muscle: string; severity: 'twinge' | 'pain' | 'sharp' };
  /**
   * ⛔ CHANGES TO THE WORKOUT SHE IS STANDING IN — see `today` on the schema.
   *
   * The founder's *"you ask for anything in the chat window and it happens"*. Only meaningful while
   * a session is running; ignored otherwise. `domain/liveRevision` owns what each verb does and the
   * invariant that nothing behind her moves.
   */
  today?: LiveEdit[];
  /**
   * Which of its two intake moves the coach says it just made — see `next` on the schema.
   *
   * `'built'` with `plan: null` is the one combination that must never reach her: it is the coach
   * announcing a programme it did not attach. `useCoach` asks again when it sees it.
   */
  next?: 'asking' | 'built';
  /**
   * What she TOLD it about herself in this turn, when she told it something.
   *
   * ════ THE NUMBERS WERE STAYING IN THE TRANSCRIPT ════
   *
   * The intake prompt names two facts nothing else in the app will ever ask her for — her
   * bodyweight and how many days a week she can train — and asks the coach to get them in
   * conversation, the way a person does. It does. Then they stopped there: the profile kept
   * `daysPerWeek: 4`, the placeholder `ConnectHealth` hands over ("the coach replaces it", and
   * nothing did), and `weightKg` stayed empty for ever.
   *
   * That is not a cosmetic gap. `coachFacts` builds every LATER sheet from the profile, so a coach
   * that agreed on three days read "daysPerWeek: 4" on its own sheet next time, under a rule that
   * says *"write exactly that many sessions"* — it contradicted itself out of its own record. And
   * an empty bodyweight silently switched off everything keyed to it: the calorie estimate, the
   * milestone ladders' anchor, and her weight trend, which cannot start without a first weight.
   *
   * Reported rather than PARSED, because the thing that already reads her sentences is the model.
   * A regex over free text in two languages ("62 kilos", "around 60", "I'm 135 pounds") is a second
   * interpreter of the same words, and the one place it would go wrong is the one place it matters.
   */
  learned?: LearnedAboutHer;
  /**
   * ════ THE COACH'S OWN MEMORY OF WHO SHE IS ════
   *
   * ⚠️ THE PROMPT PROMISED THIS FIELD AND NOTHING EVER FILLED IT. It told the coach, in these
   * words: *"her own words — her goal, her history, her injuries — are in `brief`, and are
   * testimony."* `domain/athleteBrief` was written for it and imported by nobody, and no caller
   * ever passed it. The field was empty on every call this product has ever made.
   *
   * What that costs is not a rough edge, it is AMNESIA. She says "I want to finish a half marathon"
   * in the intake and the coach hears it — once. The post-session call, which is the one that
   * decides what she trains next, sends no conversation at all: only her record and the coach's own
   * notes, which are capped. So her goal, her history, the thing she asked for in March, all age
   * out, and a year in the coach is writing perfectly reasonable programmes for someone it no
   * longer knows anything about.
   *
   * ── WHY THE COACH WRITES IT RATHER THAN THE APP ─────────────────────────────────────────────────
   * A form would ask everyone the same eight questions and flatten "I want to be a better
   * footballer" and "I have a wedding in four months" into one enum. Whatever the coach thought
   * worth remembering is worth remembering, in the words it chose. It is never parsed, never
   * validated, never rendered — it travels back on every call and nothing else reads it.
   *
   * It also subsumes the other half of the hole: a standing request. "Never give me lunges again",
   * "I train around a bad shoulder", "I came over from another app with this split" — she says it
   * once, the coach writes it here, and it is still true in a year.
   *
   * WHOLE, NOT A PATCH, and only when it CHANGED — see the prompt. A rewrite on every turn would
   * cost output tokens to restate what is already stored.
   *
   * ⚠️ A LIST OF LINES, AND THAT IS A SCAR. The first version was one free string, capped at 1,500
   * characters in the PARSE and asked for in prose. The first live call answered with 7,883
   * characters of the same four facts repeating until the output budget ran out — `MAX_TOKENS`, the
   * reply truncated, and **no programme at all** on a turn whose `say` promised one.
   *
   * A cap the answerer cannot see is not a cap. `maxLength` would say it structurally, and the
   * Worker's schema translator does not forward that field — but it does forward `maxItems`. So the
   * memory is a LIST: bounded by something the model is actually told, and a better shape besides.
   * One fact per line is how the rest of this product is written.
   */
  brief?: string[];
}

/**
 * How much of the coach's memory travels.
 *
 * It rides on EVERY call, so it is charged for on every call — but it is the cheapest memory in the
 * product by a wide margin: the alternative is re-reading a whole conversation, and the alternative
 * to that is forgetting. Long enough for a goal, a history, a handful of standing requests and the
 * shape of an imported programme; short enough that it cannot quietly become a diary.
 */
export const COACH_BRIEF_MAX = 1500;

/** How many lines the memory may hold. Bounded structurally — see `CoachAnswer.brief`. */
export const COACH_BRIEF_LINES = 14;
/** And how long one of them may be. A fact, not a paragraph. */
export const COACH_BRIEF_LINE_MAX = 160;

/**
 * Facts about the ATHLETE that only the conversation can produce.
 *
 * Deliberately three fields and no more. Everything else the coach might infer about her — that she
 * seems tired, that she prefers mornings — is an OPINION, and this object is written straight into
 * her profile, which is the app's record of fact. If a value is not something she said in so many
 * words, it does not belong here.
 */
export interface LearnedAboutHer {
  /** Her bodyweight, in kilograms, as she stated it. */
  weightKg?: number;
  /** How many times a week she trains. */
  daysPerWeek?: number;
  /** How long she has for one session, in minutes. */
  minutes?: number;
}

/**
 * The bounds a stated fact has to fall inside to be written down.
 *
 * Not a validation nicety: this object is persisted to her profile unread by anybody, so a wrong
 * number here is a wrong number in the app for ever, and the athlete never typed it. A value
 * outside these is dropped and the turn is otherwise unaffected — the sentence and the programme
 * are still perfectly good, and refusing the whole answer over a stray field would cost her a
 * workout to save a number.
 */
const LEARNED_BOUNDS = {
  weightKg: [25, 300],
  daysPerWeek: [1, 7],
  minutes: [10, 240],
} as const satisfies Record<keyof LearnedAboutHer, readonly [number, number]>;

/* ─────────────────────────────────────────────────────────────── The schema handed to the model */

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'ex'],
  properties: {
    kind: { type: 'string', enum: ['reps', 'time', 'distance', 'open'] },
    ex: { type: 'string' },
    say: { type: 'string' },
    reps: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
    load: { type: ['number', 'null'] },
    seconds: { type: 'integer' },
    metres: { type: 'integer' },
  },
} as const;

/**
 * The JSON Schema handed to whichever provider we run — Anthropic structured outputs, OpenAI
 * response_format and Gemini responseSchema all take this same object.
 *
 * Deliberately does NOT enumerate the catalogue ids: they are already in the prompt, listing them
 * again would double the schema's tokens on every call, and an unresolvable id is caught at parse
 * with a better message than a schema violation gives. `additionalProperties: false` throughout —
 * a model that invents a field is a model whose output we cannot reason about.
 *
 * The per-shape fields (`reps`, `seconds`, `metres`) are declared but not conditionally required:
 * JSON Schema can express "if kind is reps then reps is required" only through `allOf`/`if`, which
 * several providers' strict modes reject outright. The parse enforces it instead, and the parse is
 * the authority either way.
 */
export const COACH_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  // `say` is required and `sessions` is NOT. Every turn speaks; only some decide. Requiring
  // `sessions` forced a whole programme out of "why did my bench go down?" — see `CoachAnswer`.
  //
  // ⚠️ AND THERE IS NO `v` HERE, WHICH COST THE FIRST LIVE REPLY. It used to be required, declared
  // as a bare integer with no allowed value stated anywhere and never mentioned in the prompt — so
  // the model was being asked for a number it had no way to know, guessed, and every real answer
  // was rejected as `wrong_version`. The version is OUR contract number and we already know it,
  // because we are the ones who sent the schema. It is stamped at parse instead. A required field
  // the answerer cannot possibly get right is not a check; it is a trap.
  required: ['say'],
  properties: {
    say: { type: 'string' },
    /**
     * ════ WHICH OF ITS TWO MOVES THE COACH JUST MADE, SAID IN A FIELD RATHER THAN IN PROSE ════
     *
     * ⛔ FOUNDER, ON THE DEVICE, 2026-08-02: *"he says in the conversation 'here is your plan' and
     * in practice nothing is shown."*
     *
     * This is the third time the same failure has been fixed and the first time it has been fixed
     * where it happens. The preamble forbids it, the intake ask forbids it as a hard branch of
     * exactly two moves, and a model that has just written a paragraph describing a programme still
     * considers the turn complete and omits `sessions` — `finishReason: STOP`, not truncation.
     *
     * `useCoach` already re-asks with `COACH_DECISION_SCHEMA`, and the trigger was a GUESS: it fired
     * only when `learned.daysPerWeek` arrived on that same turn. Watched failing on a real
     * conversation — she gives her days on turn 2 and the coach announces the programme on turn 3,
     * so the one turn that needed the re-ask was the one turn that could not have it.
     *
     * Prose cannot be the signal, and neither can a heuristic about her answers. So the branch the
     * prompt already describes becomes a field: **the coach states which move it made**, and a claim
     * of "built" with nothing attached is caught structurally, on any turn, in any language.
     *
     * Not required — `chat` and the post-session call have no such branch, and requiring it there
     * would be a field the answerer has no reason to think about.
     */
    next: { type: 'string', enum: ['asking', 'built'] },
    /**
     * ════ WHAT HURTS, WHEN SHE HAS JUST TOLD YOU ════
     *
     * ⛔ The body map is gone (founder, 2026-08-02: *"take them off and put a chat window with the
     * AI in their place, where she can talk to it and update the injury"*). So nothing taps a
     * muscle any more — she says it in words, and the coach is the only thing that hears words.
     *
     * Reported rather than parsed, for the same reason `learned` is: a regex over "my shoulder is
     * killing me" in two languages is a second interpreter of the same sentence, and the one place
     * it would go wrong is the one place it matters.
     *
     * `muscle` must be one of the muscle names the catalogue uses, or the app cannot rest anything.
     */
    hurts: {
      type: 'object',
      additionalProperties: false,
      required: ['muscle', 'severity'],
      properties: {
        muscle: { type: 'string' },
        severity: { type: 'string', enum: ['twinge', 'pain', 'sharp'] },
      },
    },
    /*
     * ════ WHAT TO CHANGE ABOUT THE WORKOUT SHE IS IN RIGHT NOW ════
     *
     * ⛔ FOUNDER, 2026-08-02: *"During the workout you can just ask the coach for anything in the
     * chat window and it happens — skip an exercise, or anything else."*
     *
     * `sessions` is next week. This is today, mid-session, and the two must not be confused: a
     * programme rewrite cannot express "take the last two sets off this lift, I have to leave", and
     * a live edit cannot express "here is your next four weeks".
     *
     * ⚠️ SIX VERBS, AND THE NARROWNESS IS NOT A LEASH ON ITS JUDGEMENT. It writes into a machine
     * that is mid-execution, with logged sets behind it and a watch mirroring it — prose cannot be
     * applied to a state machine. The coach decides freely WHAT should change; this is the gauge of
     * the wire that carries it. Anything outside these six it says in `say`, and she does it, which
     * is exactly how pain has always worked.
     */
    today: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['do'],
        properties: {
          do: { type: 'string', enum: [...LIVE_EDIT_VERBS] },
          /** The exercise id it is about. Absent only on `end`, which is about the session. */
          ex: { type: 'string' },
          /**
           * `swap` only: the exercise id to put in its place.
           *
           * ⚠️ SEPARATE FROM `n` ON PURPOSE. One field holding either a word or a number would be
           * declared `["string","number","null"]`, and `geminiSchema` collapses a union to its
           * first non-null member — it would reach Google as a bare STRING and every numeric edit
           * would come back as `"3"` and be dropped by the parse, silently.
           */
          to: { type: 'string' },
          /** `sets`: how many rounds. `load`: the new weight, or null for bodyweight. */
          n: { type: ['number', 'null'] },
        },
      },
    },
    /*
     * The programme's own name and reason. Declared beside `sessions` because they describe the same
     * object — and `propertyOrdering` puts them BEFORE it, so the coach says what it is building
     * before it builds it rather than labelling it afterwards.
     */
    title: { type: 'string' },
    why: { type: 'string' },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'blocks'],
        properties: {
          name: { type: 'string' },
          day: { type: 'string', enum: WEEKDAYS },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['rounds', 'items'],
              properties: {
                rounds: { type: 'integer' },
                restS: { type: 'integer' },
                restAfterS: { type: 'integer' },
                items: { type: 'array', items: ITEM_SCHEMA },
              },
            },
          },
        },
      },
    },
    notes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['say'],
        properties: { ex: { type: 'string' }, say: { type: 'string' } },
      },
    },
    /**
     * What she stated about herself — see `LearnedAboutHer`. Optional, and absent on nearly every
     * turn: she says her weight once. `weightKg` is named in the unit the record keeps, because the
     * coach is the only layer that knows she said "135 pounds".
     */
    learned: {
      type: 'object',
      additionalProperties: false,
      properties: {
        weightKg: { type: 'number' },
        daysPerWeek: { type: 'integer' },
        minutes: { type: 'integer' },
      },
    },
    /**
     * The coach's own memory of her — see `CoachAnswer.brief`. Whole, and only when it changed.
     *
     * `maxItems` is the load-bearing part: it is the only bound the model is actually TOLD, because
     * it is the only one the Worker's translator forwards. Without it the first live call wrote the
     * same four facts until the output budget was gone.
     */
    brief: { type: 'array', items: { type: 'string' }, maxItems: COACH_BRIEF_LINES },
  },
} as const;

/**
 * ════ THE SAME SCHEMA, WITH THE PROGRAMME REQUIRED ════
 *
 * For the ONE call where words alone are not an answer: after a session.
 *
 * `COACH_PLAN_SCHEMA` makes `sessions` optional because most turns are a question answered. The
 * post-session call is not one of those — whatever it attaches IS what she trains next, and an
 * unchanged week still has to be sent, because nothing else says what she does.
 *
 * ⚠️ IT WAS ASKED FOR IN PROSE FIRST, AND PROSE LOST. The instruction said "sessions IS REQUIRED ON
 * THIS TURN" in capitals, and the first live post-session call answered *"I have increased your
 * bench press load to 32.5 kg"* with no `sessions` at all — a promise the app cannot keep, and one
 * she would have read as a change that never happened. Structured output is not a suggestion: with
 * `sessions` in `required`, omitting it is not a thing the model can do.
 *
 * Derived rather than copied, so a change to the plan's shape cannot leave this describing the old
 * one. `theProgrammeIsRequiredAfterASession` holds the seam.
 */
export const COACH_DECISION_SCHEMA = {
  ...COACH_PLAN_SCHEMA,
  required: ['say', 'sessions'],
} as const;

/* ────────────────────────────────────────────────────────────────────────────────── The parse */

/**
 * Why a response could not be read as a decision.
 *
 * An enum rather than free text so it can be COUNTED — per model, per week. That count is the only
 * honest way to compare a cheap model against an expensive one on our own data, and it is
 * measurement, not enforcement: a plan is never scored, only read or not read.
 */
export type UnreadableReason =
  | 'not_json'
  | 'not_an_object'
  /** Nothing was said. A programme with no sentence attached is not an answer we will show her. */
  | 'nothing_said'
  /** `sessions` was PRESENT and empty — the coach tried to decide and produced nothing. Absent is
   *  not this: absent means it only spoke, which is a legitimate turn. */
  | 'no_sessions'
  | 'session_malformed'
  | 'no_blocks'
  | 'block_malformed'
  | 'no_items'
  | 'item_malformed'
  | 'unknown_kind'
  | 'unknown_exercise'
  | 'not_a_number';

export type ParsedPlan =
  | { ok: true; answer: CoachAnswer; /** Loads the typist moved onto a real rung, for telemetry. */ snapped: number }
  | { ok: false; reason: UnreadableReason; at?: string };

const liftById = new Map<string, Exercise>(EXERCISES.map((e) => [e.id, e]));
const moveById = new Map<string, Movement>(MOVEMENTS.map((m) => [m.id, m]));

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === 'object' && !Array.isArray(v);

/**
 * What she stated about herself, or nothing.
 *
 * Every field is dropped independently: a plausible bodyweight beside an impossible day count is
 * one good fact and one bad one, and throwing the good one away would be a second mistake. An
 * object left with no fields is omitted entirely rather than sent on as `{}` — "she told me
 * nothing" and "she told me something I refused" must not look the same to the caller, which
 * writes what it is given straight into her profile.
 */
function readLearned(raw: unknown): { learned?: LearnedAboutHer } {
  if (!isObj(raw)) return {};
  const out: LearnedAboutHer = {};
  for (const key of ['weightKg', 'daysPerWeek', 'minutes'] as const) {
    const v = raw[key];
    const [lo, hi] = LEARNED_BOUNDS[key];
    if (!isNum(v) || v < lo || v > hi) continue;
    // A week has whole days in it and a session has whole minutes; only a bodyweight is fractional.
    out[key] = key === 'weightKg' ? v : Math.round(v);
  }
  return Object.keys(out).length > 0 ? { learned: out } : {};
}

/**
 * Read a response as a plan, or say why it could not be read.
 *
 * `facts` is optional and is used for one thing only: her performed rungs, so a lift's load snaps
 * within the ladder she has actually used (F-2) rather than a generic increment. Without it the
 * snap still works, it is just coarser.
 */
/**
 * ════ THE LIVE EDITS, VALIDATED ONE VERB AT A TIME ════
 *
 * ⚠️ EVERY EDIT IS CHECKED ON ITS OWN AND A BAD ONE IS DROPPED, not the whole list. The coach
 * asking for three changes and getting two wrong on the third is far better than her getting none
 * — and a list rejected wholesale is the failure that is invisible from her side, because `say`
 * still describes all three.
 *
 * An exercise id is NOT checked against the catalogue here: the session decides whether the lift is
 * in TODAY, which is a stronger question, and `reviseToday` already returns unchanged when it is
 * not. Two validators disagreeing about the same id is how an edit goes missing with nobody at
 * fault.
 */
function readToday(raw: unknown): { today?: LiveEdit[] } {
  if (!Array.isArray(raw)) return {};
  const out: LiveEdit[] = [];
  for (const e of raw) {
    if (!isObj(e) || typeof e.do !== 'string') continue;
    const ex = typeof e.ex === 'string' ? e.ex.trim() : '';
    switch (e.do) {
      case 'end':
        out.push({ do: 'end' });
        break;
      case 'drop':
      case 'defer':
        if (ex) out.push({ do: e.do, ex });
        break;
      case 'sets':
        // A count is an integer above zero. `sets: 0` is `drop` said badly, and honouring it as a
        // drop would be us deciding what it meant.
        if (ex && typeof e.n === 'number' && Number.isFinite(e.n) && e.n >= 1) {
          out.push({ do: 'sets', ex, n: Math.round(e.n) });
        }
        break;
      case 'load':
        // `null` is meaningful — it is bodyweight, and dropping it would leave a fabricated weight
        // on a lift the coach just took the load off.
        if (ex && (e.n === null || (typeof e.n === 'number' && Number.isFinite(e.n) && e.n >= 0))) {
          out.push({ do: 'load', ex, n: e.n as number | null });
        }
        break;
      case 'swap':
        if (ex && typeof e.to === 'string' && e.to.trim()) out.push({ do: 'swap', ex, to: e.to.trim() });
        break;
      default:
        break;
    }
  }
  return out.length > 0 ? { today: out } : {};
}

export function parseCoachPlan(raw: string | unknown, facts?: CoachFacts): ParsedPlan {
  let root: unknown = raw;
  if (typeof raw === 'string') {
    try {
      root = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'not_json' };
    }
  }
  if (!isObj(root)) return { ok: false, reason: 'not_an_object' };
  const say = typeof root.say === 'string' ? root.say.trim() : '';
  if (say.length === 0) return { ok: false, reason: 'nothing_said' };

  /*
   * Which move it says it made. Anything that is not one of the two words is nothing — an unknown
   * value is the model improvising, and improvisation here must not be able to trigger a second
   * paid call.
   */
  const next =
    root.next === 'asking' || root.next === 'built' ? { next: root.next as 'asking' | 'built' } : {};
  /*
   * A muscle we cannot resolve is not a rest window — it is a typo that would silently switch off
   * nothing at all. Checked against the catalogue's own names, so "shoulder" lands and "the bit
   * behind my knee" is left for the coach to ask about in words.
   */
  const hurtRaw = isObj(root.hurts) ? root.hurts : null;
  const hurts =
    hurtRaw &&
    typeof hurtRaw.muscle === 'string' &&
    MUSCLES.has(hurtRaw.muscle) &&
    (hurtRaw.severity === 'twinge' || hurtRaw.severity === 'pain' || hurtRaw.severity === 'sharp')
      ? { hurts: { muscle: hurtRaw.muscle, severity: hurtRaw.severity as 'twinge' | 'pain' | 'sharp' } }
      : {};
  const today = readToday(root.today);
  const learned = readLearned(root.learned);
  /*
   * Trimmed, capped, and dropped when empty. A brief of `""` would overwrite what the coach wrote
   * last week with nothing — the one way this field can lose information rather than carry it.
   */
  const lines = Array.isArray(root.brief)
    ? root.brief
        .filter((l): l is string => typeof l === 'string')
        .map((l) => l.trim().slice(0, COACH_BRIEF_LINE_MAX))
        .filter((l) => l.length > 0)
        .slice(0, COACH_BRIEF_LINES)
    : [];
  const brief = lines.length > 0 ? { brief: lines } : {};

  /*
   * ⛔ THE REASONS ARE READ BEFORE THE NO-PROGRAMME RETURN, AND THAT ORDERING IS THE FIX.
   *
   * ⚠️ FOUND BY TESTING THE FOUNDER'S OWN FOUNDATION STONES, 2026-08-02. He asked for a HOLD —
   * *"stay on the same weight for another two weeks"* — and the coach did it properly: it changed
   * nothing, which is correct, and it wrote the reason ("staying at 40 so you can consolidate ten
   * clean reps before we go up").
   *
   * **The app threw the sentence away.** `notes` was parsed a hundred lines below the early return
   * for a turn with no `sessions`, so a decision that changes nothing lost its explanation — and a
   * hold is precisely the decision she is least able to understand without one. His stone says
   * *"every decision the system makes must explain why"*, and this was the one decision type where
   * that structurally could not happen.
   *
   * Same shape as the brief above it, for the same reason: the turns that decide nothing are not
   * the turns that carry nothing.
   */
  const notes: NonNullable<CoachPlan['notes']> = [];
  if (Array.isArray(root.notes)) {
    for (const n of root.notes) {
      // A malformed NOTE loses a sentence, not a decision — never fail a plan over prose.
      if (!isObj(n)) continue;
      if (typeof n.say !== 'string' || n.say.length === 0) continue;
      notes.push({ ...(typeof n.ex === 'string' ? { ex: n.ex } : {}), say: n.say });
    }
  }
  const spokenNotes = notes.length > 0 ? { notes } : {};

  /*
   * NO `sessions` IS AN ANSWER, NOT A FAILURE — but an EMPTY `sessions` is a failure.
   *
   * Absent means the coach only spoke, which is most turns: a question answered, a clarification
   * asked during intake. Present-and-empty means it set out to decide and produced nothing, and
   * handing her a programme of zero sessions is worse than telling her the update is waiting.
   *
   * ⚠️ AND THIS IS THE PATH THE LEARNED FACTS ARRIVE ON. She says what she weighs several turns
   * before there is a programme to attach it to, so a `learned` read only alongside `sessions`
   * would miss almost every one of them.
   */
  if (root.sessions === undefined || root.sessions === null) {
    return { ok: true, answer: { say, plan: null, ...next, ...learned, ...brief, ...spokenNotes, ...hurts, ...today }, snapped: 0 };
  }
  if (!Array.isArray(root.sessions) || root.sessions.length === 0) {
    return { ok: false, reason: 'no_sessions' };
  }

  // Her real ladder per lift, so a snap lands on a rung she has actually used.
  const rungs = new Map<string, number[]>();
  for (const p of facts?.performed ?? []) rungs.set(p.ex, p.rungs);

  let snapped = 0;

  /** One item, or the reason it could not be read. Returns a discriminated result, never throws. */
  function readItem(raw: unknown): { ok: true; item: PlannedItem } | { ok: false; reason: UnreadableReason; at?: string } {
    if (!isObj(raw)) return { ok: false, reason: 'item_malformed' };
    if (typeof raw.ex !== 'string') return { ok: false, reason: 'item_malformed' };
    const lift = liftById.get(raw.ex);
    const move = moveById.get(raw.ex);
    // An id we cannot resolve is not something we can put in front of her, and we will not guess
    // which one was meant — a near-miss on an id is how an athlete gets handed the wrong movement.
    if (!lift && !move) return { ok: false, reason: 'unknown_exercise', at: raw.ex };

    const say = typeof raw.say === 'string' && raw.say.length > 0 ? { say: raw.say } : {};

    /** The typist. A LIFT lands on a rung; a movement's load is left as written (see the header). */
    const settle = (load: number | null | undefined): number | null | undefined => {
      if (load == null || !lift) return load;
      const onRung = normalizeLoad(load, lift.equipment, rungs.get(lift.id));
      if (onRung !== load) snapped += 1;
      return onRung;
    };

    switch (raw.kind) {
      case 'reps': {
        if (!Array.isArray(raw.reps) || raw.reps.length !== 2 || !raw.reps.every(isInt)) {
          return { ok: false, reason: 'not_a_number', at: raw.ex };
        }
        /*
         * ⚠️ AN ABSENT LOAD IS BODYWEIGHT, NOT A MALFORMED ONE. This read `!== null`, so a `load`
         * the coach simply left out — which the schema permits, and which is the natural thing to
         * write for a push-up or a dead bug — failed the check and **the entire programme was
         * thrown away**: one omitted optional field on one item of one block, and she gets no week.
         *
         * Found on the first live intake that produced a real plan (2026-08-02): three good
         * sessions rejected on `dead_bug`. Every other shape already asked `!= null` here; only reps
         * was strict, and only reps has a load that is meaningfully absent.
         */
        if (raw.load != null && !isNum(raw.load)) return { ok: false, reason: 'not_a_number', at: raw.ex };
        const [lo, hi] = raw.reps as number[];
        return { ok: true, item: { kind: 'reps', ex: raw.ex, reps: [lo, hi], load: settle(raw.load) ?? null, ...say } };
      }
      case 'time': {
        if (!isInt(raw.seconds)) return { ok: false, reason: 'not_a_number', at: raw.ex };
        if (raw.load != null && !isNum(raw.load)) return { ok: false, reason: 'not_a_number', at: raw.ex };
        const load = settle(raw.load as number | null | undefined);
        return { ok: true, item: { kind: 'time', ex: raw.ex, seconds: raw.seconds, ...(load != null ? { load } : {}), ...say } };
      }
      case 'distance': {
        if (!isInt(raw.metres)) return { ok: false, reason: 'not_a_number', at: raw.ex };
        if (raw.load != null && !isNum(raw.load)) return { ok: false, reason: 'not_a_number', at: raw.ex };
        const load = settle(raw.load as number | null | undefined);
        return { ok: true, item: { kind: 'distance', ex: raw.ex, metres: raw.metres, ...(load != null ? { load } : {}), ...say } };
      }
      case 'open':
        return { ok: true, item: { kind: 'open', ex: raw.ex, ...say } };
      default:
        return { ok: false, reason: 'unknown_kind', at: String(raw.kind ?? '') };
    }
  }

  const sessions: PlannedSession[] = [];
  for (const s of root.sessions) {
    if (!isObj(s)) return { ok: false, reason: 'session_malformed' };
    if (typeof s.name !== 'string' || s.name.length === 0) return { ok: false, reason: 'session_malformed' };
    if (s.day != null && !WEEKDAYS.includes(s.day as string)) {
      return { ok: false, reason: 'session_malformed', at: s.name };
    }
    if (!Array.isArray(s.blocks) || s.blocks.length === 0) {
      return { ok: false, reason: 'no_blocks', at: s.name };
    }

    const blocks: PlannedBlock[] = [];
    for (const b of s.blocks) {
      if (!isObj(b)) return { ok: false, reason: 'block_malformed', at: s.name };
      if (!isInt(b.rounds) || b.rounds < 1) return { ok: false, reason: 'not_a_number', at: s.name };
      if (b.restS != null && !isInt(b.restS)) return { ok: false, reason: 'not_a_number', at: s.name };
      if (b.restAfterS != null && !isInt(b.restAfterS)) return { ok: false, reason: 'not_a_number', at: s.name };
      if (!Array.isArray(b.items) || b.items.length === 0) {
        return { ok: false, reason: 'no_items', at: s.name };
      }
      const items: PlannedItem[] = [];
      for (const raw of b.items) {
        const read = readItem(raw);
        if (!read.ok) return read;
        items.push(read.item);
      }
      blocks.push({
        rounds: b.rounds,
        ...(b.restS != null ? { restS: b.restS } : {}),
        ...(b.restAfterS != null ? { restAfterS: b.restAfterS } : {}),
        items,
      });
    }
    sessions.push({ name: s.name, ...(s.day ? { day: s.day as Weekday } : {}), blocks });
  }

  /*
   * ════ AND THE PROGRAMME ITSELF STATES HOW MANY DAYS A WEEK SHE TRAINS ════
   *
   * `sessions.length` is not a guess about her — it is the coach's own decision, and the prompt's
   * bound reads *"'daysPerWeek' is how many times a week she trains. Write exactly that many
   * sessions."* So a four-session week IS four days, whether or not the coach thought to say so in
   * `learned`.
   *
   * It fills the field rather than overriding it: a stated number is her sentence, and this is an
   * inference from it. They should agree — and when they do not, what she trains next week is the
   * programme in front of her, so the programme wins the tie by being the thing that actually
   * happens. (`0` cannot occur: an empty `sessions` was refused above.)
   */
  const days = learned.learned?.daysPerWeek ?? (sessions.length <= 7 ? sessions.length : undefined);

  return {
    ok: true,
    answer: {
      say,
      ...next,
      ...hurts,
      ...today,
      /*
       * ⛔ THE NAME TRAVELS WITH THE PROGRAMME (founder 2026-08-04). Trimmed and dropped when empty,
       * because a title of "" is worse than no title: every surface would draw a blank heading where
       * it used to draw a sensible fallback.
       */
      plan: {
        v: COACH_PLAN_VERSION,
        ...(typeof root.title === 'string' && root.title.trim() ? { title: root.title.trim() } : {}),
        ...(typeof root.why === 'string' && root.why.trim() ? { why: root.why.trim() } : {}),
        sessions,
        ...(notes.length ? { notes } : {}),
      },
      ...(days != null ? { learned: { ...learned.learned, daysPerWeek: days } } : learned),
      ...brief,
    },
    snapped,
  };
}
