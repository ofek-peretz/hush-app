/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LOCK-TAP JOURNAL — how each lock-screen tap went, readable on the phone. (2026-10-17)
 *
 * Founder: *"כאשר אני לוחץ על הפקדים של האפליקציה בLIVE ACTIVITY הם מגיבים בדילאיי ולא בזמן אמת."*
 *
 * A delay on the lock screen has three possible homes and they look the same to a thumb: iOS had to
 * launch the app for the tap, the card's redraw was slow, or the phone replayed the tap late. Each
 * tap now writes all three down — `lock_draw` from the intent's own clock (`drawMs`, the process's
 * `ageS`, `cold` when the app was launched for it), `lock_intent` when the phone replayed it
 * (`lateMs`) — and this reads them back, one line each, the same way the voice journal does. Shown
 * under the sync-test switch in You; a screenshot of it is the report.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { db } from '@/data/local/db';
import { journalLine } from '@/platform/voice/voiceJournal';

const LOCK_ROWS = new Set(['lock_draw', 'lock_intent', 'lock_intent_dropped', 'session_started', 'session_completed']);

/** The last `limit` lock-screen rows this phone wrote, oldest first. */
export async function readLockTapJournal(limit = 60): Promise<string[]> {
  try {
    const all = await db.loadTelemetry<{ type: string; client_ts: string; data?: Record<string, unknown> }>();
    return all
      .filter((r) => typeof r?.type === 'string' && LOCK_ROWS.has(r.type))
      .slice(-limit)
      .map(journalLine);
  } catch {
    return [];
  }
}
