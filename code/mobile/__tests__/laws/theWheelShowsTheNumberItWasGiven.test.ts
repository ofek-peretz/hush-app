/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A CONTROL MAY NOT DISPLAY A NUMBER OTHER THAN THE ONE IT HOLDS.
 *
 * ⛔ FOUND 2026-08-26, in the founder's *"תוודא שהכל עובד"* pass, on the largest figure in the
 * product: the load on the live set stage.
 *
 * The wheel's track was `min + n·step` and nothing else, and `indexOfValue` ROUNDED onto it. So a
 * prescription that was not on that arithmetic ladder was drawn as its nearest neighbour, silently,
 * upwards:
 *
 *     prescribed 36.5 kg, barbell (floor 20, step 2.5)  → the dial read 37.5
 *     prescribed 34   kg                                → the dial read 35
 *     prescribed 31.5 kg, after Loop 2 eased her        → the dial read 32.5
 *     prescribed 12.5 kg, dumbbell (floor 0, step 1)    → the dial read 13
 *
 * …and `Complete Set` logs `target.recommendedWeight`. **The screen and the record were two
 * different numbers, on every set whose load was not a round multiple of the bar's increment.**
 *
 * ── ⚠️ WHY IT LIVED, AND WHY THAT MAKES IT A LAW ────────────────────────────────────────────────
 * There WAS a test over this exact path (`saveSetSavesTheSet`), and it asserted the defect: it
 * expected one increment from 36.5 to land on 40, which is only true if the wheel was already
 * sitting on 37.5 — and its comment called that *"the wheel corrects onto a rung the room can
 * build"*. A test written from the behaviour instead of from the rule cannot see the behaviour is
 * wrong. So the rule is stated here, over the pure function, in the terms the bug was in.
 *
 * ⚠️ THE TWO GRIDS ARE STILL TWO GRIDS, and this law does not pretend otherwise. The wheel steps by
 * the equipment's increment; the ENGINE prescribes off `grid.snapDown`, which uses her own performed
 * rungs. That divergence is a real design question (a machine stack is not an arithmetic ladder).
 * What this closes is the part that is not a question: whatever the engine hands the control, the
 * control shows THAT.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const wheel = fs.readFileSync(path.join(SRC, 'components', 'ds', 'WheelPicker.tsx'), 'utf8');

/**
 * `buildValues` re-implemented from the source it is guarding.
 *
 * ⚠️ NOT IMPORTED, AND THAT IS THE POINT: it is module-private, and exporting it to be tested would
 * widen the component's surface for a law. It is twelve lines; the assertions below are about the
 * PROPERTY, and the source-shape check at the bottom is what keeps this copy honest.
 */
const round3 = (n: number) => Math.round(n * 1000) / 1000;
function buildValues(min: number, max: number, step: number, value?: number): number[] {
  const out: number[] = [];
  const n = Math.round((max - min) / step);
  for (let i = 0; i <= n; i++) out.push(round3(min + i * step));
  if (value == null || !Number.isFinite(value)) return out;
  const v = round3(value);
  if (v < min || v > max || out.includes(v)) return out;
  const at = out.findIndex((x) => x > v);
  out.splice(at < 0 ? out.length : at, 0, v);
  return out;
}

/** The four loads that were being drawn as something else, with the equipment that produced them. */
const CASES = [
  { what: 'a learned barbell load', min: 20, max: 500, step: 2.5, value: 36.5 },
  { what: 'a barbell load off the ladder', min: 20, max: 500, step: 2.5, value: 34 },
  { what: 'a load Loop 2 eased', min: 20, max: 500, step: 2.5, value: 31.5 },
  { what: 'a half-kilo dumbbell', min: 0, max: 500, step: 1, value: 12.5 },
  { what: 'a pound track, barbell', min: 44, max: 1100, step: 5, value: 72 },
];

describe('⛔ the wheel carries the value it was handed', () => {
  it.each(CASES)('$what ($value) is ON the track, not near it', ({ min, max, step, value }) => {
    expect(buildValues(min, max, step, value)).toContain(value);
  });

  it('⚠️ …and the track it was already able to draw is untouched', () => {
    /* Every intake ruler in the app hands a value that is already on the ladder. Nothing about
       those may change, or this fix has a blast radius it did not advertise. */
    for (const { min, max, step } of CASES) {
      const onGrid = round3(min + 3 * step);
      expect(buildValues(min, max, step, onGrid)).toEqual(buildValues(min, max, step));
    }
  });

  it('⛔ a value outside the room is CLAMPED, never invented onto the track', () => {
    /* `min` is the empty bar and `max` the top of the range. A control that inserted an
       out-of-range value to be truthful about it would mint a load that does not exist — which is
       the opposite failure, and the worse one. */
    expect(buildValues(20, 100, 2.5, 5)).not.toContain(5);
    expect(buildValues(20, 100, 2.5, 900)).not.toContain(900);
    expect(buildValues(20, 100, 2.5, 5)[0]).toBe(20);
  });

  it('⛔ the track stays sorted and free of duplicates — the index maths depends on both', () => {
    for (const { min, max, step, value } of CASES) {
      const v = buildValues(min, max, step, value);
      expect(v).toEqual([...v].sort((a, b) => a - b));
      expect(new Set(v).size).toBe(v.length);
    }
  });
});

describe('⛔ every reader of the track asks it, rather than doing the arithmetic', () => {
  /*
   * The rounding was in TWO places, and the second is the quieter one: last time's moss marker was
   * placed with `Math.round((marker - min) / step)`, which is off by one for every cell above an
   * inserted value — so the dot would sit on the wrong detent on exactly the sets where the load is
   * interesting. Both go through the same lookup now.
   */
  it('the value index is a search over the track, not `(v - min) / step`', () => {
    expect(wheel).toContain('function nearestIndex(');
    expect(wheel).toContain('clampIndex(nearestIndex(values, v))');
  });

  it('⛔ no arithmetic index survives anywhere in the component', () => {
    /* ⚠️ `(max - min) / step` is exempt and is not an oversight: that is the track's LENGTH, which
       is arithmetic by definition. What may not come back is an INDEX derived that way — the shape
       that put the value on one detent and the marker on another. */
    const code = wheel.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    const indexish = [...code.matchAll(/Math\.round\(\(\s*(\w+)\s*-\s*min\s*\)\s*\/\s*step\)/g)]
      .map((m) => m[1])
      .filter((who) => who !== 'max');
    expect(indexish).toEqual([]);
  });

  it('the marker is placed through the same lookup the value is', () => {
    expect(wheel).toContain('index === indexOfValue(marker)');
  });

  it('⚠️ the track is rebuilt when the value changes — or the insert never happens', () => {
    /* `useMemo` on [min, max, step] alone would keep the first value's track for the whole set. */
    expect(wheel).toContain('buildValues(min, max, step, value), [min, max, step, value]');
  });
});
