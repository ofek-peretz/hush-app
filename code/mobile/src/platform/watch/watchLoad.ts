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
import type { WatchPlanStep, WatchWarmupRung } from './protocol';

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
