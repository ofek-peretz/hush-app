/**
 * 10.4 · ON YOUR WRIST — mounted for real, in both faces and both languages.
 *
 * The one thing this screen can get catastrophically wrong is CLAIMING something. The confirm face
 * says the app is already there; the install face says it is not, and names the one step. If the
 * two faces ever drew the same sentence — a `t()` key typo, a branch collapsed in a refactor — the
 * screen would tell somebody with an empty wrist to raise it at the rack, and no typecheck would
 * notice. So this asks what the athlete actually reads.
 *
 * It is also mounted in HEBREW, because the mono legend inside the card is the exact shape that
 * broke elsewhere: IBM Plex Mono has no Hebrew glyphs, and a legend routed through it falls back
 * mid-line. `Legend` chooses its face per string — this proves the Hebrew one is drawn in a face
 * that can draw it.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { OnYourWristView } from '@/screens/watch/OnYourWrist';
import { initI18n, setLocale, tg } from '@/i18n';
import { font } from '@/design/tokens';
import type { WristOffer } from '@/platform/watch/watchPresence';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => {
  await initI18n();
});

afterEach(async () => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
  await setLocale('en');
});

const mounted: ReactTestRenderer[] = [];

function draw(offer: WristOffer, onDone: () => void = () => {}): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <OnYourWristView offer={offer} onDone={onDone} />
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}

function textOf(r: ReactTestRenderer): string {
  return r.root
    .findAllByType(Text)
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
    })
    .join('\n');
}

describe('the two faces say two different things', () => {
  it('the confirm face states that the watch already has it, and never asks for an install', () => {
    const read = textOf(draw('confirm'));
    expect(read).toContain(tg('onWrist.title'));
    expect(read).toContain(tg('onWrist.sub'));
    expect(read).not.toContain(tg('onWrist.subInstall'));
  });

  it('the install face names the one step, and never claims the app is already there', () => {
    const read = textOf(draw('install'));
    expect(read).toContain(tg('onWrist.titleInstall'));
    expect(read).toContain(tg('onWrist.subInstall'));
    expect(read).not.toContain(tg('onWrist.sub'));
  });

  it('both faces list the same three things the wrist does — they are facts, not an upsell', () => {
    for (const offer of ['confirm', 'install'] as const) {
      const read = textOf(draw(offer));
      expect(read).toContain(tg('onWrist.willSet'));
      expect(read).toContain(tg('onWrist.willRest'));
      expect(read).toContain(tg('onWrist.willStandalone'));
    }
  });

  it('both faces carry the line that keeps the phone the authority', () => {
    for (const offer of ['confirm', 'install'] as const) {
      expect(textOf(draw(offer))).toContain(tg('onWrist.helper'));
    }
  });
});

describe('there is exactly one act', () => {
  it('the single button closes the screen', () => {
    const onDone = jest.fn();
    const r = draw('confirm', onDone);
    const buttons = r.root.findAll(
      (n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function',
    );
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.accessibilityLabel).toBe(tg('onWrist.done'));
    act(() => buttons[0].props.onPress());
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('Hebrew is drawn in a face that has Hebrew', () => {
  it("the card's mono legend falls back to the sans family rather than breaking mid-line", async () => {
    await act(async () => {
      await setLocale('he');
    });
    const r = draw('confirm');
    const legend = r.root
      .findAllByType(Text)
      .find((n) => String(n.props.children ?? '') === tg('onWrist.cardLegend').toUpperCase());
    expect(legend).toBeDefined();
    const family = [legend!.props.style].flat(3).reduce<string | undefined>(
      (acc, s) => (s && typeof s === 'object' && 'fontFamily' in s ? (s.fontFamily as string) : acc),
      undefined,
    );
    expect([font.sans, font.sansMedium, font.sansSemibold]).toContain(family);
  });
});
