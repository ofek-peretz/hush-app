/**
 * ════ THE AI'S OPINION OBEYS HER ALGEBRA — parse with grace, apply through the builder ════
 *
 * The reply is suggestions, never a programme (`PLAN_REVIEW_SCHEMA` has no `sessions` — asserted
 * here so the second AI surface can never quietly grow the first one's power). A malformed item is
 * dropped alone; every apply routes through `planBuilder`, so the model cannot do anything her own
 * fingers could not.
 */
// @ts-nocheck

import { applyPlanSuggestion, parsePlanReview, PLAN_REVIEW_SCHEMA } from '@/domain/planReview';
import { addLift, blankDraft } from '@/domain/planBuilder';

const draft = () => {
  let p = blankDraft('r1');
  p = addLift(p, 0, 'bb_bench_press');
  p = addLift(p, 0, 'db_row');
  return p;
};

describe('the schema cannot author', () => {
  it('has no `sessions` — a review reads, it never writes a week', () => {
    expect(JSON.stringify(PLAN_REVIEW_SCHEMA)).not.toContain('sessions');
    expect(PLAN_REVIEW_SCHEMA.required).toEqual(['say', 'suggestions']);
  });
});

describe('parsing, with the one-bad-item grace', () => {
  it('reads a clean reply', () => {
    const r = parsePlanReview(JSON.stringify({
      say: 'Solid week.',
      suggestions: [{ day: 1, do: 'sets', ex: 'bb_bench_press', n: 4, say: 'Room for one more.' }],
    }));
    expect(r.ok).toBe(true);
    expect(r.review.suggestions).toHaveLength(1);
  });

  it('drops a bad ITEM alone — unknown lift, bad verb, out-of-range sets, swap without a target', () => {
    const r = parsePlanReview(JSON.stringify({
      say: 'Mixed bag.',
      suggestions: [
        { day: 1, do: 'sets', ex: 'bb_bench_press', n: 4, say: 'good' },
        { day: 1, do: 'add', ex: 'not_a_lift', say: 'bad' },
        { day: 1, do: 'yeet', ex: 'db_row', say: 'bad' },
        { day: 1, do: 'sets', ex: 'db_row', n: 99, say: 'bad' },
        { day: 1, do: 'swap', ex: 'db_row', say: 'bad' },
        { day: 0, do: 'remove', ex: 'db_row', say: 'bad' },
      ],
    }));
    expect(r.ok).toBe(true);
    expect(r.review.suggestions).toHaveLength(1);
  });

  it('a reply with nothing said is unreadable; junk is not_json', () => {
    expect(parsePlanReview(JSON.stringify({ suggestions: [] }))).toEqual({ ok: false, reason: 'nothing_said' });
    expect(parsePlanReview('][')).toEqual({ ok: false, reason: 'not_json' });
  });
});

describe('applying, through the builder algebra', () => {
  it('each verb lands as the builder op — and the builder rules bind the model', () => {
    const p = draft();
    const added = applyPlanSuggestion(p, { day: 1, do: 'add', ex: 'lat_pulldown', say: 'x' });
    expect(added.days[0].slots.map((s) => s.exerciseId)).toContain('lat_pulldown');
    // a duplicate add is refused by the SAME rule that refuses her
    expect(applyPlanSuggestion(p, { day: 1, do: 'add', ex: 'db_row', say: 'x' })).toBe(p);
    const fewer = applyPlanSuggestion(p, { day: 1, do: 'remove', ex: 'db_row', say: 'x' });
    expect(fewer.days[0].slots.map((s) => s.exerciseId)).toEqual(['bb_bench_press']);
    const heavier = applyPlanSuggestion(p, { day: 1, do: 'sets', ex: 'db_row', n: 5, say: 'x' });
    expect(heavier.days[0].slots[1].setCount).toBe(5);
    const swapped = applyPlanSuggestion(p, { day: 1, do: 'swap', ex: 'db_row', to: 'machine_row', say: 'x' });
    expect(swapped.days[0].slots[1].exerciseId).toBe('machine_row');
  });

  it('a stale suggestion (day or lift gone) is a NO-OP, never a throw', () => {
    const p = draft();
    expect(applyPlanSuggestion(p, { day: 9, do: 'remove', ex: 'db_row', say: 'x' })).toBe(p);
    expect(applyPlanSuggestion(p, { day: 1, do: 'remove', ex: 'leg_press', say: 'x' })).toBe(p);
  });
});
