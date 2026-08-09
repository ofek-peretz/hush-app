/**
 * Map the real backend's load decision (recommendation /why, contract §12) to
 * the client's reason model — HONEST mapping, no invention.
 *
 * Real vocabulary (sprint3a/decision.py):
 *   decision_type:  KEEP_LOAD | INCREASE_LOAD | DECREASE_LOAD | REPLACE_EXERCISE | CHANGE_STRATEGY
 *   decision_reason: working_set:* (seed) · fatigue_hold:* (the hard-no) ·
 *                    keep_load:{default|low_confidence|evidence_conflict} ·
 *                    increase_load:* · decrease_load:* · change_strategy:*
 *
 * Rules applied (spec §5.2): a reason line only on a load CHANGE — INCREASE_LOAD
 * or DECREASE_LOAD. A KEEP_LOAD (any reason) is silence. (This mapper is part of
 * the dormant HTTP backend adapter; the live on-device v4 engine does not use it.)
 */
// @ts-nocheck

// 

import type { ReasonType } from '@/data/local/models';

export interface WhyResponse {
  capability: string;
  exercise: string;
  recommended_weight: number;
  /** C3: authoritative load this recommendation is measured against (prior recommended weight for
   *  the same exercise). null when no prior exists. Δ = recommended_weight − previous_weight. */
  previous_weight?: number | null;
  target_reps: number;
  predicted_reps_to_failure: number;
  prediction_confidence: 'low' | 'medium' | 'high';
  decision_type: string;
  decision_reason: string;
}

export interface MappedDecision {
  reasonType?: ReasonType; // undefined => no reason line (silence)
}

export function mapDecision(why: WhyResponse): MappedDecision {
  switch (why.decision_type) {
    case 'INCREASE_LOAD':
      return { reasonType: 'increase' };
    case 'DECREASE_LOAD':
      return { reasonType: 'decrease' };
    case 'KEEP_LOAD':
      // A keep is silence — no reason line.
      return {};
    default:
      // REPLACE_EXERCISE / CHANGE_STRATEGY / working_set seed => no reason line.
      //
      // FUTURE (Decision 3, 2026-06-14 — architecture must not block this; no impl now):
      // CHANGE_STRATEGY with a stagnation reason (change_strategy:stagnation_*) is the
      // hook for a RARE form-issue inference — "Your pull hasn't moved even though
      // everything around it has. This is sometimes a form issue worth a look." It would
      // be a new reason/inference line gated on a model signal; this mapper + the voice
      // layer can carry it without structural change. NOT technique coaching/videos.
      return {};
  }
}
