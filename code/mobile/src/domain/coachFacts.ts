/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * COACH FACTS — everything the coach needs, and nothing it must not have.
 *
 * The founder's own description of the product, and the whole specification of this file:
 *
 *   > *"It is exactly as if I went and did a workout, sent you all the workout's data, and said:
 *   > now decide what we do from here. That's it."*
 *
 * So this builds that message. It is the message. There is one decider — the coach — and this
 * hands it the record. Nothing here interprets, scores, ranks or recommends; the moment this file
 * forms an opinion there are two opinions, which is the one thing the architecture forbids.
 *
 * ── WHAT THE ENGINE STILL OWNS ──────────────────────────────────────────────────────────────────
 * The workout itself, and only while it is happening: Loop 1's in-set correction, the timer, the
 * haptics, the Live Activity, and **the record**. Every conclusion — next session's loads, sets,
 * bands, rest, the exercises, the programme's shape — is the coach's. The engine does not get a
 * second opinion about any of it, and this file gives it no way to express one.
 *
 * ── WHY THE SHEET CARRIES MORE THAN THE SESSION ─────────────────────────────────────────────────
 * The founder's example is the reason `performed` exists:
 *
 *   > *"If I just did a bench press and you know from the data that I press 30 kg, and I ask to
 *   > move to the machine — you'll know what weight I need on the machine, right?"*
 *
 * The engine cannot do that and never could: it moves a number on ONE exercise and has no mapping
 * between one piece of equipment and another. A coach can — but only if the sheet carries the
 * MUSCLE, CAPABILITY, PATTERN and EQUIPMENT beside every load she has actually lifted. That is why
 * `performed` is shaped the way it is: it is not history for its own sake, it is the substrate for
 * pricing a lift she has never done out of lifts she has.
 *
 * ── WHY IT CARRIES THE EQUIPMENT'S GRAIN ────────────────────────────────────────────────────────
 * Deciding "32 kg" for a machine whose pins move in 5s is not a decision anyone has to correct — it
 * is a decision made without looking. So the sheet states the grain (`equipment`), and the coach
 * lands on a rung itself, the same way it would if a person asked it. The plate maths on the screen
 * is a typist, not an editor.
 *
 * ── THE ALLOW-LIST ──────────────────────────────────────────────────────────────────────────────
 * Every field is written out by hand. `domain/planShare` is the precedent and the reason: a sheet
 * built by spreading a stored object ships whatever a future migration happens to add to that
 * object — a name, an email, a health identifier — to a third party, silently and for ever. Adding
 * a field here is a deliberate act. `noSheetLeaksWhatItWasNotGiven` fails the build if this file
 * ever spreads a source object instead of naming its fields.
 *
 * Pure and I/O-free: it is handed state, it returns an object. It does not read the database, does
 * not touch the network, and knows nothing about any model or provider.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { EffortReport, Profile, Session, SetLog, Program } from '@/data/local/models';
import { EXERCISES, type Exercise } from '@/data/exercises';
import { MOVEMENTS } from '@/data/movements';
import { STARTING_INCREMENT, BAR_KG } from '@/engine/v5/constants';

/** Bumped when the shape changes, so a stored or in-flight sheet is never read as the wrong shape. */
export const COACH_FACTS_VERSION = 1;

/** One set, as it was actually performed. `w` null = bodyweight. */
export interface FactSet {
  /** The load she lifted. */
  w: number | null;
  /** The reps she got. */
  r: number;
  /** Seconds rested immediately BEFORE this set (L3) — a rep count means nothing without it. */
  rest?: number;
  /** She corrected this set by hand rather than taking what was proposed. */
  edited?: boolean;
}

/** One lift inside the session that just happened. */
export interface FactLift {
  ex: string;
  name: string;
  muscle: string;
  capability: string;
  pattern: string;
  equipment: string;
  tier: string;
  /** What she was asked for, so the coach can see the gap between the ask and the result. */
  askedLoad: number | null;
  askedReps: number;
  askedSets: number;
  sets: FactSet[];
  /**
   * How hard she said it was — `EffortLevel`, in her own answer.
   *
   * ABSENT means she was not asked or did not answer, and absent must stay absent: filling it in
   * from the reps would be the coach reading its own inference back as her testimony. Unknown is an
   * honest value; a manufactured one is not.
   */
  effort?: string;
}

/** What she has ever actually lifted on one exercise — the substrate for pricing a new one. */
export interface FactPerformed {
  ex: string;
  muscle: string;
  capability: string;
  pattern: string;
  equipment: string;
  tier: string;
  /** Every distinct load she has performed, ascending — her real rung ladder on this lift (F-2). */
  rungs: number[];
  /** The most recent load, and the reps she got on it. */
  lastLoad: number | null;
  lastReps: number[];
  /** How many separate occurrences of this lift are in the record. */
  occurrences: number;
}

/** The grain of each equipment class — so a decision lands on a weight that exists. */
export interface FactEquipment {
  /** The smallest step this equipment can move (kg). 0 = bodyweight, no load axis. */
  step: number;
  /** The lightest thing that physically exists — the empty bar, or nothing. */
  floor: number;
}

/** A lift the coach may choose, with only the fields choosing needs. */
export interface FactCatalogueEntry {
  id: string;
  name: string;
  muscle: string;
  capability: string;
  pattern: string;
  equipment: string;
  tier: string;
  /** Bodyweight movement — there is no load to write. */
  bw?: true;
}

/** A non-lift the coach may prescribe, with the shapes that usually suit it. */
export interface FactMovement {
  id: string;
  name: string;
  measures: string[];
  /** She can be holding weight while doing it. */
  loadable?: true;
  /** Outdoors and GPS-tracked — distance and pace come from the phone, not from her report. */
  gps?: true;
}

/** The programme as it stands right now, before the coach changes anything. */
export interface FactProgrammeDay {
  name: string;
  lifts: { ex: string; sets: number }[];
}

export interface CoachFacts {
  v: number;
  athlete: {
    sex?: 'male' | 'female';
    weightKg?: number;
    daysPerWeek: number;
    units: string;
    /** Minutes she says she has for a workout. */
    minutes: number;
    /** Her declared rep band, and any per-muscle override she set in the body map. */
    band?: string;
    bandByMuscle?: Record<string, string>;
    /** The map she drew — which muscles she wants more or less of. Her instruction, not a reading. */
    emphasis?: Record<string, string>;
    /** Muscles resting because she reported they hurt, with the day each comes back (ms). */
    resting?: { muscle: string; severity: string; untilMs: number }[];
  };
  /** The workout that just happened. Absent when the sheet is built for any other reason. */
  session?: {
    at: string;
    day?: string;
    /** Wall-clock minutes from first set to last — what the workout actually cost her. */
    minutes: number | null;
    /** Did it count as trained (>= half the prescribed sets), or was it partial? */
    trained: boolean;
    endedEarly: boolean;
    lifts: FactLift[];
  };
  performed: FactPerformed[];
  equipment: Record<string, FactEquipment>;
  catalogue: FactCatalogueEntry[];
  /**
   * The things that are not lifts — a run, a plank, a carry, a skipping rope.
   *
   * Kept beside the catalogue rather than inside it for the reason `data/movements` gives: a run
   * has no capability class and no muscle worth naming, and dressing it as a lift would let the
   * swap pool offer it as a substitute for a squat. Two lists, both honest, one prompt.
   */
  movements: FactMovement[];
  programme: FactProgrammeDay[];
}

const byId = new Map<string, Exercise>(EXERCISES.map((e) => [e.id, e]));

/**
 * Copy a stored muscle-keyed map key by key, keeping only string values.
 *
 * `{ ...profile.bodyMap }` would have done the same thing today and been wrong tomorrow: it forwards
 * whatever the stored map has come to hold, including a shape a later migration puts there. The
 * sheet never forwards; it copies what it recognises. See `theSheetNamesEveryFieldItSends`.
 */
function stringMap(src: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(src)) {
    const value = src[key];
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** Ascending, de-duped, positive. Her real ladder on a lift. */
function ladder(loads: (number | null)[]): number[] {
  const set = new Set<number>();
  for (const l of loads) if (l != null && l > 0) set.add(l);
  return [...set].sort((a, b) => a - b);
}

/**
 * Wall-clock minutes the session cost, from the first set persisted to the last.
 *
 * NOT a per-set constant. The founder's own QA found the engine's minute budget was fiction
 * precisely because it was computed from an assumed cost per set while the real number was sitting
 * in the record. A coach asked to fit a workout into her minutes needs the number she actually
 * lived, not the one someone modelled.
 */
function sessionMinutes(s: Session): number | null {
  const stamps = s.sets.map((x) => Date.parse(x.persistedAt)).filter((n) => Number.isFinite(n));
  if (stamps.length < 2) return null;
  const span = Math.max(...stamps) - Math.min(...stamps);
  return Math.round(span / 60000);
}

function liftOf(exerciseId: string, sets: SetLog[], effort?: EffortReport[]): FactLift | null {
  const ex = byId.get(exerciseId);
  if (!ex) return null; // a lift no longer in the catalogue: it cannot be reasoned about, so it is
  //                       not stated. Never invent a name for an id we cannot resolve.
  const ordered = [...sets].sort((a, b) => a.setIndex - b.setIndex);
  const first = ordered[0];
  return {
    ex: ex.id,
    name: ex.name,
    muscle: ex.muscle,
    capability: ex.capability,
    pattern: ex.pattern,
    equipment: ex.equipment,
    tier: ex.tier,
    askedLoad: first?.recommendedWeight ?? null,
    askedReps: first?.recommendedReps ?? 0,
    askedSets: ordered.length,
    ...(effort?.find((e) => e.exerciseId === exerciseId)
      ? { effort: effort.find((e) => e.exerciseId === exerciseId)!.level }
      : {}),
    sets: ordered.map((x) => ({
      w: x.actualWeight,
      r: x.actualReps,
      ...(x.restBeforeS != null ? { rest: x.restBeforeS } : {}),
      ...(x.edited ? { edited: true as const } : {}),
    })),
  };
}

/** The lifts of one session, in the order she met them. */
function liftsOf(s: Session): FactLift[] {
  const order: string[] = [];
  const grouped = new Map<string, SetLog[]>();
  for (const set of s.sets) {
    if (set.isApproach) continue; // legacy Build #33 measurement sets — never part of the record
    if (!grouped.has(set.exerciseId)) {
      grouped.set(set.exerciseId, []);
      order.push(set.exerciseId);
    }
    grouped.get(set.exerciseId)!.push(set);
  }
  const out: FactLift[] = [];
  for (const id of order) {
    const lift = liftOf(id, grouped.get(id)!, s.effort);
    if (lift) out.push(lift);
  }
  return out;
}

/**
 * What she has performed on every lift she has ever touched, newest occurrence last.
 *
 * `history` is expected newest-first (the order `db.loadSessions` returns). Both `rungs` and
 * `lastLoad` are read from it, so an unsorted list would report the wrong "last" — hence the
 * explicit sort rather than trusting the caller.
 */
function performedFrom(history: Session[]): FactPerformed[] {
  const oldestFirst = [...history].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const acc = new Map<string, { loads: (number | null)[]; lastLoad: number | null; lastReps: number[]; occ: number }>();
  for (const s of oldestFirst) {
    const seenThisSession = new Set<string>();
    for (const set of s.sets) {
      if (set.isApproach) continue;
      if (!byId.has(set.exerciseId)) continue;
      let e = acc.get(set.exerciseId);
      if (!e) { e = { loads: [], lastLoad: null, lastReps: [], occ: 0 }; acc.set(set.exerciseId, e); }
      if (!seenThisSession.has(set.exerciseId)) {
        seenThisSession.add(set.exerciseId);
        e.occ += 1;
        e.lastReps = []; // a fresh occurrence replaces the previous one's reps
      }
      e.loads.push(set.actualWeight);
      e.lastLoad = set.actualWeight;
      e.lastReps.push(set.actualReps);
    }
  }
  const out: FactPerformed[] = [];
  for (const [id, e] of acc) {
    const ex = byId.get(id)!;
    out.push({
      ex: id,
      muscle: ex.muscle,
      capability: ex.capability,
      pattern: ex.pattern,
      equipment: ex.equipment,
      tier: ex.tier,
      rungs: ladder(e.loads),
      lastLoad: e.lastLoad,
      lastReps: e.lastReps,
      occurrences: e.occ,
    });
  }
  return out;
}

/**
 * The lean catalogue — the fields choosing a lift needs, and no others.
 *
 * MEASURED: the full records are 5,699 tokens; this is 1,677. Cues, video ids, display metadata and
 * the cold-start constants are not inputs to a choice, and they are the majority of the bytes. The
 * catalogue is identical for every athlete, so it is also the part worth putting FIRST in the prompt
 * and caching — it is read on every call and never varies.
 */
export function coachCatalogue(): FactCatalogueEntry[] {
  return EXERCISES.map((e) => ({
    id: e.id,
    name: e.name,
    muscle: e.muscle,
    capability: e.capability,
    pattern: e.pattern,
    equipment: e.equipment,
    tier: e.tier,
    ...(e.bodyweight ? { bw: true as const } : {}),
  }));
}

/** Everything that is not a lift, in the same lean form as the catalogue. Also cacheable. */
export function coachMovements(): FactMovement[] {
  return MOVEMENTS.map((m) => ({
    id: m.id,
    name: m.name,
    measures: [...m.measures],
    ...(m.loadable ? { loadable: true as const } : {}),
    ...(m.gps ? { gps: true as const } : {}),
  }));
}

/** The grain of every equipment class, from the engine's own constants — never a second copy. */
export function coachEquipment(): Record<string, FactEquipment> {
  const out: Record<string, FactEquipment> = {};
  for (const [equipment, step] of Object.entries(STARTING_INCREMENT)) {
    out[equipment] = { step, floor: equipment === 'barbell' ? BAR_KG : 0 };
  }
  return out;
}

export interface CoachFactsInput {
  profile: Profile;
  program: Program | null;
  /** Every session in the record, newest first. */
  history: Session[];
  /** The one that just ended, when this sheet is being built because a workout finished. */
  justFinished?: Session;
}

/**
 * Build the sheet.
 *
 * Handed state, returns an object. Every field is named explicitly — see the allow-list note in the
 * file header for why that is not a style choice.
 */
export function coachFacts({ profile, program, history, justFinished }: CoachFactsInput): CoachFacts {
  const finished = justFinished;
  return {
    v: COACH_FACTS_VERSION,
    athlete: {
      ...(profile.sex ? { sex: profile.sex } : {}),
      ...(profile.weightKg != null ? { weightKg: profile.weightKg } : {}),
      daysPerWeek: profile.daysPerWeek,
      units: profile.units,
      minutes: profile.workoutMinutes ?? 60,
      ...(profile.repBand ? { band: profile.repBand } : {}),
      ...(profile.repBandByMuscle ? { bandByMuscle: stringMap(profile.repBandByMuscle) } : {}),
      ...(profile.bodyMap ? { emphasis: stringMap(profile.bodyMap) } : {}),
      ...(profile.painEases?.length
        ? {
            resting: profile.painEases.map((p) => ({
              muscle: p.muscle,
              severity: p.severity,
              untilMs: p.untilMs,
            })),
          }
        : {}),
    },
    ...(finished
      ? {
          session: {
            at: finished.startedAt,
            ...(finished.programDayName ? { day: finished.programDayName } : {}),
            minutes: sessionMinutes(finished),
            trained: finished.trained !== false,
            endedEarly: finished.earlyFinish,
            lifts: liftsOf(finished),
          },
        }
      : {}),
    performed: performedFrom(history),
    equipment: coachEquipment(),
    catalogue: coachCatalogue(),
    movements: coachMovements(),
    programme: (program?.days ?? [])
      .filter((d) => !d.isRest)
      .map((d) => ({
        name: d.name,
        lifts: d.slots.map((s) => ({ ex: s.exerciseId, sets: s.setCount })),
      })),
  };
}
