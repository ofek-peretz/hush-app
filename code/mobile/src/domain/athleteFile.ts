/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HER FILE — everything the engine has measured about her, COUNTED (2026-09-01, audit M5).
 *
 * `domain/whatIKnow` assembles the portrait of ONE lift; this walks her whole history and counts
 * what stands. The count is the product's honest answer to the question every subscription lives
 * or dies on — *what would I lose by leaving?* — and it is the one answer no competitor can copy,
 * because it took her months of sets to write:
 *
 *     "I hold 47 measured facts about you: your rests, your rungs, your ceilings."
 *
 * ── WHAT COUNTS AS A FACT, EXACTLY ──────────────────────────────────────────────────────────────
 * Only what the engine itself has EARNED through its own evidence gates, read through the same
 * façade the decisions use (never derived a second time):
 *
 *   · a learned REST on a lift (F-17's three samples cleared)          → 1 fact
 *   · a fitted SLOPE — her reps-per-rung trade (F-12's pairs cleared)  → 1 fact
 *   · a standing CEILING — the rail (L11 earned inside the window)     → 1 fact
 *   · her GRID on a lift — counted only past ONE rung, because a single load is an entry in a
 *     table, not knowledge of a room (the `knowsAnything` bar)         → 1 fact
 *
 * A lift she has never worked contributes nothing; day one is ZERO, and zero must render as
 * silence — a product that pads this number is teaching her not to believe it, which is the whole
 * asset gone. Every gate above already returns null rather than flatter; this only counts.
 *
 * Pure & I/O-free. Same history in, same file out, on any device, forever.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import type { Session } from '@/data/local/models';
import { liftKnowledge, knowsAnything, type LiftKnowledge } from '@/domain/whatIKnow';

export interface AthleteFileLift {
  exerciseId: string;
  knowledge: LiftKnowledge;
  /** How many of the four fact classes stand on this lift (1..4 — a lift with 0 is not listed). */
  facts: number;
}

export interface AthleteFile {
  /** Total measured facts across every lift — the headline number. */
  totalFacts: number;
  /** Lifts with anything measured, most-known first (ties broken by grid depth). */
  lifts: AthleteFileLift[];
}

const factCount = (k: LiftKnowledge): number =>
  (k.restS != null ? 1 : 0) + (k.perRung != null ? 1 : 0) + (k.ceiling != null ? 1 : 0) + (k.rungs.length > 1 ? 1 : 0);

/**
 * Walk her history and assemble the file. `bandLoFor` resolves each lift's Tlo the way the caller
 * already resolves it (per-muscle bands, Rev 7); defaulted to 8 for surfaces that only need the
 * headline, where a band's exact edge cannot change whether a rest or a slope EXISTS.
 */
export function athleteFile(history: readonly Session[], bandLoFor: (exerciseId: string) => number = () => 8): AthleteFile {
  const seen = new Set<string>();
  for (const s of history) {
    for (const log of s.sets) {
      if (!log.isApproach && log.actualReps >= 1) seen.add(log.exerciseId);
    }
  }
  const lifts: AthleteFileLift[] = [];
  for (const exerciseId of seen) {
    const knowledge = liftKnowledge(exerciseId, history, bandLoFor(exerciseId));
    if (!knowsAnything(knowledge)) continue; // one rung and nothing else — an entry, not knowledge
    const facts = factCount(knowledge);
    if (facts === 0) continue;
    lifts.push({ exerciseId, knowledge, facts });
  }
  lifts.sort((a, b) => b.facts - a.facts || b.knowledge.rungs.length - a.knowledge.rungs.length);
  return { totalFacts: lifts.reduce((n, l) => n + l.facts, 0), lifts };
}
