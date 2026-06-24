/**
 * Phase 3 — swap subsystem (Handoff 5.1/5.3: U-swap_allowed, IT-locked, E-tenure-boundary,
 * E-no-equipment-match, I-7..I-11/39/40). Tenure + observed-mismatch binary; deterministic select.
 */
import { swapAllowed, selectReplacement, applySwap, type LibraryEntry, type SwapContext } from '@/engine/v4/swap';
import type { SlotState, Equipment } from '@/engine/v4/types';

const slot = (o: Partial<SlotState> = {}): SlotState => ({
  slotId: 'h_push_1',
  pattern: 'HORIZONTAL_PUSH',
  order_index: 0,
  locked: false,
  current_exercise_id: 'incline_db_press',
  current_load_kg: 24,
  current_sets: 3,
  rep_target: 8,
  rep_range: [8, 12],
  tenure_weeks: 6,
  flat_weeks: 0,
  miss_streak: 3,
  levers_tried: [],
  hold_mode: false,
  weeks_since_swap: 8,
  calibrating: false,
  calib_weeks: 0,
  history: [],
  ...o,
});

const ctx = (o: Partial<SwapContext> = {}): SwapContext => ({
  available_equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'],
  trendDown: true,
  broadCause: false,
  ...o,
});

describe('U-swap_allowed (I-7..I-11)', () => {
  it('locked → never (I-7)', () => {
    expect(swapAllowed(slot({ locked: true }), ctx())).toBe(false);
  });
  it('tenure < 4 → never (I-9); tenure exactly 4 with mismatch → allowed (E-tenure-boundary)', () => {
    expect(swapAllowed(slot({ tenure_weeks: 3 }), ctx())).toBe(false);
    expect(swapAllowed(slot({ tenure_weeks: 4 }), ctx())).toBe(true);
  });
  it('within 4 weeks of last swap → never (I-10)', () => {
    expect(swapAllowed(slot({ weeks_since_swap: 3 }), ctx())).toBe(false);
  });
  it('requires miss_streak ≥ 3 AND trend DOWN (I-11)', () => {
    expect(swapAllowed(slot({ miss_streak: 2 }), ctx())).toBe(false);
    expect(swapAllowed(slot({ miss_streak: 3 }), ctx({ trendDown: false }))).toBe(false);
    expect(swapAllowed(slot({ miss_streak: 3 }), ctx({ trendDown: true }))).toBe(true);
  });
  it('broad cause (absence/injury) → not isolated → never', () => {
    expect(swapAllowed(slot(), ctx({ broadCause: true }))).toBe(false);
  });
  it('calibrating lift → never (forbidden transition)', () => {
    expect(swapAllowed(slot({ calibrating: true }), ctx())).toBe(false);
  });
});

describe('selectReplacement (rule 19 / I-40 deterministic, C3-7)', () => {
  const lib: LibraryEntry[] = [
    { id: 'bb_bench_press', pattern: 'HORIZONTAL_PUSH', is_compound: true, equipment: 'barbell' },
    { id: 'db_bench_press', pattern: 'HORIZONTAL_PUSH', is_compound: true, equipment: 'dumbbell' },
    { id: 'machine_chest_press', pattern: 'HORIZONTAL_PUSH', is_compound: true, equipment: 'machine' },
    { id: 'pec_deck', pattern: 'HORIZONTAL_PUSH', is_compound: false, equipment: 'machine' },
  ];
  it('prefers the same compound class, first in library order', () => {
    const r = selectReplacement('db_bench_press', lib, ['barbell', 'dumbbell', 'machine'], new Set());
    expect(r).toBe('bb_bench_press'); // first compound that is not the current
  });
  it('filters out unavailable equipment', () => {
    const r = selectReplacement('db_bench_press', lib, ['dumbbell', 'machine'], new Set());
    expect(r).toBe('machine_chest_press'); // barbell unavailable
  });
  it('filters out recently used (8-week reuse)', () => {
    const r = selectReplacement('db_bench_press', lib, ['barbell', 'machine'], new Set(['bb_bench_press']));
    expect(r).toBe('machine_chest_press');
  });
  it('E-no-equipment-match → undefined (caller does in-place fallback)', () => {
    const r = selectReplacement('db_bench_press', lib, ['bodyweight'] as Equipment[], new Set());
    expect(r).toBeUndefined();
  });
  it('is deterministic across calls (I-40)', () => {
    const a = selectReplacement('db_bench_press', lib, ['barbell', 'machine'], new Set());
    const b = selectReplacement('db_bench_press', lib, ['barbell', 'machine'], new Set());
    expect(a).toBe(b);
  });
});

describe('applySwap keeps slot identity, resets exercise state, starts CALIBRATING (C-1, §8)', () => {
  it('preserves slotId/pattern/order/lock; resets tenure/miss/calibration', () => {
    const s = slot({ locked: false, miss_streak: 3, tenure_weeks: 6 });
    const next = applySwap(s, 'machine_chest_press', 35, { range: [8, 12], target: 8 });
    expect(next.slotId).toBe('h_push_1');
    expect(next.pattern).toBe('HORIZONTAL_PUSH');
    expect(next.order_index).toBe(0);
    expect(next.current_exercise_id).toBe('machine_chest_press');
    expect(next.calibrating).toBe(true);
    expect(next.tenure_weeks).toBe(0);
    expect(next.miss_streak).toBe(0);
    expect(next.weeks_since_swap).toBe(0);
    expect(next.current_load_kg).toBe(35);
  });
});
