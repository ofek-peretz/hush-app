/**
 * Hush Engine v5 — the body map (S-2/3/4/44/56/57). The athlete's declared stance per muscle,
 * which REPLACES the demographic split. `off` never appears; `emphasis` gets first claim on volume
 * (budget of 2, F-4); `normal` is the default for every muscle.
 *
 * Pure reads over the declared map + her logged history. No inference: a stance is a fact she stated.
 */

import type { MuscleStance, Session } from '@/data/local/models';
import { muscleOf } from '@/data/exercises';
import { EMPHASIS_BUDGET, CANONICAL_MUSCLE_ORDER } from './constants';

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
 * S-56 — should Hush ever come back about a switched-off muscle ("want it back?")? Only when she
 * has actually TRAINED it (a logged set exists) — a change of state, not a statement of taste. A
 * muscle turned off during onboarding, or crowded out and never trained, has no history → never ask
 * (that would be nagging, L8). The trigger is a fact: "does she have a logged set on this muscle?"
 *
 * WHERE the question lives is the register's call, verbatim: "Once — and once only — Hush comes
 * back… The question is asked once, at the Saturday mirror, and never counted in days." So the map
 * editor obeys an OFF in SILENCE (L8 — the engine never argues with a choice she is making right
 * now), and the one question is asked later, from the weekly mirror, by `askBackMuscle` below.
 * (An earlier build asked a confirm AT the toggle — a mechanism that appears nowhere in the
 * register, replaced 2026-07-21.)
 */
export function shouldAskBackOnOff(muscleHasLoggedSet: boolean): boolean {
  return muscleHasLoggedSet;
}

/** Every muscle with at least one LOGGED set — the fact S-56 turns on (never an inference). */
export function trainedMuscles(history: Session[]): Set<string> {
  const out = new Set<string>();
  for (const s of history) for (const set of s.sets) {
    const m = muscleOf(set.exerciseId);
    if (m) out.add(m);
  }
  return out;
}

/**
 * S-56 — the muscle the Saturday mirror should ask about, or null. A candidate is OFF on the map,
 * TRAINED (a logged set exists — `shouldAskBackOnOff`), and never asked before (L4: a question is
 * asked once, never twice — `asked` holds every muscle already answered, either way). First in the
 * canonical order (F-9), so the pick is deterministic; one question at a time, never a list.
 */
export function askBackMuscle(
  map: BodyMap | undefined,
  trained: ReadonlySet<string>,
  asked: ReadonlySet<string>,
  order: readonly string[] = CANONICAL_MUSCLE_ORDER,
): string | null {
  for (const m of order) {
    if (stanceOf(map, m) !== 'off') continue;
    if (!shouldAskBackOnOff(trained.has(m))) continue;
    if (asked.has(m)) continue;
    return m;
  }
  return null;
}
