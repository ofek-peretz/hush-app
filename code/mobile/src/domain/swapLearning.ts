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
// @ts-nocheck

// 

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

/**
 * S-71 — the learned "leave it." The engine rotates a genuinely stalled lift away (S-25.3, recorded in
 * `engineRotated`: anchor → the lift it rotated to). If she swaps BACK to the anchor twice, the fold
 * above clears that anchor's substitute — that resistance earns a learned pin (the engine stops
 * rotating it, S-71). Given the substitutes BEFORE and AFTER a fold, return the anchors whose resisted
 * rotation was just cleared, each to become a pin.
 *
 * S-72 — an engine rotation is never counted as an athlete swap: it writes `substitutes` DIRECTLY, so
 * it never advances the fold's counter; only her own swap-backs can clear a substitute here. This
 * function therefore fires solely on athlete resistance, never on the engine's own move.
 */
export function learnedLeaveIts(
  prevSubstitutes: Record<string, string>,
  nextSubstitutes: Record<string, string>,
  engineRotated: Record<string, string>,
): string[] {
  return Object.keys(engineRotated).filter((anchor) => !!prevSubstitutes[anchor] && !nextSubstitutes[anchor]);
}

/**
 * THE UNDO — S-71's outcome, earned with one tap instead of two silent swap-backs.
 *
 * Founder, 2026-07-17: "when the engine changes an exercise, show it in the engine's review and
 * offer an undo of that change — that even saves us the K=2 case for the swaps."
 *
 * He is right about the mechanism, and it is worth being precise about why. S-71 already lets an
 * athlete overrule a rotation: swap back to the lift twice and the engine reads the resistance and
 * pins it. But K=2 is an INFERENCE — Hush watching behaviour and deducing an intention — and this
 * product's first law is that it acts on facts, never on theory (R7). A button is the fact. She
 * says "no", once, in words, and Hush obeys.
 *
 * So the two now agree, and both stay. **The swap is NOT removed** (founder, same message: "don't
 * remove the swap option yet — an athlete might not notice" the undo). One is the explicit door,
 * the other the implicit one; they write the identical state, so an athlete who never finds the
 * button still gets her way by doing what she would have done anyway.
 *
 * ── SCOPE: ROTATIONS ONLY ────────────────────────────────────────────────────────────────────
 * `engineRotated` is the whole guard. A GRADUATION is deliberately not resistible (register S-71,
 * S-52): outgrowing a knee push-up is a fact she demonstrated, not a preference to overrule, and
 * the ladder's top holds by itself (S-53). A learned swap of her OWN (S-69) is not here either —
 * undoing her own choice on her behalf would be the app arguing with her.
 *
 * Returns the prefs unchanged when `anchor` is not a live engine rotation, so a double tap, a stale
 * screen, or a re-render cannot invent a pin.
 */
export function undoEngineRotation<
  P extends {
    substitutes: Record<string, string>;
    engineRotated?: Record<string, string>;
    leaveItsByMuscle: Record<string, string>;
  },
>(prefs: P, anchor: string, muscleOfExercise: (id: string) => string | null): P {
  const engineRotated = { ...(prefs.engineRotated ?? {}) };
  if (!engineRotated[anchor] || !prefs.substitutes[anchor]) return prefs;
  const substitutes = { ...prefs.substitutes };
  const leaveItsByMuscle = { ...prefs.leaveItsByMuscle };
  delete substitutes[anchor]; // the rotation is undone — the assembler goes back to her lift
  delete engineRotated[anchor]; // …and it is no longer a rotation anyone can resist twice
  const m = muscleOfExercise(anchor);
  if (m) leaveItsByMuscle[m] = anchor; // the leave-it she just earned — identical to the S-71 fold's write
  return { ...prefs, substitutes, engineRotated, leaveItsByMuscle };
}
