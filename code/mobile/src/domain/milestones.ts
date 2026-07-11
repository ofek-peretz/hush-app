/**
 * Milestones — the athlete's rare, earned marks (founder, 2026-07-10).
 *
 * The ONE licensed loud moment in an otherwise quiet instrument. Four families,
 * all founder-ratified, all tuned so a consistent athlete sees roughly one mark
 * a month in year one and rarer after ("not something you see every two days"):
 *   • count   — cumulative WHOLE workouts (10 … 1000). Pure count, NO streak mechanics. A partial
 *               session (under half the prescribed sets) is not a workout and never ticks it —
 *               this is the only family that asks the question (founder 2026-07-11).
 *   • tonnage — cumulative kg moved, HUGE thresholds only (250 t … 10,000 t);
 *               each is a real-world object the athlete has now "moved".
 *   • club    — an actually-logged set at a landmark load on the five barbell
 *               compounds (the plate-club numbers, displayed as weights).
 *   • engine  — the engine proved itself: the FIRST time Hush raised a compound's
 *               load (once ever), and a compound's working load DOUBLING from its
 *               starting point (per compound). Compounds only (founder).
 *
 * Pure & I/O-free, derived ENTIRELY from saved strength sessions — nothing is
 * persisted, nothing touches the engine, always retroactively correct. Rejected
 * forever (founder): bodyweight-relative standards, e1RM marks, daily streaks.
 */
import type { Session } from '@/data/local/models';
import { exerciseById } from '@/data/exercises';

export type MilestoneFamily = 'count' | 'tonnage' | 'club' | 'engine';

export interface Milestone {
  /** Stable identity, e.g. 'count_100', 'tonnage_500000', 'club_bb_back_squat_140',
   *  'engine_first_raise', 'engine_doubled_bb_bench_press'. */
  id: string;
  family: MilestoneFamily;
  /** Threshold in the family's unit: workouts (count), kg (tonnage/club); absent on engine marks. */
  value?: number;
  /** The lift the mark belongs to (club / engine_doubled). */
  exerciseId?: string;
}

export interface EarnedMilestone extends Milestone {
  earnedAt: string; // ISO — when the crossing session started
  sessionId: string; // the session that crossed it
}

/** A family's next locked mark, with live progress toward it (gallery silhouette). */
export interface NextMilestone {
  milestone: Milestone;
  current: number; // same unit as target
  target: number;
}

// ─────────────────────────── the ratified thresholds ───────────────────────────

/** Cumulative workouts. Starts at 10 — the first workout already has its own moment. */
export const COUNT_THRESHOLDS = [10, 25, 50, 100, 250, 500, 1000] as const;

/** Cumulative kg moved. First one lands after ~2–3 months of consistent work;
 *  the ladder ends at the Eiffel Tower — a mark measured in years. */
export const TONNAGE_THRESHOLDS_KG = [
  250_000, // ≈ the Statue of Liberty
  500_000, // ≈ an A380 at max take-off
  1_000_000, // ≈ a freight train
  2_500_000, // ≈ a light warship
  5_000_000,
  10_000_000, // ≈ the Eiffel Tower
] as const;

/** Plate-club loads (total kg incl. the 20 kg bar — the displayed number) on the
 *  five barbell compounds. Crossed by a genuinely LOGGED set at ≥ the threshold. */
export const CLUB_THRESHOLDS_KG: Readonly<Record<string, readonly number[]>> = {
  bb_back_squat: [60, 100, 140, 180, 220],
  bb_deadlift: [100, 140, 180, 220, 260],
  bb_bench_press: [60, 100, 140, 180],
  bb_overhead_press: [40, 60, 80, 100],
  bb_row: [60, 100, 140],
};

/** Celebration priority when several marks land in one workout: most personal wins.
 *  Only ONE is celebrated (rarity law); the rest appear quietly in the gallery. */
const FAMILY_RANK: Record<string, number> = {
  engine_doubled: 5,
  engine_first_raise: 4,
  club: 3,
  tonnage: 2,
  count: 1,
};

const rankOf = (m: Milestone): number =>
  m.family === 'engine'
    ? FAMILY_RANK[m.id.startsWith('engine_doubled') ? 'engine_doubled' : 'engine_first_raise']
    : FAMILY_RANK[m.family];

// ─────────────────────────── helpers ───────────────────────────

/** A loaded, non-bodyweight compound per the catalog (founder: engine marks = compounds only). */
function isLoadedCompound(exerciseId: string): boolean {
  const ex = exerciseById(exerciseId);
  return !!ex && ex.tier === 'compound' && !ex.bodyweight;
}

/** Chronological (oldest → newest) copy; only SAVED sessions with real logged work count. */
function chronological(sessions: Session[]): Session[] {
  return sessions
    .filter((s) => s.state === 'SAVED' && s.sets.length > 0)
    .slice()
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

/**
 * Does this session count as a WORKOUT for the count family (founder 2026-07-11)?
 *
 * The count family — "N workouts" — is the ONE family about whole workouts, so a PARTIAL session
 * (under half the prescribed sets; `trained === false`, stamped at save via domain/completion)
 * does not tick it. Every OTHER family counts a partial's work in full: the kilos were moved, the
 * club set was lifted, the engine's raise was real — a short session that broke a mark KEEPS it.
 * Sessions saved before the rule carry no verdict (undefined) and count, as they did then.
 */
const countsAsWorkout = (s: Session): boolean => s.trained !== false;

const sessionTonnage = (s: Session): number =>
  s.sets.reduce((sum, x) => sum + (x.actualWeight ?? 0) * x.actualReps, 0);

// ─────────────────────────── derivation ───────────────────────────

/**
 * Every milestone the athlete has earned, in the order they were earned.
 * Order-agnostic over the input (sorted internally).
 */
export function earnedMilestones(sessions: Session[]): EarnedMilestone[] {
  const hist = chronological(sessions);
  const out: EarnedMilestone[] = [];
  const earn = (m: Milestone, s: Session) => out.push({ ...m, earnedAt: s.startedAt, sessionId: s.id });

  let count = 0;
  let tonnage = 0;
  let countIdx = 0; // next unearned index into COUNT_THRESHOLDS
  let tonnageIdx = 0;
  const clubIdx: Record<string, number> = {}; // exerciseId → next unearned club index
  let firstRaiseEarned = false;
  // exerciseId → max recommendedWeight of its PREVIOUS session (engine-raise detection)
  const prevPrescribed = new Map<string, number>();
  // exerciseId → first-session peak actual load (the doubling baseline)
  const baseline = new Map<string, number>();
  const doubled = new Set<string>();

  for (const s of hist) {
    // count — WHOLE workouts only (a partial session never ticks this family)
    if (countsAsWorkout(s)) {
      count += 1;
      while (countIdx < COUNT_THRESHOLDS.length && count >= COUNT_THRESHOLDS[countIdx]) {
        earn({ id: `count_${COUNT_THRESHOLDS[countIdx]}`, family: 'count', value: COUNT_THRESHOLDS[countIdx] }, s);
        countIdx += 1;
      }
    }

    // tonnage
    tonnage += sessionTonnage(s);
    while (tonnageIdx < TONNAGE_THRESHOLDS_KG.length && tonnage >= TONNAGE_THRESHOLDS_KG[tonnageIdx]) {
      earn(
        { id: `tonnage_${TONNAGE_THRESHOLDS_KG[tonnageIdx]}`, family: 'tonnage', value: TONNAGE_THRESHOLDS_KG[tonnageIdx] },
        s,
      );
      tonnageIdx += 1;
    }

    // per-exercise session peaks (actual + prescribed), computed once per session
    const peakActual = new Map<string, number>();
    const peakPrescribed = new Map<string, number>();
    for (const x of s.sets) {
      if (x.actualWeight != null && x.actualReps >= 1) {
        const cur = peakActual.get(x.exerciseId);
        if (cur == null || x.actualWeight > cur) peakActual.set(x.exerciseId, x.actualWeight);
      }
      if (x.recommendedWeight != null) {
        const cur = peakPrescribed.get(x.exerciseId);
        if (cur == null || x.recommendedWeight > cur) peakPrescribed.set(x.exerciseId, x.recommendedWeight);
      }
    }

    // clubs — a logged set at/over the landmark load
    for (const [exId, peak] of peakActual) {
      const ladder = CLUB_THRESHOLDS_KG[exId];
      if (!ladder) continue;
      let i = clubIdx[exId] ?? 0;
      while (i < ladder.length && peak >= ladder[i]) {
        earn({ id: `club_${exId}_${ladder[i]}`, family: 'club', value: ladder[i], exerciseId: exId }, s);
        i += 1;
      }
      clubIdx[exId] = i;
    }

    // engine — first raise (once ever): a compound's prescription rose vs its previous session
    if (!firstRaiseEarned) {
      for (const [exId, presc] of peakPrescribed) {
        const prev = prevPrescribed.get(exId);
        if (prev != null && presc > prev && isLoadedCompound(exId)) {
          earn({ id: 'engine_first_raise', family: 'engine' }, s);
          firstRaiseEarned = true;
          break;
        }
      }
    }
    for (const [exId, presc] of peakPrescribed) prevPrescribed.set(exId, presc);

    // engine — doubled (per compound): working load reached 2× its first-session peak
    for (const [exId, peak] of peakActual) {
      if (!isLoadedCompound(exId)) continue;
      const base = baseline.get(exId);
      if (base == null) {
        baseline.set(exId, peak);
      } else if (!doubled.has(exId) && base > 0 && peak >= base * 2) {
        earn({ id: `engine_doubled_${exId}`, family: 'engine', exerciseId: exId }, s);
        doubled.add(exId);
      }
    }
  }

  return out;
}

/**
 * The marks crossed by the athlete's LATEST session (the one WellDone is closing).
 * Ranked most-celebration-worthy first; the caller celebrates [0] only.
 */
export function newlyEarned(sessions: Session[]): EarnedMilestone[] {
  const hist = chronological(sessions);
  if (hist.length === 0) return [];
  const latest = hist[hist.length - 1];
  return earnedMilestones(hist)
    .filter((m) => m.sessionId === latest.id)
    .sort((a, b) => rankOf(b) - rankOf(a) || (b.value ?? 0) - (a.value ?? 0));
}

/**
 * The gallery's locked silhouettes: each family's SINGLE next mark with live
 * progress ("140 kg · 12 kg to go"). Only the next — mystery + direction, never
 * the whole ladder. For clubs, the nearest club across the five lifts the
 * athlete actually trains (highest progress ratio).
 */
export function nextUp(sessions: Session[]): NextMilestone[] {
  const hist = chronological(sessions);
  const earned = new Set(earnedMilestones(hist).map((m) => m.id));
  const out: NextMilestone[] = [];

  const count = hist.filter(countsAsWorkout).length; // whole workouts only (see countsAsWorkout)
  const nextCount = COUNT_THRESHOLDS.find((n) => !earned.has(`count_${n}`));
  if (nextCount != null) {
    out.push({ milestone: { id: `count_${nextCount}`, family: 'count', value: nextCount }, current: count, target: nextCount });
  }

  const tonnage = hist.reduce((a, s) => a + sessionTonnage(s), 0);
  const nextTon = TONNAGE_THRESHOLDS_KG.find((n) => !earned.has(`tonnage_${n}`));
  if (nextTon != null) {
    out.push({ milestone: { id: `tonnage_${nextTon}`, family: 'tonnage', value: nextTon }, current: tonnage, target: nextTon });
  }

  // nearest club: all-time peak per club lift → the closest un-earned rung
  let bestClub: NextMilestone | null = null;
  for (const [exId, ladder] of Object.entries(CLUB_THRESHOLDS_KG)) {
    let peak = 0;
    for (const s of hist) {
      for (const x of s.sets) {
        if (x.exerciseId === exId && x.actualWeight != null && x.actualReps >= 1 && x.actualWeight > peak) peak = x.actualWeight;
      }
    }
    if (peak <= 0) continue; // never trained → no silhouette (no cold targets)
    const next = ladder.find((n) => !earned.has(`club_${exId}_${n}`));
    if (next == null) continue;
    const cand: NextMilestone = {
      milestone: { id: `club_${exId}_${next}`, family: 'club', value: next, exerciseId: exId },
      current: peak,
      target: next,
    };
    if (!bestClub || cand.current / cand.target > bestClub.current / bestClub.target) bestClub = cand;
  }
  if (bestClub) out.push(bestClub);

  return out;
}
