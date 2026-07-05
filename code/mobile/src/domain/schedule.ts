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

/** kg<->lb display. Stored values are kg; display follows the athlete's setting (§10.1). */
export function displayWeight(kg: number | null, units: Units): number | null {
  if (kg == null) return null;
  return units === 'lb' ? Math.round(kg * 2.2046226) : kg;
}

export function unitLabel(units: Units): string {
  return units; // "kg" | "lb"
}
