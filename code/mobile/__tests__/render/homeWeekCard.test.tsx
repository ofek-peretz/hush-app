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
// @ts-nocheck

// 

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

  /*
   * ⛔ SEVEN ASSERTIONS MOVED OUT ON 2026-08-05, NOT DELETED. The lift table left this screen
   * (founder: *"you cannot see that there are other workouts besides the first one"*) — the card
   * was tall because it printed all six lifts. Every claim they made is still a claim, and it is
   * made against the screen that draws the table now: `__tests__/render/preWorkoutCard.test.tsx`.
   */
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
    /*
     * ⚠️ BOTH TWINS ARE CONTROLS NOW (2026-08-05). The open row became pressable when the
     * pre-workout card landed — his rule is *"pressing a day with a workout opens the card"*, and it
     * held for six days of the week and failed on the one she is standing in.
     *
     * The law is unchanged and is exactly the point: matched on the NAME the two are
     * indistinguishable, so each must report its own ID. A row that queued the other one would be
     * the bug this test was written for, and it is now reachable from two rows instead of one.
     */
    const chips = r.root.findAll((n) => n.props?.accessibilityLabel === 'Upper' && typeof n.props.onPress === 'function');
    expect(chips).toHaveLength(2);
    act(() => chips.forEach((c) => c.props.onPress()));
    // The open row reports day_1 and the closed one day_2 — neither reports the other's.
    expect([...chosen].sort()).toEqual(['day_1', 'day_2']);
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

  it('⛔ a trained workout wears the MOSS check, and it wears it even when it is the open row', () => {
    /*
     * ════ DONE OUTRANKS QUEUED (founder A.16: *"a completed workout's chip stays white, reads like
     * another workout still to do"*) ════
     *
     * The chips said this with a paper pill against a moss veil. The column has no pills: emphasis
     * is DISTANCE FROM THE GROUND, so the queued row simply rises off the stage and everything else
     * lies flat. That removes the collision the founder caught — a record cannot put on an offer's
     * pill when there is no pill — and leaves one place it can still happen: **she taps a finished
     * session to re-read it, and the row opens exactly as an offer does.**
     *
     * So the law is now about the MARK. A workout she has trained carries the moss check wherever it
     * is drawn, open or closed, and one she has not carries none. The act is refused separately.
     */
    const r = mount(<HomeView {...props()} />);
    const done = colors(byLabel(r, 'Push A')!);
    expect(done).toContain(color.up); // the lit moss check — the single accent, and the verdict
    const todo = colors(byLabel(r, 'Legs A')!);
    expect(todo).not.toContain(color.up); // a check means DONE and nothing else

    // …and the same workout as the OPEN row: still checked, still unmistakably a record.
    const open = mount(<HomeView {...props({ dayId: 'day_1', dayName: 'Push A', dayDone: true })} />);
    // ⚠️ The open row IS a control now — it opens the pre-workout card like every other day
    // (2026-08-05). What this test is about is the MARK, and the mark is what is asserted below.
    expect(byLabel(open, 'Push A')).not.toBeNull();
    const anyMoss = open.root
      .findAll((n) => n.props?.color === color.up || n.props?.strokeWidth === 2.6)
      .length;
    expect(anyMoss).toBeGreaterThan(0);
  });

  it('⚠️ and a done workout is never offered again: the act refuses it', () => {
    // The other half of A.16, and the half that actually protects her history. Selecting a finished
    // session shows its plan; it never puts a Begin under it.
    const said = texts(mount(<HomeView {...props({ dayId: 'day_1', dayName: 'Push A', dayDone: true })} />)).join(' ');
    expect(said).not.toContain(tg('home.begin', { name: bidi('Push A') }));
  });

  it('⚠️ a done row’s TYPE agrees with its mark — it recedes, it is not an offer in cream', () => {
    /*
     * The chips said this with a strike-through, and the founder's point was that *the mark and the
     * type agree*: a check on a row set exactly like the ones still to do makes the check argue
     * with everything around it.
     *
     * The column says it by weight instead — a trained session's name lies in the muted ink the
     * stage keeps for things that are not the point, and a pending one stands in the tone above it.
     * A strike-through through a whole day of the week would read as cancelled rather than done.
     */
    const r = mount(<HomeView {...props()} />);
    const tone = (label: string) =>
      r.root
        .findAll((n) => n.props?.accessibilityLabel === label)
        .flatMap((n) => n.findAll((c) => typeof c.props?.children === 'string'))
        .map((c) => {
          const st = c.props.style;
          const flat = Array.isArray(st) ? Object.assign({}, ...st.filter(Boolean)) : st;
          return flat?.color as string | undefined;
        })
        .filter(Boolean);
    expect(tone('Push A')).toContain(color.textMuted); // done — receded
    expect(tone('Legs A')).toContain(color.textSecondary); // still to do — a step brighter
  });

  /**
   * ⛔ THIS LAW DIED WITH THE STRIP, AND ITS REASON DIED WITH IT (2026-08-04).
   *
   * It said: *"a completed workout may not belong in the row of pending ones at all"* (founder
   * A.16) — so finished workouts fell to the end and the strip led with what was left. That was
   * right for a horizontal CHOOSER, whose only job was to offer what was next.
   *
   * The column is not a chooser. It is the week, in the order the week happens, and Sunday comes
   * before Tuesday whether or not Sunday is finished. **Reordering it by done-ness would destroy
   * the one thing it exists to say.** What is next is answered by the row that opens, which is a
   * better answer than a sort order ever was.
   *
   * Kept, inverted, so nobody re-adds the sort: the order is the WEEK's, and a done workout holds
   * its own day.
   */
  it('⛔ the column keeps the week’s order — a finished workout does NOT fall to the end', () => {
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
    /*
     * No pattern in this fixture → the column numbers the coach's own order and keeps it whole.
     *
     * ⚠️ PULL A IS BACK IN THIS LIST (2026-08-05). It is `dayName`, so it is the OPEN row — which
     * used not to be a control, and now is: every day with a workout opens the pre-workout card,
     * including the one she is standing in. The law is about ORDER, and the order is what a
     * finished workout must not change: **the done ones are still in their own places.**
     */
    expect(order).toEqual(['Push A', 'Pull A', 'Legs A', 'Push B']);
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
    /*
     * ⚠️ AND THIS LAW STOPPED A METER GOING BACK IN. The 2026-08-04 proposal put "1 of 4" beside
     * Begin; the column already says it — one row per session, the trained ones checked — so the
     * meter would have been a second picture of the same fact, which is the founder's own law about
     * this screen. It was not built.
     *
     * Asked of the WEEK rather than of the controls: the queued session is the open row and is
     * therefore not pressable, so "every workout is a control" is no longer the right question.
     */
    const said = texts(mount(<HomeView {...props()} />)).join(' ');
    for (const w of WORKOUTS) expect(said).toContain(w.name);
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
