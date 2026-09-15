/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HER LOG, OUT — the record as a CSV any other app can read (2026-09-09, the formula report).
 *
 * `historyImport` reads Strong's and Hevy's exports because the log is the one switching cost in
 * this category. The same argument runs the other way: an app that takes a log in and never lets
 * it out is the lock-in objection every migrating athlete raises first, and the one App Review and
 * the GDPR both have words for. So the record leaves in the SAME shape it arrives in — Strong's
 * column order, which Hevy, Setgraph and every spreadsheet already parse — and `parseHistoryCsv`
 * reads it straight back (the round-trip is pinned by test).
 *
 * WHAT LEAVES: every strength session, newest first, one row per set, warm-ups marked `W` in Set
 * Order exactly as Strong marks them, weights in HER units. Cardio stays in its own record; a
 * free-form or imported session is a session. Nothing here decides anything — pure text.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import type { Session, Units } from '@/data/local/models';
import { displayWeight } from '@/domain/schedule';
import { sessionDurationSec } from '@/domain/sessionMetrics';
import { exerciseById } from '@/data/exercises';
import { isEvidenceSet } from '@/domain/setEvidence';

export const EXPORT_HEADER = ['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE'];

/** A CSV cell: quoted when it carries a comma, a quote or a newline; quotes doubled. */
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** `2023-01-14 09:35:00` — Strong's own stamp, local time as the athlete lived it. */
function stamp(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** `1h 10m` / `45m` — Strong's own duration word; empty when the session spans no time. */
function durationWord(s: Session): string {
  const sec = sessionDurationSec(s);
  if (!(sec > 0)) return '';
  const min = Math.round(sec / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * The record as CSV. Sessions are written newest-first (the ledger's own order); within a session
 * the sets keep their logged order. A set the clock presumed and nobody stood behind is NOT a row —
 * it is the prescription, not a lift (`domain/setEvidence`). `notes` is her own line per lift
 * (`db.loadLiftNotes`), written once per lift per session in Strong's Notes column.
 */
export function sessionsToCsv(sessions: Session[], units: Units, notes: Record<string, string> = {}): string {
  const lines: string[] = [EXPORT_HEADER.join(',')];
  for (const s of sessions) {
    const when = stamp(s.startedAt);
    const workout = s.programDayName ?? '';
    const duration = durationWord(s);
    // Set order counts WORKING sets per lift, from 1, the way Strong numbers them; a warm-up is `W`.
    const ordinal = new Map<string, number>();
    const noted = new Set<string>();
    for (const set of s.sets ?? []) {
      if (!isEvidenceSet(set) && !set.isWarmup) continue;
      const ex = exerciseById(set.exerciseId);
      const name = ex?.name ?? set.exerciseId;
      let order: string;
      if (set.isWarmup || set.isApproach) {
        order = 'W';
      } else {
        const n = (ordinal.get(set.exerciseId) ?? 0) + 1;
        ordinal.set(set.exerciseId, n);
        order = String(n);
      }
      const weight = set.actualWeight != null ? displayWeight(set.actualWeight, units) : null;
      const note = !noted.has(set.exerciseId) && notes[set.exerciseId] ? notes[set.exerciseId] : '';
      noted.add(set.exerciseId);
      lines.push(
        [when, workout, duration, name, order, weight ?? '', set.actualReps, '', '', note, '', '']
          .map(csvCell)
          .join(','),
      );
    }
  }
  return lines.join('\n') + '\n';
}

/** `hush-log-2026-09-09.csv` — dated, so two exports never overwrite each other in a folder. */
export function exportFileName(nowMs: number): string {
  return `hush-log-${new Date(nowMs).toISOString().slice(0, 10)}.csv`;
}
