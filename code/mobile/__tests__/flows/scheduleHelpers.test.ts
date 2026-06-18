/**
 * Schedule helpers (audit defects 6 & 7).
 *  - sessionDayName: History labels stay stable when the program regenerates with
 *    fresh day ids (the backend composes a new id per session).
 *  - shouldReanchorWeekly: the Weekly Program Ready note re-anchors only on the
 *    rest→trainable transition, tracking real readiness instead of enrollment day.
 */
import { sessionDayName, shouldReanchorWeekly, nextWorkout, weekProgress } from '@/domain/schedule';
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
    expect(sessionDayName(s, program)).toBe('Full A'); // not the current program's "Full B"
  });

  it('falls back to a live program lookup for legacy sessions (no captured name)', () => {
    const s = session({ programDayId: 'day_new', programDayName: undefined });
    expect(sessionDayName(s, program)).toBe('Full B');
  });

  it('falls back to a neutral label when nothing matches — never empty (§7.9)', () => {
    const s = session({ programDayId: 'gone', programDayName: undefined });
    expect(sessionDayName(s, program)).toBe('Workout');
    expect(sessionDayName(s, null)).toBe('Workout');
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

describe('shouldReanchorWeekly (weekly note correctness)', () => {
  it('re-anchors only on rest → trainable (a fresh week became ready)', () => {
    expect(shouldReanchorWeekly(true, false)).toBe(true);
  });

  it('does not re-anchor on the other transitions / steady states', () => {
    expect(shouldReanchorWeekly(false, true)).toBe(false); // entering rest
    expect(shouldReanchorWeekly(false, false)).toBe(false); // still training
    expect(shouldReanchorWeekly(true, true)).toBe(false); // still resting
  });
});
