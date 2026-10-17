/**
 * Advisory voice rendering (spec §4.4, §5.2). The reason line resolves in ADVISORY
 * from a changed target; it is absent without a change and always absent in
 * CALIBRATING (the mode gate). (Forecast lines were removed with the Forecasts feature.)
 */
// @ts-nocheck

// 

import i18next, { type i18n as I18nType } from 'i18next';
import en from '@/i18n/locales/en.json';
import type { SetTarget } from '@/data/local/models';
import { reasonLine, weightHasReason } from '@/domain/voice';

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

const increased: SetTarget = {
  exerciseId: 'bb_bench_press',
  setIndex: 0,
  recommendedWeight: 42.5,
  recommendedReps: 8,
  reasonType: 'increase',
  reasonDelta: 2.5,
};
const decreased: SetTarget = {
  exerciseId: 'bb_back_squat',
  setIndex: 0,
  recommendedWeight: 80,
  recommendedReps: 8,
  reasonType: 'decrease',
  reasonDelta: 5,
};
const unchanged: SetTarget = { exerciseId: 'bb_row', setIndex: 0, recommendedWeight: 40, recommendedReps: 8 };

describe('ADVISORY', () => {
  it('renders the increase reason, and the weight is tappable', () => {
    expect(line(reasonLine('ADVISORY', increased))).toBe('Up 2.5 from last time. You earned it.');
    expect(weightHasReason('ADVISORY', increased)).toBe(true);
  });

  it('renders the decrease reason', () => {
    expect(line(reasonLine('ADVISORY', decreased))).toBe('Down 5 today. Three hard sessions in a row — this is the smart move.');
  });

  it('says nothing on an unchanged set — the weight is inert', () => {
    expect(reasonLine('ADVISORY', unchanged)).toBeNull();
    expect(weightHasReason('ADVISORY', unchanged)).toBe(false);
  });
});

describe('CALIBRATING is silent even when the target carries a change', () => {
  it('suppresses the reason entirely', () => {
    expect(reasonLine('CALIBRATING', increased)).toBeNull();
    expect(weightHasReason('CALIBRATING', increased)).toBe(false);
  });
});
