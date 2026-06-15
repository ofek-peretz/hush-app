/**
 * Athlete-Model mode machine (spec §6.1). One of two orthogonal machines.
 *
 * This machine is the SINGLE authority on whether Hush is allowed to speak.
 * Reason lines, forecasts, and hard-no are active only in ADVISORY (and L1).
 * All are suppressed in CALIBRATING (spec §6.1, §5.6 R20).
 *
 * Calibration ends by COMPLETED SESSION COUNT, never by calendar (§7.1, R20):
 * missed days never advance it; a long gap never resets it.
 */
import type { AthleteMode, PortraitState } from '@/data/local/models';

export const CALIBRATION_SESSIONS = 7; // spec §2.3 / §5.6 R20

export interface AthleteModeState {
  mode: AthleteMode;
  completedSessions: number;
  portrait: PortraitState;
}

export type AthleteModeEvent =
  | { type: 'AUTH_SUCCESS' }
  | { type: 'ENTER_ONBOARDING' }
  | { type: 'PROGRAM_GENERATED' } // first Home render
  | { type: 'SESSION_COMPLETED' } // a real session that trains capabilities
  | { type: 'AUTOPILOT_ON' } // gated, flag off in v1
  | { type: 'AUTOPILOT_OFF' };

export const initialAthleteModeState: AthleteModeState = {
  mode: 'UNAUTH',
  completedSessions: 0,
  portrait: 'PORTRAIT_LOCKED',
};

/** Pure reducer. Returns the next state; callers persist + fire side effects. */
export function athleteModeReducer(
  s: AthleteModeState,
  e: AthleteModeEvent,
): AthleteModeState {
  switch (e.type) {
    case 'AUTH_SUCCESS':
      return s.mode === 'UNAUTH' ? { ...s, mode: 'AUTHED' } : s;

    case 'ENTER_ONBOARDING':
      return s.mode === 'AUTHED' ? { ...s, mode: 'ONBOARDING' } : s;

    case 'PROGRAM_GENERATED':
      return s.mode === 'ONBOARDING' ? { ...s, mode: 'CALIBRATING' } : s;

    case 'SESSION_COMPLETED': {
      const completed = s.completedSessions + 1;
      if (s.mode === 'CALIBRATING' && completed >= CALIBRATION_SESSIONS) {
        // Side effect (handled by caller): Portrait auto-presents at this Well Done.
        return {
          ...s,
          completedSessions: completed,
          mode: 'ADVISORY',
          portrait: 'PORTRAIT_UNLOCKED',
        };
      }
      return { ...s, completedSessions: completed };
    }

    case 'AUTOPILOT_ON':
      return s.mode === 'ADVISORY' ? { ...s, mode: 'ADVISORY_AUTOPILOT_L1' } : s;

    case 'AUTOPILOT_OFF':
      return s.mode === 'ADVISORY_AUTOPILOT_L1' ? { ...s, mode: 'ADVISORY' } : s;

    default:
      return s;
  }
}

/** True iff the 7th completed session just unlocked the Portrait (auto-present trigger). */
export function didUnlockPortrait(
  prev: AthleteModeState,
  next: AthleteModeState,
): boolean {
  return (
    prev.portrait === 'PORTRAIT_LOCKED' && next.portrait === 'PORTRAIT_UNLOCKED'
  );
}
