/**
 * Phase 4 — engine-global ordering + deload (Handoff 5.2/5.5: IT-adherence, IT-absence, IT-injury,
 * IT-locked swap path, R-no-systemic / R-no-sustained-deload / R-no-scheduled-deload). I-6/20/21/22/34.
 */
import { runWeek, type PlanInputs } from '@/engine/v4/planNextWeek';
import type { SlotState, SlotResult, EngineProfile, GlobalState } from '@/engine/v4/types';
import type { ExerciseMeta } from '@/engine/v4/decisions';
import type { LibraryEntry } from '@/engine/v4/swap';

const META: Record<string, ExerciseMeta> = {
  bb_bench_press: { region: 'upper', tier: 'compound', equipment: 'barbell', bodyweight: false },
  incline_db_press: { region: 'upper', tier: 'compound', equipment: 'dumbbell', bodyweight: false },
  machine_chest_press: { region: 'upper', tier: 'compound', equipment: 'machine', bodyweight: false },
};
const meta = (id: string): ExerciseMeta => META[id] ?? META.bb_bench_press;

const profile = (o: Partial<EngineProfile> = {}): EngineProfile => ({
  sex: 'male',
  age: 30,
  bodyweight_kg: 80,
  training_age: 'intermediate',
  goal: 'hypertrophy',
  variety_preference: 'medium',
  workout_count: 4,
  available_equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'],
  gym_busyness: 'medium',
  ...o,
});

const slot = (o: Partial<SlotState> = {}): SlotState => ({
  slotId: 'h_push_1',
  pattern: 'HORIZONTAL_PUSH',
  order_index: 0,
  locked: false,
  current_exercise_id: 'bb_bench_press',
  current_load_kg: 80,
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

const result = (o: Partial<SlotResult> = {}): SlotResult => ({
  slotId: 'h_push_1',
  pattern: 'HORIZONTAL_PUSH',
  exercise_id: 'bb_bench_press',
  sets: [{ load: 80, reps: 8, failed: false }],
  sessions_completed: 1,
  sessions_planned: 1,
  ...o,
});

const global = (o: Partial<GlobalState> = {}): GlobalState => ({ days_since_last_session: 3, ...o });

describe('IT-adherence (I-22)', () => {
  it('adherence < 0.67 → hold all, sets −1, no progression', () => {
    const s = slot({ current_sets: 4 });
    const r = result({ sessions_completed: 1, sessions_planned: 4 }); // 0.25
    const out = runWeek({ profile: profile(), slots: [s], global: global(), results: [r], meta });
    expect(out.mode).toBe('adherence');
    expect(out.updated_slots[0].current_sets).toBe(3);
    expect(out.decisions[0].type).toBe('adherence_hold');
  });
});

describe('IT-injury (I-20/21)', () => {
  it('injury_flag → deload math load×0.85, sets×0.50 floor, rep mid', () => {
    const s = slot({ current_load_kg: 100, current_sets: 4, rep_range: [8, 12] });
    const out = runWeek({ profile: profile(), slots: [s], global: global({ injury_flag: true }), results: [result()], meta });
    expect(out.mode).toBe('injury');
    expect(out.updated_slots[0].current_load_kg).toBe(85);
    expect(out.updated_slots[0].current_sets).toBe(2); // round(4×0.5)
    expect(out.updated_slots[0].rep_target).toBe(10); // mid [8,12]
  });
});

describe('IT-absence (I-6)', () => {
  it('extended absence → load ×0.90, KEEP volume, no full resume', () => {
    const s = slot({ current_load_kg: 100, current_sets: 4 });
    const out = runWeek({ profile: profile(), slots: [s], global: global({ days_since_last_session: 12 }), results: [result()], meta });
    expect(out.mode).toBe('absence');
    expect(out.updated_slots[0].current_load_kg).toBe(90);
    expect(out.updated_slots[0].current_sets).toBe(4); // volume kept
    expect(out.updated_slots[0].current_load_kg).toBeLessThanOrEqual(0.9 * 100);
  });
});

describe('swap on isolated persistent mismatch (§8, IT-locked contrast)', () => {
  const candidates = (): LibraryEntry[] => [
    { id: 'bb_bench_press', pattern: 'HORIZONTAL_PUSH', is_compound: true, equipment: 'barbell' },
    { id: 'machine_chest_press', pattern: 'HORIZONTAL_PUSH', is_compound: true, equipment: 'machine' },
  ];
  // a miss this week, miss_streak already 2 → becomes 3, trend DOWN
  const missResult = result({ sets: [{ load: 80, reps: 4, failed: true }] });
  const history = [
    { week: 2, sets: [], e1rm_week: 110, volume_load: 0, completed_sets: 0, prescribed_sets: 4 },
    { week: 1, sets: [], e1rm_week: 115, volume_load: 0, completed_sets: 0, prescribed_sets: 4 },
  ];

  it('unlocked + tenure≥4 + miss_streak≥3 + DOWN → swaps to a CALIBRATING replacement', () => {
    const s = slot({ miss_streak: 2, tenure_weeks: 6, weeks_since_swap: 8, history });
    const out = runWeek({
      profile: profile({ goal: 'strength' }), // trends on e1RM (populated in history)
      slots: [s],
      global: global(),
      results: [missResult],
      meta,
      candidates: () => candidates(),
      seedLoad: () => 35,
    });
    expect(out.decisions[0].type).toBe('swap');
    expect(out.updated_slots[0].current_exercise_id).toBe('machine_chest_press');
    expect(out.updated_slots[0].calibrating).toBe(true);
  });

  it('LOCKED slot with the same miss pattern → NO swap (I-7), keeps repricing', () => {
    const s = slot({ locked: true, miss_streak: 2, tenure_weeks: 6, history });
    const out = runWeek({
      profile: profile({ goal: 'strength' }),
      slots: [s],
      global: global(),
      results: [missResult],
      meta,
      candidates: () => candidates(),
      seedLoad: () => 35,
    });
    expect(out.decisions[0].type).toBe('reprice');
    expect(out.updated_slots[0].current_exercise_id).toBe('bb_bench_press');
  });
});

describe('regressions: deload is NEVER performance-triggered (I-34)', () => {
  it('R-no-systemic: 5 of 7 patterns DOWN (none missed below target) → no deload', () => {
    const patterns = ['HORIZONTAL_PUSH', 'HORIZONTAL_PULL', 'VERTICAL_PUSH', 'VERTICAL_PULL', 'KNEE_DOMINANT'] as const;
    const slots = patterns.map((p, i) =>
      slot({ slotId: `${p}_${i}`, pattern: p, history: [{ week: 1, sets: [], e1rm_week: 120, volume_load: 1000, completed_sets: 4, prescribed_sets: 4 }] }),
    );
    // hit target (8) but lower e1rm than baseline → trend DOWN, not missed
    const results = slots.map((s) => result({ slotId: s.slotId, pattern: s.pattern, sets: [{ load: 80, reps: 8, failed: false }] }));
    const out = runWeek({ profile: profile(), slots, global: global(), results, meta });
    expect(out.mode).toBe('normal');
    expect(out.decisions.every((d) => d.type !== 'deload')).toBe(true);
  });

  it('R-no-scheduled-deload: many thriving weeks → never a deload', () => {
    let s = slot();
    for (let wk = 0; wk < 12; wk++) {
      const out = runWeek({ profile: profile(), slots: [s], global: global(), results: [result({ sets: [{ load: 80, reps: 12, failed: false }] })], meta });
      expect(out.decisions[0].type).not.toBe('deload');
      s = out.updated_slots[0];
    }
  });
});
