/**
 * Advisory voice rendering (spec §4.4, §4.7, §5.2, §5.3). Reason and forecast
 * lines resolve in ADVISORY from a changed target; they are absent without a
 * change and always absent in CALIBRATING (the mode gate).
 */
import i18next, { type i18n as I18nType } from 'i18next';
import en from '@/i18n/locales/en.json';
import type { SetTarget } from '@/data/local/models';
import { reasonLine, forecastLine, weightHasReason } from '@/domain/voice';

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
  forecast: { type: 'increase', capability: 'horizontal_push', predictedValue: 42.5, predictedReps: 8, dueSessionOrDate: 'same-session' },
};
const held: SetTarget = {
  exerciseId: 'bb_overhead_press',
  setIndex: 0,
  recommendedWeight: 25,
  recommendedReps: 8,
  reasonType: 'hold',
  forecast: { type: 'hold', capability: 'vertical_push', predictedValue: 25, predictedReps: 8, dueSessionOrDate: '2026-08-01', weeks: 2 },
};
const unchanged: SetTarget = { exerciseId: 'bb_row', setIndex: 0, recommendedWeight: 40, recommendedReps: 8 };

describe('ADVISORY', () => {
  it('renders the increase reason + forecast, and the weight is tappable', () => {
    expect(line(reasonLine('ADVISORY', increased))).toBe('Up 2.5 from last time. You earned it.');
    expect(line(forecastLine('ADVISORY', increased))).toBe("You'll get all 8.");
    expect(weightHasReason('ADVISORY', increased)).toBe(true);
  });

  it('renders the hard-no hold reason + HORIZONLESS forecast (no timing)', () => {
    expect(line(reasonLine('ADVISORY', held))).toBe('Holding here — your recent sessions read as fatigue, not weakness.');
    // Horizonless conviction (ratified 2026-06-14): direction only, no weeks/dates.
    expect(line(forecastLine('ADVISORY', held))).toBe("You'll pass it.");
  });

  it('says nothing on an unchanged set — the weight is inert', () => {
    expect(reasonLine('ADVISORY', unchanged)).toBeNull();
    expect(forecastLine('ADVISORY', unchanged)).toBeNull();
    expect(weightHasReason('ADVISORY', unchanged)).toBe(false);
  });
});

describe('CALIBRATING is silent even when the target carries a change', () => {
  it('suppresses reason and forecast entirely', () => {
    expect(reasonLine('CALIBRATING', increased)).toBeNull();
    expect(forecastLine('CALIBRATING', held)).toBeNull();
    expect(weightHasReason('CALIBRATING', increased)).toBe(false);
  });
});
