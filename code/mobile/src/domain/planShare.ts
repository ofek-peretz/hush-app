/**
 * A PLAN, SHARED (v7 11.4 / 11.5) — "the split, the lifts, the rep bands. Your weights and your
 * body data never travel with it."
 *
 * ════ THE PAYLOAD IS THE PRIVACY POLICY ════
 * This module is the only thing standing between a friendly gesture and an accidental disclosure,
 * so it is built as an ALLOW-LIST, never a redaction. `sharedPlan` constructs a new object out of
 * the four things that may travel, and there is no path by which a field added to `Program` later
 * can leak: an unlisted field is simply never read. A "strip the private bits" implementation would
 * have the opposite property, and the first new field would ship a bug nobody noticed.
 *
 * What travels: the day names, each day's muscle groups, the lift IDs, and the rep bands.
 * What NEVER travels: loads, one-rep maxes, history, bodyweight, sex, age, the body map, names,
 * anything from the engine at all. 11.5 says this in as many words on the receiving screen —
 * "your starting weights come from your body, not Dana's" — and that promise is kept HERE.
 *
 * ════ THE RECEIVER ADOPTS A SHAPE, NOT A PRESCRIPTION ════
 * An adopted plan is a set of day/lift selections. The receiver's own engine then seeds every load
 * from their own body and corrects from their first working set, exactly as it does for a plan Hush
 * built. Nothing in a payload can set a load, because no payload carries one.
 */
// @ts-nocheck

// 

import { muscleOf } from '@/data/exercises';

/** The share-format version. A receiver that does not know a version refuses the payload. */
export const PLAN_SHARE_VERSION = 1;

export interface SharedPlanDay {
  name: string;
  /** The metadata line, e.g. ["Chest", "Back", "Shoulders"]. */
  muscleGroups: string[];
  /** Catalog exercise ids, in the order the day runs them. */
  exerciseIds: string[];
}

export interface SharedPlan {
  v: number;
  /** Who shared it, for the receiving screen's one line. Optional — a plan may travel unsigned. */
  from?: string;
  /** Training days only; rest days carry nothing to adopt. */
  days: SharedPlanDay[];
  /** Her per-muscle rep bands (register Part 9) — a preference, not a measurement, so it travels. */
  repBandByMuscle?: Record<string, string>;
}

/**
 * The minimum a programme must look like for us to read a shape out of it.
 *
 * Deliberately structural rather than `CoachPlan` itself: this file is the ALLOW-LIST, and an
 * allow-list that imports the whole shape it is filtering is one refactor away from forwarding a
 * field nobody looked at.
 */
interface PlanLike {
  sessions: {
    name: string;
    blocks: { items: { ex?: string }[] }[];
  }[];
}

/**
 * Build the shareable shape. ALLOW-LIST — see the note above; do not refactor into a redaction.
 *
 * ── WHAT TRAVELS, AND WHAT DELIBERATELY DOES NOT ────────────────────────────────────────────────
 * The SHAPE of the week: the session names and the things in them, in order. Not the loads, not the
 * rounds, not the rest — those are hers, decided from what her body did, and they would be wrong on
 * anyone else's body in a way that looks authoritative.
 *
 * That was already true when this read the engine's `Program`. It matters more now: the coach's
 * plan carries her actual prescription, so a careless port would have started sharing the exact
 * numbers it was written to keep private.
 *
 * ── EVERY SHAPE, NOT JUST THE LIFTS ─────────────────────────────────────────────────────────────
 * `ex` is a catalogue lift OR a movement id, because a shared week can contain a run. Filtering to
 * lifts would share a marathon plan as its three strength sessions and quietly drop the running —
 * the same failure the wrist refuses by not offering the session at all.
 */
export function sharedPlan(
  plan: PlanLike,
  opts: { from?: string; repBandByMuscle?: Record<string, string> } = {},
): SharedPlan {
  const days: SharedPlanDay[] = [];
  for (const session of plan.sessions) {
    const exerciseIds = session.blocks
      .flatMap((b) => b.items.map((i) => i.ex))
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (exerciseIds.length === 0) continue;
    /*
     * The muscle line is READ from the catalogue rather than carried, because the coach names its
     * own sessions ("Intervals & Core") and does not state muscles. Deriving is a lookup; inventing
     * would be a claim about a week nobody made. A movement resolves to nothing and simply adds
     * none — a run is not a muscle.
     */
    const muscleGroups: string[] = [
      ...new Set(exerciseIds.map((id) => muscleOf(id)).filter((m): m is NonNullable<typeof m> => !!m)),
    ];
    days.push({ name: session.name, muscleGroups, exerciseIds });
  }
  return {
    v: PLAN_SHARE_VERSION,
    ...(opts.from ? { from: opts.from } : {}),
    days,
    ...(opts.repBandByMuscle && Object.keys(opts.repBandByMuscle).length > 0
      ? { repBandByMuscle: { ...opts.repBandByMuscle } }
      : {}),
  };
}

/** How many lifts the whole shape holds — the receiving screen's middle figure. */
export function planLiftCount(plan: SharedPlan): number {
  return plan.days.reduce((n, d) => n + d.exerciseIds.length, 0);
}

/**
 * The bands the shape carries, as one reading ("8–10", or "8–10 +2" when they differ).
 *
 * 11.5 prints ONE band figure. When every muscle agrees, that is simply the band; when they do not,
 * saying only the commonest one would be a small lie, so the count of the others rides beside it.
 */
export function planBandSummary(plan: SharedPlan): string | null {
  const bands = Object.values(plan.repBandByMuscle ?? {});
  if (bands.length === 0) return null;
  const tally = new Map<string, number>();
  for (const b of bands) tally.set(b, (tally.get(b) ?? 0) + 1);
  const [top] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const rest = bands.length - top[1];
  const shown = top[0].replace('-', '–');
  return rest > 0 ? `${shown} +${rest}` : shown;
}

/** Encode for a link. Base64 keeps it one opaque token rather than a readable query string. */
export function encodePlan(plan: SharedPlan): string {
  // `encodeURIComponent` first so non-ASCII day names survive `btoa`'s Latin-1 domain.
  return globalThis.btoa(unescape(encodeURIComponent(JSON.stringify(plan))));
}

/**
 * Decode a payload, or null.
 *
 * Null on anything unreadable, on an unknown version, and on a shape with no days — a received plan
 * that cannot be adopted must not open a screen offering to adopt it.
 */
export function decodePlan(token: string): SharedPlan | null {
  try {
    const raw = decodeURIComponent(escape(globalThis.atob(token)));
    const parsed = JSON.parse(raw) as SharedPlan;
    if (!parsed || parsed.v !== PLAN_SHARE_VERSION) return null;
    if (!Array.isArray(parsed.days) || parsed.days.length === 0) return null;
    // Re-read through the allow-list: a payload is UNTRUSTED input, and a sender who hand-crafted
    // extra fields must not have them reach anything downstream.
    const days: SharedPlanDay[] = [];
    for (const d of parsed.days) {
      if (!d || typeof d.name !== 'string' || !Array.isArray(d.exerciseIds)) return null;
      const exerciseIds = d.exerciseIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
      if (exerciseIds.length === 0) continue;
      days.push({
        name: d.name,
        muscleGroups: Array.isArray(d.muscleGroups) ? d.muscleGroups.filter((m): m is string => typeof m === 'string') : [],
        exerciseIds,
      });
    }
    if (days.length === 0) return null;
    const bands = parsed.repBandByMuscle;
    return {
      v: PLAN_SHARE_VERSION,
      ...(typeof parsed.from === 'string' && parsed.from ? { from: parsed.from } : {}),
      days,
      ...(bands && typeof bands === 'object' ? { repBandByMuscle: { ...bands } } : {}),
    };
  } catch {
    return null;
  }
}
