/**
 * ════ THE WATCH OFFERS ONLY WHAT IT CAN HONESTLY EXECUTE ════
 *
 * Until 2026-10-13 the wrist's own protocol was reps-at-a-load and nothing else — `targetWeight`,
 * `targetReps`, `setIndexInExercise` — and three of the coach's four shapes had no field in it. The
 * tempting fix was to send the lifts and drop the rest, and this law existed to prevent exactly
 * that: she starts "Intervals & Core" on her wrist, does the squats, never sees the running, and
 * finishes a different workout from the one the coach wrote — on the one device with no screen to
 * say so. So a session with anything the wrist could not run was NOT OFFERED standalone, and the
 * header said so plainly: *"widening the protocol is native work … and until it lands, 'you cannot
 * start this one from your wrist' is the honest answer."*
 *
 * It has landed (the wrist-alone plan, stage 1b). The founder: *"אני רוצה שהאימון בשעון יהיה ברמה
 * הגבוהה ביותר."* A day with a plank in it could not be started with the phone in a locker, and the
 * Start screen offered another day in its place. The wrist's engine now runs a hold on its own
 * clock and a carry in metres, and brings each home as an item
 * (`sync/theWristRunsWhatThePhoneRuns` plays both on the watch's real engine against the phone).
 *
 * What the law still holds, in its new shape:
 *
 *   · THE WHOLE SESSION OR NONE OF IT. A day is sent with every step in it, in the phone's own
 *     order. Nothing is ever dropped to make a session fit.
 *   · A WATCH ONE BUILD BEHIND IS SENT ONLY SETS. A day with a hold or a carry travels in
 *     `moreWorkouts`, a key that watch has never heard of — handed a plank inside `workouts` it would
 *     draw "set 1 of 2 · × 0" and write a set of zero reps into her record.
 *   · A SHAPE THE WRIST CANNOT DRAW IS STILL NOT SENT — the honest answer, where it is still true.
 */
// @ts-nocheck

//

import { buildCoachWatchPlan } from '@/platform/watch/watchPlan';
import { parseCoachPlan } from '@/domain/coachPlan';
import { coachWorkoutId } from '@/domain/coachWeek';

/** A week with one day of lifts, and one with four 400 m repeats ahead of its squats. */
function week() {
  const r = parseCoachPlan(
    JSON.stringify({
      say: 'Here is your week.',
      sessions: [
        {
          name: 'Lower',
          blocks: [
            { rounds: 3, restS: 120, items: [{ kind: 'reps', ex: 'bb_back_squat', reps: [8, 12], load: 60 }] },
            { rounds: 2, restS: 90, items: [{ kind: 'reps', ex: 'bb_rdl', reps: [8, 10], load: 40 }] },
          ],
        },
        {
          name: 'Intervals & Core',
          blocks: [
            { rounds: 4, restS: 60, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 400 }] },
            { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'bb_back_squat', reps: [8, 12], load: 60 }] },
          ],
        },
      ],
    }),
  );
  if (!r.ok) throw new Error(`the fixture must parse, got ${r.reason}`);
  return r.answer.plan!.sessions.map((s, i) => ({ id: coachWorkoutId(i), name: s.name, blocks: s.blocks }));
}

const build = (sessions = week()) =>
  buildCoachWatchPlan({ sessions, nowMs: Date.parse('2026-08-01T09:00:00Z'), restInterS: 120, restTransitionS: 150 });

describe('what reaches the wrist', () => {
  it('a day of lifts travels where every watch looks', () => {
    const plan = build()!;
    expect(plan.workouts.map((w) => w.name)).toEqual(['Lower']);
  });

  it('⛔ a day with a distance or a hold in it is sent WHOLE — and only where a watch that knows one looks', () => {
    const plan = build()!;
    // Never in `workouts`: a watch one build behind knows only sets.
    expect(plan.workouts.some((w) => w.name === 'Intervals & Core')).toBe(false);
    const [intervals] = plan.moreWorkouts!;
    expect(intervals.name).toBe('Intervals & Core');
    // Whole, in the order the phone would run it: four 400 m repeats, then three sets of squats.
    expect(intervals.steps.map((s) => (s.holdMetres ? `${s.holdMetres} m` : s.exerciseId))).toEqual(['400 m', '400 m', '400 m', '400 m', 'bb_back_squat', 'bb_back_squat', 'bb_back_squat']);
    // A repeat is not a set: no reps, and the rest the coach wrote after it.
    expect(intervals.steps[0]).toMatchObject({ targetReps: 0, holdMetres: 400, restAfterS: 60, restWritten: true, at: { block: 1, round: 1, position: 1 } });
    // …and the two lists read back in her week's order.
    expect([plan.workouts[0].seat, intervals.seat]).toEqual([0, 1]);
  });

  it('expands rounds into the sets the wrist counts through', () => {
    // A block done three times is three sets on the wrist, numbered the way she experiences them.
    const [lower] = build()!.workouts;
    expect(lower.steps.map((s) => s.exerciseId)).toEqual([
      'bb_back_squat', 'bb_back_squat', 'bb_back_squat', 'bb_rdl', 'bb_rdl',
    ]);
    expect(lower.steps.slice(0, 3).map((s) => s.setIndexInExercise)).toEqual([0, 1, 2]);
    expect(lower.steps[0].totalSetsInExercise).toBe(3);
  });

  it('sends the coach’s load, band and rest — not a tier default', () => {
    // The phone is the sole authority (S-48): what the wrist runs standalone must be the same
    // numbers the phone would have run, or the two disagree the moment she leaves it behind.
    const [squat] = build()!.workouts[0].steps;
    expect(squat.targetWeight).toBe(60);
    expect(squat.targetReps).toBe(8);
    expect(squat.targetRepsHi).toBe(12);
    expect(squat.restInterS).toBe(120);
  });

  it('a week of nothing but such days leaves `workouts` EMPTY for an older watch — "nothing left to run", not a stale week', () => {
    const cardioOnly = week().filter((s) => s.name === 'Intervals & Core');
    const plan = build(cardioOnly)!;
    expect(plan.workouts).toEqual([]);
    expect(plan.moreWorkouts!.map((w) => w.name)).toEqual(['Intervals & Core']);
  });

  it('says NOTHING when there is nothing at all, and does not send a shape it cannot draw', () => {
    expect(build([])).toBeNull();
    // An item of a kind the wrist has no way to draw: the day is not sent, in either list.
    const strange = [{ id: 'w_x', name: 'Mobility', blocks: [{ rounds: 1, items: [{ kind: 'open', ex: 'mobility_flow' }] }] }];
    expect(build(strange)).toBeNull();
    const mixed = build([...week(), ...strange])!;
    expect([...mixed.workouts, ...(mixed.moreWorkouts ?? [])].map((w) => w.name)).toEqual(['Lower', 'Intervals & Core']);
  });
});
