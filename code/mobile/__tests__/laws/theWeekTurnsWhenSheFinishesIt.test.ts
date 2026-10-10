/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE WEEK TURNS WHEN SHE FINISHES IT, NOT ON SATURDAY (founder 2026-09-28: *"מאשר את הכל"* — the
 * rotation proposed in the screen review).
 *
 * The Saturday lock told the lifter who trains four times a week, on his fourth visit, that his week
 * was complete and to come back Saturday evening. The rule now:
 *   · Today always offers the next workout in order — A, B, C, then A again.
 *   · The moment every workout of the week has a trained session since the cycle opened, the next
 *     cycle opens (the closing session belongs to the cycle it closed).
 *   · The calendar never resets an unfinished cycle.
 *   · The letter covers the cycle she closed; "Week N" counts cycles; the circle keeps the calendar.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { cycleClosedAt, nextMorningAt } from '@/domain/weekCadence';
import { db } from '@/data/local/db';
import { rollClosedCycles } from '@/data/local/cycleRoll';
import { addDay, addLift, blankDraft, sealAuthored } from '@/domain/planBuilder';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const T0 = Date.parse('2027-03-01T08:00:00.000Z'); // a Monday
const H = 60 * 60 * 1000;
const at = (h: number) => new Date(T0 + h * H).toISOString();
async function saveHistory(list) {
  for (const s of list) await db.appendCompletedSession(s);
}
const done = (id: string, h: number, extra = {}) => ({ id: `${id}-${h}`, programDayId: id, startedAt: at(h), state: 'SAVED', sets: [], ...extra });

describe('1 · the rule', () => {
  const WEEK = ['coach_0', 'coach_1', 'coach_2'];

  it('open while any workout of the week is untrained since the opening', () => {
    expect(cycleClosedAt(WEEK, [done('coach_0', 1), done('coach_1', 25)], T0)).toBeNull();
  });

  it('closed the moment the last one is trained — Wednesday is as good as Saturday', () => {
    const closing = done('coach_2', 49);
    expect(cycleClosedAt(WEEK, [done('coach_0', 1), done('coach_1', 25), closing], T0)).toBe(Date.parse(closing.startedAt) + 1);
  });

  it('a workout trained twice does not close a cycle the others have not', () => {
    expect(cycleClosedAt(WEEK, [done('coach_0', 1), done('coach_0', 25), done('coach_1', 49)], T0)).toBeNull();
  });

  it('a session before the opening is last cycle\'s, and a non-session (trained: false) counts for nothing', () => {
    expect(cycleClosedAt(WEEK, [done('coach_0', -5), done('coach_1', 25), done('coach_2', 49)], T0)).toBeNull();
    expect(cycleClosedAt(WEEK, [done('coach_0', 1), done('coach_1', 25), done('coach_2', 49, { trained: false })], T0)).toBeNull();
  });

  it('an empty week never closes', () => {
    expect(cycleClosedAt([], [done('coach_0', 1)], T0)).toBeNull();
  });

  it('the week-closed note waits for a morning worth reading it', () => {
    const lateEvening = new Date(2027, 2, 3, 21, 0).getTime();
    const morning = nextMorningAt(lateEvening);
    expect(new Date(morning).getHours()).toBe(9);
    expect(morning - lateEvening).toBeGreaterThan(2 * H);
  });
});

describe('2 · the roll, on the record', () => {
  function week() {
    let d = blankDraft('rot');
    d = addLift(d, 0, 'bb_bench_press');
    d = addDay(d);
    d = addLift(d, 1, 'bb_back_squat');
    return sealAuthored(d);
  }
  beforeEach(async () => {
    await db.clearAll();
    await db.saveProfile({ id: 'p', name: 'Ofek', sex: 'male', units: 'kg', weightKg: 80, daysPerWeek: 2, bodyMap: {}, repBandByMuscle: {}, memberSince: at(-24) });
    await db.saveProgram(week());
    await db.saveWeekOpen(T0);
    await db.saveWeekCycle(1);
  });

  it('nothing rolls while the week is open', async () => {
    await saveHistory([done('coach_0', 1)]);
    expect(await rollClosedCycles()).toBeNull();
    expect(await db.loadWeekOpen()).toBe(T0);
  });

  it('finishing the week opens the next one at once — anchor, the closed window, and the count', async () => {
    const closing = done('coach_1', 30);
    await saveHistory([closing, done('coach_0', 1)]);
    const next = await rollClosedCycles();
    expect(next).toBe(Date.parse(closing.startedAt) + 1);
    expect(await db.loadWeekOpen()).toBe(next);
    expect(await db.loadWeekPrevOpen()).toBe(T0);
    expect(await db.loadWeekCycle()).toBe(2);
    // …and asking again rolls nothing: the new cycle is empty.
    expect(await rollClosedCycles()).toBeNull();
  });

  it('a wrist that reconciled two whole weeks at once rolls both', async () => {
    await saveHistory([done('coach_1', 60), done('coach_0', 50), done('coach_1', 30), done('coach_0', 1)]);
    const next = await rollClosedCycles();
    expect(next).toBe(Date.parse(at(60)) + 1);
    expect(await db.loadWeekCycle()).toBe(3);
  });
});

describe('3 · every surface follows', () => {
  it('the store rolls on every completed workout and on Today\'s focus — and never on the calendar', () => {
    const store = read('src/state/stores/appStore.tsx');
    expect(store).toMatch(/void programDayId;\s*await openNextCycleIfClosed\(\);/);
    expect(store).not.toMatch(/shouldRollWeek\(/);
    expect(store).toMatch(/const weekOpenMs = Date\.now\(\);/); // her first cycle opens when she has a week
  });

  it('Today re-reads its done marks when a cycle turns, and counts cycles as weeks', () => {
    const home = read('src/screens/home/Home.tsx');
    expect(home).toMatch(/\}, \[isFocused, app\.program, app\.weekOpenMs\]\);/);
    expect(home).toMatch(/const weekNumber = app\.weekCycle \?\? displayWeekNumber\(/);
    expect(home).toMatch(/const weekFrom = prevOpen \?\? app\.weekOpenMs \?\? 0;/);
  });

  it('the letter reads the cycle she closed', () => {
    expect(read('src/domain/weeklyUpdate.ts')).toMatch(/getWeeklyUpdateV5\(Date\.now\(\), await closedCycle\(\)\)/);
  });

  it('the Saturday push is retired; the week-closed note is one-shot', () => {
    const n = read('src/platform/notifications.ts');
    expect(n).toMatch(/async scheduleWeekClosed\(fireAtMs\)/);
    expect(n).not.toMatch(/\.\.\.weeklyTrigger\(\)/); // the Saturday 20:30 slot is armed by nothing
  });

  it('no copy promises Saturday any more', () => {
    for (const loc of ['he', 'en']) {
      const json = read(`src/i18n/locales/${loc}.json`);
      for (const key of ['restNext', 'readyBody', 'willWeekly', 'letters']) {
        const m = json.match(new RegExp(`"${key}": "([^"]*)"`));
        expect({ key, loc, says: m?.[1] }).not.toEqual(expect.objectContaining({ says: expect.stringMatching(/Saturday|שבת/) }));
      }
    }
  });
});
