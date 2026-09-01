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

// 

import type { ItemResult, Profile, Session, SetLog, Program, CardioActivity } from '@/data/local/models';
import type { ExternalWorkout } from '@/platform/health/healthModel';
import { EXERCISES, type Exercise } from '@/data/exercises';
import { MOVEMENTS } from '@/data/movements';
import { recentDecisions, type CoachDecision } from './coachLog';
import type { CoachPlan } from './coachPlan';
import { STARTING_INCREMENT } from '@/engine/v5/constants';
import { emptyBarKg } from '@/engine/loadMath';
// The one filter that decides whether an ease is still standing — shared with every other consumer.
import { activeEases } from './painReport';

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
}

/**
 * One thing she did, in whatever shape it was — the shape-agnostic half of the session.
 *
 * `lifts` below describes reps-at-a-load and cannot describe a plank or a 400 m repeat. Rather than
 * teach it four shapes, the sheet states the work TWICE from one source: `lifts` for the rep work
 * (which the coach reasons about with bands and rungs), and `work` for everything, in the coach's
 * own vocabulary. A session with no rep work has an empty `lifts` and a full `work`, and a marathon
 * week is finally describable back to the coach that wrote it.
 */
export interface FactWork {
  kind: string;
  ex: string;
  name: string;
  block: number;
  round: number;
  position: number;
  /** Whatever this shape measures — reps, seconds, metres. Absent on `open`. */
  did?: number;
  /** What was asked for, when the shape has an ask. The gap is the signal. */
  asked?: number;
  load?: number | null;
  restBeforeS?: number;
  /** How long it took, when anything measured it (a timed distance). */
  seconds?: number;
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
  /**
   * ════ THE LAST FEW TIMES SHE DID THIS LIFT — newest first ════
   *
   * ⚠️ WITHOUT THIS THE COACH WAS DECIDING WITH LESS THAN THE ENGINE HAD (founder, 2026-08-02:
   * *"the most important thing is that the AI is genuinely good, and that it is never in a position
   * where it is dumber than the engine we had"*).
   *
   * The sheet used to carry the ladder, the last load and the last reps. Measured on a real
   * twelve-week history, a bench stuck at 40 kg for four straight sessions — with her reps having
   * fallen from 9 to 6 the moment she got there — reached the coach as:
   *
   *     rungs: [30, 32.5, 35, 37.5, 40], lastLoad: 40, lastReps: [6, 6, 6], occurrences: 8
   *
   * which reads as a lift that has just moved up and needs a beat to settle. **A stall was
   * invisible, and a stall is the single most common thing a coach has to notice.** So was an
   * absence: nothing in the sheet said WHEN any of it happened, so a lift last trained in March and
   * one trained on Tuesday looked identical.
   *
   * The engine answered both mechanically (S-32b, the absence path). Anything the engine could see
   * and the coach cannot is a place where this product got worse when the decision moved.
   *
   * `ago` is DAYS ago, which is the unit the question is actually asked in — "when did she last
   * squat" and "how long has this been stuck" are the same field.
   */
  recent: FactOccurrence[];
  /** How many separate occurrences of this lift are in the record. */
  occurrences: number;
}

/** One time she did a lift: how long ago, at what, for how many, and how it felt. */
export interface FactOccurrence {
  /** Days before now. 0 is today. */
  ago: number;
  /** What she actually lifted. null = bodyweight. */
  load: number | null;
  /** The reps of each set, in order. */
  reps: number[];
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
  /** How the phone measures it, if it does at all — see `coachMovements`. */
  tracked?: 'gps' | 'motion';
}

/**
 * The programme as it stands right now — WHAT THE COACH ITSELF WROTE LAST TIME.
 *
 * ⚠️ This used to be the ENGINE's `Program`, and for a coach-led athlete that is empty. So the
 * coach was revising blind: asked after every session to decide what happens next, without being
 * shown the week it had prescribed. It could see what she DID and why it had decided things, but
 * not what it had actually asked for.
 *
 * It carries all four shapes, because the programme does. A `lifts` list would have described a
 * marathon week as three squat sessions and nothing else.
 */
export interface FactProgrammeDay {
  name: string;
  /** Present only where the programme fixes a day (a long run belongs on Sunday). */
  day?: string;
  /**
   * Each item as the coach wrote it, with how many rounds its block runs.
   *
   * `block` is present ONLY on items sharing a block with another — the circuit/superset seam, which
   * the flattening would otherwise destroy. Two items carrying the same `block` are alternated round
   * after round, with no pause between them. Absent means the item is a block of its own.
   */
  items: { ex: string; kind: string; rounds: number; block?: number; reps?: [number, number]; load?: number | null; seconds?: number; metres?: number }[];
}

export interface CoachFacts {
  v: number;
  athlete: {
    sex?: 'male' | 'female';
    weightKg?: number;
    /** Her age, in years. Context for recovery — never a number a formula is applied to. */
    age?: number;
    /** How long she has trained. The largest input to a STARTING load, which is the only one
     *  the coach has no measurement for. */
    experience?: 'beginner' | 'intermediate' | 'advanced';
    /** What she said she is training for, in her words. The programme is answerable to it. */
    trainingFor?: string;
    /** What hurts or is refused, in her words. */
    limits?: string;
    /** Absent until she has said. Never defaulted — see the omission in `coachFacts`. */
    daysPerWeek?: number;
    units: string;
    /**
     * THE LANGUAGE SHE READS THE APP IN — a BCP-47 tag, and everything the coach writes must be in
     * it: the sentence she reads, the note on an item, and the NAME of every session.
     *
     * ⚠️ It lives on her SHEET and not in the preamble, and that is not tidiness. The preamble is
     * byte-identical for every athlete on earth and that is what makes it cacheable; one word of
     * Hebrew in it and every English athlete's call goes cold, silently, with the bill arriving a
     * month later.
     */
    language: string;
    /** Minutes she says she has for a workout. Absent until she has said — never 60 by default. */
    minutes?: number;
    /**
     * WHAT SHE WEIGHED WHEN HUSH MET HER, beside what she weighs now.
     *
     * ⚠️ Only the current weight was sent, and for one goal that is enough and for the others it is
     * the whole feedback loop. An athlete whose goal is to gain or lose is telling the coach
     * whether the plan is working with this number and nothing else — and a coach shown a single
     * reading has no way to know which direction she has been going, or how fast, or whether the
     * last month of work did anything at all.
     *
     * The app has held it since day one (`Profile.startWeightKg`, stamped at onboarding and never
     * moved) because the milestone ladders are cut from it. It simply was not being handed over.
     */
    startWeightKg?: number;
    /*
     * ⛔ `band` / `bandByMuscle` WERE HERE AND ARE GONE (2026-08-05) — they described the engine,
     * not the athlete. The comment they carried called `band` "her declared rep band", and she has
     * never declared one: it is the literal `'8-10'`, written at sign-up, identical for everybody.
     * The full reasoning is at the omission in `coachFacts` itself.
     */
    /*
     * ⛔ `emphasis` WAS HERE AND IS GONE (2026-08-05). Its comment called it "the map she drew —
     * which muscles she wants more or less of", and there is no longer any screen on which she draws
     * it. See the omission in `coachFacts` for the full reasoning.
     */
    /** Muscles resting because she reported they hurt, with the day each comes back (ms). */
    resting?: { muscle: string; severity: string; untilMs: number }[];
    /**
     * The coach's OWN account of who this athlete is, from the intake conversation
     * (`domain/athleteBrief`) — her goal in her words, her history, her injuries, what she refuses.
     *
     * Passed straight back, unparsed. It is the only field in this sheet the app did not derive
     * from something it measured, and that is precisely its value: everything else here is what she
     * DID, and this is what she SAID. Without it every call after the first has forgotten why the
     * programme looks the way it does, and a coach that has forgotten the goal is a random-plan
     * generator with good manners.
     */
    brief?: string[];
  };
  /**
   * What the coach has already decided, and why — newest first (`domain/coachLog`).
   *
   * The return path. Everything else in this sheet is what HAPPENED; this is what the coach itself
   * said about it last time. Without it, a decision in month three can contradict a decision in
   * month one — not because the coach is inconsistent, but because it has no memory of deciding.
   *
   * It is the same sentence the athlete reads in the "Why?" sheet. There is no private version.
   */
  decided?: CoachDecision[];
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
    /**
     * Every item in every shape, IN THE ORDER SHE MET THEM — see `FactWork`.
     *
     * A reps step appears here AND in `lifts`, and that is deliberate rather than duplication: the
     * two say different things. `lifts` groups a lift's sets together with the rest before each and
     * what she was asked for beside what she did; `work` is the session's STRUCTURE — block, round, position — which is
     * the only way to tell that the bench was inside a circuit with the plank rather than four
     * straight sets before it. The coach wrote that structure; it must be able to read it back.
     *
     * Absent on a session recorded before `items` existed.
     */
    work?: FactWork[];
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
  /**
   * Lifts she has swapped away from, twice, with her hands (S-69). Offered id → what she trains.
   * Absent when she has never adopted one.
   */
  swappedByHer?: Record<string, string>;
  /** Muscle → a lift she has asked to keep (S-71). Absent when she has asked for none. */
  keepsByHer?: Record<string, string>;
  /**
   * Runs and walks she recorded on her own, newest first — see `FactCardio`. Absent when there are
   * none, which is most athletes.
   */
  ranOwn?: FactCardio[];
  /**
   * ════ EVERYTHING ELSE SHE DID — the workouts her watch recorded and this app did not ════
   *
   * Founder, 2026-08-02: *"for a footballer, if he turns the watch on during football training — is
   * there a way for the coach to analyse his cardio data and comment on it? And for every sport
   * that involves aerobic work?"*
   *
   * There was not, and the consequence is not subtle: `ranOwn` holds only what OUR cardio stage
   * recorded, so a ninety-minute match on his wrist did not exist. The coach wrote him a heavy leg
   * day for the morning after, believing he had rested for two days, and every part of that decision
   * was defensible from the sheet it was given.
   *
   * Facts only — what it was, when, how long, and whatever the watch measured. No score, no "load",
   * no interpretation. A coach reads "soccer, 92 minutes, avg 148 bpm, yesterday" and knows what to
   * do about today; that is the entire feature.
   */
  alsoDid?: FactExternal[];
  programme: FactProgrammeDay[];
}

/**
 * A RUN SHE RECORDED HERSELF, outside anything the coach wrote.
 *
 * ⚠️ THIS WAS MISSING, and it was missing for a reason that had stopped being true. Open training
 * was "recorded, never coached" — a deliberate wall, built when the engine only understood lifting
 * and a run was not something it could reason about. The coach PRESCRIBES runs now. It was still
 * not being shown the ones she does on her own.
 *
 * The consequence is not subtle: it would have written her a 5 km Tuesday without knowing she ran
 * 10 km on Sunday, every week, and then wondered in its own notes why her legs were not recovering.
 * The whole architecture rests on the coach seeing what she actually did.
 *
 * Metres like every other distance, pace in seconds per kilometre — the number a runner thinks in.
 * NO ROUTE: a GPS trace is the most identifying thing this app holds, and it tells the coach
 * nothing that a distance and a pace do not.
 */
export interface FactCardio {
  at: string;
  gait: string;
  metres: number;
  seconds: number;
  paceSecPerKm: number;
  avgHr?: number;
}

/** One workout her watch recorded that this app did not — see `CoachFacts.alsoDid`. */
export interface FactExternal {
  /** Apple's own name for the activity: "soccer", "cycling", "swimming", "yoga". */
  kind: string;
  at: string;
  minutes: number;
  kcal?: number;
  avgHr?: number;
  km?: number;
}

/**
 * Health's workouts, minus the ones that are already on the sheet as hers.
 *
 * ⚠️ THE DOUBLE-COUNT IS THE WHOLE DIFFICULTY. Once the cardio stage writes to Health — and on a
 * watch it effectively does — her own 5 km comes back through this read as well, and a coach told
 * she ran twice on Tuesday would halve her week for a rest she did not need. A run is the same run
 * when it started within a few minutes of one we recorded; nothing else is compared, because
 * duration and distance drift by a percent or two between two recorders of the same movement.
 */
const SAME_WORKOUT_MS = 5 * 60_000;

function externalFrom(
  workouts: ExternalWorkout[] | undefined,
  mine: CardioActivity[] | undefined,
  /** Her strength sessions' start instants — Hush writes those to Health too now (2026-08-23),
   *  and a coach told she ALSO did "traditionalStrengthTraining" on Tuesday is being told about
   *  the session already on the sheet. Same ±5-minute rule as the runs. */
  mySessions?: readonly { startedAt: string }[],
): FactExternal[] {
  if (!workouts?.length) return [];
  const ours = [
    ...(mine ?? []).map((c) => Date.parse(c.startedAt)),
    ...(mySessions ?? []).map((s) => Date.parse(s.startedAt)),
  ].filter(Number.isFinite);
  return workouts
    .filter((w) => {
      const at = Date.parse(w.at);
      if (!Number.isFinite(at)) return false;
      return !ours.some((o) => Math.abs(o - at) <= SAME_WORKOUT_MS);
    })
    .map((w) => ({
      kind: w.kind,
      at: w.at,
      minutes: w.minutes,
      ...(w.kcal != null ? { kcal: w.kcal } : {}),
      ...(w.avgHr != null ? { avgHr: w.avgHr } : {}),
      ...(w.km != null ? { km: w.km } : {}),
    }));
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

function liftOf(exerciseId: string, sets: SetLog[]): FactLift | null {
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
    sets: ordered.map((x) => ({
      w: x.actualWeight,
      r: x.actualReps,
      ...(x.restBeforeS != null ? { rest: x.restBeforeS } : {}),
      ...(x.edited ? { edited: true as const } : {}),
    })),
  };
}

/**
 * Every item, flattened into one vocabulary the coach can read whatever the shape.
 *
 * `did`/`asked` collapse reps, seconds and metres onto one pair of fields deliberately: the coach
 * knows from `kind` what the number counts, and four parallel field names would be four things to
 * get wrong in a prompt. `open` has neither, because there was never a number.
 */
function workOf(items: ItemResult[]): FactWork[] {
  return items.map((i) => {
    const where = { kind: i.kind, ex: i.ex, name: nameOf(i.ex), block: i.block, round: i.round, position: i.position };
    const common = {
      ...(i.restBeforeS != null ? { restBeforeS: i.restBeforeS } : {}),
    };
    switch (i.kind) {
      case 'reps':
        return { ...where, ...common, did: i.reps, ...(i.load !== undefined ? { load: i.load } : {}) };
      case 'time':
        return { ...where, ...common, did: i.seconds, asked: i.askedSeconds, ...(i.load != null ? { load: i.load } : {}) };
      case 'distance':
        return {
          ...where, ...common, did: i.metres, asked: i.askedMetres,
          ...(i.seconds != null ? { seconds: i.seconds } : {}),
          ...(i.load != null ? { load: i.load } : {}),
        };
      default:
        return { ...where, ...common };
    }
  });
}

/** Display name for a lift or a movement id, or the id itself when neither knows it. */
function nameOf(id: string): string {
  return byId.get(id)?.name ?? MOVEMENTS.find((m) => m.id === id)?.name ?? id;
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
    const lift = liftOf(id, grouped.get(id)!);
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
/**
 * The runs she recorded herself, newest first, capped.
 *
 * Capped for the same reason everything else here is: it travels on every call. Twelve is a
 * quarter of a runner's year at one a week and more than enough to see a pattern — and the coach
 * has her whole strength record in aggregate beside it, so this is context, not the archive.
 */
function cardioFrom(cardio: CardioActivity[] | undefined, limit = 12): FactCardio[] {
  return [...(cardio ?? [])]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit)
    .map((c) => ({
      at: c.startedAt,
      gait: c.gait,
      metres: Math.round(c.distanceKm * 1000),
      seconds: Math.round(c.durationSec),
      paceSecPerKm: Math.round(c.avgPaceSec),
      ...(c.avgHr != null ? { avgHr: Math.round(c.avgHr) } : {}),
    }));
}

/**
 * How many occurrences of one lift travel on the sheet.
 *
 * Six is the window a coach actually reasons over — long enough to see a stall (three or four
 * sessions at one load) or a climb, short enough that fifteen lifts still cost about a thousand
 * tokens on a half of the message that is never cached. The whole ladder is still there in `rungs`;
 * this is the part where WHEN matters.
 */
const RECENT_OCCURRENCES = 6;

function performedFrom(history: Session[], nowMs: number): FactPerformed[] {
  const oldestFirst = [...history].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const acc = new Map<string, { loads: (number | null)[]; occurrences: FactOccurrence[] }>();
  for (const s of oldestFirst) {
    const at = Date.parse(s.startedAt);
    const ago = Number.isFinite(at) ? Math.max(0, Math.round((nowMs - at) / 86_400_000)) : 0;
    const open = new Map<string, FactOccurrence>();
    for (const set of s.sets) {
      if (set.isApproach) continue;
      if (!byId.has(set.exerciseId)) continue;
      let e = acc.get(set.exerciseId);
      if (!e) { e = { loads: [], occurrences: [] }; acc.set(set.exerciseId, e); }
      let occ = open.get(set.exerciseId);
      if (!occ) {
        // Her own answer for THIS lift on THIS day, when she gave one. Never inferred from the reps
        // — an unanswered lift is unknown, and unknown is an honest value.
        occ = { ago, load: set.actualWeight ?? null, reps: [] };
        open.set(set.exerciseId, occ);
        e.occurrences.push(occ);
      }
      // The load of the occurrence is the LAST one performed on it — Loop 1 moves it mid-lift, and
      // what she finished on is what she is training at.
      occ.load = set.actualWeight ?? null;
      occ.reps.push(set.actualReps);
      e.loads.push(set.actualWeight);
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
      // Newest first: the coach reads down until it has what it needs, and the first line is the
      // one that answers "what did she do last time".
      recent: e.occurrences.slice(-RECENT_OCCURRENCES).reverse(),
      occurrences: e.occurrences.length,
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
/**
 * ⛔ THE CARDIO MACHINES ARE NOT OFFERED YET — founder scope call, 2026-08-03:
 *
 *   > *"For the cardio, I think at the start it is enough to do just walking / running, and not
 *   > deal with all the other things we added."*
 *
 * The rower, the bike, the erg, the stair climber, the pool, the rope — every one of them measures
 * differently, records differently, and is a screen we have not designed. Offering a coach a
 * vocabulary the app cannot execute is how it prescribes a 2 km row that lands on a stage with no
 * way to log it.
 *
 * ⚠️ THEY ARE FILTERED, NOT DELETED. A movement removed from `MOVEMENTS` would break the display of
 * every session an athlete has ALREADY recorded against it — history is not a catalogue we get to
 * edit. This list is what the coach may CHOOSE from today; widening it is one line when the screens
 * exist, and nothing recorded is ever orphaned.
 */
const NOT_YET_OFFERED = new Set([
  // The machines — every one measures and records differently, and none has a screen yet.
  'cycle_outdoor', 'cycle_stationary', 'row_erg', 'elliptical', 'stair_climber', 'swim', 'jump_rope',
  /*
   * ⛔ AND THE FIELD WORK, on the founder's scope call after build 41:
   *
   *   > *"Take out the sprints and all the various cardio things. I want us to focus on the gym
   *   > alone, and cardio is walking / running, that's it. We need to go back to the source and be
   *   > the best gym-only app there is, and establish ourselves there."*
   *
   * Sprints, shuttles, jumps and sled work are not gym-floor training, and every one of them is a
   * screen we have not designed and a measurement the phone cannot take. Leaving them on offer let
   * the coach write a session the app cannot run.
   */
  'sprint', 'shuttle_run', 'box_jump', 'broad_jump', 'sled_push',
  /*
   * ⛔ AND THE CARRY, on the same ruling, spelled out again (founder, 2026-08-12):
   *
   *   > *"אין נסיעת חקלאי. יש רק הליכה או ריצה בחוץ או הליכה או ריצה בהליכון. זהו."*
   *
   * It was the last DISTANCE movement on offer that is not one of the four, and it is the reason a
   * predicate written as "has a distance ⇒ the phone counts it" sent a forty-metre walk across a
   * gym floor to the live cardio stage. **With it gone the two questions collapse into one**:
   * every distance the coach can prescribe is walking or running, and every one of them is tracked
   * — by the satellite outdoors and by Core Motion on a belt.
   *
   * ⚠️ IT STAYS IN `MOVEMENTS`, like `sled_push` beside it, so a session already logged against it
   * still knows its own name. What it may no longer be is PRESCRIBED.
   */
  'farmer_carry',
]);

export function coachMovements(): FactMovement[] {
  return MOVEMENTS.filter((m) => !NOT_YET_OFFERED.has(m.id)).map((m) => ({
    id: m.id,
    name: m.name,
    measures: [...m.measures],
    ...(m.loadable ? { loadable: true as const } : {}),
    /*
     * ⛔ `gps` → `tracked` (2026-08-12). The coach is told HOW a movement is measured, and the
     * answer stopped being binary the day the treadmill path landed: `'gps'` outdoors, `'motion'`
     * indoors, absent when she does it and says so. A flag called `gps` could only say two of the
     * three, and it was saying the wrong one about a treadmill.
     */
    ...(m.tracked ? { tracked: m.tracked } : {}),
  }));
}

/** The grain of every equipment class, from the engine's own constants — never a second copy. */
export function coachEquipment(): Record<string, FactEquipment> {
  const out: Record<string, FactEquipment> = {};
  for (const [equipment, step] of Object.entries(STARTING_INCREMENT)) {
    out[equipment] = { step, floor: emptyBarKg(equipment as Parameters<typeof emptyBarKg>[0]) };
  }
  return out;
}

export interface CoachFactsInput {
  profile: Profile;
  /** The coach's own memory of her, as lines — see `CoachFacts.athlete.brief`. */
  brief?: string[];
  /** Its own past decisions, oldest first as stored — see `CoachFacts.decided`. */
  decided?: CoachDecision[];
  /**
   * The programme the coach wrote last time, so it can see what it is revising.
   *
   * Null before the intake has produced one — which is a fact about her, not a hole: on that one
   * call there genuinely is no programme yet, and the ask says so.
   */
  plan: CoachPlan | null;
  /** Every session in the record, newest first. */
  history: Session[];
  /** The one that just ended, when this sheet is being built because a workout finished. */
  justFinished?: Session;
  /**
   * Runs and walks she recorded on her own (Open training).
   *
   * ⚠️ Not sent for a whole build, and it mattered: the coach prescribes running now, and it would
   * have written her a 5 km Tuesday without knowing she ran 10 km on Sunday. "Recorded, never
   * coached" was a wall built when a run was not something anything here could reason about.
   */
  cardio?: CardioActivity[];
  /**
   * WHAT SHE HAS SWAPPED, WITH HER HANDS, TWICE.
   *
   * ⚠️ This was missing and it was the quiet kind of missing. Two same-target swaps in a row adopt a
   * standing substitute (S-69) — she has told the app, by doing it rather than saying it, that she
   * trains Y where it offers X. The coach never saw that, so it would have kept prescribing X every
   * single week while she silently swapped it out every single session.
   *
   * A `leaveIt` is the same signal pointing the other way (S-71): a lift the app tried to rotate
   * away and she swapped BACK to, twice. It is the one thing she has asked to keep.
   *
   * Both are TESTIMONY, like her brief — she chose them. They are not measurements and they are not
   * ours to overrule; the sheet states them and the coach decides what to do about them.
   */
  /**
   * Her app language as a BCP-47 tag. Defaults to English rather than being omitted: a coach with
   * no instruction answers in whatever the conversation happens to be in, and a session NAME has no
   * conversation to take its cue from.
   */
  language?: string;
  preferences?: {
    /** offered exercise id → the one she actually trains. */
    substitutes?: Record<string, string>;
    /** muscle → the lift she has asked to keep. */
    keep?: Record<string, string>;
  };
  /**
   * Workouts her WATCH recorded that this app did not — her football, her spin class, her swim.
   * See `CoachFacts.alsoDid`. Absent for an athlete with no Health connection, which is most.
   */
  external?: ExternalWorkout[];
  /**
   * Now, injected. The sheet states how long ago each occurrence was (`FactOccurrence.ago`), and a
   * function that reads the clock cannot be checked against a fixed history.
   */
  nowMs?: number;
}

/**
 * Build the sheet.
 *
 * Handed state, returns an object. Every field is named explicitly — see the allow-list note in the
 * file header for why that is not a style choice.
 */
export function coachFacts({ profile, brief, decided, plan, history, justFinished, preferences, cardio, external, language = 'en', nowMs = Date.now() }: CoachFactsInput): CoachFacts {
  const finished = justFinished;
  return {
    v: COACH_FACTS_VERSION,
    athlete: {
      ...(profile.sex ? { sex: profile.sex } : {}),
      ...(profile.weightKg != null ? { weightKg: profile.weightKg } : {}),
      /*
       * ⛔ COLLECTED BY ONBOARDING SINCE 2026-08-03 AND SENT NOWHERE UNTIL THE AUDIT THAT FOLLOWED.
       *
       * `AboutYou` asks for both, `coachRequirements` calls both critical, `Profile` stores both —
       * and this function, the ONLY thing the coach actually reads, carried neither. Two screens of
       * hers, answered and thrown away, with every test green.
       *
       * ⚠️ It is the same failure the founder caught in the bodyweight one turn earlier, committed
       * while fixing it: a conditional spread makes an absent fact invisible, so nothing anywhere is
       * surprised by a field that never arrives. `theCoachIsNeverAskedWithoutWhatItNeeds` now walks
       * `REQUIRED_FOR_COACH` and checks each one lands here, instead of spot-checking a bodyweight.
       */
      ...(profile.age != null && profile.age > 0 ? { age: profile.age } : {}),
      ...(profile.experience ? { experience: profile.experience } : {}),
      /*
       * ⛔ HER OWN WORDS — what she is training FOR, and what the programme must plan around
       * (founder 2026-08-04, deleting the intake chat). These are the two things a form cannot hold,
       * and they are the reason the chat could be deleted at all: everything ELSE it was still
       * asking is now a wheel or a choice.
       *
       * ⚠️ On the sheet rather than in the brief because the brief is the COACH's note about her,
       * rewritten by it over time. This is HERS, said once, unedited — and the prompt's last
       * non-negotiable says the programme has to serve it.
       */
      ...(profile.goalText ? { trainingFor: profile.goalText } : {}),
      ...(profile.limitsText ? { limits: profile.limitsText } : {}),
      /*
       * ⛔ ABSENT MEANS NOBODY HAS ASKED HER. IT MUST NOT MEAN A NUMBER WE MADE UP.
       *
       * ⚠️ FOUND ON THE DEVICE BY THE FOUNDER, 2026-08-02: *"he decides by himself that he'll do 4
       * workouts for me, for some reason, without asking me how many I want."*
       *
       * He was right and it was mine. `ConnectHealth` handed over `daysPerWeek: 4` as a placeholder
       * with a comment saying the coach would replace it, and `minutes` fell back to 60 the same
       * way. Both then arrived on the sheet — **under a heading that says everything below it is
       * MEASURED, not reported** — and the preamble's own bound reads *"write exactly that many
       * sessions"*. So the coach did. It never asked how many days she trains because, as far as it
       * could tell, it had been told.
       *
       * A default is a decision. Putting one on a sheet labelled "what the app watched her do" is
       * the app deciding and letting the coach take the blame for it — which is precisely the thing
       * the whole AI move exists to stop.
       *
       * Omitted now when nobody has asked, and the preamble says what absence means.
       */
      ...(profile.daysPerWeek > 0 ? { daysPerWeek: profile.daysPerWeek } : {}),
      units: profile.units,
      ...(profile.startWeightKg != null ? { startWeightKg: profile.startWeightKg } : {}),
      language,
      ...(profile.workoutMinutes != null ? { minutes: profile.workoutMinutes } : {}),
      /*
       * ⛔ `band` AND `bandByMuscle` ARE NOT SENT, because neither was ever hers.
       *
       * `profile.repBand` is written once, at sign-up, as the literal `'8-10'` — the same string for
       * every athlete who has ever installed this app (`BuildingProgramme.tsx`). It is a leftover
       * default from when the v5 engine picked rep ranges. On the coach's sheet it did not read as a
       * default; it read as HER rep band, sitting beside her age and her bodyweight, and a coach
       * that honours it is honouring a constant that means nothing about her.
       *
       * `bandByMuscle` is empty for everyone except an athlete who imported a shared plan, and it
       * describes THAT plan rather than her.
       *
       * The coach sets the band on every item it writes and the app enforces it live, so there is
       * nothing here it needs to be told. If a real preference ever gets collected, it comes back as
       * a field she actually answered.
       */
      /*
       * ⛔ `emphasis` IS GONE TOO (2026-08-05), for the same reason and one worse one.
       *
       * It was `profile.bodyMap`, the v5 engine's per-muscle stance. **Nothing in the shipping app
       * writes a stance any more.** The only live writer is `WeeklyUpdate`, which sets `'normal'` —
       * the default — when she brings a rested muscle back. There is no screen where she can ask for
       * more of a muscle or turn one off; the coach decides the balance now. So the field arrived as
       * either nothing or `{Chest: 'normal'}`, and it was described to the coach as "a muscle she
       * asked for more of", which she had no way to do.
       *
       * ⚠️ AND IT WOULD HAVE DOUBLED THE INJURY. `effectiveBodyMap` marks a hurt muscle `'off'`, so
       * the moment anything passed the derived map through here the coach would read one injury
       * twice under two names, with only `resting` carrying the severity and the date.
       */
          ...(brief?.length ? { brief } : {}),
      /*
       * ⛔ ONLY THE LIVE ONES. This mapped `profile.painEases` straight through, expired windows
       * included, under a field called `resting` — so a shoulder rested for four days in March was
       * still being presented as currently resting in August, and the coach had to notice `untilMs`
       * was in the past to avoid working around an injury that had healed months ago.
       *
       * `activeEases` is the same filter every other consumer of this list already uses.
       */
      ...(activeEases(profile.painEases, nowMs).length
        ? {
            resting: activeEases(profile.painEases, nowMs).map((p) => ({
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
            ...(finished.items?.length ? { work: workOf(finished.items) } : {}),
          },
        }
      : {}),
    ...(decided?.length ? { decided: recentDecisions(decided) } : {}),
    performed: performedFrom(history, nowMs),
    equipment: coachEquipment(),
    catalogue: coachCatalogue(),
    movements: coachMovements(),
    /*
     * Her own choices, expressed by hand. Omitted entirely when empty rather than sent as `{}` —
     * an empty object on every sheet is bytes paid for to say "she has not asked for anything".
     */
    ...(preferences?.substitutes && Object.keys(preferences.substitutes).length
      ? { swappedByHer: preferences.substitutes }
      : {}),
    ...(preferences?.keep && Object.keys(preferences.keep).length ? { keepsByHer: preferences.keep } : {}),
    ...(cardio?.length ? { ranOwn: cardioFrom(cardio) } : {}),
    ...(() => {
      const alsoDid = externalFrom(external, cardio, history);
      return alsoDid.length ? { alsoDid } : {};
    })(),
    programme: (plan?.sessions ?? []).map((sess) => ({
      name: sess.name,
      ...(sess.day ? { day: sess.day } : {}),
      /*
       * ⛔ THE FLATTENING WAS EATING HER SUPERSETS (2026-08-31).
       *
       * A session is blocks and a block is items — that is the vocabulary the coach WRITES in, and
       * §"A session is blocks" in the prompt teaches it that a block of two items is a circuit she
       * alternates. This line then handed the same coach its own programme with the blocks flattened
       * away, so a pair she wrote in the builder and a pair the model wrote itself both arrived as
       * two ordinary consecutive lifts. Reviewing that week, it could only ever answer about a week
       * she is not doing — and its own session length is out by one rest per round.
       *
       * `block` is the seam, and it is the SAME field name `performed` already uses for the same
       * idea, so the sheet keeps one vocabulary. Emitted ONLY where it says something — a block of
       * one is a lift, and a number repeated down every line of every engine week is bytes paid to
       * say nothing.
       */
      items: sess.blocks.flatMap((b, bi) =>
        b.items.map((i) => ({
          ex: i.ex,
          kind: i.kind,
          rounds: b.rounds,
          ...(b.items.length > 1 ? { block: bi } : {}),
          ...(i.kind === 'reps' ? { reps: i.reps, load: i.load } : {}),
          ...(i.kind === 'time' ? { seconds: i.seconds } : {}),
          ...(i.kind === 'distance' ? { metres: i.metres } : {}),
        })),
      ),
    })),
  };
}
