// @ts-nocheck
//
import fs from 'fs';
import path from 'path';
import { weekRows, type WeekColumnWorkout } from '@/components/WeekColumn';
import type { Weekday } from '@/domain/coachPlan';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEEK IS N WORKOUTS. IT IS NOT A CALENDAR, AND IT NEVER BECOMES ONE.
 *
 * ⛔ FOUNDER, 2026-08-04: *"you're right that the way I chose is like a to-do list and that wasn't
 * right — but it was my answer to those questions, which is why I did N workouts instead of days."*
 *
 * ⛔ AND AGAIN, 2026-08-12, ruling on the redesign: *"ואמרנו שזה לא יופיע כימים אלא כN אימונים."*
 * **Always.** Not "until the pattern is earned."
 *
 * ── WHAT THIS FILE USED TO ASSERT, AND WHY IT WAS WRONG ─────────────────────────────────────────
 * Two arrangements: numbered rows in week one, and — once `domain/trainingDays` had seen her train
 * the same weekday twice inside three weeks — the seven days of the week, Sunday first, sessions on
 * their days and the gaps drawn as real rows. Half of this file was tests for the second one,
 * including four guarding the failure it invited: **an arrangement that can LOSE a workout.**
 *
 * That arrangement was built from his own words and it was honest on its own terms — the days were
 * OBSERVED, never assigned, so nothing was a promise she could break. It still drifted into the
 * thing he rejected. Seven rows with three gaps in them **reads as a calendar with days you
 * missed**, whatever the derivation behind it, and no amount of correct provenance changes what a
 * person sees. His model was never "don't guess her days"; it was "a week is four workouts, and how
 * many are left is the only count that means anything."
 *
 * ⚠️ AND THE FOUR "MAY NOT LOSE A WORKOUT" TESTS ARE GONE WITH THEIR HAZARD, not weakened. Placing
 * N sessions into 7 slots is what made losing one possible: a coach day outside her pattern, two
 * sessions on one weekday, more sessions than expected days. `weekRows` is now `workouts.map` —
 * every workout is a row because every row IS a workout, which is a stronger guarantee than any
 * test of the placer could give. The first case below holds that structurally.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const label = (d: Weekday) => d.toUpperCase();
const W = (id: string, day?: string, done?: boolean): WeekColumnWorkout => ({
  id,
  name: id,
  ...(day ? { day } : {}),
  ...(done ? { done } : {}),
});

const ids = (rows: ReturnType<typeof weekRows>) => rows.map((r) => r.workout.id);

describe('⛔ N workouts, numbered — the founder’s own model, now the only one', () => {
  const four = [W('a'), W('b'), W('c'), W('d')];

  it('⛔ every workout is a row, and there are no other rows', () => {
    /*
     * The structural guarantee that replaced four separate tests. There is no placement step left
     * to drop a session in, and no empty slot for a gap to be drawn into — the column is the list.
     */
    const rows = weekRows(four, 'b', label);
    expect(rows).toHaveLength(4);
    expect(ids(rows)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.every((r) => r.kind === 'workout')).toBe(true);
    expect(rows.map((r) => r.label)).toEqual(['01', '02', '03', '04']);
  });

  it('the numbering is two digits, so a ten-workout week still lines up', () => {
    const many = Array.from({ length: 10 }, (_, i) => W(`w${i}`));
    const rows = weekRows(many, null, label);
    expect(rows[0].label).toBe('01');
    expect(rows.map((r) => r.label)).toContain('10');
  });

  it('⛔ a full seven-workout week is seven ROWS, and not one of them is a weekday', () => {
    // The shape that used to be indistinguishable from the calendar arrangement, and is the clearest
    // place to see that the calendar is gone: seven sessions draw 01…07, never SUN…SAT.
    const seven = Array.from({ length: 7 }, (_, i) => W(`w${i}`));
    const rows = weekRows(seven, null, label);
    expect(rows.map((r) => r.label)).toEqual(['01', '02', '03', '04', '05', '06', '07']);
    expect(rows.every((r) => r.dayTag == null)).toBe(true);
  });
});

describe('⚠️ the only weekdays that appear are weekdays a person wrote down', () => {
  /*
   * `day` is not dead, and deleting it would have been the easy wrong answer. A programme she
   * IMPORTED can name its own days — "Tuesday, easy 5 km" — and `authored` says we never rewrite
   * what she brought. So the day is carried as a TAG on the row (information) rather than used as a
   * position (a schedule).
   *
   * The engine writes no `day` at all — see the last test — so a generated week has no tags.
   */
  it('a day her programme names rides along as a tag, in its own position', () => {
    const rows = weekRows([W('a'), W('long', 'wed'), W('b')], null, label);
    expect(ids(rows)).toEqual(['a', 'long', 'b']); // its ORDER is untouched
    expect(rows[1].dayTag).toBe('WED');
    expect(rows[1].day).toBe('wed');
    expect(rows[0].dayTag).toBeUndefined();
  });

  it('⚠️ two sessions naming the SAME day both keep it — there is no slot to compete for', () => {
    // The old placer kept the first and pushed the second onto a free weekday, because a Map keyed
    // by weekday can only hold one. Nothing is keyed by weekday any more.
    const rows = weekRows([W('a', 'tue'), W('b', 'tue')], null, label);
    expect(rows.map((r) => r.dayTag)).toEqual(['TUE', 'TUE']);
  });

  it('⚠️ a nonsense weekday is dropped rather than drawn', () => {
    // `day` arrives from a model reading a photograph. "Tuesday", "2", "" — none is a weekday, and
    // printing one raw would put a model's typo in the gutter of the first screen she opens.
    const rows = weekRows([W('a', 'Tuesday'), W('b', ''), W('c', '2')], null, label);
    expect(ids(rows)).toEqual(['a', 'b', 'c']);
    expect(rows.every((r) => r.dayTag == null)).toBe(true);
  });

  it('⛔ and the ENGINE never writes one, which is what makes a generated week numbered', () => {
    // The claim the tags rest on. `enginePlan` is the only thing that turns the engine's programme
    // into what Today reads, and it writes no `day` — so if a weekday is on her screen, a person put
    // it there.
    expect(read('src/domain/enginePlan.ts')).not.toMatch(/^\s*day:/m);
  });
});

describe('the open row', () => {
  it('exactly one row opens, and it is the queued one', () => {
    const rows = weekRows([W('a'), W('b'), W('c')], 'b', label);
    const open = rows.filter((r) => r.open);
    expect(open).toHaveLength(1);
    expect(open[0].workout.id).toBe('b');
  });

  it('⚠️ nothing queued → nothing opens, rather than the first row opening by default', () => {
    // A defaulted-open row would put the lifts of a workout she has not chosen under a Begin button
    // that starts it. Silence is the honest state.
    expect(weekRows([W('a'), W('b')], null, label).filter((r) => r.open)).toHaveLength(0);
  });

  it('a DONE workout keeps its row and its record', () => {
    const rows = weekRows([W('a', undefined, true), W('b')], 'b', label);
    expect(rows.find((r) => r.workout.id === 'a')!.workout.done).toBe(true);
  });
});

describe('⛔ the day label is a WORD, and the general law cannot see it', () => {
  it('the position and the day tag are both set in sans, never in mono', () => {
    /*
     * ⛔ SHIPPED BROKEN FOR A DAY. The label was `t('weekday.sun')` — "SUN" in English and **"א׳" in
     * Hebrew** — drawn in IBM Plex Mono, which has no Hebrew glyphs at all. Every Hebrew athlete's
     * week was rendered in a silent system fallback, in the gutter of the first screen she opens.
     *
     * ⚠️ `monoCarriesNoWords` MISSED IT, and the reason is worth keeping. That law is a source
     * reader: it matches a `t(…)` sitting beside a mono style in the same JSX. Here the string
     * arrives through `weekRows(…, weekdayLabel)`, one indirection away — invisible to it.
     *
     * ⚠️ AND IT NOW GUARDS TWO STYLES. The position (`letter`) is digits and could survive mono;
     * `dayTag` is the translated weekday and cannot. The blind spot did not close when the calendar
     * went — it moved.
     *
     * ── ⚠️ WHAT THIS ASSERTS CHANGED ON 2026-08-27, AND WHY THAT IS NOT A WEAKENING ────────────
     * It used to demand the literal string `font.sans` inside each style, which pinned the SHAPE of
     * one repair — a hard-set face — rather than the guarantee. The repair was half of one: the face
     * was forced to sans and the `.16em` legend tracking was left sitting on top of it, so `א` was
     * drawn in the right face and then pushed apart from nothing. Tracking and face are one question
     * (*"can mono draw this string?"*), and answering half of it in a StyleSheet is what let the
     * other half survive.
     *
     * Both labels go through `<Legend>` now, which asks that question ONCE and sets the face and
     * the tracking from the single answer. So this law asks for the guarantee: the label is a
     * `Legend`, and no style beside it re-hard-sets a face that would override what `Legend` chose.
     * A future hard-set `font.mono` fails here exactly as it did before.
     */
    const src = read('src/components/WeekColumn.tsx');

    /* Each label is drawn BY the component whose job is choosing the face per string. */
    for (const style of ['styles.letter', 'styles.dayTag']) {
      const at = src.indexOf(style);
      expect({ style, found: at >= 0 }).toEqual({ style, found: true });
      /* Walk back to the tag that opens this element. */
      const tag = src.lastIndexOf('<', at);
      expect({ style, drawnBy: src.slice(tag, tag + 7) }).toEqual({ style, drawnBy: '<Legend' });
    }

    /* …and neither style smuggles a face back in underneath it. */
    for (const name of ['  letter: {', '  dayTag: {']) {
      const at = src.indexOf(name);
      expect({ name, found: at >= 0 }).toEqual({ name, found: true });
      const style = src.slice(at, src.indexOf('},', at));
      expect({ name, family: /font\.(mono|sans|serif)/.test(style) }).toEqual({ name, family: false });
    }
  });

  it('⛔ and nothing on Today derives a weekday any more', () => {
    /*
     * The ruling, held where it can actually be broken again: `Home` may not hand the column a
     * pattern, and the column may not ask for one. `domain/trainingDays` itself is untouched and
     * still right — it observes rather than assigns, and `daysAfterStarting` still records when a
     * session happened. What is forbidden is drawing a week out of it.
     */
    expect(read('src/screens/home/Home.tsx')).not.toMatch(/trainingDays=\{/);
    expect(read('src/screens/home/HomeView.tsx')).not.toMatch(/days=\{props\.trainingDays\}/);
    expect(read('src/components/WeekColumn.tsx')).not.toContain('WEEK_ORDER.map');
  });
});
