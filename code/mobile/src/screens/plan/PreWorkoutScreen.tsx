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
// @ts-nocheck

// 

import React, { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PreWorkoutView } from '@/screens/plan/PreWorkout';
import type { PlanLift } from '@/components/PlanLifts';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { loadWeekPlan } from '@/data/local/weekPlan';
import { coachWeek, coachRows, coachPlanRows, coachLoadDirections, coachChangedCase, coachChanges } from '@/domain/coachWeek';
import { WhyChangedSheet, whyProps } from '@/components/WhyChangedSheet';
import { WhyHereSheet, whyHereProps } from '@/components/WhyHereSheet';
import { liftPlacement, type LiftPlacement } from '@/domain/whyLiftIsHere';
import { WEEKLY_SETS_FLOOR, SESSION_MAX } from '@/engine/v5/constants';
import { exerciseDisplayName } from '@/data/exercises';
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
  /**
   * ⛔ AND THE REASON A LIFT IS HERE AT ALL (founder 2026-08-11) — the WHY for one **not trained
   * yet**, which in her first week is every lift on this card.
   *
   * A `ChangedLiftCase` needs two programmes to compare, so week one has none and the row used to
   * fall through to the form clip. `liftPlacement` reads the ENGINE's week — the muscle, her mark,
   * the dose, the movement it fills — none of which needs a second programme or a single logged set.
   *
   * ⚠️ IT READS `db.loadProgram()` AND NOT THE COACH PLAN THIS SCREEN DRAWS FROM. Deliberate, and
   * the fallback below is what makes it safe: the placement answers for lifts the engine placed and
   * stays silent for anything else, so a row it cannot explain opens the clip exactly as it did.
   */
  const [placements, setPlacements] = useState<Record<string, LiftPlacement>>({});
  const [hereFor, setHereFor] = useState<string | null>(null);
  /** The engine's own days, by name — read only for the two verdicts it stamps on them. */
  const [engineDays, setEngineDays] = useState<Record<string, { overBudget?: boolean; shortOfBudget?: boolean }>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [now, before, history, weekOpenMs, log, program] = await Promise.all([
        loadWeekPlan().catch(() => null),  // one door — see `data/local/weekPlan`
        db.loadCoachPlanWeek().catch(() => null),
        db.loadHistory().catch(() => []),
        db.loadWeekOpen().catch(() => null),
        db.loadCoachLog().catch(() => null),
        db.loadProgram().catch(() => null),
      ]);
      if (!alive) return;
      /*
       * Built for every lift the engine's week holds rather than for the row she pressed, because
       * the alternative is a read on every tap — and this is the screen she stands in front of
       * deciding whether to train, where a sheet that takes a frame to open reads as a stall.
       */
      /*
       * ⛔ THE S-3 SENTENCE, BOTH HALVES (founder 2026-08-12). The engine stamps its verdict on the
       * DAY (`overBudget` / `shortOfBudget`) and until now only telemetry read it. Matched by NAME,
       * because that is what survives the conversion into a `CoachPlan` — the bridge carries the
       * engine's own day name across, so this cannot drift with the ordering.
       */
      setEngineDays(
        Object.fromEntries(
          (program?.days ?? []).filter((d) => !d.isRest).map((d) => [d.name, d]),
        ),
      );
      const here: Record<string, LiftPlacement> = {};
      for (const d of program?.days ?? [])
        if (!d.isRest)
          for (const s of d.slots) {
            const p = liftPlacement(s.exerciseId, program, app.profile?.bodyMap, app.profile?.daysPerWeek, history ?? []);
            if (p) here[s.exerciseId] = p;
          }
      setPlacements(here);
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
            ? t('home.planShape', { count: lifts.length, lifts: lifts.length, min: minutes })
            : t('home.planShapeNoTime', { count: lifts.length, lifts: lifts.length })
          : null
      }
      minutes={minutes}
      lifts={lifts}
      units={units}
      changes={changes}
      /*
       * ⚠️ IT USES THE MINUTES ALREADY ON SCREEN, not a second estimate. The card says "~50 min" one
       * line above; a sentence quoting a different number would be the two-answers defect this file
       * has already been audited for once.
       */
      budgetNote={
        workout && engineDays[workout.name]?.overBudget
          ? t('budgetNote.over', { min: minutes, budget: app.profile?.workoutMinutes ?? SESSION_MAX })
          : workout && engineDays[workout.name]?.shortOfBudget
            ? t('budgetNote.short', { min: minutes })
            : null
      }
      onForm={(exerciseId) => navigation.navigate('WorkoutDetail', { exerciseId } as never)}
      /*
       * ⛔ THE ROW ALWAYS ASKS; THIS DECIDES WHICH ANSWER EXISTS — in order of how much it knows.
       *
       *   1. the engine MOVED this load ....... the case, on `WhyChangedSheet`
       *   2. the engine PLACED this lift ...... the placement, on `WhyHereSheet`
       *   3. neither ......................... the form clip, exactly as before
       *
       * ⚠️ THE ORDER IS THE PRODUCT DECISION. A lift whose load moved gets the load's argument even
       * though a placement also exists for it: she is looking at a figure that changed since last
       * week, and answering "this trains your back" to that would be answering a question she did
       * not ask. The placement is what a lift says when it has nothing newer to report.
       */
      onWhy={(exerciseId) =>
        whyByExercise[exerciseId]
          ? setWhyFor(exerciseId)
          : placements[exerciseId]
            ? setHereFor(exerciseId)
            : navigation.navigate('WorkoutDetail', { exerciseId } as never)
      }
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
      {hereFor && placements[hereFor] ? (
        <View style={StyleSheet.absoluteFill}>
          <WhyHereSheet
            {...whyHereProps(placements[hereFor], exerciseDisplayName(hereFor), t, WEEKLY_SETS_FLOOR)}
            onClose={() => setHereFor(null)}
          />
        </View>
      ) : null}
    </View>
  );
}
