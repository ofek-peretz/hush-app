/**
 * PHONE ⇄ WATCH: ONE WORKOUT, TWO WINDOWS.
 *
 * Everything either surface can do lands in the SAME session machine, and everything either
 * surface shows comes from the SAME projection. These are the invariants that keep that true —
 * the ones that were broken, and the ones that must not break again.
 */
import { projectSessionMirror, type MirrorInputs, type MirrorStep } from '@/platform/sessionMirror';
import { unfrozenRestAnchor, hasLoggedStep } from '@/state/stores/sessionStore';
import type { SessionMachine } from '@/state/machines/sessionState';
import type { SetLog } from '@/data/local/models';

const STEPS: MirrorStep[] = [
  { exerciseName: 'Bench Press', setIndexInExercise: 0, totalSetsInExercise: 2, globalIndex: 0, targetWeight: 60, targetReps: 5 },
  { exerciseName: 'Bench Press', setIndexInExercise: 1, totalSetsInExercise: 2, globalIndex: 1, targetWeight: 60, targetReps: 5 },
];
const REST_INTER_S = 90;
const T0 = Date.parse('2026-07-13T12:00:00.000Z');

function machine(over: Partial<SessionMachine>): SessionMachine {
  return { phase: 'REST_INTER', resumePhase: null, setIndex: 0, isLastSetOfSession: false, earlyFinish: false, ...over };
}

function project(over: Partial<MirrorInputs>) {
  return projectSessionMirror({
    steps: STEPS,
    total: STEPS.length,
    machine: machine({}),
    restInterS: REST_INTER_S,
    restTransitionS: 120,
    restStartedAtMs: null,
    nowMs: T0,
    ...over,
  });
}

describe('the rest clock survives a pause identically on both surfaces', () => {
  /**
   * THE BUG: the phone's Rest screen froze its own countdown at the pause instant and re-anchored
   * from the frozen remaining — but the MIRROR reads `restStartedAtMs`, and nobody moved it. So the
   * rest burned through the pause for the wrist and the Lock Screen. Pause 5 minutes mid-rest and
   * the watch said READY (and buzzed GO) while the phone still showed 45 seconds.
   */
  it('the wrist sees the same remaining rest after a pause as before it', () => {
    const restStarted = T0; // rest begins
    const pausedAt = T0 + 30_000; // athlete pauses 30 s in — 60 s left
    const before = project({ machine: machine({ phase: 'REST_INTER' }), restStartedAtMs: restStarted, nowMs: pausedAt })!;
    expect(before.restRemainingS).toBe(60);

    // …five minutes of standing still, then Resume.
    const resumedAt = pausedAt + 5 * 60_000;
    const anchor = unfrozenRestAnchor(restStarted, pausedAt, resumedAt);
    const after = project({ machine: machine({ phase: 'REST_INTER' }), restStartedAtMs: anchor, nowMs: resumedAt })!;

    expect(after.restRemainingS).toBe(60); // the rest resumes where it stopped — not expired
    expect(after.restTotalS).toBe(REST_INTER_S); // …and the ring's denominator never moved
    // Without the fix the anchor stays at T0 and the wrist would have said: 0 s left.
    const unfixed = project({ machine: machine({ phase: 'REST_INTER' }), restStartedAtMs: restStarted, nowMs: resumedAt })!;
    expect(unfixed.restRemainingS).toBe(0);
  });

  it('a pause with no rest running moves nothing, and a resume without a pause is a no-op', () => {
    expect(unfrozenRestAnchor(null, T0, T0 + 1000)).toBeNull(); // mid-SET pause: no rest anchor at all
    expect(unfrozenRestAnchor(T0, null, T0 + 1000)).toBe(T0); // never paused
    expect(unfrozenRestAnchor(T0, T0 + 5000, T0)).toBe(T0); // a clock that went backwards credits nothing
  });

  it('a paused workout publishes NO countdown at all — the wrist must not tick behind a frozen stage', () => {
    const m = project({
      machine: machine({ phase: 'PAUSED', resumePhase: 'REST_INTER' }),
      restStartedAtMs: T0,
      nowMs: T0 + 30_000,
    })!;
    expect(m.phase).toBe('paused');
    expect(m.restEndsAt).toBeNull();
    expect(m.restRemainingS).toBeNull();
  });
});

describe('one set, one log — whichever surface asked for it', () => {
  /**
   * THE BUG: the phone holds a 1.4 s "Set logged" beat before it writes. The mirror still says
   * `active_set` for all of it — so a tap on the WATCH during that beat is a valid intent with a
   * matching index: the phone logs the set, and then the beat's own timer logs it AGAIN. Doubled
   * tonnage, a doubled set in the engine's history, and a duplicate key in the crash-resume map
   * (which keys logged sets by exercise+set and would then SKIP a set the athlete never did).
   */
  const set = (exerciseId: string, setIndex: number): SetLog => ({
    exerciseId,
    setIndex,
    recommendedWeight: 60,
    recommendedReps: 5,
    actualWeight: 60,
    actualReps: 5,
    persistedAt: new Date(T0).toISOString(),
  });

  it('a step already in the log is never written twice', () => {
    const sets = [set('bench', 0)];
    expect(hasLoggedStep(sets, 'bench', 0)).toBe(true); // the watch already logged it → the phone's beat must not
    expect(hasLoggedStep(sets, 'bench', 1)).toBe(false); // the next set is a different set
    expect(hasLoggedStep(sets, 'squat', 0)).toBe(false); // …and so is the same ordinal on another lift
    expect(hasLoggedStep([], 'bench', 0)).toBe(false);
  });
});
