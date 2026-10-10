/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE VOICE JOURNAL — what the coach did on HER phone, readable on her phone. (2026-10-06)
 *
 * Founder, after his first workout with a voice he could hear: *"מזערתי את מסך האפליקציה … והמנוחה
 * הסתיימה ולא היה לי התראה. כשחזרתי … הבינה אמרה 'חזרתי' ואז 'סט שלישי מתוך ארבעה' אבל היא לא הגיבה."*
 *
 * Every one of those is a question about a phone nobody at a desk can see: was the microphone held or
 * was it the screen-on ear, did the app sleep while it was minimised, which gate closed, what did the
 * window end with. The phone has been writing the answers down since the voice was built — every
 * `track('voice_…')` lands in the journal `platform/telemetry` keeps on the device — and nothing ever
 * showed them. Two days of guessing from the other side of a build is what that cost.
 *
 * This reads that journal back, the voice's rows only, one line each: `HH:MM:SS  what  detail`. The
 * profile shows it under the voice row; a screenshot of it is the report. Nothing here writes, sends
 * or keeps anything new.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { db } from '@/data/local/db';

interface Row {
  type: string;
  client_ts: string;
  data?: Record<string, unknown>;
}

/** The workout's own turns that give a voice row its place: started, paused, ended. */
const ALSO = new Set(['session_started', 'session_completed', 'session_abandoned', 'pause', 'resume', 'rest_extended']);

const two = (n: number) => String(n).padStart(2, '0');

function cell(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v).replace(/\s+/g, ' ').slice(0, 40);
}

/** One row of the device's journal as the profile prints it. */
export function journalLine(row: Row): string {
  const at = new Date(row.client_ts);
  const time = Number.isNaN(at.getTime()) ? '--:--:--' : `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`;
  const what = row.type.replace(/^voice_/, '');
  const detail = Object.entries(row.data ?? {})
    .filter(([k, v]) => v != null && v !== '' && k !== 'sessionId')
    .map(([k, v]) => `${k}=${cell(v)}`)
    .join(' ');
  return detail ? `${time}  ${what}  ${detail}` : `${time}  ${what}`;
}

/** The last `limit` rows the voice wrote on this phone, oldest first. */
export async function readVoiceJournal(limit = 80): Promise<string[]> {
  try {
    const all = await db.loadTelemetry<Row>();
    return all
      .filter((r) => typeof r?.type === 'string' && (r.type.startsWith('voice_') || ALSO.has(r.type)))
      .slice(-limit)
      .map(journalLine);
  } catch {
    return [];
  }
}
