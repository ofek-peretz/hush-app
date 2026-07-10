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
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { bidi } from '@/i18n/bidi';

export type Translate = (key: string, params?: Record<string, unknown>) => string;

export interface MilestoneCopy {
  value: string; // the emblem's engraved figure
  caption?: string; // tiny engraved unit under the figure
  title: string;
  sub?: string;
}

/** Barbell plate-ladder rungs (total kg incl. the 20 kg bar) that carry a club name. */
const PLATE_RUNGS = new Set([60, 100, 140, 180, 220, 260]);

export function milestoneCopy(m: Milestone, t: Translate, units: Units): MilestoneCopy {
  switch (m.family) {
    case 'count':
      return {
        value: String(m.value),
        caption: t('milestones.workoutsCaption'),
        title: t('milestones.countTitle', { n: m.value }),
      };
    case 'tonnage': {
      const tons = Math.round((m.value ?? 0) / 1000).toLocaleString();
      return {
        value: tons,
        caption: t('milestones.tonnesCaption'),
        title: t(`milestones.tonnageName_${m.value}`),
        sub: t('milestones.tonnageSub', { tons }),
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
      };
    }
    case 'engine':
      if (m.id === 'engine_first_raise') {
        return { value: '+', title: t('milestones.firstRaiseTitle'), sub: t('milestones.firstRaiseSub') };
      }
      return {
        value: '×2',
        title: t('milestones.doubledTitle'),
        sub: t('milestones.doubledSub', { exercise: bidi(exerciseDisplayName(m.exerciseId)) }),
      };
  }
}
