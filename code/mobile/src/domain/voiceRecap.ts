/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE COACH SAYS WHEN THE WORKOUT IS OVER — the facts, computed (founder-approved, 2026-10-17)
 *
 * Founder, after training with the voice: *"מה שטוב: שהבינה אומרת שנותרו עוד 10 שניות למנוחה ואז
 * כשנגמרת המנוחה יש את הצליל… אולי אפשר לעשות שבסיום האימון לתת פידבק חיובי מסוים וזהו."* The one
 * sentence at the end is built from THESE facts and nothing else, so it can only say what happened:
 *
 *   · records — a set heavier than she had ever lifted the lift, or more reps than ever at her
 *     heaviest weight. The SAME rule, against the SAME baseline, the stage strikes "שיא" with
 *     (`domain/setRecord`: history before this workout AND the sets logged before it today).
 *   · on target — every prescribed working set of the lift done, each at or above the reps it asked.
 *     That is the fact the engine progresses on, said as the fact ("עמדת ביעד בכל הסטים"), never as a
 *     promise of what the engine will decide.
 *   · how much — working sets and minutes, for a day with neither of the above.
 *
 * Pure: the finished session and her history in, facts out.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { Session } from '@/data/local/models';
import { isEvidenceSet } from '@/domain/setEvidence';
import { isRecordSet, isRepRecordSet, livePeakKg, priorPeakKg, priorRepsAtKg, recordBaselineKg } from '@/domain/setRecord';

export interface VoiceRecap {
  /** Lifts that struck a record today, in the order she struck them (each once). */
  records: string[];
  /** Lifts where every prescribed working set met its rep target. */
  onTarget: string[];
  /** Working sets she logged. */
  sets: number;
  /** From the start to her last set, whole minutes (at least one). */
  minutes: number;
}

type SetRow = Session['sets'][number];

const isWorking = (s: SetRow): boolean => isEvidenceSet(s) && !s.isWarmup;

export function voiceRecap(
  session: Pick<Session, 'id' | 'startedAt' | 'sets'>,
  history: readonly Session[],
  /** Working sets per lift the plan asked for (`SessionView.sessionSetCounts`). Absent → only what she logged is judged. */
  planned?: Readonly<Record<string, number>>,
): VoiceRecap {
  const before = history.filter((s) => s.id !== session.id);
  const beforeSets = before.flatMap((s) => s.sets);
  const working = session.sets.filter(isWorking);

  const records: string[] = [];
  const earlier: SetRow[] = [];
  for (const s of working) {
    if (s.actualWeight != null && s.actualReps >= 1) {
      const baseline = recordBaselineKg(priorPeakKg(before, s.exerciseId, session.id), livePeakKg(earlier, s.exerciseId));
      const repsAtPeak = priorRepsAtKg([...beforeSets, ...earlier], s.exerciseId, baseline);
      const struck = isRecordSet(s.actualWeight, s.actualReps, baseline) || isRepRecordSet(s.actualWeight, s.actualReps, baseline, repsAtPeak);
      if (struck && !records.includes(s.exerciseId)) records.push(s.exerciseId);
    }
    earlier.push(s);
  }

  const onTarget: string[] = [];
  const byLift = new Map<string, SetRow[]>();
  for (const s of working) byLift.set(s.exerciseId, [...(byLift.get(s.exerciseId) ?? []), s]);
  for (const [ex, rows] of byLift) {
    const asked = planned?.[ex] ?? rows.length;
    if (asked <= 0 || rows.length < asked) continue;
    if (rows.every((r) => r.recommendedReps > 0 && r.actualReps >= r.recommendedReps)) onTarget.push(ex);
  }

  const start = Date.parse(session.startedAt);
  const last = working.reduce((m, s) => Math.max(m, Date.parse(s.persistedAt) || 0), 0);
  const minutes = Number.isFinite(start) && last > start ? Math.max(1, Math.round((last - start) / 60_000)) : 1;

  return { records, onTarget, sets: working.length, minutes };
}
