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
  /**
   * ⛔ AND EVERY SET'S LOAD BESIDE THEM (founder, 2026-08-26): *"אני עדיין לא מבין איך אתה הולך
   * להציג את החזרות והמשקלים מהאימון הקודם … כרגע אני לא רואה את זה."*
   *
   * `loadKg` above is the load she FINISHED on — the right single answer for the coach, and the
   * right one for a delta. It is the WRONG answer for a row that draws each set, because Loop 1
   * moves the load mid-exercise: printing one figure over four sets she did at two different
   * weights states something that did not happen.
   *
   * Parallel to `reps` by construction — same filter, same order, same length — so `loads[i]` is
   * always the load of `reps[i]`. `null` where the set carried none (a bodyweight lift).
   *
   * ⚠️ IT DELIBERATELY DOES NOT GO TO THE WRIST, and that is not an asymmetry left standing —
   * checked against the Swift on 2026-08-26. The watch draws last time as REP GHOSTS, one per slot
   * (`WatchScreens.setFigures` → `mirror.lastReps`), and it draws no per-set load at all. The one
   * thing it spends `lastLoadKg` on is the ↑/↓ delta against today's target (`newsKg`), where the
   * load she FINISHED at is the correct comparand — the same rule `loadNews` follows on the phone.
   * Sending `loads` would add a field with no reader and a schema to keep in step for it.
   */
  loads: (number | null)[];
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
      loads: sets.map((x) => x.actualWeight ?? null),
    };
  }
  return null;
}
