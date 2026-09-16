/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A RULER SAYS WHAT IT MEASURES IN.
 *
 * ⛔ THE BODYWEIGHT WHEEL SHOWED A BARE NUMBER. The legend read "BODYWEIGHT", the wheel drew "70",
 * and no unit appeared anywhere on the screen — so an American athlete on a 66–550 pound wheel and
 * an Israeli on a 30–250 kilo wheel were looking at the same words. It is the one number the engine
 * seeds every opening load from; a silent unit there is a wrong first workout, not a cosmetic gap.
 *
 * ⚠️ AND THE UNIT RIDES ON THE LEGEND, NOT BESIDE THE DIGITS. `WheelPicker`'s own contract:
 * *"the unit is carried by the field's LEGEND ('WEIGHT · KG'), so no unit chip runs beside the
 * digits"*. A test that only asked "is 'kg' somewhere on the screen" would pass on the chip the
 * contract refuses, so this one asks the LEGEND, and asks the wheel's a11y label to match it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { AboutYou } from '@/screens/onboarding/AboutYou';
import { initI18n, tg } from '@/i18n';

/** The phone's own answer — the ONLY thing this screen resolves units from during the intake. */
let mockMeasurement: 'metric' | 'us' = 'metric';
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US', measurementSystem: mockMeasurement }],
}));

/* The profile is null for the whole intake — that is the point of the fix under test. */
jest.mock('@/state/stores/appStore', () => ({
  useApp: () => ({
    profile: null,
    pendingName: () => null,
    setPendingName: () => {},
    setPendingSex: () => {},
  }),
}));

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => { while (mounted.length) mounted.pop().unmount(); });
  mockMeasurement = 'metric';
});

function mount(): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AboutYou navigation={{ navigate: () => {}, goBack: () => {} }} route={{ params: {} }} />
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}

/** Every string the athlete actually reads on the rendered screen. */
function texts(r: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (n): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n.children) n.children.forEach(walk);
  };
  walk(r.toJSON());
  return out;
}

/** The bodyweight wheel, found the way VoiceOver finds it: an adjustable element. */
function weightWheel(r: ReactTestRenderer) {
  return r.root
    .findAll((n) => n.props?.accessibilityRole === 'adjustable', { deep: true })
    .find((n) => String(n.props.accessibilityLabel ?? '').toUpperCase().includes(tg('ob.weightLegend').toUpperCase()));
}

/** Asked lazily: `tg` has nothing to answer with until `initI18n` has run. */
const LEGEND = () => tg('ob.weightLegend').toUpperCase();

describe('the bodyweight ruler says what it measures in', () => {
  it('names kilos on the legend for a metric phone', () => {
    mockMeasurement = 'metric';
    const said = texts(mount()).join(' ').toUpperCase();
    expect(said).toContain(`${LEGEND()} · KG`);
    expect(said).not.toContain('· LB');
  });

  it('names pounds on the legend for a US phone', () => {
    mockMeasurement = 'us';
    const said = texts(mount()).join(' ').toUpperCase();
    expect(said).toContain(`${LEGEND()} · LB`);
    expect(said).not.toContain('· KG');
  });

  it('reads the same line to VoiceOver as it draws on the glass', () => {
    // The wheel's own label was "BODYWEIGHT" too, so a screen reader announced "70" with no unit
    // either. One string, one place, both readings.
    mockMeasurement = 'metric';
    expect(String(weightWheel(mount())?.props.accessibilityLabel ?? '')).toContain('kg');
  });

  /*
   * ⛔ THE DAYS WHEEL LEFT THIS SCREEN (founder 2026-08-29) — it belongs to the door that builds
   * the programme, not to the form. What this block guarded is that a unit suffix rides on the
   * legend of the wheel it MEASURES and on no other; with one wheel left, the way that can break
   * is the unit leaking onto a neighbouring legend, so that is what is asked now.
   */
  it('the unit rides on the weight legend and on nothing else on the screen', () => {
    mockMeasurement = 'metric';
    const said = texts(mount()).join(' ').toUpperCase();
    expect(said).toContain(`${LEGEND()} · KG`);
    expect(said).not.toContain(`${tg('ob.sexLegend').toUpperCase()} · KG`);
    // The frequency question is not asked here at all any more.
    expect(said).not.toContain(tg('ob.daysPerWeek').toUpperCase());
  });
});
