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
import { coachWeek, coachRows, coachPlanRows, coachLoadDirections, coachChangedCase, coachChanges } from '@/domain/coachWeek';
import { WhyChangedSheet, whyProps } from '@/components/WhyChangedSheet';
import type { ChangedLiftCase } from '@/domain/changedLiftCase';
import { currentLocale } from '@/i18n';
import { View, StyleSheet } from 'react-native';
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
  /** The programme this week opened on — the other half of every change, as everywhere else. */
  const [weekPlan, setWeekPlan] = useState<CoachPlan | null>(null);
  /**
   * ⛔ THE ROW OPENS THE LIFT'S OWN REASON (audit, 2026-08-05).
   *
   * The first cut sent `onWhy` to the Mirror — the whole week's letter — which is the wrong
   * explanation for the row she pressed and the same "two screens, two answers" shape I had spent
   * the morning removing from the pill. This is the SAME sheet Today opens, built from the same
   * `coachChangedCase`, so a lift explains itself identically from either door.
   */
  const [whyByExercise, setWhyByExercise] = useState<Record<string, ChangedLiftCase>>({});
  const [whyFor, setWhyFor] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [now, before, history, weekOpenMs, log] = await Promise.all([
        db.loadCoachPlan().catch(() => null),
        db.loadCoachPlanWeek().catch(() => null),
        db.loadHistory().catch(() => []),
        db.loadWeekOpen().catch(() => null),
        db.loadCoachLog().catch(() => null),
      ]);
      if (!alive) return;
      setPlan(now ?? null);
      setWeekPlan(before ?? null);
      const dirs = coachLoadDirections(now, before) as Record<string, LoadDirection>;
      setDirections(dirs);
      /*
       * The coach's own sentence, matched to the lift by the note it wrote — exactly as Home does.
       * ⚠️ A lift with a direction and NO note keeps its colour and simply has no sheet: the colour
       * is a fact we derived, and inventing a sentence under it would be the app arguing on the
       * coach's behalf.
       */
      const saidFor = new Map((log ?? []).filter((d) => d.ex).map((d) => [d.ex as string, d.say]));
      const cases: Record<string, ChangedLiftCase> = {};
      for (const ex of Object.keys(dirs)) {
        const c = coachChangedCase(ex, now, before, saidFor.get(ex), units);
        if (c) cases[ex] = c;
      }
      setWhyByExercise(cases);
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

  /**
   * How many of THESE lifts the coach changed — this workout, not the week.
   *
   * ⚠️ IT ASKS `coachChanges`, THE SAME FUNCTION TODAY AND THE MIRROR ASK, filtered to the lifts on
   * this card. Counting `changed !== 'hold'` off the direction map would have been a THIRD
   * definition of the word "change" in one product — it misses a set count that moved and a lift
   * that arrived, both of which the founder named explicitly: *"a change is only if there is a drop
   * or a raise or added sets or anything else."*
   */
  const changes = React.useMemo(() => {
    const mine = new Set(lifts.map((l) => l.exerciseId));
    return (coachChanges(plan, weekPlan) ?? []).filter((c) => mine.has(c.ex)).length;
  }, [plan, weekPlan, lifts]);

  // Rounded to five, exactly as Today rounds it — "~50 min" on two screens must be the same 50.
  const minutes = workout ? Math.max(5, Math.round(workout.minutes / 5) * 5) : 0;

  if (!workout) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
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
      onForm={(exerciseId) => navigation.navigate('WorkoutDetail', { exerciseId } as never)}
      onWhy={(exerciseId) => (whyByExercise[exerciseId] ? setWhyFor(exerciseId) : navigation.navigate('WorkoutDetail', { exerciseId } as never))}
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
      {whyFor && whyByExercise[whyFor] ? (
        <View style={StyleSheet.absoluteFill}>
          <WhyChangedSheet {...whyProps(whyByExercise[whyFor], t, currentLocale())} onClose={() => setWhyFor(null)} />
        </View>
      ) : null}
    </View>
  );
}
