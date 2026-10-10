/**
 * ════ THE RECORD, STRUCK WHERE SHE LIFTS IT (founder mandate 2026-08-24) ════
 *
 * The review's table-stakes row read "PR וחגיגת שיאים — חלקי: אין רגע-שיא בתוך הסשן". The wall
 * and the share card celebrate a record AFTER the workout; every serious logger also says it at
 * the bar, on the set that struck it — that is the moment it actually happened.
 *
 * ONE DEFINITION, SHARED. "Record" here is exactly `shareCard`'s rule: the heaviest weight ever
 * LOGGED on the lift, strictly exceeded, with at least one real rep. Two surfaces with two
 * definitions of "best" is the defect class this codebase keeps finding (the founder's own
 * "NEW BEST · 60 kg" vs "PERSONAL BESTS 0" screenshot) — so the beat asks the same question the
 * card does, and the two can never disagree about the same bar.
 *
 * WHAT NEVER STRIKES IT:
 *   · a warm-up bridge (`isApproach`) — half the working weight by design;
 *   · a first-ever load on a lift — the CARD calls that a record for the poster, but a beat that
 *     fires on every lift of her first session is confetti, not information. The beat speaks only
 *     when there is a past to beat.
 *
 *
 * Pure & I/O-free.
 */

//

import type { Session } from '@/data/local/models';
import { isEvidenceSet } from '@/domain/setEvidence';

/** Her heaviest logged weight on a lift, across history — or null when the lift has no past.
 *  Working sets only, ≥1 real rep, the live session excluded (its sets are the candidates). */
export function priorPeakKg(
  history: readonly Session[],
  exerciseId: string,
  excludeSessionId?: string | null,
): number | null {
  let peak: number | null = null;
  for (const s of history) {
    if (excludeSessionId && s.id === excludeSessionId) continue;
    for (const x of s.sets) {
      if (x.exerciseId !== exerciseId || !isEvidenceSet(x)) continue;
      if (x.actualWeight == null || x.actualReps < 1) continue;
      if (peak == null || x.actualWeight > peak) peak = x.actualWeight;
    }
  }
  return peak;
}

/** Does this set strike a record? Strictly above a KNOWN peak, with at least one real rep. */
export function isRecordSet(weightKg: number | null, reps: number, prior: number | null): boolean {
  return weightKg != null && reps >= 1 && prior != null && weightKg > prior;
}

/**
 * The heaviest working set ALREADY LOGGED in the live session, per lift (review find, 2026-08-24).
 *
 * The beat's baseline is everything logged BEFORE the current set — history AND the live
 * session's earlier sets. With history alone, the set that struck the record RAISED nothing the
 * next set was measured against, so sets 2–4 at the same new weight each said "record" again —
 * and a fact repeated on a fixed interval stops being read (the house law, verbatim). With the
 * live peak folded in, the record speaks exactly once: on the set that struck it.
 */
export function livePeakKg(
  sets: readonly { exerciseId: string; actualWeight: number | null; actualReps: number; isApproach?: boolean; presumed?: boolean }[],
  exerciseId: string,
): number | null {
  let peak: number | null = null;
  for (const x of sets) {
    if (x.exerciseId !== exerciseId || !isEvidenceSet(x)) continue;
    if (x.actualWeight == null || x.actualReps < 1) continue;
    if (peak == null || x.actualWeight > peak) peak = x.actualWeight;
  }
  return peak;
}

/** The beat's baseline: the greater of her history's peak and the live session's own. */
export function recordBaselineKg(historyPeak: number | null, livePeak: number | null): number | null {
  if (historyPeak == null) return livePeak;
  if (livePeak == null) return historyPeak;
  return Math.max(historyPeak, livePeak);
}
