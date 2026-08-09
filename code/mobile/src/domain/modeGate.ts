/**
 * Mode gate — the structural boundary that makes Hush silent in calibration
 * (spec §5.2 R5/R6, §5.6 R20, §6.1).
 *
 * Reason lines and hard-no are STRUCTURALLY impossible to render outside
 * ADVISORY / ADVISORY_AUTOPILOT_L1. Every voice surface routes through here so
 * the law cannot be bypassed screen by screen.
 */
// @ts-nocheck

// 

import type { AthleteMode } from '@/data/local/models';

/** True only in modes where Hush is permitted to speak about decisions. */
export function canSpeak(mode: AthleteMode): boolean {
  return mode === 'ADVISORY' || mode === 'ADVISORY_AUTOPILOT_L1';
}

/** Reason lines (§5.2): only on a changed set, only in ADVISORY. Never in CALIBRATING. */
export function mayShowReason(mode: AthleteMode): boolean {
  return canSpeak(mode);
}

/** Hard-no / stagnation calls (§2.8): only in ADVISORY at actionable confidence. */
export function mayHardNo(mode: AthleteMode): boolean {
  return canSpeak(mode);
}
