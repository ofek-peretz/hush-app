/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE THING THE PROGRESS SCREEN SAYS.
 *
 * ⛔ FOUNDER, 2026-08-04: *"I'm not sure how much we even need the Progress screen, versus just
 * keeping the logs. Right now it looks like a banal graph with a collection of milestones — and
 * there's one for every single exercise, which nobody is ever going to open."*
 *
 * He is right, and the reason is worth naming: **the screen reports, it never claims.** Every figure
 * on it is true — lifetime tonnage, a weekly-volume area, five badges — and not one of them answers
 * the question an athlete actually opens a progress tab with: *am I getting stronger?* A screen that
 * shows six charts is asking her to do the work of concluding, and the whole promise of this product
 * is that something else already did.
 *
 * So the screen leads with an answer, and this is the answer.
 *
 * ── ⚠️ DERIVED, NEVER WRITTEN ───────────────────────────────────────────────────────────────────
 * It states what is true of the table underneath it and nothing else. A sentence that could be
 * generous — "you're making great progress" — is the one thing this product does not do (R7: it
 * shows what was measured). Three claims, each falsifiable by the rows below it, and the weakest of
 * them is the honest one for an athlete who has not gained yet.
 *
 * Pure & I/O-free: same entries in, same claim out.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import type { QuarterlyProgressEntry } from '@/domain/progressReport';

export type ProgressClaim =
  /** Every lift she has trained is heavier than its first mark. */
  | { kind: 'all'; lifts: number }
  /** Some are. The count is the claim; the table names which. */
  | { kind: 'some'; risen: number; lifts: number }
  /** None yet — the first weeks. The screen shows her starting point instead of a "+0". */
  | { kind: 'none' };

/**
 * @param entries every trained lift's first peak, best peak and current load
 * @returns the claim, or `null` when there is nothing measured at all (day one draws its own page)
 */
export function progressClaim(entries: QuarterlyProgressEntry[]): ProgressClaim | null {
  if (entries.length === 0) return null;
  /*
   * ⚠️ A REPS-MODE LIFT COUNTS. A pull-up that went from six reps to nine got stronger, and leaving
   * bodyweight movements out of the claim would tell an athlete who trains mostly on a bar that
   * nothing has happened. The kg TOTAL beside it excludes them — that figure is kilograms and their
   * gain is not — but "is it heavier than when I met it" is a question they can answer.
   */
  const risen = entries.filter((e) => e.deltaKg > 0).length;
  if (risen === 0) return { kind: 'none' };
  if (risen === entries.length) return { kind: 'all', lifts: entries.length };
  return { kind: 'some', risen, lifts: entries.length };
}

/** The copy key for a claim, so the screen never assembles a sentence out of parts. */
export function progressClaimKey(claim: ProgressClaim): string {
  return claim.kind === 'all'
    ? 'progress.claimAll'
    : claim.kind === 'some'
      ? 'progress.claimSome'
      : 'progress.claimNone';
}
