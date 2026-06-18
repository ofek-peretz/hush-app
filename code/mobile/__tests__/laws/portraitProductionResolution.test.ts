/**
 * RECONSTRUCTED 2026-06-18 — the original (untracked) file was deleted in error
 * during the spec rebuild; rebuilt to cover the same surface from receiptRules +
 * portrait domain. Validates the PRODUCTION Portrait resolver
 * (`resolvePortraitForecasts`) that runs at every program construction inside
 * appStore.recordSessionCompleted — preserving the asymmetry (loud once when
 * right, silent on void/pending) over the whole forecast list.
 */
import type { Capability, ForecastRecord, PortraitSnapshot } from '@/data/local/models';
import { buildPortraitForecast } from '@/domain/portrait';
import { resolvePortraitForecasts } from '@/domain/receiptRules';

function snap(
  per: Record<Capability, number>,
  conf: Record<Capability, number>,
  ts: string,
): PortraitSnapshot {
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
const pending = buildPortraitForecast(unlock, 'pf1', NOW)!; // bound to horizontal_pull, target ~0.55

describe('production Portrait resolution (resolvePortraitForecasts)', () => {
  it('HIT when the gap closes → flips to HIT, surfaces exactly one receipt', () => {
    const later = snap({ ...unlock.perCapability, horizontal_pull: 0.6 }, unlock.confidence, '2026-09-01T00:00:00Z');
    const r = resolvePortraitForecasts([pending], later);
    expect(r.changed).toBe(true);
    expect(r.receipt).toEqual({ capability: 'horizontal_pull' });
    expect(r.forecasts[0].state).toBe('HIT');
  });

  it('stays PENDING (silent, unchanged) while the gap is open — no timed miss', () => {
    const later = snap({ ...unlock.perCapability, horizontal_pull: 0.5 }, unlock.confidence, '2026-12-01T00:00:00Z');
    const r = resolvePortraitForecasts([pending], later);
    expect(r.changed).toBe(false);
    expect(r.receipt).toBeNull();
    expect(r.forecasts[0].state).toBe('PENDING');
  });

  it('VOID (silent, no receipt) if the capability fell back to still-learning', () => {
    const lost = snap(
      { ...unlock.perCapability, horizontal_pull: 0.6 },
      { ...unlock.confidence, horizontal_pull: 20 },
      '2026-09-01T00:00:00Z',
    );
    const r = resolvePortraitForecasts([pending], lost);
    expect(r.changed).toBe(true); // state retired…
    expect(r.receipt).toBeNull(); // …but silently
    expect(r.forecasts[0].state).toBe('VOID');
  });

  it('never surfaces more than one receipt even with multiple closed commitments', () => {
    const second: ForecastRecord = { ...pending, id: 'pf2', capability: 'vertical_push', predictedValue: 0.25 };
    // vertical_push is still-learning in `unlock` (conf 22) → would VOID, not HIT; make it confident + closed.
    const later = snap(
      { ...unlock.perCapability, horizontal_pull: 0.6, vertical_push: 0.6 },
      { ...unlock.confidence, vertical_push: 80 },
      '2026-09-01T00:00:00Z',
    );
    const r = resolvePortraitForecasts([pending, second], later);
    expect(r.forecasts.filter((f) => f.state === 'HIT')).toHaveLength(2);
    expect(r.receipt).toEqual({ capability: 'horizontal_pull' }); // first HIT only
  });

  it('leaves non-portrait and already-resolved forecasts untouched', () => {
    const hold: ForecastRecord = { ...pending, id: 'h1', type: 'hold', state: 'PENDING' };
    const done: ForecastRecord = { ...pending, id: 'd1', state: 'HIT' };
    const later = snap({ ...unlock.perCapability, horizontal_pull: 0.6 }, unlock.confidence, '2026-09-01T00:00:00Z');
    const r = resolvePortraitForecasts([hold, done], later);
    expect(r.changed).toBe(false);
    expect(r.forecasts).toEqual([hold, done]);
  });
});
