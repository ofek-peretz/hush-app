/**
 * Phase 0 — v4 foundations: constants integrity, goal/training-age mapping (C-3/C-8),
 * and validators (Handoff 5.4 F-cases). Pure, no engine behavior yet.
 */
import { DEFAULTS, PATTERNS, REP_RANGE_BY_GOAL } from '@/engine/v4/constants';
import {
  EngineValidationError,
  toEngineGoal,
  toTrainingAge,
  validateProfile,
  validateSlotResult,
  validateSlotState,
  type EngineProfile,
  type SlotState,
  type SlotResult,
} from '@/engine/v4/types';

const profile = (over: Partial<EngineProfile> = {}): EngineProfile => ({
  sex: 'male',
  age: 30,
  bodyweight_kg: 80,
  training_age: 'intermediate',
  goal: 'hypertrophy',
  variety_preference: 'medium',
  workout_count: 4,
  available_equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'],
  gym_busyness: 'medium',
  ...over,
});

const slot = (over: Partial<SlotState> = {}): SlotState => ({
  slotId: 'slot_h_push_1',
  pattern: 'HORIZONTAL_PUSH',
  order_index: 0,
  locked: false,
  current_exercise_id: 'bb_bench_press',
  current_load_kg: 60,
  current_sets: 4,
  rep_target: 8,
  rep_range: [8, 12],
  tenure_weeks: 4,
  flat_weeks: 0,
  miss_streak: 0,
  levers_tried: [],
  hold_mode: false,
  weeks_since_swap: 8,
  calibrating: false,
  calib_weeks: 0,
  history: [],
  ...over,
});

describe('constants match the frozen spec §12', () => {
  it('carries the exact frozen values', () => {
    expect(DEFAULTS.RAIL_HEADROOM).toBe(0.03);
    expect(DEFAULTS.SESSION_SET_CAP).toBe(22);
    expect(DEFAULTS.ADHERENCE_MIN).toBe(0.67);
    expect(DEFAULTS.ABSENCE_DAYS).toBe(10);
    expect(DEFAULTS.MISS_ESCALATE).toBe(3);
    expect(DEFAULTS.STALL_WINDOW).toEqual({ novice: 2, intermediate: 4, advanced: 6 });
    expect(DEFAULTS.DELOAD_LOAD).toBe(0.85);
    expect(DEFAULTS.DELOAD_SETS).toBe(0.5);
    expect(DEFAULTS.LOAD_STEP_CAP).toBe(0.1);
  });

  it('progresses SIX patterns and excludes CORE (product override)', () => {
    expect(PATTERNS).toHaveLength(6);
    expect(PATTERNS).toContain('VERTICAL_PULL');
    expect(PATTERNS).not.toContain('CORE' as never);
  });

  it('has a rep scheme for every engine goal', () => {
    expect(REP_RANGE_BY_GOAL.strength).toEqual({ range: [3, 6], target: 5 });
    expect(REP_RANGE_BY_GOAL.hypertrophy).toEqual({ range: [8, 12], target: 8 });
    expect(REP_RANGE_BY_GOAL.general_fitness).toEqual({ range: [6, 12], target: 8 });
  });
});

describe('goal / training-age mapping (C-3, approved)', () => {
  it('maps user goals to engine goals; toning→hypertrophy', () => {
    expect(toEngineGoal('get_stronger')).toBe('strength');
    expect(toEngineGoal('build_muscle')).toBe('hypertrophy');
    expect(toEngineGoal('toning')).toBe('hypertrophy');
    expect(toEngineGoal('general_fitness')).toBe('general_fitness');
  });
  it('maps experience to training age (beginner→novice)', () => {
    expect(toTrainingAge('beginner')).toBe('novice');
    expect(toTrainingAge('intermediate')).toBe('intermediate');
    expect(toTrainingAge('advanced')).toBe('advanced');
    expect(toTrainingAge(undefined)).toBe('novice');
  });
});

describe('validators (F-cases)', () => {
  it('accepts a valid profile', () => {
    expect(() => validateProfile(profile())).not.toThrow();
  });
  it('rejects bad age / bodyweight / goal / empty equipment', () => {
    expect(() => validateProfile(profile({ age: 5 }))).toThrow(EngineValidationError);
    expect(() => validateProfile(profile({ bodyweight_kg: 5 }))).toThrow(EngineValidationError);
    expect(() => validateProfile(profile({ goal: 'toning' as never }))).toThrow(EngineValidationError);
    expect(() => validateProfile(profile({ available_equipment: [] }))).toThrow(EngineValidationError);
  });
  it('honors the 1–6 workout_count override', () => {
    expect(() => validateProfile(profile({ workout_count: 1 }))).not.toThrow();
    expect(() => validateProfile(profile({ workout_count: 6 }))).not.toThrow();
    expect(() => validateProfile(profile({ workout_count: 7 }))).toThrow(EngineValidationError);
  });
  it('rejects rep_target outside rep_range', () => {
    expect(() => validateSlotState(slot())).not.toThrow();
    expect(() => validateSlotState(slot({ rep_target: 2 }))).toThrow(EngineValidationError);
    expect(() => validateSlotState(slot({ rep_range: [12, 8] }))).toThrow(EngineValidationError);
  });
  it('rejects negative reps / non-positive load in a result', () => {
    const res = (over: Partial<SlotResult> = {}): SlotResult => ({
      slotId: 'slot_h_push_1',
      pattern: 'HORIZONTAL_PUSH',
      exercise_id: 'bb_bench_press',
      sets: [{ load: 60, reps: 8, failed: false }],
      sessions_completed: 1,
      sessions_planned: 1,
      ...over,
    });
    expect(() => validateSlotResult(res())).not.toThrow();
    expect(() => validateSlotResult(res({ sets: [{ load: 60, reps: -1, failed: false }] }))).toThrow(EngineValidationError);
    expect(() => validateSlotResult(res({ sets: [{ load: -5, reps: 8, failed: false }] }))).toThrow(EngineValidationError);
  });
});
