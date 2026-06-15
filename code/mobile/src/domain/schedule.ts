/**
 * Schedule + unit formatting helpers.
 * Today's program day drives Home's Workout/Rest variant (spec §1.6/§1.7).
 */
import type { Program, ProgramDay, Units } from '@/data/local/models';

/** Today's day in the program, mapped by weekday (0=Sun..6=Sat). */
export function todayDay(program: Program): ProgramDay | null {
  if (program.days.length === 0) return null;
  const idx = new Date().getDay() % program.days.length;
  return program.days[idx];
}

/** kg<->lb display. Stored values are kg; display follows the athlete's setting (§10.1). */
export function displayWeight(kg: number | null, units: Units): number | null {
  if (kg == null) return null;
  return units === 'lb' ? Math.round(kg * 2.2046226) : kg;
}

export function unitLabel(units: Units): string {
  return units; // "kg" | "lb"
}
