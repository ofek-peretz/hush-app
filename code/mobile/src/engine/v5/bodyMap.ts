/**
 * Hush Engine v5 — the body map (S-2/3/4/44/56/57). The athlete's declared stance per muscle,
 * which REPLACES the demographic split. `off` never appears; `emphasis` gets first claim on volume
 * (budget of 2, F-4); `normal` is the default for every muscle.
 *
 * Pure reads over the declared map + her logged history. No inference: a stance is a fact she stated.
 */

import type { MuscleStance, Session } from '@/data/local/models';
import { muscleOf } from '@/data/exercises';
import { EMPHASIS_BUDGET, CANONICAL_MUSCLE_ORDER, MUSCLE_REGION, FULL_BODY_UNTIL_DAYS } from './constants';

export type BodyMap = Record<string, MuscleStance>;

/** The stance for a muscle, defaulting to 'normal' (parity-preserving) when unset. */
export function stanceOf(map: BodyMap | undefined, muscle: string): MuscleStance {
  return map?.[muscle] ?? 'normal';
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ WHETHER A SECOND MARK CAN BE HONOURED AT ALL — one home, both screens, and the engine.
 *
 * FOUNDER, 2026-08-11, after ten engine attempts on the same defect were measured and reverted.
 *
 * F-4 lets her mark two muscles. Measured across every legal pair — 8 pairs × 5 frequencies × both
 * sexes — two marks are honoured PERFECTLY whenever they do not compete for the same sessions, and
 * cannot be honoured when they do:
 *
 *     4, 5, 6 days · marks on DIFFERENT regions .... 36 marks, ZERO lowered
 *     4, 5, 6 days · marks on the SAME region ....... 3 lowered
 *     3 days or fewer (every session is full-body) .. 3 lowered — no two marks can be separated
 *
 * ── WHY THIS IS A RULE AND NOT A BUG ───────────────────────────────────────────────────────────
 * Two ratified laws collide under a fixed hour, and only when two marks share a region:
 *
 *     S-4 / S-63    a mark earns MORE EXERCISES for the muscle it is placed on
 *     S-64          the session is 45–60 minutes, so a region holds `days × 7` lifts and no more
 *
 * One mark fits inside that. Two competing for the same sessions do not — the surplus is deleted by
 * `enforceTimeCap` on the way to the screen, unevenly, and a mark could end up LOWERING the muscle
 * it was placed on (Chest 15 → 10 weekly sets; Glutes 21 → 15). Ten fixes were written across five
 * layers — selection, dealing, trimming, the catalogue, and volume — and each one bought two
 * same-region marks by breaking single marks everywhere else. The record is on the pin in
 * `theWeekIsBalanced`.
 *
 * ⚠️ SO THIS IS NOT A WORKAROUND. It is the honest statement of a real coaching constraint: she can
 * lead with one thing per half of her body, and a coach would tell her that in words rather than
 * take the tap and quietly hand back less. Measured over all 810 configurations, the rule leaves ONE
 * failure (a single mark at three days, off by one set — a remainder of the transfer's five-set
 * block) and makes the other twenty-five unreachable.
 *
 * ⚠️ AND IT NEVER TAKES A MARK SHE ALREADY HAS. It only refuses a NEW one, so a map she drew before
 * this rule existed keeps every stance she chose (`validateMap` reports, it does not rewrite).
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function regionOfMuscle(muscle: string): 'upper' | 'lower' {
  return MUSCLE_REGION[muscle] ?? 'upper';
}

export type MarkRefusal = 'budget' | 'same_region' | 'full_body_week';

/**
 * Whether `muscle` may be marked `emphasis`, given the marks already placed and the days she trains.
 * `null` = allowed. `days` omitted (older callers, map-only tests) → only the F-4 budget applies.
 */
export function emphasisRefusal(
  map: BodyMap | undefined,
  muscle: string,
  allMuscles: readonly string[],
  days?: number,
): MarkRefusal | null {
  if (stanceOf(map, muscle) === 'emphasis') return null; // already marked — nothing to refuse
  const marks = emphasisMuscles(map, allMuscles);
  if (marks.length >= EMPHASIS_BUDGET) return 'budget'; // F-4, unchanged
  if (days == null || marks.length === 0) return null;
  // Below the split, every session trains the whole body, so a second mark ALWAYS competes.
  if (days <= FULL_BODY_UNTIL_DAYS) return 'full_body_week';
  if (marks.some((m) => regionOfMuscle(m) === regionOfMuscle(muscle))) return 'same_region';
  return null;
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ HOW MANY LEADS HER WEEK CAN ACTUALLY HONOUR (founder, 2026-08-12)
 *
 *   *"אני מנסה לשים 2 שרירים על EMPHASIS וזה נותן לי רק על אחד משום מה."*
 *
 * It is not a bug: he was on THREE days, and `emphasisRefusal` refuses a second mark below the
 * split because every session trains the whole body there, so two leads always compete.
 *
 * ⚠️ THE DEFECT IS THAT THE SCREEN PROMISED TWO. The standing line reads *"I lead with two muscles
 * — 0 of 2 chosen"* on a week that can honour exactly one, so the rule looked like a fault and the
 * refusal looked like a glitch. **A budget that the copy and the guard disagree about is a budget
 * the athlete has to discover by being refused.**
 *
 * One function, asked by both, so they cannot drift.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function emphasisBudgetFor(days?: number): number {
  return days != null && days <= FULL_BODY_UNTIL_DAYS ? 1 : EMPHASIS_BUDGET;
}

/** Muscles she has NOT turned off — the ones the programme may train. */
export function trainableMuscles(map: BodyMap | undefined, allMuscles: readonly string[]): string[] {
  return allMuscles.filter((m) => stanceOf(map, m) !== 'off');
}

/** The emphasised muscles (first claim on volume; guaranteed ≥1 exercise, S-63). */
export function emphasisMuscles(map: BodyMap | undefined, allMuscles: readonly string[]): string[] {
  return allMuscles.filter((m) => stanceOf(map, m) === 'emphasis');
}

/**
 * Is the map buildable? False when nothing is left on to build a workout from (S-3) or when she
 * exceeded the emphasis budget (F-4 — the UI should prevent this, but the engine refuses it too).
 */
export function validateMap(map: BodyMap | undefined, allMuscles: readonly string[]): { ok: boolean; reason?: 'nothing_on' | 'too_many_emphasis' } {
  if (emphasisMuscles(map, allMuscles).length > EMPHASIS_BUDGET) return { ok: false, reason: 'too_many_emphasis' };
  if (trainableMuscles(map, allMuscles).length === 0) return { ok: false, reason: 'nothing_on' };
  return { ok: true };
}

/**
 * S-56 — should Hush ever come back about a switched-off muscle ("want it back?")? Only when she
 * has actually TRAINED it (a logged set exists) — a change of state, not a statement of taste. A
 * muscle turned off during onboarding, or crowded out and never trained, has no history → never ask
 * (that would be nagging, L8). The trigger is a fact: "does she have a logged set on this muscle?"
 *
 * WHERE the question lives is the register's call, verbatim: "Once — and once only — Hush comes
 * back… The question is asked once, at the Saturday mirror, and never counted in days." So the map
 * editor obeys an OFF in SILENCE (L8 — the engine never argues with a choice she is making right
 * now), and the one question is asked later, from the weekly mirror, by `askBackMuscle` below.
 * (An earlier build asked a confirm AT the toggle — a mechanism that appears nowhere in the
 * register, replaced 2026-07-21.)
 */
export function shouldAskBackOnOff(muscleHasLoggedSet: boolean): boolean {
  return muscleHasLoggedSet;
}

/** Every muscle with at least one LOGGED set — the fact S-56 turns on (never an inference). */
export function trainedMuscles(history: Session[]): Set<string> {
  const out = new Set<string>();
  for (const s of history) for (const set of s.sets) {
    const m = muscleOf(set.exerciseId);
    if (m) out.add(m);
  }
  return out;
}

/**
 * S-56 — the muscle the Saturday mirror should ask about, or null. A candidate is OFF on the map,
 * TRAINED (a logged set exists — `shouldAskBackOnOff`), and never asked before (L4: a question is
 * asked once, never twice — `asked` holds every muscle already answered, either way). First in the
 * canonical order (F-9), so the pick is deterministic; one question at a time, never a list.
 */
export function askBackMuscle(
  map: BodyMap | undefined,
  trained: ReadonlySet<string>,
  asked: ReadonlySet<string>,
  order: readonly string[] = CANONICAL_MUSCLE_ORDER,
): string | null {
  for (const m of order) {
    if (stanceOf(map, m) !== 'off') continue;
    if (!shouldAskBackOnOff(trained.has(m))) continue;
    if (asked.has(m)) continue;
    return m;
  }
  return null;
}
