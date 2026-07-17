/**
 * Home — container. Wires app/session state + navigation to the pure HomeView.
 * Home answers one question (§4.7/§4.8): what do I do today? It re-resolves the
 * next workout on focus and drains offline work. No auto-interrupts.
 *
 * (This header used to end "the Portrait appears (unlocked) only when its tab is opened". There is
 * no Portrait — it was removed long before v5 — and there are no tabs. Corrected 2026-07-17; the
 * only trace left is the vestigial `unlockedPortrait` flag on the session store's end result.)
 */
import React, { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeView } from '@/screens/home/HomeView';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { useCopy } from '@/i18n/useCopy';
import { estimateSessionMinutes } from '@/data/api/fixtureModel';
import { useApp } from '@/state/stores/appStore';
import { REST_INTER_S, REST_TRANSITION_S, restInterSecondsFor, useSession } from '@/state/stores/sessionStore';
import { buildWatchPlanSnapshot } from '@/platform/watch/watchPlan';
import type { WatchPlanSnapshot } from '@/platform/watch/protocol';
import { flush as flushTelemetry } from '@/platform/telemetry';
import { nextWorkout } from '@/domain/schedule';
import { displayWeekNumber } from '@/domain/weekCadence';
import { isTrainingGated } from '@/domain/entitlement';
import { weekBriefing, type BriefChange } from '@/domain/weekBriefing';
import type { Line } from '@/domain/voice';
import { getWeeklyPlan, getWeeklyUpdate } from '@/domain/weeklyUpdate';
import { muscleGroupsLabel, exerciseDisplayName, exerciseCues } from '@/data/exercises';
import type { SetTarget } from '@/data/local/models';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Home'>;

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

  const plan = React.useMemo(() => {
    if (!day || planTargets == null) return null;
    return day.slots.map((slot) => {
      const first = planTargets.find((x) => x.exerciseId === slot.exerciseId && x.setIndex === 0);
      return {
        exerciseId: slot.exerciseId,
        name: exerciseDisplayName(slot.exerciseId),
        load: first?.recommendedWeight ?? null,
        sets: slot.setCount,
        reps: first?.recommendedReps ?? 8,
      };
    });
  }, [day, planTargets]);

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
      setWatchPlan(
        buildWatchPlanSnapshot({
          days,
          targetsByDay,
          nowMs: Date.now(),
          restInterS: REST_INTER_S,
          restTransitionS: REST_TRANSITION_S,
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
  useEffect(() => {
    if (!isFocused || !program) return;
    let cancelled = false;
    void (async () => {
      try {
        // `getWeeklyUpdate()` is the one honest test of "has the engine ever decided anything for
        // this athlete" — it is null until the first roll folds a week in. The PLAN view alone
        // cannot answer it: a week with no update and a week where nothing changed both read as
        // zero changes, and those are two completely different sentences.
        const [update, view] = await Promise.all([getWeeklyUpdate(), getWeeklyPlan(program)]);
        if (cancelled) return;
        const changes: BriefChange[] | null =
          update && view
            ? view.workouts.flatMap((w) =>
                w.lifts
                  .filter((l) => l.change)
                  .map((l) => ({
                    name: l.name,
                    loadFrom: l.change!.snapshot.loadFrom,
                    loadTo: l.change!.snapshot.loadTo,
                    swapped: l.change!.snapshot.swapped,
                  })),
              )
            : null; // week 1: the engine has a baseline, not a decision — and it says nothing here
        setBrief(weekBriefing(changes, app.profile?.units ?? 'kg'));
        setBriefCount(changes ? changes.length : null);
        setBriefUnseen(!!update && !update.seen);
      } catch {
        // The engine record could not be read. Say NOTHING rather than something generic — an
        // invented sentence about decisions we cannot see would be the one unforgivable lie here.
        if (!cancelled) {
          setBrief(null);
          setBriefCount(null);
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
      dayDone={!!day?.completed}
      units={app.profile?.units ?? 'kg'}
      onForm={setFormFor}
      resumable={resumable}
      onResume={onResume}
      onStart={onStart}
      workouts={workouts}
      onChooseWorkout={setChosenId}
      brief={brief}
      briefCount={briefCount}
      briefUnseen={briefUnseen}
      onWeeklyUpdate={() => navigation.navigate('WeeklyUpdate')}
      onHistory={() => navigation.navigate('History')}
      onSettings={() => navigation.navigate('ProfileSheet')}
      onProgress={() => navigation.navigate('Progress')}
      onCardio={() => navigation.navigate('Cardio')}
      />
      {/* The form clip — the one job the plan screen did that the list on Home does not. It was a
          whole screen away (Home → chip → chip again → a row's ▶); it is now a tap on the lift. */}
      {formFor ? (
        <ExerciseDemo
          title={exerciseDisplayName(formFor)}
          exerciseId={formFor}
          cues={exerciseCues(formFor)}
          focusLabel={t('workout.focusOn')}
          formGuideLabel={t('workout.form')}
          doneLabel={t('common.close')}
          onDone={() => setFormFor(null)}
        />
      ) : null}
    </>
  );
}
