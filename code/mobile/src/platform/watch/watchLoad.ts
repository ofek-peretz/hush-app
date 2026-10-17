/**
 * How to load a weight on a lift, and the bridges of a warm-up, in the shape the WRIST reads.
 *
 * Two builders send the wrist steps — the week's plan (`watchPlan.buildCoachWatchPlan`) and the
 * live session's own plan when the wrist must be able to take it over (`watchTakeover`) — and both
 * must say these two things the same way, or the wrist would draw a dumbbell's "per hand" for one
 * and not the other. Kept apart from both so the session store can import it without a cycle.
 */

//

import { loadSetup } from '@/domain/loadPresentation';
import type { WarmupSet } from '@/domain/warmupRamp';
import type { LastTime } from '@/domain/lastTimeOn';
import { swapChoices } from '@/domain/swapPool';
import { exerciseById, exerciseDisplayName, type EquipmentFamily } from '@/data/exercises';
import type { WatchPlanStep, WatchSwapChoice, WatchWarmupRung } from './protocol';

/**
 * ⛔ THE SWAPS THE WRIST OFFERS — ONE DEFINITION, ASKED BY THE LIVE MIRROR AND BY THE PLAN (stage 4).
 *
 * True synonyms only (2026-08-16): a 40 mm screen shows a name and nothing else, so an option that
 * trains the lift a different way — which the phone's sheet labels — would be a lie there. Chosen
 * against the session's OTHER lifts, so the wrist never offers one she has done or is about to do.
 * `buildMirrorSteps` asks this for every frame; the plan asks it in advance for the wrist alone.
 */
export function wristSwapOptions(
  exerciseId: string,
  sessionExerciseIds: readonly string[],
  equipment?: readonly EquipmentFamily[],
): { id: string; name: string }[] {
  const ex = exerciseById(exerciseId);
  if (!ex) return [];
  return swapChoices(ex.id, { sessionExerciseIds: [...sessionExerciseIds], equipment }, 2)
    .filter((c) => c.sameMovement)
    /* The name is the wrist's KEY for "is this the lift on stage" (Undo matches it against
       `exerciseName`), so it is the same spoken name a step carries. */
    .map((c) => ({ id: c.exercise.id, name: exerciseDisplayName(c.exercise.id) }));
}

/** What a step's swaps need from the plan they were asked on — the session store's own answers. */
export interface SwapChoiceFacts {
  /** The plan's lifts, as they would stand with step `at`'s lift swapped for `id`. */
  liftsAfter: (at: number, id: string) => string[];
  /** The warm-up the phone would offer at `at` once `id` is swapped in (`warmupOffer` on the swapped plan). */
  warmupAfter: (at: number, id: string) => readonly WarmupSet[] | null;
  lastOf: (exerciseId: string) => LastTime | null;
  equipment?: readonly EquipmentFamily[];
}

/**
 * The options for the step at `at` — whose weight is `kg` — each with what the wrist needs to show it
 * once chosen, and the options the phone would offer for it in turn. Undefined where there are none.
 */
export function swapChoicesFor(
  exerciseId: string,
  sessionExerciseIds: readonly string[],
  at: number,
  kg: number | null,
  facts: SwapChoiceFacts,
): WatchSwapChoice[] | undefined {
  const options = wristSwapOptions(exerciseId, sessionExerciseIds, facts.equipment);
  if (options.length === 0) return undefined;
  return options.map((o) => {
    const setup = wireSetup(o.id, kg);
    const last = facts.lastOf(o.id);
    const ramp = facts.warmupAfter(at, o.id);
    const next = wristSwapOptions(o.id, facts.liftsAfter(at, o.id), facts.equipment);
    return {
      id: o.id,
      name: o.name,
      ...(exerciseById(o.id)?.muscle ? { group: exerciseById(o.id)!.muscle } : {}),
      ...(setup ? { loadSetup: setup } : {}),
      ...(last && last.reps.length > 0 ? { lastReps: last.reps, lastLoadKg: last.loadKg } : {}),
      ...(ramp && ramp.length > 0 ? { ramp: rampRungs(o.id, ramp) } : {}),
      ...(next.length > 0 ? { swaps: next } : {}),
    };
  });
}

/**
 * How to load a weight on this lift — EVERY field the live mirror sends (`buildMirrorSteps`). The
 * coach's plan used to send three of them (style, per side, plates), so the wrist alone drew no "per
 * hand" on a dumbbell and no pin on a machine that it draws for the very same set when the phone
 * runs it (2026-10-17).
 */
export function wireSetup(exerciseId: string, kg: number | null): WatchPlanStep['loadSetup'] {
  const setup = loadSetup(exerciseId, kg, 'kg');
  if (!setup) return null;
  return {
    style: setup.style,
    perSide: setup.perSide,
    plates: setup.plates ?? undefined,
    barKg: setup.barKg,
    perHand: setup.perHand,
    pin: setup.pin,
    fixedBar: setup.fixedBar,
  };
}

/** A warm-up the phone would insert, as the wrist inserts it — each bridge with its own bar. */
export function rampRungs(exerciseId: string, ramp: readonly WarmupSet[]): WatchWarmupRung[] {
  return ramp.map((w) => {
    const setup = wireSetup(exerciseId, w.weightKg);
    return { weightKg: w.weightKg, reps: w.reps, ...(setup ? { loadSetup: setup } : {}) };
  });
}
