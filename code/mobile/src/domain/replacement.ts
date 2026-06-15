/**
 * Replacement logic (UX §1). The ONLY organizing principle is capability class
 * (fixed by the slot) and equipment family within it. Hush never offers an
 * exercise that breaks the capability — every result is valid and selectable
 * (§1.2). Search is incremental, name + synonyms, forgiving of spacing/partials.
 */
import { exercisesForCapability, type Exercise, type EquipmentFamily } from '@/data/exercises';
import type { Capability } from '@/data/local/models';

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

function matches(ex: Exercise, q: string): boolean {
  const n = normalize(q);
  if (!n) return true;
  if (normalize(ex.name).includes(n)) return true;
  return (ex.synonyms ?? []).some((s) => normalize(s).includes(n));
}

/** Valid, in-class results for a query (current exercise excluded). */
export function searchExercises(capability: Capability, currentId: string, query: string): Exercise[] {
  return exercisesForCapability(capability).filter((e) => e.id !== currentId && matches(e, query));
}

/** Up to three ranked best class-matched substitutes (§1.4). */
export function recommended(capability: Capability, currentId: string): Exercise[] {
  return exercisesForCapability(capability)
    .filter((e) => e.id !== currentId)
    .slice(0, 3);
}

/** "Your exercises": recents for this slot's capability, newest first, excl. current. */
export function recentsForSlot(recents: string[], capability: Capability, currentId: string): Exercise[] {
  const inClass = new Set(exercisesForCapability(capability).map((e) => e.id));
  const out: Exercise[] = [];
  for (const id of recents) {
    if (id === currentId || !inClass.has(id)) continue;
    const ex = exercisesForCapability(capability).find((e) => e.id === id);
    if (ex && !out.some((o) => o.id === ex.id)) out.push(ex);
  }
  return out.slice(0, 5);
}

export interface EquipmentGroup {
  family: EquipmentFamily;
  exercises: Exercise[];
}

/** "All [capability] exercises", grouped by equipment family (quiet subheadings). */
export function allByEquipment(capability: Capability, currentId: string): EquipmentGroup[] {
  const groups = new Map<EquipmentFamily, Exercise[]>();
  for (const e of exercisesForCapability(capability)) {
    if (e.id === currentId) continue;
    const list = groups.get(e.equipment) ?? [];
    list.push(e);
    groups.set(e.equipment, list);
  }
  return [...groups.entries()].map(([family, exercises]) => ({ family, exercises }));
}
