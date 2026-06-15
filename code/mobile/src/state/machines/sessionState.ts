/**
 * Session state machine (spec §6.3, §6.5). The second orthogonal machine.
 *
 * Per set: SET_PRESENTED -> (SET_COMPLETED | SET_EDITED)
 *          -> REST(INTER | TRANSITION[->AUTO_SWAPPED]) -> next
 * PAUSED is enterable from SET_PRESENTED / REST_INTER / REST_TRANSITION and
 * exits to the EXACT prior state, or to FINISH -> SESSION_SAVED.
 *
 * Save order is invariant (spec §8.4): Last Set -> SESSION_SAVED -> WELL_DONE
 * -> Home. Never save after Well Done.
 *
 * Rest is skipped entirely when rest <= 5s (spec §1.14).
 */

export type SessionPhase =
  | 'SET_PRESENTED'
  | 'REST_INTER'
  | 'REST_TRANSITION'
  | 'REST_TRANSITION_AUTO_SWAPPED'
  | 'PAUSED'
  | 'SESSION_SAVED'
  | 'WELL_DONE';

export const REST_SKIP_THRESHOLD_S = 5; // rest <= 5s => no rest screen (§1.14)

export interface SessionMachine {
  phase: SessionPhase;
  resumePhase: Exclude<SessionPhase, 'PAUSED' | 'SESSION_SAVED' | 'WELL_DONE'> | null; // exact state frozen under pause
  setIndex: number;
  isLastSetOfSession: boolean;
  earlyFinish: boolean;
}

export type SessionEvent =
  | { type: 'COMPLETE_SET'; restSeconds: number; lastSetOfExercise: boolean }
  | { type: 'EDIT_RESULT'; restSeconds: number; lastSetOfExercise: boolean }
  | { type: 'REST_ELAPSED' } // timer 00:00 or "Ready"
  | { type: 'AUTO_SWAP' } // equipment conflict during transition
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'FINISH_EARLY' };

export function initialSessionMachine(isLastSetOfSession: boolean): SessionMachine {
  return {
    phase: 'SET_PRESENTED',
    resumePhase: null,
    setIndex: 0,
    isLastSetOfSession,
    earlyFinish: false,
  };
}

function afterSetCompletion(
  s: SessionMachine,
  restSeconds: number,
  lastSetOfExercise: boolean,
): SessionMachine {
  // Last set of the whole session -> save before Well Done (invariant §8.4).
  if (s.isLastSetOfSession) {
    return { ...s, phase: 'SESSION_SAVED' };
  }
  // Short rest is skipped entirely (§1.14) -> straight to next SET_PRESENTED.
  if (restSeconds <= REST_SKIP_THRESHOLD_S) {
    return { ...s, phase: 'SET_PRESENTED', setIndex: s.setIndex + 1 };
  }
  return {
    ...s,
    phase: lastSetOfExercise ? 'REST_TRANSITION' : 'REST_INTER',
  };
}

export function sessionReducer(s: SessionMachine, e: SessionEvent): SessionMachine {
  switch (e.type) {
    case 'COMPLETE_SET':
    case 'EDIT_RESULT':
      if (s.phase !== 'SET_PRESENTED') return s;
      return afterSetCompletion(s, e.restSeconds, e.lastSetOfExercise);

    case 'AUTO_SWAP':
      return s.phase === 'REST_TRANSITION'
        ? { ...s, phase: 'REST_TRANSITION_AUTO_SWAPPED' }
        : s;

    case 'REST_ELAPSED':
      if (s.phase === 'REST_INTER' || s.phase === 'REST_TRANSITION' || s.phase === 'REST_TRANSITION_AUTO_SWAPPED') {
        return { ...s, phase: 'SET_PRESENTED', setIndex: s.setIndex + 1 };
      }
      return s;

    case 'PAUSE': {
      // Freeze the exact current state (instant, 0ms — spec §7.2).
      if (s.phase === 'PAUSED' || s.phase === 'SESSION_SAVED' || s.phase === 'WELL_DONE') return s;
      return { ...s, phase: 'PAUSED', resumePhase: s.phase };
    }

    case 'RESUME':
      return s.phase === 'PAUSED' && s.resumePhase
        ? { ...s, phase: s.resumePhase, resumePhase: null }
        : s;

    case 'FINISH_EARLY':
      // Save completed sets + early-finish flag -> Well Done (§7.4).
      return { ...s, phase: 'SESSION_SAVED', earlyFinish: true, resumePhase: null };

    default:
      return s;
  }
}
