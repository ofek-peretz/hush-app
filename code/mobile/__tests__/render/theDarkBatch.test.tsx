/**
 * FOUR THINGS THAT LOOKED WRONG ON A DARK STAGE — founder A.1 · A.8 · C.1 · C.5.
 *
 * They arrived as four separate complaints and they are one story: values chosen when this app was
 * a LIGHT instrument, carried unchanged into v7's all-dark stage, where each of them is wrong in a
 * different way.
 *
 *   A.1  the keyboard. iOS defaults it to light, so the one place the athlete types raised a white
 *        slab under the darkest screen in the product.
 *   A.8  the share door. Lit moss on near-black is plenty of contrast — what was missing is that a
 *        hairline glyph with no surface under it does not read as a thing to press.
 *   C.1  the health toggle flipped a `useState` that gated `disabled` on three controls, so a
 *        round trip that usually resolves in a frame stepped the whole screen through its
 *        disabled state and back.
 *   C.5  the sheet scrim, 0.7, chosen on the argument that "at 0.55 the screen behind stayed
 *        legible" — true of paper, and on the dark stage it takes the pause screen to near-black.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { TextField } from '@/components/ds';
import { HomeView, type HomeViewProps } from '@/screens/home/HomeView';
import { ConnectHealth } from '@/screens/onboarding/ConnectHealth';
import { SCRIM_OPACITY } from '@/components/BottomSheet';
import { initI18n, tg } from '@/i18n';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];
function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  mounted.push(r);
  return r;
}
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const flat = (s: unknown): Record<string, unknown> | undefined =>
  Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : (s as Record<string, unknown>);

/* ══════════════════════════ A.1 ══════════════════════════ */

describe('the keyboard belongs to the stage', () => {
  it('the app’s one input asks for a dark keyboard', () => {
    const r = mount(<TextField label="Name" value="" onChangeText={() => {}} />);
    const inputs = r.root.findAll((n) => n.props?.placeholderTextColor !== undefined);
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((n) => n.props.keyboardAppearance === 'dark')).toBe(true);
  });
});

/* ══════════════════════════ A.8 ══════════════════════════ */

function homeProps(over: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
    resting: false,
    dayName: 'Upper A',
    dayId: 'd0',
    muscles: '',
    trainedThisWeek: 0,
    startError: false,
    weekNumber: 1,
    plan: null,
    units: 'kg',
    onForm: () => {},
    workouts: [{ id: 'd0', name: 'Upper A', muscles: '' }],
    brief: null,
    briefCount: null,
    briefUnseen: false,
    onStart: () => {},
    onChooseWorkout: () => {},
    onWeeklyUpdate: () => {},
    onShare: () => {},
    ...over,
  };
}

/**
 * "The two-people icon is swallowed by the background — effectively invisible."
 *
 * The fix is not a brighter colour (it is already the accent, on the darkest surface the palette
 * has). It is that a control needs a BODY: a 34 px touch target with nothing drawn in it reads as
 * decoration beside the wordmark, and a thumb never goes there.
 */
describe('the share door reads as a control', () => {
  it('has a surface under its glyph, not just a hit box', () => {
    const r = mount(<HomeView {...homeProps()} />);
    const door = r.root.findAll(
      (n) => n.props?.accessibilityLabel === tg('planShare.title') && typeof n.props.onPress === 'function',
    )[0];
    expect(door).toBeTruthy();
    const style = flat(typeof door.props.style === 'function' ? door.props.style({ pressed: false }) : door.props.style);
    expect(style?.backgroundColor).toBeTruthy();
    // …and it is still a circle the size of the target, not a box grown to be noticed.
    expect(style?.width).toBe(34);
    expect(style?.borderRadius).toBe(17);
  });

  it('and it is gone entirely when there is nothing to share', () => {
    const r = mount(<HomeView {...homeProps({ onShare: undefined })} />);
    expect(r.root.findAll((n) => n.props?.accessibilityLabel === tg('planShare.title'))).toHaveLength(0);
  });
});

/* ══════════════════════════ C.1 ══════════════════════════ */

const nav = { navigate: () => {}, goBack: () => {}, addListener: () => () => {}, canGoBack: () => true, setOptions: () => {} };

/**
 * The flicker was the screen's own chrome: `asking` was state, it gated `disabled` on the card,
 * on Continue and on Skip, and every press set it true and then false. The law is that pressing
 * the toggle changes NOTHING about what is pressable — the permission flow either returns in a
 * frame or is covered by a system sheet, and neither wants the screen to blink first.
 */
describe('the health toggle does not blink the screen', () => {
  const draw = () =>
    mount(<ConnectHealth navigation={nav as never} route={{ key: 'k', name: 'ConnectHealth', params: {} } as never} />);

  const disabledCount = (r: ReactTestRenderer): number =>
    r.root.findAll((n) => n.props?.disabled === true || n.props?.accessibilityState?.disabled === true).length;

  it('nothing on the screen is disabled before the press', () => {
    expect(disabledCount(draw())).toBe(0);
  });

  it('…and nothing is disabled while the permission flow is in flight', () => {
    const r = draw();
    const card = r.root.findAll(
      (n) => n.props?.accessibilityRole === 'switch' && typeof n.props.onPress === 'function',
    )[0];
    expect(card).toBeTruthy();
    act(() => card.props.onPress());
    // The promise has NOT resolved here — this is exactly the window the old code spent disabled.
    expect(disabledCount(r)).toBe(0);
  });
});

/* ══════════════════════════ C.5 ══════════════════════════ */

/**
 * "13.1 Pause + End sheet — the screen is faded."
 *
 * 0.7 was tuned on 2026-07-12 against the light instrument, where the screen behind a sheet was
 * paper and genuinely stayed readable at 0.55. On the v7 stage, 70% black over `#131210` lands
 * near `#050504`: the paused screen does not recede, it goes out. A scrim only has to say "this
 * is behind now", and on a near-black stage that costs far less.
 */
describe('a scrim over the dark stage suppresses, it does not extinguish', () => {
  it('the pause screen is still visibly there behind the sheet', () => {
    expect(SCRIM_OPACITY).toBeLessThanOrEqual(0.5);
    // …and it is still a scrim: below about a third it stops separating the sheet from the stage.
    expect(SCRIM_OPACITY).toBeGreaterThanOrEqual(0.35);
  });
});
