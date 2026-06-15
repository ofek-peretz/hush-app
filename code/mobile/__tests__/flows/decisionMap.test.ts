/**
 * Real backend decision → client reason/forecast mapping (honest, no invention).
 * Vocabulary from sprint3a/decision.py.
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
  it('INCREASE_LOAD → increase reason + forecast at high confidence', () => {
    const m = mapDecision(why({ decision_type: 'INCREASE_LOAD', prediction_confidence: 'high', target_reps: 6 }));
    expect(m.reasonType).toBe('increase');
    expect(m.increaseForecastReps).toBe(6);
  });

  it('INCREASE_LOAD at medium confidence → reason but NO forecast (not actionable)', () => {
    const m = mapDecision(why({ decision_type: 'INCREASE_LOAD', prediction_confidence: 'medium' }));
    expect(m.reasonType).toBe('increase');
    expect(m.increaseForecastReps).toBeUndefined();
  });

  it('DECREASE_LOAD → decrease reason, never a forecast (R11)', () => {
    const m = mapDecision(why({ decision_type: 'DECREASE_LOAD' }));
    expect(m.reasonType).toBe('decrease');
    expect(m.increaseForecastReps).toBeUndefined();
  });

  it('KEEP_LOAD + fatigue_hold at high confidence → hold reason + horizonless forecast (#9)', () => {
    const m = mapDecision(why({ decision_type: 'KEEP_LOAD', decision_reason: 'fatigue_hold:reps_reduced,load_held', prediction_confidence: 'high' }));
    expect(m.reasonType).toBe('hold');
    expect(m.holdForecast).toBe(true);
  });

  it('KEEP_LOAD + fatigue_hold at medium confidence → hold reason but NO forecast (not actionable)', () => {
    const m = mapDecision(why({ decision_type: 'KEEP_LOAD', decision_reason: 'fatigue_hold:load_held', prediction_confidence: 'medium' }));
    expect(m.reasonType).toBe('hold');
    expect(m.holdForecast).toBeFalsy();
  });

  it('KEEP_LOAD default/low-confidence/conflict → SILENCE (no reason)', () => {
    for (const r of ['keep_load:default', 'keep_load:low_confidence', 'keep_load:evidence_conflict']) {
      expect(mapDecision(why({ decision_type: 'KEEP_LOAD', decision_reason: r })).reasonType).toBeUndefined();
    }
  });

  it('working_set seed and signal-only types → silence', () => {
    expect(mapDecision(why({ decision_type: 'KEEP_LOAD', decision_reason: 'working_set:target+RIR' })).reasonType).toBeUndefined();
    expect(mapDecision(why({ decision_type: 'REPLACE_EXERCISE' })).reasonType).toBeUndefined();
    expect(mapDecision(why({ decision_type: 'CHANGE_STRATEGY' })).reasonType).toBeUndefined();
  });
});
