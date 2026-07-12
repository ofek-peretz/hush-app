/**
 * Canonical SessionMirror — the single projection for Live Activity / Dynamic
 * Island / Apple Watch. Projection rules + drift-proof rest + wire serialization.
 */
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
  return { phase: 'SET_PRESENTED', resumePhase: null, setIndex: 0, isLastSetOfSession: false, earlyFinish: false, ...over };
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
    expect(m.phase).toBe('active_set');
    expect(m.exerciseName).toBe('Bench Press');
    expect(m.setLabel).toBe('Set 1 of 2');
    expect(m.globalIndex).toBe(0);
    expect(m.totalSets).toBe(3);
    expect(m.targetWeight).toBe(60);
    expect(m.restEndsAt).toBeNull();
  });

  it('projects an inter-set rest with a drift-proof absolute end instant', () => {
    const startedAt = NOW - 30_000; // rest began 30s ago
    const m = project({ machine: machine({ phase: 'REST_INTER', setIndex: 0 }), restStartedAtMs: startedAt })!;
    expect(m.phase).toBe('rest_inter');
    expect(m.restEndsAt).toBe(new Date(startedAt + 90_000).toISOString());
    expect(m.restRemainingS).toBe(60); // 90 - 30 elapsed
  });

  it('projects a transition rest with the next exercise preview', () => {
    const m = project({ machine: machine({ phase: 'REST_TRANSITION', setIndex: 1 }), restStartedAtMs: NOW })!;
    expect(m.phase).toBe('rest_transition');
    expect(m.restRemainingS).toBe(120);
    expect(m.nextExerciseName).toBe('Squat');
  });

  it('freezes the timer under pause (no live countdown)', () => {
    const m = project({ machine: machine({ phase: 'PAUSED', resumePhase: 'REST_INTER', setIndex: 0 }), restStartedAtMs: NOW })!;
    expect(m.phase).toBe('paused');
    expect(m.restEndsAt).toBeNull();
    expect(m.restRemainingS).toBeNull();
  });

  it('projects a terminal complete frame (watch shows Workout Complete)', () => {
    const m = project({ machine: machine({ phase: 'SESSION_SAVED', setIndex: 3 }) })!;
    expect(m.phase).toBe('complete');
    expect(m.restEndsAt).toBeNull();
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
    expect(m.phase).toBe('rest_inter');
    // What is behind them:
    expect(m.setLabel).toBe('Set 1 of 2');
    expect(m.setNumber).toBe(1);
    // …and what is in front of them, which is the only thing a rest screen may show.
    expect(m.nextSetLabel).toBe('Set 2 of 2');
    expect(m.nextSetNumber).toBe(2);
    expect(m.nextSetsInExercise).toBe(2);
  });

  it('a TRANSITION rest names the first set of the exercise the athlete is walking to', () => {
    // The last bench set is done; next is the squat.
    const m = project({ machine: machine({ phase: 'REST_TRANSITION', setIndex: 1 }), restStartedAtMs: NOW - 10_000 })!;
    expect(m.phase).toBe('rest_transition');
    expect(m.nextExerciseName).toBe('Squat');
    expect(m.nextSetLabel).toBe('Set 1 of 1');
    expect(m.nextSetNumber).toBe(1);
  });

  it('an ACTIVE set has no "next" to name — the set on the stage IS the set', () => {
    const m = project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 0 }) })!;
    expect(m.nextSetLabel).toBeNull();
    expect(m.nextSetNumber).toBe(0);
  });

  it('the LAST set of the session rests against nothing — no phantom next set', () => {
    const m = project({ machine: machine({ phase: 'REST_INTER', setIndex: STEPS.length - 1 }), restStartedAtMs: NOW })!;
    expect(m.nextSetLabel).toBeNull();
    expect(m.nextSetNumber).toBe(0);
  });

  it('Complete summary reports the ACTUAL logged sets + trained lifts, not the plan total', () => {
    // An early finish at 2:11 with only 2 of 3 planned sets done — the watch must NOT say "3 sets".
    const m = project({
      machine: machine({ phase: 'SESSION_SAVED', setIndex: 1, earlyFinish: true }),
      sessionStartedAtMs: NOW - 131_000,
      completedSets: 2,
      progressedLifts: 1,
    })!;
    expect(m.summary).toMatchObject({ timeLabel: '2:11', sets: 2, up: 1 });
  });

  it('Complete summary carries the LIFT-BY-LIFT read-back the wrist plays (founder 2026-07-12)', () => {
    // The watch's closing beat walks the workout lift by lift and lands a check on each one that
    // was finished. An early finish is exactly where that matters: what did I train, what did I
    // leave? A lift is done only when every set it was prescribed sits behind the frontier.
    const m = project({
      machine: machine({ phase: 'SESSION_SAVED', setIndex: 1, earlyFinish: true }),
      sessionStartedAtMs: NOW - 131_000,
      completedSets: 2,
      progressedLifts: 1,
    })!;
    expect(m.summary!.lifts.length).toBeGreaterThan(0);
    // Each entry names a lift and says, plainly, whether it was finished.
    for (const l of m.summary!.lifts) {
      expect(typeof l.name).toBe('string');
      expect(typeof l.done).toBe('boolean');
    }
    // …and a lift whose sets were NOT all logged is not marked done.
    const unfinished = m.summary!.lifts.filter((l) => !l.done);
    expect(unfinished.length).toBeGreaterThan(0);
  });

  it('Complete summary falls back to the planned total when no live count is supplied', () => {
    const m = project({ machine: machine({ phase: 'SESSION_SAVED', setIndex: 3 }) })!;
    expect(m.summary!.sets).toBe(3); // STEPS.length — pure-projection back-compat
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

  it('offers Exercise Busy only at the start of an exercise with a later one', () => {
    // idx 0 = Bench set 1 of 2, with Squat later → offerable
    expect(project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 0 }) })!.canMarkBusy).toBe(true);
    // idx 1 = Bench set 2 of 2 (not the start) → not offerable
    expect(project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 1 }) })!.canMarkBusy).toBe(false);
    // idx 2 = Squat set 1 of 1 (no later exercise) → not offerable
    expect(project({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 2 }) })!.canMarkBusy).toBe(false);
  });

  it('names the just-finished exercise on a transition rest (Exercise Complete)', () => {
    const m = project({ machine: machine({ phase: 'REST_TRANSITION', setIndex: 1 }), restStartedAtMs: NOW })!;
    expect(m.completedExerciseName).toBe('Bench Press');
    expect(m.nextExerciseName).toBe('Squat');
    expect(m.nextTargetWeight).toBe(100);
    expect(m.nextTargetReps).toBe(5);
  });

  it('does not name a completed exercise during an inter-set rest', () => {
    const m = project({ machine: machine({ phase: 'REST_INTER', setIndex: 0 }), restStartedAtMs: NOW })!;
    expect(m.completedExerciseName).toBeNull();
  });
});

describe('mirror wire serialization', () => {
  it('round-trips a mirror through the wire form', () => {
    const m = project({})!;
    const back = mirrorFromWire(mirrorToWire(m));
    expect(back).toEqual(m);
  });

  it('rejects an unknown schema and malformed input (no garbage rendered)', () => {
    expect(mirrorFromWire({ schema: 999, phase: 'active_set', exerciseName: 'x' })).toBeNull();
    expect(mirrorFromWire(null)).toBeNull();
    expect(mirrorFromWire({ schema: MIRROR_SCHEMA_VERSION })).toBeNull();
  });
});
