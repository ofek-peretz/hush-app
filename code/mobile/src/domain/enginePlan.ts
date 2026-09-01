/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ENGINE'S WEEK, IN THE SHAPE EVERY SURFACE ALREADY READS.
 *
 * ⛔ FOUNDER, 2026-08-11: *"תתקן את המסך של Today שיצייר את התוכנית של המנוע."*
 *
 * ── THE HOLE THIS FILLS ───────────────────────────────────────────────────────────────────────────
 * Today, the pre-workout card, the session runner, the watch and the Saturday letter all read a
 * `CoachPlan`. That was correct while the coach wrote the programme. It stopped being correct when
 * the engine took the week back: onboarding now calls `generateProgram`, which produces a `Program`,
 * and **nothing writes a `CoachPlan` any more** — `db.recordCoachAnswer` has one caller left and it
 * only runs after a session. So an athlete who finished onboarding had a programme in storage and an
 * empty Today, and would have had one until the day she trained.
 *
 * ── WHY A CONVERSION, WHEN `coachWeek` ARGUES AGAINST ONE ────────────────────────────────────────
 * `coachWeek`'s own header refuses the conversion in the OTHER direction, and it is right to:
 *
 *   > *"A `Slot` is `{ capability, exerciseId, setCount }` — a 5 km run has no home in it, a
 *   > 45-second plank has no home in it, and `say` is dropped on the floor."*
 *
 * That argument is about narrowing. This is the opposite: a `PlannedItem` is a strictly WIDER
 * vocabulary than a `Slot`, and the engine only ever speaks the one shape (`reps`) that `Slot` can
 * hold. Nothing is lost, and nothing is invented. Rewiring six surfaces onto a second read model
 * would have been the larger change and the riskier one.
 *
 * ── ⚠️ WHAT IT REFUSES TO SAY ────────────────────────────────────────────────────────────────────
 * **`restS` is left absent, and that is load-bearing.** It is not an estimate field: `restAfterStep`
 * reads it as a PRESCRIPTION and it overrules her learned median (S-17). The engine has never
 * prescribed rest — it prices one to estimate a session's length and then lets her own median run
 * the timer — so writing a number here to make an estimate tidier would silently start prescribing
 * rest to every athlete on the engine's week.
 *
 * **`why` is left absent.** The coach wrote a paragraph about the programme; the engine did not, and
 * inventing one would be the app arguing on its behalf (R7).
 *
 * **`say` is left absent.** Same reason — an execution instruction nobody wrote.
 *
 * Pure and I/O-free: it is handed the week and the targets, and knows nothing about storage.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { CoachPlan, PlannedBlock, PlannedSession } from '@/domain/coachPlan';
import type { Program, ProgramDay, SetTarget } from '@/data/local/models';
import { exerciseById } from '@/data/exercises';

/** The band a lift is prescribed in, from the engine's own target for it. */
function bandOf(target: SetTarget | undefined, fallback: [number, number]): [number, number] {
  if (!target) return fallback;
  const lo = target.repBandLo ?? target.recommendedReps ?? fallback[0];
  const hi = target.repBandHi ?? lo;
  return [lo, hi];
}

/** One programme day → one planned session. */
function sessionOf(day: ProgramDay, byExercise: Map<string, SetTarget>, band: [number, number]): PlannedSession {
  /*
   * ⚠️ ONE BLOCK PER LIFT, `rounds` = its set count. A `PlannedBlock` is "a group of items done
   * `rounds` times", which is what a straight-sets exercise is — the coach used the same shape for
   * exactly this. Grouping several lifts into one block would claim a circuit the engine never
   * wrote, and the session runner would then interleave them.
   */
  const itemOf = (slot: (typeof day.slots)[number]) => {
    const target = byExercise.get(slot.exerciseId);
    // A FIXED scheme (bicep 21s) IS the movement — the band collapses to its count. Choice-only,
    // so this only ever fires on a lift the athlete authored herself.
    const fixed = exerciseById(slot.exerciseId)?.fixedReps;
    return {
      kind: 'reps' as const,
      ex: slot.exerciseId,
      reps: fixed ? ([fixed, fixed] as [number, number]) : bandOf(target, band),
      /*
       * ⚠️ NULL IS A REAL ANSWER HERE AND IT IS NOT "BODYWEIGHT". A lift she has never performed
       * has no load until her first set decides it (S-38), and `recommendedWeight` is null for
       * exactly those — the same null a pull-up carries. The surfaces already draw both the same
       * way (no weight, the scheme alone), which is the honest rendering of either.
       */
      load: target?.recommendedWeight ?? null,
    };
  };
  /*
   * ════ HER SUPERSET BECOMES THE BLOCK SHAPE THE RUNNER HAS ALWAYS SPOKEN (2026-08-26) ════
   *
   * The warning above ("grouping several lifts into one block would claim a circuit the engine
   * never wrote") still binds the ENGINE's own slots — none of them carry `pairedWithNext`. When
   * the ATHLETE wrote the pair in the builder, the circuit is exactly what she asked for: one
   * block, two items, `rounds` = the shared set count, and the session runner interleaves it the
   * way it has interleaved coach circuits since they existed. Nothing is claimed that nobody wrote.
   */
  const blocks: PlannedBlock[] = [];
  for (let i = 0; i < day.slots.length; i++) {
    const slot = day.slots[i];
    const partner = day.slots[i + 1];
    if (slot.pairedWithNext && partner) {
      blocks.push({ rounds: Math.min(slot.setCount, partner.setCount), items: [itemOf(slot), itemOf(partner)] });
      i += 1;
      continue;
    }
    blocks.push({ rounds: slot.setCount, items: [itemOf(slot)] });
  }
  return { name: day.name, blocks };
}

/**
 * The engine's programme, as a `CoachPlan`.
 *
 * @param targets every per-set target the engine holds — `sessionTargets` returns them for the whole
 *                programme in one call (it ignores the day id), so one read covers the week.
 * @param band    her declared rep band, for a lift the engine has no target for yet.
 * @param title   the programme's name (`domain/programmeName`), or absent.
 */
export function coachPlanFromProgram(
  program: Program | null | undefined,
  targets: readonly SetTarget[] = [],
  band: [number, number] = [8, 10],
  title?: string,
): CoachPlan | null {
  if (!program) return null;
  const workouts = program.days.filter((d) => !d.isRest && d.slots.length > 0);
  if (workouts.length === 0) return null;

  // The FIRST set of a lift carries its prescription; later ones are the same band and Loop 1 moves
  // the load between them, which is a live decision and not part of the written week.
  const byExercise = new Map<string, SetTarget>();
  for (const t of targets) if (t.setIndex === 0 && !byExercise.has(t.exerciseId)) byExercise.set(t.exerciseId, t);

  return {
    v: 2,
    /*
     * ⛔ THE ONE PLACE THIS FLAG IS EVER SET. It tells `coachWeek` to price the week the way
     * `enforceTimeCap` priced it when it built it — see the field's note on `CoachPlan`. Without it
     * Today announces a session the engine capped at sixty minutes as sixty-six.
     */
    pricing: 'engine',
    ...(title ? { title } : {}),
    sessions: workouts.map((d) => sessionOf(d, byExercise, band)),
  };
}

/** Her declared band as a pair — the fallback when the engine has no target for a lift yet. */
export function bandFromChoice(choice: string | undefined): [number, number] {
  const parts = (choice ?? '8-10').split('-').map((n) => Number(n));
  return parts.length === 2 && parts.every((n) => Number.isFinite(n)) ? [parts[0], parts[1]] : [8, 10];
}
