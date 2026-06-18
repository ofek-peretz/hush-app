/**
 * Map the real backend's load decision (recommendation /why, contract §12) to
 * the client's reason/forecast model — HONEST mapping, no invention.
 *
 * Real vocabulary (sprint3a/decision.py):
 *   decision_type:  KEEP_LOAD | INCREASE_LOAD | DECREASE_LOAD | REPLACE_EXERCISE | CHANGE_STRATEGY
 *   decision_reason: working_set:* (seed) · fatigue_hold:* (the hard-no) ·
 *                    keep_load:{default|low_confidence|evidence_conflict} ·
 *                    increase_load:* · decrease_load:* · change_strategy:*
 *   prediction_confidence: "low" | "medium" | "high"   (high == actionable, ≥70)
 *
 * Rules applied (spec §5.2/§5.3):
 *   - reason line only on a CHANGE: INCREASE_LOAD / DECREASE_LOAD, or KEEP_LOAD
 *     ONLY when the reason is fatigue_hold (the hard-no). A plain keep
 *     (default/low_confidence/evidence_conflict) is silence — no reason.
 *   - increase carries a forecast at actionable ("high") confidence.
 *   - HOLD carries a HORIZONLESS forecast ("You'll pass it.") at actionable
 *     confidence. Horizonless was ratified 2026-06-14, so the held weight +
 *     target reps from /why are sufficient — no breakthrough-horizon contract is
 *     needed (the earlier dated form is obsolete; still no invention here).
 */
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
  increaseForecastReps?: number; // present => render "You'll get all N." (actionable only)
  holdForecast?: boolean; // true => stake the horizonless hold forecast ("You'll pass it.")
}

export function mapDecision(why: WhyResponse): MappedDecision {
  const actionable = why.prediction_confidence === 'high';
  switch (why.decision_type) {
    case 'INCREASE_LOAD':
      return {
        reasonType: 'increase',
        increaseForecastReps: actionable ? why.target_reps : undefined,
      };
    case 'DECREASE_LOAD':
      return { reasonType: 'decrease' }; // decreases carry no forecast (R11)
    case 'KEEP_LOAD':
      // Only a fatigue hold is a reason-worthy change (the hard-no). Other keeps
      // are silence. The hold carries a horizonless forecast at actionable
      // confidence (conviction or silence, R9).
      return why.decision_reason.startsWith('fatigue_hold')
        ? { reasonType: 'hold', holdForecast: actionable }
        : {};
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
