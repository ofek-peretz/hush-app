/**
 * Session machine invariants (spec §6.3, §8.4, §1.14, §7.2).
 */
// @ts-nocheck

// 

import {
  initialSessionMachine,
  sessionReducer,
  REST_SKIP_THRESHOLD_S,
} from '@/state/machines/sessionState';

describe('rest routing', () => {
  it('long rest after a non-final exercise set -> Inter-Set Rest', () => {
    const s = initialSessionMachine(false);
    const next = sessionReducer(s, { type: 'COMPLETE_SET', restSeconds: 90, lastSetOfExercise: false });
    expect(next.phase).toBe('REST_INTER');
  });

  it('long rest after the last set of an exercise -> Transition Rest', () => {
    const s = initialSessionMachine(false);
    const next = sessionReducer(s, { type: 'COMPLETE_SET', restSeconds: 120, lastSetOfExercise: true });
    expect(next.phase).toBe('REST_TRANSITION');
  });

  it('rest <= 5s is skipped entirely -> straight to next set', () => {
    const s = initialSessionMachine(false);
    const next = sessionReducer(s, { type: 'COMPLETE_SET', restSeconds: REST_SKIP_THRESHOLD_S, lastSetOfExercise: false });
    expect(next.phase).toBe('SET_PRESENTED');
    expect(next.setIndex).toBe(1);
  });

  it('REST_ELAPSED advances to the next set', () => {
    let s = initialSessionMachine(false);
    s = sessionReducer(s, { type: 'COMPLETE_SET', restSeconds: 90, lastSetOfExercise: false });
    s = sessionReducer(s, { type: 'REST_ELAPSED' });
    expect(s.phase).toBe('SET_PRESENTED');
    expect(s.setIndex).toBe(1);
  });
});

describe('save invariant', () => {
  it('the last set of the session goes straight to SESSION_SAVED (save before Well Done)', () => {
    const s = initialSessionMachine(true);
    const next = sessionReducer(s, { type: 'COMPLETE_SET', restSeconds: 120, lastSetOfExercise: true });
    expect(next.phase).toBe('SESSION_SAVED');
  });

  it('Finish Early saves with the early-finish flag', () => {
    const s = initialSessionMachine(false);
    const next = sessionReducer(s, { type: 'FINISH_EARLY' });
    expect(next.phase).toBe('SESSION_SAVED');
    expect(next.earlyFinish).toBe(true);
  });
});

describe('pause freezes exactly and resumes to the prior state', () => {
  it('pause from rest, resume back to the same rest phase', () => {
    let s = initialSessionMachine(false);
    s = sessionReducer(s, { type: 'COMPLETE_SET', restSeconds: 90, lastSetOfExercise: false });
    const paused = sessionReducer(s, { type: 'PAUSE' });
    expect(paused.phase).toBe('PAUSED');
    expect(paused.resumePhase).toBe('REST_INTER');
    const resumed = sessionReducer(paused, { type: 'RESUME' });
    expect(resumed.phase).toBe('REST_INTER');
  });

  // Pause/Complete-Set race (audit defect 8): a COMPLETE_SET that arrives while
  // PAUSED must NOT log or advance — the workout is frozen. The store also guards
  // this via a live machine ref + cancels the success timer; this asserts the
  // reducer-level invariant the guard relies on.
  it('a COMPLETE_SET while PAUSED is a no-op (frozen)', () => {
    let s = initialSessionMachine(false);
    s = sessionReducer(s, { type: 'PAUSE' });
    expect(s.phase).toBe('PAUSED');
    const after = sessionReducer(s, { type: 'COMPLETE_SET', restSeconds: 90, lastSetOfExercise: false });
    expect(after).toBe(s); // unchanged — no advance, no save
    expect(after.setIndex).toBe(0);
  });
});
