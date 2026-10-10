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
// @ts-nocheck

// 

import { moveWorkoutToDay, daysAfterStarting, type BoardWorkout } from '@/domain/weekBoard';
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
 * ════ ⛔ AND THE DRAG ITSELF IS GONE (founder 2026-08-12) ════
 *
 * *"ואמרנו שזה לא יופיע כימים אלא כN אימונים."* Ruled: the week is always numbered, never a
 * calendar — so there are no weekday rows to drop onto, `DraggableWeekRow` is deleted and
 * `dropTarget` with it.
 *
 * ⚠️ WHAT WENT WITH IT WAS SOME OF THE BEST ARITHMETIC IN THIS FILE, and it is worth recording why
 * rather than just removing the tests. `dropTarget` resolved a drop against MEASURED row bands
 * instead of a row-height constant, because the rows were never the same height — the open one stood
 * about three times a closed one. Dividing by any single number put the session on the wrong day for
 * most of the week, silently. Six tests held that. They are gone because their subject is, not
 * because they stopped being right.
 *
 * ⛔ AND THE FEATURE HAD ALREADY STOPPED WORKING FOR ALMOST EVERYONE. `Home`'s own comment said so:
 * `saveCoachPlanDays` returns early when no coach plan is stored, so on every GENERATED week — every
 * athlete who did not import a programme — the row lifted, sprang back and changed nothing.
 *
 * ── WHAT SURVIVES, AND IT IS THE HALF THAT MATTERS ──────────────────────────────────────────────
 * `moveWorkoutToDay` and `daysAfterStarting`, tested above. They are no longer about a gesture:
 * when she STARTS a session that sits elsewhere in the week, the days are rewritten so the record
 * matches what she actually did. **Observation stays; assignment is what left.**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
