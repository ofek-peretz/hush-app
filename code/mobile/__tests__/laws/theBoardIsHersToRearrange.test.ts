/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEEK BOARD IS HERS — AND MOVING A SESSION IS A SWAP, NOT A DISPLACEMENT.
 *
 * ⛔ FOUNDER, 2026-08-05: *"the athlete can change it herself by dragging from one day to another
 * and swapping"* and *"if the athlete presses a different workout and starts it, the AI swaps the
 * position of the current workout with the position of the workout she started."*
 *
 * Two sentences, one mechanism — and the second door is the one that matters, because she uses it
 * without deciding to. Every test below is about the invariant that makes the board trustworthy:
 * **the same sessions are on it afterwards.** A week that can lose a workout to a gesture is a week
 * she cannot rearrange without checking.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { moveWorkoutToDay, daysAfterStarting, dropTarget, type BoardWorkout, type MeasuredRow } from '@/domain/weekBoard';
import { WEEK_ORDER } from '@/domain/trainingDays';

const week: BoardWorkout[] = [
  { id: 'a', day: 'mon' },
  { id: 'b', day: 'wed' },
  { id: 'c', day: 'fri' },
  { id: 'd', day: 'sat' },
];

describe('⛔ moving a session onto another day', () => {
  it('swaps the two — the week keeps its shape', () => {
    const out = moveWorkoutToDay(week, 'c', 'mon')!;
    expect(out.c).toBe('mon');
    expect(out.a).toBe('fri'); // the occupant takes the mover's day
    expect(out.b).toBe('wed');
    expect(out.d).toBe('sat');
  });

  it('onto an EMPTY day it is a move, and the source day is simply free', () => {
    const out = moveWorkoutToDay(week, 'c', 'tue')!;
    expect(out.c).toBe('tue');
    expect(Object.values(out)).not.toContain('fri');
    expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('⚠️ never loses a session, whatever the move', () => {
    // The invariant the whole feature rests on. Every session, every target day.
    for (const w of week) {
      for (const day of WEEK_ORDER) {
        const out = moveWorkoutToDay(week, w.id, day);
        if (!out) continue;
        expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c', 'd']);
        // …and no two sessions end up on the same day.
        expect(new Set(Object.values(out)).size).toBe(4);
      }
    }
  });

  it('⚠️ a session with NO day displaces nobody into nowhere', () => {
    /*
     * A hypertrophy week names no days, so the mover has none to hand over. The occupant must still
     * land somewhere — a session that vanishes off the board because she dragged another one onto
     * it is the worst outcome available here.
     */
    const loose: BoardWorkout[] = [{ id: 'a', day: 'mon' }, { id: 'x' }];
    const out = moveWorkoutToDay(loose, 'x', 'mon')!;
    expect(out.x).toBe('mon');
    expect(out.a).toBeDefined();
    expect(out.a).not.toBe('mon');
  });

  it('costs nothing when nothing would change', () => {
    // A caller that persists on these writes a plan for no reason — and `saveCoachPlan` rotates
    // the change-diff anchors, so a pointless write would invent changes she never made.
    expect(moveWorkoutToDay(week, 'a', 'mon')).toBeNull();
    expect(moveWorkoutToDay(week, 'nope', 'tue')).toBeNull();
    expect(moveWorkoutToDay(week, 'a', 'someday' as never)).toBeNull();
  });
});

describe('⛔ …and starting a different day’s workout is the same move', () => {
  it('the session she started takes today, and today’s takes its day', () => {
    // She opens the app on Monday and trains Friday's session.
    const out = daysAfterStarting(week, 'c', 'mon')!;
    expect(out.c).toBe('mon');
    expect(out.a).toBe('fri');
  });

  it('⚠️ starting the session already on today changes nothing', () => {
    expect(daysAfterStarting(week, 'a', 'mon')).toBeNull();
  });

  it('it IS the drag — one mechanism, two doors', () => {
    // Not "behaves like": the same function, so the two can never disagree.
    expect(daysAfterStarting(week, 'c', 'mon')).toEqual(moveWorkoutToDay(week, 'c', 'mon'));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ AND WHERE A DROP LANDED — arithmetic on MEASURED rows, never on a row-height constant.
 *
 * The rows are not the same height. The open row carries a name, a shape line and a change pill and
 * stands about three times a closed one; a rest day is a letter and a hairline and stands shorter
 * than either. **Dividing the drag distance by any single number puts the session on the wrong day
 * for most of the week** — and silently: she drops it on Wednesday and finds it on Thursday.
 *
 * ⚠️ THIS IS THE HALF A DEVICE CANNOT TEST FOR ME. There is no simulator in this suite and no Xcode
 * in this project, so the gesture is verified by reading and the ARITHMETIC is verified here.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⛔ where a dragged row lands', () => {
  /* A real week: Monday open (tall), the rest closed, Tuesday and Thursday resting (short). */
  const rows: MeasuredRow[] = [
    { day: 'sun', y: 0, height: 44 },
    { day: 'mon', y: 44, height: 150 }, // the open row
    { day: 'tue', y: 194, height: 38 },
    { day: 'wed', y: 232, height: 44 },
    { day: 'thu', y: 276, height: 38 },
    { day: 'fri', y: 314, height: 44 },
    { day: 'sat', y: 358, height: 44 },
  ];

  it('lands on the row whose band holds the centre', () => {
    expect(dropTarget(rows, 10)).toBe('sun');
    expect(dropTarget(rows, 120)).toBe('mon');
    expect(dropTarget(rows, 250)).toBe('wed');
    expect(dropTarget(rows, 380)).toBe('sat');
  });

  it('⛔ a uniform row height would have got this wrong', () => {
    /*
     * The bug this exists to prevent, made concrete. At 44 px a row, a centre of 250 is "row 5" —
     * Thursday. It is Wednesday, because the open row above it is 150 px tall. The two answers
     * differ by a day, on the commonest layout the board has.
     */
    expect(Math.floor(250 / 44)).toBe(5);
    expect(rows[5].day).toBe('fri');
    expect(dropTarget(rows, 250)).toBe('wed');
  });

  it('⚠️ a drop past either end clamps rather than doing nothing', () => {
    // Refusing them would make Sunday and Saturday the two hardest days to reach.
    expect(dropTarget(rows, -80)).toBe('sun');
    expect(dropTarget(rows, 9000)).toBe('sat');
  });

  it('⚠️ a drop in the seam between two rows belongs to the nearer one', () => {
    const gapped: MeasuredRow[] = [
      { day: 'sun', y: 0, height: 40 },
      { day: 'mon', y: 60, height: 40 },
    ];
    expect(dropTarget(gapped, 48)).toBe('sun');
    expect(dropTarget(gapped, 56)).toBe('mon');
  });

  it('⚠️ a column with no days at all cannot be dropped on', () => {
    // Week one: the rows are NUMBERED, there are no weekdays, and dragging must mean nothing.
    expect(dropTarget([{ y: 0, height: 44 }, { y: 44, height: 44 }], 20)).toBeNull();
    expect(dropTarget([], 20)).toBeNull();
  });

  it('the two halves compose — a measured drop resolves to a real move', () => {
    const target = dropTarget(rows, 250)!;
    const out = moveWorkoutToDay([{ id: 'a', day: 'mon' }, { id: 'b', day: 'wed' }], 'a', target)!;
    expect(out.a).toBe('wed');
    expect(out.b).toBe('mon');
  });
});
