/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SHE TOLD THE COACH, WRITTEN INTO HER RECORD.
 *
 * The intake asks for her bodyweight and her days IN CONVERSATION, because nothing else in the app
 * ever will — that is the prompt's own promise to the coach. This is the rule for what happens to
 * the answer: which fields move, which one is written once and never again, and when nothing should
 * be written at all.
 *
 * It is a function rather than a few lines inside the store for the reason every rule here is:
 * the store cannot be mounted in a test without a backend, a model client and the notification
 * layer, so a rule that lives inside it is a rule nobody checks.
 *
 * Pure. Returns the profile to save, or null when the record already says all of it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { Profile } from '@/data/local/models';
import type { LearnedAboutHer } from './coachPlan';

/** Which fields a learned turn actually MOVED — for the caller's telemetry, and for the tests. */
export type LearnedChange = keyof LearnedAboutHer;

export interface AppliedLearning {
  profile: Profile;
  changed: LearnedChange[];
}

/**
 * Fold what she stated into her profile.
 *
 * ⚠️ NOTHING IS WRITTEN WHEN NOTHING MOVED. The coach reports what she said on the turn she says
 * it, and it says the same thing again whenever the conversation returns to it ("you're 62, so…").
 * Writing on every turn would be a storage write and a re-render to tell the profile what it
 * already holds — and, through the store, a `PROFILE_UPDATED` that re-runs every screen reading it.
 *
 * ⚠️ AND `startWeightKg` IS AN ANCHOR, NOT A CURRENT VALUE. The milestone ladders are cut from it
 * and her weight trend is measured against it, so it is written once — at the first weight anybody
 * ever hears — and never again. Re-anchoring it on each new figure would make the ladders follow
 * her down the scale and every trend read flat. An athlete who gave a weight at signup already has
 * one; the coach's first number only anchors when there is nothing there.
 */
export function applyLearned(profile: Profile, learned: LearnedAboutHer): AppliedLearning | null {
  const changed: LearnedChange[] = [];
  if (learned.weightKg != null && learned.weightKg !== profile.weightKg) changed.push('weightKg');
  if (learned.daysPerWeek != null && learned.daysPerWeek !== profile.daysPerWeek) changed.push('daysPerWeek');
  if (learned.minutes != null && learned.minutes !== profile.workoutMinutes) changed.push('minutes');
  if (changed.length === 0) return null;

  const next: Profile = {
    ...profile,
    ...(changed.includes('weightKg') ? { weightKg: learned.weightKg } : {}),
    ...(changed.includes('daysPerWeek') ? { daysPerWeek: learned.daysPerWeek! } : {}),
    ...(changed.includes('minutes') ? { workoutMinutes: learned.minutes } : {}),
    ...(changed.includes('weightKg') && profile.startWeightKg == null
      ? { startWeightKg: learned.weightKg }
      : {}),
  };
  return { profile: next, changed };
}
