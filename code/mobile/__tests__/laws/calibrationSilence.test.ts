/**
 * Calibration is silent; the Portrait is earned at 7 completed sessions, counted
 * by sessions not calendar (spec §5.6 R20, §6.1, §7.1; UX Laws 13/15).
 */
import {
  athleteModeReducer,
  initialAthleteModeState,
  didUnlockPortrait,
  CALIBRATION_SESSIONS,
  type AthleteModeState,
} from '@/state/machines/athleteMode';
import { canSpeak, mayShowReason, mayHardNo } from '@/domain/modeGate';

function onboardToCalibrating(): AthleteModeState {
  let s = initialAthleteModeState;
  s = athleteModeReducer(s, { type: 'AUTH_SUCCESS' });
  s = athleteModeReducer(s, { type: 'ENTER_ONBOARDING' });
  s = athleteModeReducer(s, { type: 'PROGRAM_GENERATED' });
  return s;
}

describe('mode gate', () => {
  it('Hush is silent in every mode before ADVISORY', () => {
    for (const mode of ['UNAUTH', 'AUTHED', 'ONBOARDING', 'CALIBRATING'] as const) {
      expect(canSpeak(mode)).toBe(false);
      expect(mayShowReason(mode)).toBe(false);
      expect(mayHardNo(mode)).toBe(false);
    }
  });

  it('Hush may speak in ADVISORY and L1', () => {
    expect(canSpeak('ADVISORY')).toBe(true);
    expect(canSpeak('ADVISORY_AUTOPILOT_L1')).toBe(true);
  });
});

describe('calibration → portrait unlock', () => {
  it('stays CALIBRATING until exactly 7 completed sessions', () => {
    let s = onboardToCalibrating();
    expect(s.mode).toBe('CALIBRATING');
    for (let i = 1; i < CALIBRATION_SESSIONS; i++) {
      s = athleteModeReducer(s, { type: 'SESSION_COMPLETED' });
      expect(s.mode).toBe('CALIBRATING');
      expect(s.portrait).toBe('PORTRAIT_LOCKED');
    }
  });

  it('the 7th completed session flips to ADVISORY and unlocks the Portrait', () => {
    let s = onboardToCalibrating();
    let prev = s;
    for (let i = 0; i < CALIBRATION_SESSIONS; i++) {
      prev = s;
      s = athleteModeReducer(s, { type: 'SESSION_COMPLETED' });
    }
    expect(s.completedSessions).toBe(CALIBRATION_SESSIONS);
    expect(s.mode).toBe('ADVISORY');
    expect(s.portrait).toBe('PORTRAIT_UNLOCKED');
    expect(didUnlockPortrait(prev, s)).toBe(true);
  });
});
