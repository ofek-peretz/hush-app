/**
 * ════ THE WATCH OFFERS ONLY WHAT IT CAN HONESTLY EXECUTE ════
 *
 * The wrist's protocol is reps-at-a-load and nothing else — `targetWeight`, `targetReps`,
 * `setIndexInExercise`. Three of the coach's four shapes have no field in it: a 400 m repeat, a
 * 45-second hold, and open work all have nowhere to go.
 *
 * The tempting fix is to send the lifts and drop the rest. That is the one thing this whole layer
 * exists to prevent: she starts "Intervals & Core" on her wrist, does the squats, never sees the
 * running, and finishes a different workout from the one the coach wrote — on the one device with
 * no screen to say so, and no phone in her pocket to say it either.
 *
 * So a session with anything the wrist cannot run is NOT OFFERED standalone. That is a true
 * statement about this device today. Widening the protocol is native work — Swift, a schema bump,
 * and a watch binary that installs asynchronously from the phone — and until it lands, "you cannot
 * start this one from your wrist" is the honest answer rather than a silent edit of her session.
 */
// @ts-nocheck

// 

import { buildCoachWatchPlan } from '@/platform/watch/watchPlan';
import { parseCoachPlan } from '@/domain/coachPlan';
import { coachWorkoutId } from '@/domain/coachWeek';

/** A week with one liftable session and one the wrist has no vocabulary for. */
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
  it('offers the session it can run', () => {
    const plan = build()!;
    expect(plan.workouts.map((w) => w.name)).toEqual(['Lower']);
  });

  it('does NOT offer a session it would have to edit to fit', () => {
    // The whole point. "Intervals & Core" is three squat rounds the wrist could run and four 400 m
    // repeats it could not — and a workout with the running quietly missing is not that workout.
    expect(build()!.workouts.some((w) => w.name === 'Intervals & Core')).toBe(false);
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

  it('says NOTHING rather than showing an empty lobby when it can run none of them', () => {
    /*
     * An empty plan on the wrist reads as "you have no workouts". She has a week — just not one
     * this device can run by itself, which is a different sentence and the honest one.
     */
    const cardioOnly = week().filter((s) => s.name === 'Intervals & Core');
    expect(build(cardioOnly)).toBeNull();
    expect(build([])).toBeNull();
  });
});
