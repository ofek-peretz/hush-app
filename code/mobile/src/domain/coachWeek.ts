/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * COACH WEEK — what the surfaces read once the coach owns the programme.
 *
 * The coach decides, `db.saveCoachPlan` stores it whole, and this is how a screen asks what is in
 * it. It is the counterpart to `homePlan`, which does the same job for the engine's `ProgramDay`.
 *
 * ── WHY A SECOND READ MODEL AND NOT A CONVERSION ────────────────────────────────────────────────
 * The cheap move is to translate a `CoachPlan` into `Program`/`ProgramDay`/`Slot` and let every
 * existing surface carry on unchanged. It cannot be done honestly. A `Slot` is
 * `{ capability, exerciseId, setCount }` — a 5 km run has no home in it, a 45-second plank has no
 * home in it, and `say` (the coach's execution instruction, the one thing the app could never carry
 * before this layer) is dropped on the floor. A conversion would silently delete three of the four
 * shapes, quietly, in a function that looked like plumbing.
 *
 * So the plan stays whole and the READ widens. `CoachRow` can describe any of the four shapes,
 * which is the entire point of having had four.
 *
 * ── WHAT IS NOT ESTIMATED HERE ──────────────────────────────────────────────────────────────────
 * A session's minutes are counted only from work whose duration is KNOWN — reps and held time. A
 * distance cannot be turned into minutes without a pace, and this app does not guess: inventing a
 * pace to fill a number would be the engine forming an opinion, which is exactly what the AI layer
 * removed. So `minutes` reports what is countable and `hasUncountedWork` says the rest exists.
 * A screen can then say "45 min, plus the run" instead of a confident lie.
 *
 * Pure and I/O-free. Knows nothing about storage, the model, or any screen.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { exerciseDisplayName } from '@/data/exercises';
import { MOVEMENTS } from '@/data/movements';
import type { CoachPlan, PlannedItem, PlannedSession, Weekday } from './coachPlan';

/** Seconds a single rep-set takes to perform, before rest. The same order the engine assumes. */
const EXEC_S = 40;
/** Rest between rounds when the coach did not prescribe one. */
const DEFAULT_REST_S = 90;

/** One workout in the coach's week, as a chip on Today would need it. */
export interface CoachWorkout {
  /**
   * Stable within a plan. Position-based, because the coach does not issue ids and two sessions may
   * legitimately share a name — "Upper" twice in a six-day week is a real programme, and matching
   * on the name would light both when one is chosen.
   */
  id: string;
  name: string;
  /** Present on programmes where the day matters (a long run belongs on Sunday); absent otherwise. */
  day?: Weekday;
  /** How many things she does, counting every round. What a chip's meta line says. */
  items: number;
  /** Minutes of work whose duration is known. See the header — never a guess. */
  minutes: number;
  /** There is work here that cannot be timed (a distance). `minutes` is a floor, not the total. */
  hasUncountedWork: boolean;
}

/** One line under a workout's name. Wide enough for all four shapes — that is why they exist. */
export interface CoachRow {
  ex: string;
  /** The lift's or movement's display name, resolved from whichever catalogue holds it. */
  name: string;
  kind: PlannedItem['kind'];
  /** How many times this item is done in its block. A set count, a lap count, a round count. */
  rounds: number;
  /** `reps` only — her band, `[lo, hi]`. */
  band?: [number, number];
  /** kg, or null for bodyweight. Absent when the shape carries no load at all. */
  load?: number | null;
  /** `time` only. */
  seconds?: number;
  /** `distance` only, in metres. */
  metres?: number;
  /** The coach's instruction for this item, in its own words. Never generated, never edited. */
  say?: string;
}

const movementName = new Map(MOVEMENTS.map((m) => [m.id, m.name]));

/** Whichever catalogue holds it. An id that resolves in neither cannot reach here — the parse refuses it. */
function nameOf(ex: string): string {
  return movementName.get(ex) ?? exerciseDisplayName(ex);
}

/** A session's id. Position-based; see `CoachWorkout.id`. */
export function coachWorkoutId(index: number): string {
  return `coach_${index}`;
}

/**
 * Minutes of countable work, and whether anything was left out.
 *
 * Counted per ROUND, because that is what she actually does: a block of two items done four times
 * is eight pieces of work and four rests, not two and one.
 */
function timeOf(session: PlannedSession): { minutes: number; hasUncountedWork: boolean } {
  let seconds = 0;
  let uncounted = false;
  for (const block of session.blocks) {
    const rest = block.restS ?? DEFAULT_REST_S;
    for (const item of block.items) {
      if (item.kind === 'reps') seconds += EXEC_S * block.rounds;
      else if (item.kind === 'time') seconds += item.seconds * block.rounds;
      // `distance` needs a pace we do not have, and `open` has no number by definition.
      else if (item.kind === 'distance') uncounted = true;
    }
    // Rest sits BETWEEN rounds, so a block of one round has none — the same rule `planRun` runs by.
    seconds += rest * Math.max(0, block.rounds - 1);
    seconds += block.restAfterS ?? 0;
  }
  return { minutes: Math.round(seconds / 60), hasUncountedWork: uncounted };
}

/** The week, as chips. Order is the coach's own — a programme has a shape and this does not sort it. */
export function coachWeek(plan: CoachPlan | null | undefined): CoachWorkout[] {
  return (plan?.sessions ?? []).map((s, i) => ({
    id: coachWorkoutId(i),
    name: s.name,
    ...(s.day ? { day: s.day } : {}),
    items: s.blocks.reduce((n, b) => n + b.items.length * b.rounds, 0),
    ...timeOf(s),
  }));
}

/**
 * The rows under one workout's name.
 *
 * Every row is known SYNCHRONOUSLY. That is the difference from `homePlan`, whose loads are an
 * engine read in flight and whose rows had to carry a `pending` flag to stop Today collapsing on
 * every chip tap (founder A.12). Here the coach already decided the load and it is in the stored
 * plan — there is nothing to wait for, so there is no pending state to get wrong.
 */
export function coachRows(plan: CoachPlan | null | undefined, workoutId: string): CoachRow[] | null {
  const index = (plan?.sessions ?? []).findIndex((_, i) => coachWorkoutId(i) === workoutId);
  if (index < 0) return null;
  const session = plan!.sessions[index];

  const rows: CoachRow[] = [];
  for (const block of session.blocks) {
    for (const item of block.items) {
      rows.push({
        ex: item.ex,
        name: nameOf(item.ex),
        kind: item.kind,
        rounds: block.rounds,
        ...(item.kind === 'reps' ? { band: item.reps, load: item.load } : {}),
        ...(item.kind === 'time' ? { seconds: item.seconds, ...(item.load != null ? { load: item.load } : {}) } : {}),
        ...(item.kind === 'distance' ? { metres: item.metres, ...(item.load != null ? { load: item.load } : {}) } : {}),
        ...(item.say ? { say: item.say } : {}),
      });
    }
  }
  return rows;
}

/** The session itself, for the machine that runs it (`buildPlanFromCoach`). */
export function coachSession(plan: CoachPlan | null | undefined, workoutId: string): PlannedSession | null {
  const index = (plan?.sessions ?? []).findIndex((_, i) => coachWorkoutId(i) === workoutId);
  return index < 0 ? null : plan!.sessions[index];
}

/**
 * The coach's rows in the shape Today already prints.
 *
 * `HomePlanLift` was written for the engine's one shape — reps at a load — and its figure assembles
 * itself from `load` / `band` / `sets`. Three of the coach's four shapes cannot be said that way at
 * all, and forcing them through would print "0 · 4×0–0" on a 400 m repeat. So those arrive with
 * their figure ALREADY WRITTEN, in `detail`, and the row prints it verbatim.
 *
 * `reps` is not given a `detail` on purpose: it is exactly what the existing assembly is for, so it
 * keeps the load emphasis, the unit, and the moss/blue tone that says which way the coach moved it.
 * Two ways of printing the same thing is how two screens end up disagreeing about a number.
 *
 * ⚠️ `say` IS DELIBERATELY NOT SHOWN HERE. It is an execution instruction — "at a pace where you
 * could hold a conversation" — and it belongs where she reads it while doing the work, on the
 * stage. Printing it on an overview would put a paragraph on every row of Today.
 */
export function coachPlanRows(
  rows: CoachRow[] | null,
  units: 'kg' | 'lb',
): { exerciseId: string; name: string; load: number | null; sets: number; band: [number, number]; detail?: string }[] | null {
  if (!rows) return null;
  return rows.map((r) => {
    const base = { exerciseId: r.ex, name: r.name, sets: r.rounds, band: [0, 0] as [number, number] };
    switch (r.kind) {
      case 'reps':
        // The one shape the existing assembly already says correctly.
        return { ...base, load: r.load ?? null, band: r.band ?? [0, 0] };
      case 'time':
        return { ...base, load: null, detail: `${r.rounds}×${formatSeconds(r.seconds ?? 0)}` };
      case 'distance':
        return { ...base, load: null, detail: `${r.rounds}×${formatDistance(r.metres ?? 0, units)}` };
      case 'open':
        // No number worth stating — the founder's law: a control that says nothing says nothing.
        return { ...base, load: null, detail: '' };
    }
  });
}

/** "45s" under a minute, "2:30" above it — the way a stopwatch reads, not a spreadsheet. */
function formatSeconds(total: number): string {
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m}m` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Metres below a kilometre; kilometres above it, or MILES for an athlete who reads in pounds.
 *
 * ⚠️ SHORT DISTANCES STAY IN METRES IN BOTH SYSTEMS, and that is not an oversight. A 400 m repeat
 * is 400 m on every track on earth, including American ones — converting it to "437 yd" replaces a
 * number she recognises with one nobody has ever run. The unit question only arises at the long
 * end, where 5 km and 3.1 mi are genuinely two different ways of saying it.
 *
 * The record is always metres. This is display, and display follows the athlete.
 */
function formatDistance(metres: number, units: 'kg' | 'lb'): string {
  if (metres < 1000) return `${metres} m`;
  return units === 'lb'
    ? `${Number((metres / 1609.344).toFixed(2))} mi`
    : `${Number((metres / 1000).toFixed(2))} km`;
}

/* ─────────────────────────────────────────────────────────────────────── WHICH WAY A LOAD MOVED */

/**
 * The direction each lift's load moved between two programmes.
 *
 * ⚠️ THIS IS DERIVED, NOT REPORTED, AND THAT DISTINCTION IS THE POINT. The engine could state a
 * direction because it computed a delta. The coach states a PROGRAMME — what she lifts next, not
 * which way it moved — so the direction is not in the answer and never will be.
 *
 * It is still a fact rather than a guess: it is the difference between two programmes the app
 * holds, both written by the same coach. Asking the coach to also state a direction would invite it
 * to state one that disagreed with its own numbers, and the founder's law
 * (`direction is a colour`) is precisely about surfaces not disagreeing.
 *
 * Only LIFTS, and only where both sides carry a load: a run has no direction, and a lift that was
 * not in the previous week has not moved — it has arrived, which is a different thing and is why
 * a new lift is absent here rather than marked as a raise.
 */
export function coachLoadDirections(
  now: CoachPlan | null | undefined,
  before: CoachPlan | null | undefined,
): Record<string, 'up' | 'down' | 'hold'> {
  if (!now || !before) return {};

  /** Every lift's load in a plan, first occurrence wins — a lift on two days is one prescription. */
  const loads = (plan: CoachPlan): Map<string, number> => {
    const out = new Map<string, number>();
    for (const session of plan.sessions) {
      for (const block of session.blocks) {
        for (const item of block.items) {
          if (item.kind !== 'reps' || item.load == null) continue;
          if (!out.has(item.ex)) out.set(item.ex, item.load);
        }
      }
    }
    return out;
  };

  const then = loads(before);
  const out: Record<string, 'up' | 'down' | 'hold'> = {};
  for (const [ex, load] of loads(now)) {
    const was = then.get(ex);
    if (was == null) continue; // arrived rather than moved
    // A float comparison, because loads are halves and quarters of a kilogram.
    out[ex] = Math.abs(load - was) < 1e-6 ? 'hold' : load > was ? 'up' : 'down';
  }
  return out;
}
