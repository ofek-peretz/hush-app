/**
 * Phase 5 — rails + assembly + explanations (Handoff 5.1/5.3: U-rail, IT-session-cap,
 * E-two-patterns-want-set, I-1/2/3/4/5/5b/24/26/27/29).
 */
import { applyRails, type SlotPlan } from '@/engine/v4/rails';
import { planNextWeek, type PlanWeekInputs } from '@/engine/v4/planWeek';
import { explain } from '@/engine/v4/explain';
import { epley } from '@/engine/v4/reads';
import type { SlotState, SlotDecision, EngineProfile } from '@/engine/v4/types';
import type { ExerciseMeta } from '@/engine/v4/decisions';

const baseSlot = (o: Partial<SlotState> = {}): SlotState => ({
  slotId: 's1',
  pattern: 'HORIZONTAL_PUSH',
  order_index: 0,
  locked: false,
  current_exercise_id: 'bb_bench_press',
  current_load_kg: 80,
  current_sets: 4,
  rep_target: 5,
  rep_range: [3, 6],
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

const dec = (slot: SlotState, type: SlotDecision['type'], over: Partial<SlotDecision> = {}): SlotDecision => ({
  slotId: slot.slotId,
  pattern: slot.pattern,
  type,
  exercise_id: slot.current_exercise_id,
  load_kg: slot.current_load_kg,
  sets: slot.current_sets,
  rep_target: slot.rep_target,
  rep_range: slot.rep_range,
  ...over,
});

const plan = (over: Partial<SlotPlan> & { slot: SlotState; decision: SlotDecision; prev: SlotState }): SlotPlan => ({
  bestE1rm: null,
  equipment: 'barbell',
  ...over,
});

describe('U-rail (I-1): caps implied e1RM at best×1.03', () => {
  it('clamps a prescription whose implied e1RM exceeds the rail', () => {
    // best_e1rm 100, target 5 → max load = 103/(1+5/30) = 88.3 → normalize 87.5
    const slot = baseSlot({ current_load_kg: 95, rep_target: 5 });
    const prev = baseSlot({ current_load_kg: 92.5 });
    const p = plan({ slot, prev, decision: dec(slot, 'progress_load', { load_kg: 95 }), bestE1rm: 100 });
    applyRails([p], { ta: 'intermediate' });
    const implied = epley(p.decision.load_kg!, p.decision.rep_target);
    expect(implied).toBeLessThanOrEqual(100 * 1.03 + 1e-9);
  });
  it('rail is inactive while CALIBRATING', () => {
    const slot = baseSlot({ current_load_kg: 200, calibrating: true });
    const p = plan({ slot, prev: slot, decision: dec(slot, 'calibrate', { load_kg: 200 }), bestE1rm: null });
    applyRails([p], { ta: 'intermediate' });
    expect(p.decision.load_kg).toBe(200);
  });
});

describe('I-2 jump cap: a single change ≤ 10%', () => {
  it('clamps an over-large upward jump', () => {
    const slot = baseSlot({ current_load_kg: 100 });
    const prev = baseSlot({ current_load_kg: 80 });
    const p = plan({ slot, prev, decision: dec(slot, 'lever_load', { load_kg: 100 }), bestE1rm: 1000 });
    applyRails([p], { ta: 'intermediate' });
    expect(p.decision.load_kg).toBeLessThanOrEqual(88); // 80×1.10
  });
});

describe('I-5/5b RA-1: at most 2 patterns get +1 set, longest-flat first', () => {
  it('three patterns want +1 → only the two longest-flat get it; the third reverts to hold', () => {
    const mk = (id: string, pattern: SlotState['pattern'], flat: number) => {
      const prev = baseSlot({ slotId: id, pattern, current_sets: 4, flat_weeks: flat });
      const slot = baseSlot({ slotId: id, pattern, current_sets: 5, flat_weeks: flat + 1 });
      return plan({ slot, prev, decision: dec(slot, 'lever_vol', { sets: 5 }) });
    };
    const plans = [
      mk('a', 'HORIZONTAL_PUSH', 6),
      mk('b', 'HORIZONTAL_PULL', 8),
      mk('c', 'VERTICAL_PUSH', 4),
    ];
    applyRails(plans, { ta: 'intermediate' });
    const got = plans.map((p) => p.decision.type);
    // b (flat 8) and a (flat 6) keep lever_vol; c (flat 4) reverts
    expect(plans.find((p) => p.slot.slotId === 'b')!.decision.type).toBe('lever_vol');
    expect(plans.find((p) => p.slot.slotId === 'a')!.decision.type).toBe('lever_vol');
    expect(plans.find((p) => p.slot.slotId === 'c')!.decision.type).toBe('hold');
    expect(got.filter((t) => t === 'lever_vol')).toHaveLength(2);
    // reverted slot rolls back sets AND stays eligible (vol not banked)
    const c = plans.find((p) => p.slot.slotId === 'c')!;
    expect(c.slot.current_sets).toBe(4);
    expect(c.slot.levers_tried).not.toContain('vol');
  });
});

describe('I-4 pattern ceiling: a +1 that would exceed VOL_CEIL is reverted', () => {
  it('intermediate ceiling 18 — a pattern already at 18 cannot add', () => {
    const prev = baseSlot({ current_sets: 18, flat_weeks: 5 });
    const slot = baseSlot({ current_sets: 19, flat_weeks: 6 });
    const p = plan({ slot, prev, decision: dec(slot, 'lever_vol', { sets: 19 }) });
    applyRails([p], { ta: 'intermediate' });
    expect(p.decision.type).toBe('hold');
    expect(p.slot.current_sets).toBe(18);
  });
});

describe('explanations (I-26/27)', () => {
  it('reprice text never says "fatigue" and never claims volume changed', () => {
    const slot = baseSlot();
    const e = explain(dec(slot, 'reprice', { load_kg: 72.5 }), (id) => id)!;
    expect(e.text.toLowerCase()).not.toContain('fatigue');
    expect(e.text.toLowerCase()).toContain('sets unchanged');
    expect(e.observation).not.toBe('');
  });
  it('calibrate / steady hold surface no change line', () => {
    const slot = baseSlot();
    expect(explain(dec(slot, 'calibrate'))).toBeNull();
    expect(explain(dec(slot, 'hold'))).toBeNull();
  });
});

// ─────────────── end-to-end determinism (I-24) ───────────────
const META: ExerciseMeta = { region: 'upper', tier: 'compound', equipment: 'barbell', bodyweight: false };
const profile = (): EngineProfile => ({
  sex: 'male',
  age: 30,
  bodyweight_kg: 80,
  training_age: 'intermediate',
  goal: 'hypertrophy',
  variety_preference: 'medium',
  workout_count: 4,
  available_equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'],
  gym_busyness: 'medium',
});

describe('I-24 determinism: identical inputs → deep-equal output', () => {
  it('planNextWeek is pure', () => {
    const inp: PlanWeekInputs = {
      profile: profile(),
      slots: [baseSlot({ rep_target: 8, rep_range: [8, 12] })],
      global: { days_since_last_session: 3 },
      results: [
        {
          slotId: 's1',
          pattern: 'HORIZONTAL_PUSH',
          exercise_id: 'bb_bench_press',
          sets: [{ load: 80, reps: 9, failed: false }],
          sessions_completed: 1,
          sessions_planned: 1,
        },
      ],
      meta: () => META,
    };
    expect(planNextWeek(inp)).toEqual(planNextWeek(inp));
  });
});
