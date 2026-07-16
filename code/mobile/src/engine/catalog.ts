/**
 * Hush engine — the catalog adapter (engine-agnostic). Maps the mobile catalog (display `capability`
 * + muscle groups) onto the engine's progression PATTERN and per-exercise meta, and owns the
 * equipment/pattern vocabulary the engine reasons over. Re-homed out of `engine/v4/` (the v4 burial,
 * S-58) because v5 depends on it; it references only the catalog, never any engine version.
 *
 * CORE is intentionally NOT a pattern — `enginePattern` returns null for core lifts, so the engine
 * never builds a slot for them; they are added by the assembler as an accessory finisher.
 */
import { exerciseById } from '@/data/exercises';

/** The engine's six progression patterns. VERTICAL_PULL is a first-class engine pattern even though
 *  the app's display `Capability` union does not name it (approved override). Never reordered — the
 *  canonical order is a deterministic tie-break for volume allocation and slot ids. */
export type Pattern =
  | 'HORIZONTAL_PUSH'
  | 'HORIZONTAL_PULL'
  | 'VERTICAL_PUSH'
  | 'VERTICAL_PULL'
  | 'KNEE_DOMINANT'
  | 'HIP_DOMINANT';

export const PATTERNS: readonly Pattern[] = [
  'HORIZONTAL_PUSH',
  'HORIZONTAL_PULL',
  'VERTICAL_PUSH',
  'VERTICAL_PULL',
  'KNEE_DOMINANT',
  'HIP_DOMINANT',
] as const;

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';
export type BodyRegion = 'upper' | 'lower' | 'core';

/** Per-exercise engine meta: region + tier + equipment + bodyweight. */
export interface EngineExerciseMeta {
  region: BodyRegion;
  tier: 'compound' | 'isolation';
  equipment: Equipment;
  bodyweight: boolean;
}

const VERTICAL_PULL_IDS = new Set(['pull_up', 'chin_up', 'lat_pulldown']);

/** The engine pattern an exercise trains, or null if it is the CORE accessory (not engine-managed). */
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
    default:
      return null;
  }
}

const UPPER_PATTERNS = new Set<Pattern>(['HORIZONTAL_PUSH', 'HORIZONTAL_PULL', 'VERTICAL_PUSH', 'VERTICAL_PULL']);

/** Body region (upper/lower; core never reaches the engine). */
export function bodyRegion(exerciseId: string): BodyRegion {
  const p = enginePattern(exerciseId);
  if (p == null) return 'core';
  return UPPER_PATTERNS.has(p) ? 'upper' : 'lower';
}

/** Engine meta for an exercise: region + tier + equipment + bodyweight. */
export function exerciseMeta(exerciseId: string): EngineExerciseMeta {
  const ex = exerciseById(exerciseId);
  if (!ex) return { region: 'upper', tier: 'compound', equipment: 'barbell', bodyweight: false };
  return {
    region: bodyRegion(exerciseId),
    tier: ex.tier,
    equipment: ex.equipment as Equipment,
    bodyweight: !!ex.bodyweight || ex.equipment === 'bodyweight',
  };
}
