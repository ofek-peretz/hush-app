/**
 * Home — container. Wires app/session state + navigation to the pure HomeView.
 * Home answers one question (§4.7/§4.8): what do I do today? It re-resolves the
 * next workout on focus and drains offline work. No auto-interrupts.
 *
 * (This header used to end "the Portrait appears (unlocked) only when its tab is opened". There is
 * no Portrait — it was removed long before v5 — and there are no tabs. Corrected 2026-07-17; the
 * only trace left is the vestigial `unlockedPortrait` flag on the session store's end result.)
 */
// @ts-nocheck

// 

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { HomeView, type HomeWorkoutOption } from '@/screens/home/HomeView';
import { homePlanRows, settledPlanRows } from '@/screens/home/homePlan';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { useCopy } from '@/i18n/useCopy';
import { currentLocale } from '@/i18n';
import { estimateSessionMinutes } from '@/data/api/fixtureModel';
import { loadWeekPlan } from '@/data/local/weekPlan';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { coachSession, coachWeek, coachRows, coachPlanRows, coachLoadDirections, coachChanges, coachChangedCase, queuedWorkout } from '@/domain/coachWeek';
import type { CoachPlan } from '@/domain/coachPlan';
import type { Session } from '@/data/local/models';
import { REST_INTER_S, restInterSecondsFor, restIsLearnedFor, restTransitionSeconds, refreshLearnedRests, useSession } from '@/state/stores/sessionStore';
import { buildWatchPlanSnapshot, buildCoachWatchPlan } from '@/platform/watch/watchPlan';
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
import type { Line } from '@/domain/voice';
import { coachBrief } from '@/domain/coachEarned';
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
  const musclesOf = React.useCallback(
    (workoutId: string) => {
      const seen: string[] = [];
      for (const r of coachRows(coachPlan, workoutId) ?? []) {
        const m = muscleOf(r.ex);
        // A movement that is not a lift (a plank, a run) credits no muscle rather than a guessed one.
        if (m && !seen.includes(m)) seen.push(m);
      }
      return seen.map((m) => t(`muscle.${m}`)).join(' · ');
    },
    [coachPlan, t],
  );

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
     * ⛔ THE MUSCLES ARE DERIVED AGAIN (founder 2026-08-12). This was `muscles: ''` under the note
     * *"the coach names its own sessions, so there is no muscle line to derive — and inventing one
     * would be a claim about a week nobody made."* True of the coach. **The ENGINE composed this
     * week**, `coachRows` gives its exercises and `muscleOf` answers for each one, so the line is
     * read off the programme rather than invented. Drawn on the queued card only (`WeekColumn`).
     */
    muscles: musclesOf(w.id),
    /*
     * ⛔ AND THE CHANGE COUNT BELONGS TO ITS OWN WORKOUT. The pill drew `briefCount` — the WEEK's
     * total — on the queued card alone, so a load the engine moved in Lower B was invisible until
     * she opened it, while the number on the card she was looking at counted work that was not in
     * it. `changedDir` is keyed by exercise; this asks each workout which of its own rows moved.
     */
    changes: changesIn(w.id),
    items: w.items,
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
  const plan = React.useMemo(
    () => coachPlanRows(todayId ? coachRows(coachPlan, todayId) : null, app.profile?.units ?? 'kg'),
    [coachPlan, todayId, app.profile?.units],
  );

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
  const gated = isTrainingGated(app.modeState.completedSessions, app.entitlement.active);

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
        buildCoachWatchPlan({
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
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, coachPlan, coachWorkouts, doneCoachIds]);

  /**
   * THE BRIEFING — Hush's own sentence about what it did to this week's plan (domain/weekBriefing).
   * Read from the engine's captured weekly record, never recomputed: the card states what the
   * engine ACTUALLY decided at the roll, which is the only thing that makes it evidence rather
   * than a slogan. `changes: null` = the engine has never run an update for this athlete (week 1),
   * where the honest sentence is the promise, not a report.
   */
  const [brief, setBrief] = useState<Line[] | null>(null);
  // How many lifts the engine touched — the fact Home states before Hush's sentence. Null in week
  // one, where there is no update to count (founder 2026-07-13).
  const [briefCount, setBriefCount] = useState<number | null>(null);
  const [briefUnseen, setBriefUnseen] = useState(false);
  // How many lifts the engine RAISED this week (loadTo > loadFrom) — the "LOADS UP" fact on the
  // recovery band. A subset of the change count: swaps and matches-down are not raises.
  const [loadsUp, setLoadsUp] = useState(0);
  /** The engine rotation she can take back — see `undoEngineSwap`. Null unless one is live. */
  const [undoable, setUndoable] = useState<{ anchor: string; name: string } | null>(null);
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
        const [log, before, letterSeen, weekAnchor] = await Promise.all([
          db.loadCoachLog().catch(() => null),
          db.loadCoachPlanPrev().catch(() => null),
          db.loadCoachLetterSeen().catch(() => null),
          // The programme this WEEK opened on — what the pill counts against. See `coachPlanWeek`.
          db.loadCoachPlanWeek().catch(() => null),
        ]);
        if (cancelled) return;
        const fromCoach = coachBrief(log, app.weekOpenMs);
        const directions = coachLoadDirections(coachPlan, before);
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
         * `null` and `0` are DIFFERENT and both surfaces depend on it: null is "nothing has ever
         * been decided for her" — her first week, where the coach gave a starting point rather than
         * a change — and shows no pill at all; 0 is "this week, nothing changed", a verdict she is
         * owed.
         */
        /*
         * ⛔ NO PREVIOUS PROGRAMME MEANS NOTHING CHANGED (founder, build 41): *"it still says there
         * is a number of changes on the TODAY screen."*
         *
         * `coachBrief` counts the coach's DECISIONS this week, and the prompt asks it to write one
         * per lift on the FIRST programme — *"where every choice is a decision she has no history to
         * explain it with."* Correct instruction, wrong label: on day one those are six OPENING
         * positions, not six changes. She was being told her week had changed before she had a week.
         *
         * A change is a difference between this programme and the one before it, so with no `before`
         * there is no count — the same pair `coachLoadDirections` reads two lines down.
         */
        /*
         * ⛔ AND IT COUNTS DIFFERENCES, NOT SENTENCES (founder 2026-08-05): *"it says 6 changes, but
         * when you go in you see there is no change — it just decided to continue with the same
         * weight… and now it suddenly jumped from 6 to 10."*
         *
         * `fromCoach.count` is how many things the coach wrote a NOTE about, and a coach that holds
         * a lift and explains why has written a note without changing anything. Two sessions in a
         * week write twice as many notes, which is the jump he saw. `coachChanges` subtracts the two
         * programmes the app already holds — see its header for why this cannot be asked of the
         * coach — and a hold is not in the answer.
         */
        setBriefCount(coachChanges(coachPlan, weekAnchor)?.length ?? null);
        /*
         * THE UNSEEN DOT, from one comparison. A decision newer than her last visit to the letter is
         * news she has not read. There is no second "seen" flag to write and therefore none to fall
         * out of step with the log about whether there is anything to see.
         */
        const newest = (fromCoach?.lines.length ?? 0) > 0 ? Math.max(...(log ?? []).map((d) => Date.parse(d.at)).filter(Number.isFinite)) : 0;
        setBriefUnseen(newest > 0 && newest > (letterSeen ?? 0));
        setChangedDir(directions);
      } catch {
        if (!cancelled) {
          setBriefCount(null);
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
    const lifts = todayCoach?.items;
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
      durationLabel: todayCoach && todayCoach.minutes > 0 ? `~${todayCoach.minutes} min` : undefined,
      // WT7 — her very first: no completed session anywhere in her history. Read from the same
      // history every other surface reads, so the wrist and the phone agree about which day it is.
      firstWorkout: saved != null && saved.length === 0,
      resting,
      gated,
      workouts: coachWorkouts.map((w) => ({
        id: w.id,
        name: w.name,
        lifts: w.items,
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
  useEffect(() => {
    if (!isFocused || !resting) return;
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
          for (const set of s.sets) kg += (set.actualWeight ?? 0) * set.actualReps;
          if (s.sets.length) {
            const last = Date.parse(s.sets[s.sets.length - 1].persistedAt);
            const sessionMs = Math.max(0, last - Date.parse(s.startedAt));
            ms += sessionMs;
            const k = sessionKcal(s, sessionMs, app.profile?.weightKg);
            if (k != null) kcal = (kcal ?? 0) + k;
          }
        }
        setWeekEnergy({ tonnes: kg / 1000, kcal });
      } catch {
        if (!cancelled) setWeekEnergy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, resting, app.profile?.weightKg]);

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
      await session.startCoach(planned, todayId);
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
      planMinutes={todayCoach ? Math.max(5, Math.round(todayCoach.minutes / 5) * 5) : 0}
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
      brief={brief}
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

      briefCount={briefCount}
      undoable={undoable}
      onUndoSwap={async () => {
        if (!undoable) return;
        setUndoable(null); // the offer is spent the moment it is taken — never twice
        await app.undoEngineSwap(undoable.anchor);
      }}
      briefUnseen={briefUnseen}
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
      nextWorkoutName={nextCoach?.name ?? null}
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
