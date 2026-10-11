/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ENGINE THINKS IN KILOGRAMS; A SENTENCE IS READ IN HER UNITS (sweep, 2026-10-11)
 *
 * The engine explains a change with a sentence and its numbers — "so I added {{delta}}", "I set it
 * to {{load}}" — and those numbers are kilograms, because everything the engine holds is. The copy
 * then baked the unit in as a word: "…so I added 2.3 kg." under a row that read "135 → 140 lb".
 * An athlete in pounds was told, in the one sentence that explains her week, a number she could
 * not find anywhere on the screen above it.
 *
 * The sentence now takes a `{{unit}}` and every renderer passes the engine's params through here:
 * the two numeric fields are converted with the same door every figure on the phone uses
 * (`displayWeight`), and the unit is said as a word in her language. One function, because three
 * screens draw these sentences (the Well Done ledger, the weekly letter, the why-sheet) and the
 * fault was that none of them converted.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import type { Units } from '@/data/local/models';
import { displayWeight } from '@/domain/schedule';
import { tg } from '@/i18n';

/** The params of the engine's sentences that are loads, in kilograms. */
const LOAD_PARAMS = ['delta', 'load'] as const;

export function inHerUnits(
  params: Record<string, string | number> | undefined,
  units: Units,
): Record<string, string | number> {
  const out: Record<string, string | number> = { ...(params ?? {}) };
  for (const k of LOAD_PARAMS) {
    const v = out[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = displayWeight(v, units) ?? v;
  }
  out.unit = tg(units === 'lb' ? 'common.unitLb' : 'common.unitKg');
  return out;
}
