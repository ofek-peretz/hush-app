/**
 * Home — container. Wires app/session state + navigation to the pure HomeView.
 * Home answers one question (§4.7/§4.8): what do I do today? It re-resolves the
 * next workout on focus and drains offline work. No auto-interrupts — the Portrait
 * appears (unlocked) only when its tab is opened (spec IA §3).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeView } from '@/screens/home/HomeView';
import { useApp } from '@/state/stores/appStore';
import { REST_INTER_S, REST_TRANSITION_S, restInterSecondsFor, useSession } from '@/state/stores/sessionStore';
import { buildWatchPlanSnapshot } from '@/platform/watch/watchPlan';
import type { WatchPlanSnapshot } from '@/platform/watch/protocol';
import { flush as flushTelemetry } from '@/platform/telemetry';
import { nextWorkout } from '@/domain/schedule';
import { trainingWeekNumber } from '@/domain/weekCadence';
import { isTrainingGated } from '@/domain/entitlement';
import { muscleGroupsLabel } from '@/data/exercises';
import type { SetTarget } from '@/data/local/models';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Home'>;

export function Home({ navigation, route }: Props) {
  const app = useApp();
  const session = useSession();
  const program = app.program;
  // WEEKLY model: Home offers the next UNFINISHED workout in the week (any order, no calendar).
  // "Set as next" passes `focusDayId` — honor it while that workout is still unfinished
  // (survives the program refetch on focus, which would otherwise revert the choice).
  const focusDayId = route.params?.focusDayId;
  const focusDay =
    focusDayId && program
      ? program.days.find((d) => d.id === focusDayId && !d.isRest && !d.completed) ?? null
      : null;
  // "Choose workout" (top-right) swaps the workout shown on Home immediately. Local,
  // session-scoped, takes priority over the default next workout (matches the prototype).
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosenDay =
    chosenId && program ? program.days.find((d) => d.id === chosenId && !d.isRest) ?? null : null;
  const day = chosenDay ?? focusDay ?? (program ? nextWorkout(program) : null);
  // Every non-rest workout in the week, with its muscle groups, for the chooser.
  const workouts = (program?.days ?? [])
    .filter((d) => !d.isRest)
    .map((d) => ({ id: d.id, name: d.name, muscles: muscleGroupsLabel(d.muscleGroups) }));
  const isFocused = useIsFocused();

  const nowMs = Date.now();
  // Recovery: every workout in the loaded week is done, so there is no next workout to offer. The
  // bucket only regenerates at the Sunday-04:00 calendar roll (appStore.refreshProgram), so a week
  // finished early holds Recovery until the new week opens — the "no starting early" gate is now
  // structural (no fresh bucket exists before Sunday), so no separate lock is needed here.
  const resting = !!program && program.days.length > 0 && !day;

  // Training-week counter ("Week N"), counted from account creation in Sunday-04:00 windows.
  const weekNumber = trainingWeekNumber(app.profile?.memberSince, nowMs);

  // Prefetched targets for the next workout, so Slide-to-start launches with no
  // network wait (the round-trip happens while the athlete is on Home, not after
  // they commit the slide). Keyed by day id; cleared when the day changes.
  const prefetch = useRef<{ dayId: string; targets: SetTarget[] } | null>(null);

  // Standalone watch execution data: the model's prescriptions for every REMAINING
  // workout, precomputed here (the phone owns the model) and shipped with the lobby
  // so the watch can execute a workout with the phone absent. Best-effort + silent:
  // a day whose targets fail to resolve just narrows the snapshot.
  const [watchPlan, setWatchPlan] = useState<WatchPlanSnapshot | null>(null);
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
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, program, app.modeState.completedSessions]);

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
  }, [day?.id, day?.name, resting, workouts.length, watchPlan]);

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

  // Free-trial gate (Subscription + Apple Payments): once the free sessions are
  // spent and no membership is active, starting another session opens the paywall.
  const gated = isTrainingGated(app.modeState.completedSessions, app.entitlement.active);

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
    const ok = await session.resumeSaved();
    setResumable(null);
    if (ok) navigation.navigate('SessionFlow');
    // Not resumable after all (stale/complete) → the salvage already ran; Home falls back to Begin.
  }

  async function onStart() {
    if (!day) return;
    if (resting) return; // hard gate: the next week is locked until Sunday 04:00
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

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const hour = now.getHours();
  const greetingPart: 'morning' | 'afternoon' | 'evening' =
    hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  // Weekly model: completed (non-rest) workouts in the current program week.
  const trainedThisWeek = program ? program.days.filter((d) => d.completed && !d.isRest).length : 0;

  return (
    <HomeView
      resting={resting}
      dayName={day?.name ?? null}
      muscles={muscleGroupsLabel(day?.muscleGroups)}
      greetingPart={greetingPart}
      name={app.profile?.name ?? null}
      trainedThisWeek={trainedThisWeek}
      startError={startError}
      dateLabel={dateLabel}
      weekNumber={weekNumber}
      exerciseCount={day?.slots.length}
      restDaysTaken={program ? program.days.filter((d) => d.isRest).length : 0}
      resumable={resumable}
      onResume={onResume}
      onStart={onStart}
      workouts={workouts}
      onChooseWorkout={setChosenId}
      onProgram={() => navigation.navigate('Program')}
      onHistory={() => navigation.navigate('History')}
      onSettings={() => navigation.navigate('ProfileSheet')}
      onProgress={() => navigation.navigate('Progress')}
      onCardio={() => navigation.navigate('Cardio')}
    />
  );
}
