/**
 * End-to-end copy resolution for Portrait lines — proves the i18next nested
 * `$t(...)` params (capability names, state phrases, durations) resolve against
 * the real en.json, in first-person indicative with no hedging (spec §4.8, §5.1).
 */
import i18next, { type i18n as I18nType } from 'i18next';
import en from '@/i18n/locales/en.json';
import type { Capability, PortraitSnapshot } from '@/data/local/models';
import { compareProof } from '@/domain/portrait';

function snap(per: Record<Capability, number>, conf: Record<Capability, number>, ts: string): PortraitSnapshot {
  const stillLearning = Object.fromEntries(
    (Object.keys(per) as Capability[]).map((c) => [c, conf[c] < 30]),
  ) as Record<Capability, boolean>;
  return { timestamp: ts, perCapability: per, confidence: conf, stillLearning };
}

let i18n: I18nType;
beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false, skipOnVariables: false },
  });
});

const line = (l: { key: string; params?: Record<string, unknown> } | null) =>
  l ? i18n.t(l.key, l.params ?? {}) : null;

const baseline = snap(
  { horizontal_push: 0.4, horizontal_pull: 0.38, vertical_push: 0.35, knee_dominant: 0.42, hip_dominant: 0.3 },
  { horizontal_push: 45, horizontal_pull: 45, vertical_push: 45, knee_dominant: 45, hip_dominant: 45 },
  '2026-05-01T00:00:00Z',
);
const unlock = snap(
  { horizontal_push: 0.66, horizontal_pull: 0.44, vertical_push: 0.3, knee_dominant: 0.82, hip_dominant: 0.58 },
  { horizontal_push: 85, horizontal_pull: 75, vertical_push: 22, knee_dominant: 90, hip_dominant: 80 },
  '2026-06-12T00:00:00Z',
);

describe('resolved Portrait copy', () => {
  it('compare proof is a plain factual sentence with NO timeframe', () => {
    const text = line(compareProof(baseline, unlock));
    expect(text).toContain('hip hinge');
    expect(text).toContain('went from your weakest to');
    expect(text).not.toMatch(/week|month|day/i); // horizonless
    expect(text).not.toMatch(/!/);
  });
});
