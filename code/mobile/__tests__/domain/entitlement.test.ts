/**
 * The gate's own file, finally under test (2026-09-01, audit finding 5). `flows/subscription`
 * exercises the seam; nothing exercised the arithmetic the wall itself stands on — and the
 * expiry check below did not EXIST until the audit found a cache that never stopped saying
 * "active".
 */
import {
  FREE_SESSION_LIMIT,
  NO_ENTITLEMENT,
  entitlementNow,
  freeSessionsRemaining,
  isTrainingGated,
  type Entitlement,
} from '@/domain/entitlement';

const DAY = 24 * 60 * 60 * 1000;

const active = (expiresAt: string | null): Entitlement => ({
  active: true,
  productId: 'hush.pro.month',
  source: 'subscription',
  expiresAt,
});

describe('entitlementNow — an expired cache stops saying "active"', () => {
  const now = Date.parse('2026-09-01T12:00:00Z');

  it('an entitlement inside its period passes through untouched', () => {
    const e = active(new Date(now + 10 * DAY).toISOString());
    expect(entitlementNow(e, now)).toBe(e);
  });

  it('no expiry on record (the stub, a lifetime grant) is trusted — StoreKit is the authority', () => {
    const e = active(null);
    expect(entitlementNow(e, now)).toBe(e);
  });

  it('inside the three-day grace an offline weekend still trains', () => {
    const e = active(new Date(now - 2 * DAY).toISOString());
    expect(entitlementNow(e, now).active).toBe(true);
  });

  it('⚠️ past the grace the cache goes inactive — the bug was "indefinitely"', () => {
    const e = active(new Date(now - 4 * DAY).toISOString());
    const normalized = entitlementNow(e, now);
    expect(normalized.active).toBe(false);
    // …and everything else survives, so the Lapsed screen can still name the product and date.
    expect(normalized.productId).toBe('hush.pro.month');
    expect(normalized.expiresAt).toBe(e.expiresAt);
  });

  it('an unparseable date is left alone rather than guessed at', () => {
    const e = active('not-a-date');
    expect(entitlementNow(e, now)).toBe(e);
  });

  it('inactive input is inert regardless of dates', () => {
    expect(entitlementNow(NO_ENTITLEMENT, now)).toBe(NO_ENTITLEMENT);
  });
});

describe('the gate arithmetic', () => {
  it('entitled always unlocks, whatever the count says', () => {
    expect(isTrainingGated(999, true)).toBe(false);
  });

  it('the wall stands exactly at the limit, not one before', () => {
    expect(isTrainingGated(FREE_SESSION_LIMIT - 1, false)).toBe(false);
    expect(isTrainingGated(FREE_SESSION_LIMIT, false)).toBe(true);
  });

  it('remaining never goes negative', () => {
    expect(freeSessionsRemaining(FREE_SESSION_LIMIT + 5)).toBe(0);
  });
});

/*
 * ════ THE PRICE RESTATEMENT (2026-09-01, audit QW) ════
 * `¥8,900 / 12` used to render `¥741,67` — a thousands comma wearing a decimal's hat, plus two
 * invented decimals for a currency that has none. The rule now matches the module's own creed:
 * a price we cannot restate honestly is one we do not restate at all.
 */
describe('monthlyEquivalentLabel', () => {
  const { monthlyEquivalentLabel } = require('@/domain/pricing');

  it('a decimal price restates in its own convention', () => {
    expect(monthlyEquivalentLabel('$59.99')).toBe('$5.00');
    expect(monthlyEquivalentLabel('59,99 €')).toBe('5,00 €');
  });

  it('an integer price with no separator restates plainly', () => {
    expect(monthlyEquivalentLabel('₪419')).toBe('₪34.92');
  });

  it('⚠️ a grouping-only label refuses rather than lying', () => {
    expect(monthlyEquivalentLabel('¥8,900')).toBeNull();
    expect(monthlyEquivalentLabel('₩59,000')).toBeNull();
  });
});
