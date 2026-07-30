/**
 * Home — container. Wires app/session state + navigation to the pure HomeView.
 * Home answers one question (§4.7/§4.8): what do I do today? It re-resolves the
 * next workout on focus and drains offline work. No auto-interrupts.
 *
 * (This header used to end "the Portrait appears (unlocked) only when its tab is opened". There is
 * no Portrait — it was removed long before v5 — and there are no tabs. Corrected 2026-07-17; the
 * only trace left is the vestigial `unlockedPortrait` flag on the session store's end result.)
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { HomeView } from '@/screens/home/HomeView';
import { homePlanRows, settledPlanRows } from '@/screens/home/homePlan';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { useCopy } from '@/i18n/useCopy';
import { currentLocale } from '@/i18n';
import { estimateSessionMinutes } from '@/data/api/fixtureModel';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import type { Session } from '@/data/local/models';
import { REST_INTER_S, restInterSecondsFor, restTransitionSeconds, refreshLearnedRests, useSession } from '@/state/stores/sessionStore';
import { buildWatchPlanSnapshot } from '@/platform/watch/watchPlan';
import type { WatchPlanSnapshot } from '@/platform/watch/protocol';
import { flush as flushTelemetry } from '@/platform/telemetry';
import { nextWorkout, sessionDayName, displayWeight, unitLabel } from '@/domain/schedule';
import { displayWeekNumber, currentWeekOpen } from '@/domain/weekCadence';
import { sessionKcal } from '@/domain/energy';
import { isTrainingGated, freeSessionsRemaining } from '@/domain/entitlement';
import { comebackAfterGap } from '@/domain/comeback';
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
import type { Line } from '@/domain/voice';
import { getWeeklyPlan, getWeeklyUpdate } from '@/domain/weeklyUpdate';
import { muscleGroupsLabel, exerciseDisplayName, exerciseCues } from '@/data/exercises';
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
  const program = app.program;
  // WEEKLY model: Home offers the next UNFINISHED workout in the week (any order, no calendar).
  /*
   * A CHIP SHOWS A PLAN — including a finished one (founder 2026-07-17: "tapping each chip shows
   * the workout plan"). So SELECTED and QUEUED are no longer the same thing, and they cannot be:
   * a finished workout can be read, but never started again (founder 2026-07-11). `!d.completed`
   * used to gate this, which meant a done chip silently fell back to the next workout and showed
   * the WRONG plan. The gate moved to where it belongs — the act, not the view: a done day still
   * renders its lifts, and the button becomes the quiet "trained this week" note instead of Begin.
   */
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosenDay =
    chosenId && program ? program.days.find((d) => d.id === chosenId && !d.isRest) ?? null : null;
  const nextUp = program ? nextWorkout(program) : null;
  const day = chosenDay ?? nextUp;

  /*
   * There is only ONE door to the selection now — the chips. "THE LAST INTENT WINS" used to
   * arbitrate between two: a chip here, and Begin pressed inside the workout's plan screen, which
   * returned with `focusDayId`. That screen is gone (its list, with the loads it never showed, is
   * on this page), so the arbitration went with it. One door needs no referee.
   */
  // Every non-rest workout in the week, with its muscle groups, for the chooser.
  const workouts = (program?.days ?? [])
    .filter((d) => !d.isRest)
    .map((d) => ({ id: d.id, name: d.name, muscles: muscleGroupsLabel(d.muscleGroups), done: !!d.completed }));
  const isFocused = useIsFocused();

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
  // Which lifts the engine touched this week AND WHICH WAY — so Today can light their figure in the
  // direction it moved (founder 2026-07-29; it used to be one ochre for all three, which named a
  // change and refused to say whether the load had gone up or down). Empty in week one.
  const [changedDir, setChangedDir] = useState<Record<string, LoadDirection>>({});
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
  const [formFor, setFormFor] = useState<string | null>(null);
  const dayIdForPlan = day?.id ?? null;
  useEffect(() => {
    if (!dayIdForPlan) {
      setPlanTargets(null);
      return;
    }
    let alive = true;
    setPlanTargets(null); // never show the previous workout's loads under a new name
    app.model
      .sessionTargets({ programDayId: dayIdForPlan, completedSessions: app.modeState.completedSessions })
      .then((ts) => {
        if (alive) setPlanTargets(ts);
      })
      .catch(() => {
        if (alive) setPlanTargets([]); // an unreadable plan is an empty section, never a hang
      });
    return () => {
      alive = false;
    };
  }, [app.model, app.modeState.completedSessions, dayIdForPlan]);

  // THE LIST DOES NOT STAND DOWN WHEN THE SELECTION CHANGES (A.12) — see `homePlan.ts` for the
  // whole argument. The rows are the day's; only their figures are the engine's, and only those wait.
  const plan = React.useMemo(() => homePlanRows(day, planTargets, changedDir), [day, planTargets, changedDir]);

  const nowMs = Date.now();
  // Recovery: every workout in the loaded week is done, so there is no next workout to offer. The
  // bucket only regenerates at the Saturday-20:30 calendar roll (appStore.refreshProgram), so a week
  // finished early holds Recovery until the new week opens — the "no starting early" gate is now
  // structural (no fresh bucket exists before the roll), so no separate lock is needed here.
  //
  // It reads `nextUp`, not `day`: `day` can now be a FINISHED workout the athlete tapped to re-read,
  // and looking back at Monday's session is not a reason to stop saying the week is complete —
  // choosing one simply shows it, and Recovery returns the moment the selection is cleared.
  const resting = !!program && program.days.length > 0 && !nextUp && !chosenDay;

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
    if (!isFocused || !program) return;
    let cancelled = false;
    void (async () => {
      const days = program.days.filter((d) => !d.isRest && !d.completed);
      const targetsByDay: Record<string, SetTarget[]> = {};
      for (const d of days) {
        try {
          targetsByDay[d.id] = await app.model.sessionTargets({
            programDayId: d.id,
            completedSessions: app.modeState.completedSessions,
          });
        } catch {
          /* skip this day — the watch just can't start it offline */
        }
      }
      if (cancelled) return;
      // S-17 — the standalone watch plan must ship HER rests, not the tier bootstrap. The phone is
      // the sole authority (S-48), so it hands the wrist the same learned timer it would run itself.
      refreshLearnedRests(await db.loadHistory().catch(() => []));
      setWatchPlan(
        buildWatchPlanSnapshot({
          days,
          targetsByDay,
          nowMs: Date.now(),
          restInterS: REST_INTER_S,
          restTransitionS: restTransitionSeconds(), // S-17 — her learned transition rides to the wrist too
          restInterSFor: restInterSecondsFor,
        }),
      );
      setEngineTick((n) => n + 1); // the week's decisions are now on disk — the briefing may read
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, program, app.modeState.completedSessions]);

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
  useEffect(() => {
    if (!isFocused || !program) return;
    let cancelled = false;
    void (async () => {
      try {
        // `getWeeklyUpdate()` is the one honest test of "has the engine ever decided anything for
        // this athlete" — it is null until the first roll folds a week in. The PLAN view alone
        // cannot answer it: a week with no update and a week where nothing changed both read as
        // zero changes, and those are two completely different sentences.
        const [update, view, prefs] = await Promise.all([getWeeklyUpdate(), getWeeklyPlan(program), db.loadPreferences()]);
        if (cancelled) return;
        /*
         * WHICH SWAP CAN SHE TAKE BACK? Only a live engine ROTATION (S-71's scope — a graduation is
         * not resistible, and her own learned swap is not ours to undo).
         *
         * `engineRotated` maps anchor → the lift it rotated to, so the lift now IN the plan is the
         * value and the one to give back is the KEY. Same reverse-lookup the in-workout swap menu
         * does to offer the original first (S-70) — one fact, read the same way in both places.
         */
        const rotated = prefs.engineRotated ?? {};
        const undoAnchorFor = (currentExerciseId: string): string | null =>
          Object.keys(rotated).find((anchor) => rotated[anchor] === currentExerciseId) ?? null;
        const changes: BriefChange[] | null =
          update && view
            ? [
                ...view.workouts.flatMap((w) =>
                  w.lifts
                    .filter((l) => l.change)
                    .map((l) => ({
                      name: l.name,
                      loadFrom: l.change!.snapshot.loadFrom,
                      loadTo: l.change!.snapshot.loadTo,
                      swapped: l.change!.snapshot.swapped,
                    })),
                ),
                // Loop 3 volume moves are news too: they carry no load and no swap, so they reach
                // the briefing only as COUNT (the "tuned" sentence) — but they must reach it, or a
                // volume-only week reads "steady" here while the letter shows what changed.
                ...(view.volume ?? []).map((v) => ({ name: v.muscle, loadFrom: null, loadTo: null, swapped: false })),
              ]
            : null; // week 1: the engine has a baseline, not a decision — and it says nothing here
        setBrief(weekBriefing(changes, app.profile?.units ?? 'kg'));
        setBriefCount(changes ? changes.length : null);
        setLoadsUp(
          (view?.workouts ?? [])
            .flatMap((w) => w.lifts)
            .filter(
              (l) =>
                l.change != null &&
                l.change.snapshot.loadFrom != null &&
                l.change.snapshot.loadTo != null &&
                l.change.snapshot.loadTo > l.change.snapshot.loadFrom,
            ).length,
        );
        const changedLifts = (view?.workouts ?? []).flatMap((w) => w.lifts).filter((l) => l.change);
        // The direction the row is lit in, from the stamped snapshot and nothing else. A structural
        // change (a graduation, a rotation) has no load it came FROM, so it is not a fall — it is a
        // new lift arriving, and it lights like one.
        setChangedDir(
          Object.fromEntries(
            changedLifts.map((l) => {
              const s = l.change!.snapshot;
              const dir: LoadDirection =
                s.loadFrom == null || s.loadTo == null ? 'up' : s.loadTo < s.loadFrom ? 'down' : s.loadTo > s.loadFrom ? 'up' : 'hold';
              return [l.exerciseId, dir];
            }),
          ),
        );
        // …and the case for each, read off the same stamped view plus the two most recent sessions
        // of that lift in the athlete's own history.
        const history = await db.loadHistory().catch(() => [] as Session[]);
        if (cancelled) return;
        setWhyByExercise(
          Object.fromEntries(
            changedLifts.map((l) => [l.exerciseId, changedLiftCase(l, history, app.profile?.units ?? 'kg')]),
          ),
        );
        // The undo, if the engine rotated a lift away this week. At most one is offered: the
        // sentence names one swap ("I swapped one lift — X"), so the button beside it can only
        // honestly belong to that one.
        const swappedLift = (view?.workouts ?? [])
          .flatMap((w) => w.lifts)
          .find((l) => l.change?.snapshot.swapped && undoAnchorFor(l.exerciseId));
        setUndoable(
          swappedLift
            ? { anchor: undoAnchorFor(swappedLift.exerciseId)!, name: exerciseDisplayName(undoAnchorFor(swappedLift.exerciseId)!) }
            : null,
        );
        setBriefUnseen(!!update && !update.seen);
      } catch {
        // The engine record could not be read. Say NOTHING rather than something generic — an
        // invented sentence about decisions we cannot see would be the one unforgivable lie here.
        if (!cancelled) {
          setBrief(null);
          setBriefCount(null);
          setChangedDir({});
          setLoadsUp(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, program, engineTick, app.profile?.units]);

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

  // Warm the targets cache for the offered workout (best-effort, silent).
  useEffect(() => {
    if (!isFocused || !day) return;
    if (prefetch.current?.dayId === day.id) return;
    let cancelled = false;
    void app.model
      .sessionTargets({ programDayId: day.id, completedSessions: app.modeState.completedSessions })
      .then((targets) => {
        if (cancelled) return;
        prefetch.current = { dayId: day.id, targets }; // warm the cache for a no-wait slide-to-start
      })
      .catch(() => {
        /* fall back to fetching on demand in onStart */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, day?.id, app.modeState.completedSessions]);

  // Keep the Apple Watch Start screen in sync with the queued workout (read-only —
  // the watch mirrors the iPhone home card). Starting a workout stays phone-initiated;
  // this only publishes WHAT is queued. No-op while a session is active (the mirror
  // drives the watch then). Re-publishes when the queued workout / list / lock changes.
  useEffect(() => {
    const lifts = day ? day.slots.length : undefined;
    session.publishWatchLobby({
      workoutId: day?.id ?? null,
      workoutName: day?.name ?? '',
      muscles: muscleGroupsLabel(day?.muscleGroups),
      lifts,
      // Rough estimate (no per-day duration on the model yet): ~8 min per lift.
      durationLabel: lifts ? `~${lifts * 8} min` : undefined,
      // WT7 — her very first: no completed session anywhere in her history. Read from the same
      // history every other surface reads, so the wrist and the phone agree about which day it is.
      firstWorkout: saved != null && saved.length === 0,
      resting,
      gated,
      workouts: (program?.days ?? [])
        .filter((d) => !d.isRest)
        .map((d) => ({
          id: d.id,
          name: d.name,
          lifts: d.slots.length,
          muscles: muscleGroupsLabel(d.muscleGroups),
          done: d.completed,
        })),
    }, watchPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.id, day?.name, resting, gated, workouts.length, watchPlan]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.id, resting]);

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

  // ── RECOVERY FACTS (v7 3.5 "THE WEEK IS DONE") — the day strip + the week's tonnage/kcal, read
  //    from this week's saved history. Best-effort and only while resting: an unread history simply
  //    leaves the strip and band undrawn (HomeView treats both as optional).
  const [weekDays, setWeekDays] = useState<{ trained: boolean; today: boolean }[] | undefined>(undefined);
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
        // Seven marks, Sun→Sat: a day is "trained" if any session started on it this week.
        const todayDow = new Date().getDay();
        const trained = new Array(7).fill(false) as boolean[];
        for (const s of wk) trained[new Date(s.startedAt).getDay()] = true;
        setWeekDays(trained.map((tr, i) => ({ trained: tr, today: i === todayDow })));
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
        if (!cancelled) {
          setWeekDays(undefined);
          setWeekEnergy(null);
        }
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
    if (!day) return;
    if (resting) return; // hard gate: the next week is locked until the Saturday 20:30 roll
    if (gated) {
      navigation.navigate('Paywall', { source: 'gate' });
      return;
    }
    setStartError(false);
    try {
      const targets =
        prefetch.current?.dayId === day.id
          ? prefetch.current.targets
          : await app.model.sessionTargets({
              programDayId: day.id,
              completedSessions: app.modeState.completedSessions,
            });
      await session.start(day, targets);
      navigation.navigate('SessionFlow');
    } catch {
      setStartError(true);
    }
  }

  // Weekly model: completed (non-rest) workouts in the current program week.
  const trainedThisWeek = program ? program.days.filter((d) => d.completed && !d.isRest).length : 0;

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
        dayName={day?.name ?? null}
        endedOn={app.entitlement.expiresAt ? new Date(app.entitlement.expiresAt).toLocaleDateString() : ''}
        priceLabel={null}
        onResume={() => navigation.navigate('Paywall', { source: 'profile' })}
        kept={[
          ...(last
            ? [{
                key: 'last',
                title: t('lapsed.lastSession', { date: new Date(last.startedAt).toLocaleDateString() }),
                detail: sessionDayName(last, program),
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
      dayName={day?.name ?? null}
      dayId={day?.id ?? null}
      muscles={muscleGroupsLabel(day?.muscleGroups)}
      trainedThisWeek={trainedThisWeek}
      startError={startError}
      weekNumber={weekNumber}
      plan={plan}
      planMinutes={day ? Math.max(5, Math.round(estimateSessionMinutes(day) / 5) * 5) : 0}
      overBudget={!!day?.overBudget}
      budgetMinutes={app.profile?.workoutMinutes ?? 60}
      dayDone={!!day?.completed}
      units={app.profile?.units ?? 'kg'}
      // A CHANGED ROW OPENS ITS CASE (v7 2.1b); an unchanged one opens the form clip. The rule is
      // the row's own state, so there is nothing to teach: the lift Hush moved is already the one
      // drawn differently, and it is the only one with an argument to read.
      onForm={(id) => (whyByExercise[id] ? setWhyFor(id) : setFormFor(id))}
      resumable={resumable}
      onResume={onResume}
      onStart={onStart}
      workouts={workouts}
      onChooseWorkout={setChosenId}
      brief={brief}
      briefCount={briefCount}
      undoable={undoable}
      onUndoSwap={async () => {
        if (!undoable) return;
        setUndoable(null); // the offer is spent the moment it is taken — never twice
        await app.undoEngineSwap(undoable.anchor);
      }}
      briefUnseen={briefUnseen}
      trialLeft={app.entitlement.active ? null : freeSessionsRemaining(app.modeState.completedSessions)}
      onShare={() => navigation.navigate('SharePlan')}
      onWeeklyUpdate={() => navigation.navigate('WeeklyUpdate')}
      weekDays={weekDays}
      weekStats={weekEnergy ? { ...weekEnergy, loadsUp } : null}
      nextWorkoutName={program?.days.find((d) => !d.isRest)?.name ?? null}
      />
      {/* WHY THIS CHANGED — the engine's argument for the lift it moved, at full length. */}
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
