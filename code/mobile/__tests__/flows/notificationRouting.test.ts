/**
 * Notification tap routing (audit defect 1).
 *
 * A tapped notification must map to the right intent so Root can deep-link it. Unknown payloads
 * are a no-op — including the payloads of RETIRED kinds, which is not hypothetical: a note
 * scheduled by an older build survives the upgrade on the device and can be tapped weeks later.
 */
// @ts-nocheck

// 

import { intentFromNotificationData } from '@/platform/notifications';

describe('intentFromNotificationData (pure routing map)', () => {
  it('maps the weekly note payload → Program/Weekly Update intent', () => {
    expect(intentFromNotificationData({ intent: 'weekly_program_ready' })).toEqual({
      kind: 'weekly_program_ready',
    });
  });

  it('maps a kilometre payload → the kilometre intent (which routes nowhere, by design)', () => {
    expect(intentFromNotificationData({ intent: 'cardio_km' })).toEqual({ kind: 'cardio_km' });
  });

  it('is a safe no-op for unknown / missing payloads (no mis-route)', () => {
    expect(intentFromNotificationData({ intent: 'something_else' })).toBeNull();
    expect(intentFromNotificationData({})).toBeNull();
    expect(intentFromNotificationData(null)).toBeNull();
    expect(intentFromNotificationData(undefined)).toBeNull();
  });

  it('a RETIRED kind is a no-op, not a crash — an old note can be tapped after the upgrade', () => {
    // `quarterly_report` was retired 2026-07-29 (founder: no push but the four). A repeating note
    // scheduled by the previous build is still sitting in iOS's queue on every existing install.
    expect(intentFromNotificationData({ intent: 'quarterly_report' })).toBeNull();
  });
});
