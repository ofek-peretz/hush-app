/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT HER WEEK COULD NOT DO, IN ONE SENTENCE — for the screen she opens every morning.
 *
 * ⛔ FOUNDER, 2026-08-12: the second of the three things that would actually improve her product —
 * *"שני הדגלים החדשים מודפסים במקום אחד."*
 *
 * The engine has known these facts for a long time and told nobody but telemetry:
 *
 *   · `overBudget`       a day it could not fit into her minutes (S-3, stamped since 2026-07-21 and
 *                        read by NOTHING until the pre-workout card learned it)
 *   · `shortOfBudget`    a day her map could not fill (added 2026-08-12)
 *   · `unavoidable`      a muscle no arrangement could bring to the effective dose — a two-day week
 *                        delivers about 49 working sets and nine muscles need 54
 *
 * All three are the same promise: the engine says what it could not do, rather than letting her find
 * out by training a 35-minute session on a day she set an hour aside for.
 *
 * ── ⚠️ ONE SENTENCE, AND ONLY THE MOST IMPORTANT ONE ────────────────────────────────────────────
 * Today is not a report. Three notices stacked on the screen she reads at 6am is the nagging the
 * brief bans, and a surface that says three things says none of them. So they are RANKED and one is
 * chosen — the one whose remedy she would act on first.
 *
 * ⚠️ AND EVERY ONE OF THEM CARRIES THE REMEDY, which is hers: a day more, a muscle off, or fewer
 * minutes. A notice that only names a shortfall is a complaint.
 *
 * Pure and I/O-free. Returns a key and params; the copy layer owns the words.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { weekFindings, unavoidable, type WeekInputs } from '@/domain/weekQuality';
import { SESSION_MIN } from '@/engine/v5/constants';
import type { Program } from '@/data/local/models';

export interface WeekNotice {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * The one thing the engine could not do this week, or null when it managed everything.
 *
 * @param budgetMin her declared minutes, for the sentence about a day that ran past them.
 */
export function weekNotice(
  program: Program | null | undefined,
  inputs: WeekInputs = {},
  budgetMin?: number,
): WeekNotice | null {
  if (!program) return null;
  const days = program.days.filter((d) => !d.isRest && d.slots.length > 0);

  /*
   * ⛔ THE ORDER IS THE RANKING, AND IT IS BY WHAT SHE WOULD ACT ON.
   *
   * 1 · A DAY THAT DOES NOT FIT is the only one that costs her something today — she will run out of
   *     time mid-session — so it leads even though it is the rarest.
   */
  const over = days.find((d) => d.overBudget);
  if (over) return { key: 'weekNotice.over', params: { day: over.name, budget: budgetMin ?? SESSION_MIN } };

  /*
   * 2 · A MUSCLE THAT CANNOT REACH THE DOSE outranks a short session, because it is about whether
   *     her training WORKS rather than how long it takes. `unavoidable` is the engine saying no
   *     arrangement could have done better — an avoidable one is a defect and belongs in a test, not
   *     on her screen.
   */
  const thin = unavoidable(weekFindings(program, inputs)).filter((f) => f.rule === 'under_dose');
  if (thin.length > 0) {
    return {
      key: thin.length === 1 ? 'weekNotice.thinOne' : 'weekNotice.thinMany',
      params: { muscle: thin[0].subject, count: thin.length, floor: thin[0].limit },
    };
  }

  /*
   * 3 · AND A SHORT SESSION LAST. It is the mildest of the three — she gets her training and simply
   *     finishes early — but it is still a promise the week did not keep.
   */
  const short = days.filter((d) => d.shortOfBudget);
  if (short.length > 0) {
    return {
      key: short.length === 1 ? 'weekNotice.shortOne' : 'weekNotice.shortMany',
      params: { day: short[0].name, count: short.length, floor: SESSION_MIN },
    };
  }

  return null;
}
