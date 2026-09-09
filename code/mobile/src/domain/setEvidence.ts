/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A PRESUMED SET IS NO NEWS.
 *
 * ⛔ FOUNDER, 2026-09-07, approving the plan that turns the session from a diary into a coach:
 * the set is presumed done as written, the phone stays in the pocket, and input is asked for only
 * on a deviation. The session CLOCK writes those sets (`sessionStore.presumeSet`), and every set
 * it writes carries `presumed: true`.
 *
 * ── TWO QUESTIONS EVERY READER OF A SET LOG MUST NOW ASK SEPARATELY ──────────────────────────────
 *
 *   · **Was she there?** — `isWorkSet`. A presumed set says YES: the clock only runs while a
 *     session is open, and the plan passed through this set. Completion counts, "did she train
 *     this lift", the week's DONE chip, the mirror's "3 of 4 done", the Loop 3 volume ledger — all
 *     of these are about presence, and a presumed set is present.
 *
 *   · **What did she lift?** — `isEvidenceSet`. A presumed set says NOTHING: its `actualReps` and
 *     `actualWeight` are the PRESCRIPTION copied across, and the prescription is the engine's own
 *     output. Reading it as performance is the engine grading its own homework: Loop 2 would find
 *     every set exactly on the band floor and raise the load every occurrence for ever
 *     (`loop2.ts` — `allMet`), the deload could never see a miss, the rail L11 would collapse back
 *     to "the number on the bar", and the twelve-week chart would draw the prescription curve.
 *
 * ⛔ SO THE MARK IS AN ENGINE MARK, IN THE `isWarmup` / `isApproach` FAMILY. It is never a set type
 * she authors (models.ts, 2026-08-24: "the programme decides what a set IS"); it is the app saying
 * "I wrote this one myself". It is REMOVED — never flipped to a second flag — the moment she gives
 * her word: "as written" on the lift's transition rest clears every presumed set of that lift, and
 * a correction to any one set clears the others (an answered ask covers the lift). A set with no
 * mark is a set she stood behind, whichever surface she said so on.
 *
 * ── WHAT A PRESUMED SET NEVER CARRIES ───────────────────────────────────────────────────────────
 * No `restBeforeS`: the clock started the rest, not her, so there is nothing to measure and the
 * type's "absent means unknown" (L3) does the rest. `persistedAt` is the clock's instant, which is
 * roughly when she did it — good enough for a session's span, never for her execution time
 * (`setDwell.learnedExecSFor` skips these too).
 *
 * ── AND WHAT "AS WRITTEN" CARRIES WITH IT: THE REST THE CLOCK RAN ───────────────────────────────
 * When she stands behind a lift, the sets get the rest the clock prescribed and enforced between
 * them, stamped as `restBeforeS`. Her word covers the lift AS IT WAS RUN — sets and rests — and the
 * clock did run those rests (it buzzed her wrist at the end of each one). This was measured in, not
 * assumed (the `aPresumedSetIsNoNews` simulation, 2026-09-08, retired with the automatic set on
 * 2026-09-09 — nothing writes the mark any more; records from builds 64–71 still carry it): without
 * the stamp the confirmed athlete's F-13 slope
 * never fits and the time budget never learns her pace, and the engine ran her at load/cap 1.017
 * against the diary athlete's 0.943 — 56% of her sets under the band. With it, 0.976 and the diary's
 * own accuracy. A set she CORRECTS keeps its stamp too: the rest before it was the clock's either way.
 *
 * Pure. Two predicates, so no reader ever has to remember which marks exist.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
//

/** The marks a reader has to know about, on any shape that carries them. */
export interface SetMarks {
  /** Not a working set (warm-up bridge, legacy approach set) — excluded from everything. */
  isApproach?: boolean;
  /** Written by the session clock, not by her — present, but not evidence. */
  presumed?: boolean;
}

/** Was she there? A working set of any provenance — hers, or the clock's on her behalf. */
export function isWorkSet(s: SetMarks): boolean {
  return !s.isApproach;
}

/** What did she lift? Only a set she stood behind answers. */
export function isEvidenceSet(s: SetMarks): boolean {
  return !s.isApproach && !s.presumed;
}
