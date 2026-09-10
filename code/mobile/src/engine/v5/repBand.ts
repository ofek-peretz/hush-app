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
/**
 * ⛔ 8–12, NOT 8–10 (2026-09-10, measured). A two-rep band is narrower than one equipment rung is
 * worth (a 2.5 kg rung on a 42 kg bar is ~2 reps) and narrower than the fatigue across four sets
 * (~2.4 reps), so no single load could put a whole lift inside it — the board sat at 38% in band for
 * a month with set 1 over and set 4 under from the same correct number. Four reps is the band
 * hypertrophy is actually coached in, and on the board it is worth 47.9% → 63.5% in band on its own.
 * 8–10 stays a choice for anyone who declared it; a written seat band (`Slot.repBand`) still wins.
 */
export const DEFAULT_REP_BAND: RepBandChoice = '8-12';

const BANDS: Record<RepBandChoice, Band> = {
  '6-8': { lo: 6, hi: 8 },
  '8-10': { lo: 8, hi: 10 },
  '8-12': { lo: 8, hi: 12 },
  '10-12': { lo: 10, hi: 12 },
  '12-15': { lo: 12, hi: 15 },
};

/**
 * Every band she may choose, in ascending order — the body-map editor's per-muscle control renders
 * exactly these (register Part 9).
 *
 * DERIVED from `BANDS` rather than declared beside it, so a band added to the engine cannot leave
 * the screen showing an older set. The declaration order above IS the order she reads.
 */
export const REP_BAND_CHOICES = Object.keys(BANDS) as readonly RepBandChoice[];

/** Her band as [Tlo, Thi]. Undefined choice → the default (never a guess). */
export function bandFor(choice: RepBandChoice | undefined): Band {
  return BANDS[choice ?? DEFAULT_REP_BAND];
}
