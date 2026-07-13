/**
 * THE COLD-START LOAD — what Hush puts on the bar the first time it meets an athlete.
 *
 * This was private to the model (fixtureModel). It is lifted out unchanged — same factors, same
 * rounding, same floors — because a SECOND surface now needs the exact same number: the milestone
 * ladders (founder 2026-07-13). "Adapt the weights that open a milestone to what we know about them
 * from onboarding — experience, weight, height, sex, frequency. We already start their programme
 * from that group's numbers; derive the marks from it too."
 *
 * So the anchor of a club mark is the load Hush itself prescribed on day one. A 100 kg bench is a
 * landmark for one athlete and an impossibility for another; "three times what I started you at"
 * is a landmark for both. One function, two consumers, no second opinion about how strong an
 * athlete probably is.
 *
 * Pure & I/O-free. Inputs: sex × bodyweight × experience × age (the same four the split is built
 * from). Height and frequency are deliberately NOT inputs — height does not predict strength once
 * bodyweight is known, and frequency changes how FAST an athlete arrives at a load, never which
 * load is worth marking.
 */
import type { Profile, Experience, Capability } from '@/data/local/models';
import type { Exercise } from '@/data/exercises';

/** The four fields the cold start actually reads. */
export type LoadProfile = Pick<Profile, 'sex' | 'weightKg' | 'experience' | 'age'>;

const EXP_FACTOR: Record<Experience, number> = { beginner: 0.78, intermediate: 1.0, advanced: 1.22 };
const UPPER: Capability[] = ['horizontal_push', 'horizontal_pull', 'vertical_push'];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Age load multiplier — keeps the cold-start conservative across the lifespan. Untrained
 * teens are still developing; strength gently declines past ~40, so masters athletes
 * start lighter (and, in setsFor/repsFor, train with a touch less volume and joint-
 * friendlier reps). Unknown age → no penalty (the base load is already conservative).
 */
export function ageLoadFactor(age?: number): number {
  if (age == null) return 1;
  if (age < 18) return 0.9; // still developing — conservative
  if (age < 40) return 1.0;
  if (age < 50) return 0.97;
  if (age < 60) return 0.92;
  if (age < 70) return 0.86;
  return 0.8; // 70+
}

/** Conservative personalized starting load (kg), or null for bodyweight movements. */
export function startingWeight(ex: Exercise, profile: LoadProfile): number | null {
  if (ex.bodyweight || ex.baseKg == null) return null;
  const bw = profile.weightKg ?? 75;
  const exp = EXP_FACTOR[profile.experience ?? 'beginner']; // unknown → conservative
  const bwFactor = ex.bwScaled ? clamp(bw / 75, 0.7, 1.45) : 1;
  const sexFactor = profile.sex === 'female' ? (UPPER.includes(ex.capability) ? 0.62 : 0.72) : 1;
  let kg = ex.baseKg * bwFactor * sexFactor * exp * ageLoadFactor(profile.age);
  // Round to a loadable increment; barbell compounds never below an empty bar.
  // Founder: 1 kg steps everywhere (finer + more accurate than 2.5 — 80 → 81, not 82.5).
  const step = 1;
  kg = Math.round(kg / step) * step;
  if (ex.equipment === 'barbell' && ex.tier === 'compound') kg = Math.max(kg, 20);
  return Math.max(kg, step);
}
