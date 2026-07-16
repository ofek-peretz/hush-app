/**
 * Hush Engine v5 — the body map (S-2/3/4/44/56/57). The athlete's declared stance per muscle,
 * which REPLACES the demographic split. `off` never appears; `emphasis` gets first claim on volume
 * (budget of 2, F-4); `normal` is the default for every muscle.
 *
 * Pure reads over the declared map + her logged history. No inference: a stance is a fact she stated.
 */

import type { MuscleStance } from '@/data/local/models';
import { EMPHASIS_BUDGET } from './constants';

export type BodyMap = Record<string, MuscleStance>;

/** The stance for a muscle, defaulting to 'normal' (parity-preserving) when unset. */
export function stanceOf(map: BodyMap | undefined, muscle: string): MuscleStance {
  return map?.[muscle] ?? 'normal';
}

/** Muscles she has NOT turned off — the ones the programme may train. */
export function trainableMuscles(map: BodyMap | undefined, allMuscles: readonly string[]): string[] {
  return allMuscles.filter((m) => stanceOf(map, m) !== 'off');
}

/** The emphasised muscles (first claim on volume; guaranteed ≥1 exercise, S-63). */
export function emphasisMuscles(map: BodyMap | undefined, allMuscles: readonly string[]): string[] {
  return allMuscles.filter((m) => stanceOf(map, m) === 'emphasis');
}

/**
 * Is the map buildable? False when nothing is left on to build a workout from (S-3) or when she
 * exceeded the emphasis budget (F-4 — the UI should prevent this, but the engine refuses it too).
 */
export function validateMap(map: BodyMap | undefined, allMuscles: readonly string[]): { ok: boolean; reason?: 'nothing_on' | 'too_many_emphasis' } {
  if (emphasisMuscles(map, allMuscles).length > EMPHASIS_BUDGET) return { ok: false, reason: 'too_many_emphasis' };
  if (trainableMuscles(map, allMuscles).length === 0) return { ok: false, reason: 'nothing_on' };
  return { ok: true };
}

/**
 * S-56 — should Hush ask "want it back?" when a muscle is switched OFF? Only when she has actually
 * TRAINED it (a logged set exists) — a change of state, not a statement of taste. A muscle turned
 * off during onboarding, or crowded out and never trained, has no history → do NOT ask (that would
 * be nagging, L8). The trigger is a fact: "does she have a logged set on this muscle?"
 *
 * DELIBERATELY NOT WIRED (founder decision, 2026-07-16): the ask-back is a body-map SCREEN interaction
 * (a confirm when she toggles a trained muscle off), which lands with the founder's end redesign of
 * that screen. The engine predicate is ready for it; leaving the prompt out until the screen exists is
 * a conscious choice, not a hole — Hush simply honours an off toggle silently for now (never nags).
 */
export function shouldAskBackOnOff(muscleHasLoggedSet: boolean): boolean {
  return muscleHasLoggedSet;
}
