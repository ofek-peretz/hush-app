/**
 * ════ "DID SHE FINISH THE WORKOUT?" — WHEN THERE IS NO PROGRAMME DAY TO ASK ════
 *
 * The founder's rule: a session finishes the workout at HALF its prescribed sets or more. Below
 * that the work is still real — it is in History and every figure counts it — but the workout stays
 * on the week's list, so one exercise out of six never costs her the session.
 *
 * That verdict was computed by looking the programme day up and counting its slots, and it had two
 * failure modes. The first was already known: the programme changes shape and the lookup finds
 * nothing. The second arrived with the coach and is worse, because it fails SILENTLY IN THE
 * PERMISSIVE DIRECTION — a coach session has no `ProgramDay` at all, and the fallback for an
 * unknown prescription is "any logged work counts". One set would have finished the workout, burned
 * a free trial session, and closed the week's slot.
 *
 * So the number travels WITH the session, stamped at start: what she was actually asked to do, by
 * whoever asked.
 */
// @ts-nocheck

// 

import { sessionTrained, workoutTrained, WORKOUT_TRAINED_FRACTION } from '@/domain/completion';
import type { ProgramDay, Session, SetLog } from '@/data/local/models';

function set(i: number): SetLog {
  return {
    exerciseId: 'bb_bench_press', setIndex: i, recommendedWeight: 40, recommendedReps: 8,
    actualWeight: 40, actualReps: 8, edited: false, restBeforeS: 120,
    persistedAt: '2026-08-01T18:00:00.000Z',
  };
}

function session(sets: number, over: Partial<Session> = {}): Session {
  return {
    id: 's', programDayId: 'coach_0', programDayName: 'Upper A',
    startedAt: '2026-08-01T17:00:00.000Z', state: 'SAVED', earlyFinish: false,
    sets: Array.from({ length: sets }, (_, i) => set(i)),
    ...over,
  };
}

describe('a coach session, which has no programme day', () => {
  it('needs half of what it prescribed, exactly as an engine workout does', () => {
    const twelve = { prescribed: 12 };
    expect(sessionTrained(session(6, twelve), null)).toBe(true);
    expect(sessionTrained(session(5, twelve), null)).toBe(false);
    // The rule itself, stated once so a changed fraction cannot pass unnoticed.
    expect(WORKOUT_TRAINED_FRACTION).toBe(0.5);
  });

  it('⚠️ does NOT let one set finish a twelve-set workout', () => {
    /*
     * The whole reason this exists. Without the stamped number the lookup finds nothing, the
     * fallback is "any logged work counts", and a single set burns a free trial session and closes
     * the week's slot — silently, and in the direction that costs her.
     */
    expect(sessionTrained(session(1, { prescribed: 12 }), null)).toBe(false);
    // …and that IS what happens with no prescription, which is why it had to be stamped.
    expect(sessionTrained(session(1), null)).toBe(true);
  });

  /*
   * THE SESSION RUNS ITSELF (2026-09-07, `domain/setEvidence`): the clock writes `presumed` sets.
   * Whether they count toward "she trained the workout" is decided by the one thing the clock
   * cannot fake — her word that she finished (`finishedByAthlete`).
   */
  it('⛔ presumed sets count only under her word', () => {
    const twelve = { prescribed: 12 };
    const presumed = (n: number) => Array.from({ length: n }, (_, i) => ({ ...set(i), presumed: true as const }));
    // Two she typed, six the clock wrote. She pressed finish → all eight are hers → TRAINED.
    expect(sessionTrained(session(0, { ...twelve, finishedByAthlete: true, sets: [set(0), set(1), ...presumed(6)] }), null)).toBe(true);
    // The same rows with nobody's word behind them (a salvage) → only the two she typed count.
    expect(sessionTrained(session(0, { ...twelve, sets: [set(0), set(1), ...presumed(6)] }), null)).toBe(false);
    // …and `items` mirror the mark, so a coach session answers identically through its canonical record.
    const items = (n: number, presumedFrom: number) =>
      Array.from({ length: n }, (_, i) => ({
        kind: 'reps' as const, ex: 'bb_bench_press', block: 1, round: 1, position: 1, load: 40, reps: 8, at: '2026-08-01T18:00:00.000Z',
        ...(i >= presumedFrom ? { presumed: true as const } : {}),
      }));
    expect(sessionTrained(session(0, { ...twelve, sets: [], items: items(8, 2), finishedByAthlete: true }), null)).toBe(true);
    expect(sessionTrained(session(0, { ...twelve, sets: [], items: items(8, 2) }), null)).toBe(false);
  });

  it('still refuses a session with no work at all', () => {
    expect(sessionTrained(session(0, { prescribed: 12 }), null)).toBe(false);
  });
});

describe('what the stamped number is preferred over', () => {
  const day: ProgramDay = {
    id: 'day_1', name: 'Upper A', muscleGroups: [], isRest: false,
    slots: [{ capability: 'push_h' as never, exerciseId: 'bb_bench_press', setCount: 4 }],
  };

  it('beats a programme that has changed shape since she trained', () => {
    // She was prescribed twelve sets and did six. The programme is four sets now, and the lookup
    // would call six a finished workout of a session she only half-completed.
    expect(sessionTrained(session(6, { prescribed: 12 }), day)).toBe(true);
    expect(sessionTrained(session(2, { prescribed: 12 }), day)).toBe(false);
    // The lookup, on the same session, disagrees — which is the drift being removed.
    expect(workoutTrained(2, day)).toBe(true);
  });

  it('falls back to the lookup on a session saved before the field existed', () => {
    // Never strand an old session in limbo because a field arrived after it was written.
    expect(sessionTrained(session(2), day)).toBe(true);
  });

  it('ignores a prescription of zero rather than treating it as "nothing was asked"', () => {
    // A zero taken at face value would make `ceil(0 * 0.5)` = 0 and EVERY session trained. It falls
    // through to the lookup instead, which here prescribes four — so one set is not a workout.
    expect(sessionTrained(session(1, { prescribed: 0 }), day)).toBe(false);
    expect(sessionTrained(session(2, { prescribed: 0 }), day)).toBe(true);
    expect(sessionTrained(session(0, { prescribed: 0 }), day)).toBe(false);
  });
});
