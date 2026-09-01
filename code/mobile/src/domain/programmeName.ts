/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT HER WEEK IS CALLED — decided from the week itself, not asked for.
 *
 * ⛔ FOUNDER, 2026-08-10, choosing option (b): a deterministic name from the SHAPE, over no name at
 * all and over keeping one AI call alive just to produce a title.
 *
 * The coach used to name the programme, and that title was the answer to his own complaint about the
 * build before it — *"he gave me the feeling of yet another banal, un-personalised programme."* Take
 * the coach out and `Program` has nowhere to carry a name: it is `{ id, frequency, days }`, and the
 * assembler names DAYS ("Upper A", "Lower B", "Full Body A"), never the week.
 *
 * ── WHY A TABLE BEATS A SENTENCE FROM A MODEL ───────────────────────────────────────────────────
 * A generated title is a network round trip on the critical path for a cosmetic string, it differs
 * between two athletes with identical weeks, and it cannot be reviewed before it ships. This reads
 * the two facts that actually made her week HERS — how it splits, and what she asked to lead with —
 * and says them. It is instant, offline, identical for identical inputs, and a human can read every
 * name it can ever produce.
 *
 * ⚠️ AND IT NEVER INVENTS A CLAIM. The name states the split and her emphasis. It does not promise a
 * goal, a timeline or a result, because nothing here knows any of those — the register's rule that a
 * surface may not state what it cannot measure applies to a title as much as to a number.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { MuscleStance, ProgramDay } from '@/data/local/models';

/** How the week divides. `full` is every day a whole body; `split` is upper/lower alternating. */
export type WeekShape = 'full' | 'split';

export interface ProgrammeName {
  /** i18n key for the shape half — `plan.shapeFull` / `plan.shapeSplit`. */
  key: string;
  /** Muscles she asked to lead with, in canonical order. Empty when she marked none. */
  led: string[];
  /** Days a week, for the copy that states it. */
  days: number;
}

/**
 * The week's shape, read off the day names the assembler produced.
 *
 * ⚠️ READ FROM THE DAYS, NOT FROM `daysPerWeek`. The assembler decides the split from where the
 * volume actually fell — at three days or fewer every day is a whole body (FULL_BODY_UNTIL_DAYS), and
 * a map with a whole region turned off can produce a full-body week at any frequency. A name derived
 * from the frequency alone would confidently mislabel exactly those athletes.
 */
export function weekShape(days: ProgramDay[]): WeekShape {
  const work = days.filter((d) => !d.isRest);
  if (work.length === 0) return 'full';
  return work.every((d) => d.name.startsWith('Full Body')) ? 'full' : 'split';
}

/**
 * Name the week from what it is and what she asked for.
 *
 * Returns the parts rather than a string: the app is bilingual and Hebrew conjugates, so the sentence
 * is assembled in the copy layer where the gender and the plural rules live. A domain module that
 * returned English prose would be a second copy layer nobody translates.
 */
export function programmeName(
  days: ProgramDay[],
  bodyMap: Record<string, MuscleStance> | undefined,
  canonicalOrder: readonly string[],
): ProgrammeName {
  const led = canonicalOrder.filter((m) => bodyMap?.[m] === 'emphasis');
  return {
    key: weekShape(days) === 'full' ? 'plan.shapeFull' : 'plan.shapeSplit',
    led,
    days: days.filter((d) => !d.isRest).length,
  };
}
