/**
 * homePlan — the rows Today prints under the workout's name, derived from the programme day and the
 * engine's read of it.
 *
 * ════ WHY THIS IS ITS OWN FILE ════
 * It was eight lines inside a `useMemo` in Home.tsx, and it held a defect no test could reach: it
 * returned NULL until the engine's `sessionTargets` promise landed, so every chip tap collapsed the
 * whole list into an empty box and grew it back one frame later — the founder's "tapping the chips
 * flickers" (A.12). The rule it was missing is a rule about FACTS, not about rendering:
 *
 *   A lift's NAME and its SET COUNT are facts of the programme day. They are known synchronously,
 *   the instant a chip is tapped. Only the LOAD and the BAND are the engine's, and only those wait.
 *
 * So the list is built the moment there is a day, and the rows whose figures have not arrived say
 * so (`pending`) rather than the whole section standing down. Pulled out here so that law can be
 * asserted directly, without mounting a navigator.
 */

// 

import type { SetTarget } from '@/data/local/models';
import type { LoadDirection } from '@/design/tokens';
import { exerciseDisplayName } from '@/data/exercises';
import type { HomePlanLift } from '@/screens/home/HomeView';

/** The shape of a programme day this module needs — its slots, in order. */
export interface HomePlanDay {
  slots: { exerciseId: string; setCount: number }[];
}

/**
 * @param day      the selected programme day; null = nothing selected, and there are no rows
 * @param targets  the engine's per-set targets for that day, or null while the read is in flight
 * @param changed  which lifts the engine moved this week, and which way
 */
export function homePlanRows(
  day: HomePlanDay | null | undefined,
  targets: SetTarget[] | null,
  changed: Record<string, LoadDirection> = {},
): HomePlanLift[] | null {
  if (!day) return null;
  const pending = targets == null;
  return day.slots.map((slot) => {
    const first = targets?.find((x) => x.exerciseId === slot.exerciseId && x.setIndex === 0);
    // HER BAND, from the engine's own immutable pair. `recommendedReps` is Tlo — the FLOOR — and
    // an athlete's edit overwrites it mid-session, so it is the wrong field to read a prescription
    // from twice over. `repBandLo`/`repBandHi` are held for exactly this (models.ts).
    const lo = first?.repBandLo ?? first?.recommendedReps ?? 8;
    const hi = first?.repBandHi ?? lo;
    return {
      exerciseId: slot.exerciseId,
      name: exerciseDisplayName(slot.exerciseId),
      load: first?.recommendedWeight ?? null,
      sets: slot.setCount,
      band: [lo, hi] as [number, number],
      changed: changed[slot.exerciseId],
      // While pending, `load` and `band` hold placeholder values that are NEVER drawn — the view
      // draws no figure at all for a pending row. Keeping them typed rather than optional means the
      // row that finally lands is the same shape, so nothing about the row changes but its figure.
      ...(pending ? { pending: true as const } : null),
    };
  });
}

/**
 * The same rows, but only once every figure is real — for surfaces that quote a load OUTSIDE the
 * plan table (Welcome-back names two lifts and their weights). A pending row's `load` is null, and
 * null means BODYWEIGHT everywhere else in the app; quoting it would be Hush stating, in its own
 * voice, that the bar is empty.
 */
export function settledPlanRows(rows: HomePlanLift[] | null): HomePlanLift[] | null {
  return rows && rows.some((r) => r.pending) ? null : rows;
}
