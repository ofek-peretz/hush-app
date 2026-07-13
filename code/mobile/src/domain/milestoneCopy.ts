/**
 * Milestone presentation copy — maps a domain milestone to the emblem's engraved
 * face (value + caption) and its one factual line (title + optional sub). Copy
 * only; all thresholds and earning logic live in domain/milestones.
 *
 * Voice rules: facts, never praise ("100 workouts." — not "amazing!"). Exercise
 * names stay English inside Hebrew copy (RTL law) via a BiDi isolate.
 */
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
    case 'count':
      return {
        value: String(m.value),
        caption: t('milestones.workoutsCaption'),
        title: t('milestones.countTitle', { n: m.value }),
        glyph: 'tally',
      };
    case 'tonnage': {
      const tons = Math.round((m.value ?? 0) / 1000).toLocaleString();
      return {
        value: tons,
        caption: t('milestones.tonnesCaption'),
        title: t(`milestones.tonnageName_${m.value}`),
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
        sub: m.value != null && PLATE_RUNGS.has(m.value) ? t(`milestones.club_${m.value}`) : undefined,
        glyph: CLUB_GLYPH[m.exerciseId ?? ''] ?? 'plates',
      };
    }
    case 'engine':
      if (m.id === 'engine_first_raise') {
        // No figure at all: the mark is not a number, it is an event. The glyph — a load
        // rising off the bar — says the whole thing (founder 2026-07-12: the old "+" in a
        // circle read as a medical cross).
        return { value: '', title: t('milestones.firstRaiseTitle'), sub: t('milestones.firstRaiseSub'), glyph: 'raise' };
      }
      return {
        value: '×2',
        title: t('milestones.doubledTitle'),
        sub: t('milestones.doubledSub', { exercise: bidi(exerciseDisplayName(m.exerciseId)) }),
        glyph: 'doubled',
      };
  }
}
