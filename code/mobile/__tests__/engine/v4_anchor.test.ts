/**
 * Performed-load anchor (2026-07-05) — "the prescription is a hypothesis; the completed sets are
 * the truth." When an athlete lifts a DIFFERENT load than prescribed, the next weekly decision
 * steps from what was lifted, not the stale guess:
 *   • calibrate corrections (×1.10 / ×0.90 / +step) apply to the performed load;
 *   • progress (+1 rep / +step), the load lever, and the patient probe step from it;
 *   • the rails' upward jump cap treats the performed load as the base (it was performed —
 *     stepping from it is not a jump);
 *   • an upward adoption is bounded at 2× the prescription (a single typo can't double the plan);
 *   • the learned-grid snap-down tolerance keeps a sparse grid ({50, 90}) from freezing every
 *     between-rung ideal at the low rung.
 */
import { calibrate, reactiveProgress, type SlotInputs, type ExerciseMeta } from '@/engine/v4/decisions';
import { demonstrated, normalizeLoad } from '@/engine/v4/reads';
import { planNextWeek } from '@/engine/v4/planWeek';
import type { SlotState, SlotResult, EngineProfile } from '@/engine/v4/types';

const META: ExerciseMeta = { region: 'upper', tier: 'compound', equipment: 'barbell', bodyweight: false };

const slot = (o: Partial<SlotState> = {}): SlotState => ({
  slotId: 'h_push_1',
  pattern: 'HORIZONTAL_PUSH',
  order_index: 0,
  locked: false,
  current_exercise_id: 'bb_bench_press',
  current_load_kg: 50,
  current_sets: 4,
  rep_target: 8,
  rep_range: [8, 12],
  tenure_weeks: 6,
  flat_weeks: 0,
  miss_streak: 0,
  levers_tried: [],
  hold_mode: false,
  weeks_since_swap: 8,
  calibrating: false,
  calib_weeks: 0,
  history: [],
  ...o,
});

const inputs = (o: Partial<SlotInputs> = {}): SlotInputs => ({
  meta: META,
  ta: 'intermediate',
  goal: 'hypertrophy',
  trend: 'FLAT',
  volumeLeverAvailable: true,
  ...o,
});

const setsAt = (load: number, reps: number[]) => reps.map((r) => ({ load, reps: r, failed: false }));

describe('calibrate anchors on the performed load', () => {
  it('athlete lifted 90 over a 50 prescription with big rep room → ×1.10 of 90, not of 50', () => {
    const d = demonstrated(setsAt(90, [12, 12, 11]), 8); // best 12 ≥ target+3, at 90 kg
    const { next } = calibrate(slot({ calibrating: true, current_load_kg: 50 }), d, META);
    expect(next.current_load_kg).toBe(97.5); // 90×1.10 = 99 → floor to 2.5 grid
  });

  it('athlete lifted 90 and hit exactly → +step from 90 (in-range counts toward exit)', () => {
    const d = demonstrated(setsAt(90, [8, 8, 8]), 8);
    const { next } = calibrate(slot({ calibrating: true, current_load_kg: 50, calib_weeks: 0 }), d, META);
    expect(next.current_load_kg).toBe(92.5); // 90 + max(2.5, 0.025×90)=2.5 → 92.5
    expect(next.calibrating).toBe(true); // one in-range week banked, not exited
  });

  it('athlete lowered the bar and missed → ×0.90 of what was lifted', () => {
    const d = demonstrated([{ load: 40, reps: 4, failed: true }], 8);
    const { next } = calibrate(slot({ calibrating: true, current_load_kg: 50 }), d, META);
    expect(next.current_load_kg).toBe(35); // 40×0.9 = 36 → floor 35 (not 45 from the ignored 50)
  });

  it('a typo cannot more than double the prescription (ANCHOR_RAISE_CAP)', () => {
    const d = demonstrated(setsAt(500, [8, 8]), 8); // fat-fingered 500 on a 50 prescription
    const { next } = calibrate(slot({ calibrating: true, current_load_kg: 50 }), d, META);
    expect(next.current_load_kg!).toBeLessThanOrEqual(50 * 2 * 1.1); // capped at 2× before the step
  });

  it('unchanged when the athlete lifted exactly the prescription (regression guard)', () => {
    const d = demonstrated(setsAt(50, [12, 12, 11]), 8);
    const { next } = calibrate(slot({ calibrating: true, current_load_kg: 50 }), d, META);
    expect(next.current_load_kg).toBe(55); // pre-anchor behavior preserved: 50×1.10
  });
});

describe('reactive progress anchors on the performed load', () => {
  it('+1 rep below the range top ADOPTS the performed load', () => {
    const d = demonstrated(setsAt(90, [9, 9, 9]), 8); // room at 90
    const { next, decision } = reactiveProgress(slot({ current_load_kg: 50, rep_target: 8 }), d, inputs());
    expect(decision.type).toBe('progress_reps');
    expect(next.rep_target).toBe(9);
    expect(next.current_load_kg).toBe(90); // the number the athlete actually lifts
  });

  it('at the range top → +step from the performed load', () => {
    const d = demonstrated(setsAt(90, [13, 12, 12]), 12);
    const { next, decision } = reactiveProgress(slot({ current_load_kg: 50, rep_target: 12 }), d, inputs());
    expect(decision.type).toBe('progress_load');
    expect(next.current_load_kg).toBe(92.5); // 90 + 2.5
    expect(next.rep_target).toBe(8); // reset to bottom
  });
});

describe('rails: the upward jump cap treats the performed load as the base', () => {
  const profile: EngineProfile = {
    sex: 'male', age: 30, bodyweight_kg: 80, training_age: 'intermediate', goal: 'hypertrophy',
    variety_preference: 'medium', workout_count: 3,
    available_equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'], gym_busyness: 'medium',
  };

  it('a progress step from a heavier performed load survives the rails', () => {
    const s = slot({ current_load_kg: 50, rep_target: 12, history: [] });
    const results: SlotResult[] = [{
      slotId: s.slotId, pattern: s.pattern, exercise_id: s.current_exercise_id,
      sets: setsAt(90, [13, 13, 12]), sessions_completed: 1, sessions_planned: 1,
    }];
    const out = planNextWeek({ profile, slots: [s], global: { days_since_last_session: 0 }, results, meta: () => META });
    const next = out.next_slots[0];
    // Pre-fix the ±10%-of-prescription cap clamped this back to 55; the performed 90 is the base.
    expect(next.load_kg).toBeGreaterThanOrEqual(90);
  });
});

describe('learned-grid snap tolerance (sparse-grid freeze fix)', () => {
  it('a between-rungs ideal on a sparse grid falls back to the static increment', () => {
    expect(normalizeLoad(55, 'barbell', [50, 90])).toBe(55); // NOT dragged down to 50
  });
  it('a near-rung ideal still snaps to the real rung (dense rack behavior preserved)', () => {
    expect(normalizeLoad(15.5, 'dumbbell', [12, 14, 16])).toBe(14); // within 2.5 → real dumbbell
    expect(normalizeLoad(52, 'barbell', [50, 52.5, 55])).toBe(50); // plate grid, 2 below → snap
  });
  it('above the max observed rung defers to the static increment (unchanged)', () => {
    expect(normalizeLoad(95.4, 'barbell', [50, 90])).toBe(95);
  });
});
