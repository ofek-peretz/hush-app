/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE APP SAYS WHAT IT KNOWS — founder, 2026-08-31.
 *
 *   > *"אני חושב שהדבר הכי קריטי כאן הוא משהו פשוט - הסמכות. אם המשתמש מרגיש שבאמת התוכנית אישית,
 *   > מושלמת ובאמת מותאמת ספציפית למטרה ולצרכים של המשתמש יהיה לו דרייב לדבוק בה ולהשקיע ברישום כל
 *   > סט… אם המשתמש מרגיש שזאת סתם תוכנית כללית וגנרית אז זה פחות נותן דרייב."*
 *
 * ── THE DIAGNOSIS ───────────────────────────────────────────────────────────────────────────────
 * Two of the three things authority is made of were already built AND narrated — CONSEQUENCE
 * (`WellDone` draws every engine decision with the reason that earned it) and REFUSAL (the earned
 * light week, the time cap, the pain path). The third was computed everywhere and said nowhere:
 *
 *     **The app told her what it DID. It never told her what it KNEW.**
 *
 * `liftKnowledge` has existed since 2026-08-22 and had exactly one reader — `LiftDetail`, a leaf
 * inside Progress. Her rest median, her execution, the rungs she taught the app by lifting them:
 * all of them ran timers in silence. Consequence without specificity reads as an algorithm
 * adjusting; consequence after specificity reads as a coach.
 *
 * ── ⛔ AND THE ONLY WAY TO GET IT WRONG IS TO FLATTER ────────────────────────────────────────────
 * The moment a line about her is printed on a lift she has never done, "personalised" becomes a
 * word she stops believing — and every gate in this engine (F-8, F-12, F-17, L3, L11) is already
 * built to return null rather than fill a slot. So the law is not "show something": it is
 * **a measured quantity, or silence.**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { DayInMotion } from '@/components/DayInMotion';
import * as fs from 'fs';
import * as path from 'path';
import { factForLift, sessionsWithLift, liftKnowledge } from '@/domain/whatIKnow';
import { REST_COMPOUND_S } from '@/domain/restPrescription';
import { learnedExecSFor } from '@/domain/setDwell';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const BENCH = 'bb_bench_press';
const T = Date.parse('2026-08-01T10:00:00.000Z');

const set = (over = {}) => ({
  exerciseId: BENCH,
  setIndex: 0,
  recommendedWeight: 60,
  recommendedReps: 8,
  actualWeight: 60,
  actualReps: 9,
  edited: false,
  persistedAt: new Date(T).toISOString(),
  ...over,
});
const sess = (id, sets) => ({ id, programDayId: 'd', startedAt: new Date(T).toISOString(), state: 'SAVED', earlyFinish: false, sets });

/** Three real rests on the bench — enough to clear F-17, which is the point of the fixture. */
const withRests = (id = 's1') =>
  sess(id, [
    set({ setIndex: 0 }),
    set({ setIndex: 1, restBeforeS: 74, persistedAt: new Date(T + 160_000).toISOString() }),
    set({ setIndex: 2, restBeforeS: 74, persistedAt: new Date(T + 320_000).toISOString() }),
    set({ setIndex: 3, restBeforeS: 74, persistedAt: new Date(T + 480_000).toISOString() }),
  ]);

describe('⛔ a measured quantity, or silence', () => {
  it('a lift she has never done says NOTHING — day one is silent, and that is the feature', () => {
    expect(factForLift([], BENCH, null)).toBeNull();
  });

  it('…and neither does a null lift, which is a real state on a screen mid-load', () => {
    expect(factForLift([withRests()], null, null)).toBeNull();
    expect(factForLift([withRests()], undefined, null)).toBeNull();
  });

  it('⛔ ONE SET, ONCE, IS NOT A PORTRAIT — it is the app reading its database back to her', () => {
    /*
     * One session, one set: there is a rung, but no rest evidence, no exec pair, and one occurrence.
     * The peak IS true and IS hers, so it is what gets said — a quantity, never "you did a set!".
     */
    const one = [sess('s1', [set()])];
    const fact = factForLift(one, BENCH, null);
    expect(fact).toEqual({ kind: 'peak', value: 60 });
  });

  it('and "once" never becomes a habit — the session count needs two', () => {
    // A lift with a rung is answered by the peak above; strip the load and the count is all there
    // is, and one occurrence is not a pattern she can recognise herself in.
    const once = [sess('s1', [set({ actualWeight: null, recommendedWeight: null })])];
    expect(factForLift(once, BENCH, null)).toBeNull();
    const twice = [
      sess('s1', [set({ actualWeight: null, recommendedWeight: null })]),
      sess('s2', [set({ actualWeight: null, recommendedWeight: null })]),
    ];
    expect(factForLift(twice, BENCH, null)).toEqual({ kind: 'sessions', value: 2 });
  });
});

describe('the order is the argument — the most unguessable true thing wins', () => {
  it('⛔ HER REST LEADS, because it is the number no athlete knows about herself', () => {
    // …and it is checkable within ninety seconds, on the timer she is about to watch.
    expect(factForLift([withRests()], BENCH, 55)).toEqual({ kind: 'rest', value: 74 });
  });

  it('⛔ AND IT IS NEVER THE BOOTSTRAP — below F-17 the app has not measured her', () => {
    const two = [
      sess('s1', [
        set({ setIndex: 0 }),
        set({ setIndex: 1, restBeforeS: 95, persistedAt: new Date(T + 160_000).toISOString() }),
        set({ setIndex: 2, restBeforeS: 100, persistedAt: new Date(T + 320_000).toISOString() }),
      ]),
    ];
    const fact = factForLift(two, BENCH, null);
    expect(fact?.kind).not.toBe('rest');
    expect(fact?.value).not.toBe(REST_COMPOUND_S); // the ledger's assumption wearing her name
  });

  it('execution is second, and only when it was truly measured', () => {
    const two = [
      sess('s1', [
        set({ setIndex: 0 }),
        set({ setIndex: 1, restBeforeS: 95, persistedAt: new Date(T + 160_000).toISOString() }),
        set({ setIndex: 2, restBeforeS: 100, persistedAt: new Date(T + 320_000).toISOString() }),
      ]),
    ];
    expect(factForLift(two, BENCH, learnedExecSFor(two, BENCH))).toEqual({ kind: 'exec', value: 63 });
  });

  it('the peak is read off the RUNGS she taught it, never derived a second time', () => {
    const h = [
      sess('s1', [set({ actualWeight: 60 })]),
      sess('s2', [set({ actualWeight: 70 })]),
      sess('s3', [set({ actualWeight: 65 })]),
    ];
    /*
     * ⛔ THE ORDER WAS A LIE UNTIL 2026-08-31. `LiftKnowledge.rungs` has promised "ascending" since
     * it was written; `observedLoads` returns a Set in INSERTION order, so 60 → 70 → 65 came back
     * as [60, 70, 65]. `LiftDetail` reads only `rungs.length`, so nothing ever caught it — and the
     * first reader to depend on the order would have printed 65 as this athlete's heaviest bench.
     * The façade sorts now, and BOTH halves are asserted: the promise, and the answer.
     */
    const k = liftKnowledge(BENCH, h, 8);
    expect(k.rungs).toEqual([60, 65, 70]);
    expect(factForLift(h, BENCH, null)).toEqual({ kind: 'peak', value: 70 });
  });

  it('a warm-up bridge is never evidence of anything, in any of the four', () => {
    const bridges = [
      sess('s1', [set({ isApproach: true, isWarmup: true, setIndex: -1, actualWeight: 30 })]),
      sess('s2', [set({ isApproach: true, isWarmup: true, setIndex: -1, actualWeight: 30 })]),
    ];
    expect(sessionsWithLift(bridges, BENCH)).toBe(0);
    expect(factForLift(bridges, BENCH, null)).toBeNull();
  });
});

describe('and it is said where she already stands', () => {
  const flow = read('src/screens/session/SessionFlow.tsx');
  const store = read('src/state/stores/sessionStore.tsx');

  it('⛔ ON THE CROSSING, AND ABOUT THE LIFT AHEAD — the one beat where she is reading', () => {
    /*
     * Between sets the news is the SET (the up-next law); on a live set the screen IS the
     * prescription. A crossing is the only moment in a workout when she is walking, holding the
     * phone, with nothing to do but read — and it already answers "what do I go and rack".
     */
    expect(store).toMatch(/nextLiftFact:\s*\n?\s*displayPhase === 'REST_TRANSITION'/);
    expect(store).toContain('factForLift(historyRef.current, next.exerciseId');
    expect(flow).toContain('session.nextLiftFact');
  });

  it('the sentence lives in the copy pack, in both her languages — never in the domain', () => {
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    const he = JSON.parse(read('src/i18n/locales/he.json'));
    for (const k of ['knowRest', 'knowExec', 'knowPeak', 'knowSessions']) {
      expect(en.workout[k]).toBeTruthy();
      expect(he.workout[k]).toBeTruthy();
    }
    // A module that returned Hebrew would be a second copy pack nobody lints.
    expect(read('src/domain/whatIKnow.ts')).not.toMatch(/[֐-׿]+.*=/);
  });

  it('⛔ EVERY LINE IS A QUANTITY WITH A UNIT — never a compliment', () => {
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    for (const k of ['knowRest', 'knowExec', 'knowPeak', 'knowSessions']) {
      expect(en.workout[k]).toContain('{{n}}'); // a number she can check, in every one of them
    }
    /* "You're doing great" is not knowledge, it is a slogan, and a slogan beside a real number
       cheapens the number. There is no praise vocabulary in this family of strings. */
    const all = ['knowRest', 'knowExec', 'knowPeak', 'knowSessions'].map((k) => en.workout[k]).join(' ');
    expect(all).not.toMatch(/great|amazing|awesome|crushed|proud|keep it up/i);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * …AND THE ATHLETE IS THE FACE OF IT (founder, 2026-08-30)
 *
 *   > *"אני מרגיש שכל כך חבל שהשקענו בדמות שלנו והיא לא הפנים של המוצר… במסך הHome במקום להציג את
 *   > התרגילים כסטטיים כמו עכשיו אפשר להציג אנימציה מלאה של כל תרגילי האימון של אותו היום."*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the day is performed on the first screen she opens', () => {
  const home = read('src/screens/home/HomeView.tsx');
  const motion = read('src/components/DayInMotion.tsx');

  it('⛔ Today draws the day in MOTION, and the rows draw words', () => {
    expect(home).toContain('<DayInMotion');
    /*
     * ⚠️ AND NO STILL ON THE ROWS. A 34-point thumb was tried beside each name on 2026-08-31 and
     * removed the same day, from looking at it: the founder's ask was that the animation REPLACE
     * the static presentation, at that size against a 17-point name it read as a smudge, and it put
     * five `buildFrame` walks into every render of the app's most-opened screen.
     */
    expect(home).not.toContain('<MotionThumb');
  });

  it('⛔ ONE rAF CLOCK, NOT ONE PER LIFT — six render loops on the app’s home screen is the wrong build', () => {
    // `MotionThumb`'s own note: "a list of forty looping figures would be forty rAF clocks; a list
    // of forty stills is just SVG". The same arithmetic applies at six, on the screen she opens most.
    expect(motion.match(/<MotionFigure/g)?.length).toBe(1);
    expect(motion).toContain('setInterval'); // the day walks THROUGH the one figure
  });

  it('⛔ REDUCE MOTION TAKES THE WHOLE THING — a frozen figure that still CUTS is worse', () => {
    /*
     * `MotionFigure` freezes its own rom, so without this the hero would stop moving and go on
     * switching lifts every few seconds — a harder motion to tolerate than the loop it replaced.
     */
    expect(motion).toContain('useReducedMotion');
    expect(motion).toMatch(/if \(paused \|\| reduced \|\| rigged\.length < 2\) return;/);
  });

  it('⛔ AND IT STOPS WHEN NOBODY IS LOOKING — a tab screen is not unmounted', () => {
    /*
     * Today lives in a TAB navigator, so it stays mounted behind Progress and Cardio, and a rAF
     * clock does not know that. Left running it rebuilds a rig for ever, in the background, on a
     * phone she is about to train with. `Home` already asks `useIsFocused` for the watch handlers.
     */
    expect(read('src/screens/home/Home.tsx')).toContain('motionPaused={!isFocused}');
    expect(motion).toContain('if (paused) {'); // …and it holds the POSE, so the card is never empty
  });

  it('the figure is drawn at a capped rate — sixty a second is not free, and not needed', () => {
    /* Measured in Chrome on 2026-08-31: uncapped, Today repeatedly timed out the renderer's own
       screenshot while the set screen, which draws no figure, answered instantly.
       ── AMENDED 2026-09-07. The form door was exempt on the reasoning that "there the clip is the
       screen", and that reasoning did not survive being measured: the door's own rig reconciles
       45–95 SVG nodes a frame, and at 60 Hz that was the one measurable cost of opening it. A rep
       loops in ~2 s through poses that change slowly, so 30 reads identically and costs half. The
       cap now applies to BOTH surfaces; what stays forbidden is an uncapped figure anywhere. */
    expect(motion).toContain('fps={HERO_FPS}');
    expect(read('src/components/FormMedia.tsx')).toContain('fps={FORM_DOOR_FPS}');
  });

  it('a lift with no rig draws nothing rather than an empty frame', () => {
    expect(motion).toContain("filter((id) => !!exerciseMotion(id))");
    expect(motion).toMatch(/if \(!rig\) return null;/);
  });

  it('and the figure is HER athlete — stated by the caller, never defaulted in the renderer', () => {
    /* The founder's own plan-builder finding: *"אם אני בוחר את הגוף הגברי, באנימציה זה מציג את
       הגוף הנשי."* A default inside the renderer is exactly how that happens. */
    expect(read('src/screens/home/Home.tsx')).toContain("figure={app.profile?.sex === 'female' ? 'female' : 'male'}");
  });

  it('⛔ IT IS ACTUALLY DRAWN, AT A REAL SIZE — the failure mode here is silent', () => {
    /*
     * `MotionFigure` renders its `<Svg>` at `width="100%" height="100%"` inside whatever `style` it
     * is handed. Hand it none — which is the natural way to write this, and how it was written
     * first — and the inner View collapses to zero height: the figure is INVISIBLE and every source
     * law above still passes, because the markup is perfect. So this one renders it.
     */
    let rendered;
    act(() => {
      rendered = renderer.create(
        React.createElement(DayInMotion, { exerciseIds: ['bb_bench_press', 'bb_back_squat'], figure: 'male' }),
      );
    });
    const svg = rendered.root.findAll((n) => n.props?.viewBox != null);
    expect(svg.length).toBe(1); // ONE figure, one clock
    expect(svg[0].props.width).toBe('100%');
    expect(svg[0].props.height).toBe('100%');
    // …and the box it fills is stated, not inherited from a zero-height parent.
    const filled = rendered.root.findAll((n) => n.props?.style?.height === '100%' && n.props?.style?.width === '100%');
    expect(filled.length).toBeGreaterThan(0);
    // A body was built: primitives, not an empty frame.
    expect(rendered.toJSON()).not.toBeNull();
    act(() => rendered.unmount());
  });

  it('a day with nothing riggable draws nothing at all, rather than an empty box', () => {
    let rendered;
    act(() => {
      rendered = renderer.create(React.createElement(DayInMotion, { exerciseIds: ['run_5k'], figure: 'male' }));
    });
    expect(rendered.toJSON()).toBeNull();
    act(() => rendered.unmount());
  });

  it('⛔ AND IT IS DECORATION — the day is READ from the rows, in her language', () => {
    // A screen reader announcing an unlabelled looping illustration between the session name and
    // its lifts would be noise standing between her and the act.
    expect(motion).toContain('accessibilityElementsHidden');
    expect(motion).toContain('importantForAccessibility="no-hide-descendants"');
  });
});
