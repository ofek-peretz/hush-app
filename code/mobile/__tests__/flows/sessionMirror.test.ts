/**
 * Canonical SessionMirror — the single projection for Live Activity / Dynamic
 * Island / Apple Watch. Projection rules + drift-proof rest + wire serialization.
 */
// @ts-nocheck

// 

import {
  projectSessionMirror,
  mirrorToWire,
  mirrorFromWire,
  MIRROR_SCHEMA_VERSION,
  type MirrorInputs,
  type MirrorStep,
} from '@/platform/sessionMirror';
import type { SessionMachine } from '@/state/machines/sessionState';

const STEPS: MirrorStep[] = [
  { exerciseName: 'Bench Press', setIndexInExercise: 0, totalSetsInExercise: 2, globalIndex: 0, targetWeight: 60, targetReps: 5 },
  { exerciseName: 'Bench Press', setIndexInExercise: 1, totalSetsInExercise: 2, globalIndex: 1, targetWeight: 60, targetReps: 5 },
  { exerciseName: 'Squat', setIndexInExercise: 0, totalSetsInExercise: 1, globalIndex: 2, targetWeight: 100, targetReps: 5 },
];

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

function machine(over: Partial<SessionMachine>): SessionMachine {
  return { phase: 'SET_PRESENTED', resumePhase: null, setIndex: 0, isLastSetOfSession: false, earlyFinish: false, ...over } as SessionMachine;
}

function project(over: Partial<MirrorInputs>) {
  return projectSessionMirror({
    steps: STEPS,
    total: STEPS.length,
    machine: machine({}),
    restInterS: 90,
    restTransitionS: 120,
    restStartedAtMs: null,
    nowMs: NOW,
    ...over,
  });
}

describe('projectSessionMirror', () => {
  it('returns null when there is no session (empty plan) → host tears down', () => {
    expect(project({ steps: [], total: 0 })).toBeNull();
  });

  it('projects an active set with its target (watch renders this subset)', () => {
    const m = project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 0 }) })!;
    expect(m!.phase).toBe('active_set');
    expect(m!.exerciseName).toBe('Bench Press');
    expect(m!.setLabel).toBe('Set 1 of 2');
    expect(m!.globalIndex).toBe(0);
    expect(m!.totalSets).toBe(3);
    expect(m!.targetWeight).toBe(60);
    expect(m!.restEndsAt).toBeNull();
  });

  it('projects an inter-set rest with a drift-proof absolute end instant', () => {
    const startedAt = NOW - 30_000; // rest began 30s ago
    const m = project({ machine: machine({ phase: 'REST_INTER', setIndex: 0 }), restStartedAtMs: startedAt })!;
    expect(m!.phase).toBe('rest_inter');
    expect(m!.restEndsAt).toBe(new Date(startedAt + 90_000).toISOString());
    expect(m!.restRemainingS).toBe(60); // 90 - 30 elapsed
  });

  it('projects a transition rest with the next exercise preview', () => {
    const m = project({ machine: machine({ phase: 'REST_TRANSITION', setIndex: 1 }), restStartedAtMs: NOW })!;
    expect(m!.phase).toBe('rest_transition');
    expect(m!.restRemainingS).toBe(120);
    expect(m!.nextExerciseName).toBe('Squat');
  });

  it('freezes the timer under pause (no live countdown)', () => {
    const m = project({ machine: machine({ phase: 'PAUSED', resumePhase: 'REST_INTER', setIndex: 0 }), restStartedAtMs: NOW })!;
    expect(m!.phase).toBe('paused');
    expect(m!.restEndsAt).toBeNull();
    expect(m!.restRemainingS).toBeNull();
  });

  it('projects a terminal complete frame (watch shows Workout Complete)', () => {
    const m = project({ machine: machine({ phase: 'SESSION_SAVED', setIndex: 3 }) })!;
    expect(m!.phase).toBe('complete');
    expect(m!.restEndsAt).toBeNull();
  });

  /**
   * THE OFF-BY-ONE SET (found in the hermetic audit of the 2026-07-12 batch).
   *
   * `sessionState` does not advance `setIndex` when a set is completed — it advances on END_REST,
   * because the rest belongs to the set that earned it. So on a REST frame the mirror's `setLabel`
   * / `setNumber` describe the set the athlete has just FINISHED. The phone's rest screen reads
   * `nextSetLabel` from its own store and was right; the WATCH and the LIVE ACTIVITY both read
   * `setLabel` and were telling a resting athlete they were on the set they had already done.
   *
   * It hid for months because the load was printed next to it and the load is the same for both
   * sets of the same exercise — the eye went to the number that mattered and never audited the
   * one that didn't. It became visible the moment the up-next law stripped the load away and left
   * the set number alone on the line.
   */
  it('during a REST, the mirror names the set that is COMING — not the one just finished', () => {
    // Set 1 of 2 on the bench is done; the athlete is resting before set 2.
    const m = project({ machine: machine({ phase: 'REST_INTER', setIndex: 0 }), restStartedAtMs: NOW - 10_000 })!;
    expect(m!.phase).toBe('rest_inter');
    // What is behind them:
    expect(m!.setLabel).toBe('Set 1 of 2');
    expect(m!.setNumber).toBe(1);
    // …and what is in front of them, which is the only thing a rest screen may show.
    expect(m!.nextSetLabel).toBe('Set 2 of 2');
    expect(m!.nextSetNumber).toBe(2);
    expect(m!.nextSetsInExercise).toBe(2);
  });

  it('a TRANSITION rest names the first set of the exercise the athlete is walking to', () => {
    // The last bench set is done; next is the squat.
    const m = project({ machine: machine({ phase: 'REST_TRANSITION', setIndex: 1 }), restStartedAtMs: NOW - 10_000 })!;
    expect(m!.phase).toBe('rest_transition');
    expect(m!.nextExerciseName).toBe('Squat');
    expect(m!.nextSetLabel).toBe('Set 1 of 1');
    expect(m!.nextSetNumber).toBe(1);
  });

  it('an ACTIVE set has no "next" to name — the set on the stage IS the set', () => {
    const m = project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 0 }) })!;
    expect(m!.nextSetLabel).toBeNull();
    expect(m!.nextSetNumber).toBe(0);
  });

  it('the LAST set of the session rests against nothing — no phantom next set', () => {
    const m = project({ machine: machine({ phase: 'REST_INTER', setIndex: STEPS.length - 1 }), restStartedAtMs: NOW })!;
    expect(m!.nextSetLabel).toBeNull();
    expect(m!.nextSetNumber).toBe(0);
  });

  /**
   * THE MARK REACHES THE WRIST (founder 2026-07-13). The milestone is earned on the phone, from
   * the phone's history, and rides the terminal frame as finished copy — so an athlete who trained
   * with the phone in a locker still gets beat 4. It rides ONLY that frame: a mark is celebrated
   * on the session that crossed it and on no other.
   */
  it('carries the session-crossed milestone on the complete frame — and nowhere else', () => {
    const milestone = { value: '100', caption: 'workouts', title: '100 workouts.', sub: undefined };
    const done = project({ machine: machine({ phase: 'SESSION_SAVED', setIndex: 3 }), milestone })!;
    expect(done.summary!.milestone).toEqual(milestone);

    // A live frame has no summary at all — nothing to celebrate mid-workout.
    const live = project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 0 }), milestone })!;
    expect(live.summary).toBeNull();
  });

  it('a workout that crossed nothing sends no mark (the medallion is rare, or it is nothing)', () => {
    const m = project({ machine: machine({ phase: 'SESSION_SAVED', setIndex: 3 }) })!;
    expect(m!.summary!.milestone).toBeNull();
  });

  it('Complete summary reports the ACTUAL logged sets + trained lifts, not the plan total', () => {
    // An early finish at 2:11 with only 2 of 3 planned sets done — the watch must NOT say "3 sets".
    const m = project({
      machine: machine({ phase: 'SESSION_SAVED', setIndex: 1, earlyFinish: true }),
      sessionStartedAtMs: NOW - 131_000,
      completedSets: 2,
      progressedLifts: 1,
    })!;
    expect(m!.summary).toMatchObject({ timeLabel: '2:11', sets: 2, up: 1 });
  });

  it('the read-back the wrist plays is the PERFORMED lifts, and only those (founder 2026-07-13)', () => {
    // The watch's closing beat is the phone's: it walks the lifts the athlete actually trained and
    // lands a green check on each. A lift they never reached is not part of the workout that just
    // happened — an early finish must not close on a list of things left undone.
    const m = project({
      machine: machine({ phase: 'SESSION_SAVED', setIndex: 1, earlyFinish: true }),
      sessionStartedAtMs: NOW - 131_000,
      completedSets: 2, // both Bench sets logged; the Squat never reached
      progressedLifts: 1,
      loggedSets: [
        { weight: 60, reps: 5 }, // 300 kg·rep
        { weight: 62.5, reps: 6 }, // 375 — the best set, by volume (the phone's own rule)
      ],
    })!;
    expect(m!.summary!.lifts.map((l) => l.name)).toEqual(['Bench Press']);
    // The best set, formatted the way the phone prints it beside the check.
    expect(m!.summary!.lifts[0].best).toBe('62.5 × 6');
  });

  it('the read-back reports what was LIFTED, not what was prescribed', () => {
    // An athlete who edits a set down to what they really did must see THAT number read back.
    const m = project({
      machine: machine({ phase: 'SESSION_SAVED', setIndex: 2 }),
      sessionStartedAtMs: NOW - 131_000,
      completedSets: 3,
      loggedSets: [
        { weight: 60, reps: 5 },
        { weight: 60, reps: 3 },
        { weight: null, reps: 12 }, // the Squat, logged as bodyweight
      ],
    })!;
    expect(m!.summary!.lifts).toEqual([
      { name: 'Bench Press', best: '60 × 5' },
      { name: 'Squat', best: 'BW × 12' },
    ]);
  });

  it('with no logged sets supplied, the prescription stands in (pure-projection back-compat)', () => {
    const m = project({ machine: machine({ phase: 'SESSION_SAVED', setIndex: 3 }) })!;
    expect(m!.summary!.lifts).toEqual([
      { name: 'Bench Press', best: '60 × 5' },
      { name: 'Squat', best: '100 × 5' },
    ]);
  });

  it('the best set of a BODYWEIGHT lift is the longest one, not the first one', () => {
    // Bodyweight volume is 0 by definition, so a volume-only comparison could never separate two
    // sets of pull-ups — "your best set" silently meant "your first set", forever.
    const bwSteps: MirrorStep[] = [
      { exerciseName: 'Pull-up', setIndexInExercise: 0, totalSetsInExercise: 2, globalIndex: 0, targetWeight: null, targetReps: 8 },
      { exerciseName: 'Pull-up', setIndexInExercise: 1, totalSetsInExercise: 2, globalIndex: 1, targetWeight: null, targetReps: 8 },
    ];
    const m = project({
      steps: bwSteps,
      total: 2,
      machine: machine({ phase: 'SESSION_SAVED', setIndex: 1 }),
      completedSets: 2,
      loggedSets: [
        { weight: null, reps: 8 },
        { weight: null, reps: 11 }, // the longer set — this is the one read back
      ],
    })!;
    expect(m!.summary!.lifts[0].best).toBe('BW × 11');
  });

  it('keeps the deprecated `done` on the wire — an older watch binary decodes it or drops the frame', () => {
    // The watch app updates asynchronously from the phone app; until it does, it needs this field.
    // (Delete the field, and this test, one release after Build 30.)
    const m = project({
      machine: machine({ phase: 'SESSION_SAVED', setIndex: 1, earlyFinish: true }),
      completedSets: 1, // one of Bench's two sets — performed, but NOT finished
      loggedSets: [{ weight: 60, reps: 5 }],
    })!;
    expect(m!.summary!.lifts).toEqual([{ name: 'Bench Press', best: '60 × 5' }]);
  });

  it('Complete summary falls back to the planned total when no live count is supplied', () => {
    const m = project({ machine: machine({ phase: 'SESSION_SAVED', setIndex: 3 }) })!;
    expect(m!.summary!.sets).toBe(3); // STEPS.length — pure-projection back-compat
  });

  it('carries TO-LOAD only on the live set (instruction-first), never on the complete frame', () => {
    const toLoad = project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 0 }), toLoad: true })!;
    expect(toLoad.toLoad).toBe(true);
    const loaded = project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 0 }), toLoad: false })!;
    expect(loaded.toLoad).toBe(false);
    // Rests + complete never carry a load-action flag.
    expect(project({ machine: machine({ phase: 'REST_INTER', setIndex: 0 }), restStartedAtMs: NOW, toLoad: true })!.toLoad).toBe(false);
    expect(project({ machine: machine({ phase: 'SESSION_SAVED', setIndex: 3 }), toLoad: true })!.toLoad).toBe(false);
  });

  it('offers Exercise Busy at ANY set of an exercise with a later one (2026-09-07 — the board)', () => {
    // idx 0 = Bench set 1 of 2, with Squat later → offerable
    expect(project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 0 }) })!.canMarkBusy).toBe(true);
    // idx 1 = Bench set 2 of 2 — a station is taken when it is taken; the remainder defers → offerable
    expect(project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 1 }) })!.canMarkBusy).toBe(true);
    // idx 2 = Squat set 1 of 1 (no later exercise) → not offerable
    expect(project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 2 }) })!.canMarkBusy).toBe(false);
  });

  it('names the just-finished exercise on a transition rest (Exercise Complete)', () => {
    const m = project({ machine: machine({ phase: 'REST_TRANSITION', setIndex: 1 }), restStartedAtMs: NOW })!;
    expect(m!.completedExerciseName).toBe('Bench Press');
    expect(m!.nextExerciseName).toBe('Squat');
    expect(m!.nextTargetWeight).toBe(100);
    expect(m!.nextTargetReps).toBe(5);
  });

  it('does not name a completed exercise during an inter-set rest', () => {
    const m = project({ machine: machine({ phase: 'REST_INTER', setIndex: 0 }), restStartedAtMs: NOW })!;
    expect(m!.completedExerciseName).toBeNull();
  });
});

describe('mirror wire serialization', () => {
  it('round-trips a mirror through the wire form', () => {
    const m = project({})!;
    const back = mirrorFromWire(mirrorToWire(m!));
    expect(back).toEqual(m);
  });

  it('rejects an unknown schema and malformed input (no garbage rendered)', () => {
    expect(mirrorFromWire({ schema: 999, phase: 'active_set', exerciseName: 'x' })).toBeNull();
    expect(mirrorFromWire(null)).toBeNull();
    expect(mirrorFromWire({ schema: MIRROR_SCHEMA_VERSION })).toBeNull();
  });
});

/**
 * THE SIGNATURE MOMENT, on the wrist (2026-07-17).
 *
 * The brief calls Loop 1's real-time load correction "the single most distinctive moment in the
 * product", and requires that "the same change appears on the watch". Before this, nothing appeared
 * on either surface: the store ran `applyLoop1`, sent the result to TELEMETRY, and swapped the plan
 * underneath the athlete. She arrived at a different number with no account of why.
 *
 * It rides the ONE canonical projection (§8.5) precisely so the phone and the wrist cannot disagree
 * about it — a second path would be a second truth.
 */
describe('the signature moment reaches the wrist', () => {
  const CORR = { from: 60, to: 62.5, direction: 'up' as const, reps: 12 };

  it('carries the correction through the rest that follows the set that earned it', () => {
    const m = project({ machine: machine({ phase: 'REST_INTER', setIndex: 1 }), correction: CORR });
    expect(m!.correction).toEqual(CORR);
  });

  it('says nothing on the ACTIVE set — the load in front of her IS the corrected one', () => {
    // Announcing it there would narrate the present, not the change. The moment belongs to the rest
    // between the set that earned it and the set that spends it.
    const m = project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 1 }), correction: CORR });
    expect(m!.correction).toBeNull();
  });

  it('is null on a rest that earned nothing — a held load is not news', () => {
    const m = project({ machine: machine({ phase: 'REST_INTER', setIndex: 1 }) });
    expect(m!.correction).toBeNull();
  });

  it('says nothing on a TRANSITION rest — the correction belongs to the lift that earned it', () => {
    // The athlete is already looking at the next LIFT here, and a correction is about the next SET
    // of the lift she just finished. Announcing it over a different exercise's name would be Hush
    // claiming a change it did not make to the thing on screen.
    //
    // Loop 1 makes the last set of an exercise a no-op (liveSession.ts — there is no next set to
    // correct), so the store should never hand us one on a transition frame anyway. This pins the
    // invariant in the projection rather than leaving both surfaces relying on a rule two modules
    // away: SessionFlow guards it as `correction.exerciseId === nextExerciseId`, and the wrist has
    // no exerciseId on the wire to guard with at all.
    const m = project({ machine: machine({ phase: 'REST_TRANSITION', setIndex: 1 }), correction: CORR });
    expect(m!.correction).toBeNull();
  });

  it('survives the wire — an old watch drops the line, never the frame', () => {
    // The field is optional on purpose: the watch app installs asynchronously from the phone app, so
    // this phone will spend a while talking to the previous watch binary (see MirrorSummaryLift.done
    // for the last time that bit us). A version-skewed wrist must still show the right next load.
    const m = project({ machine: machine({ phase: 'REST_INTER', setIndex: 1 }), correction: CORR });
    const back = mirrorFromWire(mirrorToWire(m!));
    expect(back?.correction).toEqual(CORR);
  });
});
