/**
 * Share-card data (§9) — the FACTS a share card carries, derived purely from the
 * saved history. "A fact, made handsome enough to post" (founder). Nothing here is
 * invented: a record card exists only when the latest session actually set a new
 * all-time working-weight PR on a lift, and every figure on it is read back from a
 * logged set. No card ⇒ nothing worth showing, and we say nothing.
 *
 * Two cards, mirroring the handoff:
 *   • record — 9.1 PERSONAL RECORD: one lift, its new best load × reps, the step up
 *     from the previous best, and how far it has come since Hush first saw it.
 *   • week   — 9.2 WEEK COMPLETE: a training week's shape (which days were trained),
 *     the tonnage moved, the calories spent, and the honest change vs the week before.
 *
 * Pure & I/O-free (same discipline as domain/milestones): same history in, same
 * cards out, on any device, forever. Display conversion (kg⇄lb) happens HERE so the
 * card component only ever renders figures; names/copy stay in the component.
 */
// @ts-nocheck

// 

import type { Session, Units } from '@/data/local/models';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { sessionKcal } from '@/domain/energy';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Chronological (oldest → newest); only SAVED sessions with real logged work count. */
function chronological(sessions: Session[]): Session[] {
  return sessions
    .filter((s) => s.state === 'SAVED' && s.sets.length > 0)
    .slice()
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

/** Wall-clock ms from a session's start to its last logged set (its training duration). */
function durationMs(s: Session): number {
  if (s.sets.length === 0) return 0;
  const last = Date.parse(s.sets[s.sets.length - 1].persistedAt);
  return Math.max(0, last - Date.parse(s.startedAt));
}

const sessionTonnageKg = (s: Session): number =>
  s.sets.reduce((sum, x) => sum + (x.actualWeight ?? 0) * x.actualReps, 0);

// ───────────────────────────── 9.1 · Personal record ─────────────────────────────

export interface ShareRecordCard {
  kind: 'record';
  exerciseId: string;
  /** The record load, already in the athlete's display unit. */
  weight: number;
  unit: string;
  /** Reps of the set that set the record. */
  reps: number;
  /** Step up from the previous best (display unit); null when it is a first-ever load. */
  delta: number | null;
  /** The earliest load Hush ever logged for this lift (display unit); null when unknown. */
  firstWeight: number | null;
  /** Whole weeks between that first load and this record; null when < 1 week or unknown. */
  weeksAgo: number | null;
  /** When the record was set (the crossing session's start). */
  dateMs: number;
}

/**
 * The record card for the LATEST session, or null when it set none.
 *
 * A record = a set whose load is strictly the heaviest ever logged for that lift. When the latest
 * session breaks several, the biggest STEP wins (tie-break: the heavier absolute load) — the one an
 * athlete would actually want to show. Everything on the card is a real logged fact; the context
 * line is only offered when there is genuine history behind it.
 */
export function recordCardFromHistory(history: Session[], units: Units): ShareRecordCard | null {
  const hist = chronological(history);
  if (hist.length === 0) return null;
  const latest = hist[hist.length - 1];
  const prior = hist.slice(0, -1);

  // Previous all-time peak load per lift, and the earliest logged load + when.
  const priorPeak = new Map<string, number>();
  const firstSeen = new Map<string, { weight: number; at: number }>();
  for (const s of prior) {
    const at = Date.parse(s.startedAt);
    for (const x of s.sets) {
      if (x.actualWeight == null || x.actualReps < 1) continue;
      const peak = priorPeak.get(x.exerciseId);
      if (peak == null || x.actualWeight > peak) priorPeak.set(x.exerciseId, x.actualWeight);
      if (!firstSeen.has(x.exerciseId)) firstSeen.set(x.exerciseId, { weight: x.actualWeight, at });
    }
  }

  // The heaviest set of each lift IN the latest session (weight, and the reps that carried it).
  const latestPeak = new Map<string, { weight: number; reps: number }>();
  for (const x of latest.sets) {
    if (x.actualWeight == null || x.actualReps < 1) continue;
    const cur = latestPeak.get(x.exerciseId);
    if (cur == null || x.actualWeight > cur.weight) latestPeak.set(x.exerciseId, { weight: x.actualWeight, reps: x.actualReps });
  }

  let best: { exerciseId: string; weight: number; reps: number; deltaKg: number | null } | null = null;
  for (const [exId, peak] of latestPeak) {
    const prev = priorPeak.get(exId) ?? null;
    // A record is strictly above the previous best. A first-ever load is a record too (prev = null).
    if (prev != null && peak.weight <= prev) continue;
    const deltaKg = prev != null ? peak.weight - prev : null;
    const cand = { exerciseId: exId, weight: peak.weight, reps: peak.reps, deltaKg };
    if (
      best == null ||
      (cand.deltaKg ?? 0) > (best.deltaKg ?? 0) ||
      ((cand.deltaKg ?? 0) === (best.deltaKg ?? 0) && cand.weight > best.weight)
    ) {
      best = cand;
    }
  }
  if (best == null) return null;

  const first = firstSeen.get(best.exerciseId) ?? null;
  const weeksAgo = first ? Math.floor((Date.parse(latest.startedAt) - first.at) / WEEK_MS) : null;
  const firstDisplay = first ? displayWeight(first.weight, units) : null;

  return {
    kind: 'record',
    exerciseId: best.exerciseId,
    weight: displayWeight(best.weight, units) ?? 0,
    unit: unitLabel(units),
    reps: best.reps,
    // The step is expressed in the display unit and only when it is a genuine, positive rise.
    delta:
      best.deltaKg != null
        ? Math.max(0, (displayWeight(best.weight, units) ?? 0) - (displayWeight(best.weight - best.deltaKg, units) ?? 0))
        : null,
    firstWeight: firstDisplay,
    // Context only earns its line when the lift has real depth behind it (≥1 week, a lighter start).
    weeksAgo: weeksAgo != null && weeksAgo >= 1 && firstDisplay != null && firstDisplay < (displayWeight(best.weight, units) ?? 0) ? weeksAgo : null,
    dateMs: Date.parse(latest.startedAt),
  };
}

// ───────────────────────────── 9.2 · Week complete ─────────────────────────────

export interface ShareWeekDay {
  trained: boolean;
  /** Bar height as a fraction 0..1 of the week's busiest day (0 on a rest day). */
  height: number;
}

export interface ShareWeekCard {
  kind: 'week';
  /** Ordinal since Hush met the athlete (1-based); null when it cannot be known. */
  weekNumber: number | null;
  /** Seven cells, the week's local days in order. */
  days: ShareWeekDay[];
  /** Tonnage moved this week, in the athlete's display unit (kg or lb). */
  moved: number;
  unit: string;
  /** Estimated calories spent across the week's sessions; null without bodyweight. */
  kcal: number | null;
  /** Whole-percent change vs the previous week's tonnage; null when there is no prior week. */
  deltaPct: number | null;
  /** How many of the seven days were trained. */
  trainedDays: number;
  startMs: number;
  endMs: number;
}

/**
 * The week card for the training week beginning at `weekStartMs` (a local day boundary the caller
 * chooses — Hush's week rolls at a calendar start). Buckets the week's sessions by local day, sums
 * the tonnage and calories, and reports the honest change against the week before — which CAN be a
 * fall (an easy week reads as an easy week; same honesty as the volume graph).
 *
 * Returns null when the week held no logged work — an empty week is not worth showing.
 */
export function weekCardFromHistory(
  history: Session[],
  weekStartMs: number,
  weightKg: number | null | undefined,
  units: Units,
): ShareWeekCard | null {
  const hist = chronological(history);
  const weekEnd = weekStartMs + WEEK_MS;

  const dayTonnage = new Array(7).fill(0) as number[];
  let movedKg = 0;
  let kcal: number | null = null;
  let kcalKnown = false;

  for (const s of hist) {
    const at = Date.parse(s.startedAt);
    if (at < weekStartMs || at >= weekEnd) continue;
    const dayIdx = Math.min(6, Math.max(0, Math.floor((at - weekStartMs) / DAY_MS)));
    const tonnage = sessionTonnageKg(s);
    dayTonnage[dayIdx] += tonnage;
    movedKg += tonnage;
    const k = sessionKcal(s, durationMs(s), weightKg);
    if (k != null) {
      kcal = (kcal ?? 0) + k;
      kcalKnown = true;
    }
  }

  const trainedDays = dayTonnage.filter((t) => t > 0).length;
  if (trainedDays === 0 && movedKg === 0) return null;

  const maxDay = Math.max(1, ...dayTonnage);
  const days: ShareWeekDay[] = dayTonnage.map((t) => ({ trained: t > 0, height: t > 0 ? t / maxDay : 0 }));

  // Previous week's tonnage → the honest delta.
  const prevStart = weekStartMs - WEEK_MS;
  let prevKg = 0;
  for (const s of hist) {
    const at = Date.parse(s.startedAt);
    if (at < prevStart || at >= weekStartMs) continue;
    prevKg += sessionTonnageKg(s);
  }
  const deltaPct = prevKg > 0 ? Math.round(((movedKg - prevKg) / prevKg) * 100) : null;

  // Week ordinal from the first-ever session's week.
  const first = hist[0] ? Date.parse(hist[0].startedAt) : null;
  const weekNumber = first != null ? Math.max(1, Math.floor((weekStartMs + DAY_MS - first) / WEEK_MS) + 1) : null;

  return {
    kind: 'week',
    weekNumber,
    days,
    moved: displayWeight(movedKg, units) ?? 0,
    unit: unitLabel(units),
    kcal: kcalKnown ? kcal : null,
    deltaPct,
    trainedDays,
    startMs: weekStartMs,
    endMs: weekEnd - DAY_MS,
  };
}

export type ShareCard = ShareRecordCard | ShareWeekCard;
