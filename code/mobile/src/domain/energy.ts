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

// 

export const STRENGTH_MET = 4.5;

/** Estimated kcal for a strength session; null when it cannot be estimated honestly. */
export function strengthSessionKcal(durationMs: number, weightKg: number | null | undefined): number | null {
  if (!weightKg || weightKg <= 0 || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Math.round(STRENGTH_MET * weightKg * (durationMs / 3_600_000));
}

/**
 * THE session's calories — the measurement when there is one, the estimate otherwise.
 *
 * Seven surfaces used to call `strengthSessionKcal` directly, each re-deriving the same figure from
 * duration × bodyweight. That was fine while there was only ever one figure. A workout the WATCH
 * executed standalone now arrives with the real thing (HealthKit's active energy, from her heart
 * and her motion), and a surface that kept estimating would print a different number for the same
 * session than the wrist did — and than the surface beside it.
 *
 * So this is the only door. `measuredKcal` wins because it was measured; the estimate stands
 * everywhere else; and null still means null (no bodyweight ⇒ no number, never a guessed body).
 */
export function sessionKcal(
  session: { measuredKcal?: number; earlyFinish?: boolean },
  durationMs: number,
  weightKg: number | null | undefined,
): number | null {
  if (session.measuredKcal != null && session.measuredKcal > 0) return Math.round(session.measuredKcal);
  return strengthSessionKcal(durationMs, weightKg);
}
