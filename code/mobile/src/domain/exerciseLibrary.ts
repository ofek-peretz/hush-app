/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE EXERCISE LIBRARY — what she may say about the lifts, and the one thing she may not.
 *
 * ⛔ FOUNDER, 2026-08-16: *"תרגילים אהובים או שנואים או ספרייה של תרגילים — במקום או בנוסף?"* The
 * answer this file encodes is **a library, and the likes are its two verbs**. A separate list of
 * loved and hated lifts would be a second store of the same fact, and the engine already reads
 * exactly two declarations (`OwnedPreferences.chosenByMuscle` / `refusedIds`): take this one first,
 * never deal me that one. A "love" that does not change the week is a decoration, and a "hate" is
 * a refusal by another name.
 *
 * ── THE PICKABLE POOL IS THE GENERATABLE POOL ───────────────────────────────────────────────────
 * `isSwapOnly` lifts exist to be substituted IN when a station is busy; the assembler never deals
 * them. Listing them would let her pick a lift that then cannot appear, which is a promise the
 * screen has no way to keep.
 *
 * ── ⛔ THE ONE REFUSAL THAT IS REFUSED ──────────────────────────────────────────────────────────
 * Refusing every lift of a muscle she left ON is a contradiction: she asked for the muscle to be
 * trained and then refused everything that trains it. `programAssembly` already survives it — it
 * ignores the refusals rather than hand her an empty muscle — and surviving it is not the same as
 * being honest about it. Silently ignoring a tap is the failure mode this codebase keeps finding:
 * she would refuse the last lift, see it marked refused, and receive it anyway next week.
 *
 * So the LAST one is refused at the point of the tap, with a sentence, exactly as `emphasisRefusal`
 * refuses a mark the week cannot honour. The engine's guard stays where it is — a screen is not a
 * safe place for the only copy of a rule.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { exercisesForMuscle, isSwapOnly, type Exercise, type MuscleGroup } from '@/data/exercises';

/** The lifts she may pick or refuse for a muscle — the ones the assembler can actually deal. */
export function libraryPool(muscle: MuscleGroup): Exercise[] {
  return exercisesForMuscle(muscle).filter((e) => !isSwapOnly(e.id));
}

/** Why a refusal cannot be taken, or `null` when it can. */
export type RefusalBlock = 'last_lift';

/**
 * May she refuse `exerciseId`, given everything she has already refused?
 *
 * `refused` is the whole declared set (across every muscle) — the same shape the engine reads, so
 * the screen and the assembler are answering from one list rather than two views of it.
 */
export function refusalBlock(
  muscle: MuscleGroup,
  exerciseId: string,
  refused: ReadonlySet<string>,
): RefusalBlock | null {
  const pool = libraryPool(muscle);
  const left = pool.filter((e) => e.id !== exerciseId && !refused.has(e.id));
  return left.length === 0 ? 'last_lift' : null;
}

/**
 * Her picks for a muscle, in her order, with anything stale dropped.
 *
 * A pick that is later REFUSED is a contradiction she can reach in two taps, and the honest reading
 * is that the refusal is the newer decision — so this is applied on save rather than argued with on
 * screen. Ids the catalogue no longer carries go the same way: a preference file outlives a release.
 */
export function cleanPicks(
  muscle: MuscleGroup,
  picked: readonly string[],
  refused: ReadonlySet<string>,
): string[] {
  const pool = new Set(libraryPool(muscle).map((e) => e.id));
  return picked.filter((id) => pool.has(id) && !refused.has(id));
}
