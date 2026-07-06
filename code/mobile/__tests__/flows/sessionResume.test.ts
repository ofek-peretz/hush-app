/**
 * Mid-workout resume (S3, approved 2026-07-05) — the pure reconciler that rebuilds the live
 * machine from the persisted snapshot + logged sets. Wall-clock parity with the watch's
 * LocalWorkoutEngine: a rest that finished while away advances; a partial rest resumes with
 * its true remaining; a paused rest freezes at the pause instant; a logged set is never
 * re-presented; stale/terminal/finished snapshots are rejected (→ salvage).
 */
import { reconcileResume, RESUME_WINDOW_MS, type ResumeStep } from '@/state/sessionRecovery';
import type { SessionMachine } from '@/state/machines/sessionState';

const NOW = Date.parse('2026-07-05T18:00:00.000Z');

const steps: ResumeStep[] = [
  { exerciseId: 'bb_bench_press', exerciseSetIndex: 0, lastSetOfSession: false },
  { exerciseId: 'bb_bench_press', exerciseSetIndex: 1, lastSetOfSession: false },
  { exerciseId: 'lateral_raise', exerciseSetIndex: 0, lastSetOfSession: false },
  { exerciseId: 'lateral_raise', exerciseSetIndex: 1, lastSetOfSession: true },
];

const machine = (o: Partial<SessionMachine>): SessionMachine => ({
  phase: 'SET_PRESENTED',
  resumePhase: null,
  setIndex: 0,
  isLastSetOfSession: false,
  earlyFinish: false,
  ...o,
});

const restBaseS = (kind: 'inter' | 'transition', _ex: string | null) => (kind === 'inter' ? 150 : 120);

const snap = (o: Partial<Parameters<typeof reconcileResume>[0]> = {}) => ({
  plan: steps,
  machine: machine({}),
  restStartedAtMs: null,
  restExtraS: 0,
  pausedAtMs: null,
  savedAt: new Date(NOW - 60_000).toISOString(), // saved a minute ago
  ...o,
});

const sets = (...keys: Array<[string, number]>) => ({
  sets: keys.map(([exerciseId, setIndex]) => ({ exerciseId, setIndex })) as never,
});

describe('reconcileResume', () => {
  it('a rest with time left resumes in place with its true remaining', () => {
    const r = reconcileResume(
      snap({
        machine: machine({ phase: 'REST_INTER', setIndex: 0 }),
        restStartedAtMs: NOW - 60_000, // 60 s of a 150 s rest served
      }),
      sets(['bb_bench_press', 0]),
      NOW,
      restBaseS,
    );
    expect(r!.machine.phase).toBe('REST_INTER');
    expect(r!.machine.setIndex).toBe(0); // rest sits on the completed set
    expect(r!.restRemainingS).toBe(90);
  });

  it('a rest that fully elapsed while away presents the NEXT set (wall-clock, watch parity)', () => {
    const r = reconcileResume(
      snap({
        machine: machine({ phase: 'REST_INTER', setIndex: 0 }),
        restStartedAtMs: NOW - 10 * 60_000, // long gone
      }),
      sets(['bb_bench_press', 0]),
      NOW,
      restBaseS,
    );
    expect(r!.machine.phase).toBe('SET_PRESENTED');
    expect(r!.machine.setIndex).toBe(1);
    expect(r!.restRemainingS).toBeNull();
  });

  it('"+15 sec" extensions count toward the remaining rest', () => {
    const r = reconcileResume(
      snap({
        machine: machine({ phase: 'REST_INTER', setIndex: 0 }),
        restStartedAtMs: NOW - 150_000, // base fully served…
        restExtraS: 30, // …but 30 s were added
      }),
      sets(['bb_bench_press', 0]),
      NOW,
      restBaseS,
    );
    expect(r!.machine.phase).toBe('REST_INTER');
    expect(r!.restRemainingS).toBe(30);
  });

  it('a paused rest resumes with the remaining frozen at the pause instant, un-paused', () => {
    const r = reconcileResume(
      snap({
        machine: machine({ phase: 'PAUSED', resumePhase: 'REST_TRANSITION', setIndex: 1 }),
        restStartedAtMs: NOW - 60 * 60_000, // an hour ago —
        pausedAtMs: NOW - 60 * 60_000 + 40_000, // — but paused 40 s in
      }),
      sets(['bb_bench_press', 1]),
      NOW,
      restBaseS,
    );
    expect(r!.machine.phase).toBe('REST_TRANSITION');
    expect(r!.restRemainingS).toBe(80); // 120 − 40, the hour away never counted
  });

  it('never re-presents a logged set (snapshot one step behind the set write)', () => {
    const r = reconcileResume(
      snap({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 1 }) }),
      sets(['bb_bench_press', 0], ['bb_bench_press', 1]), // set 1 already logged
      NOW,
      restBaseS,
    );
    expect(r!.machine.setIndex).toBe(2); // skipped to the first unlogged step
    expect(r!.machine.phase).toBe('SET_PRESENTED');
  });

  it('returns null when every remaining set is logged (nothing to resume → salvage)', () => {
    const r = reconcileResume(
      snap({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 2 }) }),
      sets(['lateral_raise', 0], ['lateral_raise', 1]),
      NOW,
      restBaseS,
    );
    expect(r).toBeNull();
  });

  it('rejects a stale snapshot (older than the resume window)', () => {
    const r = reconcileResume(
      snap({ savedAt: new Date(NOW - RESUME_WINDOW_MS - 1000).toISOString() }),
      sets(),
      NOW,
      restBaseS,
    );
    expect(r).toBeNull();
  });

  it('rejects terminal snapshots', () => {
    expect(reconcileResume(snap({ machine: machine({ phase: 'SESSION_SAVED' }) }), sets(), NOW, restBaseS)).toBeNull();
    expect(reconcileResume(snap({ machine: machine({ phase: 'WELL_DONE' }) }), sets(), NOW, restBaseS)).toBeNull();
  });

  it('refreshes isLastSetOfSession for the landed step', () => {
    const r = reconcileResume(
      snap({ machine: machine({ phase: 'SET_PRESENTED', setIndex: 3 }) }),
      sets(),
      NOW,
      restBaseS,
    );
    expect(r!.machine.setIndex).toBe(3);
    expect(r!.machine.isLastSetOfSession).toBe(true);
  });
});
