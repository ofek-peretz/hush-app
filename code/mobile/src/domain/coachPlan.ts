/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * COACH PLAN — what the coach writes back, and the parse that turns it into something the app runs.
 *
 * `coachFacts` is the message out. This is the message in. Between them there is one decider, and it
 * is not this file: **nothing here forms an opinion about whether a decision is a good one.** A plan
 * that says "drop her to two sets" is executed. A plan that says "raise the bench 5 kg" is executed.
 * The engine has no veto and this file gives it none.
 *
 * What this file does is narrower and duller, and it is the founder's own point:
 *
 *   > *"It's exactly as if I did a workout, sent you all the data, and said — now decide."*
 *
 * When a person answers that, the answer arrives as sentences and somebody still has to write it on
 * the programme. That is this file. It reads the answer, and if the answer never arrived — the
 * connection dropped, the JSON stopped mid-object, a field came back as a word where a number
 * belongs — it says so, and nothing is written. **That is not a rejection of a decision. It is the
 * detection that no decision was received**, and it lands on the rule that already exists: no
 * connection → nothing is decided, the app says so, the update waits.
 *
 * ── THE SCHEMA IS THE POINT ─────────────────────────────────────────────────────────────────────
 * The founder's load-bearing insight about cost:
 *
 *   > *"If we make sure the architecture is completely precise, it will do this very well too."*
 *
 * A tight schema makes the model do LESS work. It is not inventing a structure, it is filling named
 * fields. That is what lets a small, cheap model succeed at this, and it is why `COACH_PLAN_SCHEMA`
 * is a real JSON Schema rather than a description in prose — every provider we might use takes one
 * (Anthropic's structured outputs, OpenAI's response_format, Gemini's responseSchema), so the same
 * object constrains whichever model we run.
 *
 * ── THE ONE THING THAT IS NOT A DECISION ────────────────────────────────────────────────────────
 * Loads pass through `normalizeLoad`, the same function every load in this app passes through. The
 * coach is TOLD each equipment's grain in the sheet, so a well-behaved plan already sits on a real
 * rung and this changes nothing at all — it is a typist, not an editor. It exists for the case where
 * a number arrives at 32.4 kg on a machine whose pins move in 5s: writing 32.4 on her screen is not
 * respecting the decision, it is printing a weight that does not exist.
 *
 * Pure and I/O-free. Knows nothing about any model, provider or transport.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { EXERCISES, type Exercise } from '@/data/exercises';
import { normalizeLoad } from '@/engine/loadMath';
import type { CoachFacts } from './coachFacts';

/** Bumped when the shape changes, so a plan written against an older shape is never misread. */
export const COACH_PLAN_VERSION = 1;

/** One lift on the programme, as the coach set it. */
export interface PlannedLift {
  /** A catalogue id. An id that does not resolve makes the plan unreadable, not merely wrong. */
  ex: string;
  sets: number;
  /** The rep band, [floor, ceiling] — what Loop 1 reads inside the session. */
  band: [number, number];
  /** The load to open at. `null` = bodyweight, which is the only case with no number. */
  load: number | null;
  /** Prescribed rest between sets, in seconds. */
  restS: number;
}

export interface PlannedDay {
  name: string;
  lifts: PlannedLift[];
}

export interface CoachPlan {
  v: number;
  /** The programme in full, not a patch. A patch has to be merged, and a merge is a second opinion
   *  about what the coach meant. Stating it whole costs a few hundred output tokens and removes the
   *  entire class of question. */
  days: PlannedDay[];
  /**
   * What the coach says to the athlete about what it did, tied to the lift it is about.
   *
   * Ruling A.1 binds the CONTENT — every number cited comes from the sheet, the coach never invents
   * a figure — but that is a property of the prompt and of what she can tap through to, not
   * something a parser can check. Nothing here inspects the words.
   */
  notes?: { ex?: string; say: string }[];
}

/**
 * The JSON Schema handed to whichever provider we run.
 *
 * Deliberately does NOT enumerate the 68 catalogue ids: they are already in the prompt, listing them
 * again would double the schema's tokens on every call, and an unresolvable id is caught at parse
 * with a better message than a schema violation gives. `additionalProperties: false` throughout —
 * a model that invents a field is a model whose output we cannot reason about.
 */
export const COACH_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['v', 'days'],
  properties: {
    v: { type: 'integer' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'lifts'],
        properties: {
          name: { type: 'string' },
          lifts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['ex', 'sets', 'band', 'load', 'restS'],
              properties: {
                ex: { type: 'string' },
                sets: { type: 'integer' },
                band: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
                load: { type: ['number', 'null'] },
                restS: { type: 'integer' },
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
  },
} as const;

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
  | 'wrong_version'
  | 'no_days'
  | 'day_malformed'
  | 'no_lifts'
  | 'lift_malformed'
  | 'unknown_exercise'
  | 'not_a_number';

export type ParsedPlan =
  | { ok: true; plan: CoachPlan; /** Loads the typist moved onto a real rung, for telemetry. */ snapped: number }
  | { ok: false; reason: UnreadableReason; at?: string };

const byId = new Map<string, Exercise>(EXERCISES.map((e) => [e.id, e]));

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isFiniteNumber(v) && Number.isInteger(v);

/**
 * Read a response as a plan, or say why it could not be read.
 *
 * `facts` is optional and is used for one thing only: her performed rungs, so `normalizeLoad` snaps
 * within the ladder she has actually used (F-2) rather than a generic increment. Without it the
 * snap still works, it is just coarser.
 */
export function parseCoachPlan(raw: string | unknown, facts?: CoachFacts): ParsedPlan {
  let root: unknown = raw;
  if (typeof raw === 'string') {
    try {
      root = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'not_json' };
    }
  }
  if (root == null || typeof root !== 'object' || Array.isArray(root)) {
    return { ok: false, reason: 'not_an_object' };
  }
  const obj = root as Record<string, unknown>;
  if (obj.v !== COACH_PLAN_VERSION) return { ok: false, reason: 'wrong_version' };
  if (!Array.isArray(obj.days) || obj.days.length === 0) return { ok: false, reason: 'no_days' };

  // Her real ladder per lift, so a snap lands on a rung she has actually used.
  const rungs = new Map<string, number[]>();
  for (const p of facts?.performed ?? []) rungs.set(p.ex, p.rungs);

  let snapped = 0;
  const days: PlannedDay[] = [];
  for (const d of obj.days) {
    if (d == null || typeof d !== 'object' || Array.isArray(d)) return { ok: false, reason: 'day_malformed' };
    const day = d as Record<string, unknown>;
    if (typeof day.name !== 'string' || day.name.length === 0) return { ok: false, reason: 'day_malformed' };
    if (!Array.isArray(day.lifts) || day.lifts.length === 0) {
      return { ok: false, reason: 'no_lifts', at: day.name };
    }
    const lifts: PlannedLift[] = [];
    for (const l of day.lifts) {
      if (l == null || typeof l !== 'object' || Array.isArray(l)) {
        return { ok: false, reason: 'lift_malformed', at: day.name };
      }
      const lift = l as Record<string, unknown>;
      if (typeof lift.ex !== 'string') return { ok: false, reason: 'lift_malformed', at: day.name };
      const ex = byId.get(lift.ex);
      // An id we cannot resolve is not a lift we can put in front of her, and we will not guess
      // which one was meant — a near-miss on an id is how an athlete gets handed the wrong movement.
      if (!ex) return { ok: false, reason: 'unknown_exercise', at: lift.ex };
      if (!isInt(lift.sets) || !isInt(lift.restS)) return { ok: false, reason: 'not_a_number', at: lift.ex };
      if (!Array.isArray(lift.band) || lift.band.length !== 2 || !lift.band.every(isInt)) {
        return { ok: false, reason: 'not_a_number', at: lift.ex };
      }
      const [lo, hi] = lift.band as number[];
      if (lift.load !== null && !isFiniteNumber(lift.load)) {
        return { ok: false, reason: 'not_a_number', at: lift.ex };
      }

      let load: number | null = lift.load as number | null;
      if (load != null) {
        // THE TYPIST. Identical in and out whenever the coach used the grain it was given.
        const onRung = normalizeLoad(load, ex.equipment, rungs.get(ex.id));
        if (onRung !== load) snapped += 1;
        load = onRung;
      }
      lifts.push({ ex: ex.id, sets: lift.sets, band: [lo, hi], load, restS: lift.restS });
    }
    days.push({ name: day.name, lifts });
  }

  const notes: CoachPlan['notes'] = [];
  if (Array.isArray(obj.notes)) {
    for (const n of obj.notes) {
      if (n == null || typeof n !== 'object') continue; // a malformed NOTE loses a sentence, not a
      //                                                   decision — never fail a plan over prose
      const note = n as Record<string, unknown>;
      if (typeof note.say !== 'string' || note.say.length === 0) continue;
      notes.push({ ...(typeof note.ex === 'string' ? { ex: note.ex } : {}), say: note.say });
    }
  }

  return {
    ok: true,
    plan: { v: COACH_PLAN_VERSION, days, ...(notes.length ? { notes } : {}) },
    snapped,
  };
}
