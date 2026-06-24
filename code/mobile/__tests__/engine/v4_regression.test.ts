/**
 * Phase 6 — regression suite that LOCKS THE FREEZE (Handoff 5.5) + invariant runner + determinism +
 * 260-week soak. One test per removed concept; reintroducing any would fail here.
 */
import { planNextWeek, type PlanWeekInputs } from '@/engine/v4/planWeek';
import { checkInvariants } from '@/engine/v4/invariants';
import { demonstrated, epley, volumeLoad } from '@/engine/v4/reads';
import type { SlotState, SlotResult, EngineProfile, GlobalState, WeekRecord } from '@/engine/v4/types';
import type { ExerciseMeta } from '@/engine/v4/decisions';

const META: ExerciseMeta = { region: 'upper', tier: 'compound', equipment: 'barbell', bodyweight: false };
const meta = () => META;

const profile = (o: Partial<EngineProfile> = {}): EngineProfile => ({
  sex: 'male',
  age: 30,
  bodyweight_kg: 80,
  training_age: 'intermediate',
  goal: 'strength',
  variety_preference: 'medium',
  workout_count: 4,
  available_equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'],
  gym_busyness: 'medium',
  ...o,
});

const slot = (o: Partial<SlotState> = {}): SlotState => ({
  slotId: 's1',
  pattern: 'HORIZONTAL_PUSH',
  order_index: 0,
  locked: false,
  current_exercise_id: 'bb_bench_press',
  current_load_kg: 80,
  current_sets: 8,
  rep_target: 5,
  rep_range: [3, 6],
  tenure_weeks: 8,
  flat_weeks: 0,
  miss_streak: 0,
  levers_tried: [],
  hold_mode: false,
  weeks_since_swap: 12,
  calibrating: false,
  calib_weeks: 0,
  history: [],
  ...o,
});

const result = (sets: SlotResult['sets'], o: Partial<SlotResult> = {}): SlotResult => ({
  slotId: 's1',
  pattern: 'HORIZONTAL_PUSH',
  exercise_id: 'bb_bench_press',
  sets,
  sessions_completed: 1,
  sessions_planned: 1,
  ...o,
});

const ctxFor = (results: SlotResult[]) => ({
  ta: 'intermediate' as const,
  bestE1rm: (id: string) => {
    const r = results.find((x) => x.slotId === id);
    return r ? demonstrated(r.sets, 5).best_e1rm : null;
  },
  minLoadable: () => 2.5, // barbell minimum increment — the rail yields to this physical floor
});

describe('R-no-fatigue: noisy/decaying but target-hit week → no volume cut, no deload (I-12/31)', () => {
  it('steep within-session rep decay with a clean top set is NOT read as fatigue', () => {
    const s = slot({ rep_target: 5, current_sets: 8 });
    const r = result([
      { load: 80, reps: 8, failed: false }, // clean top set ≥ target
      { load: 80, reps: 5, failed: false },
      { load: 80, reps: 2, failed: false }, // steep decay
    ]);
    const out = planNextWeek({ profile: profile(), slots: [s], global: { days_since_last_session: 3 }, results: [r], meta });
    expect(out.updated_slots[0].current_sets).toBe(8); // volume untouched
    expect(out.explanations.every((e) => e.text.toLowerCase() !== 'deload')).toBe(true);
    expect(checkInvariants(out, ctxFor([r]))).toEqual([]);
  });
});

describe('R-no-sustained-deload: one slot DOWN ≥3 wks while hitting target → reprice/HOLD only, never deload (I-20/34)', () => {
  it('declining e1RM but target met never triggers a volume-cut deload', () => {
    let s = slot({ rep_target: 5, history: [] });
    let g: GlobalState = { days_since_last_session: 3 };
    let e1 = 100;
    for (let wk = 0; wk < 4; wk++) {
      // hits target 5 cleanly but at a drifting-down load (e1RM declines)
      const load = 80 - wk * 2;
      const r = result([{ load, reps: 5, failed: false }]);
      const out = planNextWeek({ profile: profile(), slots: [s], global: g, results: [r], meta });
      expect(out.explanations.every((e) => e.observation.toLowerCase().indexOf('train around') === -1)).toBe(true);
      expect(out.updated_slots[0].current_sets).toBeGreaterThanOrEqual(8 - 0); // never volume-cut
      // thread history so the trend can see the decline
      const rec: WeekRecord = { week: wk, sets: r.sets, e1rm_week: epley(load, 5), volume_load: volumeLoad(r.sets), completed_sets: 1, prescribed_sets: s.current_sets };
      s = { ...out.updated_slots[0], history: [rec, ...out.updated_slots[0].history].slice(0, 6) };
      e1 = epley(load, 5);
    }
    void e1;
  });
});

describe('R-no-scheduled-deload: 16 thriving weeks → zero deloads (I-34)', () => {
  it('no week-number ever triggers a deload', () => {
    let s = slot();
    let g: GlobalState = { days_since_last_session: 3 };
    for (let wk = 0; wk < 16; wk++) {
      const load = s.current_load_kg ?? 80;
      const r = result([{ load, reps: s.rep_target + 1, failed: false }, { load, reps: s.rep_target + 1, failed: false }]);
      const out = planNextWeek({ profile: profile(), slots: [s], global: g, results: [r], meta });
      expect(out.explanations.find((e) => e.text.toLowerCase().includes('pulled the weight'))).toBeUndefined();
      const rec: WeekRecord = { week: wk, sets: r.sets, e1rm_week: epley(load, s.rep_target + 1), volume_load: volumeLoad(r.sets), completed_sets: 2, prescribed_sets: s.current_sets };
      s = { ...out.updated_slots[0], history: [rec, ...out.updated_slots[0].history].slice(0, 6) };
    }
  });
});

describe('R-no-maintenance / R-no-dial / R-seed-discarded', () => {
  it('R-no-maintenance: at-limit advanced re-probes via PATIENT_HOLD, no maintenance state', () => {
    const s = slot({ rep_target: 5, flat_weeks: 9, levers_tried: ['vol', 'load', 'range'], hold_mode: true });
    const r = result([{ load: 80, reps: 5, failed: false }]); // hit, no room → flat
    const out = planNextWeek({ profile: profile({ training_age: 'advanced' }), slots: [s], global: { days_since_last_session: 3 }, results: [r], meta });
    expect(out.updated_slots[0]).not.toHaveProperty('maintenance');
    expect(checkInvariants(out, ctxFor([r]))).toEqual([]);
  });

  it('R-seed-discarded: a post-calibration slot ignores the seed provider entirely (I-18/38)', () => {
    const s = slot({ calibrating: false, current_load_kg: 80 });
    const r = result([{ load: 80, reps: 6, failed: false }]);
    const a = planNextWeek({ profile: profile(), slots: [s], global: { days_since_last_session: 3 }, results: [r], meta, seedLoad: () => 999 });
    const b = planNextWeek({ profile: profile(), slots: [s], global: { days_since_last_session: 3 }, results: [r], meta, seedLoad: () => 5 });
    expect(a.next_slots[0].load_kg).toBe(b.next_slots[0].load_kg); // seed has zero influence
  });
});

describe('R-determinism (I-24): random valid inputs run twice → deep-equal', () => {
  it('200 seeded scenarios are pure', () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < 200; i++) {
      const load = 40 + Math.floor(rnd() * 60);
      const reps = 1 + Math.floor(rnd() * 12);
      const s = slot({ current_load_kg: load, rep_target: 5, current_sets: 4 + Math.floor(rnd() * 6) });
      const r = result([{ load, reps, failed: reps < 5 }]);
      const inp: PlanWeekInputs = { profile: profile(), slots: [s], global: { days_since_last_session: Math.floor(rnd() * 15) }, results: [r], meta };
      expect(planNextWeek(inp)).toEqual(planNextWeek(inp));
    }
  });
});

describe('R-loop-termination (260-week soak): always emits a valid, invariant-clean plan', () => {
  it('runs 260 weeks across a synthetic athlete without dead-ends', () => {
    let s = slot({ calibrating: true, current_load_kg: 50, rep_target: 8, rep_range: [8, 12], tenure_weeks: 0, current_sets: 8 });
    let g: GlobalState = { days_since_last_session: 3 };
    for (let wk = 0; wk < 260; wk++) {
      const load = s.current_load_kg ?? 60;
      // deterministic net-positive "athlete": mostly beats with room, an occasional MILD miss
      // (one rep short, every 6th week), and a periodic real gap. Stays well above the bar weight.
      const beat = wk % 6 !== 0;
      const reps = beat ? s.rep_target + 1 : Math.max(1, s.rep_target - 1);
      const sets = [
        { load, reps, failed: !beat },
        { load, reps: Math.max(1, reps - 1), failed: !beat },
      ];
      const r = result(sets, { slotId: s.slotId });
      g = { days_since_last_session: wk % 37 === 36 ? 12 : 3 }; // a periodic real gap exercises absence
      const out = planNextWeek({ profile: profile(), slots: [s], global: g, results: [r], meta });

      expect(out.next_slots).toHaveLength(1);
      expect(checkInvariants(out, ctxFor([r]))).toEqual([]);

      const rec: WeekRecord = {
        week: wk,
        sets,
        e1rm_week: epley(load, reps || 1),
        volume_load: volumeLoad(sets),
        completed_sets: 2,
        prescribed_sets: s.current_sets,
      };
      s = { ...out.updated_slots[0], history: [rec, ...out.updated_slots[0].history].slice(0, 6) };
    }
    expect(s.current_load_kg).not.toBeNull();
  });
});
