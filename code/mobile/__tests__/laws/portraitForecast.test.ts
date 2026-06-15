/**
 * The Portrait forecast → receipt loop (revised design; spec §5.3 R9/R10, §5.4).
 * The Portrait now makes a falsifiable eight-week claim and is bound by the same
 * asymmetry as every forecast: loud only when right, silent on miss/void.
 */
import type { Capability, PortraitSnapshot } from '@/data/local/models';
import { buildPortraitForecast } from '@/domain/portrait';
import { resolvePortrait } from '@/domain/receiptRules';

function snap(per: Record<Capability, number>, conf: Record<Capability, number>, ts: string): PortraitSnapshot {
  const stillLearning = Object.fromEntries(
    (Object.keys(per) as Capability[]).map((c) => [c, conf[c] < 30]),
  ) as Record<Capability, boolean>;
  return { timestamp: ts, perCapability: per, confidence: conf, stillLearning };
}

const NOW = '2026-06-13T00:00:00Z';
const unlock = snap(
  { horizontal_push: 0.62, horizontal_pull: 0.4, vertical_push: 0.3, knee_dominant: 0.55, hip_dominant: 0.82 },
  { horizontal_push: 85, horizontal_pull: 75, vertical_push: 22, knee_dominant: 80, hip_dominant: 90 },
  NOW,
);

describe('forecast creation (conviction rules)', () => {
  it('binds a HORIZONLESS forecast to the weakest ACTIONABLE capability', () => {
    const rec = buildPortraitForecast(unlock, 'pf1', NOW)!;
    expect(rec.type).toBe('portrait');
    expect(rec.capability).toBe('horizontal_pull'); // weakest with confidence >= 70
    expect(rec.weeks).toBeUndefined(); // no timing horizon
    expect(rec.dueSessionOrDate).toBe('open');
    expect(rec.state).toBe('PENDING');
    // Target = the capability immediately above it today (knee_dominant, 0.55).
    expect(rec.predictedValue).toBeCloseTo(0.55);
  });

  it('makes NO forecast when there is no actionable capability (silence)', () => {
    const lowConf = snap(
      { horizontal_push: 0.4, horizontal_pull: 0.4, vertical_push: 0.4, knee_dominant: 0.4, hip_dominant: 0.4 },
      { horizontal_push: 40, horizontal_pull: 40, vertical_push: 40, knee_dominant: 40, hip_dominant: 40 },
      NOW,
    );
    expect(buildPortraitForecast(lowConf, 'pf2', NOW)).toBeNull();
  });
});

describe('forecast resolution (horizonless asymmetry)', () => {
  const rec = buildPortraitForecast(unlock, 'pf1', NOW)!;

  it('HIT when the gap closes (whenever) → one receipt', () => {
    const later = snap({ ...unlock.perCapability, horizontal_pull: 0.6 }, unlock.confidence, '2026-09-01T00:00:00Z');
    const r = resolvePortrait(rec, later);
    expect(r.state).toBe('HIT');
    expect(r.receipt).toEqual({ key: 'portrait.receiptClosed' });
  });

  it('stays PENDING (silent, no receipt) while the gap is open — no timed miss', () => {
    const later = snap({ ...unlock.perCapability, horizontal_pull: 0.5 }, unlock.confidence, '2026-12-01T00:00:00Z');
    const r = resolvePortrait(rec, later);
    expect(r.state).toBe('PENDING');
    expect(r.receipt).toBeNull();
  });

  it('VOID (silent) if the capability fell back to still-learning', () => {
    const lost = snap(
      { ...unlock.perCapability, horizontal_pull: 0.6 },
      { ...unlock.confidence, horizontal_pull: 20 },
      '2026-09-01T00:00:00Z',
    );
    const r = resolvePortrait(rec, lost);
    expect(r.state).toBe('VOID');
    expect(r.receipt).toBeNull();
  });
});
