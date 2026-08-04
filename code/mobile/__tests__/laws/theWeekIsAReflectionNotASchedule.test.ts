import fs from 'fs';
import path from 'path';
import { weekRows, type WeekColumnWorkout } from '@/components/WeekColumn';
import type { Weekday } from '@/domain/coachPlan';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEEK IS A REFLECTION, NOT A SCHEDULE.
 *
 * ⛔ FOUNDER, 2026-08-04: *"you're right that the way I chose is like a to-do list and that wasn't
 * right — but it was my answer to those questions, which is why I did N workouts instead of days."*
 *
 * The arrangement is the whole design, so it is pure and asserted here rather than left inside a
 * component nobody can call. Two shapes:
 *
 *   · NO PATTERN YET → the coach's order, numbered. **His model, unchanged.**
 *   · A PATTERN      → the seven days, Sunday first, sessions on their days and the gaps left open.
 *
 * ── ⚠️ THE FAILURE THIS FILE IS REALLY FOR ──────────────────────────────────────────────────────
 * A session that never gets drawn. Placing sessions onto weekdays means every arrangement can lose
 * one — a coach day outside her pattern, two sessions on the same day, more sessions than expected
 * days — and losing one means she opens the app and a workout is simply missing. Every test below
 * that counts workouts is guarding that.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const label = (d: Weekday) => d.toUpperCase();
const W = (id: string, day?: string, done?: boolean): WeekColumnWorkout => ({
  id,
  name: id,
  ...(day ? { day } : {}),
  ...(done ? { done } : {}),
});

const ids = (rows: ReturnType<typeof weekRows>) =>
  rows.filter((r) => r.kind === 'workout').map((r) => (r.kind === 'workout' ? r.workout.id : ''));

describe('⛔ before it knows her — the founder’s own model', () => {
  const four = [W('a'), W('b'), W('c'), W('d')];

  it('no pattern → the coach’s order, numbered, and NOT a week', () => {
    const rows = weekRows(four, null, 'b', label);
    expect(rows).toHaveLength(4); // four rows, not seven
    expect(rows.map((r) => r.label)).toEqual(['01', '02', '03', '04']);
    expect(rows.every((r) => r.kind === 'workout')).toBe(true); // no rest rows invented
  });

  it('⚠️ an EMPTY pattern is the same as no pattern, not an empty week', () => {
    // `trainingDays` can return a set it then caps to nothing. Drawing seven blank days there would
    // tell a new athlete she has a week with no training in it.
    expect(weekRows(four, new Set(), 'a', label)).toHaveLength(4);
  });

  it('the numbering is two digits, so a ten-day plan still lines up', () => {
    const many = Array.from({ length: 10 }, (_, i) => W(`w${i}`));
    expect(weekRows(many, null, null, label).map((r) => r.label)).toContain('10');
    expect(weekRows(many, null, null, label)[0].label).toBe('01');
  });
});

describe('after it knows her — seven days, Sunday first', () => {
  const days = new Set<Weekday>(['sun', 'tue', 'thu', 'sat']);

  it('a week is always seven rows, and the gaps are real rows', () => {
    const rows = weekRows([W('a'), W('b'), W('c'), W('d')], days, 'b', label);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.label)).toEqual(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
    expect(rows.filter((r) => r.kind === 'empty')).toHaveLength(3);
  });

  it('sessions with no coach day fill HER days, in the coach’s order', () => {
    const rows = weekRows([W('a'), W('b'), W('c'), W('d')], days, null, label);
    const on = (d: string) => rows.find((r) => r.label === d);
    expect(on('SUN')?.kind === 'workout' && on('SUN')!.kind === 'workout').toBe(true);
    expect(ids(rows)).toEqual(['a', 'b', 'c', 'd']); // order preserved, left to right down the week
    expect(on('MON')?.kind).toBe('empty');
  });

  it('⚠️ and a session the COACH dated goes on ITS day, even when she never trains then', () => {
    /*
     * An endurance week names all its days for a reason — the long run is on Sunday because the
     * rest of the week is arranged around it. Moving it to a day she happens to prefer would
     * silently rewrite the training, which is the one thing no layout is allowed to do.
     */
    const rows = weekRows([W('long', 'wed'), W('a'), W('b')], days, null, label);
    const wed = rows.find((r) => r.label === 'WED');
    expect(wed?.kind === 'workout' && wed.workout.id).toBe('long');
  });
});

describe('⛔ no arrangement may lose a workout', () => {
  const days = new Set<Weekday>(['sun', 'tue']);

  it('more sessions than expected days — every one still lands', () => {
    // Two expected days, four sessions. The overflow takes free days rather than falling off the
    // screen: a workout sitting on an unusual day is far better than a workout that is not there.
    const four = [W('a'), W('b'), W('c'), W('d')];
    expect(ids(weekRows(four, days, null, label)).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('⚠️ two sessions the coach put on the SAME day — neither disappears', () => {
    // A coach can write two sessions onto one weekday; a Map keyed by weekday would drop the second
    // without a word. The second is treated as undated and placed like any other.
    const rows = weekRows([W('a', 'tue'), W('b', 'tue'), W('c')], days, null, label);
    expect(ids(rows).sort()).toEqual(['a', 'b', 'c']);
  });

  it('⚠️ a nonsense weekday from the coach does not swallow the session', () => {
    // `day` arrives from a model. "Tuesday", "2", "" — none of them is a weekday, and a session
    // carrying one must still be drawn.
    const rows = weekRows([W('a', 'Tuesday'), W('b', ''), W('c')], days, null, label);
    expect(ids(rows).sort()).toEqual(['a', 'b', 'c']);
  });

  it('a full seven-day week fills every row and leaves no gap', () => {
    const seven = Array.from({ length: 7 }, (_, i) => W(`w${i}`));
    const rows = weekRows(seven, new Set<Weekday>(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']), null, label);
    expect(rows.filter((r) => r.kind === 'empty')).toHaveLength(0);
    expect(ids(rows)).toHaveLength(7);
  });
});

describe('the open row', () => {
  it('exactly one row opens, and it is the queued one', () => {
    const rows = weekRows([W('a'), W('b'), W('c')], new Set<Weekday>(['sun', 'tue', 'thu']), 'b', label);
    const open = rows.filter((r) => r.kind === 'workout' && r.open);
    expect(open).toHaveLength(1);
    expect(open[0].kind === 'workout' && open[0].workout.id).toBe('b');
  });

  it('⚠️ nothing queued → nothing opens, rather than the first row opening by default', () => {
    // A defaulted-open row would put the lifts of a workout she has not chosen under a Begin button
    // that starts it. Silence is the honest state.
    const rows = weekRows([W('a'), W('b')], null, null, label);
    expect(rows.filter((r) => r.kind === 'workout' && r.open)).toHaveLength(0);
  });

  it('a DONE workout keeps its row and its record', () => {
    const rows = weekRows([W('a', undefined, true), W('b')], new Set<Weekday>(['sun', 'tue']), 'b', label);
    const done = rows.find((r) => r.kind === 'workout' && r.workout.id === 'a');
    expect(done?.kind === 'workout' && done.workout.done).toBe(true);
  });
});

describe('⛔ the day label is a WORD, and the general law cannot see it', () => {
  it('the letter is set in sans, never in mono', () => {
    /*
     * ⛔ SHIPPED BROKEN FOR A DAY. The label is `t('weekday.sun')` — "SUN" in English and **"א׳" in
     * Hebrew** — and it was drawn in IBM Plex Mono, which has no Hebrew glyphs at all. Every Hebrew
     * athlete's week was rendered in a silent system fallback, in the gutter of the first screen she
     * opens.
     *
     * ⚠️ `monoCarriesNoWords` MISSED IT, and the reason is worth keeping. That law is a source
     * reader: it matches a `t(…)` sitting beside a mono style in the same JSX. Here the string
     * arrives through `weekRows(…, weekdayLabel)`, one indirection away — invisible to it. It caught
     * the identical line in `PlanWeek` the instant that one was written inline, which is what sent me
     * back to this file.
     *
     * So this assertion exists exactly where the general law goes blind: a component that receives
     * its translated strings through a function.
     */
    const src = read('src/components/WeekColumn.tsx');
    const at = src.indexOf('  letter: {');
    const style = src.slice(at, src.indexOf('},', at));
    expect(style).toContain('font.sansMedium');
    expect(style).not.toContain('font.mono');
  });

  it('…and so is the one on the programme screens, which draw the same gutter', () => {
    const src = read('src/components/PlanWeek.tsx');
    const at = src.indexOf('  day: {');
    expect(src.slice(at, src.indexOf('},', at))).toContain('font.sansMedium');
  });
});
