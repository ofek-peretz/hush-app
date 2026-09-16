/**
 * Hush Engine v5 · Revision 7 — learned exercise selection (register Part 9, section B). PURE CORE.
 *
 * A repeated in-workout swap becomes a standing replacement (S-69, K = F-14 = 2). One swap declares
 * nothing (S-68); two CONSECUTIVE swaps to the same target adopt it; the blueprint original is always
 * offered first afterwards (S-70), so a wrong adoption is cheaply reversible — swapping back to the
 * original twice clears it.
 *
 * This module is the deterministic DECISION LOGIC only — no I/O, no wall-clock, no RNG (I-24/I-25).
 * It is keyed by the blueprint ANCHOR (the exercise the assembler would pick before any learning),
 * recovered from the substitutes map itself, so it needs nothing from the assembler to be correct.
 *
 * ✅ WIRED (2026-07-16). `domain/swapLearning.foldSessionSwaps` turns a finished session into
 * occurrences and folds them here (sessionStore.finishSession); `programAssembly.pickExercises`
 * reads the resulting `substitutes` at every regeneration; `domain/swapPool.swapCandidates` offers
 * the blueprint anchor first (S-70); and `learnedLeaveIts` + `engineChanges` carry S-71/S-72. The
 * old "NOT WIRED YET" header outlived the wiring by a year of commits — the code is the authority.
 *
 * `swapMenuOrder` below is the pure statement of S-70. The live menu applies the same rule inside
 * `swapPool.swapCandidates` (where the admissibility gates live), so this one is the tested
 * reference, not a second implementation anything calls.
 */
import { ADOPT_THRESHOLD } from './constants';

export interface SwapLearning {
  /** anchor exerciseId (the blueprint's pick) → the standing replacement currently offered (S-69). */
  substitutes: Record<string, string>;
  /** anchor → the pending replacement being accumulated, not yet adopted (S-68). */
  pending: Record<string, { target: string; count: number }>;
}

export const emptyLearning = (): SwapLearning => ({ substitutes: {}, pending: {} });

/**
 * One occurrence: the exercise the programme OFFERED, and the one she actually PERFORMED (the swap can
 * only happen before the first set, so a performed set is the fact — S-68). `performed === offered`
 * means no swap.
 */
export interface SwapOccurrence {
  offered: string;
  performed: string;
}

/**
 * The blueprint ANCHOR behind a currently-offered exercise: the substitutes key whose value is
 * `offered`, or `offered` itself when it is not a learned substitute. Deterministic (insertion order).
 *
 * WIRING INVARIANT: substitute VALUES are assumed unique within a state — no two blueprint roles adopt
 * the same exercise. The assembler already guarantees one exercise per role per session (the swap pool
 * excludes same-session lifts), so this holds; the wiring must preserve it. If it were ever violated,
 * the first matching anchor wins and a swap could be misattributed.
 */
export function anchorOf(state: SwapLearning, offered: string): string {
  for (const anchor in state.substitutes) if (state.substitutes[anchor] === offered) return anchor;
  return offered;
}

/** The exercise the programme should currently offer for a blueprint anchor (S-69 result). */
export function offeredFor(state: SwapLearning, anchor: string): string {
  return state.substitutes[anchor] ?? anchor;
}

/**
 * Fold one occurrence into the learning state (pure; call oldest→newest). Returns a new state.
 *   • no swap (performed === offered)        → any pending toward a change RESETS (S-68).
 *   • swap to a NEW/first target             → pending starts at 1 (S-68).
 *   • swap to the SAME target as last time   → pending increments; at K it ADOPTS (S-69).
 *   • the target IS the anchor (a swap back) → at K it CLEARS the substitute — the original returns.
 */
export function applyOccurrence(state: SwapLearning, occ: SwapOccurrence): SwapLearning {
  const substitutes = { ...state.substitutes };
  const pending = { ...state.pending };
  const anchor = anchorOf(state, occ.offered);

  if (occ.performed === occ.offered) {
    delete pending[anchor]; // she took what was offered — no standing change is building
    return { substitutes, pending };
  }

  const cur = pending[anchor];
  const count = cur && cur.target === occ.performed ? cur.count + 1 : 1;

  if (count >= ADOPT_THRESHOLD) {
    delete pending[anchor];
    if (occ.performed === anchor) delete substitutes[anchor]; // re-adopted the blueprint → offer it again (S-70)
    else substitutes[anchor] = occ.performed; //                 adopt the standing replacement (S-69)
    return { substitutes, pending };
  }
  pending[anchor] = { target: occ.performed, count };
  return { substitutes, pending };
}

/** Fold a whole occurrence stream (oldest→newest) — convenience for tests and batch reads. */
export function foldOccurrences(occs: SwapOccurrence[], initial: SwapLearning = emptyLearning()): SwapLearning {
  return occs.reduce(applyOccurrence, initial);
}

/**
 * Order a swap menu so the blueprint ANCHOR is offered FIRST once a substitute is standing (S-70 —
 * the perpetual re-test). When nothing is adopted for this slot, the engine's own candidate order
 * stands. `offered` is what is currently on the plan; `candidates` is the same-muscle pool.
 */
export function swapMenuOrder(state: SwapLearning, offered: string, candidates: string[]): string[] {
  const anchor = anchorOf(state, offered);
  if (anchor === offered) return candidates; // no adoption in play — leave the engine's order
  return [anchor, ...candidates.filter((c) => c !== anchor)];
}
