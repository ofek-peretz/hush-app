/**
 * Week cadence: the Sunday-04:00 weekly open, the lock between weeks, and the
 * "Week N" counter. Asserted by PROPERTIES (a real local Sunday at 04:00, strict
 * ordering) so the suite is correct in any timezone.
 */
import {
  WEEK_OPEN_DOW,
  WEEK_OPEN_HOUR,
  currentWeekOpen,
  nextWeekOpen,
  trainingWeekNumber,
  shouldRollWeek,
} from '@/domain/weekCadence';

const DAY = 24 * 60 * 60 * 1000;
const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo, d, h, 0, 0, 0).getTime();

function isSunday04(ms: number) {
  const d = new Date(ms);
  expect(d.getDay()).toBe(WEEK_OPEN_DOW);
  expect(d.getHours()).toBe(WEEK_OPEN_HOUR);
  expect(d.getMinutes()).toBe(0);
}

describe('weekCadence', () => {
  test('nextWeekOpen lands on the next Sunday 04:00, strictly after the input', () => {
    for (let off = 0; off < 14; off++) {
      const now = at(2026, 5, 1) + off * DAY; // June 2026, walk two weeks
      const open = nextWeekOpen(now);
      isSunday04(open);
      expect(open).toBeGreaterThan(now);
      expect(open - now).toBeLessThanOrEqual(7 * DAY + 2 * 60 * 60 * 1000); // within a week (+DST slack)
    }
  });

  test('currentWeekOpen is the most recent Sunday 04:00 at/before now', () => {
    const now = at(2026, 5, 17, 15); // a Wednesday afternoon
    const open = currentWeekOpen(now);
    isSunday04(open);
    expect(open).toBeLessThanOrEqual(now);
    expect(now - open).toBeLessThan(7 * DAY + 2 * 60 * 60 * 1000);
  });

  test('Sunday at exactly 04:00 belongs to the current (not next) week', () => {
    // find a Sunday, set 04:00 exactly
    let d = new Date(2026, 5, 7, WEEK_OPEN_HOUR, 0, 0, 0);
    while (d.getDay() !== WEEK_OPEN_DOW) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, WEEK_OPEN_HOUR, 0, 0, 0);
    const ms = d.getTime();
    expect(currentWeekOpen(ms)).toBe(ms); // inclusive
    expect(nextWeekOpen(ms)).toBeGreaterThan(ms); // exclusive → next Sunday
  });

  test('trainingWeekNumber starts at 1 and increments each Sunday open', () => {
    const join = new Date(2026, 5, 3, 10).toISOString(); // Wed of week 1
    const joinMs = at(2026, 5, 3, 10);
    expect(trainingWeekNumber(join, joinMs)).toBe(1);
    // still week 1 later that same week
    expect(trainingWeekNumber(join, joinMs + 2 * DAY)).toBe(1);
    // after one Sunday open → week 2
    const afterOneOpen = nextWeekOpen(joinMs) + DAY;
    expect(trainingWeekNumber(join, afterOneOpen)).toBe(2);
    // after a second open → week 3
    const afterTwoOpens = nextWeekOpen(nextWeekOpen(joinMs) + DAY) + DAY;
    expect(trainingWeekNumber(join, afterTwoOpens)).toBe(3);
  });

  test('trainingWeekNumber is resilient to bad input', () => {
    expect(trainingWeekNumber(null, Date.now())).toBe(1);
    expect(trainingWeekNumber('not-a-date', Date.now())).toBe(1);
  });

  describe('shouldRollWeek (calendar-primary bucket cadence)', () => {
    const wed = at(2026, 5, 17, 15); // a Wednesday
    const thisOpen = currentWeekOpen(wed);
    const lastOpen = currentWeekOpen(thisOpen - DAY); // the previous Sunday-04:00 window

    test('no bucket yet → always roll (first program / recovery from a lost program)', () => {
      expect(shouldRollWeek(null, false, wed)).toBe(true);
      expect(shouldRollWeek(thisOpen, false, wed)).toBe(true);
    });

    test('bucket built for the current week → do NOT roll mid-week', () => {
      expect(shouldRollWeek(thisOpen, true, wed)).toBe(false);
      // still no roll later the same week
      expect(shouldRollWeek(thisOpen, true, wed + DAY)).toBe(false);
    });

    test('completion is irrelevant: finishing early never rolls (only the calendar does)', () => {
      // hasProgram + built-for-this-week is the only signal; there is no "completed" input at all.
      expect(shouldRollWeek(thisOpen, true, thisOpen)).toBe(false); // Sunday 04:00 exactly, fresh
      expect(shouldRollWeek(thisOpen, true, thisOpen + 3 * DAY)).toBe(false); // Wednesday, all done
    });

    test('calendar week advanced past the bucket → roll', () => {
      expect(shouldRollWeek(lastOpen, true, wed)).toBe(true); // last week bucket, now this week
      expect(shouldRollWeek(thisOpen, true, nextWeekOpen(thisOpen))).toBe(true); // crossed next Sunday
    });

    test('roll flips exactly at Sunday 04:00, not before', () => {
      const next = nextWeekOpen(thisOpen);
      expect(shouldRollWeek(thisOpen, true, next - 1000)).toBe(false); // one second before → hold
      expect(shouldRollWeek(thisOpen, true, next)).toBe(true); // at open → roll
    });

    test('pre-upgrade bucket (no anchor) is adopted into the current week, not wiped', () => {
      expect(shouldRollWeek(null, true, wed)).toBe(false);
    });
  });
});
