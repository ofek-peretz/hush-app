/**
 * WheelPicker RTL positioning (Build #18 regression #1+2).
 *
 * On device under `I18nManager.forceRTL(true)`, every numeric wheel landed on the
 * MIRROR of its intended value (age 28→76, weight 82→203.5, reps 8→42 — an exact
 * `max+min-value` reflection) and large-range wheels rendered blank. Root cause: iOS
 * mirrors a horizontal list's WRITE side (scrollToOffset / initialScrollIndex) under
 * forceRTL, while the READ side (contentOffset.x) stays direct.
 *
 * These tests pin the fix's invariant WITHOUT a device by modeling that native
 * inversion (`nativeRest`) and asserting the requested offset, after the OS mirrors it,
 * reads back as the intended index — in BOTH locales. They also document the pre-fix
 * mirror so a regression is unmistakable.
 */
import { wheelOffset, wheelIndexFromOffset } from '@/components/ds/WheelPicker';

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

/**
 * Model of iOS horizontal-scroll under forceRTL: a REQUESTED scroll offset is mirrored
 * about the track center; LTR is identity. This is the exact behavior Build #18 exhibited
 * (verified against age/weight/reps). The settled `contentOffset.x` is what the read sees.
 */
function nativeRest(requestedOffset: number, itemW: number, count: number, rtl: boolean): number {
  const reqIdx = Math.round(requestedOffset / itemW);
  const restIdx = rtl ? count - 1 - reqIdx : reqIdx;
  return restIdx * itemW;
}

/** The full round-trip: request → OS settles → read back the centered index. */
function landedIndex(targetIdx: number, count: number, rtl: boolean): number {
  const requested = wheelOffset(targetIdx, ITEM_W, count, rtl);
  const settled = nativeRest(requested, ITEM_W, count, rtl);
  return wheelIndexFromOffset(settled, ITEM_W);
}

// The real call-site ranges (ManualInfo / ProfileEdit / SessionFlow / Cardio).
const RANGES = {
  age: { min: 14, max: 90, step: 1 },
  height: { min: 120, max: 220, step: 1 },
  weight: { min: 35, max: 250, step: 0.5 },
  reps: { min: 0, max: 50, step: 1 },
  distance: { min: 0.5, max: 50, step: 0.5 },
  time: { min: 5, max: 240, step: 5 },
  days: { min: 2, max: 6, step: 1 },
} as const;

describe('wheelOffset — LTR is identity, RTL pre-inverts', () => {
  it('LTR: offset is the plain index position', () => {
    expect(wheelOffset(0, ITEM_W, 100, false)).toBe(0);
    expect(wheelOffset(14, ITEM_W, 77, false)).toBe(14 * ITEM_W);
    expect(wheelOffset(99, ITEM_W, 100, false)).toBe(99 * ITEM_W);
  });

  it('RTL: offset is mirrored to (count-1-index)', () => {
    expect(wheelOffset(0, ITEM_W, 100, true)).toBe(99 * ITEM_W);
    expect(wheelOffset(14, ITEM_W, 77, true)).toBe((77 - 1 - 14) * ITEM_W);
    expect(wheelOffset(99, ITEM_W, 100, true)).toBe(0);
  });
});

describe('read is direct (RTL-agnostic)', () => {
  it('contentOffset.x maps straight to the centered index', () => {
    expect(wheelIndexFromOffset(0, ITEM_W)).toBe(0);
    expect(wheelIndexFromOffset(42 * ITEM_W, ITEM_W)).toBe(42);
    // Snaps to nearest detent mid-scroll.
    expect(wheelIndexFromOffset(42 * ITEM_W + 12, ITEM_W)).toBe(42);
  });
});

describe('round-trip lands the intended value — every range, both locales', () => {
  for (const [name, r] of Object.entries(RANGES)) {
    const values = track(r.min, r.max, r.step);
    const count = values.length;
    // A spread of targets incl. the endpoints (where the mirror bug is most visible).
    const targets = [0, 1, Math.floor(count / 3), Math.floor(count / 2), count - 2, count - 1];
    for (const rtl of [false, true]) {
      it(`${name} (${rtl ? 'RTL' : 'LTR'}) centers the requested value`, () => {
        for (const t of targets) {
          expect(landedIndex(t, count, rtl)).toBe(t);
        }
      });
    }
  }
});

describe('Build #18 regressions are fixed (and the pre-fix mirror is documented)', () => {
  const cases = [
    { name: 'age 28', ...RANGES.age, value: 28, mirror: 76 }, // 90+14-28
    { name: 'reps 8', ...RANGES.reps, value: 8, mirror: 42 }, // 50+0-8
    { name: 'weight 82', ...RANGES.weight, value: 82, mirror: 203 }, // 250+35-82
    { name: 'distance 5.0', ...RANGES.distance, value: 5, mirror: 45.5 }, // 50+0.5-5
  ];

  for (const c of cases) {
    const values = track(c.min, c.max, c.step);
    const count = values.length;
    const idx = indexOf(c.value, c.min, c.step);

    it(`${c.name}: fix centers the real value under RTL`, () => {
      const landed = landedIndex(idx, count, true);
      expect(values[landed]).toBe(c.value);
    });

    it(`${c.name}: the OLD (un-inverted) write reproduced the mirror`, () => {
      // Pre-fix wrote i*itemW even under RTL; the OS then mirrored it.
      const buggySettled = nativeRest(idx * ITEM_W, ITEM_W, count, true);
      const buggyIdx = wheelIndexFromOffset(buggySettled, ITEM_W);
      expect(values[buggyIdx]).toBe(c.mirror);
    });
  }
});
