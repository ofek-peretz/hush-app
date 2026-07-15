/**
 * Hush Engine v5 · Revision 7 — learned exercise selection, the WIRING (register Part 9 §B, S-68…S-70).
 *
 * Turns ONE completed session into occurrences and folds them into the learning state. It bridges the
 * catalogue (grouping by muscle) and the pure reducer (`learnedSwap`). Deliberately CONSERVATIVE: it
 * emits a swap only when a muscle has exactly one unmatched OFFERED lift and exactly one clear
 * alternative PERFORMED. A false negative (a missed learning) is fine — she swaps again next time; a
 * false positive (a wrong adoption) is not, so ambiguous multi-swap sessions emit nothing.
 *
 * `offeredIds` = the day's non-supplemental slot exercises (what the programme presented — which may
 * already be a learned substitute; the reducer maps it back to its anchor). `performedIds` = the
 * distinct exercises she logged a WORKING set of (approach sets excluded upstream). Deterministic.
 */
import { muscleOf } from '@/data/exercises';
import { foldOccurrences, type SwapLearning, type SwapOccurrence } from '@/engine/v5/learnedSwap';

function groupByMuscle(ids: Iterable<string>): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const id of ids) {
    const mus = muscleOf(id);
    if (!mus) continue; // an id that resolves to no muscle can't be attributed — skip it
    const arr = m.get(mus);
    if (arr) arr.push(id);
    else m.set(mus, [id]);
  }
  return m;
}

export function extractOccurrences(offeredIds: string[], performedIds: string[]): SwapOccurrence[] {
  const offeredSet = new Set(offeredIds);
  const offeredByM = groupByMuscle(offeredSet);
  const performedByM = groupByMuscle(new Set(performedIds));
  const out: SwapOccurrence[] = [];

  for (const [muscle, offered] of offeredByM) {
    const perf = [...(performedByM.get(muscle) ?? [])].sort();
    const remaining: string[] = [];
    // 1) As-is: she performed the offered lift → this resets any pending swap toward a change (S-68).
    for (const O of [...offered].sort()) {
      const i = perf.indexOf(O);
      if (i >= 0) {
        out.push({ offered: O, performed: O });
        perf.splice(i, 1);
      } else {
        remaining.push(O);
      }
    }
    // 2) A single clean swap: exactly one offered lift unperformed, one alternative done instead.
    const targets = perf.filter((p) => !offeredSet.has(p));
    if (remaining.length === 1 && targets.length === 1) {
      out.push({ offered: remaining[0], performed: targets[0] });
    }
    // Anything else (several unmatched / several alternatives) is ambiguous → emit nothing.
  }
  return out;
}

/** Fold one completed session's swaps into the learning state (S-68…S-70). */
export function foldSessionSwaps(state: SwapLearning, offeredIds: string[], performedIds: string[]): SwapLearning {
  return foldOccurrences(extractOccurrences(offeredIds, performedIds), state);
}
