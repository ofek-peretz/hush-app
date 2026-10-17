/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ A CHANGE TO HER WEEK IS OFFERED, NEVER MADE IN SILENCE (founder-approved audit, 2026-10-17)
 *
 * The engine has always known three moments a coach would change an exercise: a lift that keeps
 * hitting the same wall (a rotation), a bodyweight lift she now does at the top of her range every set
 * (the harder variation is next), and a lift she swapped to on the floor twice running (she clearly
 * prefers it). On a week the ENGINE generated, those changes took effect at its next rebuild.
 *
 * Every athlete's week is now written by the model and sealed — the engine may not rebuild it — so
 * all three were recorded and never made, while the weekly letter still announced "I moved you to…".
 * The founder's ruling: offer it, in one tap, and never change her week behind her back. This module
 * is the offer's whole life: made when the engine wants it, kept quiet after she says no, and turned
 * into her week only by her own tap.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { Program } from '@/data/local/models';
import type { SwapOffer } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';

export type { SwapOffer };

/** Is this week one the engine may not rebuild — a week she, a coach or the model wrote? */
export function isAuthored(program: Pick<Program, 'authored'> | null | undefined): boolean {
  return (program?.authored ?? 'engine') !== 'engine';
}

/**
 * The offers with this one added. One offer per lift: a newer reason replaces an older one. An offer
 * she DECLINED for the same change is not made again — a "no" is an answer, not a delay — until the
 * engine wants a different lift for that seat.
 */
export function withOffer(list: readonly SwapOffer[] | undefined, offer: SwapOffer): SwapOffer[] {
  const all = [...(list ?? [])];
  const at = all.findIndex((o) => o.from === offer.from);
  if (at < 0) return [...all, offer];
  const prev = all[at];
  if (prev.to === offer.to && prev.declinedAt != null) return all; // she already said no to exactly this
  if (prev.to === offer.to && prev.kind === offer.kind) return all; // already standing
  all[at] = offer;
  return all;
}

/**
 * The offers she can act on now: undeclined, the replacement a real lift, and at least one day where
 * taking it would change something — a day that holds the lift and not already its replacement
 * (exactly the days `applyOffer` changes).
 */
export function liveOffers(list: readonly SwapOffer[] | undefined, program: Program | null | undefined): SwapOffer[] {
  if (!program) return [];
  const changes = (o: SwapOffer) =>
    program.days.some((d) => d.slots.some((s) => s.exerciseId === o.from) && !d.slots.some((s) => s.exerciseId === o.to));
  return (list ?? []).filter((o) => o.declinedAt == null && !!exerciseById(o.to) && changes(o));
}

/**
 * Her week with the change made — every seat of `from` becomes `to`, keeping the seat's sets, its
 * range, its superset mark and its place. The opening load is NOT carried: a weight on one lift is not
 * a weight on another, and the engine seeds the new lift from her own strength (`smartSeed`). A day
 * that already holds `to` keeps its `from`, so no day ever holds the same lift twice.
 */
export function applyOffer(program: Program, offer: Pick<SwapOffer, 'from' | 'to'>): Program {
  return {
    ...program,
    days: program.days.map((d) => {
      if (d.slots.some((s) => s.exerciseId === offer.to)) return d;
      if (!d.slots.some((s) => s.exerciseId === offer.from)) return d;
      return {
        ...d,
        slots: d.slots.map((s) => {
          if (s.exerciseId !== offer.from) return s;
          const { startLoadKg: _load, coachNote: _note, ...rest } = s as typeof s & { startLoadKg?: number; coachNote?: string };
          void _load;
          void _note;
          return { ...rest, exerciseId: offer.to };
        }),
      };
    }),
  };
}

/** Her answer "not now": the offer stays on record, declined, and is not made again for this change. */
export function declined(list: readonly SwapOffer[] | undefined, offer: Pick<SwapOffer, 'from' | 'to'>, nowMs: number): SwapOffer[] {
  return (list ?? []).map((o) => (o.from === offer.from && o.to === offer.to ? { ...o, declinedAt: nowMs } : o));
}

/** The offer is spent — she took it. */
export function withoutOffer(list: readonly SwapOffer[] | undefined, offer: Pick<SwapOffer, 'from' | 'to'>): SwapOffer[] {
  return (list ?? []).filter((o) => !(o.from === offer.from && o.to === offer.to));
}
