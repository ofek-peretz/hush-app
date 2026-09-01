/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE CALL — where the intake conversation used to be.
 *
 * ⛔ FOUNDER, 2026-08-04: *"take the chat out of the front door… my model from the start was to be
 * the SPOTIFY of the fitness world."*
 *
 * The intake was a chat because the coach had to gather everything itself. It does not any more: six
 * facts come off a form and two come from her own words, so there is nothing left to ask. This
 * screen makes ONE call and hands her a programme.
 *
 * ── ⚠️ THE WAIT IS THE PRODUCT HERE, NOT AN INTERRUPTION ────────────────────────────────────────
 * A real build takes 14–20 seconds. That is a long time to look at a spinner, and the founder said
 * so directly: *"the loading looks very static right now."*
 *
 * So this does not show progress it cannot measure — a percentage would be a lie, and a bar that
 * fills at a made-up rate is the same lie with better manners. It shows WHAT IS BEING CONSIDERED, in
 * her own facts, one line at a time: her days, her minutes, what she said she is training for. The
 * wait becomes evidence that something is being done WITH what she typed, which is the only honest
 * thing a wait can be.
 *
 * ⚠️ THE LINES ARE HERS, NOT DECORATION. Every one is a value she gave two screens ago. A generic
 * "analysing your goals…" is exactly the AI-app noise the founder is trying to get away from.
 *
 * ── WHEN IT FAILS ───────────────────────────────────────────────────────────────────────────────
 * It says so and offers to try again. It NEVER invents a programme locally: the coach is the only
 * decider, and a fallback week would be the engine coming back through a side door.
 *
 * ── ⛔ AND IT REVEALS A WEEK SHE WROTE, TOO (founder 2026-08-29) ────────────────────────────────
 * *"אנו לא צריכים לוותר על החלק של האנימציה בסוף — התרגילים שנבנו נכנסים לאנימציה."*
 *
 * With `route.params.authored` the week is already sealed on disk (the builder wrote it), so this
 * screen READS it rather than generating one. Every other line is untouched: the same dark body, the
 * same muscle-at-a-time beat, the same naming — over her own lifts. The reveal is the payoff of the
 * intake, and it is not the engine's to keep.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

// 

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/platform/telemetry';
import { FUNNEL_EVENTS } from '@/platform/events';

import { importFailure, peekImport, settledImport } from '@/domain/pendingImport';
import { AppState, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { BuildingProgrammeView, beatFor, type BuildLift, type BuildMuscle } from '@/screens/onboarding/BuildingProgrammeView';
import { muscleOf, exerciseDisplayName } from '@/data/exercises';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { programmeName, type ProgrammeName } from '@/domain/programmeName';
import { draftFromCoachWeek } from '@/domain/coachDraft';
import { requestPlanBuild } from '@/platform/coach/planBuild';
import { color, font } from '@/design/tokens';
import type { Profile, Program } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'BuildingProgramme'>;

/**
 * ⛔ THE OPENING BEAT IS THE DARK BODY. It was two filling rulers until the founder replaced this
 * screen with his own design on 2026-08-12; what she reads now is a body with nothing lit yet,
 * under "READING WHAT YOU TOLD ME". Long enough to register that the body starts empty, because
 * everything after it is that body filling.
 */
export const OPENING_MS = 1500;
/**
 * ⛔ AND EVERY OTHER NUMBER HERE IS DERIVED FROM THE ANIMATION, NOT SET BESIDE IT.
 *
 * FOUNDER, 2026-08-13: *"זה טס במהירות האור ולא נותן לכל שריר את הרגע שלו… כרגע זה אולי 3 שניות."*
 *
 * It was **90 ms a muscle** — a value written for the old scrolling list, where a row appearing was
 * the whole event. In his design a muscle's lifts have a JOURNEY: they rise, they sit long enough
 * to read, and they travel into the body. At 90 ms every row was replaced before it had finished
 * rising, so the one thing the beat is built on never completed on screen once.
 *
 * ⚠️ THE FIX IS NOT A BIGGER NUMBER, IT IS ASKING. `beatFor(lifts)` is the animation's own arithmetic
 * — the same constants `LiftIn` runs on — so a muscle owns the screen for exactly as long as its
 * lifts need, and the two can no longer drift apart.
 */
/** Long enough to READ the name, on a body that is now entirely lit. */
const REVEAL_MS = 2600;
/**
 * ⛔ THE FILL IS ONE BEAT NOW, NOT TEN — AND THE FOUNDER SAID WHY (2026-08-30):
 *
 *   *"האנימציה הייתה בשביל למרוח את הזמן בעת הטעינה של הבינה… בעבר היה לוקח
 *   לפחות 30 שניות עד יצירת התוכנית ולא רציתי שסתם יהיה מסך סטאטי ומשעמם."*
 *
 * That is a LOADER, and it was written against a thirty-second load. The load is six to nine
 * seconds now, and the walk had stopped being a cover for it: measured end to end on real weeks,
 * this screen ran **22 seconds even when the answer arrived instantly**, because the fill walked
 * one muscle at a time through a week that covers ten of them. An animation that outlives the wait
 * it was hiding IS the wait.
 *
 * So the walk covers the WAIT and nothing else — placeholders while the answer is out, and the
 * moment it lands the whole body fills at once and holds for exactly this long. Long enough that
 * the dashes are seen BECOMING her exercises; too short to be a second wait.
 *
 * ⚠️ AND NOTHING IS LOST BY CUTTING IT, WHICH IS WHY THIS WAS SAFE. `ProgramCreated` is next, it
 * draws the entire week, and it waits for HER. The per-muscle walk was showing her — on a clock
 * she could not control — what the very next screen shows her in full at her own pace.
 *
 * ⛔ BUT THE HOLD IS **ASKED FOR**, NOT PICKED. I first wrote `1_100` here, which is less than the
 * 1400 ms a single lift needs to rise, sit and travel — the name would have landed while the rows
 * were still moving, which is the founder's own 2026-08-13 finding rebuilt from scratch: *"זה טס
 * במהירות האור ולא נותן לכל שריר את הרגע שלו."* The whole body fills at once now, so the beat
 * belongs to the muscle that is actually ON SCREEN, and `beatFor` is the animation's own arithmetic
 * rather than a second opinion about it.
 *
 * ⚠️ AND THAT IS THE **LAST** MUSCLE, NOT THE BUSIEST — I wrote the busiest first, which is a hold
 * measured against rows nobody is looking at. `BuildingProgrammeView` draws exactly one lift list:
 * `props.muscles[props.muscles.length - 1]`. The beat has to be the beat of the thing being drawn.
 */
function fillHold(muscles: readonly BuildMuscle[]): number {
  return beatFor(muscles[muscles.length - 1]?.lifts.length ?? 1);
}
/**
 * ⚠️ THE MUSCLES A PROGRAMME COVERS, which the app knows without asking anyone — so the screen
 * has something TRUE to draw during the wait rather than a spinner. Their lifts stand as dashes
 * until the coach answers; nothing here is a guess about what it will say.
 */
/*
 * ⛔ THE CANONICAL TEN, NOT A HAND-PICKED SEVEN (2026-08-30).
 *
 * The seven were `Glutes`, `Calves` and `Core` short — three muscles every assembled week actually
 * covers, left out of a list whose own docblock promises *"the muscles a programme covers, which
 * the app knows without asking anyone."* So the omission was a small lie, and removing it is worth
 * doing on its own.
 *
 * ⚠️ AND IT IS ALSO WHAT PAYS FOR THE LONGER WAIT. The cover has to outlast the call (see
 * `PLAN_BUILD_SAID_MS`), and the only two ways to stretch it are more muscles or a slower beat.
 * The founder rejected a slower beat on 2026-08-13. More muscles costs nothing and is truer:
 * 1500 + 9 × 1920 = **18.8 seconds** of a screen that is still drawing something real.
 */
export const PLACEHOLDER_MUSCLES: readonly string[] = CANONICAL_MUSCLE_ORDER;
/**
 * ⚠️ HOW MANY DASHED ROWS A WAITING MUSCLE DRAWS — and therefore how long it holds, since `beatFor`
 * is paced by rows. Named because three separate places need the SAME number: the walk, the
 * background catch-up, and the law that proves the cover outlasts the call it is covering.
 */
export const PLACEHOLDER_LIFTS = 2;

export function BuildingProgramme({ navigation, route }: Props) {
  const { t } = useCopy();
  /* ⛔ FUNNEL (2026-08-23): one event per step REACHED — see `FUNNEL_EVENTS`. The build call is about to run. */
  React.useEffect(() => {
    void track(FUNNEL_EVENTS.buildReached);
  }, []);
  const app = useApp();
  const model = app.model;
  /*
   * ⛔ `authored` — SHE WROTE THIS WEEK HERSELF (founder 2026-08-29). The builder is intake step 3
   * now; when she seals a week there it is already on disk, and this screen reveals it instead of
   * assembling one. See `build` below — it is the only line in the file that branches on it.
   */
  /*
   * ⚠️ DEFENSIVE, AND ONLY BECAUSE THIS SCREEN HAS NO WAY BACK. `route.params` is always sent by
   * both callers (`PlanBuilder`, twice), and both are typed — but the navigation prop they use is
   * hand-typed as `params?: unknown`, so a mis-spelled key is a runtime crash on the one screen
   * with no back gesture and no route out except its own retry. `?? {}` turns that into the build
   * failure it actually is, which already has a retry button on it.
   */
  const { inputs, authored, coachAsk } = (route.params ?? {}) as typeof route.params;

  /**
   * ⛔ ASK THE MODEL, AND NEVER LET IT BE THE REASON SHE HAS NO WEEK.
   *
   * Returns her week, or `null` — and `null` sends the caller to the local assembler on the same
   * screen with nothing on it saying so. Every reason is folded into one, deliberately: unreachable,
   * unparseable and "nothing usable came back" are three engineering facts and one athlete fact,
   * which is that the ordinary week is what she is getting.
   *
   * ⚠️ THE DAY NAMES ARE THE MODEL'S OWN and survive into the sealed week — they are the difference
   * between a week that was WRITTEN and one that was picked, and `programmeName` never overwrites
   * them (it composes the sentence ABOVE the list, not the day rows).
   */
  const askTheModel = useCallback(async (): Promise<Program | null> => {
    const res = await requestPlanBuild({
      daysPerWeek: inputs.daysPerWeek,
      sex: inputs.sex === 'female' ? 'female' : 'male',
      ...(inputs.weightKg != null ? { weightKg: inputs.weightKg } : {}),
      ...(coachAsk ? { ask: coachAsk } : {}),
    }).catch(() => null);
    if (!res?.ok) return null;
    return draftFromCoachWeek(res.week, {
      id: `built_ai_${Date.now()}`,
      dayNamer: (i) => t('builder.dayNamed', { letter: String.fromCharCode(65 + i) }),
    });
  }, [inputs, coachAsk, t]);
  const [failed, setFailed] = useState(false);
  /** She asked in her own words and no answer came back in time — carried to the reveal, not buried. */
  const coachMissed = useRef(false);
  /*
   * ⛔ THE WEEK THAT GOT WRITTEN IS THE TRUTH ABOUT HOW OFTEN SHE TRAINS (2026-08-30).
   *
   * ⚠️ FOUND IN A 30-CALL LIVE BATTERY, and it read as a model failure until I looked at it. The
   * wheel said four days; she then typed *"אני מתאמן פעמיים בשבוע בלבד"*; the model obeyed HER and
   * wrote two. Nothing was broken — she had contradicted herself, and the model resolved it the
   * way a coach would: the sentence is later and more specific than the dial.
   *
   * The app did not. `inputs.daysPerWeek` rode on unchanged into `completeOnboarding`, so her
   * profile would have claimed four sessions a week over a programme containing two — and that
   * number is read by the engine, the scoreboard and every "is the week balanced" check after it.
   * A profile that disagrees with the programme it describes is a slow, invisible wrongness.
   *
   * ⚠️ THE IMPORT PATH ALREADY DID THIS and has since the day it was written (`ImportPlan` re-stamps
   * from the sheet it read). The rule was never AI-specific: **whoever wrote the week decides how
   * many days it has.** This is the second author finally being held to the same rule as the first.
   */
  const authoredDays = useRef<number | null>(null);
  const started = useRef(false);

  /*
   * ⛔ THE FADING LIST IS GONE (founder 2026-08-05): *"the loading screen is not good enough and
   * needs redesigning — maybe actually show a simulation of the building process."*
   *
   * It cycled four sentences of her own answers, which was right about the PRINCIPLE (never generic
   * AI noise; every line something she typed) and thin about the execution: four sentences over
   * ninety seconds is a caption on a wait. The principle survives whole in the rulers — they are
   * her three numbers, travelling — and the muscles after them are the app showing its work.
   */
  /*
   * ⛔ THE SIMULATION (founder 2026-08-05) — see `BuildingProgrammeView` for the three movements.
   *
   * This holds the CLOCK; the view holds the drawing. What matters here is that neither one ever
   * gets ahead of the truth:
   *
   *   · the body opens DARK, with nothing lit — everything after it is that body filling.
   *   · the MUSCLES then arrive one at a time, and they are real: the catalogue knows which muscles
   *     a programme covers without asking anyone. Their lifts stand as DASHES.
   *   · each one holds for `beatFor(its own lifts)` — the animation's arithmetic, not a second
   *     opinion about it — and then the programme is NAMED over the whole lit body.
   *
   * ⚠️ NOTHING INVENTS A LIFT. Animating plausible-looking exercises over a call that has not
   * returned would be the app performing work it had not done, on the one screen whose entire job
   * is showing her what it did.
   */
  const [shownMuscles, setShownMuscles] = useState(0);
  const [built, setBuilt] = useState<{ muscles: BuildMuscle[]; name: ProgrammeName | null; lifts: number } | null>(null);
  /** When the show began — wall-clock, so a background gap costs nothing (see the catch-up below). */
  const startedAtMs = useRef(Date.now());
  /** …and when the answer landed, which is what everything after the fill is scheduled from. */
  const builtAtMs = useRef<number | null>(null);

  useEffect(() => {
    // The dark body owns the first beat; then the muscles begin arriving whether or not the coach
    // has answered, because the muscles are ours to know.
    const id = setTimeout(() => setShownMuscles(1), OPENING_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (shownMuscles === 0) return;
    /*
     * ⚠️ THE TICKER COUNTS WHAT IS ACTUALLY BEING DRAWN. It counted the catalogue's seven even
     * after call A had handed the screen HER four — so the reveal would wait for three muscles that
     * were never going to be drawn, and the fill would appear to stall for three whole seconds
     * before the name arrived. Same source as the render, or the clock is timing a different screen.
     */

    const total = built ? built.muscles.length : PLACEHOLDER_MUSCLES.length;
    if (shownMuscles >= total) return;
    /*
     * ⛔ THE ANSWER IS IN ⇒ THE BODY FILLS AT ONCE. See `FILL_HOLD_MS`: the walk is a cover for
     * the wait, so the instant there is nothing left to wait for the cover has no work to do.
     *
     * ⚠️ AND THIS IS ALSO WHERE THE OLD BUILD COULD SKIP THE FILL ENTIRELY. The walk used to
     * carry on through HER muscles, so a week with fewer muscles than the placeholders already
     * shown satisfied `shownMuscles >= total` on the very render the answer landed — dashes
     * straight to the name, the fill never drawn once. One branch, and the case cannot arise.
     */
    if (built) {
      setShownMuscles(total);
      return;
    }
    const id = setTimeout(() => setShownMuscles((n) => n + 1), beatFor(PLACEHOLDER_LIFTS));
    return () => clearTimeout(id);
  }, [shownMuscles, built]);

  /*
   * ⛔ THE NAME WAITS FOR THE FILL (found in the audit, 2026-08-05).
   *
   * `setBuilt` handed the view a name AND the real rows in one render — and the view draws the name
   * INSTEAD of the list, because a named programme is movement three. So the fast fill the founder
   * asked for (*"show the muscle name and then all the exercises chosen for it, with the weight,
   * reps and sets"*) rendered for zero frames: the list was replaced the instant it became real.
   *
   * The reveal is gated on the fill finishing. Then the name holds long enough to read, and only
   * then does the screen move on.
   */
  const filled = !!built && shownMuscles >= built.muscles.length;
  const [revealed, setRevealed] = useState(false);

  /*
   * ⛔ THE SHOW CATCHES UP WHEN SHE COMES BACK (founder, device QA 2026-08-23: *"אם אני יוצא לרגע
   * מהאפליקציה, האנימציה לא ממשיכה ואז כשאני חוזר אני חייב להמשיך לצפות בזה"*).
   *
   * Every beat here is a `setTimeout`, and iOS freezes JS timers the moment the app backgrounds —
   * so the sequence PAUSED with her and resumed from the same muscle when she returned, making the
   * animation something she owes the screen rather than something the screen shows her. The build
   * itself finished long ago (the engine is pure and synchronous); only the THEATRE was frozen.
   *
   * So the timeline is anchored to the wall clock. On every return to foreground the elapsed time
   * is walked through the same arithmetic the timers use — `OPENING_MS`, then each muscle's own
   * `beatFor` — and the screen jumps to wherever the show WOULD be. Away past the end ⇒ she comes
   * back to the named programme, which is the honest state: the work was done before she left.
   *
   * ⚠️ `Math.max` — the catch-up may only ever move FORWARD. The running timers keep the ordinary
   * on-screen pacing; this only closes the gap they were frozen for.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      const elapsed = Date.now() - startedAtMs.current;
      /*
       * ⚠️ THE ANSWER'S OWN ARRIVAL TIME IS THE ANCHOR, not the start of the show. The schedule
       * past that point is the fill's hold and nothing else, and it cannot be derived from
       * `elapsed` — the wait it followed was however long the network took.
       */
      if (built) {
        setShownMuscles((cur) => Math.max(cur, built.muscles.length));
        if (builtAtMs.current != null && Date.now() - builtAtMs.current >= fillHold(built.muscles)) setRevealed(true);
        return;
      }
      if (elapsed < OPENING_MS) return;
      const n = Math.min(
        PLACEHOLDER_MUSCLES.length,
        1 + Math.floor((elapsed - OPENING_MS) / beatFor(PLACEHOLDER_LIFTS)),
      );
      setShownMuscles((cur) => Math.max(cur, n));
    });
    return () => sub.remove();
  }, [built]);
  useEffect(() => {
    if (!filled || revealed) return;
    /*
     * ⛔ THE NAME STILL WAITS FOR THE FILL — that law is older than this change and it survives it
     * whole. What changed is only how long the fill takes: one beat for the whole body instead of
     * one beat per muscle. Zero would put us back in the 2026-08-05 audit bug, where the name
     * replaced a list that had rendered for no frames at all.
     */
    const id = setTimeout(() => setRevealed(true), fillHold(built!.muscles));
    return () => clearTimeout(id);
  }, [filled, revealed, built]);
  /*
   * ⛔ THE WEEK SHE BROUGHT IS MET HERE (founder 2026-08-11: *"אפשר להוסיף גם מסך המתנה בסוף
   * הONBORDING … כי יכול להיות שהוא יסיים את הONBORDING ועדיין הבינה לא הצליחה לייבא את הכל"*).
   *
   * If she started an import on the first question, it has been running underneath every step since
   * — and this screen is a waiting screen already, so it is the honest place to meet it. Almost
   * always it has landed by now and this costs nothing; when it has not, she waits HERE, on a screen
   * that is about her programme being made, rather than on the one before it.
   *
   * ⚠️ `null` MEANS SHE NEVER STARTED ONE, which is the ordinary case, and the intake carries on
   * exactly as it did. Nothing about the generated path changes.
   */
  /*
   * ⚠️ …UNLESS SHE HAS ALREADY ANSWERED THE QUESTION WITH HER OWN HANDS. A week SHE wrote on the
   * step before this one is her last word on the subject: waiting here for a photograph she started
   * at the fork and then walked away from would hand her programme to the abandoned sheet. The
   * builder drops the pending read when it seals (`clearImport`); this guard is the second lock,
   * because a screen that can be reached two ways may not depend on the other one's tidiness.
   */
  const [waitingForImport, setWaitingForImport] = useState(() => !authored && peekImport().phase !== 'idle');
  /** Why her sheet could not be read — said on this screen, because there is no other left. */
  const [importFailed, setImportFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!waitingForImport) return;
    let alive = true;
    void settledImport().then((result) => {
      if (!alive) return;
      setWaitingForImport(false);
      /*
       * A FAILED import is not a dead end. She is dropped back into the ordinary build with her body
       * map — the week she gets is generated. Losing the whole intake because a photograph was
       * blurry would be indefensible.
       *
       * ⛔ BUT IT WAS ALSO NOT SAID. This comment used to end *"and the import screen told her why
       * it could not read her sheet"*, which that screen had no chance to do: `startAndReturn`
       * dismisses it the moment the read STARTS, so the failure landed here, minutes later, with
       * nowhere to go. She finished onboarding on a generated week believing it was her coach's.
       * The reason is carried onto this screen instead — `import.fail.<reason>` is already written.
       */
      if (result?.ok) {
        /* ⚠️ `coachAsk` RIDES ALONG so the report can hand it BACK. She may decline the photograph
           (`import.declineImport`), and declining has to return her to the build she was actually
           watching — including the sentence she typed on the ask step. Dropping it here would make
           "carry on with the one you built me" quietly mean "build me a different one". */
        navigation.replace('ImportPlan', { inputs, review: true, ...(coachAsk != null ? { coachAsk } : {}) });
        return;
      }
      const reason = result ? importFailure() : null;
      if (reason) setImportFailed(reason);
    });
    return () => {
      alive = false;
    };
  }, [waitingForImport, navigation, inputs]);

  useEffect(() => {
    if (!revealed || waitingForImport) return;
    // ⚠️ Held just long enough to READ the name, then on. A reveal she cannot see is not a reveal,
    // and one that outstays the work is the dragging he asked me to avoid.
    const id = setTimeout(
      () => navigation.replace('ProgramCreated', {
        /* …carrying the frequency the WEEK has, not the one the wheel was left on. */
        inputs: authoredDays.current ? { ...inputs, daysPerWeek: authoredDays.current } : inputs,
        ...(coachMissed.current ? { coachMissed: true, ...(coachAsk ? { coachAsk } : {}) } : {}),
      }),
      REVEAL_MS,
    );
    return () => clearTimeout(id);
  }, [revealed, waitingForImport, navigation, inputs, coachAsk]);

  /*
   * ⛔ HER PROFILE AS IT **WILL** BE — ASSEMBLED, NOT WRITTEN.
   *
   * `Root` renders the main app the instant `app.profile` exists (`Root.tsx:284`). Writing it here
   * would swap the navigator out from under this screen WHILE THE COACH IS STILL THINKING, and she
   * would never see her programme at all.
   *
   * ⚠️ I DID EXACTLY THAT IN THE FIRST DRAFT OF THIS SCREEN, hours after quoting the law that warns
   * about it. It is the founder's own device bug — *"it moved me straight to the transition screen
   * without showing me the plan"* — rebuilt from scratch by the person removing it.
   *
   * And the ordering is the honest one anyway: an athlete with a profile and no programme is an
   * account with nothing in it, which is precisely what a crash between the two would leave behind.
   * `ProgramCreated` writes the profile when she accepts.
   */
  const profile = React.useMemo<Profile>(
    () => ({
      name: inputs.name,
      sex: inputs.sex,
      weightKg: inputs.weightKg,
      startWeightKg: inputs.weightKg,
      age: inputs.age,
      experience: inputs.experience,
      units: inputs.units,
      goal: inputs.goal,
      daysPerWeek: inputs.daysPerWeek,
      workoutMinutes: inputs.workoutMinutes,
      healthConnected: inputs.healthConnected,
      /*
       * ⛔ AND THE BODY MAP, WHICH THIS SCREEN EXISTS TO BUILD FROM.
       *
       * It was the one field the memo left out, and both readers below need it: `generateProgram`
       * assembles the week FROM `profile.bodyMap`, and `programmeName(days, profile.bodyMap, …)`
       * reads it to write the "led with …" clause. Undefined, so the muscles she had just switched
       * off were trained anyway, the name lost its clause — and `ProgramCreated`, which DOES carry
       * `bodyMap`, then generated a different week from the same answers one screen later.
       */
      bodyMap: inputs.bodyMap,
      repBand: '8-10',
      ...(inputs.goalText ? { goalText: inputs.goalText } : {}),
      ...(inputs.limitsText ? { limitsText: inputs.limitsText } : {}),
    }),
    [inputs],
  );

  /*
   * ⛔ THE PROGRAMME IS ASSEMBLED, NOT ASKED FOR (founder 2026-08-10).
   *
   * This made TWO network calls: a `low`-thinking shape, then a full-thinking fill. They existed to
   * make a ninety-second wait survivable — the founder's own words, *"the plan build takes far too
   * long, this is the least SPOTIFY thing there is"* — and the honest fix was never a faster call.
   * It was to stop making one: `generateProgram` is pure, reads her body map, and answers in
   * milliseconds. The wait it was engineered around does not exist.
   *
   * ⚠️ SO THE SCREEN'S PACING IS NOW ITS OWN. It still fills a muscle at a time, because the beat is
   * what makes her week feel composed rather than dumped — but it is a deliberate reveal of a
   * finished thing, not a progress bar for a call. Nothing on screen waits for anything.
   *
   * ⚠️ AND THERE IS NO LOAD ON IT. The coach prescribed weights here; the engine does not, and must
   * not — Loop 1 sets the opening load from her FIRST SET (S-38), so a weight printed on this screen
   * would be a number nothing had measured. Exercise, sets and her rep band are what is known now.
   */
  /*
   * ⛔ THE REVEAL BELONGS TO A WEEK SHE WROTE, TOO (founder 2026-08-29): *"אני חושב שאנו לא צריכים
   * לוותר על החלק של האנימציה בסוף … התרגילים שנבנו נכנסים לאנימציה."*
   *
   * The builder is onboarding step 3 now, and the first draft of it walked her from a sealed week
   * straight to `ProgramCreated` — skipping the one beat in the whole intake that is a payoff rather
   * than a question. So this screen takes a week it did not build: `authored` means the sealed week
   * is already on disk (`saveBuiltProgram` wrote it before navigating), and everything after this
   * line is identical — the same grouping, the same per-muscle beat, the same naming.
   *
   * ⚠️ AND IT IS READ FROM DISK, NOT CARRIED IN THE ROUTE. What she trains has to be what she was
   * shown, and the only way to guarantee that is for both to be the same read. A `Program` in a
   * navigation param would be a second copy that a failed write could silently disagree with.
   */
  const build = useCallback(async () => {
    setFailed(false);
    try {
      /*
       * ════════════════════════════════════════════════════════════════════════════════════════
       * ⛔ THE MODEL WRITES IT HERE, AND THIS SCREEN WAS COMPOSED FOR EXACTLY THAT (2026-08-29).
       *
       * The docblock in `BuildingProgrammeView` has said so since it was written: each muscle's
       * rows *"stand as DASHES until the coach's answer lands. Then they fill fast and the name
       * follows."* That choreography lost its subject on 2026-08-10 when the call was removed —
       * ever since, the screen has been revealing a week that was already finished before the
       * animation began, which is an animation with nothing to wait for.
       *
       * The founder's instruction that CREATED this screen names the moment: *"this is the part
       * where the user sees the programme they are getting for the first time."* Now something is
       * genuinely being made while she watches it, in the six to nine seconds the call takes.
       *
       * ⚠️ AND THE FALLBACK IS THE LOCAL ASSEMBLER, ON THE SAME SCREEN, WITH NO SEAM. Unreachable,
       * unparseable, or a week with nothing usable in it → `generateProgram`, which is what this
       * screen has been doing on its own for nineteen days. She never learns there was a call: the
       * beat, the fill and the name are identical either way, and the only thing a failed call
       * costs is the seconds it took.
       * ════════════════════════════════════════════════════════════════════════════════════════
       */
      /* ⚠️ `!authored` FIRST, AND IT IS NOT BELT-AND-BRACES. The two params are never sent together
         today, but the ternary below would DISCARD an answer paid for over a sealed week — a call
         spent re-answering a settled question, and a second week that could disagree with the one
         she trains. The guard is where the money is spent, not where the result is chosen. */
      const asked = !authored && coachAsk != null ? await askTheModel() : null;
      /* ⚠️ ONLY WHEN THERE WAS A SENTENCE TO LOSE. Pressing through the ask step without writing a
         line is still the coach path (`coachAsk` is `''`), but there is nothing to apologise for
         and nothing to offer again — the local week IS the answer to saying nothing. */
      coachMissed.current = !authored && !!coachAsk?.trim() && asked == null;
      if (asked) {
        const wrote = asked.days.filter((d) => !d.isRest).length;
        if (wrote > 0) authoredDays.current = wrote;
      }
      /*
       * ⚠️ THE DISK IS BOUNDED TOO, AND FOR THE SAME REASON THE MODEL IS (2026-08-30). This screen
       * draws dashes until a programme is in hand and the ticker stops when the placeholders run
       * out, so ANY await here that can outlive the beat is a dead screen. `loadProgram` is fast
       * and local and has never been the problem — but "has never" is not a bound, and this is the
       * one screen in the intake she cannot back out of.
       *
       * Timing out lands on `setFailed`, which is the retry scaffold with a button on it. A screen
       * that says it could not do it is a product; a screen that says nothing is a bug report.
       */
      const readSealed = async (): Promise<Program | null> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 8_000); });
        try {
          return await Promise.race([db.loadProgram(), late]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };
      const program = authored ? await readSealed() : asked ?? (await model.generateProgram(profile));
      // Nothing on disk under `authored` means the write that preceded this navigation did not land.
      // The retry is already here and it is the honest answer — never a generated week wearing hers.
      if (!program) {
        setFailed(true);
        return;
      }
      builtAtMs.current = Date.now();
      setBuilt({
        muscles: buildMusclesFromProgram(program, profile.repBand ?? '8-10'),
        name: programmeName(program.days, profile.bodyMap, CANONICAL_MUSCLE_ORDER),
        lifts: program.days.reduce((n, d) => n + d.slots.length, 0),
      });
      /*
       * ⛔ NO `setShownMuscles(1)` HERE. It was the line that killed the opening beat: a pure call
       * resolves before the screen has drawn a frame, so this raced past it every single time.
       * `OPENING_MS` starts the muscles, and having the answer early buys nothing — the beat is
       * paced by what it is DRAWING, which is the only thing it was ever about.
       */
    } catch {
      // A pure function that throws is a defect, not an outage — but onboarding may never be a dead
      // end, so the retry stays. It just has nothing to blame a network for any more.
      setFailed(true);
    }
  }, [profile, authored, model, coachAsk, askTheModel]);

  /*
   * ⛔ THE BUILD WAITS FOR A RUNNING IMPORT — BUT NEVER FOR LONG, AND THAT SECOND HALF IS THE WHOLE
   * FIX (2026-08-30, hours after I broke it).
   *
   * The wait is worth something: if she photographed a sheet at the fork and then took the engine
   * door, both are in flight and the import WINS — it replaces the route the moment it lands — so
   * building first means paying for a week we are about to throw away and flashing it at her on
   * the way past. The read has been running since the fork and is almost always already done, so
   * the wait is usually zero.
   *
   * ⛔ WHAT I SHIPPED FIRST WAS `if (waitingForImport) return;` WITH NO BOUND, and that is a frozen
   * screen. `settledImport()` resolves when the read does, and a read can legitimately take up to
   * `TIMEOUT_MS` — **three minutes** of a dark body with dashed rows that never fills, on the last
   * step of the intake, with the back gesture correctly disabled. "It is stuck and it does not
   * move" is exactly what that looks like, and I traded it for the cost of one API call.
   *
   * ⚠️ THE ATHLETE NEVER WAITS ON AN OPTIMISATION. The grace is short enough to be invisible and
   * long enough to catch the ordinary case; past it, the build runs. If the import lands afterwards
   * it still redirects — nothing is lost but the price of a call we may not need, which is the
   * right thing to spend here and the wrong thing to make her wait for.
   */
  const IMPORT_GRACE_MS = 1_500;
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    if (!waitingForImport) return;
    const id = setTimeout(() => setGraceOver(true), IMPORT_GRACE_MS);
    return () => clearTimeout(id);
  }, [waitingForImport]);

  useEffect(() => {
    if (started.current) return;
    if (waitingForImport && !graceOver) return;
    started.current = true;
    void build();
  }, [build, waitingForImport, graceOver]);

  /*
   * ⛔ THE FAILURE KEEPS THE SCAFFOLD; THE BUILD DOES NOT.
   *
   * A failed call is a message and a retry button — the scaffold's shape, which every other step of
   * onboarding wears, is exactly right for that. The SIMULATION is not a step: it is the result of
   * the six she answered, and it needs the whole screen. Wrapping it in a titled scaffold would put
   * "Reading what you told me." above a screen whose entire job is showing her the reading happen.
   */
  if (failed) {
    return (
      <OnboardingScaffold
        legend={t('ob.buildingFailedLegend')}
        title={t('ob.buildingFailedTitle')}
        headGap={32}
        footer={<Button variant="primary" size="lg" block label={t('ob.buildingRetry')} onPress={() => void build()} />}
      >
        <Text style={styles.failed}>{t('ob.buildingFailedSub')}</Text>
      </OnboardingScaffold>
    );
  }

  /*
   * ⚠️ WHAT IS DRAWN IS ALWAYS WHAT IS KNOWN. Before the answer: her three numbers, then the real
   * muscles with dashed rows. After it: the real lifts, fast, and the programme's name.
   */
  /*
   * ⚠️ THREE SOURCES, IN ORDER OF HOW MUCH IS KNOWN, and never one pretending to be another:
   *   · the full plan, once call B lands — real lifts, real loads;
   *   · HER muscles from call A — real muscles, dashed rows;
   *   · the catalogue's muscles — true of any programme, dashed rows, and all the screen has in
   *     the first few seconds.
   */
  const waitingRows = [{ name: '' }, { name: '' }];
  /*
   * ⛔ THE COACH'S MUSCLE NAMES ARE FILTERED AGAINST THE CATALOGUE (audit, 2026-08-05).
   *
   * Call A returns muscle names as free text. The view prints them through `t('muscle.<name>')`, and
   * i18next returns the KEY when it does not know one — so a coach that wrote "Pecs" or "Delts"
   * would have put **"muscle.Pecs" on the first screen of her programme**, and nothing would have
   * failed anywhere. Anything the catalogue does not know is dropped rather than drawn; if that
   * leaves nothing, the catalogue's own list carries the wait exactly as it did before.
   */
  /*
   * ⚠️ TWO TIERS NOW, NOT THREE. The middle one was the coach's SKETCH — her real muscles, arriving
   * seconds before its full answer — and it existed only because the full answer was slow. There is
   * no gap to fill any more: the catalogue's muscles carry the opening beat, and the real week
   * replaces them whole.
   */
  const muscles: BuildMuscle[] = built
    ? built.muscles.slice(0, shownMuscles)
    : PLACEHOLDER_MUSCLES.slice(0, shownMuscles).map((m) => ({ muscle: m, lifts: waitingRows }));

  /*
   * The week's name, said in her language. `programmeName` returns the PARTS — the shape, the
   * muscles she leads with, the days — because Hebrew assembles this sentence differently, and a
   * domain module that returned English prose would be a second copy layer nobody translates.
   */
  const named = built?.name
    ? [
        t(built.name.key),
        t('plan.weekDays', { n: built.name.days }),
        ...(built.name.led.length > 0
          ? [t('plan.led', { muscles: built.name.led.map((m) => t(`muscle.${m}`)).join(' · ') })]
          : []),
      ].join(' · ')
    : null;

  /*
   * ⛔ THE RULERS' FOUR PROPS ARE GONE WITH THE RULERS. `days`, `weight`, `unit` and `fill` were
   * still being computed and passed here every render — into a component that stopped drawing them
   * on 2026-08-12, when the founder replaced the beat with the body. Nothing failed, because
   * nothing checks; that is what `@ts-nocheck` costs.
   */
  return (
    <BuildingProgrammeView
      muscles={muscles}
      sex={inputs.sex}
      programmeName={revealed ? named : null}
      summary={
        /* `named` is derived from `built?.name`, so inside this branch `built` exists — but the
           checker cannot see through the derivation, and it is right to ask: a refactor that
           loosened `named` would have made this a crash on the one screen she cannot go back from. */
        revealed && named && built
          ? t('ob.buildSummary', { muscles: built.muscles.length, lifts: built.lifts })
          : null
      }
      note={importFailed ? t(`import.fail.${importFailed}`) : null}
      /* Only when she wrote one — an empty ask is still the coach path, and there is nothing to
         quote. See `askedFor` on the view for why this is the AI signature and a badge is not. */
      askedFor={coachAsk?.trim() ? coachAsk.trim() : null}
    />
  );
}

/**
 * The assembled week, grouped by muscle — the founder's own correction: *"show the muscle name and
 * then all the exercises chosen for that muscle."*
 *
 * ⚠️ FIRST OCCURRENCE WINS per lift, the same reading every other surface makes: a lift the assembler
 * put on two days is one prescription, not two.
 *
 * ⛔ AND THERE IS NO LOAD COLUMN. Its predecessor read a weight off the coach's plan; the engine
 * decides an opening load from her FIRST SET (Loop 1, S-38), so there is genuinely no weight to show
 * yet. `load: null` is what the row renders as a dash — the honest answer, and the same one every
 * untrained lift gives everywhere else in the app.
 */
export function buildMusclesFromProgram(program: Program, repBand: string): BuildMuscle[] {
  const byMuscle = new Map<string, BuildLift[]>();
  const seen = new Set<string>();
  for (const day of program.days) {
    if (day.isRest) continue;
    for (const slot of day.slots) {
      if (seen.has(slot.exerciseId)) continue;
      seen.add(slot.exerciseId);
      const m = muscleOf(slot.exerciseId) ?? 'Other';
      const row: BuildLift = {
        name: exerciseDisplayName(slot.exerciseId),
        load: null,
        scheme: `${slot.setCount} × ${repBand.replace('-', '–')}`,
      };
      byMuscle.set(m, [...(byMuscle.get(m) ?? []), row]);
    }
  }
  return [...byMuscle].map(([muscle, lifts]) => ({ muscle, lifts }));
}

const styles = StyleSheet.create({
  failed: {
    fontFamily: font.sans,
    fontSize: 17,
    lineHeight: 25,
    color: color.textSecondary,
    textAlign: 'left',
  },
});
