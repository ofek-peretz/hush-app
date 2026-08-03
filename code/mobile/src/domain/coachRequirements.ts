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
 * ⛔ HEIGHT IS DELIBERATELY ABSENT. The founder asked whether it would sharpen the starting loads:
 * it does not. What predicts a starting load is bodyweight, sex and experience — height changes the
 * range of motion, and no model turns centimetres into kilograms. A screen that costs a step and
 * buys nothing measurable is a screen that should not exist.
 *
 * ⛔ EQUIPMENT IS ABSENT TOO, on his scope call: *"not critical, let's focus on people in the gym
 * only for now, and expand from there if this works smoothly."* A full gym is the assumption.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { Profile } from '@/data/local/models';

/** One fact the coach cannot work without, and the reason it is on this list. */
export interface CoachRequirement {
  key: 'sex' | 'weightKg' | 'age' | 'experience' | 'daysPerWeek' | 'workoutMinutes';
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
  {
    key: 'age',
    /*
     * Not a number the coach applies a formula to — it is context it reasons with. What recovers in
     * two days at twenty-five takes three at fifty-five, and a coach that does not know which one it
     * is talking to writes the same week for both.
     */
    why: 'how fast she recovers, which is the difference between four sessions a week and three',
  },
  {
    key: 'experience',
    /*
     * The single biggest input to a STARTING load. Everything after week one is measured, but week
     * one is a guess, and this is what makes it an educated one instead of a coin toss.
     */
    why: 'the starting loads, which are the only ones the coach has no measurement for',
  },
  {
    key: 'daysPerWeek',
    /*
     * ⛔ THIS WAS NOT A REQUIREMENT UNTIL THE FOUNDER PUT IT HERE, 2026-08-03 — and his earlier
     * ruling looked like the opposite: he caught the app handing the coach a placeholder 4 and
     * watched it decide his week unasked, *"without asking."*
     *
     * The two are not in conflict, and the distinction is worth keeping: what he objected to was the
     * APP INVENTING a number and presenting it as fact. Asking HER is the opposite of that. A
     * placeholder is a lie; a question is a question.
     */
    why: 'the shape of the week — and it must be HER answer, never a placeholder the app invented',
  },
  {
    key: 'workoutMinutes',
    /*
     * ⛔ FOUNDER, 2026-08-03: *"session length — I don't know how critical it is, most people like
     * 45–60 minutes."* It is critical, and there is evidence: he was handed a six-exercise session
     * the app called 35 minutes. The coach cannot size a session against a budget nobody told it.
     */
    why: 'how much fits in a session — six exercises or four is this number and nothing else',
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
    // Every numeric requirement has the same failure mode: a 0 that means "nobody asked" rather
    // than a real answer. `daysPerWeek` is the one the founder actually caught, as a placeholder.
    if (r.key === 'weightKg' || r.key === 'age' || r.key === 'daysPerWeek' || r.key === 'workoutMinutes') {
      return typeof v !== 'number' || !Number.isFinite(v) || v <= 0;
    }
    return v == null;
  }).map((r) => r.key);
}

/** Everything the coach needs is on the sheet. */
export function readyForCoach(profile: Profile | null | undefined): boolean {
  return missingForCoach(profile).length === 0;
}
