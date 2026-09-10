/**
 * The trial ledger's storage — the Keychain, and nothing else.
 *
 * `domain/trialLedger` holds the rule (the higher of the two numbers wins, and it only moves up).
 * This is the one place that touches the device, kept apart for the usual reason: the rule is worth
 * testing and the Keychain is not mockable in a unit test worth writing.
 *
 * Every failure is silent and reads as "no ledger". A Keychain that cannot be read must never stop
 * her training — see `trialUsed` for why an unreadable ledger loses to the ordinary count rather
 * than winning.
 */

// 

import * as SecureStore from 'expo-secure-store';

import { TRIAL_LEDGER_KEY } from '@/domain/trialLedger';

export async function readTrialLedger(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(TRIAL_LEDGER_KEY);
    if (raw == null) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    // Locked device at boot, a restore onto new hardware, a simulator without the module.
    return null;
  }
}

export async function writeTrialLedger(used: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(TRIAL_LEDGER_KEY, String(used));
  } catch {
    /* best-effort: a device that cannot keep the ledger still counts locally */
  }
}
