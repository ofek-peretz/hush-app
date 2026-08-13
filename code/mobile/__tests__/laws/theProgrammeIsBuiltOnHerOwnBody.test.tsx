// @ts-nocheck
import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  BuildingProgrammeView,
  beatFor,
  LIFT_STEP_MS,
  LIFT_RISE_MS,
  LIFT_HOLD_MS,
  LIFT_TRAVEL_MS,
} from '@/screens/onboarding/BuildingProgrammeView';
import { BodyMapFigure } from '@/components/BodyMapFigure';
import { initI18n, tg } from '@/i18n';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

beforeAll(async () => {
  await initI18n();
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PROGRAMME IS BUILT ON HER OWN BODY.
 *
 * ⛔ FOUNDER, 2026-08-12: *"למה לא לעשות אנימציה יפה עם מפת הגוף שלנו — שבוחרת שריר ומציגה את
 * התרגילים שלו ואז זורקת אותם לתוך השריר הזה, וכך עוברת שריר אחר שריר, ולבסוף כל מפת הגוף הופכת
 * לירוקה?"*
 *
 * What stood here was two filling bars and a scrolling list of names: a screen that FILLED TIME
 * rather than saying anything. His design says the thing that is actually happening — the assembler
 * takes a muscle, chooses lifts for it, and moves on. **The body map is not decoration over the
 * computation; it is the computation's own shape.**
 *
 * ⚠️ AND IT IS THE MAP SHE JUST DREW, in the same component, with `emphasis` as its moss. One
 * instrument for the question and the answer, so there is no second drawing to keep in step.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const mounted: ReactTestRenderer[] = [];
function draw(props: Partial<React.ComponentProps<typeof BuildingProgrammeView>> = {}): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <BuildingProgrammeView
        days={4}
        weight={78}
        unit="kg"
        fill={1}
        muscles={[]}
        {...props}
      />,
    );
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

const figure = (r: ReactTestRenderer) => r.root.findAllByType(BodyMapFigure)[0];

const CHEST = { muscle: 'Chest', lifts: [{ name: 'Barbell Bench Press' }, { name: 'Chest Dip' }] };
const BACK = { muscle: 'Back', lifts: [{ name: 'Pull-Up' }] };

describe('the body is the instrument', () => {
  it('⛔ every muscle the engine has allocated is LIT, and every other one is DARK', () => {
    /*
     * ⚠️ THE DARKNESS IS STATED, NOT LEFT TO A DEFAULT — and for an hour it was not. A muscle
     * absent from a body map is `normal`, which the figure draws in CREAM, so the beat opened on a
     * fully cream body and "filling" it meant nudging each muscle from one light tone to another.
     * **The design is a body that starts dark and lights up**, and this is the line that says so.
     */
    const map = figure(draw({ muscles: [CHEST, BACK] })).props.map;
    expect(map.Chest).toBe('emphasis');
    expect(map.Back).toBe('emphasis');
    expect(map.Quads).toBe('off');
    expect(map.Shoulders).toBe('off');
    expect(Object.values(map).filter((v) => v === 'emphasis')).toHaveLength(2);
  });

  it('⚠️ …and nothing is left to a default — every muscle the figure can draw is named', () => {
    // An unstated muscle is cream, which is the one tone this beat must not open on.
    const map = figure(draw({ muscles: [] })).props.map;
    expect(Object.values(map).length).toBeGreaterThan(6);
    expect(Object.values(map).every((v) => v === 'off')).toBe(true);
  });

  it('⚠️ the figure TURNS to the face carrying the muscle being filled', () => {
    /*
     * Half the muscles are on the back. Without this the light lands on a face she is not looking
     * at, and the beat reads as nothing happening for half its length.
     */
    expect(figure(draw({ muscles: [CHEST] })).props.face).toBe('front');
    expect(figure(draw({ muscles: [CHEST, BACK] })).props.face).toBe('back');
  });

  it('the muscle being filled is the one marked, and it is the LAST one to arrive', () => {
    expect(figure(draw({ muscles: [CHEST, BACK] })).props.selected).toBe('Back');
  });
});

describe('the lifts go INTO it', () => {
  it("⛔ only the current muscle's lifts are on screen — the rest are already in the body", () => {
    /*
     * The moss is what says where the earlier ones went. Keeping their names on screen would make
     * the beat a list again, which is the thing it replaced.
     */
    const said = texts(draw({ muscles: [CHEST, BACK] })).join('|');
    expect(said).toContain('Pull-Up');
    expect(said).not.toContain('Barbell Bench Press');
    expect(said).toContain(tg('muscle.Back').toUpperCase());
  });

  it('⚠️ a lift TRAVELS toward the figure rather than merely fading', () => {
    /*
     * A row that dissolves reads as the screen forgetting it; a row that moves toward the body
     * reads as the body taking it. The two together are what makes the map look filled rather than
     * coloured in.
     */
    const view = read('src/screens/onboarding/BuildingProgrammeView.tsx');
    expect(view).toContain('function LiftIn(');
    expect(view).toMatch(/translateY: \(1 - rise\) \* 14 - draw \* 76/);
    expect(view).toContain('withSequence(');
  });
});

describe('and the closing frame is the whole programme, lit', () => {
  it('⛔ the feed clears the moment the programme has a name', () => {
    /*
     * `current` is still the last muscle at that moment, so the closing beat was the whole body lit
     * — the thing she came for — with one muscle's lift list sitting under it as though the build
     * had stopped mid-calf.
     */
    const said = texts(draw({ muscles: [CHEST, BACK], programmeName: 'Upper / Lower · 4 days a week' })).join('|');
    expect(said).toContain('Upper / Lower · 4 days a week');
    expect(said).not.toContain('Pull-Up');
  });

  it('…and the body holds every muscle it allocated', () => {
    const r = draw({ muscles: [CHEST, BACK], programmeName: 'X', summary: '2 muscles · 3 lifts' });
    const map = figure(r).props.map;
    expect(Object.entries(map).filter(([, v]) => v === 'emphasis').map(([k]) => k).sort()).toEqual(['Back', 'Chest']);
    // Nothing is "being filled" once it is named — the pulse belongs to work in progress.
    expect(figure(r).props.selected).toBeNull();
  });
});

describe('⛔ and every muscle gets its moment', () => {
  /*
   * ⛔ FOUNDER, 2026-08-13: *"זה טס במהירות האור ולא נותן לכל שריר את הרגע שלו. זה צריך ממש להיות
   * אנימציה ארוכה ואיטית. כרגע זה אולי 3 שניות."*
   *
   * The muscle changed every **90 ms** — a value written for the old scrolling list, where a row
   * appearing was the whole event. In this design a lift has a JOURNEY: it rises, sits long enough
   * to read, and travels into the body. At 90 ms every row was replaced before it had finished
   * rising, so **the journey the whole beat is built on never completed on screen once.**
   */
  it('a muscle holds for at least as long as its own lifts need to get into the body', () => {
    // The last lift's journey, in full: its stagger, then rise + hold + travel.
    const journey = (rows: number) => (rows - 1) * LIFT_STEP_MS + LIFT_RISE_MS + LIFT_HOLD_MS + LIFT_TRAVEL_MS;
    for (const rows of [1, 2, 3, 4, 6]) {
      expect(beatFor(rows)).toBeGreaterThan(journey(rows));
    }
    // Slow enough to be watched, not merely longer than before.
    expect(beatFor(2)).toBeGreaterThanOrEqual(1500);
    // And a muscle with more lifts gets more time — the beat is its content, not a constant.
    expect(beatFor(4)).toBeGreaterThan(beatFor(2));
  });

  it('⛔ …and the CLOCK asks the animation rather than holding a second opinion', () => {
    /*
     * ⚠️ THIS IS THE WHOLE FIX. Both halves were internally "correct" while disagreeing by an order
     * of magnitude — the animation knew a lift takes ~1.4 s, the container knew a muscle takes
     * 90 ms, and nothing in the codebase put those two numbers in the same room.
     */
    const clock = read('src/screens/onboarding/BuildingProgramme.tsx');
    expect(clock).toContain('beatFor(');
    expect(clock).not.toMatch(/setShownMuscles\(\(n\) => n \+ 1\), \d/); // never a bare number
    // The last muscle gets the same beat as the rest — it used to get a flat 320 ms.
    expect(clock).toMatch(/setRevealed\(true\), beatFor\(/);
  });

  it('⚠️ the rulers are gone from BOTH sides — the component and the props that fed it', () => {
    /*
     * They stopped being drawn on 2026-08-12 and stayed in the file: a `Ruler` nothing rendered, a
     * `useTravel` clock nothing started, fourteen styles, and four props the container computed and
     * passed on every render. `@ts-nocheck` means none of that says a word.
     */
    const view = read('src/screens/onboarding/BuildingProgrammeView.tsx');
    expect(view).not.toContain('function Ruler(');
    expect(view).not.toContain('function useTravel(');
    // The DEFINITIONS, not the word — the note above the stylesheet names what it removed.
    expect(view).not.toMatch(/^\s*(trackFill|liftScheme|rulers):/m);
    const clock = read('src/screens/onboarding/BuildingProgramme.tsx');
    expect(clock).not.toMatch(/\bfill=\{/);
    expect(clock).not.toContain('displayWeight');
  });
});

describe('⚠️ and it is honest about what it is doing', () => {
  it('⛔ the bars and the scrolling list are gone, not hidden behind a flag', () => {
    const view = read('src/screens/onboarding/BuildingProgrammeView.tsx');
    expect(view).not.toContain('<ScrollView');
    expect(view).toContain('<BodyMapFigure');
  });

  it('⚠️ the figure is not pressable here — it is reporting, not asking', () => {
    // The same component is a control on the map screen. Here she is watching a computation, and a
    // body that answered a press would be offering an edit in the middle of a build.
    expect(figure(draw({ muscles: [CHEST] })).props.onSelect).toBeDefined();
    const view = read('src/screens/onboarding/BuildingProgrammeView.tsx');
    expect(view).toContain('const NOOP = () => {};');
    expect(view).toContain('onSelect={NOOP}');
  });
});
