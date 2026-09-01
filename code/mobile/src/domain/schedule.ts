/**
 * Schedule + unit formatting helpers.
 * Today's program day drives Home's Workout/Rest variant (spec §1.6/§1.7).
 */

// 

import type { Program, ProgramDay, Session, Units } from '@/data/local/models';
import { FREE_SESSION_LIMIT } from '@/domain/entitlement';

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
/**
 * What to call a saved session.
 *
 * It used to fall back to a programme lookup for rows written before `programDayName` was stamped
 * at start. There is no programme to look in any more — and the fallback was always the weaker
 * answer anyway, because it named the workout by what the plan says TODAY rather than by what she
 * actually trained.
 */
export function sessionDayName(session: Session): string {
  return session.programDayName || 'Workout';
}

/** kg<->lb display. Stored values are kg; display follows the athlete's setting (§10.1). */
export function displayWeight(kg: number | null, units: Units): number | null {
  if (kg == null) return null;
  return units === 'lb' ? Math.round(kg * 2.2046226) : kg;
}

export function unitLabel(units: Units): string {
  return units; // "kg" | "lb"
}

/**
 * ════ HOW MANY WORKOUTS THE ENGINE MUST MEET BEFORE IT KNOWS HER ════
 *
 * The "I learn you" phase is not a round number and never was — it is however many DIFFERENT
 * workouts her programme holds, because Loop 1 learns a lift the first time it meets it, and a
 * workout it has already seen teaches it nothing new about which loads to open at.
 *
 * It shipped as a constant `4`, which is right only for an athlete whose week happens to hold four
 * distinct days. She trains twice a week and the app promised to spend four sessions learning her
 * — two of them re-runs. She trains six and it stopped counting at four (founder 2026-07-28).
 *
 * DISTINCT means distinct WORK, not distinct names. Two days can carry the same lifts — the
 * assembler's hole guard borrows a donor's lead lift for an empty day — and a repeat is a repeat
 * whatever it is called, so the signature is the set of exercises, order-independent.
 */
export function distinctWorkoutCount(days: { isRest?: boolean; slots: { exerciseId: string }[] }[]): number {
  const signatures = new Set<string>();
  for (const d of days) {
    if (d.isRest || d.slots.length === 0) continue;
    signatures.add([...new Set(d.slots.map((s) => s.exerciseId))].sort().join('|'));
  }
  return signatures.size;
}

/**
 * The learning phase as a NUMBER THE SURFACES MAY SAY — one home, so two screens cannot promise
 * two different lengths.
 *
 * 1.5 makes the promise ("1–n") before the programme exists, from the assembler run on her map;
 * 2.0 repeats it ("these n workouts") once it does, from the programme itself. Both are the same
 * pure count, so both land on the same figure — but only if they clamp it the same way, and they
 * did not: the clamp lived inside 1.5. Never zero (a promise about nothing) and never past the
 * fourteen the trial holds (the timeline paints n of FREE_SESSION_LIMIT ticks; a count past the
 * end paints nothing).
 */
export function learnPhaseLength(days: { isRest?: boolean; slots: { exerciseId: string }[] }[]): number {
  return Math.max(1, Math.min(distinctWorkoutCount(days), FREE_SESSION_LIMIT));
}
