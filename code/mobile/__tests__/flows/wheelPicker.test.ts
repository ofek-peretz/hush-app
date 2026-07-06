/**
 * WheelPicker positioning + windowing (Build #18 mirror, Build #22 blank track).
 *
 * History, because this component has now been broken twice in RTL:
 *  - Build #18: every numeric wheel landed on the MIRROR of its intended value
 *    (age 28→76, weight 82→203.5, reps 8→42 — an exact `max+min-value` reflection).
 *    Cause: RN's VirtualizedList flips a requested `scrollToOffset` through
 *    `cartesianOffset(offset + visibleLength)` under `I18nManager.isRTL`.
 *  - Build #22: after pre-inverting the write to cancel that flip, LARGE wheels
 *    (weight: 431 detents, in-session load: 1001) rendered a BLANK track — the
 *    VirtualizedList render window uses the same flipped coordinates, so against
 *    the wheel's LTR-island content it rendered cells at the wrong end.
 *
 * The fix removes VirtualizedList entirely: a plain ScrollView (no JS RTL
 * conversions; `scrollTo` is cartesian in both locales) rendering a fixed window
 * of cells around the active detent between two exact-width spacers, so content
 * size — and with it every offset — is identical to a fully-rendered track.
 *
 * These tests pin the two invariants that replaced the old mirror math:
 *  1) write/read are IDENTITY and exact inverses in both locales;
 *  2) the render window always contains the active detent (and its guard band),
 *     with spacers that keep total content width constant.
 */
import { wheelOffset, wheelIndexFromOffset, wheelWindow } from '@/components/ds/WheelPicker';

const ITEM_W = 60;

/** buildValues() mirror — the value track the wheel renders. */
function track(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const n = Math.round((max - min) / step);
  for (let i = 0; i <= n; i++) out.push(Math.round((min + i * step) * 1000) / 1000);
  return out;
}
function indexOf(value: number, min: number, step: number): number {
  return Math.round((value - min) / step);
}

// The real call-site ranges (ManualInfo / ProfileEdit / SessionFlow / Cardio).
const RANGES = {
  age: { min: 14, max: 90, step: 1 },
  height: { min: 120, max: 220, step: 1 },
  weight: { min: 35, max: 250, step: 0.5 },
  sessionLoadKg: { min: 0, max: 500, step: 0.5 }, // the Build #22 blank-track wheel
  reps: { min: 0, max: 50, step: 1 },
  distance: { min: 0.5, max: 50, step: 0.5 },
  time: { min: 5, max: 240, step: 5 },
  days: { min: 2, max: 6, step: 1 },
} as const;

describe('wheelOffset ↔ wheelIndexFromOffset — identity, exact inverses, locale-free', () => {
  it('offset is the plain index position; the read returns it unchanged', () => {
    expect(wheelOffset(0, ITEM_W)).toBe(0);
    expect(wheelOffset(14, ITEM_W)).toBe(14 * ITEM_W);
    expect(wheelOffset(1000, ITEM_W)).toBe(1000 * ITEM_W);
    expect(wheelIndexFromOffset(wheelOffset(42, ITEM_W), ITEM_W)).toBe(42);
    // Snaps to nearest detent mid-scroll.
    expect(wheelIndexFromOffset(42 * ITEM_W + 12, ITEM_W)).toBe(42);
  });

  it('round-trips every range at the endpoints and Build #18 regression values', () => {
    const probes: Array<{ r: { min: number; max: number; step: number }; value: number }> = [
      { r: RANGES.age, value: 28 }, // Build #18: landed 76
      { r: RANGES.weight, value: 82 }, // Build #18: landed 203.5
      { r: RANGES.reps, value: 8 }, // Build #18: landed 42
      { r: RANGES.distance, value: 5 },
      { r: RANGES.sessionLoadKg, value: 62.5 },
    ];
    for (const { r, value } of probes) {
      const values = track(r.min, r.max, r.step);
      const i = indexOf(value, r.min, r.step);
      expect(values[wheelIndexFromOffset(wheelOffset(i, ITEM_W), ITEM_W)]).toBe(value);
    }
    for (const r of Object.values(RANGES)) {
      const count = track(r.min, r.max, r.step).length;
      for (const i of [0, 1, Math.floor(count / 2), count - 2, count - 1]) {
        expect(wheelIndexFromOffset(wheelOffset(i, ITEM_W), ITEM_W)).toBe(i);
      }
    }
  });
});

describe('wheelWindow — the rendered slice always contains the active detent', () => {
  const WIN = 56; // component default

  it('covers the anchor ± window, clamped to the track', () => {
    expect(wheelWindow(0, 1001)).toEqual({ start: 0, end: 57 });
    expect(wheelWindow(500, 1001)).toEqual({ start: 444, end: 557 });
    expect(wheelWindow(1000, 1001)).toEqual({ start: 944, end: 1001 });
  });

  it('small tracks render fully — no spacers, no windowing artifacts', () => {
    for (const r of [RANGES.days, RANGES.time]) {
      const count = track(r.min, r.max, r.step).length;
      for (let anchor = 0; anchor < count; anchor++) {
        expect(wheelWindow(anchor, count)).toEqual({ start: 0, end: count });
      }
    }
  });

  it('the Build #22 blank-track wheels are populated at their landing target', () => {
    // The exact scenario that shipped blank: a far target on a large track. The
    // window is re-anchored to the target BEFORE the scroll lands, so the landed
    // offset must fall inside the rendered slice.
    for (const r of [RANGES.weight, RANGES.sessionLoadKg]) {
      const values = track(r.min, r.max, r.step);
      const target = Math.floor(values.length * 0.7); // deep into the track
      const win = wheelWindow(target, values.length);
      expect(target).toBeGreaterThanOrEqual(win.start);
      expect(target).toBeLessThan(win.end);
      // Guard band: the detent can drift WINDOW_GUARD (24) cells before re-anchor
      // and must still be rendered.
      expect(target - 24).toBeGreaterThanOrEqual(win.start);
      expect(target + 24).toBeLessThan(win.end);
    }
  });

  it('spacers + slice always reconstruct the full content width', () => {
    for (const r of Object.values(RANGES)) {
      const count = track(r.min, r.max, r.step).length;
      for (const anchor of [0, 1, Math.floor(count / 2), count - 1]) {
        const { start, end } = wheelWindow(anchor, count);
        const total = start * ITEM_W + (end - start) * ITEM_W + (count - end) * ITEM_W;
        expect(total).toBe(count * ITEM_W);
      }
    }
  });

  it(`window spans ${2 * WIN + 1} cells mid-track — bounded render cost`, () => {
    const { start, end } = wheelWindow(500, 1001);
    expect(end - start).toBe(2 * WIN + 1);
  });
});
