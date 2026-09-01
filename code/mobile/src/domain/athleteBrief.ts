/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ATHLETE BRIEF — what a conversation leaves behind.
 *
 * The third of the three things being replaced rather than worked around: onboarding stops being
 * seven screens of forms and becomes a conversation with the coach. The founder's framing is the
 * specification:
 *
 *   > *"Imagine someone opens a chat and asks you to build them a programme so they can finish a
 *   > marathon. What do you do? You ask them for what you need."*
 *
 * A form asks everyone the same eight questions. A coach asks what matters for THEIR answer — said
 * football, so which position, how many games a week, in season or out; said "lose weight", so what
 * have you tried and what do you actually enjoy. That cannot be a form, and this is not one.
 *
 * ── SO WHY IS THERE A STRUCTURE AT ALL ──────────────────────────────────────────────────────────
 * Because a conversation that leaves nothing behind has to be re-read in full on every later call —
 * expensive, and fragile. Two things are kept, and the split matters:
 *
 *   · `needs`  — the handful of facts the APP itself renders or computes with. Days a week, minutes
 *                a session, units, bodyweight. These are not the coach's opinion; screens read them.
 *   · `brief`  — the coach's own summary of everything else, in its own words. Her goal, her
 *                history, her injuries, what she likes, what she refuses. NOT parsed, NOT validated,
 *                NOT rendered. It travels back to the coach on every call and nothing else reads it.
 *
 * The second is deliberately unstructured. The moment this file defines an enum of goals, it has
 * re-created the four-button picklist that threw away "I want to be a better footballer" and "I have
 * a wedding in four months" by flattening both to `general_fitness`. **Whatever the coach thought
 * worth remembering is worth remembering, in the words it chose.**
 *
 * ── WHAT IS NOT HERE, ON PURPOSE ────────────────────────────────────────────────────────────────
 * No experience level (a self-report the engine was right to delete), no goal enum, no "training
 * age", no computed score. Nothing this file stores is derived from anything — it is testimony and
 * a few measurements, and every conclusion drawn from it belongs to the coach.
 *
 * Pure and I/O-free.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

// 

import type { Units } from '@/data/local/models';

export const ATHLETE_BRIEF_VERSION = 1;

/**
 * The facts the APP needs to function — the whole list, and it is short on purpose.
 *
 * Every one of these is read by a screen or by the record itself. Anything a screen does NOT read
 * belongs in `brief`, where it stays in the coach's words instead of being flattened into a field
 * nobody chose the shape of.
 */
export interface BriefNeeds {
  /** How many sessions a week she is planning for. Home, the week view and the roll all read it. */
  daysPerWeek: number;
  /** Minutes she has for one session — the only ceiling the app itself enforces. */
  minutes: number;
  /** kg or lb. Every load on every screen. */
  units: Units;
  /** Bodyweight, for the plate maths' bodyweight lifts and for the record. Absent if she declined. */
  weightKg?: number;
  /** Written once at intake and never edited — the milestone ladders are cut from it. */
  sex?: 'male' | 'female';
}

export interface AthleteBrief {
  v: number;
  needs: BriefNeeds;
  /**
   * The coach's own account of who this athlete is and what they asked for.
   *
   * Never parsed and never shown. It is the coach's memory of the conversation, written by the
   * coach for the coach, and it travels back on every call. Its shape is whatever the coach found
   * worth keeping — that is the entire point of not making it a form.
   */
  brief: string;
  /** ISO instant the intake conversation closed. */
  at: string;
}

/*
 * ⛔ `missingFrom` AND `briefIsComplete` WERE DELETED HERE, 2026-08-03.
 *
 * They answered "can the app render a programme yet?" from the three numbers an intake conversation
 * had gathered — and nothing in `src` had called either for weeks. `domain/coachRequirements` is
 * where that question lives now, against a profile rather than against a conversation, and it is the
 * one onboarding and the laws both read.
 *
 * ⚠️ A public function with no caller is not harmless: it reads as a supported seam, and the next
 * person wires a screen to it instead of to the thing that is actually maintained. Same reason
 * `theilSenSlope` and `OptStack` were flagged in earlier sweeps.
 */

/**
 * The bounds the APP enforces on the numbers it renders with, and nothing more.
 *
 * A week has seven days and a session cannot run for a negative number of minutes. These are facts
 * about calendars and clocks, not opinions about training — the coach may prescribe two sessions a
 * week or six, of twenty minutes or of ninety, and this has nothing to say about any of it.
 *
 * Out-of-range values are CLAMPED rather than rejected, because rejecting would mean the intake
 * conversation failed over a typo and the athlete starts again.
 */
export function clampNeeds(needs: BriefNeeds): BriefNeeds {
  return {
    ...needs,
    daysPerWeek: Math.min(7, Math.max(1, Math.round(needs.daysPerWeek))),
    minutes: Math.min(240, Math.max(10, Math.round(needs.minutes))),
  };
}

/**
 * Build the brief a completed conversation leaves behind.
 *
 * Written by hand, field by field, for the same reason `coachFacts` is: this object is stored and
 * sent, and a spread of whatever the conversation happened to accumulate would ship it all.
 */
export function athleteBrief(input: { needs: BriefNeeds; brief: string; at: string }): AthleteBrief {
  return {
    v: ATHLETE_BRIEF_VERSION,
    needs: clampNeeds({
      daysPerWeek: input.needs.daysPerWeek,
      minutes: input.needs.minutes,
      units: input.needs.units,
      ...(input.needs.weightKg != null ? { weightKg: input.needs.weightKg } : {}),
      ...(input.needs.sex ? { sex: input.needs.sex } : {}),
    }),
    brief: input.brief,
    at: input.at,
  };
}
