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

// 

import React, { useEffect, useState } from 'react';
import { plannedMinutes } from '@/domain/duration';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PreWorkoutView, PreWorkoutMovedView } from '@/screens/plan/PreWorkout';
import type { PlanLift } from '@/components/PlanLifts';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { loadWeekPlan } from '@/data/local/weekPlan';
import { coachWeek, coachRows, coachPlanRows, coachLoadDirections, coachChangedCase, coachChanges } from '@/domain/coachWeek';
import { SwapSheet } from '@/components/SwapSheet';
import { swapChoices } from '@/domain/swapPool';
import { WhyChangedSheet, whyProps } from '@/components/WhyChangedSheet';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { SESSION_MAX } from '@/engine/v5/constants';
import { exerciseCues, exerciseDisplayName } from '@/data/exercises';
import type { Program } from '@/data/local/models';
import type { ChangedLiftCase } from '@/domain/changedLiftCase';
import { currentLocale } from '@/i18n';
import { View, StyleSheet } from 'react-native';
import { daysAfterStarting } from '@/domain/weekBoard';
import { coachSession } from '@/domain/coachWeek';
import { useSession } from '@/state/stores/sessionStore';
import { isTrainingGated } from '@/domain/entitlement';
import { WEEK_ORDER } from '@/domain/trainingDays';
import type { CoachPlan, Weekday } from '@/domain/coachPlan';
import type { LoadDirection } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'PreWorkout'>;

export function PreWorkoutScreen({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const session = useSession();
  const units = app.profile?.units ?? 'kg';
  const [plan, setPlan] = useState<CoachPlan | null>(null);
  /**
   * ⚠️ `plan === null` MEANS TWO DIFFERENT THINGS — "the read has not come back" and "the read came
   * back with nothing" — and the difference is the whole of the empty state below. A separate flag
   * rather than `undefined`, because every reader of `plan` below already treats null as "no week".
   */
  const [settled, setSettled] = useState(false);
  /**
   * ⛔ THE LIFT SHE WANTS REPLACED (founder 2026-08-22): *"אי אפשר ממש להכנס לתוכנית האימון שלנו
   * ולהחליף תרגיל לתרגיל שנמצא בספרייה."*
   *
   * ⛔ **S-77** in the register — *"she names a replacement off the gym floor"*. The sheet is the
   * SAME one the rack raises: `swapChoices`, same-muscle synonyms, one to three rows and never
   * padded. What differs is the KIND of fact it writes: a swap at the rack declares
   * nothing and is learned at K=2, and this one is a DECLARATION, because she named both sides with
   * time to think (`db.OwnedPreferences.declaredSubs`).
   */
  const [swapFor, setSwapFor] = useState<string | null>(null);
  /** Bumped after a declaration lands, so the week is re-read rather than patched in place. */
  const [rev, setRev] = useState(0);
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
  /*
   * ⛔ "WHY IS IT HERE" IS GONE FROM THE ROW (founder, 2026-09-07): *"מופיע 'למה זה כאן' — אני
   * רוצה להוריד את זה, אין בזה צורך."* The placement sheet (2026-08-11) and the whole-week
   * placement read that fed it left with the ruling. A row now opens the load's case when the
   * engine moved the load, and the form clip otherwise — and the clip opens HERE, on this screen.
   *
   * ⛔ THE BLACK SCREEN (same day): *"כשבאים לצפות בסרטון זה מציג מסך שחור."* The clip door used to
   * `navigate('WorkoutDetail', { exerciseId })` — the HISTORY record, whose only param is a
   * `sessionId`; handed an exercise it found no session and drew its loading state for ever. The
   * `as never` cast was the tell. Today's card has mounted `ExerciseDemo` in place since 2026-08-12;
   * this card now does the same, so the two doors onto one clip are one door.
   */
  const [formFor, setFormFor] = useState<string | null>(null);
  /** The week on disk — the drag edits it by day id (`app.reorderExercise`). */
  const [program, setProgram] = useState<Program | null>(null);
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
      setProgram(program ?? null);
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
      setSettled(true);
    })();
    return () => {
      alive = false;
    };
    /* ⚠️ `rev` — a declared swap changes the WEEK, so the card is re-read rather than patched. The
       assembler is the only thing that knows what a substitution costs the rest of the day, and a
       screen that edited its own row would be a second author of the same fact. */
  }, [rev]);

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
  const minutes = workout ? plannedMinutes(workout.minutes) : 0;

  /*
   * ⛔ A WORKOUT THE WEEK NO LONGER HOLDS WAS A BLANK SHEET (audit, 2026-08-18). This was
   * `if (!workout) return null` with no second branch: a modal risen over Today with no title, no
   * lifts and no ✕ — the close control lives inside the card that did not draw — and the only exit
   * an edge drag nothing on the glass admitted to. She reaches it by opening a workout from a stale
   * board, or from a notification for a session the coach has since rewritten.
   *
   * ⚠️ THE ORDER OF THE TWO CASES IS THE POINT. Before the read settles there is no claim to make,
   * and saying "this has moved" for the half-second the load takes would be a lie on every open.
   */
  if (!workout) return settled ? <PreWorkoutMovedView onClose={() => navigation.goBack()} /> : null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <PreWorkoutView
      name={workout.name}
      /*
       * ⛔ THIS ASKED FOR THE GRID'S ABBREVIATION (2026-08-27). `weekday.*` is what the seven-column
       * week board draws — `א'`, `ב'`, `ג'` — where a single letter per column is exactly right and a
       * full name would not fit. Here it is a standalone EYEBROW over the workout's title, and
       * `ד'` alone above `Lower Body A` reads as a stray mark or a footnote, not as a day.
       *
       * One string was serving a column head and a label. `weekdayLong.*` is the day's NAME.
       */
      dayLabel={workout.day ? t(`weekdayLong.${workout.day}`) : null}
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
      /* Her own figure on every still — the 2026-08-23 finding, which was this exact defect one
         screen over: a man watching his week assemble onto a woman's body. */
      figure={app.profile?.sex === 'female' ? 'female' : 'male'}
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
      onForm={(exerciseId) => setFormFor(exerciseId)}
      /*
       * ⛔ THE THIRD DOOR ON A ROW (founder 2026-08-22). Offered only on a day still AHEAD of her:
       * a finished session is a record, and offering to change a lift she has already done would be
       * the app proposing to rewrite history.
       */
      onSwap={doneIds.includes(workout.id) ? undefined : (exerciseId) => setSwapFor(exerciseId)}
      /*
       * ⛔ THE ROW ALWAYS ASKS; THIS DECIDES WHICH ANSWER EXISTS — in order of how much it knows.
       *
       *   1. the engine MOVED this load ....... the case, on `WhyChangedSheet`
       *   2. otherwise ....................... the form clip, on this screen
       *
       * The middle answer — the placement — was struck on 2026-09-07 (see `formFor`).
       */

      onWhy={(exerciseId) => (whyByExercise[exerciseId] ? setWhyFor(exerciseId) : setFormFor(exerciseId))}
      /*
       * ⛔ THE DRAG (founder 2026-09-07) — offered exactly where the swap is: on a day still ahead.
       * `coach_${i}` is the i-th day the engine's week presents (`coachPlanFromProgram` skips rest
       * days and empty ones), so the same filter finds the `ProgramDay` the drag edits.
       */
      onReorder={
        doneIds.includes(workout.id) || !program
          ? undefined
          : (from, to) => {
              const i = Number(workout.id.replace('coach_', ''));
              const day = program.days.filter((d) => !d.isRest && d.slots.length > 0)[i];
              if (!day) return;
              void app.reorderExercise(day.id, from, to).then(() => setRev((n) => n + 1)).catch(() => {});
            }
      }
      done={doneIds.includes(workout.id)}
      onClose={() => navigation.goBack()}
      onStart={async () => {
        /*
         * ════ ⛔ THE SIDE DOOR AROUND THE FOURTEEN (founder, 2026-08-23: *"תוודא ל-14 האימונים
         * שאין לזה פרצה מסוימת. שאנשים לא יוכלו לחגוג עלינו"*) ════
         *
         * Home's Begin has gated since the paywall shipped; the wrist is refused a lobby when
         * gated — and THIS button, reachable from the Program tab and Home's day list, walked
         * straight past both. A spent trial could train for ever through the pre-workout card.
         * Same gate, same paywall, same source tag as Home's.
         *
         * ⛔ AND THE BUTTON WAS ALSO BROKEN OUTRIGHT: it replaced to SessionFlow carrying a
         * `workoutId` param that NOTHING consumes (`MainParamList.SessionFlow` has no such field
         * — the `as never` cast was the tell), so the stage mounted over an empty session store.
         * The audit that found the side door found the stage it opened onto was black. It now
         * starts the session the way Home's own Begin does — `coachSession` → `startCoach` —
         * one mechanism, every door.
         */
        if (isTrainingGated(app.modeState.completedSessions, app.entitlement.active, app.profile?.memberSince)) {
          navigation.navigate('Paywall', { source: 'gate' } as never);
          return;
        }
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
        const planned = coachSession(plan, workout.id);
        if (!planned) return; // the plan vanished under the card — nothing honest to start
        await session.startCoach(planned, workout.id);
        navigation.replace('SessionFlow');
      }}
      />
      {whyFor && whyByExercise[whyFor] ? (
        <View style={StyleSheet.absoluteFill}>
          <WhyChangedSheet
            {...whyProps(whyByExercise[whyFor], t, currentLocale())}
            onClose={() => setWhyFor(null)}
            /* The answer carries the verb (device QA 2026-08-23) — same gate as the row's own
               swap door: a finished day is a report, and a report offers no replacement. */
            {...(!doneIds.includes(workout.id)
              ? { onSwap: () => { const id = whyFor; setWhyFor(null); setSwapFor(id); } }
              : {})}
          />
        </View>
      ) : null}
      {/*
        ⛔ THE SAME SHEET THE RACK RAISES — one pool, one set of rows, two moments. `swapChoices` is
        given the day's other lifts so it can never offer one she is already doing, exactly as the
        live session gives it `sessionExerciseIds`.
      */}
      {swapFor ? (
        <View style={StyleSheet.absoluteFill}>
          <SwapSheet
            currentName={exerciseDisplayName(swapFor)}
            choices={swapChoices(swapFor, { sessionExerciseIds: lifts.map((l) => l.exerciseId), equipment: app.profile?.equipment })}
            onClose={() => setSwapFor(null)}
            onPick={(toId) => {
              const from = swapFor;
              setSwapFor(null);
              if (!from) return;
              /*
               * ⛔ A DECLARATION, NOT A COUNT. It is written to `declaredSubs` and never to the
               * learned `substitutes` map — the K=2 fold owns that one and CLEARS entries it stops
               * believing, so a declaration living there could be deleted by inference. See the
               * doctrine over `OwnedPreferences`.
               *
               * ⚠️ AND NAMING THE ORIGINAL AGAIN TAKES IT BACK. A declaration is reversible the way
               * she made it — by saying the other thing — rather than by a second control that
               * exists only to undo the first.
               */
              void app
                .declareSwap(from, toId)
                .then(() => setRev((n) => n + 1))
                .catch(() => {});
            }}
          />
        </View>
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
    </View>

  );
}
