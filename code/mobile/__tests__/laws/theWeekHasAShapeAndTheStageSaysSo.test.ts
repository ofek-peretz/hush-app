/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEEK HAS A SHAPE, AND THE STAGE SAYS WHAT IT IS DOING.
 *
 * Two halves of one class, found in the same audit: **the app was RUNNING the coach's structure
 * correctly and showing the athlete none of it.**
 *
 * ── 1 · THE DAY ─────────────────────────────────────────────────────────────────────────────────
 * `PlannedSession.day` has always been in the schema, always parsed, always stored, and always sent
 * back to the coach on the next sheet. **No screen in the app has ever drawn it, and nothing has
 * ever chosen a workout by it.** A hypertrophy week does not care — four sessions in any order is
 * the same week, which is exactly why this survived — but an endurance plan is the opposite: the
 * long run is on Sunday because everything else is arranged around it. It was written for Sunday,
 * stored for Sunday, and handed to her on Wednesday because Wednesday was next in the list.
 *
 * ── 2 · THE SUPERSET ────────────────────────────────────────────────────────────────────────────
 * `planRun` expands a two-item block exactly right: no rest inside a round, the coach's rest between
 * rounds. So she finished a set of bench, a row appeared immediately, and nothing anywhere said that
 * was deliberate. **From the athlete's side an intentional superset and a broken rest timer are the
 * same screen.**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { coachWeek, queuedWorkout } from '@/domain/coachWeek';
import { buildPlanFromCoach, restAfterStep } from '@/state/stores/sessionStore';
import type { CoachPlan, PlannedSession } from '@/domain/coachPlan';

const session = (name: string, day?: string): PlannedSession =>
  ({
    name,
    ...(day ? { day } : {}),
    blocks: [{ rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 40 }] }],
  }) as PlannedSession;

const plan = (sessions: PlannedSession[]): CoachPlan => ({ v: 2, sessions });

/** A Sunday and a Wednesday, in UTC — the day is read off the local clock. */
const SUNDAY = Date.parse('2026-08-02T09:00:00Z');
const WEDNESDAY = Date.parse('2026-08-05T09:00:00Z');

describe('a week that names its days is offered by day', () => {
  const week = () => coachWeek(plan([session('Easy 5k', 'tue'), session('Long run', 'sun'), session('Strength', 'thu')]));

  it('carries the day through to the chip at all', () => {
    expect(week().map((w) => w.day)).toEqual(['tue', 'sun', 'thu']);
  });

  it('⚠️ offers the workout that names TODAY, not the next one in the list', () => {
    // The defect, exactly: the long run is second in the list and belongs to Sunday.
    expect(queuedWorkout(week(), [], SUNDAY)?.name).toBe('Long run');
  });

  it('falls back to the next undone when no workout names today', () => {
    // Wednesday is nobody's day here. She can still train — the app offers the next one, which is
    // what it has always done, and every chip stays tappable regardless.
    expect(queuedWorkout(week(), [], WEDNESDAY)?.name).toBe('Easy 5k');
  });

  it('never offers one she has already trained, even on its own day', () => {
    const w = week();
    const longRun = w.find((x) => x.day === 'sun')!;
    expect(queuedWorkout(w, [longRun.id], SUNDAY)?.name).toBe('Easy 5k');
  });

  it('leaves a hypertrophy week exactly as it was — first undone, no days anywhere', () => {
    const w = coachWeek(plan([session('Upper A'), session('Lower A'), session('Upper B')]));
    expect(w.every((x) => x.day === undefined)).toBe(true);
    expect(queuedWorkout(w, [], SUNDAY)?.name).toBe('Upper A');
    expect(queuedWorkout(w, ['coach_0'], SUNDAY)?.name).toBe('Lower A');
  });
});

describe('a superset is visible as one', () => {
  /** Bench and row, three rounds, ninety seconds between rounds and nothing between the two lifts. */
  const superset = buildPlanFromCoach({
    name: 'Upper',
    blocks: [
      {
        rounds: 3,
        restS: 90,
        items: [
          { kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 40 },
          { kind: 'reps', ex: 'bb_row', reps: [8, 12], load: 40 },
        ],
      },
    ],
  } as PlannedSession);

  it('rests between the ROUNDS and not between the lifts — the behaviour that was already right', () => {
    expect(superset.map(restAfterStep)).toEqual([0, 90, 0, 90, 0, 0]);
  });

  it('⚠️ the step with no rest after it is the one that must SAY so', () => {
    // The bench steps chain into the row; the row steps are followed by a real rest. That is the
    // whole rule the stage reads, and it comes from the plan rather than from a second opinion.
    const chained = superset.filter((s) => restAfterStep(s) === 0 && !s.lastSetOfSession);
    expect(chained.map((s) => s.exerciseId)).toEqual(['bb_bench_press', 'bb_bench_press', 'bb_bench_press']);
  });

  it('says nothing on an ordinary set, where a rest follows', () => {
    const straight = buildPlanFromCoach({
      name: 'Upper',
      blocks: [{ rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 40 }] }],
    } as PlannedSession);
    // Every step but the last is followed by a rest; the last ends the session.
    expect(straight.filter((s) => restAfterStep(s) === 0 && !s.lastSetOfSession)).toEqual([]);
  });
});
