/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE AUTOMATIC BACKUP — her record reaches iCloud without her doing anything.
 *
 * The manual file in You (`platform/recordFile`) stays — it is HERS to hold. This is the half that
 * makes the product feel like an account exists: after every workout the whole record (sessions,
 * cardio, profile, body map, preferences, the programme) is written to the ubiquity container,
 * and a fresh install on any of her devices finds it there (see the boot restore in `appStore`).
 *
 * ── FIRE-AND-FORGET, THROTTLED, NEVER LOAD-BEARING ──────────────────────────────────────────────
 * A backup must never stand between a workout and its save, so every caller `void`s this. The
 * throttle exists because the record grows with her history and serialising it costs real work —
 * one write per minute is far above the rate anything meaningful changes, and a workout's own
 * completion always lands (the call after a save is the one that matters, and it is never the one
 * inside the window: sessions are further apart than the throttle).
 *
 * ⚠️ THE THROTTLE IS PER-PROCESS STATE, deliberately: a missed backup costs nothing (the next
 * completion rewrites the whole record), so surviving relaunch is not a requirement worth a read.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import { db } from '@/data/local/db';
import { cloud } from '@/platform/cloud';

const BACKUP_EVERY_MS = 60_000;
let lastBackupAt = 0;

/**
 * Snapshot the whole record and write it to iCloud. Safe to call from anywhere, any number of
 * times; returns whether a write actually happened (tests read it — callers do not).
 */
export async function cloudAutoBackup(nowMs: number = Date.now()): Promise<boolean> {
  if (!cloud.available()) return false;
  if (nowMs - lastBackupAt < BACKUP_EVERY_MS) return false;
  lastBackupAt = nowMs;
  try {
    const record = await db.snapshotRecord(nowMs);
    return await cloud.backup(JSON.stringify(record));
  } catch {
    // A failed serialise/write costs this backup and nothing else — the next completion retries.
    return false;
  }
}

/** Test seam: reset the throttle window. */
export function resetCloudBackupThrottle(): void {
  lastBackupAt = 0;
}
