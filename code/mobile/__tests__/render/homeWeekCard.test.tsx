/**
 * HOME, AFTER THE 2026-07-13 BATCH — mounted for real.
 *
 * The founder's three findings about Home were all findings about what an athlete can SEE, and a
 * typecheck cannot see anything. So this file mounts the actual screen with real props and asks
 * the questions he asked:
 *
 *   · does the app say what it does?      → Hush's sentence is on the page, in the first person
 *   · is the programme still swallowed?   → the week is a card, and its workouts are on it
 *   · is "done" green?                    → the trained workout wears the sage check, never ink
 *
 * …and the SECOND pass (2026-07-13), where three surfaces for one purpose became one:
 *
 *   · the chips ARE the chooser          → one tap queues a workout, a second tap opens its plan
 *   · the sheet and This-week are gone   → nothing on Home opens a second list of the same week
 *   · cardio has the secondary button    → the run is one tap from Home again
 *   · the update states the COUNT first  → "3 changes this week", then the sentence, then the why
 *   · the name is spoken                 → on a finished week, Hush addresses the athlete
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { HomeView, type HomeViewProps } from '@/screens/home/HomeView';
import { initI18n, tg } from '@/i18n';
import { bidi } from '@/i18n/bidi';
import { color } from '@/design/tokens';

beforeAll(async () => {
  await initI18n();
});

/** The screen reads the safe-area insets, so it is mounted inside a real provider. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

/**
 * Every renderer created in a test is tracked and unmounted in afterEach. The Recovery moment runs
 * an async AsyncStorage read (the once-a-week "seal") whose resolution calls setState; a resting
 * render that is never unmounted lets that promise land AFTER the test, logging on a torn-down tree.
 * Unmounting fires the effect's cleanup (active = false) before the microtask resolves, so the late
 * settle is a no-op — no console noise, and the async seal path is still genuinely exercised.
 */
const mounted: ReactTestRenderer[] = [];

function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  mounted.push(r);
  return r;
}

afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

type Json = { type: string; props: Record<string, unknown>; children: Json[] | null } | string | null;

/** Every string the athlete actually reads on the rendered screen. */
function texts(r: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (n: Json | Json[]): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n.children) n.children.forEach(walk);
  };
  walk(r.toJSON() as unknown as Json);
  return out;
}

/**
 * The node carrying this accessibility label. A Pressable is a COMPOSITE that renders a host View:
 * the label reaches the host, but `onPress` stays on the composite — so a host-only search finds
 * the thing the screen reader sees and nothing the finger can press. Take the first match that can
 * actually be pressed, and fall back to the host node for pure read assertions (colours, text).
 */
function byLabel(r: ReactTestRenderer, label: string): ReactTestInstance | null {
  const hits = r.root.findAll((n) => n.props?.accessibilityLabel === label, { deep: true });
  return hits.find((n) => typeof n.props.onPress === 'function') ?? hits[0] ?? null;
}

/** Every colour anywhere in the rendered style tree (flattened; arrays and nesting included). */
function colors(node: ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (s: unknown): void => {
    if (Array.isArray(s)) return void s.forEach(walk);
    if (s && typeof s === 'object') {
      for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
        if (typeof v === 'string' && /color/i.test(k)) out.push(v);
      }
    }
  };
  const visit = (n: ReactTestInstance): void => {
    walk(n.props.style);
    if (typeof n.props.color === 'string') out.push(n.props.color);
    n.children.forEach((c) => typeof c !== 'string' && visit(c));
  };
  visit(node);
  return out;
}

const WORKOUTS = [
  { id: 'day_1', name: 'Push A', muscles: 'Chest · Shoulders', done: true },
  { id: 'day_2', name: 'Pull A', muscles: 'Back · Biceps' },
  { id: 'day_3', name: 'Legs A', muscles: 'Quads · Glutes' },
];

function props(over: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
    resting: false,
    name: 'Ofek',
    dayName: 'Pull A',
    muscles: 'Back · Biceps',
    trainedThisWeek: 1,
    startError: false,
    weekNumber: 3,
    plan: null,
    planMinutes: 45,
    units: 'kg',
    onForm: () => {},
    workouts: WORKOUTS,
    brief: [{ key: 'home.briefRaisedOne', params: { lift: 'Bench Press', load: '62.5', unit: 'kg' } }],
    briefCount: 3,
    briefUnseen: true,
    onStart: () => {},
    onChooseWorkout: () => {},
    onWeeklyUpdate: () => {},
    ...over,
  };
}

/** The small unseen dot the change pill wears (6×6, borderRadius 3) — found by its shape so
 *  the assertion survives whether byLabel lands on the composite or its host. */
function unseenDots(r: ReactTestRenderer): ReactTestInstance[] {
  return r.root.findAll((n) => {
    const s = n.props.style;
    const flat = Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s;
    return !!flat && flat.width === 6 && flat.height === 6 && flat.borderRadius === 3;
  });
}

describe('the app says what it does', () => {
  /**
   * v7 (2026-07-22): the engine's sentence is NO LONGER spilled onto Today as a framed card. The
   * change count rides a small moss pill on the title; the paragraph lives behind it, on the WHY
   * surface the pill opens. Today states the fact (N changed); the Weekly Update tells the story.
   */
  it('the change count rides a moss pill on the title — not a paragraph on the stage', () => {
    const said = texts(mount(<HomeView {...props()} />)).join(' ');
    expect(said).toContain(tg('home.briefChangesShort', { count: 3 }).toUpperCase());
    // the engine's full sentence is NOT printed on Today — it is one tap away, never a wall of text
    expect(said).not.toContain('I raised your Bench Press');
  });

  it('the pill is a door: it opens the Weekly Update', () => {
    let opened = 0;
    const r = mount(<HomeView {...props({ onWeeklyUpdate: () => void opened++ })} />);
    act(() => {
      byLabel(r, tg('home.briefChanges', { count: 3 }))!.props.onPress();
    });
    expect(opened).toBe(1);
  });

  it('an unread update wears the unseen dot; a read one is quiet', () => {
    expect(unseenDots(mount(<HomeView {...props({ briefUnseen: true })} />)).length).toBeGreaterThan(0);
    expect(unseenDots(mount(<HomeView {...props({ briefUnseen: false })} />))).toHaveLength(0);
  });

  it('states HOW MANY lifts changed — and a steady week shows no pill at all', () => {
    expect(texts(mount(<HomeView {...props({ briefCount: 3 })} />)).join(' ')).toContain(
      tg('home.briefChangesShort', { count: 3 }).toUpperCase(),
    );
    // Zero changes = no pill, no text. The "no changes" sentence belongs to the WHY surface, not
    // to Today, which would otherwise carry a label explaining that nothing happened.
    const rSteady = mount(<HomeView {...props({ briefCount: 0 })} />);
    expect(byLabel(rSteady, tg('home.briefChanges', { count: 3 }))).toBeNull();
    expect(texts(rSteady).join(' ')).not.toContain(tg('home.briefNoChanges'));
  });
});

describe('the week is on the page, and it is a door', () => {
  it('every workout of the week is a chip', () => {
    const said = texts(mount(<HomeView {...props()} />)).join(' ');
    for (const w of WORKOUTS) expect(said).toContain(w.name);
  });

  it('a chip QUEUES that workout — choosing never leaves Home (the sheet is gone)', () => {
    const chosen: string[] = [];
    const r = mount(
      <HomeView {...props({ onChooseWorkout: (id: string) => void chosen.push(id) })} />,
    );
    act(() => {
      byLabel(r, 'Legs A')!.props.onPress(); // not the queued one → it becomes the queued one
    });
    expect(chosen).toEqual(['day_3']);
    /*
     * "…and nothing was pushed on top of Home" used to be asserted here through an `onOpenWorkout`
     * prop. That prop was deleted with the second act (S-73) and the assertion had been VACUOUS
     * ever since — a handler nothing calls can never be called. It is a compile error to pass it
     * now that the tests are typechecked, which is a stronger guarantee than the assertion ever
     * was: the component has no door to push through, so there is nothing to catch at runtime.
     */
  });

  /**
   * ONE CONTROL, ONE ACT (2026-07-17). This used to assert the opposite — "a second tap on the
   * QUEUED chip opens its plan — swap, pin and the form clip" — and it was stale twice over: swap
   * and pin were deleted with the edit screen (S-73), and the hidden second tap was a guessing game
   * the view itself admitted to ("an athlete cannot be expected to guess the second"), paid for
   * with a line of instructions underneath.
   *
   * The plan's door is the meta line now (it says "6 exercises", so it is the obvious thing to
   * press to see them). A chip queues. That is the whole of it.
   */
  it('the QUEUED chip does not hide a second act — it just queues', () => {
    const chosen: string[] = [];
    const r = mount(
      <HomeView {...props({ onChooseWorkout: (id: string) => void chosen.push(id) })} />,
    );
    act(() => {
      byLabel(r, 'Pull A')!.props.onPress(); // Pull A === dayName, i.e. already queued
    });
  });

  /**
   * THE PLAN IS ON THE PAGE (founder 2026-07-17: "the athlete should know, already from Home, what
   * is waiting for him in today's workout"). There is no door to it any more, and no screen behind
   * one: the lifts and the loads Hush set are simply here. `ProgramDetail` — which listed the same
   * lifts and left the LOAD out, the one number the engine decided — is deleted.
   */
  it("today's lifts are on Home, with the loads the engine set", () => {
    const r = mount(
      <HomeView
        {...props({
          plan: [
            { exerciseId: 'bb_bench_press', name: 'Bench Press', load: 80, sets: 3, band: [8, 10] as [number, number] },
            { exerciseId: 'pull_up', name: 'Pull-Up', load: null, sets: 3, band: [10, 12] as [number, number] },
          ],
        })}
      />,
    );
    const said = texts(r).join(' ');
    expect(said).toContain('Bench Press');
    // v7 splits the figure into styled spans — the load (moss when changed), its unit, and the
    // scheme — so assert the facts rather than one glued string: the load, and the BAND (not Tlo).
    expect(said).toContain('80');
    expect(said).toContain('3×8–10');
    // A bodyweight lift states the reps and invents no weight.
    expect(said).toContain('3×10–12');
    expect(said).not.toMatch(/null|undefined|NaN/);
  });

  it('a lift row opens its form clip — the last job the deleted plan screen was doing', () => {
    const formed: string[] = [];
    const r = mount(
      <HomeView
        {...props({
          plan: [{ exerciseId: 'bb_bench_press', name: 'Bench Press', load: 80, sets: 3, band: [8, 10] as [number, number] }],
          onForm: (id: string) => void formed.push(id),
        })}
      />,
    );
    act(() => byLabel(r, 'Bench Press · 80 kg · 3×8–10')!.props.onPress());
    expect(formed).toEqual(['bb_bench_press']);
  });

  /**
   * ════ THE UNIT IS BESIDE THE LOAD (founder A.5, build 36: "the unit is missing") ════
   *
   * v7 2.1 removed it deliberately — the plan is a column of loads in one declared unit, and six
   * "kg"s turn a scannable column into six sentences. He overturned that on the device. The row
   * already ends in a scheme ("· 3×8–10"), so the number was never standing alone in a bare column;
   * it was a bare number inside a sentence, and a weight without a unit is not a weight.
   */
  it('every load on Today names its unit — and a bodyweight lift names none', () => {
    const kg = texts(
      mount(
        <HomeView
          {...props({
            plan: [
              { exerciseId: 'bb_bench_press', name: 'Bench Press', load: 80, sets: 3, band: [8, 10] as [number, number] },
              { exerciseId: 'pull_up', name: 'Pull-Up', load: null, sets: 3, band: [10, 12] as [number, number] },
            ],
          })}
        />,
      ),
    ).join('|');
    expect(kg).toContain(' kg');
    // Exactly one — the loaded lift's. A bodyweight row invents no unit for a weight it has not got.
    expect(kg.match(/ kg/g)).toHaveLength(1);

    // …and it follows HER setting, not the stored kg.
    const lb = texts(
      mount(
        <HomeView
          {...props({
            units: 'lb',
            plan: [{ exerciseId: 'bb_bench_press', name: 'Bench Press', load: 80, sets: 3, band: [8, 10] as [number, number] }],
          })}
        />,
      ),
    ).join('|');
    expect(lb).toContain(' lb');
    expect(lb).not.toContain(' kg');
  });

  /**
   * ════ A LIFT'S NAME IS NEVER CLIPPED (founder A.15: "a long exercise name truncates with an
   * ellipsis — needs a real solution") ════
   *
   * The real solution is that it wraps. The name was clamped to one line, so the catalog's longest
   * ("Overhead Triceps Extension") arrived as "Overhead Triceps Ex…" — and the tail is exactly the
   * word that separates two lifts of the same family. The FIGURE stays on one line: it is the fact
   * the row exists for and it must never wrap away from its own load.
   */
  it('a long lift name wraps — nothing on the plan is clamped to one line', () => {
    const r = mount(
      <HomeView
        {...props({
          plan: [
            { exerciseId: 'oh_tri_ext', name: 'Overhead Triceps Extension', load: 27.5, sets: 3, band: [10, 12] as [number, number] },
          ],
        })}
      />,
    );
    const said = texts(r).join(' ');
    expect(said).toContain('Overhead Triceps Extension'); // whole, in the tree
    // …and the node carrying it is unclamped, which is the only thing that decides whether RN
    // ellipsises it. (A one-line clamp is invisible to a text assertion — the string is still there.)
    // (the name is BiDi-isolated, so match on containment, not equality)
    const name = r.root.findAll((n) =>
      n.children.some((c) => typeof c === 'string' && c.includes('Overhead Triceps Extension')),
    );
    expect(name.length).toBeGreaterThan(0);
    expect(name.every((n) => n.props.numberOfLines == null)).toBe(true);
  });

  /**
   * …and the other half of A.15, which is what actually decides how often it has to wrap: the
   * figure's META MAY NOT COMPETE WITH ITS LOAD for the row's width. The load carries the founder's
   * 2026-07-28 enlargement (17 pt); the unit and the scheme are captions on it and stay at the
   * canonical 13.5. Set at the same size, the figure took 158 of the row's 330 px and pushed
   * "Dumbbell Romanian Deadlift" onto a THIRD line. This is a measurement jest cannot make, so the
   * law is held where it is decided — in the type sizes.
   */
  it('the unit and the scheme are set smaller than the load they annotate', () => {
    const r = mount(
      <HomeView
        {...props({
          plan: [{ exerciseId: 'bb_bench_press', name: 'Bench Press', load: 80, sets: 3, band: [8, 10] as [number, number] }],
        })}
      />,
    );
    const size = (fragment: string): number => {
      const node = r.root.findAll((n) => n.children.some((c) => typeof c === 'string' && c.includes(fragment)))[0];
      const s = node.props.style;
      const flat = Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : s;
      // The load's own span carries no size — it inherits the figure's. Walk up for it.
      if (flat?.fontSize) return flat.fontSize;
      const parent = r.root.findAll((n) => n.findAll((c) => c === node).length > 0 && n.props.style);
      const pf = parent.map((p) => (Array.isArray(p.props.style) ? Object.assign({}, ...p.props.style.flat(Infinity).filter(Boolean)) : p.props.style));
      return pf.map((x) => x?.fontSize).filter(Boolean).pop() as number;
    };
    const load = size('80');
    expect(load).toBe(17); // the founder's enlargement, unchanged
    expect(size('kg')).toBeLessThan(load);
    expect(size('3×8–10')).toBeLessThan(load);
  });

  /**
   * A finished workout is a RECORD, not an offer (founder 2026-07-11) — and a record can be read.
   * Its chip selects like any other and its lifts appear; the gate moved off the VIEW and onto the
   * ACT, where it belongs. It used to be gated here, which meant a done chip fell through to the
   * next workout and quietly showed the WRONG plan under the right name.
   */
  it('a finished workout is a record: its chip shows its plan, and the button will not start it', () => {
    const chosen: string[] = [];
    const r = mount(<HomeView {...props({ onChooseWorkout: (id) => void chosen.push(id) })} />);
    act(() => {
      byLabel(r, 'Push A')!.props.onPress(); // done: true
    });
    expect(chosen).toEqual(['day_1']); // it selects — the container decides what that shows

    // …and when the container hands back a done day, the act is gone, not merely disabled.
    const done = texts(mount(<HomeView {...props({ dayDone: true })} />)).join(' ');
    expect(done).toContain(tg('program.doneThisWeek'));
    expect(done).not.toContain(tg('home.begin', { name: bidi('Pull A') }));
  });

  /**
   * DELETED, WITH ITS SUBJECT (2026-07-17). This asserted that Home printed "Tap to queue a workout
   * · tap it again to open it" — a label teaching a gesture, which is the clearest instance of the
   * founder's law: "the moment you start explaining everything, you are not letting the button
   * explain itself." The hint is gone because the thing it was apologising for is gone.
   *
   * What replaces it is the assertion that the screen still teaches — through the CONTROL, not a
   * caption: a chip that queues, and a line that says "6 exercises" and opens them (above).
   */
  it('no line on Home explains what a tap does — the controls do that themselves', () => {
    const all = texts(mount(<HomeView {...props()} />)).join(' ');
    expect(all).not.toMatch(/tap it again|לחיצה נוספת/i);
  });

  it('a chip knows itself by ID, never by name — two workouts may be called the same thing', () => {
    // Both are "Upper". Matching on the NAME would light both chips as "queued" and turn a tap
    // meant to QUEUE the second one into a tap that opens the first one's plan.
    const twins = [
      { id: 'day_1', name: 'Upper', muscles: 'Chest' },
      { id: 'day_2', name: 'Upper', muscles: 'Back' },
    ];
    const chosen: string[] = [];
    const r = mount(
      <HomeView
        {...props({
          workouts: twins,
          dayName: 'Upper',
          dayId: 'day_1',
          onChooseWorkout: (id) => void chosen.push(id),
        })}
      />,
    );
    const chips = r.root.findAll((n) => n.props?.accessibilityLabel === 'Upper' && typeof n.props.onPress === 'function');
    act(() => chips[1].props.onPress()); // the one that is NOT queued
    expect(chosen).toEqual(['day_2']);
    // The law is the SELECTED state: matching on the name would light both twins as queued. It is
    // read from the id, so exactly one is.
    expect(chips.filter((c) => c.props.accessibilityState?.selected)).toHaveLength(1);
  });

  /**
   * Unchanged law, and it matters MORE now: a chip repaints the plan list under the button. While a
   * session is waiting to be resumed the button says "Continue Pull A", so a chip that swapped the
   * list beneath it would be showing Legs A's lifts under a button that starts Pull A. There is one
   * act on the screen until she finishes or abandons it, and the chips say so rather than pretending
   * otherwise — they stand down, and announce that to VoiceOver too.
   */
  it('an interrupted workout owns the CTA — the chips stand down behind it', () => {
    const chosen: string[] = [];
    const r = mount(
      <HomeView {...props({ resumable: { workoutName: 'Pull A' }, onChooseWorkout: (id) => void chosen.push(id) })} />,
    );
    const legs = byLabel(r, 'Legs A')!;
    expect(legs.props.accessibilityState?.disabled).toBe(true);
    act(() => legs.props.onPress?.());
    expect(chosen).toEqual([]);
  });

  it('a trained workout wears the MOSS check, and the queued one LIFTS — never confusable', () => {
    // Under v7 "All Dark" the queued chip LIFTS off the dark stage toward the light: it is a PAPER
    // pill (cream ground, dark ink), not the harsh #fff — cream copy on #fff would be invisible.
    // The done chip is the other pole: a moss check on a moss veil. The one law that must hold is
    // that the two never share a colour — no paper on the done chip, no moss on the queued one.
    const r = mount(<HomeView {...props()} />);

    // Done: the moss mark on the moss veil. (Its LABEL is cream, as all legible copy is — it is
    // the MARK that carries the verdict, not the text.)
    const doneChip = colors(byLabel(r, 'Push A')!);
    expect(doneChip).toContain(color.up); // the lit moss check/border (== the single accent)
    expect(doneChip).not.toContain(color.paper); // done is moss, never the queued paper pill

    // Queued: the paper pill, and no check — a check means DONE and nothing else.
    const queuedChip = colors(byLabel(r, 'Pull A')!);
    expect(queuedChip).toContain(color.paper);
    expect(queuedChip).not.toContain(color.up); // no moss on the queued chip at all
  });

  /**
   * ════ DONE OUTRANKS QUEUED (founder A.16: "a completed workout's chip stays white, reads like
   * another workout still to do") ════
   *
   * The two states were both real and the styles were simply applied in the wrong order — `current`
   * last, so it won. A finished workout can be SELECTED (tapping it re-reads its plan, founder
   * 2026-07-17), and the moment it was, it put on the cream pill of something still to do. The check
   * icon was left arguing against the whole rest of the chip.
   *
   * The law is not about which style object wins. It is that a record may never wear the skin of an
   * offer — whatever else is true of it.
   */
  it('a DONE workout that is also the selection never wears the queued paper pill', () => {
    const r = mount(<HomeView {...props({ dayId: 'day_1', dayName: 'Push A', dayDone: true })} />);
    const chip = byLabel(r, 'Push A')!;
    expect(chip.props.accessibilityState?.selected).toBe(true); // it IS the selection…
    expect(colors(chip)).not.toContain(color.paper); // …and it is still, unmistakably, done
    expect(colors(chip)).toContain(color.up);
  });

  it('a done chip is struck through — the mark and the type agree', () => {
    const r = mount(<HomeView {...props()} />);
    const struck = (label: string) =>
      r.root
        .findAll((n) => n.props?.accessibilityLabel === label)
        .some((n) =>
          n.findAll((c) => {
            const s = c.props.style;
            const flat = Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s;
            return flat?.textDecorationLine === 'line-through';
          }).length > 0,
        );
    expect(struck('Push A')).toBe(true); // done
    expect(struck('Legs A')).toBe(false); // still to do
  });

  /**
   * "A completed workout may not belong in the row of pending ones at all" (founder A.16). It
   * doesn't: it falls to the end. Today answers "what is up next", so the strip has to LEAD with
   * what is left. This is the canonical v7 handoff's own move — on the wrist the done workout is
   * struck through and pushed to the foot of the list with `margin-top:auto`.
   */
  it('the strip leads with what is LEFT — finished workouts fall to the end', () => {
    const r = mount(
      <HomeView
        {...props({
          workouts: [
            { id: 'day_1', name: 'Push A', muscles: '', done: true },
            { id: 'day_2', name: 'Pull A', muscles: '' },
            { id: 'day_3', name: 'Legs A', muscles: '', done: true },
            { id: 'day_4', name: 'Push B', muscles: '' },
          ],
        })}
      />,
    );
    const order = r.root
      .findAll((n) => typeof n.props?.accessibilityLabel === 'string' && typeof n.props.onPress === 'function')
      .map((n) => n.props.accessibilityLabel as string)
      .filter((l) => ['Push A', 'Pull A', 'Legs A', 'Push B'].includes(l));
    expect(order).toEqual(['Pull A', 'Push B', 'Push A', 'Legs A']);
  });
});

/**
 * THE LIST HOLDS ITS PLACE WHILE THE FIGURES ARRIVE (founder A.12 — "tapping the chips flickers").
 * The container's half of this law lives in `__tests__/domain/homePlan.test.ts`; this is the view's:
 * a pending row is a real row with a real name, and it draws NO figure — a blank column must never
 * be read as a lift that carries no weight.
 */
describe('a chip tap repaints the plan without emptying it', () => {
  const PENDING = [
    { exerciseId: 'bb_bench_press', name: 'Bench Press', load: null, sets: 4, band: [8, 8] as [number, number], pending: true },
    { exerciseId: 'bb_row', name: 'Barbell Row', load: null, sets: 4, band: [8, 8] as [number, number], pending: true },
  ];

  it('pending rows still name their lifts', () => {
    const said = texts(mount(<HomeView {...props({ plan: PENDING })} />)).join(' ');
    expect(said).toContain('Bench Press');
    expect(said).toContain('Barbell Row');
  });

  it('…and state no load, no unit and no scheme until the engine has answered', () => {
    const said = texts(mount(<HomeView {...props({ plan: PENDING })} />)).join('|');
    expect(said).not.toContain('4×8');
    expect(said).not.toContain(' kg');
    expect(said).not.toMatch(/null|undefined|NaN/);
  });

  it('a pending row is still a door to the form clip', () => {
    const formed: string[] = [];
    const r = mount(<HomeView {...props({ plan: PENDING, onForm: (id: string) => void formed.push(id) })} />);
    act(() => byLabel(r, 'Bench Press')!.props.onPress());
    expect(formed).toEqual(['bb_bench_press']);
  });
});

describe('cardio is its own tab now — it does not rival the one act on Today', () => {
  it('does NOT appear on the training-state Home — it moved to the tab bar (v7)', () => {
    // The run link that used to sit under Begin is gone: Cardio is a peer TAB now, one tap from
    // anywhere, so putting it back on Today would be a second act competing with the first.
    const r = mount(<HomeView {...props()} />);
    expect(byLabel(r, tg('cardio.title'))).toBeNull();
  });

  it('does not come back on the RECOVERY day either (founder 2026-07-27)', () => {
    // It used to return here, on the argument that a run IS the rest day's act. The founder closed
    // that: cardio has its own seat in the tab bar, so a card on the week's close was the same door
    // offered twice. The week is done; the tab is where a run lives.
    const r = mount(<HomeView {...props({ resting: true, dayName: null })} />);
    expect(byLabel(r, tg('cardio.title'))).toBeNull();
  });
});

/**
 * THE SCREEN DOES NOT STUTTER (founder 2026-07-14).
 *
 * Home said "Upper B" three times — the hero, the button, the chip — and stated the week's count
 * twice. A screen that repeats itself is a screen that does not trust its own hierarchy, and the
 * repetition is exactly what made the light surfaces read as "another nice app" next to the stage.
 * Each fact is now carried by the one element that earns it, and these are the tests that keep it
 * that way: they FAIL if a name or a count comes back for a second helping.
 */
describe('the screen does not stutter', () => {
  /**
   * The law is the COUNT — exactly two mentions — and the test below it is the one that guards it.
   * This one guarded which two, and that changed on 2026-07-17: the 60pt Display is gone, because
   * the plan it used to sit above now lists the lifts and their loads, and a name shouted over its
   * own content is the screen distrusting itself. The second mention moved onto the ACT, which is
   * where a name is worth most — a bare "Begin" under six named lifts would be the button declining
   * to say what it is about to start.
   */
  it('the primary act names the workout', () => {
    const said = texts(mount(<HomeView {...props()} />)).join(' ');
    expect(said).toContain(tg('home.begin', { name: bidi('Pull A') }));
  });

  it('the queued workout is named THREE times: the serif headline, the act, and its lit chip', () => {
    // v7 (2026-07-22) restores the big serif headline, so the name is set THREE places on purpose:
    // the coach names the session (title), the button says it as it starts it, and the lit chip
    // says it a third time only while it is the selection. That is hierarchy, not an echo.
    const named = texts(mount(<HomeView {...props()} />)).filter((s) => s.includes('Pull A'));
    expect(named).toHaveLength(3);
  });

  it('training Home carries NO numeric week meter — the chips are the only picture of the count', () => {
    // v7 dissolved the week card, and with it the "1 / 3" meter. The chips (one per workout, the
    // done one checked) ARE the count now; a numeric meter above them would be a second picture of
    // the same fact. (The meter survives only in RECOVERY, where "3 / 3" is the closing verdict.)
    const counted = texts(mount(<HomeView {...props()} />)).filter((s) => s.includes('/ 3'));
    expect(counted).toHaveLength(0);
    const r = mount(<HomeView {...props()} />);
    for (const w of WORKOUTS) expect(byLabel(r, w.name)).not.toBeNull();
  });

  it('an INTERRUPTED session keeps its name — there it is a fact, not an echo', () => {
    // "Continue …" names a workout the hero is not necessarily showing, so the name carries
    // information rather than repeating it. The rule is about echoes, not about names.
    const said = texts(mount(<HomeView {...props({ resumable: { workoutName: 'Legs A' } })} />)).join(' ');
    expect(said).toContain(tg('home.continueWorkout', { name: bidi('Legs A') }));
  });
});

describe('the name', () => {
  it('is spoken when the week is closed — and the copy still reads without one', () => {
    const named = texts(mount(<HomeView {...props({ resting: true, dayName: null })} />)).join(' ');
    expect(named).toContain('Ofek');
    const anonymous = texts(
      mount(<HomeView {...props({ resting: true, dayName: null, name: undefined })} />),
    ).join(' ');
    expect(anonymous).toContain(tg('home.restSub'));
    expect(anonymous).not.toContain('undefined');
  });
});
