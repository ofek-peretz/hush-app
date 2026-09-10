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

// 

import type { CardioActivity, Session, Units } from '@/data/local/models';
import { isEvidenceSet } from '@/domain/setEvidence';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { sessionDurationMs, sessionEnergyKcal, sessionHasLoggedWork, sessionTonnageKg } from '@/domain/sessionMetrics';
import { muscleOf } from '@/data/exercises';
import { trainingWeekNumber } from '@/domain/weekCadence';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Chronological (oldest → newest); only SAVED sessions with real logged work count.
 *
 * ⚠️ IT ASKED FOR `sets.length > 0`, WHICH IS NOT THE SAME QUESTION. An interval session logs no
 * `SetLog`, so the card dropped it: its minutes never reached the week's calorie total, its day
 * never lit up in the seven-day strip, and — worse — a poster made right after one announced the
 * PREVIOUS session's record all over again, because `latest` skipped past the workout she had just
 * finished. `sessionHasLoggedWork` is the one predicate for "she did something here".
 *
 * ⛔ The duration, tonnage and kcal below come from `domain/sessionMetrics` for the same reason:
 * this file was the sixth place deriving a session's length and the eighth deriving its tonnage.
 */
function chronological(sessions: Session[]): Session[] {
  return sessions
    .filter((s) => s.state === 'SAVED' && sessionHasLoggedWork(s))
    .slice()
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

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
    for (const x of s.sets ?? []) {
      // A warm-up bridge (`isApproach`) is neither a best nor where she started — reading it as
      // "began at 30 kg" would overstate every gain the card celebrates (2026-08-24).
      if (!isEvidenceSet(x)) continue;
      if (x.actualWeight == null || x.actualReps < 1) continue;
      const peak = priorPeak.get(x.exerciseId);
      if (peak == null || x.actualWeight > peak) priorPeak.set(x.exerciseId, x.actualWeight);
      if (!firstSeen.has(x.exerciseId)) firstSeen.set(x.exerciseId, { weight: x.actualWeight, at });
    }
  }

  // The heaviest set of each lift IN the latest session (weight, and the reps that carried it).
  const latestPeak = new Map<string, { weight: number; reps: number }>();
  for (const x of latest.sets ?? []) {
    if (!isEvidenceSet(x)) continue; // same line — a record is struck on work, never on the bridge to it, never on a presumed set
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
  /**
   * Ordinal since Hush met the athlete (1-based); null when it cannot be known.
   *
   * ⛔ PROGRESS SAID "6 WEEKS" AND THE CARD POSTED FROM THAT SAME SCREEN SAID "WEEK 4" — and the
   * card is the one the world sees. This counted raw 7-day blocks from her FIRST LOGGED SESSION;
   * every other surface in the app counts Saturday-20:30 windows from `memberSince`
   * (`weekCadence.trainingWeekNumber`). A week off, a late first workout, a signup on a Wednesday —
   * any of the three and the two numbers part. There is one week counter now, and it is that one.
   */
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
 *
 * `memberSinceIso` is the account's birthday — the anchor the whole app counts "Week N" from. See
 * `ShareWeekCard.weekNumber` for why the card is no longer allowed its own count.
 */
export function weekCardFromHistory(
  history: Session[],
  weekStartMs: number,
  weightKg: number | null | undefined,
  units: Units,
  memberSinceIso?: string | null,
): ShareWeekCard | null {
  const hist = chronological(history);
  const weekEnd = weekStartMs + WEEK_MS;

  const dayTonnage = new Array(7).fill(0) as number[];
  const dayTrained = new Array(7).fill(false) as boolean[];
  let movedKg = 0;
  let kcal: number | null = null;
  let kcalKnown = false;

  for (const s of hist) {
    const at = Date.parse(s.startedAt);
    if (at < weekStartMs || at >= weekEnd) continue;
    const dayIdx = Math.min(6, Math.max(0, Math.floor((at - weekStartMs) / DAY_MS)));
    const tonnage = sessionTonnageKg(s);
    dayTonnage[dayIdx] += tonnage;
    // ⚠️ A DAY IS TRAINED BECAUSE SHE TRAINED, NOT BECAUSE SHE MOVED TONNES. The strip asked
    // `tonnage > 0`, so the day she ran six 400 m repeats read as a rest day on her own week card.
    dayTrained[dayIdx] = true;
    movedKg += tonnage;
    const k = sessionEnergyKcal(s, weightKg);
    if (k != null) {
      kcal = (kcal ?? 0) + k;
      kcalKnown = true;
    }
  }

  const trainedDays = dayTrained.filter(Boolean).length;
  if (trainedDays === 0 && movedKg === 0) return null;

  // The bars still measure TONNAGE — that is what the strip draws. A trained day with none (an
  // interval day) is marked but flat; it is an honest zero, and it is not a rest day.
  const maxDay = Math.max(1, ...dayTonnage);
  const days: ShareWeekDay[] = dayTonnage.map((t, i) => ({ trained: dayTrained[i], height: t > 0 ? t / maxDay : 0 }));

  // Previous week's tonnage → the honest delta.
  const prevStart = weekStartMs - WEEK_MS;
  let prevKg = 0;
  for (const s of hist) {
    const at = Date.parse(s.startedAt);
    if (at < prevStart || at >= weekStartMs) continue;
    prevKg += sessionTonnageKg(s);
  }
  const deltaPct = prevKg > 0 ? Math.round(((movedKg - prevKg) / prevKg) * 100) : null;

  /*
   * The week ordinal, counted the ONE way the app counts it: Saturday-20:30 windows since
   * `memberSince`. Asked of `weekStartMs`, not of "now", so a card made for a past week says the
   * number that week actually was.
   *
   * ⚠️ WITHOUT THE ANCHOR THE CARD SAYS NOTHING. `trainingWeekNumber` falls back to 1 on a missing
   * `memberSince`, and printing "Week 1" over a veteran's week is a louder lie than printing no
   * week at all — this card gets posted. Null renders no line. (Progress passes the anchor; see
   * the handoff note on its `weekCardFromHistory` call.)
   */
  const weekNumber = memberSinceIso ? trainingWeekNumber(memberSinceIso, weekStartMs) : null;

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

// ───────────────────────────── 9.3 · The session story ─────────────────────────────

/**
 * ⛔ FOUNDER, device QA 2026-08-23: *"המסך שאותו אנשים ירצו לשתף ולהעלות לסטורי … מקור הגאווה שלהם
 * + האפשרות לפרסום שלנו בזכות חשיפה ויראלית."*
 *
 * The record card fires only on an all-time best — a handful of workouts a month. The workout she
 * wants on her story is the one she JUST DID, most of which set no record. This card is that
 * workout: her body wearing the muscles it worked, and the session's three honest figures. When a
 * record WAS set, the record card outranks it (the prouder fact wins), decided at the call site.
 */
export interface ShareSessionCard {
  kind: 'session';
  /** The workout's name — "Upper A". */
  dayName: string;
  /** Muscles her logged sets touched — the moss on the card's body. */
  muscles: string[];
  /** Whole minutes; null under one minute (a claim of zero is not a duration). */
  durationMin: number | null;
  /** Weight moved, in the display unit. */
  moved: number;
  unit: string;
  kcal: number | null;
  dateMs: number;
  /** Whose body wears the work — the morning's own lesson: the figure defaults female. */
  sex?: 'female' | 'male';
  /** Trained together (2026-08-23) — the names she gave, on the story the world sees. */
  partners?: string[];
  /**
   * ⛔ THE RECORD RIDES THE SESSION CARD (founder, device QA 2026-08-23: *"אני רוצה לשתף את
   * האימון מאיפה הגיע הדדליפט הזה"*). The first cut had the RECORD card outrank this one at
   * the door — my "prouder truth wins" — and on his own device the story door opened on a deadlift
   * figure instead of the workout he had just done. The workout is the story; a record set inside
   * it is a LINE on that story, not a rival card.
   */
  record?: { exerciseId: string; weight: number; unit: string; reps: number };
}

/** The story card for the LATEST session, or null when there is nothing real to show. */
export function sessionCardFromHistory(
  history: Session[],
  units: Units,
  bodyweightKg?: number,
  sex?: 'female' | 'male',
): ShareSessionCard | null {
  const hist = chronological(history);
  const latest = hist[hist.length - 1];
  if (!latest) return null;
  const muscles: string[] = [...new Set(latest.sets.map((x) => muscleOf(x.exerciseId)).filter((m): m is NonNullable<ReturnType<typeof muscleOf>> => m != null))];
  const durationMs = sessionDurationMs(latest);
  const kcal = sessionEnergyKcal(latest, bodyweightKg);
  // The same read the record card makes — attached, never a rival (see the field's note).
  const record = recordCardFromHistory(history, units);
  return {
    kind: 'session',
    dayName: latest.programDayName ?? '',
    muscles,
    durationMin: durationMs >= 60_000 ? Math.round(durationMs / 60_000) : null,
    moved: displayWeight(sessionTonnageKg(latest), units) ?? 0,
    unit: unitLabel(units),
    kcal,
    dateMs: Date.parse(latest.startedAt),
    ...(sex ? { sex } : {}),
    ...(latest.partners && latest.partners.length > 0 ? { partners: latest.partners } : {}),
    ...(record ? { record: { exerciseId: record.exerciseId, weight: record.weight, unit: record.unit, reps: record.reps } } : {}),
  };
}

// ───────────────────────────── 9.4 · The run's story ─────────────────────────────

/**
 * ⛔ FOUNDER, 2026-08-23 (the cardio mandate): *"שמסך הסיום של הקרדיו ירגיש גם הוא גאווה כך
 * שהמתאמן ירצה לשתף את זה."* — the same argument as the session story, for the run she just did.
 *
 * Everything here is read off the SAVED activity: the distance, the moving time, the average pace
 * the poster already shows, and each finished kilometre's own time (the card's bars). `longest`
 * is the one derived pride fact: this run went further than every run before it — and it is only
 * claimed when there IS a before (a first run is not "your longest yet", it is your first).
 */
export interface ShareCardioCard {
  kind: 'cardio';
  distanceKm: number;
  /** Moving seconds — the clock the run itself kept. */
  durationSec: number;
  /** Whole-run average pace, sec/km; null on an activity too short to have one (never 0:00). */
  avgPaceSec: number | null;
  kcal: number | null;
  /** Each finished kilometre's own time — the shape of the effort, drawn as bars. */
  splits: { km: number; sec: number }[];
  /** Strictly further than every prior activity — and prior activities exist. */
  longest: boolean;
  dateMs: number;
}

/** The story card for a just-finished activity, or null when there is nothing real to show. */
export function cardioCardFromActivity(activity: CardioActivity, prior: CardioActivity[]): ShareCardioCard | null {
  if (!(activity.distanceKm > 0)) return null;
  const others = prior.filter((a) => a.id !== activity.id && a.distanceKm > 0);
  return {
    kind: 'cardio',
    distanceKm: activity.distanceKm,
    durationSec: activity.durationSec,
    avgPaceSec: activity.avgPaceSec > 0 ? activity.avgPaceSec : null,
    kcal: activity.calories ?? null,
    splits: activity.splits.map((sp) => ({ km: sp.km, sec: sp.durationSec })),
    longest: others.length > 0 && others.every((a) => a.distanceKm < activity.distanceKm),
    dateMs: Date.parse(activity.startedAt),
  };
}

export type ShareCard = ShareRecordCard | ShareWeekCard | ShareSessionCard | ShareCardioCard;
