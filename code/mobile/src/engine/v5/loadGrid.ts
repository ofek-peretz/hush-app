/**
 * ════ ⛔ THE ROOM SHE TRAINS IN HAS ITS OWN PLATES (2026-09-30) ════
 *
 * The engine thinks in kilograms and always will: every rung it walks is a multiple of the equipment's
 * increment, counted up from the bar. Until today those rungs were KILOGRAM rungs for everyone — a 20 kg
 * bar and 2.5 kg steps — and an athlete in pounds was shown them converted: 42.5 kg → 94 lb, the empty
 * bar as 44 lb, and a set stage that told her to put **24.5 lb a side** on a bar no gym on earth can
 * build. Of the 33 barbell rungs from 20 to 100 kg, eight converted to something loadable.
 *
 * So the RUNGS follow her room. An athlete in pounds trains on a 45 lb bar with 5 lb steps (2.5 a side),
 * 5 lb machine and cable stacks, 2.5 lb dumbbell detents and a 20 lb lightest fixed bar — the same
 * ladder `weightStep.WEIGHT_STEP_LB` already turns the dials by. The engine still stores and reasons in
 * kilograms; it simply walks the kilogram values OF those pound rungs (45 lb = 20.41 kg, a step of
 * 5 lb = 2.268 kg), so every load it prescribes converts back to a whole, loadable number of pounds —
 * and the ratified rule holds again: what is displayed is what is performed, logged and learned.
 *
 * ⚠️ ONE SETTING FOR THE DEVICE, NOT A PARAMETER THREADED THROUGH THE ENGINE. The units are a fact of
 * the athlete (her profile), every producer of a load — the week's targets, the live loop, the voice's
 * "harder", the warm-up ramp, the loads the model writes — must agree on them, and a parameter missed on
 * one path would be exactly the two-ladders defect this replaces. `AppProvider` sets it whenever her
 * profile's units are read or changed; nothing else may. Absent (every test, every harness) it is the
 * kilogram room, bit-for-bit what the engine did before.
 *
 * ⚠️ A KETTLEBELL IS A CAST OBJECT, sold in kilograms even in pound markets (8 kg = "18 lb"), so its
 * ladder does not change. Bands and bodyweight have no load axis in either room.
 */

import type { Equipment } from '@/engine/catalog';
import { STARTING_INCREMENT, BAR_KG, FIXED_BAR_KG } from './constants';

/** The same factor `domain/schedule` converts with — one number, or the rungs drift off whole pounds. */
export const LB_PER_KG = 2.2046226;

export type LoadRoom = 'kg' | 'lb';

/** Pound rungs per equipment, in POUNDS — `weightStep.WEIGHT_STEP_LB`'s ladder. */
const LB_STEP: Partial<Record<Equipment, number>> = { barbell: 5, fixed_barbell: 5, dumbbell: 2.5, machine: 5, cable: 5 };
/** The empty Olympic bar and the lightest fixed bar, in POUNDS. */
const LB_BAR = 45;
const LB_FIXED_BAR = 20;

let room: LoadRoom = 'kg';

/** Set by `AppProvider` from her profile — see the header. */
export function setLoadRoom(units: LoadRoom | null | undefined): void {
  room = units === 'lb' ? 'lb' : 'kg';
}

/** The room the engine is walking — for the few readers that must say which. */
export function loadRoom(): LoadRoom {
  return room;
}

/** One rung of this equipment, in KILOGRAMS, in her room. 0 = no load axis. */
export function incrementOf(equipment: Equipment): number {
  if (room === 'lb') {
    const lb = LB_STEP[equipment];
    if (lb != null) return lb / LB_PER_KG;
  }
  return STARTING_INCREMENT[equipment] || 0;
}

/**
 * ════ THE DUMBBELL RACK AS GYMS ACTUALLY STOCK IT (2026-10-17, the engine audit) ════
 *
 * One kilogram at every weight proposed 11 kg and 13 kg dumbbells — pairs most commercial racks do not
 * hold: they step by 1 kg to 10, by 2 to 20, then by 2.5. So does the engine now, in the kilogram room
 * (a pound rack keeps its 2.5 lb ladder). Her own logged weights still refine it where she has lifted
 * (F-2), so a rack that holds a 13 is learned the day she lifts one.
 */
export function dumbbellStepAt(kg: number): number {
  if (kg < 10 - 1e-9) return 1;
  if (kg < 20 - 1e-9) return 2;
  return 2.5;
}

/** Does this equipment walk the stocked dumbbell ladder (`dumbbellStepAt`) in her room? */
export function onDumbbellLadder(equipment: Equipment): boolean {
  return equipment === 'dumbbell' && room === 'kg';
}

/** The next rack weight strictly above `kg`. */
export function dumbbellUp(kg: number): number {
  if (kg < 10 - 1e-9) return Math.floor(kg + 1e-9) + 1;
  if (kg < 20 - 1e-9) return Math.min(20, Math.floor(kg / 2 + 1e-9) * 2 + 2);
  return Math.floor(kg / 2.5 + 1e-9) * 2.5 + 2.5;
}

/** The heaviest rack weight at or below `kg` (≥ 1). */
export function dumbbellDownOrEqual(kg: number): number {
  if (kg < 1) return 1;
  if (kg < 10 + 1e-9) return Math.floor(kg + 1e-9);
  if (kg < 20 + 1e-9) return Math.max(10, Math.floor(kg / 2 + 1e-9) * 2);
  return Math.max(20, Math.floor(kg / 2.5 + 1e-9) * 2.5);
}

/** The empty bar of this equipment, in KILOGRAMS, in her room (null = not a bar). */
export function barOf(equipment: Equipment): number | null {
  if (equipment === 'barbell') return room === 'lb' ? LB_BAR / LB_PER_KG : BAR_KG;
  if (equipment === 'fixed_barbell') return room === 'lb' ? LB_FIXED_BAR / LB_PER_KG : FIXED_BAR_KG;
  return null;
}
