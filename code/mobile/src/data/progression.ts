/**
 * Capability Portrait, computed from the athlete's real logged history.
 *
 * (The legacy double-progression `prescribe()` that once lived here was the rollback engine for
 * the v4 migration; it was removed on 2026-06-24 once v4 became the sole engine — the v4 engine
 * in `src/engine/v4` is now the single source of every prescription. Recoverable from git.)
 */
import { exercisesForCapability } from './exercises';
import type { Capability, PortraitSnapshot, Profile, Session } from './local/models';

// ─────────────────────── Capability Portrait, computed from real history ───────────────────────
// The Portrait's bars are RELATIVE strength (0–1) per capability: the athlete's best estimated
// 1RM (Epley) on that capability's lifts, against a sex/bodyweight-scaled "strong" benchmark.
// Confidence rises with how many sessions of real data back the bar; below 30 the bar is "still
// learning" (an experience-based prior until the athlete's own lifts speak). Pure & I/O-free.
const PORTRAIT_CAPS: Capability[] = [
  'horizontal_push', 'horizontal_pull', 'vertical_push', 'knee_dominant', 'hip_dominant',
];
const UPPER_CAPS = new Set<Capability>(['horizontal_push', 'horizontal_pull', 'vertical_push']);
// "Full-bar" benchmark as a multiple of bodyweight (intermediate-strong male reference).
const STANDARD_RATIO: Record<Capability, number> = {
  horizontal_push: 1.3, horizontal_pull: 1.1, vertical_push: 0.8, knee_dominant: 1.8, hip_dominant: 2.2,
};
const SEED_BAR: Record<string, number> = { beginner: 0.2, intermediate: 0.35, advanced: 0.5 };

const epley1rm = (w: number, r: number): number => w * (1 + r / 30);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export function computePortrait(
  history: Session[],
  profile: Pick<Profile, 'sex' | 'weightKg' | 'experience'>,
): Omit<PortraitSnapshot, 'timestamp'> {
  const bw = profile.weightKg ?? 75;
  const female = profile.sex === 'female';
  const seedBar = SEED_BAR[profile.experience ?? 'beginner'] ?? 0.2;
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
        if (!exIds.has(set.exerciseId) || set.actualWeight == null) continue;
        best = Math.max(best, epley1rm(set.actualWeight, set.actualReps));
        touched = true;
      }
      if (touched) sessionsTouched.add(session.id);
    }
    const sexF = female ? (UPPER_CAPS.has(cap) ? 0.62 : 0.72) : 1;
    const benchmark = bw * STANDARD_RATIO[cap] * sexF;
    const hasData = best > 0 && benchmark > 0;
    const bar = hasData ? clamp01(best / benchmark) : seedBar;
    const conf = hasData ? Math.min(95, sessionsTouched.size * 12) : 10;
    perCapability[cap] = Math.round(bar * 100) / 100;
    confidence[cap] = conf;
    stillLearning[cap] = conf < 30;
  }
  return { perCapability, confidence, stillLearning };
}
