/**
 * Phase 1 — v4 observation layer (Handoff 5.1: U-demonstrated, U-trend, U-step + normalization).
 */
import {
  demonstrated,
  classifyTrend,
  step,
  normalizeLoad,
  epley,
  progressMetric,
  volumeLoad,
} from '@/engine/v4/reads';
import type { SetRecord, WeekRecord } from '@/engine/v4/types';

const S = (load: number | null, reps: number, failed = false): SetRecord => ({ load, reps, failed });

describe('U-demonstrated (§5.4)', () => {
  it('best_e1rm=96, missed=False (best 6≥5), room=True even with a trailing failure', () => {
    const d = demonstrated([S(80, 6), S(80, 5), S(80, 4, true)], 5);
    expect(d.best_e1rm).toBeCloseTo(96.0, 5);
    expect(d.missed).toBe(false);
    expect(d.room).toBe(true);
    expect(d.hit).toBe(true);
  });

  it('all sets fail below target → missed=True', () => {
    const d = demonstrated([S(80, 4, true), S(80, 3, true)], 5);
    expect(d.missed).toBe(true);
    expect(d.hit).toBe(false);
  });

  it('U-reprice anchor: best_e1rm=99, demo_at_8≈78.2', () => {
    const d = demonstrated([S(82.5, 6), S(82.5, 5), S(80, 6)], 8);
    expect(d.best_e1rm).toBeCloseTo(99.0, 5);
    expect(d.demonstrated_load_at_target).toBeCloseTo(78.16, 1);
    expect(d.missed).toBe(true); // best 6 < target 8
  });

  it('C4-2 all-zero week → empty, no demonstrated capability', () => {
    const d = demonstrated([S(80, 0), S(80, 0)], 8);
    expect(d.empty).toBe(true);
    expect(d.best_e1rm).toBeNull();
    expect(d.missed).toBe(false);
  });

  it('bodyweight: e1RM inactive, hit/room/missed read from reps', () => {
    const d = demonstrated([S(null, 12), S(null, 12)], 8);
    expect(d.bodyweight).toBe(true);
    expect(d.best_e1rm).toBeNull();
    expect(d.room).toBe(true); // 12 ≥ 8+1
  });
});

describe('U-trend (§5.3)', () => {
  it('baseline 93.3, now 96 → UP (+2.9%)', () => {
    expect(classifyTrend(96.0, [93.3, 93.3], 'intermediate')).toBe('UP');
  });
  it('now 93.5 → FLAT (within ±2%)', () => {
    expect(classifyTrend(93.5, [93.3], 'intermediate')).toBe('FLAT');
  });
  it('now 91.0 → DOWN (−2.5%)', () => {
    expect(classifyTrend(91.0, [93.3], 'intermediate')).toBe('DOWN');
  });
  it('single-week history → FLAT (no baseline)', () => {
    expect(classifyTrend(100, [], 'novice')).toBe('FLAT');
  });
});

describe('U-step (§7)', () => {
  it('upper compound: 80→2.5, 200→5.0', () => {
    expect(step(80, 'upper', 'compound')).toBe(2.5);
    expect(step(200, 'upper', 'compound')).toBe(5.0);
  });
  it('lower compound: 100→5.0', () => {
    expect(step(100, 'lower', 'compound')).toBe(5.0);
  });
  it('isolation: 40 upper → 1.25 (half of 2.5, min 1)', () => {
    expect(step(40, 'upper', 'isolation')).toBeCloseTo(1.25, 5);
  });
});

describe('normalization rounds DOWN to the equipment increment (6b / C4-3)', () => {
  it('barbell 2.5, dumbbell 1.0', () => {
    expect(normalizeLoad(63.7, 'barbell')).toBe(62.5);
    expect(normalizeLoad(22.9, 'dumbbell')).toBe(22);
    expect(normalizeLoad(61.25, 'barbell')).toBe(60);
  });
  it('never rounds up', () => {
    expect(normalizeLoad(62.5, 'barbell')).toBe(62.5);
    expect(normalizeLoad(62.499, 'barbell')).toBe(60);
  });
});

describe('progress metric is goal-specific (§5.2)', () => {
  const wk: WeekRecord = {
    week: 3,
    sets: [S(80, 5), S(80, 5)],
    e1rm_week: epley(80, 5),
    volume_load: volumeLoad([S(80, 5), S(80, 5)]),
    completed_sets: 2,
    prescribed_sets: 2,
  };
  it('strength → e1RM, hypertrophy → volume_load', () => {
    expect(progressMetric(wk, 'strength')).toBeCloseTo(epley(80, 5), 5);
    expect(progressMetric(wk, 'hypertrophy')).toBe(800);
  });
});
