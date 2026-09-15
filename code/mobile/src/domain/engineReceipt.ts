/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ENGINE'S RECEIPT — its decisions, counted, and the fixed plan it is not (2026-09-01, audit M2).
 *
 * The product sells DECISIONS, and decisions are invisible: nobody can see the weight they did not
 * lift. But the decisions are all IN HER LOG — every `SetLog` carries `recommendedWeight`, the
 * engine's actual word at the moment of the set — so the receipt needs no new storage, no replay
 * and no theory. It is arithmetic over what was prescribed and what was done:
 *
 *   · DECISIONS — every occurrence of a lift after its first is one decision told (L7: a decision
 *     at the end of every workout). Counted, not estimated.
 *   · RAISES / HOLDS / EASES — the direction the prescription moved between consecutive
 *     occurrences of the same lift. The same three verdicts the why-sheet already colours.
 *   · THE COUNTERFACTUAL — where a plan of "one step every session" (the fixed progression every
 *     spreadsheet ships) would stand on her most-worked lift today, next to where the engine
 *     actually stands. **Both numbers are checkable**: the fixed figure is a stated rule applied
 *     to her own log's first prescription; the engine figure is read off her latest set. No claim
 *     about her body is made — the sentence compares two prescriptions, and the reader draws the
 *     conclusion. That is what keeps it inside the voice law ("never a number that was not
 *     measured"): every number here is either logged or is the named rule's own arithmetic.
 *
 * ── WHY THE FIXED RULE IS +1 RUNG PER OCCURRENCE ────────────────────────────────────────────────
 * It is the strongest honest opponent. "Linear progression, one increment per session" is what a
 * notebook, a spreadsheet template and most of the category actually prescribe; picking a weaker
 * strawman would make the receipt propaganda. The increment is the lift's own equipment grain
 * (B-6) — the same step the engine itself uses — so the two columns differ only in WHO decided.
 *
 * Pure & I/O-free. Same history in, same receipt out.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import type { Session } from '@/data/local/models';
import { exerciseMeta } from '@/engine/catalog';
import { STARTING_INCREMENT } from '@/engine/v5/constants';

export interface EngineReceipt {
  /** Decisions told: occurrences beyond the first, per lift, summed. */
  decisions: number;
  raises: number;
  holds: number;
  eases: number;
  /**
   * The sharpest divergence between the fixed plan and the engine, or null when they have not
   * meaningfully parted (fewer than `MIN_OCCURRENCES` on every lift, or under 2 grains apart —
   * a receipt that says "they differ by half a kilo" proves nothing).
   */
  counterfactual: {
    exerciseId: string;
    occurrences: number;
    /** Where "+1 step per session" from her own first prescription would stand today. */
    fixedKg: number;
    /** Where the engine actually stands — her latest prescription on this lift. */
    engineKg: number;
  } | null;
}

const EPS = 1e-6;
const MIN_OCCURRENCES = 4; // under four sessions of a lift, two plans have not had time to differ

/** Per lift, the prescribed load of each occurrence, oldest → newest (first working set's word). */
function prescriptionRuns(history: readonly Session[]): Map<string, number[]> {
  const ordered = [...history].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const runs = new Map<string, number[]>();
  for (const s of ordered) {
    const seenThisSession = new Set<string>();
    for (const log of s.sets) {
      if (log.isApproach || seenThisSession.has(log.exerciseId)) continue;
      if (log.recommendedWeight == null || log.recommendedWeight <= 0) continue;
      seenThisSession.add(log.exerciseId);
      const run = runs.get(log.exerciseId) ?? [];
      run.push(log.recommendedWeight);
      runs.set(log.exerciseId, run);
    }
  }
  return runs;
}

export function engineReceipt(history: readonly Session[]): EngineReceipt {
  const runs = prescriptionRuns(history);
  let decisions = 0;
  let raises = 0;
  let holds = 0;
  let eases = 0;
  let best: EngineReceipt['counterfactual'] = null;
  let bestGap = 0;

  for (const [exerciseId, run] of runs) {
    for (let i = 1; i < run.length; i++) {
      decisions += 1;
      const d = run[i] - run[i - 1];
      if (d > EPS) raises += 1;
      else if (d < -EPS) eases += 1;
      else holds += 1;
    }
    if (run.length < MIN_OCCURRENCES) continue;
    const grain = STARTING_INCREMENT[exerciseMeta(exerciseId).equipment] || 2.5;
    const fixedKg = run[0] + (run.length - 1) * grain;
    const engineKg = run[run.length - 1];
    const gap = Math.abs(fixedKg - engineKg);
    if (gap < 2 * grain - EPS) continue; // under two grains apart, there is no story
    if (gap > bestGap) {
      bestGap = gap;
      best = { exerciseId, occurrences: run.length, fixedKg, engineKg };
    }
  }

  return { decisions, raises, holds, eases, counterfactual: best };
}
