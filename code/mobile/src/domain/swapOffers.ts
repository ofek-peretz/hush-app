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
import { exerciseById, engineMayAssign, WEIGHTED_FORM_OF, type EquipmentFamily } from '@/data/exercises';
import { swapCandidates } from '@/domain/swapPool';
import { graduationTarget } from '@/domain/engineChanges';
import { canLoad, type LoadProfile } from '@/domain/startingLoad';

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

/** The loaded form of a bodyweight lift — a pull-up's is the weighted pull-up (`WEIGHTED_FORM_OF`, reversed). */
const LOADED_FORM: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(WEIGHTED_FORM_OF).map(([loaded, bw]) => [bw, loaded]));

/**
 * ⛔ WHAT SHE IS OFFERED IS THE CLOSEST LIFT, NOT THE LONGEST-UNUSED ONE (the engine audit's second pass,
 * 2026-10-17). The engine's own rotation (`rotationTarget`) picks the same-MUSCLE lift she has gone
 * longest without — on a week it builds, the slot's shape is the engine's to keep. Offered over a week
 * she was handed, that read "lying leg curl → deadlift" and "cable lateral raise → shoulder press": a
 * different movement, a different week. An offer is the swap menu's own first answer (`swapCandidates`)
 * — the SAME movement, in her room, a lift she can load, not one already in her week. With no such lift
 * there is no offer: the lift backs off and re-climbs as it always did.
 *
 * A GRADUATION is the harder variation (`graduationTarget`) — and at the top of a ladder with nothing
 * harder (a pull-up, a dip), the loaded form of the same movement. Those are hers and the model's to
 * choose and never the engine's to assign (`CHOICE_ONLY_IDS`); an offer she takes IS her choice.
 */
export function offerTarget(
  from: string,
  kind: 'graduate' | 'rotate',
  program: Pick<Program, 'days'>,
  ctx: { equipment?: readonly EquipmentFamily[]; profile?: LoadProfile } = {},
): string | undefined {
  if (kind === 'graduate') return graduationTarget(from) ?? LOADED_FORM[from];
  const cur = exerciseById(from);
  if (!cur) return undefined;
  const inWeek = program.days.flatMap((d) => d.slots.map((s) => s.exerciseId));
  const same = swapCandidates(from, { sessionExerciseIds: inWeek, ...(ctx.equipment ? { equipment: ctx.equipment } : {}) })
    .filter((e) => e.pattern === cur.pattern && engineMayAssign(e.id) && !e.regression);
  return (same.find((e) => canLoad(e, ctx.profile)) ?? same[0])?.id;
}

/** Her answer "not now": the offer stays on record, declined, and is not made again for this change. */
export function declined(list: readonly SwapOffer[] | undefined, offer: Pick<SwapOffer, 'from' | 'to'>, nowMs: number): SwapOffer[] {
  return (list ?? []).map((o) => (o.from === offer.from && o.to === offer.to ? { ...o, declinedAt: nowMs } : o));
}

/** The offer is spent — she took it. */
export function withoutOffer(list: readonly SwapOffer[] | undefined, offer: Pick<SwapOffer, 'from' | 'to'>): SwapOffer[] {
  return (list ?? []).filter((o) => !(o.from === offer.from && o.to === offer.to));
}
