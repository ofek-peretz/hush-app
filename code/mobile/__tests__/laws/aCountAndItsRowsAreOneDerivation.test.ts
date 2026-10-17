/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A COUNT AND THE ROWS BEHIND IT ARE ONE DERIVATION — AND A HOLD IS NOT A CHANGE.
 *
 * ⛔ FOUNDER, 2026-08-05, two complaints that are the same complaint:
 *
 *   > *"After the workout it says 6 changes, but when you go in and check you see there is no
 *   > change — it just decided to continue with the same weight. A change is only if there is a
 *   > drop or a raise or added sets or anything else. And now it suddenly jumped from 6 to 10."*
 *
 *   > *"It shows 10 changes, but when you press it THE MIRROR opens and says 0 workouts of 4 were
 *   > done, 0 tonnes lifted, but that the AI read the sessions and decided on 10 changes… And it
 *   > doesn't show the changes at all, it just says press them to see why but there is nothing."*
 *
 * Three separate defects produced one experience: **a number nobody could get behind.**
 *
 *   1. THE COUNT counted the coach's NOTES. A coach that holds a lift and explains why has written
 *      a note and changed nothing; two sessions write twice as many notes, which is the jump.
 *   2. THE ROWS were memoised without the coach's log in the dependency list, so they computed once
 *      — before the log landed — and never again. The count beside them was a plain expression and
 *      did recompute. One object, two update rules.
 *   3. THE BAND measured the week BEFORE the current one: `currentWeekOpen(now)` is the current
 *      week's opening, and it was being used as the window's END.
 *
 * ⚠️ THE SHAPE WORTH REMEMBERING is (2). Nothing was missing from the data and nothing was wrong
 * with the rendering — the screen simply held two answers to one question and updated one of them.
 * A count that is not literally `rows.length` is a second source of truth waiting to disagree.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { readFileSync } from 'fs';
import { join } from 'path';
import { coachChanges } from '@/domain/coachWeek';
import type { CoachPlan } from '@/domain/coachPlan';

const plan = (lifts: { ex: string; load: number | null; sets: number }[]): CoachPlan =>
  ({
    v: 1,
    sessions: [
      {
        name: 'Upper A',
        blocks: lifts.map((l) => ({
          rounds: l.sets,
          items: [{ kind: 'reps' as const, ex: l.ex, reps: [8, 10] as [number, number], load: l.load }],
        })),
      },
    ],
  }) as CoachPlan;

describe('⛔ a change is a difference, not a sentence', () => {
  it('a lift held at the same load is NOT a change', () => {
    const before = plan([{ ex: 'bb_bench_press', load: 54, sets: 4 }]);
    const now = plan([{ ex: 'bb_bench_press', load: 54, sets: 4 }]);
    expect(coachChanges(now, before)).toEqual([]);
  });

  it('a load that moved is one change, with its direction', () => {
    const before = plan([{ ex: 'bb_bench_press', load: 54, sets: 4 }]);
    const now = plan([{ ex: 'bb_bench_press', load: 57.5, sets: 4 }]);
    expect(coachChanges(now, before)).toEqual([
      { ex: 'bb_bench_press', kind: 'load', direction: 'up', from: 54, to: 57.5 },
    ]);
  });

  it('sets moving is a change too — his own list says "or added sets"', () => {
    const before = plan([{ ex: 'bb_bench_press', load: 54, sets: 3 }]);
    const now = plan([{ ex: 'bb_bench_press', load: 54, sets: 4 }]);
    expect(coachChanges(now, before)).toEqual([
      { ex: 'bb_bench_press', kind: 'sets', direction: 'up', from: 3, to: 4 },
    ]);
  });

  it('a lift arriving and a lift leaving are each one change, and neither has a direction', () => {
    const before = plan([{ ex: 'bb_bench_press', load: 54, sets: 4 }]);
    const now = plan([{ ex: 'lat_pulldown', load: 45, sets: 3 }]);
    const out = coachChanges(now, before)!;
    expect(out).toContainEqual({ ex: 'lat_pulldown', kind: 'added' });
    expect(out).toContainEqual({ ex: 'bb_bench_press', kind: 'dropped' });
    for (const c of out) expect(c.direction).toBeUndefined();
  });

  it('⚠️ the first programme is null, never zero', () => {
    // Nothing to subtract from. "0 changes" on the week a programme arrives would be the app
    // reporting on itself before it had done anything.
    expect(coachChanges(plan([{ ex: 'bb_bench_press', load: 54, sets: 4 }]), null)).toBeNull();
  });

  it('⚠️ a lift split across two blocks is one prescription with its rounds added up', () => {
    // The same reading `currentBlockSets` had to learn on the set screen: a coach that writes a
    // lift twice has prescribed more sets of it, not two lifts.
    const before = plan([{ ex: 'bb_bench_press', load: 54, sets: 4 }]);
    const now: CoachPlan = {
      v: 1,
      sessions: [
        {
          name: 'Upper A',
          blocks: [
            { rounds: 2, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 54 }] },
            { rounds: 2, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 54 }] },
          ],
        },
      ],
    } as CoachPlan;
    expect(coachChanges(now, before)).toEqual([]);
  });
});

describe('⛔ the count and the rows cannot drift', () => {
  const mirror = () => readFileSync(join(__dirname, '../../src/screens/weekly/WeeklyUpdate.tsx'), 'utf8');

  it("the letter's rows are memoised on the coach's log", () => {
    // The bug: `[view, units, t]`. The rows computed once, before the log arrived, and stayed empty
    // while the count beside them recomputed and printed 10.
    const src = mirror();
    const memo = src.slice(src.indexOf('const allChanges'), src.indexOf('const shown'));
    const deps = memo.match(/\}, \[([^\]]*)\]\)/)?.[1] ?? '';
    // Both inputs the rows are built from. `changes` is the list itself; `fromCoach` carries the
    // sentence joined onto each row, and either one arriving late used to leave the rows empty.
    expect(deps).toContain('changes');
    expect(deps).toContain('fromCoach');
  });

  it("the week's band opens where the week opens", () => {
    // `currentWeekOpen(now)` is the START of the current week. Using it as the END measured the
    // week before — the "0/4 workouts" on a day he had trained.
    const src = mirror().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).toMatch(/const weekStart = currentWeekOpen\(Date\.now\(\)\)/);
    expect(src).not.toMatch(/const weekEnd = currentWeekOpen/);
  });
});

describe('⛔ no row claims a verdict the coach did not state', () => {
  it('a coach row draws no figure column at all', () => {
    // It printed the word "holds" over sentences that said "Raised starting load to 50 kg".
    const src = readFileSync(join(__dirname, '../../src/screens/session/WellDone.tsx'), 'utf8');
    const coachRows = src.slice(src.indexOf('const coachLines'), src.indexOf('const coachLines') + 900);
    expect(coachRows).toMatch(/silent: true/);
    expect(coachRows).toMatch(/held: false/);
    // …and the renderer honours it before it can reach the word.
    expect(src).toMatch(/\{d\.silent \? null : \(/);
  });
});
