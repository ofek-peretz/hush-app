/**
 * ⛔ A WORKOUT CAME HOME FROM THE WRIST — SEND THE WRIST ITS NEXT WEEK (2026-10-17, the wrist-alone
 * plan, stage 5).
 *
 * The plan the wrist runs alone is built on Today (`Home`), and only while Today is the screen in
 * front of her: a record that came home while she was on another tab — or with the phone in a bag —
 * left her wrist holding the old week: the finished workout still offered, last time's reps a
 * workout behind, until she happened to open Today again. That is gap 7 of the wrist-alone audit.
 *
 * The session store says so here the moment a wrist record is answered, and Today rebuilds the plan
 * whether or not it is the screen she is looking at. Nothing else rides this: it is a nudge, not a
 * second source of truth — what is sent is still whatever `buildCoachWatchPlan` makes of the week.
 */

const listeners = new Set<() => void>();

/** Today listens for as long as it is mounted. Returns the unsubscribe. */
export function onWatchRecordApplied(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** A wrist record was answered (applied, or acknowledged as already held). */
export function noteWatchRecordApplied(): void {
  for (const cb of [...listeners]) cb();
}
