/**
 * Strength-session energy estimate (founder 2026-07-10 — Complete screen shows
 * duration + calories; sets/volume removed).
 *
 * No watch required: the standard MET formula over the session's wall-clock time,
 *   kcal = MET × bodyweight(kg) × hours
 * with MET 4.5 — the compendium band for a resistance session of multiple
 * exercises WITH its rest periods (moderate 3.5 … vigorous 6.0). It is an honest
 * order-of-magnitude estimate, not a measurement.
 *
 * Honesty rule (the cardio precedent, `cardioMath.kcalForKm`): no bodyweight ⇒
 * NO number. Hush never guesses a body to bill calories against.
 */
export const STRENGTH_MET = 4.5;

/** Estimated kcal for a strength session; null when it cannot be estimated honestly. */
export function strengthSessionKcal(durationMs: number, weightKg: number | null | undefined): number | null {
  if (!weightKg || weightKg <= 0 || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Math.round(STRENGTH_MET * weightKg * (durationMs / 3_600_000));
}
