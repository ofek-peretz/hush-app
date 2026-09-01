/**
 * THE GAP CATCH — the derivation half (2026-09-01). `domain/gapCatch` decides WHAT the note is;
 * this reads her history and units, converts the fact for display, and hands the notifier the
 * full desired state (it is idempotent — cancel-then-schedule on one stable id). Called at boot
 * and after every completed session, the same self-healing cadence the training reminders keep.
 *
 * Fire-and-forget at every call site (`void armGapCatch()`): a note may never stand between a
 * workout and its save.
 */

//

import { db } from '@/data/local/db';
import { gapCatchPlan } from '@/domain/gapCatch';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { notifier } from '@/platform/notifications';

export async function armGapCatch(nowMs: number = Date.now()): Promise<void> {
  try {
    /* CARDIO IS READ TOO — a run is training, and a note that says "six days" over a Tuesday run
     * in her own ledger is the one failure this note cannot afford. See `domain/gapCatch`. */
    const [history, cardio, profile] = await Promise.all([
      db.loadHistory(),
      db.loadCardio().catch(() => []),
      db.loadProfile(),
    ]);
    if (!profile) {
      await notifier.syncGapCatch(null); // no athlete — nothing to catch
      return;
    }
    const plan = gapCatchPlan(history, nowMs, cardio);
    if (!plan) {
      await notifier.syncGapCatch(null);
      return;
    }
    const units = profile.units ?? 'kg';
    await notifier.syncGapCatch({
      fireAtMs: plan.fireAtMs,
      fact: plan.fact
        ? {
            name: exerciseDisplayName(plan.fact.exerciseId),
            loadLabel: `${displayWeight(plan.fact.loadKg, units)} ${unitLabel(units)}`,
          }
        : null,
    });
  } catch {
    /* best-effort — a missed catch costs a catch */
  }
}
