/**
 * Voice resolver — maps model output + current mode to the exact i18n line a
 * surface should render (or null for silence). Centralizes WHEN Hush speaks so
 * the laws (spec §5, UX §9) hold uniformly.
 *
 * Returns i18n keys + params, never raw strings — the copy lives in en.json.
 */

// 

import type { AthleteMode, SetTarget } from '@/data/local/models';
import { mayShowReason } from './modeGate';

export interface Line {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * Reason line for a set (§4.4). Shown ONLY when:
 *  - mode permits (ADVISORY), and
 *  - the model attached a reasonType (i.e. the load changed vs last comparable).
 * Otherwise null — silence on a steady set is correct (§5.2 R6).
 */
export function reasonLine(mode: AthleteMode, target: SetTarget): Line | null {
  if (!mayShowReason(mode) || !target.reasonType) return null;
  switch (target.reasonType) {
    case 'increase':
      return { key: 'workout.reasonIncrease', params: { delta: fmtDelta(target.reasonDelta) } };
    case 'decrease':
      return { key: 'workout.reasonDecrease', params: { delta: fmtDelta(target.reasonDelta) } };
  }
}

/** Whether the weight value is tappable (a Reason Sheet exists only if a reason exists, §4.3). */
export function weightHasReason(mode: AthleteMode, target: SetTarget): boolean {
  return reasonLine(mode, target) !== null;
}

function fmtDelta(delta?: number): string {
  if (delta == null) return '';
  // Unit is applied by the formatter that owns the athlete's units setting.
  return String(delta);
}
