/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH'S KEY POINTS FOR THIS WORKOUT — gathered, deduplicated, in the order she meets them.
 *
 * ⛔ FOUNDER, 2026-08-02, rejecting my fix and replacing it with a better one:
 *
 *   > *"Can't we add a KEY POINTS button on the workout screen — tapping it explains the points and
 *   > why? That sounds far smarter to me than loading up the workout screens. For cardio and for
 *   > strength both."*
 *
 * ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────────────────────────────
 * The coach writes a `say` on an item — "one rep short of failure", "hold the top for a beat" — and
 * it filled inconsistently: 15/15 and 12/12 on the intake calls, 0/7 on the post-session one. My
 * proposal was to make it REQUIRED in the schema so the model could not omit it.
 *
 * That fix was aimed at the wrong thing. Forcing a sentence per lift does not make the sentence
 * worth reading — it makes forty words appear on a stage whose entire job is "do this set", which is
 * the ruling he had already given me once ("someone mid-workout cannot read much text on screen").
 * And over-instructing this model is the documented cause of the worst regression this project has
 * had: a longer preamble produced a one-exercise week.
 *
 * ── WHAT THIS DOES INSTEAD ──────────────────────────────────────────────────────────────────────
 * The words stop competing with the set. Everything the coach wrote about this workout collects
 * behind ONE control, read when she wants it and silent when she does not — so an inconsistent
 * `say` degrades into a shorter list rather than into a blank space where a promise used to be.
 *
 * ⚠️ AND THE CONTROL IS ABSENT WHEN THE LIST IS EMPTY. A key-points button that opens onto nothing
 * teaches her not to press it, which costs more than never having offered it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { Step } from '@/state/stores/sessionStore';
import type { PlannedItem } from './coachPlan';

/** One thing the coach wants her to know, and the exercise it is about. */
export interface Emphasis {
  /** The exercise it belongs to — the caller names it, because naming is the copy layer's job. */
  ex: string;
  /** The coach's own sentence, verbatim. Never ours, never assembled from parts. */
  say: string;
}

/** The `say` on an item, whatever shape the item is — all four carry one. */
function sayOf(item: PlannedItem | undefined): string | null {
  const say = item?.say?.trim();
  return say ? say : null;
}

/**
 * What the coach wrote about the workout in front of her.
 *
 * ONE ENTRY PER EXERCISE, in plan order. Six 400 m repeats are six steps carrying the same sentence;
 * printing it six times would turn the sheet into wallpaper and bury the two lines that differ.
 * First occurrence wins — if the coach genuinely wrote something different for a later round, that
 * is a case this deliberately does not serve, because the sheet is a briefing and not a transcript.
 */
export function emphasesOf(plan: Step[]): Emphasis[] {
  const out: Emphasis[] = [];
  const seen = new Set<string>();
  for (const step of plan) {
    const say = sayOf(step.item);
    if (!say || seen.has(step.exerciseId)) continue;
    seen.add(step.exerciseId);
    out.push({ ex: step.exerciseId, say });
  }
  return out;
}
