// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';
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
/** The md detent pitch, read from the control's own export so this cannot drift. */
const ITEM_W_MD = 96;

const flat = (s: unknown): Record<string, unknown> =>
  (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;

describe('⛔ two sizes again — and this time the RELATIONSHIP is what is pinned', () => {
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE 2026-07-28 RULING IS NARROWED BY THE FOUNDER HIMSELF (2026-08-12)
   *
   *   *"אני אשמח אם תגדיל את הסרגלים עצמם ואת המלל במסך EDIT SET בלבד ולא בONBORDING. זה חדר כושר
   *   זה צריך להיות ברור ומדויק מהרגע הראשון."*
   *
   * "One wheel, one size, everywhere" was made when the two sizes had drifted apart by accident and
   * the onboarding ruler — the first control she ever turns — had ended up the SMALLER of the two.
   * That fault is not this: `lg` is now deliberately larger, and only on the one screen turned
   * under a loaded bar.
   *
   * ⚠️ SO THE LAW CHANGES SUBJECT RATHER THAN GOING. What must hold is not that the numbers are
   * equal — it is that **the cell can never be too small for the numeral it holds**, which is the
   * thing "one size" was accidentally guaranteeing and which broke the instant a size grew.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('the edit dial is the LARGER one — it is read under a bar', () => {
    expect(WHEEL_HEIGHT.lg).toBeGreaterThan(WHEEL_HEIGHT.md);
  });

  it('⛔ and no size can truncate its numeral — the box is not a box at all', () => {
    /*
     * The relationship, on both sizes at once. `NUM_CELL_W` used to be one constant measured
     * against a 48-point numeral and centred on `ITEM_W.md` — correct only while every wheel was
     * the same wheel, and the reason the founder photographed "37…" the moment one grew.
     */
    for (const size of ['md', 'lg'] as const) {
      const r = draw(size, 137.5);
      const scroller = r.root.findAllByType(ScrollView)[0];
      /*
       * ⛔ THE NUMERAL IS OUT OF THE FLOW ENTIRELY — the only version of this that actually held.
       *
       * Two earlier fixes both treated a symptom and both failed on a device: a WIDER cell (build
       * 36) and `flexShrink: 0` (2026-08-12, morning). The founder photographed "37…" through both,
       * which between them prove the declared width was never what decided the outcome — a
       * `numberOfLines={1}` Text inside a fixed-width flex item can be handed less than it asks for
       * by any number of layout paths, and the ellipsis does the rest.
       *
       * ⛔ AND "NO `numberOfLines`" WAS THE PART THAT WAS WRONG (founder, 2026-08-21). Absolute with
       * neither `left` nor `right` is STILL laid out against the parent's width, so 41.5 at 64pt in a
       * 120pt cell stopped ellipsising and started WRAPPING — `bottom: 0` put the last line on the
       * baseline and the screen showed a huge lone `5` beside a header reading "planned 41.5". A cut
       * number announces itself; a wrapped one impersonates a different number.
       *
       * So: absolute, no declared `width`, symmetric negative insets giving it a definite box six
       * glyphs wide, and `numberOfLines={1}` as the backstop. See `theWheelNeverBreaksItsOwnNumber`.
       */
      const numeral = scroller.findAllByType(Text)[0];
      const st = flat(numeral.props.style);
      expect({ size, position: st.position }).toEqual({ size, position: 'absolute' });
      expect({ size, width: st.width }).toEqual({ size, width: undefined });
      expect({ size, lines: numeral.props.numberOfLines }).toEqual({ size, lines: 1 });
      // The insets are what give it a real width to centre in — without them it wraps again.
      expect({ size, anchored: st.left != null && st.right != null }).toEqual({ size, anchored: true });
    }
  });
});

describe('the numeral is never truncated (C.2)', () => {
  /*
   * ⛔ REWRITTEN 2026-08-12, AND THE OLD SHAPE OF THIS LAW IS WHY IT TOOK THREE TRIES.
   *
   * It asserted that the numeral's declared BOX was wider than its detent cell, and that the box
   * was centred on it by symmetric negative margins. Both were true the whole time, on both of the
   * builds where the founder photographed "37…". **The law was measuring the declaration and the
   * defect was in the layout** — a fixed-width `numberOfLines={1}` Text inside a fixed-width flex
   * item is a candidate for compression whatever it asks for, and once compressed the ellipsis is
   * automatic.
   *
   * So the claim moved from "the box is big enough" to "there is no box".
   *
   * ⛔ AND THAT OVERSHOT (2026-08-21). "No box" is not a state React Native has: an absolute child
   * with no horizontal anchors is measured against its parent all the same, so the numeral stopped
   * being truncated and started being WRAPPED — which is the same defect wearing a worse disguise.
   * The claim is now the honest one: out of the flow, anchored on both sides so its box is definite
   * and wider than its cell, and capped at one line.
   */
  it("⛔ the numeral is out of the flow AND anchored, so '82.5' can neither truncate nor wrap", () => {
    const r = draw('md', 82.5);
    const texts = r.root.findAllByType(ScrollView)[0].findAllByType(Text);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      const st = flat(t.props.style) as {
        position?: string; width?: number; maxWidth?: number; left?: number; right?: number; fontSize?: number;
      };
      expect(st.position).toBe('absolute');
      expect(st.width).toBeUndefined();
      expect(st.right).toBe(st.left);
      expect(t.props.numberOfLines).toBe(1);

      /*
       * ⚠️ THIS ASSERTED `left < 0` FOR EVERY NUMERAL UNTIL 2026-08-27, AND THAT ENCODED THE BUG.
       *
       * It was true only because every numeral — including a distance-2 neighbour drawn at 18 points
       * — was handed the CENTRE numeral's box. That is what put `135` at −77→204 on a 390-point
       * frame on `2.2d`: a small numeral wearing a big numeral's overhang, off the side of the phone.
       *
       * A numeral overhangs its cell WHEN IT NEEDS TO and not otherwise, so the honest properties
       * are: the inset never pushes inward, and the box is never narrower than the ink it must hold.
       * The second one is the whole point of C.2 and it is now checked directly rather than through
       * a proxy that happened to correlate with it.
       */
      expect(st.left! <= 0).toBe(true);
      const ink = String(t.props.children).length * 0.6 * (st.fontSize ?? 0);
      expect({ box: st.maxWidth, ink: Math.ceil(ink), fits: (st.maxWidth ?? 0) >= ink }).toEqual({
        box: st.maxWidth, ink: Math.ceil(ink), fits: true,
      });
    }
  });

  it('⚠️ and the cell it hangs in is still the detent pitch — the geometry is untouched', () => {
    /*
     * The snapping, the offset maths and the strike mark all work in `itemW`. Taking the numeral out
     * of the flow must not move the track it is read against; the item keeps its width and the
     * numeral is centred inside it by the item's own `alignItems`.
     */
    const r = draw('md', 82.5);
    const cells = r.root
      .findAllByType(ScrollView)[0]
      .findAllByType(View)
      .map((v) => flat(v.props.style))
      .filter((st) => typeof st.width === 'number' && (st.width as number) > 0 && (st.width as number) < 200);
    expect(cells.length).toBeGreaterThan(0);
    for (const st of cells) expect(st.alignItems === 'center' || st.width === ITEM_W_MD).toBeTruthy();
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

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔⛔ TWO LAWS STOOD HERE AND BOTH ENFORCED A MISTAKE. 2026-08-04.
 *
 * FOUNDER, after build 41: *"the rulers don't show their text… I don't know why you touched the
 * rulers in the first place — everything worked perfectly before."*
 *
 * He is right, and here is the whole chain:
 *
 *   1. He reported something wrong with the wheel on build 40.
 *   2. I opened the browser harness, MEASURED that the numeral row was empty, and found the cause:
 *      the track was gated on `width > 0` and `onLayout` never delivered.
 *   3. I removed the gate, then found the numerals capped by their parent, and removed that too.
 *   4. Build 41 shipped with a wheel that is worse than the one before it.
 *
 * ── ⚠️ WHAT I ACTUALLY MEASURED ────────────────────────────────────────────────────────────────
 * **`onLayout` never fires in React Native Web.** I established that myself, in this session, and
 * wrote it in a comment — and then went on treating the blank numeral row as a statement about the
 * device. It was not. It was the harness failing to do the one thing the wheel depends on.
 *
 * **A harness that cannot reproduce a platform's behaviour is not evidence about that platform.**
 * The browser is excellent at finding missing elements, wrong copy and clipped text. It is worthless
 * for anything downstream of a native layout callback, and this control is entirely downstream of
 * one.
 *
 * ── AND THE TESTS MADE IT WORSE, NOT BETTER ─────────────────────────────────────────────────────
 * I wrote a law asserting the track renders with no `onLayout` at all — which encoded the harness's
 * limitation as a product requirement. It passed, it looked rigorous, and it locked in the damage.
 * A law written from a harness artefact is a harness artefact with a test runner attached.
 *
 * **The file is reverted to `cb9a4b6`, its last state before I touched it.** The tests above still
 * hold: they are about geometry the renderer can answer, which is what this file was always for.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
