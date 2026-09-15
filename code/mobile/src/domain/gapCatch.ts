/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CATCH IN THE GAP — one note, on day six of a silence, made of a fact (2026-09-01, audit M4).
 *
 * Most churn in this category is not "I found a better app" — it is "I stopped going". The product
 * already refuses to nag about it (`domain/comeback`: no streaks, no guilt, a greeting only after
 * TEN days), and that refusal stands. This module is the one thing the silence gets BEFORE it
 * hardens into an absence: a single scheduled note, six days after the last workout, that states a
 * standing fact and asks for nothing.
 *
 * ── WHY DAY SIX ─────────────────────────────────────────────────────────────────────────────────
 * Inside the comeback threshold on purpose. Ten days is when a gap is worth greeting; six is when
 * a week's rhythm has just slipped — one missed cycle, not a lapse. Later than any training-day
 * reminder would fire, earlier than the point where the habit is gone.
 *
 * ── THE VOICE LAW APPLIES IN FULL ───────────────────────────────────────────────────────────────
 * "לא התאמנת שישה ימים!" is a nag and is banned. What ships is the same sentence grammar the whole
 * product speaks — a measured fact, first person, indicative, no exclamation:
 *
 *     Bench Press stands at 72.5 kg.
 *     Six days since your last workout. Nothing moved without you.
 *
 * The fact is HER heaviest completed working set of her LAST session — a number she actually
 * lifted, read from the log, never a forecast. A session with no loaded set (a bodyweight day)
 * gets the no-fact form, which states only that the programme is standing.
 *
 * ── RE-ARMED, NEVER STACKED ─────────────────────────────────────────────────────────────────────
 * Scheduled after every completed session onto ONE stable id, so training simply pushes the note
 * six days further out — an athlete who keeps showing up never sees it. Re-derived at boot (the
 * self-healing discipline every note here keeps); a fire-at already in the past schedules nothing,
 * because by then she has opened the app and the comeback surface owns the moment.
 *
 * Pure and I/O-free; `platform/gapCatch` does the reading and the scheduling.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import type { CardioActivity, Session } from '@/data/local/models';
import { isEvidenceSet } from '@/domain/setEvidence';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Day six — see the header. Exported so the copy's {{days}} and the trigger can never drift. */
export const GAP_CATCH_DAYS = 6;
/**
 * ════ AND ONE MORE, AT THREE WEEKS — THEN SILENCE FOREVER (2026-09-01, audit retention #7) ════
 *
 * Day six caught the slipped rhythm; after it, the product went quiet for good — day 14, 30, 60,
 * nothing. One follow-up at 21 days (past the comeback threshold, so the engine's detraining ease
 * is a fact by then, not a forecast) states that the loads return ADJUSTED, which answers the one
 * fear that keeps a lapsed athlete out: walking back into weights that no longer fit. Two notes
 * per silence, total, ever — the third note is the one that makes the first two nagging.
 */
export const LATER_CATCH_DAYS = 21;

export interface GapCatch {
  /** When the note should fire (ms) — always `last training + 6 days`. */
  fireAtMs: number;
  /** The three-week follow-up (`last training + 21 days`), or null once it too is behind `nowMs`. */
  laterFireAtMs: number | null;
  /** The standing fact to print, or null when the last training carried no loaded working set. */
  fact: { exerciseId: string; loadKg: number } | null;
}

/**
 * The note to arm given her record, or null when there is nothing to arm: no record at all
 * (a beginning is not a gap), or a fire-at already behind `nowMs` (she is mid-gap and the
 * comeback surface owns her return — scheduling a stale note now would greet her twice).
 *
 * ⛔ CARDIO COUNTS AS TRAINING, AND THE FIRST CUT OF THIS FILE GOT IT WRONG (fixed 2026-09-01,
 * same day). It read only strength history, so an athlete who ran on Tuesday and lifted last
 * Monday would be told *"six days since your last workout"* on Sunday — while her Tuesday run sat
 * in the very ledger this product keeps. **A sentence made of a fact must be made of ALL the
 * facts**, or it is the one thing this note exists not to be: an app that has not been watching.
 *
 * ⚠️ THE SILENCE IS WHAT CARDIO BUYS, NOT A LINE OF ITS OWN. A run pushes the note six days out
 * and never becomes its subject: the standing fact is a LOAD (`Bench Press stands at 72.5`), and
 * the strength record is where a load lives. A run with no loaded set simply yields the no-fact
 * form, which is the same honest shape a bodyweight day already had.
 */
export function gapCatchPlan(
  history: readonly Session[],
  nowMs: number,
  cardio: readonly CardioActivity[] = [],
): GapCatch | null {
  let last: Session | null = null;
  let lastMs = 0;
  for (const s of history) {
    const t = Date.parse(s.startedAt);
    if (Number.isFinite(t) && t > lastMs) {
      lastMs = t;
      last = s;
    }
  }
  // A run is training. It can move the CLOCK past the last lift; it never becomes the fact.
  let lastTrainingMs = lastMs;
  for (const a of cardio) {
    const t = Date.parse(a.startedAt);
    if (Number.isFinite(t) && t > lastTrainingMs) lastTrainingMs = t;
  }
  if (lastTrainingMs <= 0) return null;

  const fireAtMs = lastTrainingMs + GAP_CATCH_DAYS * DAY_MS;
  const laterAtMs = lastTrainingMs + LATER_CATCH_DAYS * DAY_MS;
  // Nothing left to arm only when BOTH notes are behind now — a boot at day eight still owes the
  // three-week note; a boot past day 21 owes nothing, and the comeback surface owns her return.
  if (laterAtMs <= nowMs) return null;

  // Her heaviest completed working set of that session — the same exclusions every engine read
  // keeps: approach sets never speak (S-60), zero-rep rows were not performed.
  let fact: GapCatch['fact'] = null;
  // `last` is null for an athlete whose whole record is runs — the note arms with no fact.
  for (const log of last?.sets ?? []) {
    if (!isEvidenceSet(log) || log.actualWeight == null || log.actualWeight <= 0 || log.actualReps <= 0) continue;
    if (!fact || log.actualWeight > fact.loadKg) fact = { exerciseId: log.exerciseId, loadKg: log.actualWeight };
  }
  return { fireAtMs, laterFireAtMs: laterAtMs, fact };
}
