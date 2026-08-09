/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE POSTER — what a finished workout looks like when it is worth photographing.
 *
 * ⛔ FOUNDER, 2026-08-04:
 *
 *   > *"This is the moment the athlete finishes a workout and wants to photograph it for social —
 *   > and right now our finish screen looks like a list of decisions and conclusions. It doesn't
 *   > invite anyone at all to be proud and put it on their story. I'm not saying we shouldn't give
 *   > access to the decisions if they want them, but usually after a workout people want to put the
 *   > workout screen on Instagram and go."*
 *
 * The screen at the whistle was a LEDGER: a saved mark, a closing line, three facts, and then one
 * ruled row per lift the coach moved with its reasoning underneath. Everything on it is true and
 * useful, and none of it is why she is holding up her phone.
 *
 * ── ⚠️ AND THERE IS NO SHARE BUTTON. HIS RULING, AND HE IS RIGHT ────────────────────────────────
 *   > *"Instead of SHARE we can put DONE. SHARE makes us look like we want publicity — they can
 *   > screenshot it and post it. Let's have some class: whoever wants to will screenshot and
 *   > upload. We don't need to signal to them to share it."*
 *
 * So this module makes a screen worth screenshotting and asks for nothing. A phone screen is 9:16 —
 * the exact shape of a story — and the whole poster sits above the two controls, with no back arrow
 * and no title bar over it, so a screenshot is already the picture.
 *
 * ── WHAT TAKES THE LARGEST FIGURE ───────────────────────────────────────────────────────────────
 * A record if she set one, because a personal best is the only thing more postable than a big total
 * — and `domain/shareCard` already decides what a record IS, so this asks it rather than deciding
 * again. Otherwise the TONNES she moved: the number nobody else states, which is large and grows.
 *
 * ⚠️ AND A BODYWEIGHT SESSION MOVES ZERO TONNES. Leading a poster with "0.0 t" would turn the one
 * screen meant to be proud into a report of nothing, so the hero falls through to her SET COUNT,
 * which is a real fact about a session with no load in it.
 *
 * Pure & I/O-free: same session in, same poster out, on any device, forever.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import type { Session, SetLog, Units } from '@/data/local/models';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { recordCardFromHistory } from '@/domain/shareCard';

/** One lift of the session, as the receipt prints it. */
export interface PosterLift {
  exerciseId: string;
  /** The load she FINISHED the lift on, already in her display unit. null = bodyweight. */
  load: number | null;
  unit: string;
  /** Every set's reps, in order. */
  reps: number[];
}

export type PosterHero =
  | { kind: 'record'; exerciseId: string; value: number; unit: string; reps: number; delta: number | null }
  | { kind: 'tonnes'; value: number }
  | { kind: 'sets'; value: number };

export interface SessionPoster {
  hero: PosterHero;
  /** Wall-clock minutes. */
  minutes: number;
  /** Active kilocalories, or null when her bodyweight is unknown and nothing may be guessed. */
  kcal: number | null;
  /** Tonnes moved, to one decimal. 0 on a session with no load in it. */
  tonnes: number;
  /** Every working set logged. */
  sets: number;
  lifts: PosterLift[];
}

const tonnesOf = (sets: readonly SetLog[]): number => {
  const kg = sets.reduce((sum, s) => sum + (s.actualWeight ?? 0) * s.actualReps, 0);
  return Math.round(kg / 100) / 10;
};

/**
 * The lifts, in the order she did them, each with the load she finished on.
 *
 * ⚠️ THE LOAD IS THE LAST ONE PERFORMED, not the first and not the heaviest — the same rule
 * `lastTimeOn` and `coachFacts` use. Loop 1 moves a load mid-exercise, and what she finished at is
 * what she trained at. Three surfaces reading the same fact three ways is how a receipt ends up
 * disagreeing with the coach that produced it.
 */
export function posterLifts(session: Session | null | undefined, units: Units): PosterLift[] {
  const out: PosterLift[] = [];
  const byId = new Map<string, PosterLift>();
  for (const s of session?.sets ?? []) {
    let row = byId.get(s.exerciseId);
    if (!row) {
      row = { exerciseId: s.exerciseId, load: null, unit: '', reps: [] };
      byId.set(s.exerciseId, row);
      out.push(row);
    }
    row.reps.push(s.actualReps);
    if (s.actualWeight != null) {
      row.load = displayWeight(s.actualWeight, units) ?? null;
      row.unit = unitLabel(units);
    }
  }
  return out;
}

export function sessionPoster(opts: {
  session: Session | null | undefined;
  /** Newest first, INCLUDING the session just saved — that is what `recordCardFromHistory` reads. */
  history: Session[];
  units: Units;
  durationMs: number;
  kcal: number | null;
}): SessionPoster {
  const sets = opts.session?.sets ?? [];
  const tonnes = tonnesOf(sets);
  const lifts = posterLifts(opts.session, opts.units);

  /*
   * ⚠️ THE RECORD IS ASKED FOR, NOT RE-DERIVED. `domain/shareCard` already owns what counts as an
   * all-time best (strictly the heaviest load ever logged for that lift, biggest STEP wins). A
   * second definition here would eventually disagree with the card it is named after.
   */
  const record = recordCardFromHistory(opts.history, opts.units);

  const hero: PosterHero = record
    ? { kind: 'record', exerciseId: record.exerciseId, value: record.weight, unit: record.unit, reps: record.reps, delta: record.delta }
    : tonnes > 0
      ? { kind: 'tonnes', value: tonnes }
      : { kind: 'sets', value: sets.length };

  return {
    hero,
    minutes: Math.max(0, Math.round(opts.durationMs / 60_000)),
    kcal: opts.kcal,
    tonnes,
    sets: sets.length,
    lifts,
  };
}
