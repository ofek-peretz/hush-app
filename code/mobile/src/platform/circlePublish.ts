/**
 * ════ THE WEEK REACHES THE CIRCLE WITHOUT A PILGRIMAGE (2026-09-01, audit lever 5) ════
 *
 * `circlePublishWeek` used to fire in exactly one place: when she manually opened Together. A
 * circle member who trained all week and never visited that screen appeared permanently at ZERO
 * to her friends — the feature silently failed for the passive majority, which in a six-person
 * circle of real friends is most of them. The server and the wire were finished; only this
 * arming was missing.
 *
 * Same self-healing shape as `platform/gapCatch` / `platform/trialCatch`: derive the full
 * desired state from the stores and hand it over, at boot and after every completed session.
 * Signed out, or a week with nothing in it yet, publishes nothing. Fire-and-forget at every
 * call site — a publish may never stand between a workout and its save.
 */

//

import { db } from '@/data/local/db';
import { circleWeekPayload } from '@/domain/circle';
import { currentWeekOpen } from '@/domain/weekCadence';
import { circlePublishWeek, circleSignedIn } from '@/platform/circleClient';

export async function armCirclePublish(nowMs: number = Date.now()): Promise<void> {
  try {
    if (!(await circleSignedIn())) return;
    const [history, weekOpen, profile] = await Promise.all([
      db.loadHistory().catch(() => []),
      db.loadWeekOpen().catch(() => null),
      db.loadProfile().catch(() => null),
    ]);
    const payload = circleWeekPayload({
      name: profile?.name,
      sessions: history,
      plannedPerWeek: profile?.daysPerWeek ?? 0,
      weekOpenMs: weekOpen ?? currentWeekOpen(nowMs),
    });
    if (payload) await circlePublishWeek(payload);
  } catch {
    /* best-effort — Together's own visit still publishes */
  }
}
