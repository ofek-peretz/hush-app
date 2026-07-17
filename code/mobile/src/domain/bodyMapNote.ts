/**
 * What Hush has to say about a body map, right now — the ONE line under it (S-2/3, F-4).
 *
 * Pure, and shared by both surfaces that draw the map (onboarding + the Settings editor), because a
 * map that means one thing in onboarding and another in Settings is two maps. The screens differ in
 * their chrome, never in what the map SAYS.
 *
 * Order is a hierarchy, not a list. A refusal answers something she just did, so it outranks the
 * standing consequence; a consequence outranks the budget's idle count. Only ever one line — "one
 * fact, one element".
 */
import type { MuscleStance } from '@/data/local/models';
import { emphasisMuscles, type BodyMap } from '@/engine/v5/bodyMap';
import { regionOf } from '@/engine/v5/assembler';

/** The i18n key + params for the map's current line. `params` is absent when the copy takes none. */
export interface BodyMapNote {
  key: string;
  params?: Record<string, string | number>;
  /** A refusal is Hush answering an act — it earns full ink. Everything else is quiet context. */
  loud: boolean;
}

/** The muscles of a region, filtered from the engine's canonical order (I-24 — never reordered). */
export function musclesOfRegion(all: readonly string[], region: 'upper' | 'lower'): string[] {
  return all.filter((m) => regionOf(m) === region);
}

const stanceOf = (map: BodyMap, m: string): MuscleStance => map[m] ?? 'normal';

/**
 * The consequence of what she has turned OFF — stated once, as a fact, never an argument.
 *
 * Only a WHOLE region going dark earns a sentence. A muscle here and there is just her map, and
 * narrating every toggle is the nagging L8 bans. `null` = nothing worth saying.
 */
export function mapConsequence(map: BodyMap, all: readonly string[]): string | null {
  const live = (r: 'upper' | 'lower') => musclesOfRegion(all, r).some((m) => stanceOf(map, m) !== 'off');
  const upper = live('upper');
  const lower = live('lower');
  if (!upper && !lower) return 'ob.mapNothingOn';
  if (!lower) return 'ob.mapUpperOnly';
  if (!upper) return 'ob.mapLowerOnly';
  return null;
}

/**
 * The one line the map is currently saying.
 *
 * `refusedNames` = the two muscles holding the emphasis budget, when she has just been refused a
 * third. The brief is explicit that the limit must be "legible, not a hidden error" — so a refusal
 * names who holds it and what moves it, rather than being a tick and a dead tap.
 *
 * ⚠️ `ob.mapBudgetFull` names exactly TWO muscles ({{a}} and {{b}}) because `EMPHASIS_BUDGET` is 2.
 * Raising the budget without rewriting that copy would drop the refusal on the floor and restore
 * the hidden error this replaced. Callers bind their guard to the constant (not to a literal 2), so
 * the mismatch surfaces rather than going quiet — but the COPY is the thing that has to change.
 */
export function bodyMapNote(map: BodyMap, all: readonly string[], refusedNames: [string, string] | null): BodyMapNote {
  if (refusedNames) return { key: 'ob.mapBudgetFull', params: { a: refusedNames[0], b: refusedNames[1] }, loud: true };
  const consequence = mapConsequence(map, all);
  if (consequence) return { key: consequence, loud: false };
  return { key: 'ob.mapEmphasis', params: { n: emphasisMuscles(map, all).length }, loud: false };
}
