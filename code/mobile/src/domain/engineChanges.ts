/**
 * Hush Engine v5 · Revision 7 — resolving an ENGINE-initiated exercise change (register S-52 / S-25.3).
 *
 * The pure core (`loop2.decideExercise`) decides that a lift wants to GRADUATE (a bodyweight lift too
 * easy or stalled, S-52) or ROTATE (a stalled lift with nothing to back off to, S-25.2) — but not to
 * WHAT (the target "is resolved upstream"). This module resolves it from the catalogue + her history,
 * so the integration layer can enact it (write `prefs.substitutes`, which the assembler honours, C1).
 *
 * These are ENGINE changes, not athlete swaps (S-72): the integration writes them straight to
 * `substitutes`, bypassing the learned-swap occurrence counter — so a rotation never reads as a swap.
 */
import { exerciseById, exercisesForMuscle, isSwapOnly, progressionRule } from '@/data/exercises';
import type { Session } from '@/data/local/models';

/** S-52 — the next harder catalogue variation for a bodyweight lift (knee push-up → push-up → dip).
 *  Undefined at the top of a ladder (pull-up, dip): nothing harder exists, so the lift holds (S-53). */
export function graduationTarget(exerciseId: string): string | undefined {
  const rule = progressionRule(exerciseId);
  return rule.mode === 'reps' ? rule.harder : undefined;
}

/** S-25.3 — the same-muscle lift she has gone LONGEST without (a never-performed lift counts as
 *  longest). From her pool minus swap-only advanced movements and the stalled lift itself; ties break
 *  on catalogue order (deterministic). Undefined when the muscle has no other lift to rotate to. */
export function rotationTarget(exerciseId: string, history: Session[]): string | undefined {
  const ex = exerciseById(exerciseId);
  if (!ex) return undefined;
  const pool = exercisesForMuscle(ex.muscle).filter((e) => !isSwapOnly(e.id) && e.id !== exerciseId);
  if (pool.length === 0) return undefined;

  const lastPerformed = new Map<string, number>();
  for (const s of history) {
    const t = Date.parse(s.startedAt);
    if (!Number.isFinite(t)) continue;
    for (const set of s.sets) lastPerformed.set(set.exerciseId, Math.max(lastPerformed.get(set.exerciseId) ?? 0, t));
  }
  // Stable sort keeps catalogue order for ties, so equal-recency picks are reproducible (I-24).
  return [...pool].sort((a, b) => (lastPerformed.get(a.id) ?? 0) - (lastPerformed.get(b.id) ?? 0))[0]?.id;
}

/** The target for a wanted engine change, or undefined when none exists (the lift then holds honestly). */
export function engineChangeTarget(
  exerciseId: string,
  kind: 'graduate' | 'rotate',
  history: Session[],
): string | undefined {
  return kind === 'graduate' ? graduationTarget(exerciseId) : rotationTarget(exerciseId, history);
}
