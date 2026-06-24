/**
 * Real backend decision → client reason-line mapping (honest, no invention).
 * Vocabulary from sprint3a/decision.py. Only a load CHANGE earns a reason line;
 * every KEEP is silence. (No forecast/hold mapping — the Forecasts feature was removed.)
 */
import { mapDecision, type WhyResponse } from '@/data/api/decisionMap';

function why(p: Partial<WhyResponse>): WhyResponse {
  return {
    capability: 'horizontal_push',
    exercise: 'bb_bench_press',
    recommended_weight: 60,
    target_reps: 5,
    predicted_reps_to_failure: 6,
    prediction_confidence: 'high',
    decision_type: 'KEEP_LOAD',
    decision_reason: 'keep_load:default',
    ...p,
  };
}

describe('reason line only on a real change', () => {
  it('INCREASE_LOAD → increase reason', () => {
    expect(mapDecision(why({ decision_type: 'INCREASE_LOAD' })).reasonType).toBe('increase');
  });

  it('DECREASE_LOAD → decrease reason', () => {
    expect(mapDecision(why({ decision_type: 'DECREASE_LOAD' })).reasonType).toBe('decrease');
  });

  it('KEEP_LOAD (any reason, including fatigue_hold) → SILENCE (no reason)', () => {
    for (const r of ['keep_load:default', 'keep_load:low_confidence', 'keep_load:evidence_conflict', 'fatigue_hold:load_held', 'working_set:target+RIR']) {
      expect(mapDecision(why({ decision_type: 'KEEP_LOAD', decision_reason: r })).reasonType).toBeUndefined();
    }
  });

  it('signal-only types → silence', () => {
    expect(mapDecision(why({ decision_type: 'REPLACE_EXERCISE' })).reasonType).toBeUndefined();
    expect(mapDecision(why({ decision_type: 'CHANGE_STRATEGY' })).reasonType).toBeUndefined();
  });
});
