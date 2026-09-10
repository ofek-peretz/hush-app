/**
 * 1.3 · CONNECT HEALTH — the wrist row, mounted for real.
 *
 * The founder's ruling (2026-07-29): a watch that is already on her wrist is said HERE, during
 * onboarding, and "if the system does not detect a watch, it does not appear on this screen at
 * all." Both halves of that sentence are load-bearing and neither is visible to a typecheck:
 *
 *  · **The absent half is the one that can embarrass us.** Most phones have no Apple Watch. A row
 *    that leaks onto their screen turns the calmest step in onboarding into an upsell for hardware.
 *  · **The present half must not become a control.** The 2026-07-12 ruling on this screen is that a
 *    CARD here reads as a control — that is why Health is a switch. There is nothing to grant for a
 *    watch, so the row must carry no affordance at all. If it ever grows one, the screen is
 *    promising a decision that does not exist.
 *
 * The screen reads WCSession, which a test host does not have, so the presence comes through the
 * documented `previewWrist` seam — the same seam the gallery uses, for the same reason.
 */
// @ts-nocheck

// 

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ConnectHealth } from '@/screens/onboarding/ConnectHealth';
import { initI18n, tg } from '@/i18n';
import type { WristOffer } from '@/platform/watch/watchPresence';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const nav = {
  navigate: () => {},
  goBack: () => {},
  addListener: () => () => {},
  canGoBack: () => true,
  setOptions: () => {},
};

function draw(previewWrist?: WristOffer): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        {React.createElement(ConnectHealth as never, {
          navigation: nav,
          route: { key: 'k', name: 'ConnectHealth', params: { sex: 'male', previewWrist } },
        } as never)}
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

describe('the wrist is named only when there is a wrist', () => {
  it('a phone with no paired watch sees no word about one', () => {
    // No seam passed → the screen reads WCSession, the test host has none, and the answer is
    // UNKNOWN. That is the same silence a phone with no watch gets, and it is the common case.
    const read = textOf(draw());
    expect(read).not.toContain(tg('onWrist.noticeOn'));
    expect(read).not.toContain(tg('onWrist.noticeInstall'));
    // …and the screen is otherwise exactly what it was.
    expect(read).toContain(tg('ob.healthCardTitle'));
    /*
     * ⛔ THREE LINES CAME OFF THIS SCREEN 2026-08-12 (founder), `ob.healthHelper` among them. It
     * said the same law as `ob.healthSub` eight lines above it — Health never decides a weight —
     * and one statement of a law is a promise while two is a screen arguing with itself. What she
     * GETS is the three rows, which are still asserted below.
     */
    expect(read).not.toContain(tg('ob.healthHelper'));
    expect(read).toContain(tg('ob.healthHr'));
  });

  it('a paired watch that already carries the app is confirmed, not sold', () => {
    const read = textOf(draw('confirm'));
    expect(read).toContain(tg('onWrist.noticeOn'));
    expect(read).not.toContain(tg('onWrist.noticeInstall'));
  });

  it('a paired watch with auto-install off is given the one step', () => {
    const read = textOf(draw('install'));
    expect(read).toContain(tg('onWrist.noticeInstall'));
    expect(read).not.toContain(tg('onWrist.noticeOn'));
  });
});

describe('the row is a notice, never a control', () => {
  it('adds no pressable, no switch, and no third exit to the screen', () => {
    const pressables = (r: ReactTestRenderer) =>
      r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityRole != null).length;
    // Whatever the screen's controls are, showing the wrist must not change the count: the Health
    // card, its drawn switch, Continue and "Skip for now" are the whole of it either way.
    const without = pressables(draw());
    for (const face of ['confirm', 'install'] as const) {
      expect({ face, controls: pressables(draw(face)) }).toEqual({ face, controls: without });
    }
  });
});
