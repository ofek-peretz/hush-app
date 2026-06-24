/**
 * Phase 2 — per-slot decision core (Handoff 5.1/5.2: U-calibrate, U-reprice, IT-flat-levers,
 * IT-patient-hold + progression). Invariants checked inline: I-12/13 (reprice keeps volume/target,
 * down only), I-14 (FLAT held inside window), I-15 (one lever/week, vol→load→range), I-16 (patient hold).
 */
import { decideSlot, calibrate, repriceKeepVolume, reactiveProgress, type SlotInputs, type ExerciseMeta } from '@/engine/v4/decisions';
import { demonstrated, type Trend } from '@/engine/v4/reads';
import type { SlotState, SlotResult } from '@/engine/v4/types';

const META: ExerciseMeta = { region: 'upper', tier: 'compound', equipment: 'barbell', bodyweight: false };

const slot = (o: Partial<SlotState> = {}): SlotState => ({
  slotId: 'h_push_1',
  pattern: 'HORIZONTAL_PUSH',
  order_index: 0,
  locked: false,
  current_exercise_id: 'bb_bench_press',
  current_load_kg: 60,
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

const sets = (load: number | null, reps: number[]) => reps.map((r) => ({ load, reps: r, failed: r < 8 ? false : false }));

describe('U-calibrate (rule 22 / I-19)', () => {
  it('best ≥ target+3 → ×1.10', () => {
    const d = demonstrated(sets(50, [12, 12, 11]), 8); // best 12 ≥ 11
    const { next } = calibrate(slot({ calibrating: true, current_load_kg: 50 }), d, META);
    expect(next.current_load_kg).toBe(55); // 50×1.10
    expect(next.calibrating).toBe(true);
  });
  it('missed → ×0.90', () => {
    const d = demonstrated([{ load: 50, reps: 4, failed: true }], 8);
    const { next } = calibrate(slot({ calibrating: true, current_load_kg: 50 }), d, META);
    expect(next.current_load_kg).toBe(45); // 50×0.90
  });
  it('exits after 2 in-range weeks and never stores a seed', () => {
    const d = demonstrated(sets(57.5, [9, 9, 8]), 8); // best 9, |9-8|=1 ≤ 2 → in-range
    const once = calibrate(slot({ calibrating: true, current_load_kg: 57.5, calib_weeks: 1 }), d, META);
    expect(once.next.calibrating).toBe(false);
    expect(once.next).not.toHaveProperty('seed');
  });
});

describe('U-reprice (rules 4 / I-12 / I-13)', () => {
  it('reprices DOWN to demonstrated, keeps sets and rep_target', () => {
    // prescribed 82.5×8; did 6,5,6 → best_e1rm 99 → demo_at_8 ≈ 78.2 → normalize 77.5
    const d = demonstrated(
      [{ load: 82.5, reps: 6, failed: false }, { load: 82.5, reps: 5, failed: false }, { load: 80, reps: 6, failed: false }],
      8,
    );
    const s = slot({ current_load_kg: 82.5, current_sets: 4, rep_target: 8 });
    const { next, decision } = repriceKeepVolume(s, d, META);
    expect(next.current_load_kg).toBe(77.5);
    expect(next.current_sets).toBe(4); // volume never cut (I-12)
    expect(next.rep_target).toBe(8); // rep_target kept (I-12)
    expect(next.current_load_kg).toBeLessThanOrEqual(82.5); // repriced down (I-13)
    expect(next.miss_streak).toBe(1);
    expect(decision.type).toBe('reprice');
  });
});

describe('progression (rule 5)', () => {
  it('beat with room below the top → +1 rep_target', () => {
    const d = demonstrated(sets(60, [9, 9, 9]), 8); // room (≥9)
    const { next, decision } = reactiveProgress(slot({ rep_target: 8 }), d, inputs({ trend: 'UP' }));
    expect(decision.type).toBe('progress_reps');
    expect(next.rep_target).toBe(9);
    expect(next.current_load_kg).toBe(60);
  });
  it('beat with room AT the top → +STEP load, reset to bottom', () => {
    const d = demonstrated(sets(60, [13, 13, 13]), 12);
    const { next, decision } = reactiveProgress(slot({ rep_target: 12 }), d, inputs({ trend: 'UP' }));
    expect(decision.type).toBe('progress_load');
    expect(next.current_load_kg).toBe(62.5);
    expect(next.rep_target).toBe(8);
  });
});

describe('IT-flat-levers (rules 7/8, I-14/15)', () => {
  it('holds inside the stall window, then applies vol → load → range, one per week', () => {
    const flatDemo = demonstrated(sets(60, [8, 8, 8]), 8); // hit, no room
    let s = slot({ rep_target: 8 });
    // intermediate window = 4: weeks 1..4 hold
    for (let i = 0; i < 4; i++) {
      const o = reactiveProgress(s, flatDemo, inputs({ trend: 'FLAT' }));
      expect(o.decision.type).toBe('hold');
      s = o.next;
    }
    expect(s.flat_weeks).toBe(4);
    // week 5 → +set
    let o = reactiveProgress(s, flatDemo, inputs({ trend: 'FLAT' }));
    expect(o.decision.type).toBe('lever_vol');
    expect(o.next.current_sets).toBe(5);
    s = o.next;
    // week 6 → +load
    o = reactiveProgress(s, flatDemo, inputs({ trend: 'FLAT' }));
    expect(o.decision.type).toBe('lever_load');
    s = o.next;
    // week 7 → range change
    o = reactiveProgress(s, flatDemo, inputs({ trend: 'FLAT' }));
    expect(o.decision.type).toBe('lever_range');
    expect(o.next.rep_range).toEqual([4, 6]);
    s = o.next;
    // week 8 → patient hold
    o = reactiveProgress(s, flatDemo, inputs({ trend: 'FLAT' }));
    expect(o.decision.type).toBe('patient_hold');
    expect(o.next.hold_mode).toBe(true);
  });

  it('skips the volume lever when it is unavailable and goes straight to load', () => {
    const flatDemo = demonstrated(sets(60, [8, 8, 8]), 8);
    const s = slot({ rep_target: 8, flat_weeks: 4 });
    const o = reactiveProgress(s, flatDemo, inputs({ trend: 'FLAT', volumeLeverAvailable: false }));
    expect(o.decision.type).toBe('lever_load');
  });
});

describe('IT-patient-hold probe (rule 9 / I-16)', () => {
  it('re-allows a single load probe every PATIENT_PROBE_EVERY flat weeks', () => {
    const flatDemo = demonstrated(sets(60, [8, 8, 8]), 8);
    // all levers tried, flat_weeks 7 → next is 8 (a multiple of 4) → probe
    const s = slot({ rep_target: 8, flat_weeks: 7, levers_tried: ['vol', 'load', 'range'], hold_mode: true });
    const o = reactiveProgress(s, flatDemo, inputs({ trend: 'FLAT' }));
    expect(o.decision.type).toBe('patient_hold');
    expect(o.next.current_load_kg).toBe(62.5); // probe bumped load
  });
  it('holds (no change) on a non-probe flat week', () => {
    const flatDemo = demonstrated(sets(60, [8, 8, 8]), 8);
    const s = slot({ rep_target: 8, flat_weeks: 8, levers_tried: ['vol', 'load', 'range'], hold_mode: true });
    const o = reactiveProgress(s, flatDemo, inputs({ trend: 'FLAT' }));
    expect(o.next.current_load_kg).toBe(60); // flat_weeks→9, not a multiple of 4
  });
});

describe('routing (decideSlot)', () => {
  it('all-zero week → load ×0.90, keeps volume/target, no miss banked (C4-2)', () => {
    const d = demonstrated([{ load: 60, reps: 0, failed: true }], 8);
    const o = decideSlot(slot(), d, inputs());
    expect(o.next.current_load_kg).toBe(52.5); // 60×0.90=54 → round DOWN to 2.5 increment
    expect(o.next.current_sets).toBe(4);
    expect(o.next.miss_streak).toBe(0);
  });
});
