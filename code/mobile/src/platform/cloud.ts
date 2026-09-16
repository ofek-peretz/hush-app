/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE iCLOUD SEAM — the account is her Apple ID (founder, 2026-08-23).
 *
 * Same shape as `platform/recordFile` and every other native seam: a real host when the module is
 * present, a clean stub everywhere else (jest, web, Android, a build without it). Nothing here
 * decides anything — `domain/record` owns what a record is and whether a restore is allowed;
 * `domain/trialLedger` owns the ledger's arithmetic. This file moves strings and numbers.
 *
 * ── WHY THIS AND NOT A SERVER (the decision, in writing) ────────────────────────────────────────
 * An account server is infrastructure, passwords, a login screen, a bill and a breach surface —
 * for a solo-founder iOS product, all of it buys what iCloud already gives away: the record rides
 * her Apple ID, appears on a new phone with NO sign-in screen at all, and the trial ledger becomes
 * per-PERSON instead of per-device. When Hush someday needs true multi-platform accounts, this
 * seam is what a server replaces — the call shapes (`backup` → bytes → `readBackup`) do not change.
 *
 * ⚠️ `readBackup()` returning null is NEVER proof of absence: on a fresh install the file can be in
 * the cloud and not yet on the device (iCloud materialises lazily; the native side has already
 * asked it to download). Callers retry — see the boot restore in `appStore`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import { requireOptionalNativeModule } from 'expo-modules-core';
import { TRIAL_LEDGER_KEY } from '@/domain/trialLedger';

interface HushCloudNative {
  available(): boolean;
  writeRecord(json: string): Promise<boolean>;
  readRecord(): Promise<string | null>;
  kvGetNumber(key: string): number | null;
  kvSetNumber(key: string, value: number): void;
}

const native = requireOptionalNativeModule<HushCloudNative>('HushCloud');

export interface CloudHost {
  /** An iCloud identity is present on this device (signed in, iCloud Drive on). */
  available(): boolean;
  /** Write the record JSON to the ubiquity container. False = not written (no iCloud, an error). */
  backup(json: string): Promise<boolean>;
  /** Read the record JSON back, or null — which may mean "not synced down yet", never "none ever". */
  readBackup(): Promise<string | null>;
  /** The trial ledger's cloud half — per Apple ID, survives deletion and new devices. */
  ledgerGet(): number | null;
  ledgerSet(n: number): void;
}

export const cloudStub: CloudHost = {
  available: () => false,
  backup: async () => false,
  readBackup: async () => null,
  ledgerGet: () => null,
  ledgerSet: () => {},
};

export const cloud: CloudHost = native
  ? {
      available: () => {
        try {
          return native.available();
        } catch {
          return false;
        }
      },
      backup: async (json) => {
        try {
          return await native.writeRecord(json);
        } catch {
          return false;
        }
      },
      readBackup: async () => {
        try {
          return await native.readRecord();
        } catch {
          return null;
        }
      },
      ledgerGet: () => {
        try {
          return native.kvGetNumber(TRIAL_LEDGER_KEY);
        } catch {
          return null;
        }
      },
      ledgerSet: (n) => {
        try {
          native.kvSetNumber(TRIAL_LEDGER_KEY, n);
        } catch {
          /* a device that cannot keep the cloud ledger still has the Keychain and the local count */
        }
      },
    }
  : cloudStub;
