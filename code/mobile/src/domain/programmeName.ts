/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE WEEK IS CALLED — and why the name has to be TRUE of the week.
 *
 * ⛔ FOUNDER, 2026-09-09, on a three-day upper-body week the reveal had named "Upper / Lower":
 * *"אם הוא עושה push למשל אז צריך שזה יהיה push ולא upper. התוכנית צריכה להיות מדויקת לפי מה שקורה
 * בפועל … אם ספורטאי מגיע ומבקש תוכנית עבור האתלטיות שלו האימונים יהיו שונים בשמות. לכן אני מבקש
 * שתבדוק איך מטפלים בזה כך שזה יעבוד עבור כל מקרה."*
 *
 * The old function knew two words: "Full body" if every day was called `Full Body`, otherwise
 * "Upper / Lower". That was true of the ENGINE's weeks, which are the only weeks that existed when
 * it was written, and it became a lie the day another author appeared: a push/pull week said
 * "Upper / Lower", a footballer's power week said "Upper / Lower", a week with no lower-body day at
 * all said "Upper / Lower".
 *
 * ── THE OPTIONS, WEIGHED ────────────────────────────────────────────────────────────────────────
 *   · a better heuristic over the MUSCLES — can tell push from upper, and can never say "power
 *     week for the pitch", because that is not a fact about muscles;
 *   · the day names joined — the model's own words, but five of them do not fit on a line;
 *   · **the author names the week** — the model already names every day; asking it for the
 *     week's title costs the prompt nothing (a schema `description`, see `buildPrompt`) and is the
 *     only source that knows WHY the week is shaped as it is. The founder's own 2026-07 ruling on
 *     titles stands: specific to this athlete, never one that would fit anybody, no examples.
 *
 * So: **the author's title when there is one, and a heuristic that cannot lie when there is not.**
 * The engine names its days by the split it built; the shelves name theirs by the shelf; a week
 * she typed is hers. For all of those the name is DERIVED FROM THE LIFTS — what each day actually
 * trains — with the day names as nothing more than a hint, and every key below is a claim the week
 * can be checked against: "Upper body" is said only when no lower-body lift exists, "Push / Pull"
 * only when every day is one or the other.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import { muscleOf } from '@/data/exercises';
import type { MuscleStance, ProgramDay } from '@/data/local/models';

export type WeekShape = 'full' | 'split';

/** What one day trains, read off its lifts — never off its name. */
export type DayKind = 'push' | 'pull' | 'legs' | 'upper' | 'full' | 'other';

export interface ProgrammeName {
  /**
   * The author's own title, when the week has one (a model-written week — `Program.title`). Shown
   * as-is, ahead of `key`. Absent for the engine's weeks, the shelves and a week she typed.
   */
  title?: string;
  /** The copy key of the shape the lifts actually make. Always present, so a week is never unnamed. */
  key: string;
  led: string[];
  days: number;
}

const PUSH = new Set(['Chest', 'Shoulders', 'Triceps']);
const PULL = new Set(['Back', 'Biceps']);
const LOWER = new Set(['Quads', 'Hamstrings', 'Glutes', 'Calves']);
/* Core rides on any day and says nothing about the split — a push day with a plank is a push day. */
const NEUTRAL = new Set(['Core']);

/** Classify a day by the muscles its lifts train. Empty or core-only days are `other`. */
export function dayKind(day: ProgramDay): DayKind {
  const muscles = new Set<string>();
  for (const s of day.slots) {
    const m = muscleOf(s.exerciseId);
    if (m && !NEUTRAL.has(m)) muscles.add(m);
  }
  if (muscles.size === 0) return 'other';
  const push = [...muscles].some((m) => PUSH.has(m));
  const pull = [...muscles].some((m) => PULL.has(m));
  const lower = [...muscles].some((m) => LOWER.has(m));
  if (lower && !push && !pull) return 'legs';
  if (!lower && push && !pull) return 'push';
  if (!lower && pull && !push) return 'pull';
  if (!lower) return 'upper';
  return 'full';
}

/**
 * The shape of the whole week, as a copy key under `plan.`. Every key is a claim about the lifts:
 *
 *   shapeFull          every day trains upper AND lower
 *   shapePushPullLegs  every day is push-only, pull-only or legs-only, and all three occur
 *   shapePushPull      every day is push-only or pull-only (no lower-body day at all)
 *   shapeUpper         no lower-body lift anywhere in the week
 *   shapeLower         no upper-body lift anywhere in the week (every day is a legs day)
 *   shapeSplit         upper-body days and legs days, each pure ("Upper / Lower")
 *   shapeBodyPart      anything else — a week split by body part in a way none of the above names
 */
export function weekShapeKey(days: ProgramDay[]): string {
  const kinds: DayKind[] = days.filter((d) => !d.isRest).map(dayKind).filter((k) => k !== 'other');
  if (kinds.length === 0) return 'plan.shapeFull';
  const has = (k: DayKind) => kinds.includes(k);
  const every = (...ks: DayKind[]) => kinds.every((k) => ks.includes(k));
  if (every('full')) return 'plan.shapeFull';
  if (every('push', 'pull', 'legs') && has('push') && has('pull')) return has('legs') ? 'plan.shapePushPullLegs' : 'plan.shapePushPull';
  if (every('push', 'pull', 'upper')) return 'plan.shapeUpper';
  if (every('legs')) return 'plan.shapeLower';
  if (every('push', 'pull', 'upper', 'legs') && has('legs')) return 'plan.shapeSplit';
  return 'plan.shapeBodyPart';
}

/** Kept for the callers that only ask "is it a full-body week": true of the lifts, not the names. */
export function weekShape(days: ProgramDay[]): WeekShape {
  return weekShapeKey(days) === 'plan.shapeFull' ? 'full' : 'split';
}

export function programmeName(
  days: ProgramDay[],
  bodyMap: Record<string, MuscleStance> | undefined,
  canonicalOrder: readonly string[],
  /** The author's title, when the week carries one — `Program.title`. */
  title?: string | null,
): ProgrammeName {
  const led = canonicalOrder.filter((m) => bodyMap?.[m] === 'emphasis');
  const clean = (title ?? '').trim();
  return {
    ...(clean ? { title: clean } : {}),
    key: weekShapeKey(days),
    led,
    days: days.filter((d) => !d.isRest).length,
  };
}
