/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE BOX THE BODY LIVES IN IS THE BODY — founder, 2026-08-18.
 *
 *   *"אני רוצה שהוא יהיה ממוקם בראש המסך כמו שצריך כך שהגוף יתפרש על כל המסך מהרגע הראשון."*
 *
 * His two screenshots — the intake's map and the You tab — show the same fault: a hand's width of
 * empty black under the words, and the body slumped down onto the footer. The cause was three style
 * properties that cannot all be true at once:
 *
 *     { width: '100%', maxWidth: 220, aspectRatio: 200 / 440 }
 *
 * Yoga derives the HEIGHT from the full 100% width (378 pt in the You tab → 831 pt tall) and only
 * then clamps the width back to 220. The `<Svg>` fits its viewBox into that box and CENTRES it, so
 * the drawing was 220 × 484 with 173 pt of nothing above its head and 173 below its feet.
 *
 * ⚠️ AND IT WAS NOT ONLY AIR. The press rectangles are laid out as PERCENTAGES OF THE BOX, so they
 * were spread down 831 pt while the muscles were drawn in the middle 484 — every target off its
 * muscle by up to a hand's width. `bodyMapFigure` proves the geometry is right in units and
 * `bodyMapScreen` calls `onPress` directly, so neither of them could ever see this: it is a fault of
 * the BOX, and this file is the only place that reads it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { BodyMapFigure, STAGE_FLOOR_W } from '@/components/BodyMapFigure';
import { initI18n } from '@/i18n';

beforeAll(async () => {
  await initI18n();
});

/** The drawing board is 200 wide and 440 tall, and its box may never be anything else. */
const RATIO = 440 / 200;
const NOOP = () => {};

function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(el);
  });
  return r;
}

/**
 * Every style object in the tree, flattened.
 *
 * ⚠️ HOST NODES ONLY (`typeof type === 'string'`). A `<View>` appears twice in this tree — once as
 * the component and once as the view it renders — and counting the same box twice would make the
 * "exactly one box" check below fail on a perfectly good figure.
 */
function allStyles(r: ReactTestRenderer): Record<string, unknown>[] {
  return r.root
    .findAll((n) => typeof n.type === 'string' && n.props?.style != null, { deep: true })
    .map((n) => StyleSheet.flatten(n.props.style) ?? {});
}

/** The figure's own rectangle: the one box measured in points rather than in per cent. */
function stage(r: ReactTestRenderer): { width: number; height: number } {
  const boxes = allStyles(r).filter((s) => typeof s.width === 'number' && s.width >= 100 && typeof s.height === 'number');
  expect(boxes).toHaveLength(1); // two would mean nobody knows which one the athlete presses
  return { width: boxes[0].width as number, height: boxes[0].height as number };
}

/** The room's report of how much space it was given, which is the only thing the figure asks. */
function room(r: ReactTestRenderer, width: number, height: number): void {
  const measured = r.root.findAll((n) => typeof n.props?.onLayout === 'function', { deep: true });
  expect(measured.length).toBeGreaterThan(0);
  act(() => {
    measured[0].props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
  });
}

describe('⛔ the figure’s box is its drawing, never a taller one', () => {
  it('carries no `aspectRatio` at all — the property that made the box 831 pt tall', () => {
    const r = mount(<BodyMapFigure face="front" map={{}} onSelect={NOOP} />);
    const trap = allStyles(r).filter((s) => s.aspectRatio != null);
    expect(trap).toEqual([]);
  });

  it.each([
    ['before it has been measured', null],
    ['in a page that gives it a width', { w: 380, h: 900 }],
  ])('%s — the box is exactly 200 : 440, so the drawing fills it corner to corner', (_when, given) => {
    const r = mount(<BodyMapFigure face="front" map={{}} onSelect={NOOP} />);
    if (given) room(r, given.w, given.h);
    const box = stage(r);
    expect(box.height).toBeCloseTo(box.width * RATIO, 5);
  });

  it('a scroller’s child keeps to the floor width — the size it has always drawn at', () => {
    // Nothing bounds the height here, so growing to the page's full width would make a 900 pt body.
    const r = mount(<BodyMapFigure face="front" map={{}} onSelect={NOOP} />);
    room(r, 380, 4000);
    expect(stage(r).width).toBe(STAGE_FLOOR_W);
  });
});

describe('a screen that hands the body its box gets the body it asked for', () => {
  it('`fill` takes every point of the room — the whole screen, from the first moment', () => {
    const r = mount(<BodyMapFigure fill face="front" map={{}} onSelect={NOOP} />);
    room(r, 380, 700); // taller than it is wide × 2.2, so the HEIGHT is what binds
    const box = stage(r);
    expect(Math.round(box.height)).toBe(700);
    expect(box.width).toBeGreaterThan(STAGE_FLOOR_W); // …and larger than it ever drew before
  });

  it('…and a wide, short room binds on the width instead, never overflowing it', () => {
    const r = mount(<BodyMapFigure fill face="front" map={{}} onSelect={NOOP} />);
    room(r, 240, 4000);
    expect(stage(r).width).toBe(240);
  });

  it('⛔ but it never draws below the floor, whatever the room says', () => {
    /*
     * A 300 pt slot would fit a 136 pt body, and a 136 pt body has 30 pt targets on a 44 pt thumb —
     * `bodyMapFigure`'s floor law is stated in units and holds only while this width does.
     */
    const r = mount(<BodyMapFigure fill face="front" map={{}} onSelect={NOOP} />);
    room(r, 380, 300);
    expect(stage(r).width).toBe(STAGE_FLOOR_W);
    // …and the room grew with it, so the body does not spill over whatever the page drew beneath it.
    const floors = allStyles(r).filter((s) => s.minHeight === STAGE_FLOOR_W * RATIO);
    expect(floors.length).toBeGreaterThan(0);
  });

  it('a stated height is honoured — the You tab hands it the first screen', () => {
    const r = mount(<BodyMapFigure height={560} face="front" map={{}} onSelect={NOOP} />);
    room(r, 380, 560);
    const box = stage(r);
    expect(Math.round(box.height)).toBe(560);
    expect(box.height).toBeCloseTo(box.width * RATIO, 5);
  });
});
