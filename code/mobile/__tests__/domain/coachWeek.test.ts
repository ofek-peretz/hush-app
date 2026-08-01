/**
 * ════ WHAT THE SURFACES READ ONCE THE COACH OWNS THE PROGRAMME ════
 *
 * The counterpart to `homePlan`, for the plan the coach wrote. The interesting tests are all about
 * the same refusal: **this does not convert the coach's week into the engine's shape**, because a
 * `Slot` is `{ capability, exerciseId, setCount }` and three of the four item shapes have no home
 * in it. A conversion would delete a 5 km run, a 45-second plank and every `say` on the way past,
 * quietly, in a function that looked like plumbing.
 */
import { coachWeek, coachRows, coachSession, coachWorkoutId } from '@/domain/coachWeek';
import { parseCoachPlan, type CoachPlan } from '@/domain/coachPlan';

/** A week only the widened vocabulary can hold: intervals, a lift, a hold, and open work. */
const plan = (): CoachPlan => {
  const r = parseCoachPlan(JSON.stringify({
    say: 'Here is your week.',
    sessions: [
      {
        name: 'Intervals', day: 'tue',
        blocks: [
          { rounds: 4, restS: 60, items: [
            { kind: 'distance', ex: 'run_outdoor', metres: 400, say: 'Faster than you could hold a conversation at.' },
            { kind: 'time', ex: 'walk_outdoor', seconds: 90 },
          ] },
        ],
      },
      {
        name: 'Lower',
        blocks: [
          { rounds: 3, restS: 120, items: [{ kind: 'reps', ex: 'bb_back_squat', reps: [8, 12], load: 40 }] },
          { rounds: 2, restS: 60, items: [
            { kind: 'time', ex: 'plank', seconds: 45 },
            { kind: 'open', ex: 'mobility' },
          ] },
        ],
      },
    ],
  }));
  if (!r.ok) throw new Error(`fixture must parse, got ${r.reason}`);
  return r.answer.plan!;
};

describe('the week, as chips', () => {
  it('keeps the coach’s own order — a programme has a shape', () => {
    expect(coachWeek(plan()).map((w) => w.name)).toEqual(['Intervals', 'Lower']);
  });

  it('gives each workout a stable id rather than matching on its name', () => {
    // Two sessions may legitimately share a name — "Upper" twice in a six-day week is a real
    // programme, and matching on the name lights both when one is chosen (the twin-chip bug).
    const twins = { v: 2, sessions: [{ name: 'Upper', blocks: [] }, { name: 'Upper', blocks: [] }] } as CoachPlan;
    expect(coachWeek(twins).map((w) => w.id)).toEqual([coachWorkoutId(0), coachWorkoutId(1)]);
  });

  it('counts every ROUND, because that is what she actually does', () => {
    // A block of two items done four times is eight pieces of work, not two.
    expect(coachWeek(plan())[0].items).toBe(8);
    expect(coachWeek(plan())[1].items).toBe(3 + 4);
  });

  it('carries the day only where the programme has one', () => {
    const [intervals, lower] = coachWeek(plan());
    expect(intervals.day).toBe('tue');
    // A hypertrophy week does not care which day is which; claiming one would be an invention.
    expect(lower.day).toBeUndefined();
  });

  it('is empty, not broken, before the coach has decided anything', () => {
    expect(coachWeek(null)).toEqual([]);
    expect(coachRows(null, coachWorkoutId(0))).toBeNull();
  });
});

describe('minutes are counted, never guessed', () => {
  it('counts held time and reps, and rests only BETWEEN rounds', () => {
    // Lower: 3 squat rounds (3×40s exec + 2×120s rest) + 2 rounds of [45s plank, open] + 1×60s rest.
    const lower = coachWeek(plan())[1];
    expect(lower.minutes).toBe(Math.round((3 * 40 + 2 * 120 + 2 * 45 + 60) / 60));
    expect(lower.hasUncountedWork).toBe(false);
  });

  it('refuses to turn a distance into minutes, and says so instead', () => {
    /*
     * A 400 m repeat has no duration without a pace, and this app does not guess one. Inventing a
     * pace to fill the number would be the engine forming an opinion about her training — exactly
     * what the AI layer removed. So the flag exists and a screen can say "plus the run".
     */
    const intervals = coachWeek(plan())[0];
    expect(intervals.hasUncountedWork).toBe(true);
    // The walks and rests ARE known, so the figure is a floor rather than nothing.
    expect(intervals.minutes).toBe(Math.round((4 * 90 + 3 * 60) / 60));
  });
});

describe('the rows keep every shape the coach can write', () => {
  it('prints a run as a distance, not as something that failed to be a lift', () => {
    const rows = coachRows(plan(), coachWorkoutId(0))!;
    expect(rows[0]).toMatchObject({ ex: 'run_outdoor', kind: 'distance', metres: 400, rounds: 4 });
    // And the instruction survives — the field with no equivalent anywhere in `Slot`.
    expect(rows[0].say).toBe('Faster than you could hold a conversation at.');
    expect(rows[1]).toMatchObject({ kind: 'time', seconds: 90 });
  });

  it('carries the band and the load on a lift, and nothing it does not have', () => {
    const [squat] = coachRows(plan(), coachWorkoutId(1))!;
    expect(squat).toMatchObject({ kind: 'reps', band: [8, 12], load: 40, rounds: 3 });
    expect('seconds' in squat).toBe(false);
    expect('metres' in squat).toBe(false);
  });

  it('states no load at all on open work, rather than a null that reads as bodyweight', () => {
    const rows = coachRows(plan(), coachWorkoutId(1))!;
    const open = rows.find((r) => r.kind === 'open')!;
    expect('load' in open).toBe(false);
  });

  it('names a movement from its own catalogue, not from the lifts', () => {
    // `run_outdoor` is not in EXERCISES and never will be — see `data/movements`.
    expect(coachRows(plan(), coachWorkoutId(0))![0].name).not.toBe('run_outdoor');
    expect(coachRows(plan(), coachWorkoutId(0))![0].name.length).toBeGreaterThan(0);
  });

  it('hands the machine the session itself, unchanged, to run', () => {
    const s = coachSession(plan(), coachWorkoutId(0))!;
    expect(s.name).toBe('Intervals');
    expect(s.blocks[0].items).toHaveLength(2);
    expect(coachSession(plan(), 'coach_99')).toBeNull();
  });
});
