/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE COACH MUST HAVE BEFORE IT CAN BUILD ANYTHING.
 *
 * ⛔ FOUNDER, 2026-08-03, after his first real intake on build 40:
 *
 *   > *"The coach didn't ask for my weight, and as far as I know that's critical for it. Maybe we
 *   > should put everything the coach has to use for the athlete into onboarding, and then a chat
 *   > window at the end for extra requests."*
 *
 * ── HOW THE WEIGHT WENT MISSING ─────────────────────────────────────────────────────────────────
 * Nothing was broken. `coachFacts` spreads every field conditionally —
 * `...(profile.weightKg != null ? { weightKg: profile.weightKg } : {})` — so an absent fact is
 * simply an absent line on the sheet, and no part of the app is surprised by it. The only way her
 * bodyweight ever reached the coach was if she happened to mention it in conversation.
 *
 * **A conversation cannot guarantee coverage.** That is not a flaw in the model; it is what a
 * conversation IS. A form guarantees coverage, which is the whole reason forms exist.
 *
 * ── WHAT THIS FILE IS ───────────────────────────────────────────────────────────────────────────
 * The single list of facts the coach cannot do its job without, and one function that says which of
 * them are missing. Onboarding asks for what this names; a law asserts nothing reaches the coach
 * without them. Adding a requirement is one entry here, and every surface follows.
 *
 * ── ⚠️ WHAT IS DELIBERATELY **NOT** HERE ────────────────────────────────────────────────────────
 * This is the floor, not the questionnaire. Her goal in her own words, her injuries, what she
 * refuses to do, how long she has trained — all of that belongs to the CONVERSATION, because the
 * answers are prose and a form would flatten them into checkboxes. The rule for adding something
 * here: *can the coach write a safe, honest programme without it?* If yes, it is not a requirement.
 *
 * ⛔ `daysPerWeek` is NOT here, on the founder's own ruling. He caught the app handing the coach a
 * placeholder 4 and watched it decide his week unasked: *"it decides on its own that it will do 4
 * workouts for me, without asking."* It stays a question the coach asks her, in words.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { Profile } from '@/data/local/models';

/** One fact the coach cannot work without, and the reason it is on this list. */
export interface CoachRequirement {
  key: 'sex' | 'weightKg';
  /** Why the coach cannot do its job without it — for the reader, not for the athlete. */
  why: string;
}

export const REQUIRED_FOR_COACH: readonly CoachRequirement[] = [
  {
    key: 'sex',
    /*
     * Two jobs, and the second is the one people forget. It changes the starting loads the coach
     * reasons from — and it is what makes every Hebrew sentence in the app address HER. The base
     * form is masculine, so an absent `sex` does not produce neutral copy: it produces a product
     * that calls a woman "he", on every screen, for ever.
     */
    why: 'starting loads, and the gender of every sentence she reads',
  },
  {
    key: 'weightKg',
    /*
     * A pull-up, a press-up and a dip are prescribed AGAINST it — without it the coach is guessing
     * at the load on half the catalogue. It is also the baseline every later bodyweight reading is
     * compared to (`startWeightKg`), so a profile that acquires it in week six has no week one.
     */
    why: 'bodyweight lifts are prescribed against it, and it is the baseline progress is read from',
  },
] as const;

/**
 * Which required facts this profile is missing.
 *
 * ⚠️ A profile that does not exist yet is missing ALL of them — not none. `undefined` reaching here
 * means onboarding has not run, and answering "nothing is missing" would be the exact hole this
 * file exists to close.
 */
export function missingForCoach(profile: Profile | null | undefined): CoachRequirement['key'][] {
  if (!profile) return REQUIRED_FOR_COACH.map((r) => r.key);
  return REQUIRED_FOR_COACH.filter((r) => {
    const v = profile[r.key];
    // A bodyweight of 0 is absence wearing a number — the shape `weightKg?: number` cannot say so.
    if (r.key === 'weightKg') return typeof v !== 'number' || !Number.isFinite(v) || v <= 0;
    return v == null;
  }).map((r) => r.key);
}

/** Everything the coach needs is on the sheet. */
export function readyForCoach(profile: Profile | null | undefined): boolean {
  return missingForCoach(profile).length === 0;
}
