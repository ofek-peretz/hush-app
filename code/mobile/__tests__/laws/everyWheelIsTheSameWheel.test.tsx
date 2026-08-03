/**
 * THE WHEEL — one size everywhere, no numeral ever truncated, the whole control takes the swipe.
 *
 * ── Why this file exists at all ────────────────────────────────────────────────────────────────
 * `WheelPicker`'s header has claimed since 2026-07-28 that "`everyWheelIsTheSameWheel` holds this
 * shut". **There was no such test.** The ruling was written down and never enforced: the `md` and
 * `lg` tables only happened to hold the same numbers, and nothing stopped the next edit to either
 * screen from splitting them again — which is precisely the drift the comment says it prevents.
 *
 * It also pins the two defects the founder photographed in build 36:
 *
 *   · **C.2** — the onboarding ruler drew "82…". The active numeral is 48px mono in a cell sized by
 *     the DETENT PITCH, and a `numberOfLines={1}` Text truncates the moment the value outgrows its
 *     cell. Four glyphs ("82.5") already did.
 *   · **C.3** — the header also claimed "the whole control takes the swipe — a sweating hand in a
 *     gym should not have to land inside a 44pt box". It did not: the scroller sat inside a
 *     fixed-height numeral row, so the engraved graduation — the part that LOOKS like a ruler — was
 *     dead to touch and the founder had to press the numeral itself.
 *
 * These are STRUCTURAL assertions, deliberately. There is no layout engine under
 * react-test-renderer and the web harness cannot report a native gesture region, so the honest
 * thing to check is the geometry the component declares.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import { Text } from 'react-native';
import { WheelPicker, WHEEL_HEIGHT } from '@/components/ds/WheelPicker';

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

/** A wheel at the widest thing the engine prescribes: a decimal load, five glyphs. */
function draw(size: 'md' | 'lg', value = 137.5): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <WheelPicker value={value} onChange={() => {}} step={0.5} min={0} max={500} size={size} label="Load" />,
    );
  });
  mounted.push(r);
  // The track only renders once the control has been measured.
  act(() => {
    r.root.findAllByType(View)[1]?.props?.onLayout?.({ nativeEvent: { layout: { width: 390, height: WHEEL_HEIGHT[size] } } });
  });
  return r;
}

/** Flatten whatever style shape a node carries into one object. */
const flat = (s: unknown): Record<string, unknown> =>
  (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;

describe('one wheel, one size, everywhere', () => {
  it('md and lg resolve to the SAME height — the 2026-07-28 ruling, now actually enforced', () => {
    expect(WHEEL_HEIGHT.md).toBe(WHEEL_HEIGHT.lg);
  });

  it('and to the same numeral geometry, so a call site cannot pick the wrong one', () => {
    const sizes = (['md', 'lg'] as const).map((s) => {
      const r = draw(s);
      const cells = r.root.findAllByType(ScrollView)[0].findAllByType(View).map((v) => flat(v.props.style).width);
      return { widest: Math.max(...cells.filter((w): w is number => typeof w === 'number')) };
    });
    expect(sizes[0]).toEqual(sizes[1]);
  });
});

describe('the numeral is never truncated (C.2)', () => {
  it("gives the numeral a box WIDER than its detent cell, so '82.5' cannot become '82…'", () => {
    const r = draw('md', 82.5);
    const scroller = r.root.findAllByType(ScrollView)[0];
    // Every numeral sits in a detent-pitch cell; the Text inside carries its own, wider box.
    const texts = scroller.findAllByType(Text);
    const numeralBoxes = texts
      .map((t) => flat(t.props.style).width)
      .filter((w): w is number => typeof w === 'number');
    const cellWidths = scroller
      .findAllByType(View)
      .map((v) => flat(v.props.style).width)
      .filter((w): w is number => typeof w === 'number' && w > 0 && w < 200);

    expect(numeralBoxes.length).toBeGreaterThan(0);
    // The numeral's own box must exceed the pitch, or a long value clips inside its cell.
    expect(Math.max(...numeralBoxes)).toBeGreaterThan(Math.min(...cellWidths));
  });

  it('centres that wider box on the cell, so the readout does not drift off the strike mark', () => {
    const r = draw('md', 82.5);
    const texts = r.root.findAllByType(ScrollView)[0].findAllByType(Text);
    // Note the shape: a `for` loop that skips numerals without a declared box would pass with the
    // box removed entirely. Collect them instead, then require that some exist AND that every one
    // is centred — symmetric negative margins. An asymmetric pair would shift the number off the
    // moss tick that is supposed to be striking it.
    const boxed = texts
      .map((t) => flat(t.props.style) as { width?: number; marginHorizontal?: number })
      .filter((st) => typeof st.width === 'number');
    expect(boxed.length).toBeGreaterThan(0);
    for (const st of boxed) expect(st.marginHorizontal).toBeLessThan(0);
  });
});

describe('the whole control takes the swipe (C.3)', () => {
  it('the scroller is not boxed into a fixed-height row', () => {
    const r = draw('lg');
    const scroller = r.root.findAllByType(ScrollView)[0];
    // Its parent is the touch surface. A declared pixel height there is the bug: it is what left
    // the graduation below it outside the gesture.
    const row = flat(scroller.parent?.props?.style) as { height?: number; flex?: number };
    expect(row.height).toBeUndefined();
    expect(row.flex).toBe(1);
  });

  it('the graduation itself takes no touches, so it cannot swallow the gesture it invites', () => {
    const r = draw('lg');
    // Specifically the layer that HOLDS the graduation. Matching "any View wrapping an Svg" would
    // pass on the end chevrons, which wrap an Icon, were always pointer-transparent, and were never
    // the problem. The tick layer is the one pinned to the foot of the frame — a numeric `bottom`.
    const tickLayer = r.root
      .findAllByType(View)
      .filter((v) => v.findAllByType(Svg).length > 0)
      .find((v) => typeof (flat(v.props.style) as { bottom?: number }).bottom === 'number');
    expect(tickLayer).toBeDefined();
    expect(tickLayer!.props.pointerEvents).toBe('none');
  });
});

describe('⛔ the track draws WITHOUT being measured first', () => {
  /*
   * FOUNDER, BUILD 40: *"on the edit-exercise screen the numbers have vanished from the rulers."*
   *
   * The track was `{width > 0 ? <ScrollView …> : null}`, and `width` came from an `onLayout`. When
   * that measurement did not arrive, the wheel drew its frame, its graduation and its carets — and
   * not one numeral, ever. Measured in the browser: the numeral row was 334px wide with **zero**
   * children, on the editor and on a bare wheel alike.
   *
   * The gate bought nothing. `itemW` is a CONSTANT — every offset, detent and index calculation is
   * independent of the measured width. `width` feeds only `sidePad`, which already falls back to 0.
   *
   * ── ⚠️ AND WHY EVERY TEST ABOVE STAYED GREEN THROUGH IT ─────────────────────────────────────
   * `draw()` calls `onLayout` ITSELF, with a hard-coded 390 — it supplies the exact input that was
   * missing in the real app. A harness that provides the broken step tests everything except the
   * break. So this one mounts the wheel and NEVER measures it, which is the state a real screen was
   * actually in.
   */
  it('renders its numerals with no onLayout at all', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = renderer.create(
        <WheelPicker value={137.5} onChange={() => {}} step={0.5} min={0} max={500} size="lg" label="Load" />,
      );
    });
    mounted.push(r);
    // NO onLayout fired — this is the whole point.
    const drawn = r.root.findAllByType(Text).map((t) => t.props.children).filter((c) => typeof c === 'string' || typeof c === 'number');
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.map(String)).toContain('137.5');
  });
});
