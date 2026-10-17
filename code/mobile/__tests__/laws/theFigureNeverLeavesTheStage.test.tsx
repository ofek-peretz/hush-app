// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * THE FIGURE NEVER LEAVES THE STAGE — the end of the programme being built (2026-10-11)
 *
 * The founder, on the screen that builds the week:
 *
 *   > *"זה מציג יפה באנימציה את התרגילים שהבינה נותנת אבל לבסוף הגוף עם השרירים חוזר ומופיע וזה לא
 *   > יפה. אני מציע במקום זה לעשות משהו אחר כך שיהיה מעבר חלק יותר."*
 *
 * WHAT IT REPLACES. From 2026-08-12 this screen "built the programme on her own body": a muscle map
 * lit one muscle at a time, with that muscle's lifts flying into it (`theProgrammeIsBuiltOnHerOwnBody`,
 * retired by this law). It was right then — the intake had a body-map step, and the screen filled
 * in "the map she just drew". That step left the intake; on 2026-10-01 the wait was given to an
 * athlete performing the catalogue's lifts. So the screen spent half a minute on one drawing and
 * then, at the instant of delivery, CUT to another.
 *
 * WHAT STANDS NOW. One athlete, one stage. While the model writes she performs the catalogue, under
 * a legend that says it is the catalogue. The moment the week lands she goes on — performing HER
 * lifts, each with the weight and the sets the week gives it — and the week's name lands above a
 * figure that is still moving. The Ready screen that follows opens on the same week.
 *
 * What the old law got right is kept: nothing of her week is drawn before it has arrived; the
 * clock asks the drawing how long it needs; her sentence is a paragraph, not an isolate.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  BuildingProgrammeView,
  beatFor,
  paragraphMark,
  READ_MS,
  WEEK_HOLD_MS,
  WEEK_LIFTS_BEFORE_NAME,
} from '@/screens/onboarding/BuildingProgrammeView';
import { buildWeekFromProgram } from '@/screens/onboarding/BuildingProgramme';
import { DayInMotion } from '@/components/DayInMotion';
import { initI18n, tg } from '@/i18n';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const code = (src: string) => src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];
function draw(props: Partial<React.ComponentProps<typeof BuildingProgrammeView>> = {}): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(<BuildingProgrammeView muscles={[]} {...props} />);
  });
  mounted.push(r);
  return r;
}
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const texts = (r: ReactTestRenderer): string[] =>
  r.root.findAllByType(Text).map((n) => {
    const c = n.props.children;
    return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
  });
const stage = (r: ReactTestRenderer) => r.root.findAllByType(DayInMotion);

const LIB = [
  { id: 'bb_back_squat', name: 'סקוואט במוט' },
  { id: 'lat_pulldown', name: 'משיכת פולי עליון' },
];
const WEEK = [
  { id: 'bb_bench_press', name: 'לחיצת חזה במוט', load: '100 ק״ג', scheme: '4 × 5–7' },
  { id: 'pull_up', name: 'מתח באחיזה רחבה', load: null, scheme: '3 × 6–8' },
  { id: 'bb_row', name: 'חתירה במוט', load: '70 ק״ג', scheme: '3 × 8–12' },
];
const MUSCLES = [
  { muscle: 'Chest', lifts: [{ name: 'לחיצת חזה במוט' }] },
  { muscle: 'Back', lifts: [{ name: 'מתח באחיזה רחבה' }, { name: 'חתירה במוט' }] },
];
const waitProps = {
  muscles: [],
  askedFor: 'בלי אימון רגליים',
  brief: ['3 אימונים בשבוע', '78 kg'],
  library: LIB,
  libraryCount: 138,
  waitHint: 'זה לוקח בדרך כלל כחצי דקה',
};
const landedProps = { ...waitProps, muscles: MUSCLES, week: WEEK };

describe('⛔ while the model writes: the catalogue, and nothing of her week', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('her sentence and the facts the coach was handed come first, with how long it takes', () => {
    const said = texts(draw(waitProps)).join(' | ');
    for (const line of ['בלי אימון רגליים', '3 אימונים בשבוע', '78 kg', 'זה לוקח בדרך כלל כחצי דקה']) expect(said).toContain(line);
    expect(said).toContain(tg('ob.buildReading').toUpperCase());
  });

  it('then the catalogue takes the stage, under a legend that says it is the catalogue', () => {
    const r = draw(waitProps);
    act(() => {
      jest.advanceTimersByTime(READ_MS + 10);
    });
    expect(stage(r)).toHaveLength(1);
    expect(stage(r)[0].props.exerciseIds).toEqual(LIB.map((l) => l.id));
    expect(texts(r).join(' | ')).toContain(tg('ob.buildChoosingFrom', { n: 138 }).toUpperCase());
  });

  it('⛔ a week handed over early is NOT drawn early — her lifts wait for the answer to be shown', () => {
    // `muscles` is the container's word for "the answer is on screen". Until it speaks, the week
    // prop draws nothing, whatever it carries.
    const r = draw({ ...waitProps, week: WEEK });
    act(() => {
      jest.advanceTimersByTime(READ_MS + 10);
    });
    const said = texts(r).join(' | ');
    for (const lift of WEEK) expect(said).not.toContain(lift.name);
    expect(said).not.toContain(tg('ob.buildYours').toUpperCase());
  });

  it('⛔ her sentence is a paragraph, not an isolate', () => {
    const quote = texts(draw(waitProps)).find((x) => x.includes('בלי אימון רגליים'))!;
    expect(quote).not.toMatch(/[⁦-⁩]/);
    expect(quote.replace(/^‏/, '').startsWith('“')).toBe(true);
  });

  it('⛔ a Hebrew sentence that OPENS on a Latin word is still laid out as Hebrew', () => {
    // Walked 2026-10-11: "PPL, דגש על גב וכתפיים." drew its full stop mid-line — the first strong
    // letter was the P. Any Hebrew in her words makes the paragraph right-to-left, said outright.
    expect(paragraphMark('PPL, דגש על גב וכתפיים.')).toBe('‏');
    expect(paragraphMark('בלי אימון רגליים')).toBe('‏');
    expect(paragraphMark('No leg day, PPL please')).toBe(''); // an English sentence keeps its own direction
    const quote = texts(draw({ ...waitProps, askedFor: 'PPL, דגש על גב וכתפיים.' })).find((x) => x.includes('PPL'))!;
    expect(quote.startsWith('‏“PPL')).toBe(true);
  });

  it('⛔ the figure stands on the floor of the screen, so it does not ride up when the week lands', () => {
    const view = read('src/screens/onboarding/BuildingProgrammeView.tsx');
    expect(view).toMatch(/body: \{ flex: 1, alignItems: 'center', justifyContent: 'flex-end'/);
    // …and the catalogue's stage holds the figures' row open, so her week's lifts land on it.
    const r = draw(waitProps);
    act(() => {
      jest.advanceTimersByTime(READ_MS + 10);
    });
    const waitingRows = texts(r).length;
    expect(texts(r)[waitingRows - 1]).toBe('');
  });
});

describe('⛔ the moment the week lands, the same figure goes on — with HER lifts', () => {
  it('the stage is still a figure in motion, and what it performs is her week, in her order', () => {
    const r = draw(landedProps);
    expect(stage(r)).toHaveLength(1);
    expect(stage(r)[0].props.exerciseIds).toEqual(WEEK.map((l) => l.id));
    expect(stage(r)[0].props.holdMs).toBe(WEEK_HOLD_MS);
  });

  it('the legend says the lifts are hers, and the request read back is gone', () => {
    const said = texts(draw(landedProps)).join(' | ');
    expect(said).toContain(tg('ob.buildYours').toUpperCase());
    expect(said).not.toContain('3 אימונים בשבוע');
    expect(said).not.toContain('זה לוקח בדרך כלל כחצי דקה');
  });

  it('each lift stands with its weight and its sets — a prescription, not a name', () => {
    const r = draw(landedProps);
    expect(texts(r).join(' | ')).toContain('לחיצת חזה במוט');
    expect(texts(r)).toContain('100 ק״ג  ·  4 × 5–7');
    // The stage moves on: the next lift's own figures replace the first's. A bodyweight lift has
    // no weight, and says its sets alone rather than a made-up load.
    act(() => {
      stage(r)[0].props.onShow('pull_up');
    });
    expect(texts(r).join(' | ')).toContain('מתח באחיזה רחבה');
    expect(texts(r)).toContain('3 × 6–8');
  });

  it('⛔ no body map is drawn — not while waiting, not on landing, not under the name', () => {
    const view = code(read('src/screens/onboarding/BuildingProgrammeView.tsx'));
    expect(view).not.toContain('BodyMapFigure');
    expect(view).not.toContain('function LiftIn(');
    // …and the muscle NAMES the map used to print are gone from every phase.
    for (const props of [waitProps, landedProps, { ...landedProps, programmeName: 'PPL לחמישה ימים' }]) {
      const said = texts(draw(props)).join(' | ');
      for (const muscle of ['Chest', 'Back', 'Quads', 'Glutes']) expect(said).not.toContain(tg(`muscle.${muscle}`).toUpperCase());
    }
  });
});

describe('⛔ the name lands above a figure that is still moving', () => {
  const named = { ...landedProps, programmeName: 'PPL לחמישה ימים', summary: '5 אימונים בשבוע · 26 תרגילים' };

  it('the title and its line arrive; the stage does not empty', () => {
    const r = draw(named);
    const said = texts(r).join(' | ');
    expect(said).toContain('PPL לחמישה ימים');
    expect(said).toContain('5 אימונים בשבוע · 26 תרגילים');
    expect(said).toContain(tg('ob.buildYourProgramme').toUpperCase());
    expect(stage(r)).toHaveLength(1);
    expect(stage(r)[0].props.exerciseIds).toEqual(WEEK.map((l) => l.id));
  });

  it('the line under the name counts her week in workouts and lifts — not in muscles', () => {
    const screen = code(read('src/screens/onboarding/BuildingProgramme.tsx'));
    expect(screen).toContain("t('ob.buildSummaryWeek', { days: built.days, lifts: built.lifts })");
    const he = JSON.parse(read('src/i18n/locales/he.json'));
    expect(he.ob.buildSummaryWeek).toBe('{{days}} אימונים בשבוע · {{lifts}} תרגילים');
    expect(tg('ob.buildSummaryWeek', { days: 5, lifts: 26 })).toContain('5');
  });
});

describe('⛔ the clock asks the drawing', () => {
  it('the week holds the stage for exactly as long as the lifts it shows need', () => {
    expect(beatFor(26)).toBe(WEEK_LIFTS_BEFORE_NAME * WEEK_HOLD_MS);
    expect(beatFor(1)).toBe(WEEK_HOLD_MS); // a week of one lift does not wait for a second
    expect(beatFor(0)).toBe(WEEK_HOLD_MS);
    // Long enough to read a name and three figures; short enough that the delivery does not drag.
    expect(WEEK_HOLD_MS).toBeGreaterThanOrEqual(1000);
    expect(beatFor(26)).toBeLessThanOrEqual(3500);
  });

  it('the container holds no second opinion: the reveal waits `fillHold`, and `fillHold` is `beatFor`', () => {
    const clock = read('src/screens/onboarding/BuildingProgramme.tsx');
    expect(clock).toMatch(/setRevealed\(true\), fillHold\(/);
    expect(clock).toMatch(/function fillHold\([\s\S]*?return beatFor\(/);
    expect(code(clock)).toContain('week={built && muscles.length ? built.week : undefined}');
  });
});

describe('her week on the stage is the week she will train', () => {
  const program = {
    id: 'w',
    frequency: 2,
    days: [
      { id: 'd1', name: 'A', muscleGroups: ['Chest'], isRest: false, slots: [
        { capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 4, repBand: [5, 7], startLoadKg: 100 },
        { capability: 'horizontal_pull', exerciseId: 'pull_up', setCount: 3 },
      ] },
      { id: 'r', name: 'rest', muscleGroups: [], isRest: true, slots: [] },
      { id: 'd2', name: 'B', muscleGroups: ['Back'], isRest: false, slots: [
        { capability: 'horizontal_pull', exerciseId: 'bb_row', setCount: 3, startLoadKg: 70 },
        { capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 3, startLoadKg: 100 },
      ] },
    ],
  };
  const man = { sex: 'male', weightKg: 80, repBand: '8-10' };

  it('each lift once, in the order she meets it, at the weight it opens at', () => {
    const week = buildWeekFromProgram(program, man, 'kg');
    expect(week.map((l) => l.id)).toEqual(['bb_bench_press', 'pull_up', 'bb_row']);
    expect(week[0].load).toBe('100 kg');
    expect(week[2].load).toBe('70 kg');
    expect(week[1].load).toBeNull(); // bodyweight: no load is invented for the stage
  });

  it("⛔ the sets carry the lift's OWN range when the week wrote one — the default only where it did not", () => {
    const week = buildWeekFromProgram(program, man, 'kg');
    expect(week[0].scheme).toBe('4 × 5–7'); // the row this replaced printed "4 × 8–10" over it
    expect(week[2].scheme).toBe('3 × 8–10');
  });
});
