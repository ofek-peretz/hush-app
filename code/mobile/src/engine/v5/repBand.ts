/**
 * Hush Engine v5 — the athlete's rep band T (S-6). One declared fact, one onboarding question.
 *
 * The band she picks IS the target: Tlo is the target (met = reps ≥ Tlo), Thi is the "too light"
 * mark (a set above Thi → Loop 1 raises). It applies to EVERY exercise — there is no isolation floor
 * (deleted Rev 3) and no silent override. This replaces the Stage-2 provisional band.
 */

import type { Band } from './types';
import type { RepBandChoice } from '@/data/local/models';

/** Default band — the onboarding recommendation, and the fallback for older profiles. */
export const DEFAULT_REP_BAND: RepBandChoice = '8-10';

const BANDS: Record<RepBandChoice, Band> = {
  '6-8': { lo: 6, hi: 8 },
  '8-10': { lo: 8, hi: 10 },
  '10-12': { lo: 10, hi: 12 },
  '12-15': { lo: 12, hi: 15 },
};

/** Her band as [Tlo, Thi]. Undefined choice → the default (never a guess). */
export function bandFor(choice: RepBandChoice | undefined): Band {
  return BANDS[choice ?? DEFAULT_REP_BAND];
}
