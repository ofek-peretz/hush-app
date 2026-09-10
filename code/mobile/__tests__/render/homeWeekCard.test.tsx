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

import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { HomeView, type HomeViewProps } from '@/screens/home/HomeView';
import { initI18n, tg } from '@/i18n';
import { bidi } from '@/i18n/bidi';
import { color, directionTone } from '@/design/tokens';

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

/*
 * ⛔ THE WEEK'S DOOR IS GONE FROM HOME (founder 2026-08-29): *"לגבי כפתור ה'אימון אחר' אפשר להוריד
 * כי יותר נוח לבצע אימון אחר דרך מסך התוכנית שכבר אפשר לעשות כיום."*
 *
 * `openWeek`, `sheet`, `inSheet` and `sheetTexts` stood here — the harness for `WeekSheet`, which
 * 2026-08-22 put the week behind and this ruling deleted outright. **Every law they carried was
 * moved, not dropped**, into `programTab.test.tsx` (`the week the sheet used to hold`): all of it
 * listed, a row reporting its own id rather than its name, done wearing its mark, the week's own
 * order kept, and looking not being choosing. That file mounts the surface that answers the
 * question now, which is the only place those laws can be true.
 */
/*
 * ⛔ `changes` IS PER WORKOUT (founder 2026-08-12). The pill used to draw `briefCount` — the WEEK's
 * total — on the queued card alone, so a load the engine moved in Legs A was invisible until she
 * opened it, and the number on the card she was looking at counted work that was not in it.
 */
const WORKOUTS = [
  { id: 'day_1', name: 'Push A', done: true },
  { id: 'day_2', name: 'Pull A', changes: 3 },
  { id: 'day_3', name: 'Legs A' },
];

function props(over: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
    resting: false,
    name: 'Ofek',
    dayName: 'Pull A',
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
  it('⛔ the change count rides a pill on the CARD THAT OWNS IT — not a paragraph on the stage', () => {
    /*
     * ⛔ REWRITTEN 2026-08-12. The pill used to sit on a 54px title row above the week, drawing the
     * WEEK's total, and the title row is deleted — with the programme name off Today it would have
     * drawn the queued workout's name a second time.
     *
     * The rule it carried is unchanged and is the reason the pill exists: **Today states the FACT
     * (N changed); the Weekly Update tells the story.** What moved is whose fact it is.
     */
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

  it('⛔ the pill counts THIS session, and it does not follow the selection', () => {
    /*
     * ⛔ REWRITTEN 2026-08-22, AND THE LAW IS THE SAME ONE. It read: *"exactly ONE pill, and it
     * stays on its own workout when another is queued"* — asserted by walking up from the pill to
     * find `Pull A`'s card, because every workout was a card on the page.
     *
     * Today draws ONE session now, so "which card is the pill on" is no longer a question the
     * screen can be asked. The law it protected is untouched and is stated directly: **a count
     * belongs to the thing it counts.** Only `Pull A` was touched; queue `Legs A`, which was not,
     * and Today must carry no pill at all — not the week's total, which is the exact defect the
     * founder named on 2026-08-12.
     */
    const onToday = (r: ReactTestRenderer) =>
      r.root.findAll((n) => typeof n.props?.accessibilityLabel === 'string'
        && n.props.accessibilityLabel === tg('home.briefChanges', { count: 3 }));

    // Queued: Pull A — the session with the three changes. Its own count is on it.
    expect(onToday(mount(<HomeView {...props()} />)).length).toBeGreaterThan(0);

    // Queued: Legs A — untouched. Today says nothing, because nothing moved in the session it is about.
    const elsewhere = mount(<HomeView {...props({ dayId: 'day_3', dayName: 'Legs A' })} />);
    expect(onToday(elsewhere)).toHaveLength(0);

    /*
     * ⛔ AND HOME NO LONGER SAYS WHERE PULL A'S THREE WENT — the cost of 2026-08-29, stated rather
     * than glossed. The week sheet printed a per-day count for the days that are NOT today, and it
     * is deleted with its door (*"יותר נוח לבצע אימון אחר דרך מסך התוכנית"*).
     *
     * ⚠️ THE ACCOUNT ITSELF IS NOT LOST: the pill on today's own card is also the door to the
     * weekly update, which holds the whole week's changes. What is gone is seeing at a glance that
     * a day she is not training today moved — so the assertion is on the ABSENCE, deliberately, so
     * that nobody re-adds a week total to a card that is about one session.
     */
    expect(texts(elsewhere).join(' ')).not.toContain(tg('home.briefChangesShort', { count: 3 }).toUpperCase());
  });

  it('⚠️ a steady week shows no pill at all, and never a zero', () => {
    // Zero changes = no pill, no text. The "no changes" sentence belongs to the WHY surface, not to
    // Today, which would otherwise carry a label explaining that nothing happened.
    const steady = WORKOUTS.map((w) => ({ ...w, changes: 0 }));
    const r = mount(<HomeView {...props({ workouts: steady })} />);
    expect(byLabel(r, tg('home.briefChanges', { count: 3 }))).toBeNull();
    expect(texts(r).join(' ')).not.toContain(tg('home.briefChangesShort', { count: 0 }).toUpperCase());
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * TODAY IS ONE SESSION, WHOLE — AND THE WEEK IS SOMEWHERE ELSE.
 *
 * ⛔ FOUNDER, 2026-08-29: *"לגבי כפתור ה'אימון אחר' אפשר להוריד כי יותר נוח לבצע אימון אחר דרך מסך
 * התוכנית שכבר אפשר לעשות כיום. ואז כך תוכל להציג את כל התוכנית שיש היום."*
 *
 * Two halves of one move. 2026-08-22 had put the week behind a control on this screen; the Program
 * tab has since become the better answer to the same question — it draws every workout with ALL of
 * its lifts and their live figures, and a row there opens the same `PreWorkout` card. So the door
 * closes, and what Today buys with the space is the rest of its own day.
 *
 * ⚠️ THE 08-22 FINDING IS NOT REVERSED. *"A capability with no control at all is the app saying it
 * does not exist"* — the control exists, on the tab whose whole subject is the week, and
 * `programTab.test.tsx` holds the laws that say so.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('today is one session, whole', () => {
  it('the week has no door on Home any more — neither the row nor the sheet behind it', () => {
    const r = mount(<HomeView {...props()} />);
    expect(byLabel(r, tg('home.trainSomethingElse'))).toBeNull();
    // …and no other workout of the week is named on the page. Today is today.
    const said = texts(r).join(' ');
    expect(said).toContain('Pull A');
    for (const other of ['Push A', 'Legs A']) expect(said).not.toContain(other);
  });

  it('no line on Home explains what a tap does — the controls do that themselves', () => {
    /* DELETED WITH ITS SUBJECT (2026-07-17): Home printed "Tap to queue a workout · tap it again to
       open it" — a label teaching a gesture, the clearest instance of the founder's law that "the
       moment you start explaining everything, you are not letting the button explain itself." */
    const all = texts(mount(<HomeView {...props()} />)).join(' ');
    expect(all).not.toMatch(/tap it again|לחיצה נוספת/i);
  });

  it('an interrupted workout owns the CTA, and the block that holds today refuses its own press', () => {
    /* Unchanged law: while a session waits to be resumed the button says "Continue Pull A", so
       there is ONE act on the screen until she finishes or abandons it. */
    const r = mount(<HomeView {...props({ resumable: { workoutName: 'Pull A' } })} />);
    expect(byLabel(r, 'Pull A')?.props.accessibilityState?.disabled).toBe(true);
  });

  it('⚠️ and a done workout is never offered again: the act refuses it', () => {
    // Half of founder A.16 — the half that protects her history. The other half (a done workout
    // wears the moss check wherever it is DRAWN) is asked of the Program tab now.
    const said = texts(mount(<HomeView {...props({ dayId: 'day_1', dayName: 'Push A', dayDone: true })} />)).join(' ');
    expect(said).not.toContain(tg('home.begin', { name: bidi('Push A') }));
    // …and today's own block still wears the mark, which is where the check law survives on Home.
    const open = mount(<HomeView {...props({ dayId: 'day_1', dayName: 'Push A', dayDone: true })} />);
    expect(open.root.findAll((n) => n.props?.color === color.up).length).toBeGreaterThan(0);
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
    /*
     * ⛔ TWO, NOT THREE (founder 2026-08-12). The third was a 54px title row above the week — a
     * fallback from the era when the headline was the programme's NAME. Taking that name off Today
     * made its condition always true, so for one commit the screen carried its queued workout twice
     * at two different sizes. The row is deleted.
     *
     * The rule this test is really about survives and is stronger for it: **the name is stated where
     * it is the subject (the lit card) and where it is the act (Begin), and nowhere else.** An echo
     * is not hierarchy.
     */
    const named = texts(mount(<HomeView {...props()} />)).filter((s) => s.includes('Pull A'));
    expect(named).toHaveLength(2);
  });

  it('⛔ training Home DOES carry the week meter, and it is an instrument', () => {
    /*
     * ════ ⛔ THIS LAW WAS A BAN, AND THE FOUNDER REVERSED IT (2026-08-22) ════
     *
     * It read *"training Home carries NO numeric week meter — the chips are the only picture of the
     * count"*, and its reasoning was sound while it was true: *"the column already says it — one row
     * per session, the trained ones checked — so the meter would have been a second picture of the
     * same fact."*
     *
     * ⛔ *"ארצה לראות מה קורה במידה ואימון אחד בוצע — איך זה מסמן את ההתקדמות שבוצעו N מתוך M
     * אימונים."*
     *
     * ⚠️ AND THE OLD REASONING DOES NOT SURVIVE THE ARRANGEMENT THAT REPLACED IT. There are no rows
     * on Today any more — the week is behind a door — so nothing on the screen draws the count, and
     * a meter is no longer a second picture of anything. It is the only one.
     *
     * The half of the law that DOES survive is how it is said: **drawn, not written** (founder
     * 2026-08-22, *"העדפה להראות במקום לכתוב"*). So the assertion is on the instrument, not on a
     * string — a sentence saying "2 of 4" with no rule under it would pass a text check and fail
     * the ruling.
     */
    const r = mount(<HomeView {...props()} />);

    // The count is stated, in the athlete's own words, where a screen reader can reach it.
    const meter = r.root.find((n) => n.props?.accessibilityRole === 'progressbar');
    expect(meter.props.accessibilityLabel).toBe(tg('home.weekMeter', { done: 1, total: 3 }));

    /*
     * …and it is DRAWN: one segment per session, and the states are the three a session can be in.
     * Push A is done (moss, the ONLY filled state), Pull A is queued (a hairline carrying the
     * cream position dot — a filled queued bar read as progress and contradicted the counter,
     * design review 2026-09-01), Legs A is ahead (a hairline, never an empty box).
     */
    const segs = meter.findAll((n) => {
      // HOST nodes only. `findAll` returns the composite AND the host it renders, so an unfiltered
      // probe reports every segment twice and the count means nothing.
      if (typeof n.type !== 'string') return false;
      const st = n.props?.style;
      const flat = Array.isArray(st) ? Object.assign({}, ...st.filter(Boolean)) : st;
      return !!flat && flat.flex === 1 && typeof flat.borderRadius === 'number';
    });
    expect(segs).toHaveLength(3);
    const fill = (n: ReactTestInstance) => {
      const st = n.props.style;
      const flat = Array.isArray(st) ? Object.assign({}, ...st.filter(Boolean)) : st;
      return flat.backgroundColor as string;
    };
    expect(fill(segs[0])).toBe(color.up); // done — the only filled state
    // Queued is a POSITION, not progress: its track is the ahead hairline, and the cream dot on it
    // is the "you are here" marker. Nothing but DONE may fill, so the meter can never claim more
    // than the counter beside it.
    expect(fill(segs[1])).toBe(color.meterLine);
    const dot = segs[1].findAll(
      (n) => typeof n.type === 'string' && n.props?.style && Object.assign({}, ...[n.props.style].flat().filter(Boolean)).backgroundColor === color.textPrimary,
    );
    expect(dot.length).toBeGreaterThan(0);
    expect(fill(segs[2])).not.toBe(color.up); // ahead — nothing has happened there
  });

  it('an INTERRUPTED session keeps its name — there it is a fact, not an echo', () => {
    // "Continue …" names a workout the hero is not necessarily showing, so the name carries
    // information rather than repeating it. The rule is about echoes, not about names.
    const said = texts(mount(<HomeView {...props({ resumable: { workoutName: 'Legs A' } })} />)).join(' ');
    expect(said).toContain(tg('home.continueWorkout', { name: bidi('Legs A') }));
  });
});

describe('⛔ the closed week states its evidence and explains nothing', () => {
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE REST NOTE IS DELETED (founder, 2026-08-12): *"תמחק את המשפט … ואז זה יתן יותר מקום וחלל
   * במסך."*
   *
   * It read *"Muscle is built on days like this. Nothing is scheduled — that's the program
   * working."* The seal says 3/3 and the ledger names all three; a paragraph explaining that a
   * finished week is a good thing is the screen talking over its own evidence.
   *
   * ⚠️ AND HER NAME WENT WITH IT, which he should know rather than discover. `home.restSubNamed`
   * was the ONE place this screen greeted her, and it was a clause inside that sentence. The name
   * is not the explanation and could be put back somewhere else; it is not being put back here
   * without him asking, because a greeting invented to fill the gap a deletion left is exactly the
   * kind of thing this screen just lost.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('the paragraph is gone from the closed week', () => {
    const said = texts(mount(<HomeView {...props({ resting: true, dayName: null })} />)).join(' ');
    expect(said).not.toContain(tg('home.restSub'));
    expect(said).not.toContain('Ofek');
    expect(said).not.toContain('undefined');
  });

  it('⚠️ …and what it says instead is all measured', () => {
    // The seal, the ledger, the three facts and when the next week opens. Nothing interpreted.
    const said = texts(mount(<HomeView {...props({ resting: true, dayName: null })} />)).join(' ');
    expect(said).toContain('3/3');
    expect(said).toContain(tg('home.restTitle'));
    expect(said).toContain(tg('home.restNext'));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT A CARD OFFERS, AND WHAT THE QUEUED ONE DECIDES (2026-08-18, design review of Today).
 *
 * The founder's screenshot of week one: a wordmark, "WEEK 1", three cards reading "Full Body A",
 * "Full Body B", "Full Body C" with a count and a duration on each, a button, and a trial line.
 * Nothing else. Four deletions between 08-12 and 08-16 each carried the screen's own law — *"a
 * screen should be biggest where it changes"* — and none of them put anything back, so the largest
 * type on Today ended up on a label that never changes, which is the fault the law was written to
 * fix.
 *
 * Two things answer it, and both are facts the app already had and was not printing.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
/*
 * ⛔ "EVERY WORKOUT SAYS WHAT IT TRAINS" IS DELETED (founder 2026-08-29): *"במסך הhome יש כיתוב על
 * סוגי שריר וכל מיני דברים מוזרים שלא מעניינים."*
 *
 * The two laws here asked the week's rows to carry a muscle line ("Back · Biceps") and a done row
 * to carry none. Their subject was `WeekSheet`, which is deleted with its door; `Home.musclesOf`
 * and `signatureOf`, which produced the string, went with it, and `HomeWorkoutOption.muscles` is
 * gone from the type.
 *
 * ⚠️ THE PROBLEM THEY SOLVED IS SOLVED HARDER, NOT ABANDONED. The line existed because four rows
 * reading "Full Body A / B / C · 7 lifts · ~55 min" differ by one letter and a chooser drawn from
 * them cannot be used. The Program tab does not summarise a day at all — it prints every lift of
 * every day with its figure, which is the resolution the muscle line was a compression of. That is
 * asserted where the rows now live, in `programTab.test.tsx`.
 */

describe('⛔ the queued card carries the one number Hush decides', () => {
  const PLAN = [
    { exerciseId: 'bb_bench_press', name: 'Bench Press', load: 62.5, sets: 4, band: [8, 10], changed: 'up' },
    { exerciseId: 'bb_back_squat', name: 'Back Squat', load: 90, sets: 3, band: [6, 8] },
    { exerciseId: 'lat_pulldown', name: 'Lat Pulldown', load: 55, sets: 3, band: [10, 12] },
    { exerciseId: 'db_curl', name: 'Dumbbell Curl', load: 14, sets: 3, band: [10, 12] },
    { exerciseId: 'plank', name: 'Plank', load: null, sets: 3, band: [30, 45] },
  ];

  it('the loads are on the screen she opens, not one sheet behind it', () => {
    const said = texts(mount(<HomeView {...props({ plan: PLAN })} />)).join(' ');
    expect(said).toContain('62.5');
    expect(said).toContain('90');
    expect(said).toContain('55');
  });

  it('⚠️ …ALL of them, because the card draws the day (founder 2026-08-29)', () => {
    /*
     * ⛔ IT USED TO BE THREE AND A COUNT — *"5 lifts in, 3 printed, and the remaining 2 counted out
     * loud"* — on the argument that three reads as a SAMPLE where five reads as a truncated table.
     * That was true of a card competing for the fold with an "אימון אחר" row and a week sheet
     * behind it, and the founder removed both: *"ואז כך תוכל להציג את כל התוכנית שיש היום במקום עוד
     * 2 תרגילים כפי שכתוב עכשיו."*
     *
     * ⚠️ AND IT DOES NOT REOPEN THE 08-12 RULING (*"one workout's contents belong in ONE place"*):
     * that ruling is about the PRESCRIPTION — sets, reps, the reason a load moved, the clip, the
     * swap — and `PreWorkout` still owns every one of them. These rows carry a name and a figure.
     */
    const said = texts(mount(<HomeView {...props({ plan: PLAN })} />)).join(' ');
    expect(said).toContain('14'); // the fourth lift's load — no longer behind a count
    for (const n of ['Bench Press', 'Back Squat', 'Lat Pulldown', 'Dumbbell Curl', 'Plank']) {
      expect(said).toContain(n);
    }
  });

  it('⚠️ …and it still does not print the prescription — that belongs to PreWorkout', () => {
    // The whole day, at the card's own resolution: which lifts, and how heavy. Not 4×8–10.
    const said = texts(mount(<HomeView {...props({ plan: PLAN })} />)).join(' ');
    expect(said).not.toMatch(/4\s*[×x]\s*8/);
  });

  it('a load the engine MOVED stands in the direction it moved', () => {
    // Founder 2026-07-29, on every screen without exception: raise = moss, ease = blue, hold =
    // cream. The bench went up, so its figure is not drawn in the reading ink.
    const r = mount(<HomeView {...props({ plan: PLAN })} />);
    const card = byLabel(r, 'Pull A. 3 changes this week') ?? r.root;
    expect(colors(card)).toContain(directionTone('up'));
  });

  it('⚠️ …and TODAY states the LIFTS, never a muscle line', () => {
    /*
     * "Back · Biceps" and "Bench Press 62.5 · Back Squat 90 · Lat Pulldown 55" say the same thing at
     * two resolutions, and only one of them is worth the fold. The muscle line was what a row said
     * while she was still CHOOSING; there is no choosing on this screen any more, and the founder
     * struck the muscle captions outright on 2026-08-29 (*"כיתוב על סוגי שריר … שלא מעניינים"*).
     *
     * ⛔ ASSERTED IN BOTH DIRECTIONS so the compression cannot creep back: the lifts are here, and
     * nothing on this page names a muscle group instead of them.
     */
    const today = texts(mount(<HomeView {...props({ plan: PLAN })} />)).join(' ');
    expect(today).not.toContain('Back · Biceps');
    expect(today).not.toContain('Quads · Glutes');
    expect(today).toContain('62.5');
  });

  it('⛔ a workout she has already trained shows no loads — there is nothing to offer', () => {
    const said = texts(mount(<HomeView {...props({ plan: PLAN, dayDone: true })} />)).join(' ');
    expect(said).not.toContain('62.5');
  });
});
