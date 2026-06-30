/**
 * Equipment-native load presentation (UX items 5 & 12). Verifies the headline ALWAYS equals the
 * prescribed load (no display-side rounding), and that each equipment style yields the right setup
 * data. Plate breakdowns appear only when they sum exactly to the load.
 */
import { loadSetup, platesPerSide } from '@/domain/loadPresentation';

describe('barbell load setup', () => {
  it('NEVER changes the prescribed load — the headline equals the engine value', () => {
    // A learned-grid odd value (39) is shown verbatim; it is NOT snapped to 40.
    const s = loadSetup('bb_bench_press', 39, 'kg')!;
    expect(s.style).toBe('barbell');
    expect(s.headline).toBe(39);
    expect(s.barKg).toBe(20);
    expect(s.perSide).toBe(9.5);
    // 9.5/side is not a standard plate stack → no plate breakdown (numeric per-side instead).
    expect(s.plates).toBeUndefined();
  });

  it('shows a plate breakdown when the load decomposes exactly', () => {
    const s = loadSetup('bb_bench_press', 40, 'kg')!;
    expect(s.headline).toBe(40);
    expect(s.perSide).toBe(10);
    expect(s.plates).toEqual([10]);
  });

  it('an empty bar shows the bar with no plates', () => {
    const s = loadSetup('bb_bench_press', 20, 'kg')!;
    expect(s.headline).toBe(20);
    expect(s.perSide).toBe(0);
    expect(s.plates).toEqual([]);
  });

  it('decomposes a side greedily, largest plates first', () => {
    // 100 kg total → 40 / side → 20 + 20 (athletes think in 20s on a kg bar).
    const s = loadSetup('bb_back_squat', 100, 'kg')!;
    expect(s.headline).toBe(100);
    expect(s.perSide).toBe(40);
    expect(s.plates).toEqual([20, 20]);
  });

  it('works in pounds with a 45 lb bar', () => {
    const s = loadSetup('bb_bench_press', 135, 'lb')!;
    expect(s.headline).toBe(135);
    expect(s.barKg).toBe(45);
    expect(s.perSide).toBe(45);
    expect(s.plates).toEqual([45]);
  });
});

describe('plate-loaded machine', () => {
  it('splits the total per side with no bar', () => {
    const s = loadSetup('leg_press', 80, 'kg')!;
    expect(s.style).toBe('plate_loaded');
    expect(s.headline).toBe(80);
    expect(s.perSide).toBe(40);
    expect(s.plates).toEqual([20, 20]);
    expect(s.barKg).toBeUndefined();
  });
});

describe('per-equipment conventions', () => {
  it('dumbbell is per hand, never combined', () => {
    const s = loadSetup('db_bench_press', 20, 'kg')!;
    expect(s.style).toBe('dumbbell');
    expect(s.perHand).toBe(20);
    expect(s.headline).toBe(20);
  });

  it('selectorized machine is a pin', () => {
    const s = loadSetup('machine_chest_press', 24, 'kg')!;
    expect(s.style).toBe('selectorized');
    expect(s.pin).toBe(24);
  });

  it('cable is a pin', () => {
    const s = loadSetup('triceps_pushdown', 28, 'kg')!;
    expect(s.style).toBe('cable');
    expect(s.pin).toBe(28);
  });

  it('bodyweight and null loads return no setup', () => {
    expect(loadSetup('push_up', null, 'kg')).toBeNull();
    expect(loadSetup('pull_up', 0, 'kg')).toBeNull();
    expect(loadSetup('bb_bench_press', null, 'kg')).toBeNull();
  });
});

describe('helpers', () => {
  it('platesPerSide is exported and pure', () => {
    expect(platesPerSide(40, 'kg')).toEqual([20, 20]);
    expect(platesPerSide(0, 'kg')).toEqual([]);
  });
});
