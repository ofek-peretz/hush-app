/**
 * Replacement logic (UX §1). The organizing principle is the slot's MUSCLE GROUP. Because each
 * muscle group is a strict subset of one engine capability, a muscle-scoped swap is always valid
 * and selectable AND never breaks the slot's fixed capability — and it never offers a cross-muscle
 * option (no squat → calf raise, no bench → triceps pushdown). Hush only ever offers exercises
 * you'd actually slot here (§1.2).
 */
import { defaultBackup, exerciseById, exercisesForMuscle, muscleOf, similarExercises, type Exercise } from '@/data/exercises';

/** The swap pool for a slot: every exercise that trains the current exercise's muscle. */
function poolFor(currentId: string): Exercise[] {
  const muscle = muscleOf(currentId);
  return muscle ? exercisesForMuscle(muscle) : [];
}

/** Up to three ranked best in-group substitutes (§1.4). */
export function recommended(currentId: string): Exercise[] {
  return poolFor(currentId)
    .filter((e) => e.id !== currentId)
    .slice(0, 3);
}

/**
 * One-tap swap ladder (S4, approved 2026-07-06): Hush decides — the athlete never evaluates a
 * list mid-workout. Ordered, de-duplicated, muscle-scoped (capability contract holds):
 *   1. the athlete's saved SUBSTITUTE for this lift (their standing "instead, give me…")
 *   2. their saved equipment-busy BACKUP
 *   3. the catalog defaultBackup (same muscle, different equipment family first — the
 *      dominant swap motive is a taken station)
 *   4. the remaining similar-effect candidates, best match first.
 * "Try another" walks this ladder; "Undo" restores the original.
 */
export function swapLadder(
  currentId: string,
  prefs?: { substitutes?: Record<string, string>; backups?: Record<string, string> },
  exclude?: readonly string[],
): string[] {
  const muscle = muscleOf(currentId);
  const excludeSet = new Set(exclude ?? []); // lifts already in THIS session — never a duplicate
  const out: string[] = [];
  const push = (id: string | undefined) => {
    if (!id || id === currentId || out.includes(id) || excludeSet.has(id)) return;
    if (!exerciseById(id) || muscleOf(id) !== muscle) return; // stay in-muscle, always
    out.push(id);
  };
  push(prefs?.substitutes?.[currentId]);
  push(prefs?.backups?.[currentId]);
  push(defaultBackup(currentId)?.id);
  for (const e of similarExercises(currentId)) push(e.id);
  return out;
}
