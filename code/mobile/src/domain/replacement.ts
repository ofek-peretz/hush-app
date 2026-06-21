/**
 * Replacement logic (UX §1). The organizing principle is the slot's MUSCLE GROUP and
 * equipment family within it. Because each muscle group is a strict subset of one engine
 * capability, a muscle-scoped swap is always valid and selectable AND never breaks the
 * slot's fixed capability — and it never offers a cross-muscle option (no squat → calf
 * raise, no bench → triceps pushdown). Hush only ever offers exercises you'd actually
 * slot here (§1.2). Search is incremental, name + synonyms, forgiving of spacing/partials.
 */
import { exercisesForMuscle, muscleOf, type Exercise, type EquipmentFamily } from '@/data/exercises';

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

function matches(ex: Exercise, q: string): boolean {
  const n = normalize(q);
  if (!n) return true;
  if (normalize(ex.name).includes(n)) return true;
  return (ex.synonyms ?? []).some((s) => normalize(s).includes(n));
}

/** The swap pool for a slot: every exercise that trains the current exercise's muscle. */
function poolFor(currentId: string): Exercise[] {
  const muscle = muscleOf(currentId);
  return muscle ? exercisesForMuscle(muscle) : [];
}

/** Valid, in-group results for a query (current exercise excluded). */
export function searchExercises(currentId: string, query: string): Exercise[] {
  return poolFor(currentId).filter((e) => e.id !== currentId && matches(e, query));
}

/** Up to three ranked best in-group substitutes (§1.4). */
export function recommended(currentId: string): Exercise[] {
  return poolFor(currentId)
    .filter((e) => e.id !== currentId)
    .slice(0, 3);
}

/** "Your exercises": recents for this slot's muscle group, newest first, excl. current. */
export function recentsForSlot(recents: string[], currentId: string): Exercise[] {
  const pool = poolFor(currentId);
  const inGroup = new Set(pool.map((e) => e.id));
  const out: Exercise[] = [];
  for (const id of recents) {
    if (id === currentId || !inGroup.has(id)) continue;
    const ex = pool.find((e) => e.id === id);
    if (ex && !out.some((o) => o.id === ex.id)) out.push(ex);
  }
  return out.slice(0, 5);
}

export interface EquipmentGroup {
  family: EquipmentFamily;
  exercises: Exercise[];
}

/** "All [muscle] exercises", grouped by equipment family (quiet subheadings). */
export function allByEquipment(currentId: string): EquipmentGroup[] {
  const groups = new Map<EquipmentFamily, Exercise[]>();
  for (const e of poolFor(currentId)) {
    if (e.id === currentId) continue;
    const list = groups.get(e.equipment) ?? [];
    list.push(e);
    groups.set(e.equipment, list);
  }
  return [...groups.entries()].map(([family, exercises]) => ({ family, exercises }));
}
