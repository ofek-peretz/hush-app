/**
 * Home — container. Wires app/session state + navigation to the pure HomeView.
 * Home answers one question (§4.7/§4.8): what do I do today? It re-resolves the
 * next workout on focus and drains offline work. No auto-interrupts.
 *
 * (This header used to end "the Portrait appears (unlocked) only when its tab is opened". There is
 * no Portrait — it was removed long before v5 — and there are no tabs. Corrected 2026-07-17; the
 * only trace left is the vestigial `unlockedPortrait` flag on the session store's end result.)
 */

// 

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { plannedMinutes } from '@/domain/duration';
import { View, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { HomeView, type HomeWorkoutOption } from '@/screens/home/HomeView';
import { homePlanRows, settledPlanRows } from '@/screens/home/homePlan';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { TrainTogetherSheet } from '@/components/TrainTogetherSheet';
import { usePair } from '@/state/stores/pairStore';
import { useCopy } from '@/i18n/useCopy';
import { currentLocale, tg } from '@/i18n';
import { estimateSessionMinutes } from '@/data/api/fixtureModel';
import { loadWeekPlan } from '@/data/local/weekPlan';
import { nextUp } from '@/domain/milestones';
import { milestoneCopy } from '@/domain/milestoneCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { coachSession, coachWeek, coachRows, coachPlanRows, coachLoadDirections, coachChangedCase, queuedWorkout } from '@/domain/coachWeek';
import type { CoachPlan } from '@/domain/coachPlan';
import type { Session } from '@/data/local/models';
import { REST_INTER_S, restInterSecondsFor, restIsLearnedFor, restTransitionSeconds, refreshLearnedRests, useSession } from '@/state/stores/sessionStore';
import { buildCoachWatchPlan, watchPlanToPublish } from '@/platform/watch/watchPlan';
import type { WatchPlanSnapshot } from '@/platform/watch/protocol';
import { flush as flushTelemetry } from '@/platform/telemetry';
import { nextWorkout, sessionDayName, displayWeight, unitLabel } from '@/domain/schedule';
import { displayWeekNumber, currentWeekOpen } from '@/domain/weekCadence';
import { sessionKcal } from '@/domain/energy';
import { isTrainingGated, freeSessionsRemaining } from '@/domain/entitlement';
import { billing } from '@/platform/billing';
import { comebackAfterGap } from '@/domain/comeback';
import { trainingDays, WEEK_ORDER } from '@/domain/trainingDays';
import { daysAfterStarting } from '@/domain/weekBoard';
import { WelcomeBackView } from '@/screens/comeback/WelcomeBack';
import { LapsedView } from '@/screens/subscription/Lapsed';
import { OnYourWristView } from '@/screens/watch/OnYourWrist';
import {
  hasOfferedTheWrist,
  markWristOffered,
  offerTheWrist,
  readWatchPresence,
  WATCH_PRESENCE_UNKNOWN,
  type WatchPresence,
  type WristOffer,
} from '@/platform/watch/watchPresence';
import { weekBriefing, type BriefChange } from '@/domain/weekBriefing';
import { changedLiftCase, type ChangedLiftCase } from '@/domain/changedLiftCase';
import { WhyChangedSheet, whyProps } from '@/components/WhyChangedSheet';
import { WhyHereSheet, whyHereProps } from '@/components/WhyHereSheet';
import { liftPlacement, type LiftPlacement } from '@/domain/whyLiftIsHere';
import { weekNotice } from '@/domain/weekNotice';
import { WEEKLY_SETS_FLOOR } from '@/engine/v5/constants';
/* ⛔ `Line` and `coachBrief` went with the week's brief and its unseen dot — see the deletion
   note in the effect below. */
import { muscleGroupsLabel, exerciseDisplayName, exerciseCues, muscleOf } from '@/data/exercises';
import type { SetTarget } from '@/data/local/models';
import type { LoadDirection } from '@/design/tokens';
import type { MainParamList, HomeTabsParamList } from '@/app/navigation';

// Home is a TAB now, but it pushes onto the parent stack (SessionFlow, Cardio, WeeklyUpdate…), so
// its navigation is the composite of both — the tab it lives in and the stack above it.
type Props = CompositeScreenProps<
  BottomTabScreenProps<HomeTabsParamList, 'Today'>,
  NativeStackScreenProps<MainParamList>
>;

export function Home({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const session = useSession();
  // WEEKLY model: Home offers the next UNFINISHED workout in the week (any order, no calendar).
  /*
   * A CHIP SHOWS A PLAN — including a finished one (founder 2026-07-17: "tapping each chip shows
   * the workout plan"). So SELECTED and QUEUED are no longer the same thing, and they cannot be:
   * a finished workout can be read, but never started again (founder 2026-07-11). `!d.completed`
   * used to gate this, which meant a done chip silently fell back to the next workout and showed
   * the WRONG plan. The gate moved to where it belongs — the act, not the view: a done day still
   * renders its lifts, and the button becomes the quiet "trained this week" note instead of Begin.
   */
  /*
   * ════ THE COACH'S WEEK, WHEN THERE IS ONE ════
   *
   * Read on focus, because the post-session call may have landed a new one while she was away —
   * that is the whole point of it. `null` until the read returns and whenever the coach has never
   * decided anything, in which case everything below falls through to the engine's programme.
   */
  const [coachPlan, setCoachPlan] = useState<CoachPlan | null>(null);
  const [doneCoachIds, setDoneCoachIds] = useState<string[]>([]);
  /** The pairing sheet is open (§11.2's lobby). Never open during a live session — Home is not on
   *  screen then, and the sheet's `live` state exists only for the case where she comes back. */
  const [pairing, setPairing] = useState(false);
  /* The live pair — read here for two things only: the name stamped on the record at Begin, and
     the gate the guest's start has to answer to. Solo, both are inert. */
  const pair = usePair();
  /* A link put her in a room. The sheet is the only place a room is legible, so it opens — once,
     and then the flag is spent so a re-render never reopens it over something she moved on to. */
  useEffect(() => {
    if (!pair.joinedByLink) return;
    pair.clearJoinedByLink();
    setPairing(true);
  }, [pair]);
  /**
   * ⛔ HAS THE WEEK ACTUALLY BEEN READ? — the question `coachPlan === null` cannot answer.
   *
   * `null` is BOTH "the read has not returned yet" (every cold start) and "there is no week". The
   * standalone watch plan needs to tell those apart: only once the week is genuinely known may the
   * phone say "there is nothing left to run" and clear the wrist's stored plan. Before that, saying
   * it would wipe a good snapshot off her wrist on every launch. See `emptyWatchPlan`.
   *
   * ⚠️ SET ONLY ON THE SUCCESSFUL READ. A throw leaves it false: a read that failed is not knowledge
   * about her week, and the safe answer to "I do not know" is to leave the wrist exactly as it is.
   */
  const [weekLoaded, setWeekLoaded] = useState(false);

  const [chosenId, setChosenId] = useState<string | null>(null);

  /*
   * ════ WHICH WORKOUT TODAY IS ABOUT, WHOEVER DECIDED IT ════
   *
   * One id and one name, resolved from the coach's week when there is one and from the engine's
   * programme otherwise. Everything downstream — the watch lobby, telemetry, Begin — reads THESE
   * rather than `day`, because `day` is a `ProgramDay` and a coach workout is not one.
   *
   * ⚠️ The ids must come from wherever the CHIPS came from. A first pass had Begin look the coach
   * session up by the engine day's id (`day_1`) while the coach issues `coach_0` — ids that can
   * never match, so the coach branch was unreachable and every workout quietly ran the engine's.
   */
  const coachWorkouts = React.useMemo(() => coachWeek(coachPlan), [coachPlan]);
  /*
   * ⚠️ NOT "the first one she has not done" any more. If the coach named a weekday and one of them
   * is TODAY, that is the workout Today offers — see `queuedWorkout`. For a hypertrophy week, where
   * no session names a day, this is the identical answer it has always given.
   */
  const nextCoach = queuedWorkout(coachWorkouts, doneCoachIds);
  const chosenCoach = coachWorkouts.find((w) => w.id === chosenId) ?? null;
  /**
   * The workout Today is about: the one she tapped, or the next one she has not trained.
   *
   * A CHOSEN workout may be a finished one she tapped to re-read — that is deliberate and was
   * ruled on (founder 2026-07-17): a done chip still shows its plan, and the gate lives on the ACT
   * rather than the view.
   */
  const todayCoach = chosenCoach ?? nextCoach;
  const todayId = todayCoach?.id ?? null;
  const todayName = todayCoach?.name ?? '';

  /*
   * There is only ONE door to the selection now — the chips. "THE LAST INTENT WINS" used to
   * arbitrate between two: a chip here, and Begin pressed inside the workout's plan screen, which
   * returned with `focusDayId`. That screen is gone (its list, with the loads it never showed, is
   * on this page), so the arbitration went with it. One door needs no referee.
   */
  /*
   * ════ THE WEEK, FROM WHOEVER DECIDED IT ════
   *
   * The coach's plan when there is one, the engine's programme otherwise. Not a merge and not a
   * preference — a MIGRATION: the engine path is what every athlete already on TestFlight trains
   * from, and it goes when the generator goes.
   *
   * ⚠️ THE IDS MUST COME FROM THE SAME PLACE AS THE WORKOUTS. A first pass had Begin look the coach
   * session up by the ENGINE day's id (`day_1`) while the coach issues `coach_0` — ids that can
   * never match, so the coach branch was unreachable and every workout quietly ran the engine's
   * version. Whoever supplies the chips supplies the id Begin resolves.
   */
  const isFocused = useIsFocused();

  /*
   * READ THE COACH'S WEEK ON FOCUS, not once at mount.
   *
   * The post-session call may have landed a whole new programme while she was away from this
   * screen — that is the entire point of it. Reading once would show her last week's decision for
   * as long as the app stayed open.
   *
   * "Done" is derived from HISTORY rather than a flag on the plan, because the plan is the coach's
   * and we do not write to it. A coach workout is done when a session carrying its id was completed
   * since the week opened.
   */
  React.useEffect(() => {
    if (!isFocused) return;
    let alive = true;
    void (async () => {
      try {
        const [plan, history, weekOpenMs, program] = await Promise.all([
          /*
           * ⛔ ONE DOOR, AND IT IS NOT `db.loadCoachPlan()` ANY MORE (founder 2026-08-12).
           *
           * Today was bridged in place on 2026-08-11 and that fixed exactly one screen. Nine others
           * were reading the same empty key — the share sheet, the Saturday letter, the profile's
           * "you have a programme" flag — and bridging each one where it stood would have been nine
           * bridges to drift apart. `loadWeekPlan` is the single one: the coach's week when one
           * exists, the engine's in the same shape when it does not.
           */
          loadWeekPlan(),
          db.loadHistory(),
          db.loadWeekOpen(),
          db.loadProgram().catch(() => null),
        ]);
        if (!alive) return;
        /*
         * ⛔ TODAY DRAWS THE ENGINE'S WEEK (founder 2026-08-11): *"תתקן את המסך של Today שיצייר את
         * התוכנית של המנוע."*
         *
         * This read `db.loadCoachPlan()` and nothing else — correct while the coach wrote the
         * programme, and wrong from the moment the engine took it back. Onboarding calls
         * `generateProgram` now, which writes a `Program`; **nothing writes a `CoachPlan` any more**
         * (`db.recordCoachAnswer` has one caller left and it only runs after a session). So an
         * athlete who finished onboarding had her programme in storage and an EMPTY Today, and would
         * have kept it until the day she trained.
         *
         * ⚠️ THE COACH'S WEEK STILL WINS WHEN ONE EXISTS. This is a fallback, not a replacement: a
         * stored `CoachPlan` is a week something deliberately wrote, and the engine's is what she
         * has when nothing did. The conversion is in `domain/enginePlan` — and its note explains why
         * translating this way is honest when `coachWeek`'s header refuses the other direction.
         */
        setCoachPlan(plan);
        // The week is now KNOWN — whatever it turned out to be. See `weekLoaded`.
        setWeekLoaded(true);
        /*
         * The placements come off the ENGINE's week, which is the only thing that knows why a lift
         * was chosen. Built for the whole week rather than per tap: this is the screen she opens
         * every morning, and a sheet that takes a frame to appear reads as a stall.
         */
        const here: Record<string, LiftPlacement> = {};
        for (const d of program?.days ?? [])
          if (!d.isRest)
            for (const s of d.slots) {
              const lp = liftPlacement(s.exerciseId, program, app.profile?.bodyMap, app.profile?.daysPerWeek, history ?? []);
              if (lp) here[s.exerciseId] = lp;
            }
        setPlacements(here);
        const notice = weekNotice(program, { bodyMap: app.profile?.bodyMap, daysPerWeek: app.profile?.daysPerWeek });
        setEngineNotice(notice ? t(notice.key, notice.params) : null);
        const since = weekOpenMs ?? 0;
        setDoneCoachIds(
          history
            .filter((h) => Date.parse(h.startedAt) >= since && h.trained !== false)
            .map((h) => h.programDayId)
            .filter((id) => id.startsWith('coach_')),
        );
      } catch {
        // An unreadable plan is the engine's week, not a broken screen.
        if (alive) setCoachPlan(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isFocused]);

  /*
   * TODAY'S LIFTS, WITH THEIR LOADS — read here so Home can show the athlete what is waiting.
   *
   * The same ask the deleted plan screen made (`sessionTargets` for the day), and it is a READ, not
   * a computation: the loads were decided at the end of her last workout (L7). Re-read whenever the
   * selected day changes — a chip tap must repaint the list under it, which is the whole reason the
   * chip needs no caption explaining what it does.
   */
  const [planTargets, setPlanTargets] = useState<SetTarget[] | null>(null);
  /** The saved history, newest first — §10 reads it for the gap and for the last session's row. */
  const [saved, setSaved] = useState<Session[] | null>(null);
  useEffect(() => {
    let alive = true;
    db.loadHistory()
      .then((h) => alive && setSaved(h))
      .catch(() => alive && setSaved([]));
    return () => {
      alive = false;
    };
  }, []);
  /*
   * ⛔ THE DERIVED WEEKDAY PATTERN IS GONE FROM THIS SCREEN (founder 2026-08-12): *"ואמרנו שזה לא
   * יופיע כימים אלא כN אימונים."* Ruled: always numbered, never a calendar.
   *
   * `trainingDays` itself is untouched and still correct — it observes the days she has actually
   * trained and never assigns one. What changed is that Today does not draw a week out of it. Seven
   * rows with three gaps reads as a calendar with days you missed, whatever the derivation behind
   * it, and that is the to-do list he rejected in the first place.
   */
  // Which lifts the engine touched this week AND WHICH WAY — so Today can light their figure in the
  // direction it moved (founder 2026-07-29; it used to be one ochre for all three, which named a
  // change and refused to say whether the load had gone up or down). Empty in week one.
  const [changedDir, setChangedDir] = useState<Record<string, LoadDirection>>({});

  /*
   * ⛔ THESE LIVE **BELOW** `changedDir`, AND THAT IS NOT TIDINESS — IT IS A CRASH AVOIDED.
   *
   * Written first at the top of the component beside the other derivations, where they read well.
   * `useCallback`'s dependency array is evaluated the moment the line runs, so `[coachPlan,
   * changedDir]` reached for a `const` declared 130 lines further down: a temporal-dead-zone
   * ReferenceError on every mount of the first screen in the app.
   *
   * ⚠️ `@ts-nocheck` ON THIS FILE HAD NOTHING TO SAY ABOUT IT, which is the same silence that hid
   * `font is not defined` on `AboutYou`. Caught here by reading the line numbers, not by a tool.
   */
  /**
   * How many of a workout's OWN loads the engine moved, and what it trains.
   *
   * ⚠️ BOTH READ `coachRows`, the same list the pre-workout sheet draws, so a card can never
   * disagree with what opening it shows. `changedDir` is keyed by exercise (it is built from the
   * week's decisions), which is exactly the shape needed to ask a workout about itself.
   */
  const changesIn = React.useCallback(
    (workoutId: string) => (coachRows(coachPlan, workoutId) ?? []).filter((r) => changedDir[r.ex]).length,
    [coachPlan, changedDir],
  );

  /*
   * ⛔ `musclesOf` AND `signatureOf` ARE DELETED (founder 2026-08-29): *"במסך הhome יש כיתוב על סוגי
   * שריר וכל מיני דברים מוזרים שלא מעניינים."*
   *
   * They produced ONE string — `HomeWorkoutOption.muscles`, the line under a workout's name — and
   * its only reader was `WeekSheet`, which is deleted with the "אימון אחר" door that opened it.
   * A derivation whose consumer is gone is not a spare part; it is a cost every future reader pays.
   *
   * ⚠️ THE ARGUMENT THEY CARRIED IS WORTH KEEPING ON THE RECORD, because it is a real finding about
   * this product and not about that sheet. A muscle list earns its place exactly when it is UNIQUE
   * and SHORT among the week's workouts: on an upper/lower split it is the better sentence, and on
   * a full-body rotation every card reads *"Chest · Back · Quads · Hamstrings · Shoulders ·
   * Triceps · Glutes · Calves"* — a description of a BODY, identical on every card (his own
   * screenshots, 2026-08-21). `signatureOf` answered that with the day's first two LIFTS, which is
   * how a person actually knows Wednesday.
   *
   * Should a week list ever want a subtitle again, that is the rule to rebuild — a comparison, not
   * a threshold. The Program tab, which is where the week lives now, needs no subtitle at all: it
   * prints every lift of every day outright.
   */

  /*
   * ⛔ EVERY ROW CARRIES ITS OWN SHAPE NOW (founder 2026-08-12, on the Today redesign).
   *
   * `items` and `minutes` have been on `CoachWorkout` since it was written and only the QUEUED
   * workout's pair was ever drawn — so three rows of the week said nothing but a name, which is
   * exactly what made them look like a list rather than a sequence worth pressing.
   */
  const workouts: HomeWorkoutOption[] = coachWorkouts.map((w) => ({
    id: w.id,
    name: w.name,
    /*
     * ⛔ AND THE CHANGE COUNT BELONGS TO ITS OWN WORKOUT. The pill drew `briefCount` — the WEEK's
     * total — on the queued card alone, so a load the engine moved in Lower B was invisible until
     * she opened it, while the number on the card she was looking at counted work that was not in
     * it. `changedDir` is keyed by exercise; this asks each workout which of its own rows moved.
     */
    changes: changesIn(w.id),
    items: w.items,
    lifts: w.lifts,
    minutes: w.minutes,
    timeUnknown: w.hasUncountedWork,
    // The day the coach put it on, when it put it on one. Drawn on the chip so a week that HAS a
    // shape reads as one — and absent everywhere else, which is most weeks.
    ...(w.day ? { day: w.day } : {}),
    done: doneCoachIds.includes(w.id),
  }));
  /**
   * THE ARGUMENT BEHIND EACH CHANGED LIFT (v7 2.1b), keyed by exercise.
   *
   * Today shows the CONCLUSION — a load in moss. Tapping it opens the case: the load it came from,
   * the band, the two sessions that made it, and the engine's own sentence. Every figure comes off
   * the stamped weekly view and the saved history; nothing on that sheet is computed at read time,
   * because a reason Hush did not measure is not a reason (R7).
   */
  const [whyByExercise, setWhyByExercise] = useState<Record<string, ChangedLiftCase>>({});
  const [whyFor, setWhyFor] = useState<string | null>(null);
  /**
   * ⛔ AND THE REASON A LIFT IS HERE AT ALL (founder 2026-08-12) — the second door onto the WHY.
   *
   * The pre-workout card got this first; Today did not, so pressing a row here still fell through to
   * the form clip whenever the engine had not MOVED that load — which in her first week is every row
   * she has. One idea ("press a lift, it explains itself") cannot have two answers depending on
   * which screen she is standing on.
   */
  const [placements, setPlacements] = useState<Record<string, LiftPlacement>>({});
  const [hereFor, setHereFor] = useState<string | null>(null);
  /** The one sentence about what her week could not do — see `domain/weekNotice`. */
  const [engineNotice, setEngineNotice] = useState<string | null>(null);
  const [formFor, setFormFor] = useState<string | null>(null);
  /*
   * ⛔ THE ENGINE'S PER-SET TARGET READ WAS HERE, and the `pending` machinery around it.
   *
   * It asked `sessionTargets` for the selected day and held the rows blank until the promise landed
   * — the flicker the founder reported (A.12) and the reason `homePlan` carries a `pending` flag at
   * all. The coach decided every load before this screen opened and it is in the stored plan, so
   * there is nothing to wait for and nothing to flicker.
   */
  /*
   * Every row is known SYNCHRONOUSLY. The coach already decided each load and it is in the stored
   * plan, so — unlike the engine read this replaced — there is nothing in flight and no `pending`
   * state to get wrong. The whole class of "tapping the chips flickers" (founder A.12) cannot occur.
   */
  /*
   * ⛔ AND THE DIRECTION IS PUT ON THE ROW (2026-08-19). `coachPlanRows` never sets `changed`, and
   * nothing merged `changedDir` onto its output — so `lift.changed` was undefined on every row and
   * `directionTone` never fired once, against `headLiftLoad`'s own stated law that a load is tinted
   * in the direction it moved *"on every screen without exception"*. `PreWorkoutScreen` already
   * does this merge; the front door was the screen that did not.
   */
  const plan = React.useMemo(() => {
    const rows = coachPlanRows(todayId ? coachRows(coachPlan, todayId) : null, app.profile?.units ?? 'kg');
    /*
     * ⛔ AND `rows` IS NULL FAR MORE OFTEN THAN IT LOOKS (device crash, 2026-08-20).
     *
     * `coachPlanRows` is declared `… [] | null` and opens with `if (!rows) return null` — null is its
     * ANSWER for "there is no plan for today", not an error. This memo used to BE that call, so the
     * null flowed on to callers that all handle it. Putting `.map` on the result made the screen
     * assume an array, and the first athlete to meet it was every athlete: `todayId` and `coachPlan`
     * are both empty on the render right after onboarding, and on every cold start before the week
     * loads. The app died on the tap of "show my program".
     *
     * ⚠️ IT RETURNS `null`, NOT `[]`. An empty array is a plan with no lifts in it; null is no plan.
     * Home draws different things for those two, so widening it here would have traded a crash for a
     * blank card — see `todayDrawsTheEngineWeek`.
     */
    if (!rows) return null;
    return rows.map((r) =>
      changedDir[r.exerciseId] ? { ...r, changed: changedDir[r.exerciseId] } : r,
    );
  }, [coachPlan, todayId, app.profile?.units, changedDir]);

  const nowMs = Date.now();
  // Recovery: every workout in the loaded week is done, so there is no next workout to offer. The
  // bucket only regenerates at the Saturday-20:30 calendar roll (appStore.refreshProgram), so a week
  // finished early holds Recovery until the new week opens — the "no starting early" gate is now
  // structural (no fresh bucket exists before the roll), so no separate lock is needed here.
  //
  // It reads `nextUp`, not `day`: `day` can now be a FINISHED workout the athlete tapped to re-read,
  // and looking back at Monday's session is not a reason to stop saying the week is complete —
  // choosing one simply shows it, and Recovery returns the moment the selection is cleared.
  /*
   * RECOVERY: every workout of the loaded week is done, so there is no next one to offer. The week
   * only turns over at the Saturday roll, so a week finished early holds Recovery until then —
   * the "no starting early" gate is structural rather than a separate lock.
   *
   * It reads `nextCoach`, not the chosen one: tapping a finished workout to re-read it is not a
   * reason to stop saying the week is complete, and Recovery returns when the selection clears.
   */
  const resting = coachWorkouts.length > 0 && !nextCoach && !chosenCoach;

  // Training-week counter ("Week N") — a mid-week signup's extended first bucket
  // stays "Week 1" until it actually rolls (domain/weekCadence.displayWeekNumber).
  const weekNumber = displayWeekNumber(app.profile?.memberSince, app.weekOpenMs, nowMs);

  // Free-trial gate (Subscription + Apple Payments): once the free sessions are
  // spent and no membership is active, starting another session opens the paywall.
  // Declared here (before the watch-lobby effect) because the watch must know: a gated
  // athlete can neither start from the wrist nor run a standalone workout there — the
  // purchase decision belongs to the phone.
  const gated = isTrainingGated(app.modeState.completedSessions, app.entitlement.active, app.profile?.memberSince);

  // Prefetched targets for the next workout, so Slide-to-start launches with no
  // network wait (the round-trip happens while the athlete is on Home, not after
  // they commit the slide). Keyed by day id; cleared when the day changes.
  const prefetch = useRef<{ dayId: string; targets: SetTarget[] } | null>(null);

  // Standalone watch execution data: the model's prescriptions for every REMAINING
  // workout, precomputed here (the phone owns the model) and shipped with the lobby
  // so the watch can execute a workout with the phone absent. Best-effort + silent:
  // a day whose targets fail to resolve just narrows the snapshot.
  const [watchPlan, setWatchPlan] = useState<WatchPlanSnapshot | null>(null);
  /**
   * "The engine has settled." The weekly ADVANCE (v4Engine.maybeAdvance — the thing that raises a
   * load, matches one down, swaps a lift, and writes the record Home is about to narrate) runs
   * inside `model.sessionTargets`, which the loop below calls for every remaining workout. So this
   * counter, bumped when that loop finishes, is the only honest signal that the week's decisions
   * exist to be read. Reading the briefing before it would print LAST week's sentence on the first
   * open after the Saturday roll — the one open where being right matters most.
   */
  const [engineTick, setEngineTick] = useState(0);
  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;

    /*
     * ════ THE WRIST GETS THE COACH'S WEEK, MINUS WHAT IT CANNOT RUN ════
     *
     * The watch protocol is reps-at-a-load and nothing else, so a session with a run or a hold in
     * it is not offered standalone — see `buildCoachWatchPlan`. Sending the lifts and dropping the
     * rest would have her do a different workout from the one the coach wrote, on the one device
     * with no screen to say so.
     */
    void (async () => {
      // S-17 — the standalone watch plan ships HER learned rests, not a tier bootstrap. The phone is
      // the sole authority (S-48), so the wrist gets the same timer the phone would run.
      /*
       * ⚠️ ONE READ, TWO USES. `refreshLearnedRests` already needed the history; the standalone plan
       * now needs it too, for last time's reps on the wrist's set row. Reading it twice on every
       * focus of the first screen of the app is the kind of cost nobody notices until a cold start
       * on an old phone.
       */
      const history = await db.loadHistory().catch(() => []);
      refreshLearnedRests(history);
      if (cancelled) return;
      setWatchPlan(
        watchPlanToPublish({
          built: buildCoachWatchPlan({
          /*
           * ⛔ THE HISTORY GOES TO THE WRIST (founder 2026-08-04): *"send the history for a
           * standalone workout too."* Without it a phone-in-a-locker workout drew dashes where a
           * mirrored one drew last time's reps — an asymmetry between the two surfaces that only
           * the athlete the standalone runtime exists FOR would ever meet.
           */
          history,
          sessions: coachWorkouts
            .filter((w) => !doneCoachIds.includes(w.id))
            .map((w) => ({ id: w.id, name: w.name, blocks: coachSession(coachPlan, w.id)?.blocks ?? [] })),
          nowMs: Date.now(),
          /*
           * ⛔ THE COMMENT ABOVE WAS FALSE UNTIL 2026-08-16: this shipped `REST_INTER_S` — a flat 90
           * — and `restInterSecondsFor` was imported on line 32 and never called. `refreshLearnedRests`
           * warmed the map two lines up and nothing read it. Per-step now, so the wrist runs the same
           * two tiers the phone runs (S-48: one authority, one answer); the plan-level number stays
           * as the fallback a stale installed watch build needs.
           */
          restInterSFor: (exerciseId: string) => (restIsLearnedFor(exerciseId) ? restInterSecondsFor(exerciseId) : null),
          restInterS: REST_INTER_S,
          restTransitionS: restTransitionSeconds(),
          }),
          weekLoaded,
          nowMs: Date.now(),
          restInterS: REST_INTER_S,
          restTransitionS: restTransitionSeconds(),
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, coachPlan, coachWorkouts, doneCoachIds, weekLoaded]);

  /**
   * THE BRIEFING — Hush's own sentence about what it did to this week's plan (domain/weekBriefing).
   * Read from the engine's captured weekly record, never recomputed: the card states what the
   * engine ACTUALLY decided at the roll, which is the only thing that makes it evidence rather
   * than a slogan. `changes: null` = the engine has never run an update for this athlete (week 1),
   * where the honest sentence is the promise, not a report.
   */
  /* ⛔ `brief` / `briefCount` / `briefUnseen` ARE DELETED — see the note where their props were,
     in `HomeView`. The pill Today draws is `todayChanges`, per workout, and it is untouched. */
  // How many lifts the engine RAISED this week (loadTo > loadFrom) — the "LOADS UP" fact on the
  // recovery band. A subset of the change count: swaps and matches-down are not raises.
  const [loadsUp, setLoadsUp] = useState(0);
  /*
   * ════ WHAT THE COACH CHANGED THIS WEEK ════
   *
   * This was the engine's weekly view joined to a changeLog. Both are gone with the generator, and
   * what the surface is FOR did not change: how many decisions this week, and which way each lift's
   * load moved.
   *
   * ⚠️ THE DIRECTION IS DERIVED, NOT REPORTED. The coach states a PROGRAMME — what she lifts next,
   * not which way it moved — so the direction is the difference between the current plan and the
   * one before it, both of which the app holds. Asking the coach to state a direction as well would
   * invite it to state one that disagreed with its own numbers, and the founder's law that a
   * direction is a colour is exactly about surfaces not disagreeing.
   */
  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    void (async () => {
      try {
        /* ⛔ TWO READS LEFT WITH THE COUNTS THEY FED (2026-08-26): `loadCoachLetterSeen` (the
           unseen dot) and `loadCoachPlanWeek` (the week's change total). Both were spent on props
           this screen's view never read; `log` stays because `saidFor` below is live. */
        const [log, before, engine] = await Promise.all([
          db.loadCoachLog().catch(() => null),
          db.loadCoachPlanPrev().catch(() => null),
          /*
           * ⛔ THE ENGINE'S OWN RECORD OF THIS WEEK (2026-08-19). Everything below was derived from
           * two stored `CoachPlan` snapshots — and `db.saveCoachPlan` has had no production writer
           * since the coach was taken out on 2026-08-12, so `before` is null on every device and
           * `coachLoadDirections` returned `{}` for ever. `foldEngine` stamps every decision it
           * makes into `changeLog`; that is where a direction has been living all along.
           */
          db.loadEngineV5().catch(() => null),
        ]);
        if (cancelled) return;
        /*
         * ⛔ DIRECTIONS, FROM THE THING THAT DECIDED THEM.
         *
         * `coachLoadDirections(coachPlan, before)` compares two coach programmes. With nothing
         * writing either, it answered `{}` — so the week-complete band printed **0 loads up** at
         * 44pt in the achievement moss on a week the engine had raised, and not one moved load on
         * Today was ever tinted, against `headLiftLoad`'s stated law that a load is coloured in the
         * direction it moved *"on every screen without exception"*.
         *
         * ⚠️ A HOLD IS NOT A DIRECTION HERE. `coachLoadDirections` wrote `'hold'` for an unchanged
         * load, and `changesIn` counts truthy values — which is why a card could say "6 CHANGES"
         * over a sheet that said nothing had changed. The engine only stamps a change when
         * something moved, so the map now contains only lifts that really did.
         */
        const weekFrom = app.weekOpenMs ?? 0;
        const engineDirections: Record<string, 'up' | 'down'> = {};
        for (const c of engine?.changeLog ?? []) {
          if (c.at < weekFrom) continue;
          if (c.loadFrom == null || c.loadTo == null || c.loadFrom === c.loadTo) continue;
          engineDirections[c.exerciseId] = c.loadTo > c.loadFrom ? 'up' : 'down';
        }
        const fromPlans = coachLoadDirections(coachPlan, before);
        // The coach's pair still answers for an athlete whose week predates v5; the engine wins.
        const directions = Object.keys(engineDirections).length > 0 ? engineDirections : fromPlans;
        /*
         * THE CASE BEHIND EACH LIT LOAD. Today lights a moved load in the direction it moved, and
         * tapping it must say why — otherwise the tap falls through to the form clip and the one
         * screen that names a decision refuses to explain it.
         *
         * The sentence is the coach's own, matched to the lift by the note it wrote. A lift with a
         * direction and no note keeps its colour and simply has no sheet: the colour is a fact we
         * derived, and inventing a sentence to go under it would be the app arguing on the coach's
         * behalf.
         */
        const saidFor = new Map((log ?? []).filter((d) => d.ex).map((d) => [d.ex as string, d.say]));
        setWhyByExercise(
          Object.fromEntries(
            Object.keys(directions)
              .map((ex) => {
                /*
                 * ⛔ A MISSING SENTENCE USED TO CLOSE THE SHEET ENTIRELY.
                 *
                 * `if (!say) return null` — so a load that visibly moved could be tapped and
                 * nothing opened. She saw a number in moss and had no way to reach the reason,
                 * which is the one question this sheet exists to answer. And the coach does not
                 * write a note for every lift: measured across three live programmes, two of three
                 * athletes got notes on some lifts and none on others.
                 *
                 * The direction and both loads are MEASURED — they come from comparing the coach's
                 * two programmes. Only the closing line is its prose, so only the closing line is
                 * missing when it wrote none.
                 */
                const c = coachChangedCase(ex, coachPlan, before, saidFor.get(ex), app.profile?.units ?? 'kg');
                return c ? ([ex, c] as const) : null;
              })
              .filter((e): e is NonNullable<typeof e> => e != null),
          ),
        );
        /*
         * LOADS UP — the fact on the recovery band. It was counted off the engine's snapshot; it is
         * counted off the same two programmes the direction comes from, so the band and the row
         * colours can never disagree about how many went up.
         */
        setLoadsUp(Object.values(directions).filter((d) => d === 'up').length);
        /*
         * ⛔ THE WEEK'S CHANGE COUNT AND THE UNSEEN DOT WERE COMPUTED HERE, AND ARE DELETED.
         *
         * Six paragraphs of hard-won reasoning stood over two `setState` calls whose values reached
         * a view that read neither — the count superseded by the per-workout `todayChanges` on the
         * founder's own ruling (*"a count belongs to the thing it counts"*, 2026-08-12), and the dot
         * derived from a coach log that has had no writer since `afterSession` was unwired.
         *
         * ⚠️ THE ARGUMENTS ARE NOT LOST, and they are the reason this is a deletion rather than a
         * tidy: `changedDir` below is the survivor of every one of them. A hold is not a direction;
         * the engine's stamped changes are what the colours and the count both read; and no previous
         * programme means nothing changed. All three still hold, one derivation, two lines down.
         */
        setChangedDir(directions);
      } catch {
        if (!cancelled) {
          setChangedDir({});
          setWhyByExercise({});
          setLoadsUp(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFocused, coachPlan, app.weekOpenMs]);

  // Session-at-a-time: re-resolve today's session on focus; drain offline work.
  const [startError, setStartError] = useState(false);
  useEffect(() => {
    if (isFocused) {
      setStartError(false);
      void app.refreshProgram();
      void app.syncCalibration();
      void app.syncPending();
      void flushTelemetry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  /*
   * ⛔ THE TARGETS PREFETCH WAS HERE.
   *
   * It warmed `sessionTargets` for the offered workout so Slide-to-start had no network wait. The
   * coach's loads are already on disk when this screen draws — there is no round trip left to warm.
   */

  // Keep the Apple Watch Start screen in sync with the queued workout (read-only —
  // the watch mirrors the iPhone home card). Starting a workout stays phone-initiated;
  // this only publishes WHAT is queued. No-op while a session is active (the mirror
  // drives the watch then). Re-publishes when the queued workout / list / lock changes.
  useEffect(() => {
    /* ⛔ `lifts` IS `lifts`, NOT `items` (2026-08-18). This sent the ROUND count under a field the
       wrist draws as "N LIFTS" — and `WatchModel.swift:535` builds its own lobby from
       `Set(steps.map { $0.exerciseId }).count`, so the two paths to one Start screen disagreed by a
       factor of three about the same workout. See `coachWeek.CoachWorkout.lifts`. */
    const lifts = todayCoach?.lifts;
    session.publishWatchLobby({
      workoutId: todayId,
      workoutName: todayName,
      // The coach names its own sessions and does not state muscles; deriving one for the wrist
      // would be a claim about a week nobody made.
      muscles: '',
      lifts,
      /*
       * The coach's own count of the work whose duration is KNOWN, rather than "~8 min per lift".
       * A distance has no duration without a pace and this app does not guess one, so a session
       * carrying uncounted work says the figure it can stand behind and no more.
       */
      // No "~" — the founder struck the approximation mark (device QA 2026-08-23): the figure is
      // the engine's own pricing of the session, and hedging it read as the app unsure of itself.
      durationLabel: todayCoach && todayCoach.minutes > 0 ? `${todayCoach.minutes} min` : undefined,
      // WT7 — her very first: no completed session anywhere in her history. Read from the same
      // history every other surface reads, so the wrist and the phone agree about which day it is.
      firstWorkout: saved != null && saved.length === 0,
      resting,
      gated,
      workouts: coachWorkouts.map((w) => ({
        id: w.id,
        name: w.name,
        lifts: w.lifts,
        muscles: '',
        done: doneCoachIds.includes(w.id),
      })),
    }, watchPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayId, todayName, resting, gated, workouts.length, watchPlan, coachWorkouts, doneCoachIds]);

  // Let the watch Start screen run the EXACT same Begin / Choose the phone does (start + navigate /
  // queue another workout). Bound while Home is MOUNTED — not just focused — so a watch Begin works
  // even when the athlete has pushed Settings / Program / History on top of Home (Home stays mounted
  // underneath). This removes the "watch Begin does nothing unless the phone is literally on Home"
  // dead-end (item 4). It is still safe during an active session: there is no Start screen on the
  // watch then, and the bridge rejects a `start_workout` intent while a session is live. Re-binds
  // when the queued day / lock changes so onStart closes over the current workout.
  useEffect(() => {
    session.setWatchHomeActions({
      onBegin: () => {
        if (!resting) void onStart();
      },
      onSelect: (id) => {
        if (id) setChosenId(id);
      },
    });
    return () => session.setWatchHomeActions(null);
    // `todayId` and not `day?.id`: on a coach-led week `day` is null for ever, so keying on it would
    // freeze `onStart` around the workout that was current when the screen mounted — and the wrist
    // would start yesterday's session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayId, resting]);

  // Mid-workout resume (S3): an interrupted (app-killed) session younger than the resume
  // window replaces Begin with "Continue {workout}". Re-checked on every focus; cleared the
  // moment it is resumed, salvaged, or superseded by a fresh start.
  const [resumable, setResumable] = useState<{ workoutName: string } | null>(null);
  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    void session.loadResumable().then((r) => {
      if (!cancelled) setResumable(r);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  /*
   * ── RECOVERY FACTS (v7 3.5 "THE WEEK IS DONE") — the week's tonnage/kcal, read from this week's
   *    saved history. Best-effort and only while resting; an unread history leaves the band undrawn.
   *
   * ⛔ THE DAY STRIP'S STATE (`weekDays`) IS DELETED (founder 2026-08-12). It fed seven marks,
   *    Sun→Sat, on the week-complete screen — and the seal above them says "4/4" while three of them
   *    were dashed empty rings. The ledger that replaced the strip reads `workouts`, which this
   *    screen already has.
   */
  const [weekEnergy, setWeekEnergy] = useState<{ tonnes: number; kcal: number | null } | null>(null);
  /** Muscles her logged sets touched this week — the moss on the living half's figure. */
  const [weekMuscles, setWeekMuscles] = useState<string[]>([]);
  /** The closest milestone, formatted for the paper card. */
  const [nextMark, setNextMark] = useState<{ figure: string; title: string; progress: number } | null>(null);
  useEffect(() => {
    /*
     * ⛔ NO LONGER GATED ON `resting` (founder, device QA 2026-08-23: the empty half). These are
     * the LIVING week's figures now — the rest band still reads them at the close, and the live
     * page reads them every day. One effect, one derivation, two readers.
     */
    if (!isFocused) return;
    let cancelled = false;
    void (async () => {
      try {
        const all = await db.loadHistory();
        if (cancelled) return;
        const weekOpen = currentWeekOpen(Date.now());
        const wk = all.filter((s) => Date.parse(s.startedAt) >= weekOpen);
        // Tonnage (kg lifted → t) and calories (from total wall-clock work time) across the week.
        let kg = 0;
        let ms = 0;
        // PER SESSION, not one estimate over the pooled minutes: a workout the WATCH executed
        // standalone carries the wrist's MEASURED energy, and pooling the durations first would
        // throw that measurement away and re-estimate the whole week (founder 2026-07-28 — one
        // number per workout, and the week is the sum of them).
        let kcal: number | null = null;
        for (const s of wk) {
          // Working sets only — the same line sessionMetrics draws, so this band and the Log agree.
          for (const set of s.sets) kg += set.isApproach ? 0 : (set.actualWeight ?? 0) * set.actualReps;
          if (s.sets.length) {
            const last = Date.parse(s.sets[s.sets.length - 1].persistedAt);
            const sessionMs = Math.max(0, last - Date.parse(s.startedAt));
            ms += sessionMs;
            const k = sessionKcal(s, sessionMs, app.profile?.weightKg);
            if (k != null) kcal = (kcal ?? 0) + k;
          }
        }
        setWeekEnergy({ tonnes: kg / 1000, kcal });
        // The muscles this week's sets have touched — her body, wearing the week (2026-08-23).
        const touched = new Set<string>();
        for (const s of wk) for (const set of s.sets) {
          const m = muscleOf(set.exerciseId);
          if (m) touched.add(m);
        }
        setWeekMuscles([...touched]);
        // The closest mark — nearest by fraction, formatted once, here, so the view stays dumb.
        const next = nextUp(all, app.profile)[0] ?? null;
        if (next) {
          // `tg`, not the hook's `t`: the hook's function is born fresh each render, and holding
          // it in this effect's deps made the effect re-run on every render — a setState loop that
          // froze Home outright (caught by `onboardingCanBeFinished`'s 120s timeout).
          const c = milestoneCopy(next.milestone, tg, app.profile?.units ?? 'kg');
          const figure =
            next.milestone.family === 'tonnage'
              ? `${(next.current / 1000).toFixed(1)}/${Math.round(next.target / 1000)}`
              : `${Math.round(next.current)}/${Math.round(next.target)}`;
          setNextMark({ figure, title: c.title, progress: next.target > 0 ? next.current / next.target : 0 });
        } else {
          setNextMark(null);
        }
      } catch {
        if (!cancelled) setWeekEnergy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, resting, app.profile?.weightKg, app.profile?.units]);

  async function onResume() {
    let ok = false;
    try {
      ok = await session.resumeSaved();
    } catch {
      // The snapshot could not be replayed (corrupt / storage failure). Never leave the athlete
      // pressing a Continue button that silently does nothing: drop the offer and let them Begin.
      ok = false;
    } finally {
      setResumable(null);
    }
    if (ok) navigation.navigate('SessionFlow');
    // Not resumable after all (stale/complete) → the salvage already ran; Home falls back to Begin.
  }

  async function onStart() {
    if (!todayId) return;
    if (resting) return; // hard gate: the next week is locked until the Saturday 20:30 roll
    if (gated) {
      navigation.navigate('Paywall', { source: 'gate' });
      return;
    }
    setStartError(false);
    try {
      /*
       * She trains what the coach wrote. Its loads are already decided and sitting in the items —
       * there is nothing to ask anyone for, which is why this has no network wait and no prefetch
       * behind it any more.
       */
      /*
       * ⛔ ONE MECHANISM, EVERY DOOR (audit, 2026-08-05). The pre-workout card records the day-swap
       * when she starts a session that sits elsewhere in the week; Begin here starts a session too,
       * and it was not recording it. Two ways to start and only one of them told the board is
       * exactly the drift `weekBoard` exists as a single function to prevent.
       *
       * ⚠️ `null` — the ordinary case, where the queued session is already on today — costs a
       * comparison and no write. Fire and forget: a storage failure must never stand between the
       * tap and the first set.
       */
      const movedDays = daysAfterStarting(coachWorkouts, todayId, WEEK_ORDER[new Date().getDay()]);
      if (movedDays) void db.saveCoachPlanDays(movedDays).catch(() => {});
      const planned = coachSession(coachPlan, todayId);
      if (!planned) {
        setStartError(true);
        return;
      }
      /* Whoever is in the room with her, by the name they gave — see `Session.partners`. Absent on
         every solo start, which is what an absent field has always meant on that record. */
      await session.startCoach(planned, todayId, pair.partnerName ? [pair.partnerName] : undefined);
      navigation.navigate('SessionFlow');
    } catch {
      setStartError(true);
    }
  }

  // Weekly model: completed (non-rest) workouts in the current program week.
  const trainedThisWeek = doneCoachIds.length;

  /* ════ §10 · THE TWO STATES THAT REPLACE TODAY ════
   *
   * Both are answers to "what is true when she opens the app", so both belong HERE — Today is the
   * first screen, and a screen that greets a return or states a lapse cannot live anywhere else.
   * Neither is a route: routes are places you go, and you do not GO to having been away.
   */

  // 10.2 · LAPSED. She subscribed and no longer is — not the free trial running out (that is the
  // paywall's gate, and it is a different sentence). Read-only, never a lock-out.
  const lapsed = !app.entitlement.active && app.entitlement.source !== 'none';

  // 10.1 · AFTER A GAP. Shown once per return: dismissing it starts the day, and coming back
  // tomorrow is not a gap any more, so nothing has to be remembered.
  const [greeted, setGreeted] = useState(false);
  // Whether a greeting was DUE on this arrival, independent of whether it has been dismissed —
  // 10.4 reads it to stay out of the way, and `greeted` would tell it the opposite.
  const comebackDue = useMemo(
    () => (lapsed ? null : comebackAfterGap(saved ?? [], Date.now())),
    [lapsed, saved],
  );
  const comeback = greeted ? null : comebackDue;

  /* ════ 10.4 · ON YOUR WRIST — the third state that replaces Today ════
   *
   * Same mechanism as the two above it and for the same reason: it answers "what is true when she
   * opens the app", and you do not GO to owning an Apple Watch. `platform/watch/watchPresence`
   * holds every rule — chiefly that WCSession says a watch is actually paired to this iPhone, so
   * it can never appear as an advertisement to someone who owns no watch.
   *
   * It is the SECOND of the two surfaces that tell her, and deliberately the smaller one: an
   * athlete who already owned a watch was told at 1.3 during onboarding, which sets the same flag
   * this reads. What is left here is the athlete who acquired a watch since — and that is exactly
   * why it is read on FOCUS rather than once at mount. A watch bought this afternoon shows up on
   * the next open, with no restart and nothing to find in settings.
   */
  const [wristPresence, setWristPresence] = useState<WatchPresence>(WATCH_PRESENCE_UNKNOWN);
  const [wristOffered, setWristOffered] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isFocused) return;
    setWristPresence(readWatchPresence());
    let alive = true;
    void hasOfferedTheWrist().then((yes) => alive && setWristOffered(yes));
    return () => {
      alive = false;
    };
  }, [isFocused]);

  /**
   * The store's label for the plan she was on, for the lapsed screen's Resume button.
   *
   * ⚠️ ASKED ONLY WHEN SHE IS ACTUALLY LAPSED. A store round-trip on every Home mount would be a
   * network call on the app's most-opened screen to fill a field almost nobody sees; `lapsed` is the
   * one state that reads it. Annual first, because that is what the paywall selects by default and
   * therefore what most returning athletes were paying.
   */
  const [resumePrice, setResumePrice] = useState<string | null>(null);
  useEffect(() => {
    if (!lapsed) return;
    let active = true;
    void billing.getProducts().then((list) => {
      if (!active || list.length === 0) return;
      setResumePrice((list.find((p) => p.period === 'annual') ?? list[0]).priceLabel);
    }).catch(() => {});
    return () => { active = false; };
  }, [lapsed]);

  const wristOffer: WristOffer | null =
    wristOffered == null
      ? null // still finding out — a screen that flashes in and out is worse than one that waits
      : offerTheWrist({
          presence: wristPresence,
          offered: wristOffered,
          greetingBack: !!comebackDue,
        });

  if (lapsed) {
    const last = (saved ?? [])[0];
    return (
      <LapsedView
        dayName={todayName || null}
        endedOn={app.entitlement.expiresAt ? new Date(app.entitlement.expiresAt).toLocaleDateString() : ''}
        /*
         * ⛔ THE PRICE, WHICH THIS SCREEN PROMISED TO PRINT AND WAS HANDED `null` (2026-08-16).
         *
         * `Lapsed.tsx`'s own header: *"The resume button prints the SAME price she was paying, from
         * the live store product — never a discount to bait a return, and never a higher one to
         * punish the gap."* That is a promise about the one screen an athlete reads while deciding
         * whether we treated her fairly, and the caller pinned it to `null` — so the button always
         * said the bare "Resume" and `lapsed.resumeAt` had never rendered on any device.
         *
         * ⚠️ NULL IS STILL A REAL STATE and the fallback stays: the store can be slow or silent, and
         * an empty price in that sentence would be worse than not making it. What is gone is null as
         * the ONLY state.
         */
        priceLabel={resumePrice}
        onResume={() => navigation.navigate('Paywall', { source: 'profile' })}
        kept={[
          ...(last
            ? [{
                key: 'last',
                title: t('lapsed.lastSession', { date: new Date(last.startedAt).toLocaleDateString() }),
                detail: sessionDayName(last),
                onOpen: () => navigation.navigate('WorkoutDetail', { sessionId: last.id }),
              }]
            : []),
          { key: 'log', title: t('progress.title'), detail: t('progress.viewHistory'), onOpen: () => navigation.navigate('History') },
        ]}
      />
    );
  }

  if (comeback) {
    return (
      <WelcomeBackView
        daysAway={comeback.daysAway}
        unit={unitLabel(app.profile?.units ?? 'kg')}
        // Only SETTLED rows: a pending row's load is null, and null means bodyweight here.
        lifts={(settledPlanRows(plan) ?? []).slice(0, 2).map((l) => ({
          exerciseId: l.exerciseId,
          name: l.name,
          load: l.load == null ? null : displayWeight(l.load, app.profile?.units ?? 'kg') ?? null,
        }))}
        onStart={() => setGreeted(true)}
      />
    );
  }

  if (wristOffer) {
    return (
      <OnYourWristView
        offer={wristOffer}
        onDone={() => {
          // Spent the moment it is read, exactly like 8.2's ask: the flag is written AND the local
          // state flips, so Today is underneath before the write returns.
          setWristOffered(true);
          void markWristOffered();
        }}
      />
    );
  }

  return (
    <>
    <HomeView
      resting={resting}
      onTogether={() => navigation.navigate('Together')}
      onTrainTogether={() => setPairing(true)}
      name={app.profile?.name}
      dayName={todayName || null}
      dayId={todayId}
      // The coach names its own sessions and does not state muscles — see the chips above.
      trainedThisWeek={trainedThisWeek}
      startError={startError}
      weekNumber={weekNumber}
      plan={plan}
      /*
       * The coach's own count of the work whose duration is KNOWN, rounded to five. A distance has
       * no duration without a pace and this app does not guess one, so a session carrying a run
       * states what it can stand behind rather than a confident total.
       */
      planMinutes={todayCoach ? plannedMinutes(todayCoach.minutes) : 0}
      /* ⚠️ A SESSION WITH A RUN IN IT HAS NO HONEST MINUTE COUNT, and this line was printing one
         anyway. `timeOf` cannot price a distance — there is no pace to price it with — so a workout
         built around a 5 km run came out as "~6 min" on the first screen she opens. The flag has
         been computed since the week was written and read by nobody. */
      planTimeUnknown={todayCoach?.hasUncountedWork ?? false}
      /* ⛔ `overBudget` / `budgetMinutes` ARE GONE FROM THIS SCREEN (2026-08-16). One was a literal
         `false` and the other an always-undefined budget F-15 deleted; together they fed a note that
         could not render and would have said "in 0 minutes" if it had. `weekNotice` owns this
         sentence now — see `notice={engineNotice}` below and the block in `HomeView`. */
      /*
       * ⛔ THE REST WINDOW SHE IS OWED AN ANSWER ABOUT (founder 2026-08-11). The body map carries it
       * too, but a question that only lives there is one she must go looking for — and the rule is
       * that Hush TELLS her. This is the screen she opens.
       */
      easeChecks={(app.easeChecks?.() ?? []).map((e) => e.muscle)}
      onEaseAnswer={(muscle, a) => void app.answerEaseCheck?.(muscle, a)}
      dayDone={!!todayId && doneCoachIds.includes(todayId)}
      units={app.profile?.units ?? 'kg'}
      /* Her own athlete demonstrates the day (`DayInMotion`, and the stills on each row). Read from
         the profile at the call site rather than defaulted inside the renderer — see the prop. */
      figure={app.profile?.sex === 'female' ? 'female' : 'male'}
      /* A tab screen is not unmounted when she walks away from it, and a rAF clock does not know
         that. `isFocused` is already read above for the watch handlers; the day's figure holds its
         pose on the same answer. */
      motionPaused={!isFocused}
      // A CHANGED ROW OPENS ITS CASE (v7 2.1b); an unchanged one opens the form clip. The rule is
      // the row's own state, so there is nothing to teach: the lift Hush moved is already the one
      // drawn differently, and it is the only one with an argument to read.
      /*
       * ⛔ THE SAME THREE-WAY ANSWER THE PRE-WORKOUT CARD GIVES, in the same order of how much is
       * known: the load's case when the engine moved it, the placement when it merely put the lift
       * there, and the form clip when neither exists. Two screens, one idea.
       */
      onForm={(id) => (whyByExercise[id] ? setWhyFor(id) : placements[id] ? setHereFor(id) : setFormFor(id))}
      resumable={resumable}
      onResume={onResume}
      onStart={onStart}
      workouts={workouts}
      /*
       * ⛔ A ROW OPENS THE CARD (founder 2026-08-05): *"pressing a day with a workout opens a
       * full-screen card with the workout's content … and then pressing that starts the workout."*
       *
       * It used to only SELECT — the tapped row opened in place and its lifts unfolded underneath,
       * which is what made Today too tall to show the week. The selection still happens, so the
       * board keeps marking where she is; it is simply no longer the whole act.
       */
      /*
       * ⛔ THE DRAG IS GONE WITH THE WEEKDAY SLOTS (founder 2026-08-12) — see `WeekColumn`.
       *
       * It handed `moveWorkoutToDay` a weekday to drop onto, and a numbered column has none. Its own
       * note already recorded that it did nothing for most athletes: `saveCoachPlanDays` returns
       * early when no coach plan is stored, so on every GENERATED week the row lifted, sprang back
       * and changed nothing.
       *
       * ⚠️ `daysAfterStarting` (in `onStart`, above) is untouched and still matters: training a
       * session records WHEN it happened, which is what `trainingDays` reads. Observing stays;
       * assigning is what left.
       */
      /*
       * ════ ⛔ READING A WORKOUT NO LONGER RE-QUEUES THE WEEK ════
       *
       * FOUNDER, 2026-08-12: *"לוחצים על משבצת בTODAY ואז נפתח הMODAL? … כי אחרת אז מה הערך של
       * כפתור הBEGIN במסך הTODAY?"*
       *
       * The question found a real defect. This was `setChosenId(id)` and THEN navigate — so opening
       * a workout to look at it made it the queued one. She peeks at Lower B, drags the sheet down,
       * and Today now reads **"Begin Lower B"**: a workout she never chose, standing where the one
       * she was about to do used to be. `chosenId` drives the lit card, the act, and the watch
       * lobby, so a glance rewrote all three.
       *
       * **Looking is not choosing.** One press opens the sheet and changes nothing.
       *
       * ── SO THE THREE CONTROLS ARE THREE DIFFERENT SENTENCES ─────────────────────────────────────
       *   · A CARD           — "show me this one." Opens the sheet. No state moves.
       *   · BEGIN, on Today  — "start the one that is up." One tap, no sheet, the 90% path. THIS is
       *                        the value of the button: the queued workout is a decision the week
       *                        already made, and she should not have to re-make it every morning.
       *   · BEGIN, in the sheet — "start THIS one instead." Starting is the deliberate act, and it
       *                        is what records the swap (`daysAfterStarting`, `PreWorkoutScreen`).
       *
       * ⚠️ THE QUEUE STILL MOVES WHEN SHE TRAINS, which is the only honest trigger: `daysAfterStarting`
       * runs on START, from both doors, and `queuedWorkout` reads what she has actually done. Nothing
       * is lost by refusing to move it on a glance — the move just waits for a decision.
       */
      onChooseWorkout={(id) => navigation.navigate('PreWorkout', { workoutId: id })}
      /*
       * Never written since the coach took the week: `weekBriefing` assembled a sentence out of
       * deltas and the coach writes its own. `HomeView` does not render it either — it has read
       * only `briefCount` since the v7 restructure moved the sentence off Today. Left as the prop
       * it is rather than removed, because the view's shape is the founder's and he is redesigning
       * it.
       */
      /*
       * ⛔ THE PROGRAMME'S NAME IS OFF TODAY (founder 2026-08-12): *"תוריד את שם התוכנית."*
       *
       * It arrived on 2026-08-04 as the screen's HEADLINE — a real fix at the time, because Home was
       * leading with "MONDAY · UP NEXT", a fact she already had. Measured a week later it was the
       * same fault one level up: **50 pixels of the first fold saying the identical sentence every
       * morning for the life of the programme**, above a week that starts a fifth of the way down
       * the screen.
       *
       * ⚠️ IT IS NOT DELETED FROM THE PRODUCT. `ProgramCreated` still hands it to her by name when it
       * is made, which is the beat that turns a week into a thing she was given; `programmeName` and
       * the `title` on the plan are untouched. What went is a permanent fact charging daily rent on
       * the one screen that has to be about today.
       */
      notice={engineNotice}
      /*
       * ⛔ AND WHAT THE ENGINE COULD NOT DO, on the screen she opens every morning. Read from the
       * engine's OWN week rather than the plan drawn above it, because the verdicts are stamped on
       * `ProgramDay` and the conversion into a `CoachPlan` deliberately carries no opinions across.
       */

      trialLeft={app.entitlement.active ? null : freeSessionsRemaining(app.modeState.completedSessions)}
      /*
       * ⛔ THE COACH DOOR IS CLOSED, AND THE SCREEN BEHIND IT IS DELETED (founder 2026-08-11).
       *
       * His standing instruction since the rebuild began: the app is not a chat. `CoachIntake` left
       * onboarding on 2026-08-04 — "take the chat out of the front door" — and this corner button
       * quietly kept a second door to the same conversation, on the screen she opens every day.
       *
       * ⛔ AND ON 2026-08-12 THE REST WENT WITH IT. That note used to end: *"`CoachChat`, `useCoach`
       * and the whole coach domain remain — the pain screen and the live session still use them."*
       * True, and it sat under a headline claiming the AI was out of the house, which it was not:
       * the in-workout window was a chat, the pain report was a chat, and a call after EVERY session
       * wrote a programme that every screen then preferred over the engine's.
       *
       * All three are closed. The model is reachable from the plan IMPORT and from nowhere else —
       * the one job the deterministic engine genuinely cannot do. See `theAiHasOneJob`.
       */
      onWeeklyUpdate={() => navigation.navigate('WeeklyUpdate')}
      weekStats={weekEnergy ? { ...weekEnergy, loadsUp } : null}
      weekLive={!resting && weekEnergy ? { ...weekEnergy, loadsUp, muscles: weekMuscles } : null}
      nextMark={!resting ? nextMark : null}
      sex={app.profile?.sex === 'male' ? 'male' : 'female'}
      /*
       * ⛔ NULL EXACTLY WHEN THE SCREEN THAT DRAWS IT IS SHOWN. `resting` is
       * `coachWorkouts.length > 0 && !nextCoach && !chosenCoach` — so on the week-complete screen
       * `nextCoach` is by definition undefined, and the "NEXT · …" row has never once rendered.
       * What opens next week is the rotation's first workout, which is known.
       */
      nextWorkoutName={nextCoach?.name ?? coachWorkouts[0]?.name ?? null}
      />
      {/* WHY THIS CHANGED — the engine's argument for the lift it moved, at full length. */}
      {hereFor && placements[hereFor] ? (
        <View style={StyleSheet.absoluteFill}>
          <WhyHereSheet
            {...whyHereProps(placements[hereFor], exerciseDisplayName(hereFor), t, WEEKLY_SETS_FLOOR)}
            onClose={() => setHereFor(null)}
          />
        </View>
      ) : null}
      {whyFor && whyByExercise[whyFor] ? (
        <View style={StyleSheet.absoluteFill}>
          <WhyChangedSheet {...whyProps(whyByExercise[whyFor], t, currentLocale())} onClose={() => setWhyFor(null)} />
        </View>
      ) : null}

      {/* The form clip — the one job the plan screen did that the list on Home does not. It was a
          whole screen away (Home → chip → chip again → a row's ▶); it is now a tap on the lift. */}
      {/*
        ⛔ THE PAIR'S SHEET IS MOUNTED HERE AND NOWHERE ELSE, and the reason is the Begin button.
        The HOST does not start a workout from inside the sheet — she opens a room, her partner
        walks in, and then she presses the same Begin she presses every other day, through the same
        gate and the same bookkeeping. `onBegin` is literally this screen's own `onStart`; the pair
        adds no second door into the start path. See `TrainTogetherSheet`'s header.
      */}
      {pairing ? (
        <TrainTogetherSheet
          onClose={() => setPairing(false)}
          /*
           * ⛔ ONLY WHEN A BEGIN WOULD ACTUALLY BEGIN. `onStart` returns early with no queued
           * workout and on a resting week, so passing it unconditionally put a cream primary
           * button on the sheet that did nothing — the gated-guest defect again, one screen over.
           * Absent, the sheet says where the start lives instead of offering one that is not there.
           *
           * ⚠️ GATED IS DELIBERATELY NOT IN THIS CONDITION: a spent trial has an answer, and it is
           * the paywall `onStart` already opens.
           */
          onBegin={todayId && !resting && !doneCoachIds.includes(todayId) ? () => {
            setPairing(false);
            void onStart();
          } : undefined}
          /* The guest's own workout is composed inside the sheet (`beginAsGuest`), so the one thing
             it cannot do for itself is open the stage it just filled. */
          onStarted={() => navigation.navigate('SessionFlow')}
          /* The same paywall, from the same source tag, as every other door onto a start. */
          onGated={() => navigation.navigate('Paywall', { source: 'gate' })}
        />
      ) : null}

      {formFor ? (
        <ExerciseDemo
          title={exerciseDisplayName(formFor)}
          exerciseId={formFor}
          cues={exerciseCues(formFor)}
          focusLabel={t('workout.focusOn')}
          formGuideLabel={t('workout.form')}
          doneLabel={t('workout.tapAnywhere')}
          onDone={() => setFormFor(null)}
        />
      ) : null}
    </>
  );
}
