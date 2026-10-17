/**
 * THE CASE FOR A CHANGED LIFT — the data behind the WHY sheet (v7 2.1b / 2.1c / 2.1d).
 *
 * Today prints the engine's CONCLUSION: a load, struck in moss. This assembles the ARGUMENT that
 * conclusion rests on, so the sheet can draw it: what the load was, what it became, the band it
 * was judged against, the last two sessions of that lift set-by-set, and whether each of them
 * reached the top of the band.
 *
 * ════ IT COMPUTES NOTHING IT COULD BE WRONG ABOUT ════
 *
 * Every figure here is READ, never derived: the loads and the band come off the stamped weekly view
 * (`WeeklyPlanLift.change.snapshot`), the reps come off saved sessions, and the closing sentence is
 * the engine's own `explanation.text`. The one judgement it makes is arithmetic — did a session's
 * reps reach the top of the band — which is a comparison of two recorded numbers, not an inference
 * about the athlete. R7: Hush never states a reason it did not measure.
 */

// 

import type { Session, SetLog } from '@/data/local/models';
import { isEvidenceSet } from '@/domain/setEvidence';
import type { WeeklyPlanLift } from '@/engine/weeklyView';
import { displayWeight, unitLabel } from '@/domain/schedule';

/** One session's evidence on this lift, ready for the sheet. */
export interface CaseSession {
  /** ISO instant the session started — the caller formats the date in the active locale. */
  at: string;
  /** The load it was performed at, in display units, with the set-by-set reps: "44 × 9·9·8". */
  figure: string;
  /** Did every logged set reach the top of the band? The filled vs hollow mark on the sheet. */
  reached: boolean;
}

/** Everything the WHY sheet needs about one lift the engine touched. */
export interface ChangedLiftCase {
  exerciseId: string;
  verdict: 'up' | 'down' | 'hold';
  /** Display-unit loads. `from` is null when nothing moved — there is nothing to strike. */
  from: string | null;
  to: string;
  unit: string;
  /** "+3.5" / "−2.5", already signed with a real minus. Null on a hold. */
  delta: string | null;
  band: [number, number];
  /**
   * WHY, in whoever's words decided it.
   *
   * It was the engine's sentence as an i18n key + params — it had to be, being a machine assembling
   * prose for two languages. The coach writes the sentence itself, in her language, so a case may
   * now carry literal text instead. Translating that back into a key would turn "your last two
   * sessions ended short" into `endedShort` and the reason she is owed into a category.
   */
  line: { key: string; params?: Record<string, string | number> } | { text: string };
  /** Oldest first, at most two — the sessions that made the case. */
  sessions: CaseSession[];
}

/** The reps of every logged set of one lift in one session, in the order they were performed. */
function repsOf(session: Session, exerciseId: string): SetLog[] {
  // Working sets only — a warm-up bridge (`isApproach`) would put its half weight in `sets[0]`
  // and its 5·3 reps at the head of the chain, and the case would argue from the road instead of
  // the work (2026-08-24).
  return session.sets.filter((s) => s.exerciseId === exerciseId && isEvidenceSet(s));
}

/**
 * The two most recent sessions containing this lift, oldest first.
 *
 * `loadHistory` returns newest first; the sheet reads chronologically, because the argument is
 * "twice in a row", and a reader cannot see "in a row" in a list running backwards.
 */
function recentSessions(history: readonly Session[], exerciseId: string): Session[] {
  return history.filter((s) => s.sets.some((x) => x.exerciseId === exerciseId)).slice(0, 2).reverse();
}

/** A load formatted for display — trailing zeros trimmed, no unit (the sheet states it once). */
function fmtLoad(kg: number | null, units: 'kg' | 'lb'): string | null {
  if (kg == null) return null;
  const w = displayWeight(kg, units);
  return w == null ? null : String(+w.toFixed(2));
}

export function changedLiftCase(
  lift: WeeklyPlanLift,
  history: readonly Session[],
  units: 'kg' | 'lb',
): ChangedLiftCase {
  const snap = lift.change?.snapshot;
  const band: [number, number] = lift.change?.snapshot.rangeTo ?? lift.repRange ?? [8, 10];
  const loadFrom = snap?.loadFrom ?? null;
  const loadTo = snap?.loadTo ?? null;

  const moved = loadFrom != null && loadTo != null && loadTo !== loadFrom;
  const verdict: 'up' | 'down' | 'hold' = !moved ? 'hold' : loadTo! > loadFrom! ? 'up' : 'down';

  // The delta carries a REAL minus (−, U+2212), not a hyphen: it sits beside a 70px numeral and a
  // hyphen reads as a dash in the middle of a figure.
  const deltaKg = moved ? Math.abs(loadTo! - loadFrom!) : null;
  const deltaDisplay = deltaKg == null ? null : fmtLoad(deltaKg, units);
  const delta = deltaDisplay == null ? null : `${verdict === 'up' ? '+' : '−'}${deltaDisplay}`;

  const sessions: CaseSession[] = recentSessions(history, lift.exerciseId).map((s) => {
    const sets = repsOf(s, lift.exerciseId);
    const load = fmtLoad(sets[0]?.actualWeight ?? null, units);
    const reps = sets.map((x) => x.actualReps).join('·');
    return {
      at: s.startedAt,
      figure: load == null ? reps : `${load} × ${reps}`,
      // "Reached" means every logged set touched the ceiling — the exact condition a raise is
      // earned on, so the mark on the band and the engine's verdict can never disagree.
      reached: sets.length > 0 && sets.every((x) => x.actualReps >= band[1]),
    };
  });

  return {
    exerciseId: lift.exerciseId,
    verdict,
    from: moved ? fmtLoad(loadFrom, units) : null,
    to: fmtLoad(loadTo ?? lift.loadKg, units) ?? '',
    unit: unitLabel(units),
    delta,
    band,
    line: { key: lift.change?.explanation.text.key ?? '', params: lift.change?.explanation.text.params },
    sessions,
  };
}
