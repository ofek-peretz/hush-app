/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * TRAINING-DAY REMINDERS — the derivation half. The switch lives in You, the schedule lives in the
 * OS, and this is the seam that keeps them agreeing: read the opt-in, read the week, hand the
 * notifier the full desired set (it is idempotent). Called at boot, when she flips the switch, and
 * after every completed session.
 *
 * ── ⛔ N OUT OF M — WHOSE DAYS ARE THEY? (founder, 2026-08-23: *"אנחנו עובדים בשיטת N אימונים
 * מתוך M… אז איך זה מסתדר?"*) ─────────────────────────────────────────────────────────────────────
 * He caught the first cut's blind spot: it read only the PLAN's weekday assignments — and the
 * engine's own weeks mostly carry none, because Hush's whole model is N workouts wherever they
 * land in the week. A reminder feature that schedules nothing for the flagship case is furniture.
 *
 * The answer is the one the product already had: **her own habit.** `domain/trainingDays` has
 * learned which weekdays she actually trains (two weeks of history, days that repeat, capped by
 * the days-per-week she declared) since long before this feature. So:
 *
 *   1. A plan that ASSIGNS days (an imported coach week, a long-run-on-Sunday programme) → those
 *      days. The plan's word is explicit and outranks a pattern.
 *   2. No assigned days → HER LEARNED DAYS. The reminder lands where she already goes — a mirror,
 *      never a demand. (A brand-new athlete has no pattern yet; the switch quietly waits for one
 *      rather than guessing, and the row's sub says the days are learned.)
 *   3. **A finished week goes silent.** After every completion the set is re-synced; when every
 *      workout of the bucket is behind her, everything is cancelled — "you could train more" is
 *      exactly the sentence this product refuses. The next boot after the Saturday roll re-arms.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import { db } from '@/data/local/db';
import { loadWeekPlan } from '@/data/local/weekPlan';
import { coachWeek } from '@/domain/coachWeek';
import { trainingDays, WEEK_ORDER } from '@/domain/trainingDays';
import { notifier } from '@/platform/notifications';
import type { Session } from '@/data/local/models';

/**
 * Pure: the desired reminder set. Plan-assigned days win; her learned habit stands in when the
 * plan is silent; a spent week (nothing left to train) is silence. Exported for the law.
 */
export function trainingReminderDays(
  workouts: { id: string; name: string; day?: string }[],
  doneIds: string[],
  habit: Set<string> | null,
  weekLabel: string,
): { weekday: number; name: string }[] {
  const remaining = workouts.filter((w) => !doneIds.includes(w.id));
  if (workouts.length > 0 && remaining.length === 0) return []; // the week is behind her — silence
  const out: { weekday: number; name: string }[] = [];
  const push = (day: string, name: string) => {
    const idx = WEEK_ORDER.indexOf(day as (typeof WEEK_ORDER)[number]);
    if (idx < 0) return;
    const weekday = idx + 1; // Expo weekly triggers: 1 = Sunday … 7 = Saturday
    if (!out.some((o) => o.weekday === weekday)) out.push({ weekday, name });
  };
  const assigned = workouts.filter((w) => w.day);
  if (assigned.length > 0) {
    for (const w of assigned) push(w.day as string, w.name);
    return out;
  }
  // N-of-M: no assigned days — her own habit carries the reminder, named for the week itself
  // because no single workout owns a learned day.
  for (const day of habit ?? []) push(day, weekLabel);
  return out;
}

/**
 * ════ THE HOUR IS HERS TOO (2026-09-01, audit lever 4) ════
 *
 * The reminder fired at a hardcoded 17:30 for everyone — while the same feature already refused
 * to guess her DAYS and read them from her own history instead. Same argument, other axis: the
 * app measures when she actually starts training (each session carries `startedAt`), so the
 * reminder lands at HER median hour, rounded to the quarter, a mirror rather than an opinion.
 * Under four sessions in the window there is no habit to mirror yet — 17:30 stands in, exactly
 * as the learned-days rule quietly waits for a pattern. Pure; exported for the test.
 */
export function reminderClock(history: Session[], nowMs: number): { hour: number; minute: number } {
  const WINDOW_MS = 8 * 7 * 24 * 60 * 60 * 1000;
  const minutes = history
    .filter((h) => h.trained !== false)
    .map((h) => new Date(h.startedAt))
    .filter((d) => Number.isFinite(d.getTime()) && nowMs - d.getTime() <= WINDOW_MS)
    .map((d) => d.getHours() * 60 + d.getMinutes())
    .sort((a, b) => a - b);
  if (minutes.length < 4) return { hour: 17, minute: 30 };
  const median = minutes[Math.floor(minutes.length / 2)];
  const snapped = Math.round(median / 15) * 15;
  return { hour: Math.floor(snapped / 60) % 24, minute: snapped % 60 };
}

/** Read the switch, the week and her habit, and make the OS schedule match. Never throws. */
export async function syncTrainingRemindersFromPlan(): Promise<void> {
  try {
    const on = await db.loadReminderOptIn();
    if (!on) {
      await notifier.syncTrainingReminders(null);
      return;
    }
    const [plan, history, weekOpenMs, profile] = await Promise.all([
      loadWeekPlan().catch(() => null),
      db.loadHistory().catch(() => [] as Session[]),
      db.loadWeekOpen().catch(() => null),
      db.loadProfile().catch(() => null),
    ]);
    const workouts = coachWeek(plan);
    const since = weekOpenMs ?? 0;
    const doneIds = history
      .filter((h) => Date.parse(h.startedAt) >= since && h.trained !== false)
      .map((h) => h.programDayId)
      .filter((id) => id.startsWith('coach_'));
    const habit = trainingDays(history, profile?.daysPerWeek, Date.now());
    const { tg } = require('@/i18n') as typeof import('@/i18n');
    await notifier.syncTrainingReminders(
      trainingReminderDays(
        workouts.map((w) => ({ id: w.id, name: w.name, ...(w.day ? { day: w.day } : {}) })),
        doneIds,
        habit ? new Set([...habit] as string[]) : null,
        tg('notifications.trainingWeekName'),
      ),
      reminderClock(history, Date.now()),
    );
  } catch {
    /* best-effort — the boot resync self-heals */
  }
}
