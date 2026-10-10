/**
 * When does a session COUNT as the week's workout? (founder decision 2026-07-11)
 *
 * There are three honest tiers of "I didn't finish it", and Hush treats each differently.
 * The ENGINE, meanwhile, needs no tier at all — it is already per-slot: a lift you trained
 * progresses from the sets you actually logged, and a lift you skipped simply HOLDS (no
 * progress, no punishment — the adherence deload stays off). So the only product question is
 * whether the WORKOUT is finished for the week:
 *
 *   NOT STARTED — zero sets logged. Not a workout: nothing is saved, nothing is counted,
 *     the workout stays on the week's list. (Handled at finalize; see sessionStore.)
 *
 *   PARTIAL — fewer than HALF the prescribed work sets. The work is REAL: it is saved to
 *     History (marked "ended early") and the engine folds every set that was performed. But
 *     the workout is NOT finished — it stays on the week's list so the athlete can come back
 *     and train it properly. One exercise out of six is not a session.
 *
 *   TRAINED — half the prescribed work sets or more. The workout is DONE for the week: it
 *     leaves the list, Home advances to the next one, and the engine folds the performed sets
 *     (the lifts that were skipped hold, exactly as with any untrained slot).
 *
 * Pure + I/O-free: the same rule gates the live finalize AND the boot/regeneration heal, so a
 * partial session can never be silently promoted to "done" by a later reconciliation.
 */

// 

import type { ProgramDay, Session } from '@/data/local/models';

/** The fraction of a workout's prescribed work sets that makes it a TRAINED session. */
export const WORKOUT_TRAINED_FRACTION = 0.5;

/** Prescribed work sets for a workout (supplemental core included — it is prescribed work). */
export function prescribedSets(day: ProgramDay): number {
  return day.slots.reduce((n, s) => n + (s.setCount ?? 0), 0);
}

/**
 * Does `setsLogged` finish `day` for the week? True at or above half the prescribed sets.
 * A day whose prescription is unknown (no slots — e.g. a session recorded against a program
 * that has since changed shape) counts on any logged work: never strand an athlete's session
 * in limbo because the plan moved under it.
 */
export function workoutTrained(setsLogged: number, day: ProgramDay | undefined | null): boolean {
  if (setsLogged <= 0) return false;
  const prescribed = day ? prescribedSets(day) : 0;
  if (prescribed <= 0) return true;
  return setsLogged >= Math.ceil(prescribed * WORKOUT_TRAINED_FRACTION);
}

/**
 * The same question, asked of a saved session.
 *
 * `session.prescribed` is stamped at START and is preferred over any lookup: it is what she was
 * actually asked to do, by whoever asked, and it cannot drift when the programme changes shape
 * underneath her. It is also the ONLY answer for a coach session, which has no `ProgramDay` to look
 * up — and the fallback for an unknown prescription is "any logged work counts", which would have
 * let one set finish a workout, burn a free trial session and close the week's slot.
 */
export function sessionTrained(session: Session, day: ProgramDay | undefined | null): boolean {
  /*
   * WHAT SHE DID IS EVERY STEP SHE DID, NOT EVERY SET.
   *
   * `prescribed` counts the steps she was asked for, and a coach's session counts intervals, holds
   * and carries among them. Measuring the answer in `sets` alone compared two different units: an
   * interval session finished to the last repeat logged ZERO sets against a prescription of
   * fourteen, so a completed workout read as abandoned — no credit, still on the week's list.
   *
   * `items` is the canonical record and holds every shape (a reps step is written to both), so it
   * is the count whenever it exists. `sets` remains the answer for every session written before it
   * did, and for an engine-built plan, which is reps by construction.
   */
  /*
   * ⚠️ WORKING SETS ONLY (2026-08-24). `prescribed` counts working sets — the warm-up ramp is not
   * in it — so the performed side must draw the same line: four logged warm-up bridges must never
   * carry a six-set session over a ten-set threshold. `isApproach` is that line everywhere.
   */
  /*
   * ⛔ A PRESUMED SET COUNTS ONLY UNDER HER WORD (2026-09-07 — the session runs itself).
   *
   * The clock writes sets she never touched (`presumed`, see `domain/setEvidence`). Whether those
   * count toward "she trained the workout" — and therefore toward the free-trial burn, the week's
   * DONE chip, the Health write and the workout-count milestones — is decided by the one signal
   * the clock cannot fake: she said she was done (`Session.finishedByAthlete`). Under her word,
   * every set the plan passed through is hers. Without it — a salvage, a session abandoned in a
   * locker — only the sets she actually stood behind are counted. The same rule for `items`, which
   * mirror the mark.
   */
  const underHerWord = session.finishedByAthlete === true;
  const done = session.items
    ? session.items.filter((i) => i.kind !== 'reps' || !i.presumed || underHerWord).length
    : session.sets.filter((x) => !x.isApproach && (!x.presumed || underHerWord)).length;
  if (session.prescribed != null && session.prescribed > 0) {
    return done >= Math.ceil(session.prescribed * WORKOUT_TRAINED_FRACTION);
  }
  return workoutTrained(done, day);
}
