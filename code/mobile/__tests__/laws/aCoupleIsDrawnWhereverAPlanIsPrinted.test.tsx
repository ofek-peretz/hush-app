// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A COUPLE IS DRAWN WHEREVER A PLAN IS PRINTED (founder, 2026-10-13)
 *
 *   > *"לא היה סופרסט בתוכנית ופתאום הופיע במהלך האימון דרישה לסופרסט."*
 *
 * Two different faults stood behind that one sentence. A superset nobody wrote is
 * `aSupersetIsOnlyEverWritten`. This file is the other one: a superset that WAS written — by the
 * model (`buildPrompt` `pair`), or by her own finger on the builder's seam — and that Today, the
 * programme tab, the pre-workout card and her first week all printed as two ordinary lifts. The
 * blocks were flattened into rows on the way to the screen, and the one fact a block of two carries
 * was the thing the flattening dropped.
 *
 * So the fact rides the row (`CoachRow.withNext`), one component draws it (`CoupledRow`), and every
 * screen that prints a plan's rows is named here. A FIFTH screen that prints them fails this file
 * until it draws a couple too — which is the whole point of naming them.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import { coachRows, coachPlanRows, coachWorkoutId } from '@/domain/coachWeek';
import { coachPlanFromProgram } from '@/domain/enginePlan';
import { blankDraft, addLift, togglePair } from '@/domain/planBuilder';
import { readCoachWeek, draftFromCoachWeek } from '@/domain/coachDraft';
import { homePlanRows } from '@/screens/home/homePlan';
import { CoupledRow, SupersetLegend, coupleSeat } from '@/components/CoupledRow';
import { PlanLifts } from '@/components/PlanLifts';
import { initI18n } from '@/i18n';

beforeAll(async () => {
  await initI18n();
});

const MOBILE = path.join(__dirname, '..', '..');
const item = (ex: string) => ({ kind: 'reps', ex, reps: [8, 12], load: 40 });
const planOf = (blocks) => ({ sessions: [{ name: 'Day', blocks }] });
const marks = (rows) => rows.map((r) => r.withNext === true);

describe('the fact survives the flattening', () => {
  it('a couple is ONE mark, on its first lift — and a lift that stands alone carries none', () => {
    const plan = planOf([
      { rounds: 3, items: [item('bb_back_squat')] },
      { rounds: 3, items: [item('bb_bench_press'), item('db_row')] },
      { rounds: 3, items: [item('lateral_raise')] },
    ]);
    const rows = coachRows(plan, coachWorkoutId(0));
    expect(rows.map((r) => r.ex)).toEqual(['bb_back_squat', 'bb_bench_press', 'db_row', 'lateral_raise']);
    expect(marks(rows)).toEqual([false, true, false, false]);
    // …and it is still there in the shape every screen prints
    expect(marks(coachPlanRows(rows, 'kg'))).toEqual([false, true, false, false]);
  });

  it('a circuit of three is two marks — every lift but the last of the round', () => {
    const rows = coachRows(planOf([{ rounds: 2, items: [item('bb_bench_press'), item('db_row'), item('lateral_raise')] }, { rounds: 3, items: [item('bb_back_squat')] }]), coachWorkoutId(0));
    expect(marks(rows)).toEqual([true, true, false, false]);
  });

  it('HER couple, written on the builder’s seam, reaches the rows', () => {
    let d = blankDraft('p1');
    for (const ex of ['bb_bench_press', 'db_row', 'lateral_raise']) d = addLift(d, 0, ex);
    d = togglePair(d, 0, 1); // the second and third lifts
    const rows = coachPlanRows(coachRows(coachPlanFromProgram(d, [], [8, 10]), coachWorkoutId(0)), 'kg');
    expect(rows.map((r) => r.exerciseId)).toEqual(['bb_bench_press', 'db_row', 'lateral_raise']);
    expect(marks(rows)).toEqual([false, true, false]);
    // and through the day's own slots, for a list drawn straight off the programme
    expect(marks(homePlanRows(d.days[0], null))).toEqual([false, true, false]);
  });

  it('THE MODEL’S couple (`pair: true` in the week it writes) reaches the rows', () => {
    const draft = draftFromCoachWeek(
      readCoachWeek({ days: [{ name: 'A', lifts: [{ ex: 'bb_bench_press', sets: 3, pair: true }, { ex: 'db_row', sets: 3 }, { ex: 'lateral_raise', sets: 3 }] }] }),
    );
    const rows = coachPlanRows(coachRows(coachPlanFromProgram(draft, [], [8, 10]), coachWorkoutId(0)), 'kg');
    expect(marks(rows)).toEqual([true, false, false]);
  });

  it('a mark on the last seat couples nothing', () => {
    expect(marks(homePlanRows({ slots: [{ exerciseId: 'bb_bench_press', setCount: 3 }, { exerciseId: 'db_row', setCount: 3, pairedWithNext: true }] }, null))).toEqual([false, false]);
  });
});

describe('a row knows where it stands', () => {
  it('first, middle, last — or alone', () => {
    const rows = [{}, { withNext: true }, { withNext: true }, {}, {}, { withNext: true }, {}];
    expect(rows.map((_, i) => coupleSeat(rows, i))).toEqual([null, 'first', 'middle', 'last', null, 'first', 'last']);
  });
});

describe('the mark itself', () => {
  const tree = (el) => {
    let t;
    act(() => {
      t = renderer.create(el);
    });
    return t;
  };

  it('a row that stands alone comes back untouched — a plan with no couple renders the tree it always did', () => {
    const alone = tree(<CoupledRow seat={null}><Text>row</Text></CoupledRow>);
    expect(alone.toJSON()).toEqual(tree(<Text>row</Text>).toJSON());
    alone.unmount();
  });

  it('the first of a couple is headed by the legend; the others carry the rail alone', () => {
    const first = tree(<CoupledRow seat="first" how><Text>row</Text></CoupledRow>);
    const last = tree(<CoupledRow seat="last" how><Text>row</Text></CoupledRow>);
    expect(first.root.findAllByType(SupersetLegend).length).toBe(1);
    expect(last.root.findAllByType(SupersetLegend).length).toBe(0);
    // one node to a screen reader, saying both halves on a reference surface and the word alone on a preview
    const said = (t) => t.root.findAllByProps({ accessibilityRole: 'text' })[0].props.accessibilityLabel;
    expect(said(first)).toBe('Superset · no rest between them');
    const preview = tree(<CoupledRow seat="first"><Text>row</Text></CoupledRow>);
    expect(said(preview)).toBe('Superset');
    for (const t of [first, last, preview]) t.unmount();
  });

  it('the pre-workout table: one legend over the couple, both rows say so, and nothing on a day with none', () => {
    const lift = (exerciseId, extra = {}) => ({ exerciseId, name: exerciseId, load: 40, sets: 3, band: [8, 12], ...extra });
    const props = { units: 'kg', figure: 'male', onForm: () => {} };
    const coupled = tree(<PlanLifts {...props} lifts={[lift('bb_back_squat'), lift('bb_bench_press', { withNext: true }), lift('db_row'), lift('lateral_raise')]} />);
    expect(coupled.root.findAllByType(SupersetLegend).length).toBe(1);
    const labels = coupled.root.findAllByProps({ accessibilityRole: 'button' }).map((n) => n.props.accessibilityLabel).filter((l) => /·/.test(String(l)));
    // (a pressable is two nodes to the test renderer — the component and its host view)
    expect([...new Set(labels.filter((l) => /Superset$/.test(l)).map((l) => l.split(' · ')[0]))]).toEqual(['bb_bench_press', 'db_row']);
    coupled.unmount();
    const plain = tree(<PlanLifts {...props} lifts={[lift('bb_back_squat'), lift('bb_bench_press'), lift('db_row')]} />);
    expect(plain.root.findAllByType(SupersetLegend).length).toBe(0);
    plain.unmount();
  });
});

describe('⛔ every screen that prints a plan’s rows draws its couples', () => {
  const src = (rel: string) => fs.readFileSync(path.join(MOBILE, rel), 'utf8');
  const files: string[] = [];
  (function walk(dir: string) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) files.push(path.relative(MOBILE, full).replace(/\\/g, '/'));
    }
  })(path.join(MOBILE, 'src'));
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

  it('the rows are made in four places — a fifth is read against this law before it ships', () => {
    const makers = files.filter((f) => !f.startsWith('src/screens/dev/') && f !== 'src/domain/coachWeek.ts' && /coachPlanRows\(/.test(code(src(f)))).sort();
    expect(makers).toEqual([
      'src/screens/home/Home.tsx', // → HomeView's card
      'src/screens/onboarding/ProgramCreated.tsx', // her first week
      'src/screens/plan/PreWorkoutScreen.tsx', // → PreWorkout → PlanLifts
      'src/screens/program/ProgramTab.tsx',
    ]);
  });

  it.each([
    ['src/screens/home/HomeView.tsx', 'CoupledRow'],
    ['src/screens/program/ProgramTab.tsx', 'CoupledRow'],
    ['src/screens/onboarding/ProgramCreated.tsx', 'CoupledRow'],
    ['src/components/PlanLifts.tsx', 'SupersetLegend'],
  ])('%s asks each row its seat and draws it', (file, mark) => {
    const s = code(src(file));
    expect(s).toContain("from '@/components/CoupledRow'");
    expect(s).toMatch(/coupleSeat\(/);
    expect(s).toContain(`<${mark}`);
  });

  it('…and the mark is the one word the workout uses, in both languages', () => {
    const he = JSON.parse(src('src/i18n/locales/he.json'));
    const en = JSON.parse(src('src/i18n/locales/en.json'));
    expect([he.workout.superset, he.workout.supersetNoRest]).toEqual(['סופרסט', 'בלי מנוחה ביניהם']);
    expect([en.workout.superset, en.workout.supersetNoRest]).toEqual(['Superset', 'no rest between them']);
  });
});
