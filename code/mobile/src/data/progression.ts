/**
 * Capability Portrait, computed from the athlete's real logged history.
 *
 * (The legacy double-progression `prescribe()` that once lived here was the rollback engine for
 * the v4 migration; it was removed on 2026-06-24 once v4 became the sole engine — the v4 engine
 * in `src/engine/v4` is now the single source of every prescription. Recoverable from git.)
 */

// 

import { exercisesForCapability } from './exercises';
import { isEvidenceSet } from '@/domain/setEvidence';
import { FEMALE_UPPER_FACTOR, FEMALE_LOWER_FACTOR } from '@/domain/startingLoad';
import type { Capability, PortraitSnapshot, Profile, Session } from './local/models';

// ─────────────────────── Capability Portrait, computed from real history ───────────────────────
// The Portrait's bars are RELATIVE strength (0–1) per capability: the athlete's best estimated
// 1RM (Epley) on that capability's lifts, against a sex/bodyweight-scaled "strong" benchmark.
// Confidence rises with how many sessions of real data back the bar; below 30 the bar is "still
// learning" (a neutral prior until the athlete's own lifts speak). Pure & I/O-free.
//
// `experience` is GONE from here too (2026-07-21) — it was the last self-report still deciding
// anything in the product. The register (Part 9 §A) deleted it from every decision path; this was
// display-only, but a prior that moves with what she once called herself is still a guess wearing a
// bar. With no data the bar is one neutral prior; her own lifts replace it within sessions.
const PORTRAIT_CAPS: Capability[] = [
  'horizontal_push', 'horizontal_pull', 'vertical_push', 'knee_dominant', 'hip_dominant',
];
const UPPER_CAPS = new Set<Capability>(['horizontal_push', 'horizontal_pull', 'vertical_push']);
// "Full-bar" benchmark as a multiple of bodyweight (intermediate-strong male reference).
const STANDARD_RATIO: Record<Capability, number> = {
  horizontal_push: 1.3, horizontal_pull: 1.1, vertical_push: 0.8, knee_dominant: 1.8, hip_dominant: 2.2,
};
/** The no-data prior — one value for everyone (matches the cold start, which assumes the same). */
const SEED_BAR = 0.35;

const epley1rm = (w: number, r: number): number => w * (1 + r / 30);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export function computePortrait(
  history: Session[],
  profile: Pick<Profile, 'sex' | 'weightKg'>,
): Omit<PortraitSnapshot, 'timestamp'> {
  const bw = profile.weightKg ?? 75;
  const female = profile.sex === 'female';
  const perCapability = {} as Record<Capability, number>;
  const confidence = {} as Record<Capability, number>;
  const stillLearning = {} as Record<Capability, boolean>;

  for (const cap of PORTRAIT_CAPS) {
    const exIds = new Set(exercisesForCapability(cap).map((e) => e.id));
    let best = 0;
    const sessionsTouched = new Set<string>();
    for (const session of history) {
      let touched = false;
      for (const set of session.sets) {
        if (!exIds.has(set.exerciseId) || set.actualWeight == null || !isEvidenceSet(set)) continue;
        best = Math.max(best, epley1rm(set.actualWeight, set.actualReps));
        touched = true;
      }
      if (touched) sessionsTouched.add(session.id);
    }
    // The SAME female factors the cold start uses (one opinion in this product about relative
    // strength) — calibrated against population data: ≈52% upper / ≈66% lower (see startingLoad).
    const sexF = female ? (UPPER_CAPS.has(cap) ? FEMALE_UPPER_FACTOR : FEMALE_LOWER_FACTOR) : 1;
    const benchmark = bw * STANDARD_RATIO[cap] * sexF;
    const hasData = best > 0 && benchmark > 0;
    const bar = hasData ? clamp01(best / benchmark) : SEED_BAR;
    const conf = hasData ? Math.min(95, sessionsTouched.size * 12) : 10;
    perCapability[cap] = Math.round(bar * 100) / 100;
    confidence[cap] = conf;
    stillLearning[cap] = conf < 30;
  }
  return { perCapability, confidence, stillLearning };
}
