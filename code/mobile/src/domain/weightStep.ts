/**
 * ════ THE EQUIPMENT'S OWN DETENT, SHARED (2026-08-26; a module since 2026-09-08) ════
 *
 * One ladder for every control that can put a load into her history: the stage's nudgers, the
 * editor's dials and — since the founder asked to type a set from the locked phone — the Live
 * Activity's steppers all turn by the SAME per-equipment step. The full reasoning (the 41.5 kg
 * bench that no plates could build) lives at the DETENT note inside `EditSet`.
 *
 * Pure: units and equipment in, a step out. Nothing here reads a screen.
 */

import { STARTING_INCREMENT } from '@/engine/v5/constants';

const WEIGHT_STEP_LB: Record<string, number> = { barbell: 5, fixed_barbell: 5, dumbbell: 2.5, machine: 5, cable: 5, bodyweight: 1 };

/** The detent where the equipment is unknown. A bodyweight lift has no load axis (S-51) and its
 *  increment is declared 0; a control that opens a load dial on one anyway turns by this rather
 *  than by nothing — stated as a rule, not left to a falsy coalesce (2026-09-09). */
const WEIGHT_STEP_FALLBACK = { kg: 0.5, lb: 1 } as const;

export function weightStepFor(units: 'kg' | 'lb', equipment: string | undefined): number {
  const declared = units === 'kg'
    ? (equipment ? STARTING_INCREMENT[equipment as keyof typeof STARTING_INCREMENT] : undefined)
    : (equipment ? WEIGHT_STEP_LB[equipment] : undefined);
  return declared != null && declared > 0 ? declared : WEIGHT_STEP_FALLBACK[units];
}
