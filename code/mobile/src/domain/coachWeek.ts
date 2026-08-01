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
