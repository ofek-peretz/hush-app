/**
 * THE PROGRAM TAB — mounted for real (founder, device QA 2026-08-23).
 *
 * His ask, verbatim: *"להוסיף ל-Tab Bar ניהול תוכנית האימון ששם אפשר ממש לנהל את תוכנית האימון
 * באופן מלא"* — plus: *"ארצה שהמתאמן ידע שהמערכת מסדרת את התוכנית כך שהמתאמן נשאר על ציוד מסוים
 * ועוזב אותו רק כשהוא מסיים."*
 *
 * So this mounts the tab and asks his questions:
 *   · is the whole week on it, every workout with its lifts and live figures?
 *   · does a day open the ONE management surface (the pre-workout card)?
 *   · is the library one row away?
 *   · is the station ordering finally SAID?
 *   · does a done workout wear its mark?
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initI18n, tg } from '@/i18n';

const PLAN = {
  sessions: [
    {
      name: 'Upper A',
      blocks: [
        { rounds: 4, items: [{ ex: 'bb_bench_press', kind: 'reps', load: 60, reps: [8, 10] }] },
        { rounds: 3, items: [{ ex: 'lat_pulldown', kind: 'reps', load: 50, reps: [8, 10] }] },
      ],
    },
    {
      name: 'Lower A',
      blocks: [{ rounds: 3, items: [{ ex: 'bb_back_squat', kind: 'reps', load: 80, reps: [8, 10] }] }],
    },
  ],
};

jest.mock('@/data/local/weekPlan', () => ({ loadWeekPlan: jest.fn(async () => PLAN) }));
jest.mock('@/data/local/db', () => ({
  db: {
    loadHistory: jest.fn(async () => [
      { programDayId: 'coach_0', startedAt: new Date().toISOString(), trained: true, sets: [] },
    ]),
    loadWeekOpen: jest.fn(async () => 0),
  },
}));
jest.mock('@/state/stores/appStore', () => ({
  useApp: () => ({ profile: { units: globalThis.__useAppUnits ?? 'kg', sex: 'female' } }),
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

import { ProgramTab, ProgramTabView } from '@/screens/program/ProgramTab';

beforeAll(async () => {
  await initI18n();
});

/** Flips the mocked profile's units for the pounds case below. */
let useAppUnits = 'kg';
Object.defineProperty(globalThis, '__useAppUnits', { get: () => useAppUnits, configurable: true });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

/*
 * ⛔ WHAT IS MOUNTED HERE IS UNMOUNTED (2026-08-27).
 *
 * This suite created renderers and never tore them down. Harmless while the screen is static, and a
 * worker-killing crash the moment it gains an ARRIVAL: `Arrive` schedules a native-driver animation
 * on a delay, jest tears the environment down while one is still pending, and it wakes into a
 * renderer that no longer exists — `findNodeHandle` of undefined, printed AFTER "Ran all test
 * suites", belonging to no test. Caught for real on `weeklyUpdateScreen` the day the letter learnt
 * to arrive; closed here BEFORE this screen gets its beats.
 */
const mounted = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop().unmount();
  });
});

async function mount(navigate = jest.fn()) {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ProgramTab navigation={{ navigate }} route={{ key: 'Program', name: 'Program' }} />
      </SafeAreaProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}

const allText = (tree) =>
  tree.root.findAllByType(require('react-native').Text).map((t) => [].concat(t.props.children).join('')).join('|');

it('⛔ the whole week is on the tab — every workout, its lifts, their live figures', async () => {
  const tree = await mount();
  const said = allText(tree);
  expect(said).toContain('Upper A');
  expect(said).toContain('Lower A');
  expect(said).toContain('Barbell Bench Press');
  expect(said).toContain('Lat Pulldown');
  /*
   * ⛔ THIS ASSERTED THE DEFECT UNTIL 2026-08-26: `'60 · 4×8–10'`, with no unit.
   *
   * The tab had its own six-line `figure()` that printed `Row.load` raw. `Row.load` is KILOGRAMS —
   * `coachPlanRows` spends `units` on distances and passes the load straight through — so this
   * screen, which lists every load in her week, said neither what the number was in nor converted
   * it. It borrows the app's one assembly now (`PlanLifts.figureLoad/Unit/Scheme`), the same one
   * Today's card borrows, so a prescription reads identically wherever it is drawn.
   */
  /* ⛔ SINCE 2026-09-01 THE PRESCRIPTION IS A TABLE OF CELLS (`FigureCells`), not one string —
     load, unit and scheme each hold a fixed column so `kg` and `3×8–10` align down the card. The
     assembly is still the app's one authority; what changed is that the row renders it as three
     adjacent text nodes. `allText` joins nodes with '|', so the SEQUENCE is the assertion. */
  expect(said).toContain('60|kg|4×8–10');
  expect(said).toContain('80|kg|3×8–10');
});

it('⛔ …and it reads in HER units — the half that was actually broken', async () => {
  /*
   * The unit label was the visible fault; this was the dangerous one. An athlete on pounds was
   * being shown kilogram FIGURES, unconverted and unlabelled, for every lift of her week.
   * 60 kg is 132 lb: if this ever reads `60` again on a pounds profile, the conversion is gone.
   */
  useAppUnits = 'lb';
  try {
    const tree = await mount();
    const said = allText(tree);
    expect(said).toContain('132|lb|4×8–10');
    expect(said).not.toContain('60 lb');
  } finally {
    useAppUnits = 'kg';
  }
});

it('⛔ the station ordering is finally SAID — his styling ask, on the page', async () => {
  const tree = await mount();
  expect(allText(tree)).toContain(tg('program.stationNote'));
});

it('⛔ a day opens the ONE management surface — the pre-workout card, by workout id', async () => {
  const navigate = jest.fn();
  const tree = await mount(navigate);
  const day = tree.root.findAll(
    (n) => n.props?.accessibilityRole === 'button' && n.props?.accessibilityLabel === 'Upper A',
  )[0];
  await act(async () => day.props.onPress());
  expect(navigate).toHaveBeenCalledWith('PreWorkout', { workoutId: 'coach_0' });
});

/*
 * ⛔ THE LIBRARY DOOR IS GONE FROM THIS TAB, AND THE EDIT DOOR IS FIRST (founder, 2026-09-07):
 * *"יש את ספריית התרגילים למטה — תמחק את הפקד הזה. ולמה שינוי התוכנית מופיע למטה? … זה אמור להיות
 * בראש המסך ולא למטה."* The library keeps a quiet door on the builder's chooser (`PlanBuilder`,
 * off the Program tab), so it is still reachable; it is simply not on this tab's face.
 */
it('⛔ no library door on the tab; the edit door is the FIRST button, before the week', async () => {
  const navigate = jest.fn();
  const tree = await mount(navigate);
  expect(
    tree.root.findAll((n) => n.props?.accessibilityRole === 'button' && n.props?.accessibilityLabel === tg('program.libraryRow')),
  ).toHaveLength(0);
  const buttons = tree.root.findAll((n) => n.props?.accessibilityRole === 'button' && typeof n.props?.accessibilityLabel === 'string');
  expect(buttons[0]?.props.accessibilityLabel).toBe(tg('program.buildRow'));
  await act(async () => buttons[0].props.onPress());
  expect(navigate).toHaveBeenCalledWith('PlanBuilder');
});

/**
 * THE RECEIPT (founder, 2026-09-07 — the plan's fourth part): the engine's decisions, counted off
 * her own log, on the tab where the week she is about to train is. Silent on a first week.
 */
it('⛔ says nothing on a log with no decision in it', async () => {
  const tree = await mount();
  // The legend is drawn tracked and uppercased (`Legend`), so the comparison is case-blind.
  expect(allText(tree).toUpperCase()).not.toContain(tg('program.receiptLegend').toUpperCase());
});

it('⛔ counts the decisions off her log — and puts the fixed plan beside the engine once they have parted', async () => {
  const { db } = require('@/data/local/db');
  const set = (w: number) => ({ exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: w, recommendedReps: 8, actualWeight: w, actualReps: 8, edited: false, persistedAt: '2026-08-01T10:00:00.000Z' });
  // Five occurrences of the bench: 60 → 60 → 62.5 → 62.5 → 62.5. A fixed "+2.5 a session" plan
  // would stand at 70 today; the engine stands at 62.5 — they have parted by more than two grains.
  db.loadHistory.mockResolvedValueOnce(
    [60, 60, 62.5, 62.5, 62.5].map((w, i) => ({
      id: `s${i}`, programDayId: 'coach_0', startedAt: new Date(Date.now() - (5 - i) * 86_400_000).toISOString(), state: 'SAVED', earlyFinish: false, trained: true, sets: [set(w)],
    })),
  );
  const tree = await mount();
  const said = allText(tree);
  expect(said.toUpperCase()).toContain(tg('program.receiptLegend').toUpperCase());
  expect(said).toContain(tg('program.receiptDecisions', { count: 4, raises: 1, holds: 3, eases: 0 }));
  // The lift's name is isolated (`bidi`) on the page exactly as the paywall isolates it.
  const { bidi } = require('@/i18n/bidi');
  expect(said).toContain(tg('paywall.receiptBehind', { lift: bidi('Barbell Bench Press'), fixed: 70, engine: 62.5, unit: 'kg' }));
});

it('a trained workout wears the done chip; an untrained one does not', async () => {
  const tree = await mount();
  const said = allText(tree);
  // coach_0 (Upper A) is in this week's history as trained → exactly one done chip on the page.
  const done = tg('program.doneChip');
  expect(said.split(done).length - 1).toBe(1);
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEEK THE SHEET USED TO HOLD.
 *
 * ⛔ FOUNDER, 2026-08-29: *"לגבי כפתור ה'אימון אחר' אפשר להוריד כי יותר נוח לבצע אימון אחר דרך מסך
 * התוכנית שכבר אפשר לעשות כיום."*
 *
 * Home had a control — "אימון אחר" — that raised `WeekSheet`, a chooser listing the week. Both are
 * deleted, and **the laws the sheet carried were moved rather than dropped**, because every one of
 * them is a law about a WEEK CHOOSER and this tab is now the only one. They stood in
 * `homeWeekCard.test.tsx` under *"the week is behind a door, and it is still the whole week"*; the
 * note left in their place there points here.
 *
 * ⚠️ ASKED OF `ProgramTabView` WITH FIXTURES, not of the container. Two of these need a week the
 * container's mocked plan cannot express — two workouts with the SAME NAME, and a finished day in
 * the middle of the order — and a law that cannot be posed its own worst case is not being kept.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the week the sheet used to hold', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({
    exerciseId: `ex_${i}`, name: `Lift ${i}`, load: 40, sets: 3, band: [8, 10],
  }));

  const view = (over = {}) => {
    let tree;
    act(() => {
      tree = renderer.create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <ProgramTabView
            workouts={[
              { id: 'day_1', name: 'Push A', lifts: 2, minutes: 48, done: true, rows: rows(2) },
              { id: 'day_2', name: 'Pull A', lifts: 2, minutes: 52, done: false, rows: rows(2) },
              { id: 'day_3', name: 'Legs A', lifts: 2, minutes: 55, done: true, rows: rows(2) },
              { id: 'day_4', name: 'Push B', lifts: 2, minutes: 50, done: false, rows: rows(2) },
            ]}
            units="kg"
            settled
            onDay={() => {}}
            onBuild={() => {}}

            {...over}
          />
        </SafeAreaProvider>,
      );
    });
    mounted.push(tree);
    return tree;
  };

  const dayButtons = (tree) =>
    tree.root
      .findAll((n) => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function')
      .filter((n) => ['Push A', 'Pull A', 'Legs A', 'Push B', 'Upper'].includes(n.props.accessibilityLabel));

  it('names ALL of them — the whole week, not the one in front of her', () => {
    const said = allText(view());
    for (const name of ['Push A', 'Pull A', 'Legs A', 'Push B']) expect(said).toContain(name);
  });

  it('⛔ a row knows itself by ID, never by name — two workouts may be called the same thing', () => {
    /* Both are "Upper". Matching on the NAME would make a press meant for the second open the
       first — silently showing the WRONG plan under the right name. */
    const chosen = [];
    const tree = view({
      workouts: [
        { id: 'day_1', name: 'Upper', lifts: 2, minutes: 50, done: false, rows: rows(2) },
        { id: 'day_2', name: 'Upper', lifts: 2, minutes: 50, done: false, rows: rows(2) },
      ],
      onDay: (id) => chosen.push(id),
    });
    const twins = dayButtons(tree);
    expect(twins).toHaveLength(2);
    act(() => twins.forEach((c) => c.props.onPress()));
    expect([...chosen].sort()).toEqual(['day_1', 'day_2']);
  });

  it('⛔ the week keeps its OWN order — a finished workout does not fall to the end', () => {
    /*
     * The horizontal strip on Home sorted finished workouts away, because its only job was to offer
     * what was next (founder A.16). A week you open on purpose is not that: it has a shape —
     * Push A · Pull A · Legs A · Push B — and that shape is what a person navigates by.
     * **Re-sorting a list somebody opened to find a specific row in is the wrong kindness.**
     * Kept, inverted, so nobody re-adds the sort.
     */
    const order = dayButtons(view()).map((n) => n.props.accessibilityLabel);
    expect(order).toEqual(['Push A', 'Pull A', 'Legs A', 'Push B']);
  });

  it('⛔ a trained workout wears its mark, and a pending one wears none (founder A.16)', () => {
    /* *"A completed workout's chip stays white, reads like another workout still to do."* The law
       is about the MARK: done carries it wherever the workout is drawn, pending carries none. */
    const done = tg('program.doneChip');
    const said = allText(view());
    expect(said.split(done).length - 1).toBe(2); // Push A and Legs A, and those two only
  });

  it('⛔ opening a workout to READ it does not re-queue the week', () => {
    /*
     * ════ LOOKING IS NOT CHOOSING (founder 2026-08-12: *"אחרת מה הערך של כפתור הBEGIN במסך
     * הTODAY?"*) ════
     *
     * ⚠️ ASSERTED ON THE SOURCE, because the state it guards lives in the container: a day press
     * NAVIGATES and does nothing else. The queue moves when she TRAINS, from either door.
     */
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'src/screens/program/ProgramTab.tsx'),
      'utf8',
    );
    expect(src).toContain("onDay={(workoutId) => navigation.navigate('PreWorkout', { workoutId })}");
  });

  it('⚠️ …and it needs no muscle line to tell one day from another', () => {
    /*
     * ⛔ THIS IS WHY THE SHEET'S MUSCLE CAPTION COULD BE DELETED (founder 2026-08-29: *"כיתוב על
     * סוגי שריר … שלא מעניינים"*). The line existed because four rows reading "Full Body A / B / C ·
     * 7 lifts · ~55 min" differ by one letter and cannot be chosen between. These rows do not
     * summarise a day at all — they print its lifts, which is the resolution the muscle line was a
     * lossy compression of.
     */
    const said = allText(view());
    for (const n of [0, 1]) expect(said).toContain(`Lift ${n}`);
  });
});
