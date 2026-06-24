/**
 * Hush v4 engine — catalog adapter (integration boundary).
 *
 * Maps the mobile catalog (5 display `capability` values + muscle groups) onto the v4 engine's SIX
 * progression patterns WITHOUT touching the app's `Capability` union or the 5-bar Portrait. This is
 * how VERTICAL_PULL becomes a first-class ENGINE pattern (approved override §6) while the display
 * stays unchanged: the engine reasons over `Pattern`; the app keeps reasoning over `Capability`.
 *
 * CORE is intentionally NOT an engine pattern — `enginePattern` returns null for core lifts, so the
 * engine never builds a slot for them; they are added by the assembler as an accessory finisher.
 */
import { EXERCISES, exerciseById, type Exercise } from '@/data/exercises';
import type { Pattern, Equipment } from './constants';
import type { ExerciseMeta } from './decisions';
import type { LibraryEntry } from './swap';
import type { BodyRegion } from './reads';

const VERTICAL_PULL_IDS = new Set(['pull_up', 'chin_up', 'lat_pulldown']);

/** The v4 engine pattern an exercise trains, or null if it is the CORE accessory (not engine-managed). */
export function enginePattern(exerciseId: string): Pattern | null {
  const ex = exerciseById(exerciseId);
  if (!ex) return null;
  if (VERTICAL_PULL_IDS.has(exerciseId)) return 'VERTICAL_PULL';
  switch (ex.capability) {
    case 'horizontal_push':
      return 'HORIZONTAL_PUSH';
    case 'horizontal_pull':
      return 'HORIZONTAL_PULL';
    case 'vertical_push':
      return 'VERTICAL_PUSH';
    case 'knee_dominant':
      return 'KNEE_DOMINANT';
    case 'hip_dominant':
      return ex.muscle === 'Core' ? null : 'HIP_DOMINANT'; // Core = accessory, not an engine pattern
  }
}

const UPPER_PATTERNS = new Set<Pattern>(['HORIZONTAL_PUSH', 'HORIZONTAL_PULL', 'VERTICAL_PUSH', 'VERTICAL_PULL']);

/** Body region for STEP selection (upper/lower; core never reaches the engine). */
export function bodyRegion(exerciseId: string): BodyRegion {
  const p = enginePattern(exerciseId);
  if (p == null) return 'core';
  return UPPER_PATTERNS.has(p) ? 'upper' : 'lower';
}

/** Engine meta for an exercise: region + tier + equipment + bodyweight. */
export function exerciseMeta(exerciseId: string): ExerciseMeta {
  const ex = exerciseById(exerciseId);
  if (!ex) return { region: 'upper', tier: 'compound', equipment: 'barbell', bodyweight: false };
  return {
    region: bodyRegion(exerciseId),
    tier: ex.tier,
    equipment: ex.equipment as Equipment,
    bodyweight: !!ex.bodyweight || ex.equipment === 'bodyweight',
  };
}

const toEntry = (ex: Exercise): LibraryEntry => ({
  id: ex.id,
  pattern: enginePattern(ex.id)!,
  is_compound: ex.tier === 'compound',
  equipment: ex.equipment as Equipment,
  bodyweight: !!ex.bodyweight || ex.equipment === 'bodyweight',
});

// Precomputed candidate pools per engine pattern, in stable catalog order (deterministic, I-40).
const CANDIDATES = new Map<Pattern, LibraryEntry[]>();
for (const ex of EXERCISES) {
  const p = enginePattern(ex.id);
  if (p == null) continue; // skip CORE accessory lifts
  const list = CANDIDATES.get(p) ?? [];
  list.push(toEntry(ex));
  CANDIDATES.set(p, list);
}

/** Swap candidates for a pattern, in stable catalog order (the deterministic tie-break for select). */
export function candidatesForPattern(pattern: Pattern): LibraryEntry[] {
  return CANDIDATES.get(pattern) ?? [];
}
