/**
 * The week-open override (2026-09-01, audit 07) — her calendar, the same clock.
 *
 * The contract: Saturday 20:30 is the default and every existing reader is untouched; a valid
 * override moves the DAY only; garbage never moves anything; and the cadence walkers agree with
 * the binding at call time (a live binding, not a frozen constant).
 */
// @ts-nocheck

//

import * as cadence from '@/domain/weekCadence';

afterEach(() => cadence.applyWeekOpenDow(6)); // restore the default between tests

describe('applyWeekOpenDow', () => {
  it('the default is Saturday, and garbage cannot move it', () => {
    expect(cadence.WEEK_OPEN_DOW).toBe(6);
    for (const bad of [-1, 7, 2.5, '0', null, undefined, NaN]) cadence.applyWeekOpenDow(bad);
    expect(cadence.WEEK_OPEN_DOW).toBe(6);
  });

  it('a Sunday athlete rolls on Sunday 20:30 — the walkers read the binding live', () => {
    cadence.applyWeekOpenDow(0);
    // Wed 2026-09-02 12:00 local.
    const wed = new Date(2026, 8, 2, 12, 0).getTime();
    const open = new Date(cadence.currentWeekOpen(wed));
    expect(open.getDay()).toBe(0); // Sunday
    expect(open.getHours()).toBe(20);
    expect(open.getMinutes()).toBe(30);
    const next = new Date(cadence.nextWeekOpen(wed));
    expect(next.getDay()).toBe(0);
    expect(next.getTime()).toBeGreaterThan(wed);
  });

  it('back at the default, the walkers land on Saturday again', () => {
    cadence.applyWeekOpenDow(0);
    cadence.applyWeekOpenDow(6);
    const wed = new Date(2026, 8, 2, 12, 0).getTime();
    expect(new Date(cadence.currentWeekOpen(wed)).getDay()).toBe(6);
  });
});
