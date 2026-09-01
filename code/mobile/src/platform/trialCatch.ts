/**
 * THE TRIAL'S LAST-WORKOUT NOTE — the derivation half (2026-09-01, audit finding 3 / lever 1).
 * `Notifier.syncTrialLast` holds the WHY; this decides WHEN, from the same three stores the gate
 * itself reads, so the note and the wall can never disagree about where the trial stands.
 *
 * The shape copies `platform/gapCatch` deliberately: derive the full desired state on every call,
 * hand it to an idempotent sync (one stable id, `null` cancels), re-derive at boot and after every
 * completed session. A sync that self-heals needs no memory of what it said last time.
 *
 * Fire-and-forget at every call site (`void armTrialLast()`): a note may never stand between a
 * workout and its save.
 */

//

import { db } from '@/data/local/db';
import { FREE_SESSION_LIMIT } from '@/domain/entitlement';
import { notifier } from '@/platform/notifications';

/**
 * A day, not an hour: she just finished the second-to-last free workout and the app already told
 * her face-to-face (Home's counter surfaces inside the last three). The note exists for the days
 * she does NOT open the app between that session and the last one — tomorrow is the earliest
 * moment it can say something the screen has not already said.
 */
const FIRE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function armTrialLast(nowMs: number = Date.now()): Promise<void> {
  try {
    const [mode, entitlement, profile] = await Promise.all([
      db.loadMode(),
      db.loadEntitlement(),
      db.loadProfile(),
    ]);
    // No athlete yet, already a member, or the trial is not at its last workout → no note. The
    // "already gated" case is deliberate too: once the wall stands, Home owns that conversation,
    // and a push about a decision she is already facing on screen would be a nag, not a fact.
    const completed = mode?.completedSessions ?? 0;
    const remaining = FREE_SESSION_LIMIT - completed;
    if (!profile || entitlement?.active === true || remaining !== 1) {
      await notifier.syncTrialLast(null);
      return;
    }
    await notifier.syncTrialLast({ fireAtMs: nowMs + FIRE_AFTER_MS });
  } catch {
    /* best-effort — a missed note costs a note */
  }
}
