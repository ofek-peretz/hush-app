/**
 * The WHY sheet's CASE (v7 2.1b) — the argument assembled from measured facts alone.
 */
import { changedLiftCase } from '@/domain/changedLiftCase';
import type { Session } from '@/data/local/models';
import type { WeeklyPlanLift } from '@/engine/weeklyView';

const lift = (loadFrom: number | null, loadTo: number | null): WeeklyPlanLift => ({
  exerciseId: 'bb_row',
  name: 'Barbell Row',
  loadKg: loadTo,
  sets: 3,
  repRange: [8, 10],
  change: {
    snapshot: { slotId: 's', exerciseId: 'bb_row', loadFrom, loadTo, setsFrom: 3, setsTo: 3, rangeFrom: [8, 10], rangeTo: [8, 10], swapped: false },
    explanation: {
      slotId: 's', pattern: 'progress' as never,
      observation: { key: 'o' }, conclusion: { key: 'c' }, action: { key: 'a' }, text: { key: 'why.lineUp', params: { delta: 3.5 } },
    },
  },
});

const session = (at: string, reps: number[]): Session =>
  ({
    id: at,
    startedAt: at,
    sets: reps.map((r, i) => ({ exerciseId: 'bb_row', setIndex: i, actualWeight: 44, actualReps: r })),
  }) as unknown as Session;

describe('the case behind a changed lift', () => {
  it('reads the raise, its delta, and the two sessions that earned it — oldest first', () => {
    const c = changedLiftCase(lift(44, 47.5), [session('2026-07-18', [10, 10, 10]), session('2026-07-15', [9, 9, 8])], 'kg');
    expect(c.verdict).toBe('up');
    expect(c.from).toBe('44');
    expect(c.to).toBe('47.5');
    expect(c.delta).toBe('+3.5');
    expect(c.sessions.map((s) => s.figure)).toEqual(['44 × 9·9·8', '44 × 10·10·10']);
    // Only the session where EVERY set touched the ceiling is drawn as reached.
    expect(c.sessions.map((s) => s.reached)).toEqual([false, true]);
  });

  it('an ease carries a real minus, not a hyphen', () => {
    expect(changedLiftCase(lift(60, 57.5), [], 'kg').delta).toBe('−2.5');
  });

  it('a load that did not move is a HOLD, with nothing struck through', () => {
    const c = changedLiftCase(lift(44, 44), [], 'kg');
    expect(c.verdict).toBe('hold');
    expect(c.from).toBeNull();
    expect(c.delta).toBeNull();
  });
});
