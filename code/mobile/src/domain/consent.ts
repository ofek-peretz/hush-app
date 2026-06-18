/**
 * Consent agreement version (OD-3 / BB-33). Bump this string whenever the terms /
 * privacy agreement the athlete accepts at Enrollment materially changes — a new
 * version writes a new server-side consent record, so the ledger proves which
 * version each athlete accepted and when. Dated for unambiguous auditability.
 */
export const CONSENT_VERSION = 'v1-2026-06-17';
