/**
 * Portrait logic (spec §4.8, §2.10, §7.10). No numbers ever leave these
 * functions; they decide strongest/lagging, still-learning, threshold crossings,
 * and the compare reference.
 */
import type { Capability, PortraitSnapshot } from '@/data/local/models';
import {
  strongestConfident,
  laggingConfident,
  isStillLearning,
  compareProof,
  commitmentLine,
  barFraction,
} from '@/domain/portrait';

function snap(
  per: Record<Capability, number>,
  conf: Record<Capability, number>,
  ts = '2026-06-13T00:00:00Z',
): PortraitSnapshot {
  const stillLearning = Object.fromEntries(
    (Object.keys(per) as Capability[]).map((c) => [c, conf[c] < 30]),
  ) as Record<Capability, boolean>;
  return { timestamp: ts, perCapability: per, confidence: conf, stillLearning };
}

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

describe('strength selection (confident only)', () => {
  it('commitment is built around the strongest CONFIDENT capability', () => {
    expect(strongestConfident(unlock)).toBe('knee_dominant');
  });
  it('a still-learning capability is never the strongest, even if scored high', () => {
    const tricky = snap(
      { horizontal_push: 0.4, horizontal_pull: 0.4, vertical_push: 0.99, knee_dominant: 0.4, hip_dominant: 0.4 },
      { horizontal_push: 80, horizontal_pull: 80, vertical_push: 10, knee_dominant: 80, hip_dominant: 80 },
    );
    expect(isStillLearning(tricky, 'vertical_push')).toBe(true);
    expect(strongestConfident(tricky)).not.toBe('vertical_push');
  });
  it('lagging is the weakest confident capability', () => {
    expect(laggingConfident(unlock)).toBe('horizontal_pull');
  });
  it('commitment line is null when nothing is confident yet', () => {
    const early = snap(
      { horizontal_push: 0.3, horizontal_pull: 0.3, vertical_push: 0.3, knee_dominant: 0.3, hip_dominant: 0.3 },
      { horizontal_push: 10, horizontal_pull: 10, vertical_push: 10, knee_dominant: 10, hip_dominant: 10 },
    );
    expect(commitmentLine(early)).toBeNull();
  });
});

describe('bars are RELATIVE to the strongest confident capability (Decision 2)', () => {
  it('the strongest confident capability is the 1.0 reference; others scale to it', () => {
    // unlock: knee 0.82 strongest confident; horizontal_pull 0.44.
    expect(barFraction(unlock, 'knee_dominant')).toBeCloseTo(1.0);
    expect(barFraction(unlock, 'horizontal_pull')).toBeCloseTo(0.44 / 0.82);
  });

  it('absolute scale is irrelevant — raw scores give the same relative bars', () => {
    const raw = snap(
      { horizontal_push: 60, horizontal_pull: 40, vertical_push: 30, knee_dominant: 80, hip_dominant: 55 },
      { horizontal_push: 85, horizontal_pull: 75, vertical_push: 80, knee_dominant: 90, hip_dominant: 80 },
    );
    expect(barFraction(raw, 'knee_dominant')).toBeCloseTo(1.0); // strongest confident
    expect(barFraction(raw, 'horizontal_push')).toBeCloseTo(60 / 80);
  });
});

describe('compare proof references the baseline-weakest capability', () => {
  it('builds a line about the capability that started weakest', () => {
    const line = compareProof(baseline, unlock);
    expect(line).not.toBeNull();
    expect(line!.key).toBe('portrait.compareProof');
    // hip_dominant was the weakest at baseline.
    expect(String(line!.params!.capability)).toContain('hip_dominant');
  });
});
