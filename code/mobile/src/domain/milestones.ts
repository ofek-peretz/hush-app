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
 *   • club    — an actually-logged set at a landmark load on the athlete's club lifts. Which lifts,
 *               and at which loads, is PERSONAL: cut from the onboarding answers (founder
 *               2026-07-13) — see the clubs section below.
 *   • engine  — the engine proved itself: the FIRST time Hush raised a compound's
 *               load (once ever), and a compound's working load DOUBLING from its
 *               starting point (per compound). Compounds only (founder).
 *   • weeks   — distinct TRAINING WEEKS on record (4 … 104), added 2026-08-24 (the competitive
 *               review's retention finding, founder-approved): weekly consistency is the one
 *               habit mechanic with real evidence behind it, and the honest, nag-free form of it
 *               is a COUNT that only grows. A week counts if it holds ANY whole workout —
 *               rest-day-safe and sickness-forgiving by construction. This is NOT a streak: no
 *               chain to break, nothing resets, nothing nags. The founder's streak ban stands.
 *
 * Pure & I/O-free, derived ENTIRELY from saved strength sessions — nothing is
 * persisted, nothing touches the engine, always retroactively correct. Rejected
 * forever (founder): bodyweight-relative standards, e1RM marks, daily streaks.
 */

// 

import type { Profile, Session } from '@/data/local/models';
import { exerciseById } from '@/data/exercises';
import { modelledStartingWeight, type LoadProfile } from '@/domain/startingLoad';
import { currentWeekOpen } from '@/domain/weekCadence';
import { isEvidenceSet } from '@/domain/setEvidence';

export type MilestoneFamily = 'count' | 'tonnage' | 'club' | 'engine' | 'weeks';

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

/** Distinct training weeks. Starts at 4 — a month of showing up; ends at two years of it. */
export const WEEKS_THRESHOLDS = [4, 12, 26, 52, 104] as const;

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

/* ═══════════════ THE CLUBS — a landmark load, for THIS athlete (founder 2026-07-13) ═══════════════
 *
 * "Why not adapt the loads that open a milestone to what we know from onboarding? We know the
 * experience, the weight, the height, the sex, the frequency. We already start their programme from
 * their group's numbers — derive the marks from them too."
 *
 * The old ladder was one table for everyone: bench 60/100/140/180, overhead 40/60/80/100. For a
 * 60 kg beginner those are not marks, they are a locked door — the club family simply never fired,
 * and the lifts it named (bench, overhead, row) were three-fifths upper body, which is not what a
 * woman's training is about.
 *
 * Now the ladder is built per athlete, from two ingredients:
 *
 *  1 · WHICH LIFTS carry clubs — by sex. Women get four lower-body clubs (hip thrust, squat,
 *      deadlift, RDL) and one upper (bench); men get the five classics plus the hip thrust, because
 *      the posterior chain is not a women's subject.
 *  2 · WHICH RUNGS on those lifts — from the athlete's cold-start load, the SAME number the engine
 *      put on the bar on day one (domain/startingLoad: sex × bodyweight, B-1 — experience and age
 *      were struck from the cold start by the register and are no longer inputs here either). The
 *      rungs are the multiples 1.2× / 1.5× / 2× / 2.5× / 3× of that start, snapped to the nearest
 *      round, plate-friendly load. So a club is always a real number a human would say out loud
 *      ("80 kg squat") AND always a genuine step up from where THIS athlete began.
 *
 * The anchor is the bodyweight at ONBOARDING (`startWeightKg`), never the current one: a ladder that
 * moved every time an athlete edited their weight could take back a mark they had already earned.
 * The rungs are set once, when Hush meets them, and stand.
 */

/** Round, plate-friendly loads (total kg incl. the 20 kg bar) a club may be struck at. */
const CLUB_GRID: Readonly<Record<string, readonly number[]>> = {
  bb_back_squat: [30, 40, 50, 60, 80, 100, 120, 140, 160, 180, 200, 220],
  bb_deadlift: [40, 50, 60, 80, 100, 120, 140, 160, 180, 200, 220, 260],
  hip_thrust: [30, 40, 50, 60, 80, 100, 120, 140, 160, 180, 200],
  bb_rdl: [30, 40, 50, 60, 80, 100, 120, 140, 160, 180],
  bb_bench_press: [30, 40, 50, 60, 80, 100, 120, 140, 160, 180],
  bb_overhead_press: [20, 30, 40, 50, 60, 70, 80, 90, 100],
  bb_row: [30, 40, 50, 60, 80, 100, 120, 140, 160],
};

/** Which lifts carry a club, by sex — the lower body leads for women (founder 2026-07-13). */
const CLUB_LIFTS: Readonly<Record<'male' | 'female', readonly string[]>> = {
  female: ['hip_thrust', 'bb_back_squat', 'bb_deadlift', 'bb_rdl', 'bb_bench_press'],
  male: ['bb_back_squat', 'bb_deadlift', 'bb_bench_press', 'bb_overhead_press', 'bb_row', 'hip_thrust'],
};

/** A club ladder is the athlete's start, multiplied. Five rungs — the last is a career. */
const CLUB_MULTIPLES = [1.2, 1.5, 2, 2.5, 3] as const;

/** The profile the ladders are cut from — the two facts the cold start reads (B-1), plus the
 *  onboarding-bodyweight anchor. (`experience`/`age` were in this Pick as v4 leftovers; nothing
 *  here ever read them, and the register strikes both from every load path.) */
export type MilestoneProfile = Pick<Profile, 'sex' | 'weightKg' | 'startWeightKg'>;

/** Sensible stranger: an athlete we know nothing about is started like the median man. */
const DEFAULT_PROFILE: MilestoneProfile = { sex: 'male', weightKg: 75 };

export type ClubLadders = Readonly<Record<string, readonly number[]>>;

/**
 * The athlete's club ladders — the ONE input every club calculation below takes. Derived, never
 * stored: same profile in, same ladders out, on any device, forever.
 */
export function clubLadders(profile?: MilestoneProfile | null): ClubLadders {
  const p = profile ?? DEFAULT_PROFILE;
  // The bodyweight Hush met them at (see the header) — the current one only when there is no
  // record of the original (every profile written before this existed).
  const anchorProfile: LoadProfile = { ...p, weightKg: p.startWeightKg ?? p.weightKg };
  const out: Record<string, number[]> = {};

  for (const exId of CLUB_LIFTS[p.sex === 'female' ? 'female' : 'male']) {
    const ex = exerciseById(exId);
    const grid = CLUB_GRID[exId];
    if (!ex || !grid) continue;
    const anchor = modelledStartingWeight(ex, anchorProfile);
    if (anchor == null) continue;

    const rungs: number[] = [];
    for (const mult of CLUB_MULTIPLES) {
      const target = anchor * mult;
      // The nearest round load to the target — then forced to be a real step: above the start,
      // and above the rung before it (two multiples can land on the same plate).
      const floor = Math.max(anchor, rungs[rungs.length - 1] ?? 0);
      const next = nearestRung(grid, target, floor);
      if (next == null) break; // the grid is exhausted — this athlete's ladder is shorter, and honest
      rungs.push(next);
    }
    if (rungs.length) out[exId] = rungs;
  }
  return out;
}

/** The grid value closest to `target` among those strictly above `floor` (null when none remain). */
function nearestRung(grid: readonly number[], target: number, floor: number): number | null {
  let best: number | null = null;
  for (const rung of grid) {
    if (rung <= floor) continue;
    if (best == null || Math.abs(rung - target) < Math.abs(best - target)) best = rung;
  }
  return best;
}

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

/**
 * Kilos she moved — EVIDENCE sets only (`domain/setEvidence`, 2026-09-07). A presumed set is the
 * prescription copied across, and a tonnage club struck on numbers she may never have lifted is a
 * milestone she would not believe. The same predicate excludes the warm-up bridge, the line every
 * other tonnage reader in the product (`sessionMetrics`, the poster, the Log) already drew — this
 * was the one reader still counting the road as the work.
 */
const sessionTonnage = (s: Session): number =>
  s.sets.reduce((sum, x) => sum + (isEvidenceSet(x) ? (x.actualWeight ?? 0) * x.actualReps : 0), 0);

// ─────────────────────────── derivation ───────────────────────────

/**
 * Every milestone the athlete has earned, in the order they were earned.
 * Order-agnostic over the input (sorted internally).
 */
export function earnedMilestones(sessions: Session[], profile?: MilestoneProfile | null): EarnedMilestone[] {
  const hist = chronological(sessions);
  const ladders = clubLadders(profile);
  const out: EarnedMilestone[] = [];
  const earn = (m: Milestone, s: Session) => out.push({ ...m, earnedAt: s.startedAt, sessionId: s.id });

  let count = 0;
  let tonnage = 0;
  let countIdx = 0; // next unearned index into COUNT_THRESHOLDS
  let tonnageIdx = 0;
  let weeksIdx = 0; // next unearned index into WEEKS_THRESHOLDS
  const weekBuckets = new Set<number>(); // distinct training-week buckets seen so far
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
      // weeks — distinct training-week buckets (the same Sat-20:30 boundary the whole product
      // keeps, `weekCadence`). Any whole workout claims its week; a second one changes nothing.
      const at = Date.parse(s.startedAt);
      if (Number.isFinite(at)) {
        weekBuckets.add(currentWeekOpen(at));
        while (weeksIdx < WEEKS_THRESHOLDS.length && weekBuckets.size >= WEEKS_THRESHOLDS[weeksIdx]) {
          earn({ id: `weeks_${WEEKS_THRESHOLDS[weeksIdx]}`, family: 'weeks', value: WEEKS_THRESHOLDS[weeksIdx] }, s);
          weeksIdx += 1;
        }
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
      // A club is struck on a set she stood behind — never on one the clock wrote for her.
      if (x.actualWeight != null && x.actualReps >= 1 && isEvidenceSet(x)) {
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
      const ladder = ladders[exId];
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
export function newlyEarned(sessions: Session[], profile?: MilestoneProfile | null): EarnedMilestone[] {
  const hist = chronological(sessions);
  if (hist.length === 0) return [];
  const latest = hist[hist.length - 1];
  return earnedMilestones(hist, profile)
    .filter((m) => m.sessionId === latest.id)
    .sort((a, b) => rankOf(b) - rankOf(a) || (b.value ?? 0) - (a.value ?? 0));
}

/**
 * The gallery's locked silhouettes: each family's SINGLE next mark with live
 * progress ("140 kg · 12 kg to go"). Only the next — mystery + direction, never
 * the whole ladder. For clubs, the nearest club across the five lifts the
 * athlete actually trains (highest progress ratio).
 */
export function nextUp(sessions: Session[], profile?: MilestoneProfile | null): NextMilestone[] {
  const hist = chronological(sessions);
  const earned = new Set(earnedMilestones(hist, profile).map((m) => m.id));
  const ladders = clubLadders(profile);
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

  // weeks — the same bucket rule the earning loop keeps.
  const weeks = new Set(
    hist.filter(countsAsWorkout).map((s) => Date.parse(s.startedAt)).filter(Number.isFinite).map((at) => currentWeekOpen(at)),
  ).size;
  const nextWeeks = WEEKS_THRESHOLDS.find((n) => !earned.has(`weeks_${n}`));
  if (nextWeeks != null) {
    out.push({ milestone: { id: `weeks_${nextWeeks}`, family: 'weeks', value: nextWeeks }, current: weeks, target: nextWeeks });
  }

  // nearest club: all-time peak per club lift → the closest un-earned rung
  let bestClub: NextMilestone | null = null;
  for (const [exId, ladder] of Object.entries(ladders)) {
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
