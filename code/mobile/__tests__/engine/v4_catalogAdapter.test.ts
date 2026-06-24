/**
 * Phase 7 — catalog adapter: VERTICAL_PULL is a first-class engine pattern; CORE is not; every
 * non-core catalog exercise maps to exactly one of the SIX engine patterns (no app Capability change).
 */
import { enginePattern, exerciseMeta, candidatesForPattern, bodyRegion } from '@/engine/v4/catalogAdapter';
import { EXERCISES } from '@/data/exercises';
import { PATTERNS } from '@/engine/v4/constants';

describe('VERTICAL_PULL is first-class; CORE is accessory (override §6)', () => {
  it('maps pull-ups / chin-ups / pulldowns to VERTICAL_PULL, separate from HORIZONTAL_PULL', () => {
    expect(enginePattern('pull_up')).toBe('VERTICAL_PULL');
    expect(enginePattern('chin_up')).toBe('VERTICAL_PULL');
    expect(enginePattern('lat_pulldown')).toBe('VERTICAL_PULL');
    expect(enginePattern('bb_row')).toBe('HORIZONTAL_PULL');
  });
  it('returns null for CORE lifts (not engine-managed)', () => {
    expect(enginePattern('hanging_leg_raise')).toBeNull();
    expect(enginePattern('cable_crunch')).toBeNull();
    expect(enginePattern('ab_wheel')).toBeNull();
  });
});

describe('every non-core exercise maps to exactly one of the six engine patterns', () => {
  it('full catalog coverage', () => {
    for (const ex of EXERCISES) {
      const p = enginePattern(ex.id);
      if (ex.muscle === 'Core') {
        expect(p).toBeNull();
      } else {
        expect(p).not.toBeNull();
        expect(PATTERNS).toContain(p!);
      }
    }
  });
});

describe('exerciseMeta + bodyRegion', () => {
  it('classifies region, tier, equipment, bodyweight', () => {
    expect(exerciseMeta('bb_bench_press')).toEqual({ region: 'upper', tier: 'compound', equipment: 'barbell', bodyweight: false });
    expect(exerciseMeta('bb_back_squat').region).toBe('lower');
    expect(exerciseMeta('pull_up')).toEqual({ region: 'upper', tier: 'compound', equipment: 'bodyweight', bodyweight: true });
    expect(bodyRegion('bb_rdl')).toBe('lower');
  });
});

describe('candidate pools are pattern-scoped and deterministic', () => {
  it('VERTICAL_PULL pool contains the vertical pulls only', () => {
    const ids = candidatesForPattern('VERTICAL_PULL').map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['pull_up', 'chin_up', 'lat_pulldown']));
    expect(ids).not.toContain('bb_row');
  });
  it('returns the same order across calls', () => {
    expect(candidatesForPattern('HORIZONTAL_PUSH')).toEqual(candidatesForPattern('HORIZONTAL_PUSH'));
  });
});
