/**
 * Milestone presentation copy — maps a domain milestone to the emblem's engraved
 * face (value + caption) and its one factual line (title + optional sub). Copy
 * only; all thresholds and earning logic live in domain/milestones.
 *
 * Voice rules: facts, never praise ("100 workouts." — not "amazing!"). Exercise
 * names stay English inside Hebrew copy (RTL law) via a BiDi isolate.
 */

// 

import type { Milestone } from '@/domain/milestones';
import type { Units } from '@/data/local/models';
import type { MilestoneGlyphName } from '@/components/MilestoneGlyph';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { bidi } from '@/i18n/bidi';

export type Translate = (key: string, params?: Record<string, unknown>) => string;

export interface MilestoneCopy {
  value: string; // the emblem's engraved figure
  caption?: string; // tiny engraved unit under the figure
  title: string;
  /**
   * ⚠️ WHAT THE MARK IS, WHERE THE EMBLEM DOES NOT ALREADY SAY IT (2026-08-27).
   *
   * `title` became a statement on the day `count` and `weeks` stopped repeating their own emblem —
   * `המשכת להגיע.` over `10 / אימונים`. Right at the moment it lands, and WRONG anywhere the
   * mark is merely LISTED: the progress wall draws the next, unearned seal with a caption under it,
   * and a locked mark cannot be congratulated in the past tense.
   *
   * ⚠️ AND THE FIRST ANSWER OVERCORRECTED. Giving `count` a name of `25 אימונים` put it under an
   * emblem already reading `25 / אימונים` — the same duplication, pointing the other way. A
   * counting mark IS its emblem; there is nothing left to caption.
   *
   * So `name` is set only where the mark is more than its figure: the LIFT behind a club, the OBJECT
   * behind a tonnage, the EVENT behind an engine mark. Absent for `count` and `weeks`, and a caller
   * showing a locked mark draws nothing rather than falling back to the celebration.
   */
  name?: string;
  sub?: string;
  /** The motif struck in the middle of the medallion — what the mark MEANS (founder 2026-07-12). */
  glyph: MilestoneGlyphName;
}

/** Barbell plate-ladder rungs (total kg incl. the 20 kg bar) that carry a club name. */
const PLATE_RUNGS = new Set([60, 100, 140, 180, 220, 260]);

/**
 * Tonnage → the real-world object the copy already names. The badge shows it.
 * (5,000 t names no object — it is the one rung that is pure quantity, so it engraves
 * a loaded bar instead: what five thousand tonnes actually looks like.)
 */
const TONNAGE_GLYPH: Record<number, MilestoneGlyphName> = {
  250_000: 'liberty',
  500_000: 'a380',
  1_000_000: 'train',
  2_500_000: 'warship',
  5_000_000: 'plates',
  10_000_000: 'eiffel',
};

/** Club → the lift, in silhouette. Two 60 kg clubs must never strike the same badge. */
const CLUB_GLYPH: Record<string, MilestoneGlyphName> = {
  bb_back_squat: 'squat',
  bb_deadlift: 'deadlift',
  bb_bench_press: 'bench',
  bb_overhead_press: 'overhead',
  bb_row: 'row',
  hip_thrust: 'hipThrust',
  bb_rdl: 'rdl',
};

export function milestoneCopy(m: Milestone, t: Translate, units: Units): MilestoneCopy {
  switch (m.family) {
    /*
     * ════ ⛔ THE HEADLINE WAS SAYING WHAT THE SEAL HAD JUST SAID (2026-08-27) ════
     *
     * `count` and `weeks` are the two commonest marks, and both drew the emblem `10 / אימונים` and
     * then a headline reading `10 אימונים.` — **the same two words, 40 points apart, in serif at
     * 40 points.** On the one moment the app is licensed to be loud, the loudest line on the screen
     * added nothing to the mark above it. In English identically: `10 / Workouts`, `10 workouts.`
     *
     * ⚠️ AND THE GALLERY HAD BEEN HIDING IT. `2.6b`'s fixture passed a hand-written
     * *"Ten workouts. You kept coming."* — a sentence that is not in the product. So the entry that
     * exists to review this beat showed a better screen than the one that ships, and the mock was
     * right about what the beat needs: the count is the SEAL's job, and the title's job is to say
     * what the count MEANS.
     *
     * The other two families already worked this way — `הכפלת.` over "twice your starting load",
     * `ההעלאה הראשונה.` over "earned, not scheduled" — and so did `tonnage`, whose `sub`
     * restates the figure IN A SENTENCE. These two are brought onto the same shape: a statement
     * above, the figure in a sentence below.
     */
    case 'count':
      return {
        value: String(m.value),
        caption: t('milestones.workoutsCaption'),
        title: t('milestones.countTitle'),
        sub: t('milestones.countSub', { n: m.value }),
        glyph: 'tally',
      };
    case 'tonnage': {
      const tons = Math.round((m.value ?? 0) / 1000).toLocaleString();
      return {
        value: tons,
        caption: t('milestones.tonnesCaption'),
        title: t(`milestones.tonnageName_${m.value}`),
        /* The object is the mark — `250 / טון` does not say what that looks like. */
        name: t(`milestones.tonnageName_${m.value}`),
        sub: t('milestones.tonnageSub', { tons }),
        glyph: TONNAGE_GLYPH[m.value ?? 0] ?? 'plates',
      };
    }
    case 'club': {
      const weight = displayWeight(m.value ?? 0, units) ?? 0;
      return {
        value: String(weight),
        caption: unitLabel(units),
        title: t('milestones.clubTitle', {
          weight,
          unit: unitLabel(units),
          exercise: bidi(exerciseDisplayName(m.exerciseId)),
        }),
        /* The lift is the mark here — an emblem reading `60 / KG` does not say which bar. */
        name: t('milestones.clubTitle', {
          weight,
          unit: unitLabel(units),
          exercise: bidi(exerciseDisplayName(m.exerciseId)),
        }),
        sub: m.value != null && PLATE_RUNGS.has(m.value) ? t(`milestones.club_${m.value}`) : undefined,
        glyph: CLUB_GLYPH[m.exerciseId ?? ''] ?? 'plates',
      };
    }
    case 'weeks':
      /* The same shape as `count` — see the note there. */
      return {
        value: String(m.value),
        caption: t('milestones.weeksCaption'),
        title: t('milestones.weeksTitle'),
        sub: t('milestones.weeksSub', { n: m.value }),
        glyph: 'weeks',
      };
    case 'engine':
      if (m.id === 'engine_first_raise') {
        // No figure at all: the mark is not a number, it is an event. The glyph — a load
        // rising off the bar — says the whole thing (founder 2026-07-12: the old "+" in a
        // circle read as a medical cross).
        /* No figure at all, so the name carries the whole mark. */
        return { value: '', title: t('milestones.firstRaiseTitle'), name: t('milestones.firstRaiseTitle'), sub: t('milestones.firstRaiseSub'), glyph: 'raise' };
      }
      return {
        value: '×2',
        title: t('milestones.doubledTitle'),
        name: t('milestones.doubledTitle'),
        sub: t('milestones.doubledSub', { exercise: bidi(exerciseDisplayName(m.exerciseId)) }),
        glyph: 'doubled',
      };
  }
}
