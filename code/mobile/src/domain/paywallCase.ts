/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PAYWALL'S ARGUMENT IS HER OWN NUMBERS — founder, 2026-08-23 (the Spotify mandate):
 * the close he approved by name: *"בעשרה אימונים העליתי לך את הסקוואט ב־12.5 ק"ג."*
 *
 * His 2026-08-13 ruling stripped this screen of claims — *"every one of them was a claim she had
 * already spent fourteen sessions verifying"* — and this module is NOT that ruling coming back.
 * A generic promise ("smart progression!") is marketing; *"your deadlift rose 12.5 kg since you
 * started"* is a measurement, read from her own log, that no competitor can print because no
 * competitor made it happen. It is the one sentence that answers "why pay" with evidence instead
 * of adjectives — and it is exactly one sentence, so the founder's screen stays two cards and a
 * headline.
 *
 * ── WHAT COUNTS AS "ROSE", AND WHY IT IS CONSERVATIVE ───────────────────────────────────────────
 * Per lift: the heaviest load of the FIRST session that logged it, against the heaviest of the
 * LATEST session that logged it — her working weight then vs now, the same "then vs now" a coach
 * would quote. At least two distinct sessions, so a single outing can never claim a rise it did
 * not measure. The champion is the biggest rise (tie → the heavier lift today); `othersUp` counts
 * the REST of the lifts that also rose, so the line can add "ועוד 4 תרגילים עלו" without listing.
 *
 * Null when nothing rose. The gate screen then simply says nothing personal — a paywall must never
 * fish for a compliment it cannot back (the same honesty law as every figure in this product).
 *
 * Pure and I/O-free — same history in, same case out.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import type { Session, Units } from '@/data/local/models';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { sessionHasLoggedWork } from '@/domain/sessionMetrics';

export interface PaywallCase {
  /** The lift with the biggest measured rise — the sentence's subject. */
  exerciseId: string;
  /** The rise, already in the display unit, rounded to one decimal. */
  delta: number;
  unit: string;
  /** How many OTHER lifts also rose (0 = the champion rose alone). */
  othersUp: number;
}

export function paywallCase(history: Session[], units: Units): PaywallCase | null {
  const hist = history
    .filter((s) => s.state === 'SAVED' && sessionHasLoggedWork(s))
    .slice()
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  if (hist.length < 2) return null;

  // Per lift: top load of the first session that logged it, top load of the latest, and how many
  // distinct sessions carried it (two at minimum, or "then vs now" is one session talking twice).
  const firstTop = new Map<string, number>();
  const latestTop = new Map<string, number>();
  const sessionsWith = new Map<string, number>();
  for (const s of hist) {
    const topThisSession = new Map<string, number>();
    for (const x of s.sets ?? []) {
      if (x.actualWeight == null || x.actualWeight <= 0 || x.actualReps < 1) continue;
      const cur = topThisSession.get(x.exerciseId);
      if (cur == null || x.actualWeight > cur) topThisSession.set(x.exerciseId, x.actualWeight);
    }
    for (const [ex, top] of topThisSession) {
      if (!firstTop.has(ex)) firstTop.set(ex, top);
      latestTop.set(ex, top);
      sessionsWith.set(ex, (sessionsWith.get(ex) ?? 0) + 1);
    }
  }

  let champion: { exerciseId: string; deltaKg: number; nowKg: number } | null = null;
  let risers = 0;
  for (const [ex, nowKg] of latestTop) {
    if ((sessionsWith.get(ex) ?? 0) < 2) continue;
    const deltaKg = nowKg - (firstTop.get(ex) ?? nowKg);
    if (deltaKg <= 0) continue;
    risers += 1;
    if (
      champion == null ||
      deltaKg > champion.deltaKg ||
      (deltaKg === champion.deltaKg && nowKg > champion.nowKg)
    ) {
      champion = { exerciseId: ex, deltaKg, nowKg };
    }
  }
  if (champion == null) return null;

  // The rise converts as a DIFFERENCE of display weights, so kg⇄lb rounding cannot invent mass.
  const now = displayWeight(champion.nowKg, units) ?? 0;
  const then = displayWeight(champion.nowKg - champion.deltaKg, units) ?? 0;
  const delta = Math.round((now - then) * 10) / 10;
  if (delta <= 0) return null; // a rise the display unit rounds away is not worth a sentence

  return { exerciseId: champion.exerciseId, delta, unit: unitLabel(units), othersUp: risers - 1 };
}
