/**
 * Schedule + unit formatting helpers.
 * Today's program day drives Home's Workout/Rest variant (spec §1.6/§1.7).
 */
import type { Program, ProgramDay, Session, Units } from '@/data/local/models';

/**
 * The WEEKLY-PROGRAM model (ratified): there is NO calendar / day assignment. Home offers the
 * next UNFINISHED workout in the week's bucket (the athlete does the N workouts in any order,
 * whenever). Returns the first non-rest, non-completed workout, or null when every workout is
 * done (the week is complete → Home shows Rest). A rest day (legacy/offline shape) is never
 * offered as a workout.
 */
export function nextWorkout(program: Program): ProgramDay | null {
  return program.days.find((d) => !d.isRest && !d.completed) ?? null;
}

/** Week progress for Home ("X of N done"): completed real workouts over total real workouts. */
export function weekProgress(program: Program): { done: number; total: number } {
  const workouts = program.days.filter((d) => !d.isRest);
  return { done: workouts.filter((d) => d.completed).length, total: workouts.length };
}

/** Home metadata (Screen 01): exercises = filled slots in the day. */
export function dayExerciseCount(day: ProgramDay): number {
  return day.slots.length;
}

/** Home metadata: total working sets across the day's slots. */
export function daySetCount(day: ProgramDay): number {
  return day.slots.reduce((n, s) => n + s.setCount, 0);
}

/**
 * Rough session duration in whole minutes, derived from set volume alone
 * (~3.7 min per working set including rest). Display-only "~N min" estimate;
 * never a performance score.
 */
export function estimateMinutes(day: ProgramDay): number {
  return Math.round(daySetCount(day) * 3.7);
}

/**
 * History day label. Prefers the name captured AT START (stable across weekly
 * regenerations), then a live program lookup for legacy sessions, then a neutral
 * fallback — never an empty or "—" label (§7.9).
 */
export function sessionDayName(session: Session, program: Program | null): string {
  if (session.programDayName) return session.programDayName;
  const fromProgram = program?.days.find((d) => d.id === session.programDayId)?.name;
  return fromProgram ?? 'Workout';
}

/**
 * Whether the Weekly Program Ready note should be re-anchored to today: true only
 * on the rest→trainable transition, i.e. the day a fresh week actually becomes
 * ready (§8.6). Keeps the weekly cadence aligned with real readiness instead of
 * the enrollment weekday.
 */
export function shouldReanchorWeekly(prevRest: boolean, nextRest: boolean): boolean {
  return prevRest && !nextRest;
}

/** kg<->lb display. Stored values are kg; display follows the athlete's setting (§10.1). */
export function displayWeight(kg: number | null, units: Units): number | null {
  if (kg == null) return null;
  return units === 'lb' ? Math.round(kg * 2.2046226) : kg;
}

export function unitLabel(units: Units): string {
  return units; // "kg" | "lb"
}
