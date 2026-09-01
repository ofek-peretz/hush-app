/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE THREE FACTS ABOUT A SESSION — DERIVED ONCE, HERE, AND NOWHERE ELSE.
 *
 * A session has a duration, a tonnage, and an answer to "did that count as a workout?". Every
 * surface that shows one of the three used to work it out for itself, and they did not agree.
 *
 * DURATION — six derivations:
 *   sessionStore (at finalize) · History row · WorkoutDetail · progressAggregate · WeeklyUpdate ·
 *   shareCard.
 * Three of them read only `session.sets`. An interval or cardio-carrying session logs NO `SetLog`
 * at all — a warm-up, six 400 m repeats, a cool-down are `items` — so those three measured start
 * to start and called it zero. The athlete saw a workout read "38 min" on the Log row and "0 min"
 * on the record one tap later, and it added ZERO minutes and ZERO kcal to the lifetime "hours
 * trained" and "burned" figures. **The one fact she can never get back is the one they dropped.**
 * `History.tsx` had already fixed this for its own row and nowhere else; that fix is now this file.
 *
 * TONNAGE — eight derivations, rounding three different ways, and exactly ONE of them (the
 * lifetime aggregate) clamped a negative rep count. Same history, four different tonnes.
 *
 * "WORKOUTS COMPLETED" — five derivations, filtering variously on `trained !== false`, on
 * `sets.length > 0`, and on `items`. The Log header, the band above it and the milestone unlocked
 * from that same history were three different integers for one athlete.
 *
 * ⚠️ ONE OF THOSE FIVE WAS NOT A DUPLICATE, AND IT STAYS. "Is there performed work here?"
 * (`sessionHasLoggedWork` — what belongs in the ledger, partials included, founder 2026-07-10) is
 * a different question from "did this finish the week's workout?" (`sessionCountsAsWorkout`). The
 * Log lists the first and must count what it lists; a milestone counts the second. Two predicates,
 * both named, so the distinction is deliberate instead of accidental.
 *
 * Pure and TOTAL. Every function here answers for a session with only `items`, a session with only
 * `sets`, a session with neither, a set with negative or missing reps, and a null weight. No throw,
 * no NaN, no undefined — a mirror that crashes on an odd record is worse than one that reports a
 * zero.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import type { Session, SetLog } from '@/data/local/models';
import { sessionKcal } from '@/domain/energy';

/** A parsed instant, or null when the stamp is missing or unparseable. Never NaN downstream. */
function at(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? null : n;
}

/**
 * Wall-clock ms from the session's start to the LAST thing she did in it.
 *
 * ⚠️ THE LAST STAMP, ACROSS BOTH RECORDS. `sets[].persistedAt` and `items[].at` are two views of
 * one session and either can hold the final one: a plain lifting session has only sets, a coach's
 * interval session has only items, and a mixed one has both. Reading either alone measured half a
 * workout — or, for an interval session, none of it.
 *
 * ⚠️ MAX, NOT "THE LAST ELEMENT". A resumed session appends in write order, not in time order.
 *
 * 0 when there is nothing stamped — an honest zero, never a negative and never a NaN.
 */
export function sessionDurationMs(s: Session | null | undefined): number {
  const start = at(s?.startedAt);
  if (start == null) return 0;
  let end = start;
  for (const x of s?.sets ?? []) {
    const t = at(x?.persistedAt);
    if (t != null && t > end) end = t;
  }
  for (const i of s?.items ?? []) {
    const t = at(i?.at);
    if (t != null && t > end) end = t;
  }
  return Math.max(0, end - start);
}

/** The same span in whole seconds — what the minutes rule (`domain/duration`) is fed. */
export function sessionDurationSec(s: Session | null | undefined): number {
  return Math.round(sessionDurationMs(s) / 1000);
}

/**
 * Kilograms moved in this session: Σ weight × reps over its logged sets.
 *
 * ⛔ SETS ONLY, AND THAT IS NOT THE `items` BUG REPEATING. A `reps` item is written in the SAME
 * breath as its `SetLog` (`itemResultOf` in sessionStore — "one write, both views"), so summing
 * both would count every rep twice. The shapes that live only in `items` — a plank, a 400 m
 * repeat, a carry — have no tonnage to add: a hold is not zero kilograms, it is not kilograms.
 *
 * ⚠️ NEGATIVE AND MISSING REPS ARE CLAMPED. Only the lifetime aggregate ever did this; everywhere
 * else a corrupt row could subtract from her total. A null weight is bodyweight → 0 kg moved.
 */
export function sessionTonnageKg(s: Session | null | undefined): number {
  let kg = 0;
  for (const x of s?.sets ?? []) {
    // Working sets only (2026-08-24): a warm-up bridge and a legacy approach set both carry
    // `isApproach`, and neither is the work her tonnage celebrates — the same line every engine
    // reader draws. Kilograms she moved warming up prepare the number; they are not the number.
    if (x?.isApproach) continue;
    const w = typeof x?.actualWeight === 'number' && Number.isFinite(x.actualWeight) ? x.actualWeight : 0;
    const reps = typeof x?.actualReps === 'number' && Number.isFinite(x.actualReps) ? Math.max(0, x.actualReps) : 0;
    kg += w * reps;
  }
  return kg;
}

/** Kilograms moved across a whole history — the same clamp, once, for every caller. */
export function totalTonnageKg(sessions: readonly Session[] | null | undefined): number {
  let kg = 0;
  for (const s of sessions ?? []) kg += sessionTonnageKg(s);
  return kg;
}

/** Tonnes from kilograms, to one decimal — the app's tonnage reading. Display rounding on top. */
export function tonnesFromKg(kg: number): number {
  return Number.isFinite(kg) ? +(kg / 1000).toFixed(1) : 0;
}

/**
 * Did she actually DO something in this session? The ledger's question.
 *
 * ⚠️ IT ASKED ONLY ABOUT SETS. A session of intervals and holds logs no `SetLog`, so a workout she
 * finished to the last repeat — saved, counted as trained, sent to the coach — never appeared in
 * her Log at all, and the share card's week skipped it too.
 *
 * True for a PARTIAL as well: she lifted it, so it is a record. See `sessionCountsAsWorkout` for
 * the other, narrower question.
 */
export function sessionHasLoggedWork(s: Session | null | undefined): boolean {
  // A session whose only logs are warm-up bridges (`isApproach`) is a workout she walked away
  // from before the work began — not a record (2026-08-24, same line as tonnage above).
  return (s?.sets?.some((x) => !x?.isApproach) ?? false) || (s?.items?.length ?? 0) > 0;
}

/**
 * Does this session count as ONE COMPLETED WORKOUT? The counting question — the "N/M workouts"
 * band, the lifetime "workouts" figure, the workout-count milestones.
 *
 * `trained` is stamped at save (`domain/completion.sessionTrained`) so the verdict is durable and
 * cannot drift when the programme changes shape underneath her. Absent ⇒ counted: sessions saved
 * before the rule finished their workout under the old law.
 *
 * ⚠️ AND IT MUST HOLD REAL WORK. `trained !== false` alone counted an empty shell — a session row
 * with no sets and no items — as a whole workout, which is how the milestone and the Log header
 * came apart in the first place.
 */
export function sessionCountsAsWorkout(s: Session | null | undefined): boolean {
  return sessionHasLoggedWork(s) && s?.trained !== false;
}

/** Completed workouts in a history — one integer, for every reader that asks. */
export function completedWorkouts(sessions: readonly Session[] | null | undefined): number {
  let n = 0;
  for (const s of sessions ?? []) if (sessionCountsAsWorkout(s)) n += 1;
  return n;
}

/**
 * THE session's calories. One door (`domain/energy.sessionKcal`) over one duration (above).
 *
 * The door already settled measured-vs-estimated; what it could not settle was the SPAN each
 * caller priced. A surface reading a sets-only duration billed an interval session at zero kcal
 * while the row beside it billed the same session at 38 minutes' worth.
 *
 * null still means null — no bodyweight, no number, never a guessed body.
 */
export function sessionEnergyKcal(
  s: Session | null | undefined,
  weightKg: number | null | undefined,
): number | null {
  if (!s) return null;
  return sessionKcal(s, sessionDurationMs(s), weightKg);
}

/**
 * ════ A BEST IS SOMETHING SHE BEAT ════
 *
 * Per session, how many lifts beat their own prior all-time best load that day ("3 up").
 * Chronological: walk oldest → newest keeping each lift's running-best top load; a session's count
 * is the lifts whose heaviest qualifying set that day exceeded that running best. The first time a
 * lift appears is not a raise — there is nothing to beat.
 *
 * ⛔ THE LOG AND PROGRESS COUNTED DIFFERENT SETS, UNDER A COMMENT SAYING THEY MIRRORED EACH OTHER.
 * The lifetime aggregate required `actualReps >= 1`; the Log row did not. So a heavier set logged
 * at ZERO reps — a load entered and then abandoned — earned a moss "1 up" on her Log that Progress
 * never counted, and poisoned the Log's running best for every session after it. A rep she did not
 * do is not a best. One guard, one walk, one answer.
 *
 * ⚠️ A LOAD MUST BE A LOAD. A null or 0 kg entry is bodyweight, not a peak: it can neither set a
 * best nor beat one. (The Log excluded it by accident, via `?? 0`; the aggregate let a logged 0
 * seed a lift's best, which then made the athlete's first real load look like a raise.)
 *
 * Keyed by `session.id`; sessions without one are still walked, so the running best stays true.
 */
export function raisesBySession(sessions: readonly Session[] | null | undefined): Map<string, number> {
  const chron = [...(sessions ?? [])].sort((a, b) => (at(a?.startedAt) ?? 0) - (at(b?.startedAt) ?? 0));
  const best = new Map<string, number>(); // exerciseId → best qualifying load seen so far
  const out = new Map<string, number>();
  for (const s of chron) {
    const top = new Map<string, number>();
    for (const x of s?.sets ?? []) {
      if (!qualifiesAsLoad(x)) continue;
      const cur = top.get(x.exerciseId);
      if (cur == null || x.actualWeight > cur) top.set(x.exerciseId, x.actualWeight);
    }
    let raises = 0;
    for (const [exId, load] of top) {
      const prev = best.get(exId);
      if (prev != null && load > prev) raises += 1;
      if (prev == null || load > prev) best.set(exId, load);
    }
    if (s?.id != null) out.set(s.id, raises);
  }
  return out;
}

/** Total lifetime raises across a history — the same walk, summed. */
export function totalRaises(sessions: readonly Session[] | null | undefined): number {
  let n = 0;
  for (const v of raisesBySession(sessions).values()) n += v;
  return n;
}

/** A set that can set or beat a best: a real load, actually lifted for at least one rep.
 *  A type PREDICATE, so the caller's `x.actualWeight` is a `number` after the guard rather than a
 *  `number | null` it has to re-check — the narrowing was always the point of calling this. */
function qualifiesAsLoad(x: SetLog | null | undefined): x is SetLog & { actualWeight: number } {
  return (
    typeof x?.actualWeight === 'number' &&
    Number.isFinite(x.actualWeight) &&
    x.actualWeight > 0 &&
    typeof x?.actualReps === 'number' &&
    x.actualReps >= 1
  );
}
