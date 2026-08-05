/**
 * The container for the pre-workout card — reads live, decides nothing.
 *
 * ⚠️ EVERYTHING IS READ FRESH rather than passed in. The route carries only an id, because this is
 * the screen she stands in front of deciding whether the numbers are right, and a snapshot handed
 * over at navigation time goes stale the moment the coach answers a session she finished elsewhere.
 *
 * Starting from HERE is also the second door onto the week board (`domain/weekBoard`): training a
 * session that sits on another day moves it to today and sends today's to the day it came from.
 * That is the founder's own rule and it is the SAME function the drag uses, so the two can never
 * disagree about what a move means.
 */
import React, { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PreWorkoutView } from '@/screens/plan/PreWorkout';
import type { PlanLift } from '@/components/PlanLifts';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { coachWeek, coachRows, coachPlanRows, coachLoadDirections } from '@/domain/coachWeek';
import { daysAfterStarting } from '@/domain/weekBoard';
import { WEEK_ORDER } from '@/domain/trainingDays';
import type { CoachPlan, Weekday } from '@/domain/coachPlan';
import type { LoadDirection } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'PreWorkout'>;

export function PreWorkoutScreen({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [directions, setDirections] = useState<Record<string, LoadDirection>>({});
  const [doneIds, setDoneIds] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [now, before, history, weekOpenMs] = await Promise.all([
        db.loadCoachPlan().catch(() => null),
        db.loadCoachPlanWeek().catch(() => null),
        db.loadHistory().catch(() => []),
        db.loadWeekOpen().catch(() => null),
      ]);
      if (!alive) return;
      setPlan(now ?? null);
      setDirections(coachLoadDirections(now, before) as Record<string, LoadDirection>);
      // ⚠️ THE SAME DERIVATION HOME USES — a session logged since the week opened, against the
      // coach's own id. Two readings of "done" on two screens is how a finished workout comes to
      // wear an offer's clothes on one of them.
      setDoneIds(
        (history ?? [])
          .filter((h) => Date.parse(h.startedAt) >= (weekOpenMs ?? 0) && h.trained !== false)
          .map((h) => h.programDayId)
          .filter((id) => id.startsWith('coach_')),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  const workouts = React.useMemo(() => coachWeek(plan), [plan]);
  const workout = workouts.find((w) => w.id === route.params.workoutId) ?? null;

  const lifts = React.useMemo<PlanLift[]>(() => {
    const rows = coachPlanRows(workout ? coachRows(plan, workout.id) : null, units) ?? [];
    return rows.map((r) => ({ ...r, ...(directions[r.exerciseId] ? { changed: directions[r.exerciseId] } : {}) }));
  }, [plan, workout, units, directions]);

  /** How many of THESE lifts moved — the pill on this card is about this workout, not the week. */
  const changes = lifts.filter((l) => l.changed && l.changed !== 'hold').length;

  // Rounded to five, exactly as Today rounds it — "~50 min" on two screens must be the same 50.
  const minutes = workout ? Math.max(5, Math.round(workout.minutes / 5) * 5) : 0;

  if (!workout) return null;

  return (
    <PreWorkoutView
      name={workout.name}
      dayLabel={workout.day ? t(`weekday.${workout.day}`) : null}
      shape={
        lifts.length
          ? minutes
            ? t('home.planShape', { lifts: lifts.length, min: minutes })
            : t('home.planShapeNoTime', { lifts: lifts.length })
          : null
      }
      lifts={lifts}
      units={units}
      changes={changes}
      onChanges={() => navigation.navigate('WeeklyUpdate')}
      onForm={(exerciseId) => navigation.navigate('WorkoutDetail', { exerciseId } as never)}
      onWhy={() => navigation.navigate('WeeklyUpdate')}
      done={doneIds.includes(workout.id)}
      onClose={() => navigation.goBack()}
      onStart={() => {
        /*
         * ⛔ THE SECOND DOOR ONTO THE BOARD (founder 2026-08-05): *"if the athlete presses a
         * different workout and starts it, the AI swaps the position of the current workout with
         * the position of the workout she started."*
         *
         * ⚠️ FIRE AND FORGET, AND DELIBERATELY SO. She is starting a workout; a storage write must
         * never stand between the tap and the first set. If it fails the board is one day out of
         * date, which costs nothing and corrects itself the next time she moves one.
         */
        const today = WEEK_ORDER[new Date().getDay()] as Weekday;
        const moved = daysAfterStarting(workouts, workout.id, today);
        if (moved) void db.saveCoachPlanDays(moved).catch(() => {});
        navigation.replace('SessionFlow', { workoutId: workout.id } as never);
      }}
    />
  );
}
