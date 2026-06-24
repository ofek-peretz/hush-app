/**
 * Replacement logic (UX §1). The organizing principle is the slot's MUSCLE GROUP. Because each
 * muscle group is a strict subset of one engine capability, a muscle-scoped swap is always valid
 * and selectable AND never breaks the slot's fixed capability — and it never offers a cross-muscle
 * option (no squat → calf raise, no bench → triceps pushdown). Hush only ever offers exercises
 * you'd actually slot here (§1.2).
 */
import { exercisesForMuscle, muscleOf, type Exercise } from '@/data/exercises';

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
