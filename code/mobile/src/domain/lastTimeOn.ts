/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SHE DID LAST TIME ON THIS LIFT — the one number a gym app is asked for most.
 *
 * ⛔ FOUNDER, 2026-08-04, on the plan to beat the competition: *"the set screen is where she spends
 * 95% of her time — if it isn't better than Strong's, nothing else matters."*
 *
 * So I measured ours. Logging a set as prescribed is ONE tap, which matches the best loggers. What
 * ours does NOT have, and every one of them does, is the thing she came to the screen wanting:
 *
 *   **the last time she did this lift, and what she got.**
 *
 * ── WHY THIS IS NOT JUST PARITY ─────────────────────────────────────────────────────────────────
 * In a logger, last time is there because SHE is the one deciding today's weight and needs it. In
 * Hush the coach decided — so last time is the EVIDENCE for the number already on the screen. It
 * turns "34 kg" from an instruction into a conclusion she can check, at zero cost, without asking.
 *
 * That is the product's whole claim, made visible at the only moment it is load-bearing. It has been
 * one tap away in the Why sheet the entire time, and one tap is where things go to be unread.
 *
 * ── ⚠️ THE SHAPE IS THE COACH'S OWN ────────────────────────────────────────────────────────────
 * Same rules as `coachFacts.performedFrom`, deliberately: the load is the LAST one performed on the
 * lift that day (Loop 1 moves it mid-exercise, and what she finished on is what she trained at), and
 * every set's reps are kept in order. If the screen and the coach ever disagreed about "last time",
 * the athlete would be looking at one and being coached from the other.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import type { Session } from '@/data/local/models';

/** One past occurrence of a lift, as a screen needs it. */
export interface LastTime {
  /** Days before now. 0 = earlier today. */
  ago: number;
  /** What she actually lifted, in KILOGRAMS. null = bodyweight. */
  loadKg: number | null;
  /** Every set's reps, in the order she did them. */
  reps: number[];
}

/**
 * The most recent session — before the one she is in — that contains this lift.
 *
 * ⚠️ `excludeSessionId` is not optional in practice: the live session is written to history as it
 * goes, so without it "last time" becomes "the set you just did", which is both useless and wrong.
 */
export function lastTimeOn(
  exerciseId: string | null,
  history: Session[],
  opts: { nowMs?: number; excludeSessionId?: string } = {},
): LastTime | null {
  if (!exerciseId) return null;
  const nowMs = opts.nowMs ?? Date.now();
  const newestFirst = [...history].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  for (const s of newestFirst) {
    if (opts.excludeSessionId && s.id === opts.excludeSessionId) continue;
    // `isApproach` is a Rev-8 legacy flag on old records — a measurement, not a working set, and it
    // was never something she "did last time".
    const sets = s.sets.filter((x) => x.exerciseId === exerciseId && !x.isApproach);
    if (sets.length === 0) continue;
    const at = Date.parse(s.startedAt);
    return {
      ago: Number.isFinite(at) ? Math.max(0, Math.round((nowMs - at) / 86_400_000)) : 0,
      loadKg: sets[sets.length - 1].actualWeight ?? null,
      reps: sets.map((x) => x.actualReps),
    };
  }
  return null;
}
