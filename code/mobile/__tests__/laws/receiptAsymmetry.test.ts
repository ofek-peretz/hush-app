/**
 * THE ASYMMETRY (UX §5.8, spec §5.4): loud when right, silent when wrong.
 * These tests guard the single most trust-critical invariant in the product.
 */
import { resolveIncrease, resolveHold, voidForecast } from '@/domain/receiptRules';
import type { ForecastRecord, SetLog } from '@/data/local/models';

const baseRec: ForecastRecord = {
  id: 'f1',
  type: 'increase',
  capability: 'horizontal_push',
  predictedValue: 82.5,
  predictedReps: 6,
  dueSessionOrDate: 's1',
  state: 'PENDING',
};

function log(actualReps: number, actualWeight: number | null = 82.5): SetLog {
  return {
    exerciseId: 'bench',
    setIndex: 0,
    recommendedWeight: 82.5,
    recommendedReps: 6,
    actualWeight,
    actualReps,
    edited: false,
    persistedAt: '2026-06-13T00:00:00Z',
  };
}

describe('increase forecast resolution', () => {
  it('HIT when reps met → exactly one receipt, "clean" variant', () => {
    const r = resolveIncrease(baseRec, log(6));
    expect(r.state).toBe('HIT');
    expect(r.receipt).toEqual({ key: 'workout.receiptClean', params: { weight: 82.5 } });
  });

  it('HIT with extra reps → receipt uses reps variant', () => {
    const r = resolveIncrease(baseRec, log(8));
    expect(r.state).toBe('HIT');
    expect(r.receipt?.key).toBe('workout.receiptWithReps');
  });

  it('MISS when reps short → NO receipt, silent retire', () => {
    const r = resolveIncrease(baseRec, log(4));
    expect(r.state).toBe('MISS');
    expect(r.receipt).toBeNull();
  });

  it('MISS when zero reps → NO receipt', () => {
    const r = resolveIncrease(baseRec, log(0));
    expect(r.state).toBe('MISS');
    expect(r.receipt).toBeNull();
  });
});

describe('hold forecast resolution', () => {
  const holdRec: ForecastRecord = { ...baseRec, type: 'hold', predictedReps: 1 };

  it('HIT when athlete passes (exceeds) the held weight → receipt', () => {
    const r = resolveHold(holdRec, log(6, 85));
    expect(r.state).toBe('HIT');
    expect(r.receipt).not.toBeNull();
  });

  it('not passed when below the held weight → silent (no receipt)', () => {
    const r = resolveHold(holdRec, log(0, 80));
    expect(r.state).toBe('MISS');
    expect(r.receipt).toBeNull();
  });

  it('re-lifting the SAME held weight is NOT a pass → silent (self-resolution guard)', () => {
    // The held weight matched exactly (not exceeded). This guards against the
    // issuing set — or a later re-hold — falsely earning a receipt.
    const r = resolveHold(holdRec, log(8, 82.5));
    expect(r.state).toBe('MISS');
    expect(r.receipt).toBeNull();
  });

  it('exceeding the weight but short on reps is NOT a pass → silent', () => {
    const repsRec: ForecastRecord = { ...baseRec, type: 'hold', predictedReps: 6 };
    const r = resolveHold(repsRec, log(3, 85));
    expect(r.state).toBe('MISS');
    expect(r.receipt).toBeNull();
  });
});

describe('void', () => {
  it('is always silent', () => {
    const r = voidForecast();
    expect(r.state).toBe('VOID');
    expect(r.receipt).toBeNull();
  });
});
