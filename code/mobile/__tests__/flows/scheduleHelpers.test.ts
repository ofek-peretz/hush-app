/**
 * Schedule helpers (audit defects 6 & 7).
 *  - sessionDayName: History labels stay stable when the program regenerates with
 *    fresh day ids (the backend composes a new id per session).
 */
// @ts-nocheck

// 

import { sessionDayName, nextWorkout, weekProgress } from '@/domain/schedule';
import type { Program, ProgramDay, Session } from '@/data/local/models';

function session(partial: Partial<Session>): Session {
  return {
    id: 's1',
    programDayId: 'day_old',
    startedAt: '2026-06-14T00:00:00Z',
    state: 'SAVED',
    earlyFinish: false,
    sets: [],
    ...partial,
  };
}

const program: Program = {
  id: 'p',
  frequency: 1,
  days: [{ id: 'day_new', name: 'Full B', muscleGroups: [], isRest: false, slots: [] }],
};

describe('sessionDayName (stable History labels)', () => {
  it('prefers the name captured at start (survives regeneration with new ids)', () => {
    const s = session({ programDayId: 'day_old', programDayName: 'Full A' });
    expect(sessionDayName(s)).toBe('Full A'); // not the current program's "Full B"
  });

  it('says "Workout" for a legacy session that never captured a name', () => {
    /*
     * It used to fall back to a live programme lookup. There is no programme to look in, and the
     * fallback was always the weaker answer: it named the workout by what the plan says TODAY
     * rather than by what she actually trained that day.
     */
    expect(sessionDayName(session({ programDayId: 'day_new', programDayName: undefined }))).toBe('Workout');
  });

  it('falls back to a neutral label when nothing matches — never empty (§7.9)', () => {
    const s = session({ programDayId: 'gone', programDayName: undefined });
    expect(sessionDayName(s)).toBe('Workout');
    expect(sessionDayName(s)).toBe('Workout');
  });
});

describe('nextWorkout / weekProgress (weekly bucket — no calendar)', () => {
  const workout = (id: string, completed: boolean): ProgramDay => ({
    id, name: id, muscleGroups: [], isRest: false, slots: [], completed,
  });
  const week = (days: ProgramDay[]): Program => ({ id: 'w', frequency: days.length, days });

  it('offers the first UNFINISHED workout (any order, not a weekday)', () => {
    const p = week([workout('a', true), workout('b', false), workout('c', false)]);
    expect(nextWorkout(p)?.id).toBe('b'); // a is done → skip it
  });

  it('returns null when every workout is done (week complete → Home rests)', () => {
    const p = week([workout('a', true), workout('b', true)]);
    expect(nextWorkout(p)).toBeNull();
  });

  it('never offers a (legacy) rest day as a workout', () => {
    const p = week([{ id: 'r', name: 'Rest', muscleGroups: [], isRest: true, slots: [] }, workout('b', false)]);
    expect(nextWorkout(p)?.id).toBe('b');
  });

  it('weekProgress counts completed real workouts over the total', () => {
    const p = week([workout('a', true), workout('b', false), workout('c', true)]);
    expect(weekProgress(p)).toEqual({ done: 2, total: 3 });
  });
});
