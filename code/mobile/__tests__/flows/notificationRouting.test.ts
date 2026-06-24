/**
 * Notification tap routing (audit defect 1).
 *
 * A tapped notification must map to the right intent so Root can deep-link it to
 * Program / Weekly Update (1.20) or QuarterlyReport. Unknown payloads are a no-op.
 * (The Portrait threshold alert was removed; its routing + durable state are gone.)
 */
import { intentFromNotificationData } from '@/platform/notifications';

describe('intentFromNotificationData (pure routing map)', () => {
  it('maps the weekly note payload → Program/Weekly Update intent', () => {
    expect(intentFromNotificationData({ intent: 'weekly_program_ready' })).toEqual({
      kind: 'weekly_program_ready',
    });
  });

  it('maps the quarterly payload → QuarterlyReport intent', () => {
    expect(intentFromNotificationData({ intent: 'quarterly_report' })).toEqual({
      kind: 'quarterly_report',
    });
  });

  it('is a safe no-op for unknown / missing payloads (no mis-route)', () => {
    expect(intentFromNotificationData({ intent: 'something_else' })).toBeNull();
    expect(intentFromNotificationData({})).toBeNull();
    expect(intentFromNotificationData(null)).toBeNull();
    expect(intentFromNotificationData(undefined)).toBeNull();
  });
});
