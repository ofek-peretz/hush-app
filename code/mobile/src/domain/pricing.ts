/**
 * Pricing arithmetic for the paywall (founder 2026-07-12).
 *
 * "Best value" is a claim; "Save 50%" is the arithmetic already done. Athletes scan
 * numbers far faster than they parse words, and asking someone to compare $60/year against
 * $10/month in their head is asking them to do the one bit of work that decides the sale.
 *
 * The saving is computed from the LIVE store prices, never hardcoded — a hardcoded "50%"
 * silently becomes a lie the day pricing changes, in a place where being wrong is a legal
 * problem as well as a trust one. If the numbers cannot be recovered honestly (an unfamiliar
 * price format, a missing plan), the tag simply does not appear.
 */
import type { SubscriptionProduct } from '@/platform/billing';

/**
 * The numeric amount inside a localized price label ("$59.99", "59,99 €", "₪219.90",
 * "US$1,234.56"). Returns null when nothing unambiguous can be read.
 *
 * The hard part is the separator: 1.234,56 (de) and 1,234.56 (en) are the same number with
 * the roles of '.' and ',' swapped. The rule that resolves it: whichever separator appears
 * LAST is the decimal one — every locale puts its grouping separators before its decimal.
 */
export function parsePriceAmount(label: string): number | null {
  // Keep digits and the two possible separators; drop currency, spaces, RTL marks.
  const raw = label.replace(/[^\d.,]/g, '');
  if (!raw || !/\d/.test(raw)) return null;

  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  const decimalAt = Math.max(lastDot, lastComma);

  let normalized: string;
  if (decimalAt === -1) {
    normalized = raw; // "1299"
  } else {
    const tail = raw.slice(decimalAt + 1);
    // A trailing run of exactly three digits with no OTHER separator is grouping, not a
    // decimal: "1.234" is one thousand two hundred and thirty-four, not one-point-two-three-four.
    const onlySeparator = lastDot === -1 || lastComma === -1;
    const isGrouping = onlySeparator && tail.length === 3 && !/[.,]/.test(tail);
    normalized = isGrouping
      ? raw.replace(/[.,]/g, '')
      : `${raw.slice(0, decimalAt).replace(/[.,]/g, '')}.${tail.replace(/[.,]/g, '')}`;
  }

  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * How much the annual plan saves against paying monthly for a year, as a whole percent.
 * Null unless BOTH plans are present and both prices parse — we never guess at a saving.
 * Rounded DOWN, so the tag can never overstate the discount.
 */
export function annualSavingPct(products: readonly SubscriptionProduct[]): number | null {
  const annual = products.find((p) => p.period === 'annual');
  const monthly = products.find((p) => p.period === 'monthly');
  if (!annual || !monthly) return null;

  const a = parsePriceAmount(annual.priceLabel);
  const m = parsePriceAmount(monthly.priceLabel);
  if (a == null || m == null) return null;

  const yearAtMonthly = m * 12;
  if (yearAtMonthly <= 0 || a >= yearAtMonthly) return null; // no saving to advertise

  const pct = Math.floor(((yearAtMonthly - a) / yearAtMonthly) * 100);
  // Below 5% the tag is noise; a rounding artefact is not a value proposition.
  return pct >= 5 ? pct : null;
}
