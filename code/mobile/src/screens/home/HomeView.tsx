/**
 * HomeView — the Today tab, v7 "All Dark · One Lit Stage".
 *
 * The first tab under the bar (Today · Cardio · Progress · You). It answers the only two questions
 * an open earns — what is up next, and what did Hush change — and offers the one act:
 *
 *   hush (range-mark + serif)     — the wordmark, with the coach's door opposite it
 *   WEEK 3 · FOUR DAYS            — the shape of the week, in the chrome's mono
 *   Shoulders, rebuilt            — THE PROGRAMME, in the coach's serif. The headline.
 *   its `why`, one or two lines   — the coach's reason for the whole thing, in its own serif
 *   SUN  Upper A               ✓  · the week as a COLUMN she reads down (`components/WeekColumn`)
 *   TUE  Lower A    · N CHANGES   ·   …the queued row OPENS and holds the shape, the lifts and
 *        5 LIFTS · ~58 MIN        ·   the change pill. Every other row is one line.
 *        lift · load · scheme     ·   a CHANGED load stands in the direction it moved
 *   WED  ———                      · a day with nothing on it: a letter and a rule, never the word
 *   Begin Lower A                 · the one act — cream standing on the dark stage, pinned
 *   N WORKOUTS LEFT IN YOUR TRIAL · one quiet line, gone when the trial is
 *
 * ⛔ REBUILT 2026-08-04. It used to open on the QUEUED WORKOUT with the week reduced to a horizontal
 * strip of chips — *"the way I chose is like a to-do list, and that wasn't right"* (founder). The two
 * questions an athlete actually opens the app with, *what am I on?* and *where am I in the week?*,
 * were both unanswerable, while *what is today called?* took the largest type on the screen.
 *
 * ⚠️ AND THE WEEKDAYS ARE EARNED, NEVER ASKED — `domain/trainingDays`. Until the pattern exists the
 * column numbers its rows, which is the founder's own N-workouts model, unchanged.
 *
 * WHY THE STRUCTURE CHANGED (founder v7, 2026-07-22). The old Home led with a brief CARD (the
 * engine's sentence in a framed box) and closed with a week CARD (the chips inside a second frame).
 * v7 dissolved both frames into the page. Nothing is a card on the stage — the stage itself is lit,
 * and emphasis is standing in that light versus resting in shadow. The open row of the week column
 * is the one thing that RISES off it, which is the same law spent on the one row that has an act.
 *
 * Cardio is its own TAB now, so the run link that used to sit under the act is gone from here.
 *
 * Rest state centers "Recovery." with the completed-week meter and the one fact recovery waits on —
 * when the next week opens. There, and only there, Open training keeps its card: on a day with no
 * workout, a run IS the day's act.
 *
 * The container (Home.tsx) wires state + navigation.
 */
// @ts-nocheck

// 

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { Legend, Display, Body, Button, Stage } from '@/components/ds';
import { WeekColumn } from '@/components/WeekColumn';
import type { Weekday } from '@/domain/coachPlan';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import type { Line } from '@/domain/voice';
import { displayWeight, unitLabel } from '@/domain/schedule';
import * as haptics from '@/platform/haptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, space, font, textScale, radius, signal, directionTone, type LoadDirection } from '@/design/tokens';

/** The week whose Recovery moment has already been given (never repeat a celebration). */
const RECOVERY_SEAL_KEY = 'hush.recovery.sealed';

export interface HomeWorkoutOption {
  id: string;
  name: string;
  muscles: string;
  /**
   * The weekday the coach put it on ('sun'…'sat'), when it put it on one.
   *
   * Absent on a hypertrophy week, which does not care what day is what — four sessions in any order
   * is the same week. An endurance plan is the opposite: the long run is on Sunday because the rest
   * of the week is arranged around it, and until now that was decided, stored, sent back to the
   * coach, and never shown to the athlete once.
   */
  day?: string;
  /** Already trained this week — a record, not an option (founder 2026-07-11): it shows
   *  as DONE and cannot be queued again. */
  done?: boolean;
}

/**
 * One lift of the selected workout, as Home prints it. The LOAD is the point — the one number Hush
 * decides, sitting on the first screen the athlete opens. A lift the engine CHANGED this week has
 * its load lit — IN THE DIRECTION IT MOVED (founder 2026-07-29: raise = moss, ease = blue, hold =
 * cream, on every screen without exception). It used to be one ochre for all three, so the first
 * screen of the day told her something had changed and refused to say which way.
 */
export interface HomePlanLift {
  exerciseId: string;
  name: string;
  /**
   * THE RIGHT-HAND FIGURE, ALREADY WRITTEN — for work that is not reps at a load.
   *
   * A lift's figure is assembled here from `load` / `band` / `sets`, and that assembly only knows
   * how to say "40 · 3×8–12". A 400 m repeat and a 45-second plank have no load and no band, and
   * bending them into those fields would print "0 · 4×0–0". So the shapes that cannot be said in
   * this vocabulary arrive already said, from `coachWeek`, and this row prints them verbatim.
   *
   * Absent on every engine row, where the existing assembly is exactly right.
   */
  detail?: string;
  /** kg; null = bodyweight (the row then says the reps carry the work, not a weight). */
  load: number | null;
  sets: number;
  /**
   * HER BAND — `[Tlo, Thi]`, not a single number. The prescription IS the band (register S-6):
   * land in it, and clearing the top earns weight. Printing `recommendedReps` alone printed Tlo,
   * the FLOOR, dressed as the whole target.
   */
  band: [number, number];
  /** Which way the engine moved this lift's load this week; absent = it did not touch it. */
  changed?: LoadDirection;
  /**
   * THE FIGURE HAS NOT LANDED YET (founder A.12 — "tapping the chips flickers").
   *
   * A row's NAME and set count are facts of the programme day, known the instant a chip is tapped;
   * only the load and the band are read from the engine, and that read is a promise. The list used
   * to wait for the whole thing — so every chip tap collapsed six rows into an empty 168 px box and
   * grew them back, which is the flicker. Now the rows stand immediately and only the figure waits.
   * `load: null` already means BODYWEIGHT, so a pending row needs its own flag: a blank column is
   * not a claim that the lift carries no weight.
   */
  pending?: boolean;
}

export interface HomeViewProps {
  resting: boolean;
  /** The athlete's first name, when they gave one — spoken only where Hush is speaking TO them. */
  name?: string;
  dayName: string | null;
  /** The QUEUED workout's id. The chips key off this, never off the name: two workouts in a week
   *  can be called the same thing, and a chip that matched by name would light the wrong one. */
  dayId?: string | null;
  /* ⛔ `muscles` REMOVED (2026-08-16). It was declared here and never read in this file: the coach
     names its own sessions and does not state muscle groups, so `Home` fed it `''` to satisfy a
     field with no consumer. `HomeWorkoutOption.muscles` above is a different, live one. */
  trainedThisWeek: number;
  startError: boolean;
  weekNumber: number; // training-week counter ("Week N"), from memberSince
  /** The SELECTED workout's lifts, with the loads Hush set. Null while they are being read — the
   *  section holds its shape rather than flashing an empty list. */
  plan: HomePlanLift[] | null;
  /** Honest work-time estimate for the selected workout (minutes). 0 = unknown. */
  planMinutes?: number;
  /**
   * The estimate CANNOT be honest, because the session contains work with no duration to price — a
   * run, a ride. Then the line says how much work it is and stops, rather than printing a number
   * that is wrong by a factor of six.
   */
  planTimeUnknown?: boolean;
  /** Muscles whose rest window has run out and are still waiting on her answer (S-32b's sibling). */
  easeChecks?: string[];
  onEaseAnswer?: (muscle: string, answer: 'recovered' | 'tender' | 'hurts') => void;
  /** Open one lift's form clip — a tap on the lift's row. */
  onForm: (exerciseId: string) => void;
  /** The selected workout is already trained this week: it can be READ, never started again
   *  (founder 2026-07-11). The act is what the gate belongs on — the plan still shows. */
  dayDone?: boolean;
  /** The athlete's units, for the loads on the plan rows. */
  units: 'kg' | 'lb';
  /** An interrupted (app-killed) workout that can be picked up exactly where it was (S3).
   *  When present, the primary CTA becomes "Continue {workout}" — one path, no fork. */
  resumable?: { workoutName: string } | null;
  onResume?: () => void;
  onStart: () => void;
  workouts: HomeWorkoutOption[];
  onChooseWorkout: (id: string) => void;
  /**
   * ⛔ SHE DRAGGED ONE ONTO ANOTHER DAY (founder 2026-08-05). Absent = the board is read-only,
   * which is what week one is: with no pattern the rows are numbered and there are no days.
   */
  /* ⛔ `onMoveToDay` IS DELETED (founder 2026-08-12) — the numbered column has no day to drop onto.
     See `WeekColumn`, which carries the argument and the measurement. */
  /** Hush's sentence(s) about what it did to this week's plan (domain/weekBriefing). Held for the
   *  WHY surface the change pill opens; null while the engine's record is still being read. */
  brief: Line[] | null;
  /** How many lifts the engine changed this week — the count on the moss pill beside the title.
   *  Null / 0 in a steady week, where no pill shows. */
  /** The coach's name for the programme she is on. Null until it has named one. */
  /*
   * ⛔ `programTitle` IS DELETED (founder 2026-08-12): *"תוריד את שם התוכנית."* It was the screen's
   * headline from 2026-08-04 and 50px of the first fold saying the same sentence every morning.
   * The name lives where it is news — `ProgramCreated`, the day it is made.
   */
  /*
   * ⛔ `programWhy` IS DELETED (2026-08-12). It carried `coachPlan.why` — the coach's paragraph about
   * the whole programme — and `domain/enginePlan` leaves `why` deliberately absent (R7: Hush never
   * states a reason it did not measure). Null on every device since the engine took the week.
   */
  /**
   * ⛔ THE ENGINE'S OWN SENTENCE ABOUT WHAT HER WEEK COULD NOT DO — `domain/weekNotice`.
   *
   * Distinct from the coach's `why` (deleted above): this is the ENGINE
   * saying it could not fit her hour, could not fill it, or could not feed every muscle she left on
   * — three facts it has stamped on the days for a long time and told nobody but telemetry.
   */
  notice?: string | null;
  /**
   * The weekdays she trains on, or absent while the pattern is still being earned.
   * Absent → the column NUMBERS its rows instead (see `WeekColumn`), which is week one.
   */
  /* ⛔ `trainingDays` IS DELETED (founder 2026-08-12): *"אמרנו שזה לא יופיע כימים אלא כN אימונים."*
     The derivation is still right and still lives in `domain/trainingDays`; Today simply does not
     draw a calendar out of it. */
  briefCount: number | null;
  /** This week's update has not been opened yet — the pill wears a small unseen dot. */
  briefUnseen: boolean;
  /** The engine ROTATION she can take back — lives on the WHY surface now, not on Today. */
  undoable?: { anchor: string; name: string } | null;
  onUndoSwap?: () => void;
  onWeeklyUpdate: () => void;
  /** Workouts left in the free trial — one quiet line under the act; absent once the trial is over
   *  or the athlete is a member. */
  trialLeft?: number | null;
  /*
   * ⛔ `onCoach` IS DELETED (founder 2026-08-12). The corner door it drew had no caller in the app —
   * only the dev fixture — so the prop's whole remaining function was to let a harness invent a
   * control the product does not have. See the brand row.
   */
  /** Open the plan-share door. Reached from the You tab; nothing stands in Today's corner now. */
  onShare?: () => void;

  // ── RECOVERY, v7 3.5 "THE WEEK IS DONE" — all optional, all best-effort. Absent → the section
  //    simply does not draw (the closing verdict still reads from the seal + copy alone).
  /** Sun→Sat (7), each day of THIS week: trained (a session logged) and whether it is today. The
   *  strip lands day by day — trained days wear the moss check, rest days a dashed ring. */
  /* ⛔ `weekDays` IS DELETED (founder 2026-08-12). It fed the seven-mark day strip on the
     week-complete state; the week is N workouts everywhere on this screen now, and the ledger that
     replaced the strip reads `workouts` like the active face does. */
  /** The week's facts band: tonnage moved, calories, loads the engine raised. kcal null → omitted. */
  weekStats?: { tonnes: number; kcal: number | null; loadsUp: number } | null;
  /** The workout that opens the next week (rotation's first) — named, without a fabricated load. */
  nextWorkoutName?: string | null;
}

export function HomeView(props: HomeViewProps) {
  const { t } = useCopy();
  const reduced = useReducedMotion();

  const total = props.workouts.length || 0;
  const done = Math.min(props.trainedThisWeek, total);
  const liftCount = props.plan?.length ?? 0;
  // Today's weekday, spelled in the active locale (sans eyebrow — never mono, it is a word).
  const restWeekday = new Date().toLocaleDateString(undefined, { weekday: 'long' });

  /* ---- the Recovery moment (founder 2026-07-12) — a SEAL, not confetti ---- */
  const seal = useRef(new Animated.Value(0)).current;
  const [sealed, setSealed] = useState(false);
  useEffect(() => {
    if (!props.resting) return;
    let active = true;
    const week = String(props.weekNumber);

    const settle = (celebrate: boolean) => {
      if (!active) return;
      setSealed(true);
      if (!celebrate || reduced) {
        seal.setValue(1);
        if (celebrate) haptics.weekComplete();
        return;
      }
      haptics.weekComplete();
      Animated.timing(seal, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    };

    AsyncStorage.getItem(RECOVERY_SEAL_KEY)
      .then((stored) => {
        if (!active) return;
        const firstTime = stored !== week;
        if (firstTime) void AsyncStorage.setItem(RECOVERY_SEAL_KEY, week).catch(() => {});
        settle(firstTime);
      })
      .catch(() => settle(false));

    return () => {
      active = false;
    };
  }, [props.resting, props.weekNumber, reduced, seal]);

  return (
    <View style={styles.root}>
      <Stage />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* brand + account — the range-mark and "hush" in the coach's serif, the avatar opposite */}
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <RangeMark />
            <Text style={styles.wordmark}>hush</Text>
          </View>
          {/*
            ════ ⛔ THE CORNER DOOR IS GONE, AND IT HAD ALREADY LEFT THE PRODUCT ════

            FOUNDER, 2026-08-12: *"ומה זה החלונית של הAI למעלה, אתה ממליץ להשאיר אותה? כרגע זה לא
            מובן."* The answer is not a recommendation — it is a measurement. **`Home.tsx` has never
            passed `onCoach`.** The route it opened (`Coach`) was deleted on 2026-08-11 with
            `CoachScreen`, and this block is `props.onCoach ? … : null`, so on a real device the
            speech bubble has not been drawn since. The only thing still handing it a function was
            the gallery fixture — which is why he could see it and nobody else could.

            ⚠️ THAT IS THE SECOND TIME THIS EXACT HARNESS LIE HAS COST A REVIEW. `1.5` mounted a
            `model: {}` that the app never has, and now Today mounted a coach door the app never
            has. **A fixture that supplies something the product does not is not a convenience —
            it is a screen nobody can act on**, and the founder spent one of his notes on a control
            that was not there.

            What it USED to be, kept because the argument is still binding on whatever stands here
            next: the founder put the coach in the corner rather than the tab bar — *"I don't want
            to put the AI in the tab bar, because that would signal hardest of all that we're just
            another AI app."* A tab is a section; that was not a section. Nothing occupies the
            corner now, and nothing should occupy it by default: the AI has one job (`theAiHasOneJob`)
            and it is reached from the import screen.
          */}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/*
            ⛔ THE REST WINDOW THAT RAN OUT — FIRST THING, ABOVE HER WEEK (founder 2026-08-11).
            The founder's rule is that Hush must *"REMEMBER and TELL him the time is up, and ASK HIM
            HOW HE FEELS."* The body map answers it too, but a question that only lives there is one
            she has to go looking for — and "tell" is not "wait to be found". This is the screen she
            opens; this is where telling happens.

            ⚠️ IT IS NOT A BANNER AND IT DOES NOT NAG. It appears only while a window has lapsed and
            she has not answered, and any answer removes it — including "back to normal", which
            writes nothing but a close. `awaitingAnswer` reads the clock, so a window that ran out
            while the app was shut is here the moment she opens it.
          */}
          {(props.easeChecks ?? []).map((m) => (
            <View key={m} style={styles.easeAsk}>
              <Text style={styles.easeAskTitle}>{t('pain.askBack', { muscle: t(`muscle.${m}`) })}</Text>
              <View style={styles.easeAnswers}>
                {(['recovered', 'tender', 'hurts'] as const).map((a) => (
                  <Pressable
                    key={a}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(`muscle.${m}`)} — ${t(`pain.answer${a[0].toUpperCase()}${a.slice(1)}`)}`}
                    onPress={() => props.onEaseAnswer?.(m, a)}
                    style={styles.easeAnswer}
                  >
                    <Text style={styles.easeAnswerText}>
                      {t(`pain.answer${a[0].toUpperCase()}${a.slice(1)}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          {props.resting ? (
            <View style={styles.restBlock}>
              {/* the day + week, quietly — a sans eyebrow (holds the translated word "Week") */}
              <Legend align="center" tone="muted" style={styles.restEyebrow}>
                {`${restWeekday} · ${t('home.weekLabel', { n: props.weekNumber })}`}
              </Legend>

              {/* THE SEAL — a dashed ring holding N/N sessions, a moss check stamped at its crown.
                  It draws itself in once, the first landing after a full week. */}
              <Animated.View
                style={[
                  styles.sealRing,
                  sealed
                    ? { opacity: seal, transform: [{ scale: seal.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }
                    : { opacity: 0 },
                ]}
              >
                <View style={styles.sealCore}>
                  <Text style={styles.sealCount}>{`${total}/${total}`}</Text>
                  <Legend size={17} tone="muted">{t('home.sessionsLabel')}</Legend>
                </View>
                <View style={styles.sealBadge}>
                  <Icon name="check" size={11} color={color.up} strokeWidth={3} />
                </View>
              </Animated.View>

              <Display style={styles.restTitle}>{t('home.restTitle')}</Display>

              {/*
                ════ ⛔ THE SEVEN-MARK DAY STRIP IS GONE, AND THE MEASUREMENT IS THE WHOLE ARGUMENT ════

                FOUNDER, 2026-08-12, on whether it should follow the N-workouts ruling off this
                screen: *"נותן לך את זכות הבחירה לזה."*

                It goes, and not on consistency — on a self-contradiction I could measure. The seal
                says **4/4** at y=149. Two hundred and thirty-one pixels below it, the strip drew
                **three dashed empty rings**. A dashed ring is the visual language of a slot waiting
                to be filled; three of them under a headline that says the week is complete is the
                screen telling her she finished everything and then drawing three holes.

                ⚠️ I ARGUED FOR KEEPING IT ONE MESSAGE EARLIER, on tense — the week is over, so those
                are days she trained rather than days she owes. That reasoning is sound and it is not
                how a strip of dots is read. **Nobody parses tense out of seven circles.**

                ── WHAT REPLACES IT, AND WHY IT IS NOT JUST A DELETION ─────────────────────────────
                Her four workouts, named, each with its check. It is the same vocabulary the active
                Today now speaks (`WeekColumn`), so the two faces of this screen stop disagreeing
                about what a week is — and it says the thing weekdays could not: **what she did.**
                "Upper A, Lower A, Upper B, Lower B" is what an athlete remembers about a finished
                week. "Sunday, Tuesday, Thursday, Saturday" is what a calendar remembers.
              */}
              {props.workouts?.length ? (
                <View style={styles.doneList}>
                  {props.workouts.map((w, i) => (
                    <View key={w.id} style={[styles.doneRow, i > 0 && styles.doneRowRuled]}>
                      <Text style={styles.doneIndex}>{String(i + 1).padStart(2, '0')}</Text>
                      <Text style={styles.doneName} numberOfLines={1}>{bidi(w.name)}</Text>
                      {/* ⚠️ THE CHECK FOLLOWS THE WORKOUT, NOT THE SCREEN. A week can close with a
                          session unfinished — she trained three of four and Saturday came — and
                          ticking every row because the week rolled over would be the app claiming a
                          workout she did not do, on the screen that congratulates her. */}
                      {w.done ? (
                        <Icon name="check" size={17} color={color.up} strokeWidth={2.6} />
                      ) : (
                        <View style={styles.doneMissing} />
                      )}
                    </View>
                  ))}
                </View>
              ) : null}

              {/*
                ⛔ THE REST NOTE IS DELETED (founder, 2026-08-12): *"תמחק את המשפט … ואז זה יתן יותר
                מקום וחלל במסך."*

                It read *"Muscle is built on days like this. Nothing is scheduled — that's the
                program working."* — true, and it is the one thing on this screen she does not need
                told. **The seal says 3/3 and the ledger names all three**; a paragraph explaining
                that a finished week is a good thing is the screen talking over its own evidence.
              */}

              {/* the week's facts — moved · kcal · loads up (mono figures, sans labels) */}
              {props.weekStats ? (
                <View style={styles.statBand}>
                  <RestFact value={props.weekStats.tonnes.toFixed(1)} label={`${t('weekly.tonneUnit')} ${t('weekly.statMoved')}`} />
                  {props.weekStats.kcal != null ? <RestFact value={String(props.weekStats.kcal)} label={t('weekly.statKcal')} /> : null}
                  <RestFact value={String(props.weekStats.loadsUp)} label={t('home.loadsUp')} accent />
                </View>
              ) : null}

              {/* NEXT — the workout that opens next week, named. No fabricated load: the roll has not
                  happened, so the only honest facts are its name and when the week opens. */}
              {props.nextWorkoutName ? (
                <Text style={styles.nextRow}>
                  <Text style={styles.nextLabel}>{`${t('home.nextLabel').toUpperCase()} · `}</Text>
                  <Text style={styles.nextName}>{bidi(props.nextWorkoutName)}</Text>
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <Icon name="calendar" size={15} color={color.textTertiary} strokeWidth={2} />
                <Text style={styles.restNext}>{t('home.restNext')}</Text>
              </View>

              {/* THE RUN CARD IS GONE (founder 2026-07-27). Cardio has its own seat in the tab
                  bar now, one tap away from every surface — so a second door to it on the rest day
                  was the same act offered twice. The week's close says the week is closed; anyone
                  who wants to run already knows where the tab is. */}
            </View>
          ) : (
            <View style={styles.block}>
              {/* "TUESDAY · UP NEXT" — the weekday is the DEVICE's, read off the clock exactly like
                  the rest state's; it is not the engine claiming a calendar (register L7). What is
                  up next is still the queued workout, whatever day it is opened on. */}
              {/*
                ════ ⛔ THE HIERARCHY WAS UPSIDE DOWN, AND THE MEASUREMENT SAYS SO ════

                FOUNDER, 2026-08-12: *"המסך הזה צריך עיצוב כולל מחדש … יש לך יד חופשית."*

                The largest type on Today was the PROGRAMME NAME — 38px serif, three lines, 84
                pixels of the first fold. It reads *"Upper / Lower · 4 days a week · leading with
                Chest"*, and **it says exactly that every single morning for the life of the
                programme.** The thing she opened the app for — Upper B, six lifts, fifty-five
                minutes — was 23px, third row down, inside a container.

                **A screen should be biggest where it changes.** The name is identity: worth
                stating, in the serif, because it is the name of a made object — and worth stating
                ONCE, small. So it drops to a supporting line and the queued workout takes the
                headline in `WeekColumn`.

                ⚠️ THIS DEMOTES SOMETHING HE ASKED FOR ON 2026-08-04, and it is the same argument he
                made then, applied one level further. What he was fixing was Home leading with
                *"MONDAY · UP NEXT"* — a fact she already had. A name that never changes is the same
                fault at a larger size: it is not news, and news is what a daily screen is for.
              */}
              {/*
                ⛔ THE EYEBROW IS THE WEEK NUMBER, AND NOTHING ELSE (founder 2026-08-12).
                It read "WEEK 11 · 2 OF 4 DONE", and the four cards underneath say "2 of 4" by
                having checks on two of them. **A screen that states a fact its own content already
                draws is spending the top of the fold on a caption.**
              */}
              <Legend track={0.18}>
                {props.weekNumber != null && props.workouts.length > 0
                  ? t('home.weekLabel', { n: props.weekNumber })
                  : `${restWeekday} · ${t('home.upNext')}`}
              </Legend>

              {/*
                ⛔ WHAT THE WEEK COULD NOT DO (founder 2026-08-12). Not the coach's paragraph above —
                the engine's own honest sentence about her INPUTS: a day past her minutes, a day her
                map cannot fill, a muscle two days a week cannot feed. `domain/weekNotice` picks the
                one that matters and every version of it carries the remedy, which is hers.

                ⚠️ SET IN THE READING VOICE, NOT AS A WARNING. It is a fact about a choice she made,
                with something she can do about it — clay is for pain and destructive confirms and
                appears nowhere near it.
              */}
              {props.notice ? (
                <Text style={styles.weekNotice}>{props.notice}</Text>
              ) : null}

              {/*
                ⛔ THE LEGACY TITLE ROW IS DELETED (founder 2026-08-12).

                It drew `dayName` at 54px with the week's change pill beside it, and it was mounted
                only *"when the coach has NOT named the programme"* — a fallback from the era when
                the headline was the programme's name. Taking that name off Today made the fallback
                condition **always true**, so for one commit the screen carried its queued workout
                twice: once here at 54, once on the card that is now the subject of the screen.

                ⚠️ CAUGHT BY READING THE BRANCH I HAD JUST ORPHANED, not by a test — every law here
                asserts what IS drawn, and none of them objects to a thing being drawn twice.
              */}

              {/* The shape of the session, one line — "6 LIFTS · ~55 MIN".

                  ⛔ RAISED 12.5 → 15 (founder 2026-08-03): *"the text of X exercises and the
                  estimated workout time is really small — please make it a bit bigger."*

                  It is the SHAPE of her day — how much work and how long — and it was set smaller
                  than the legends above it, so the one line that answers "have I got time for this?"
                  was the hardest thing on the screen to read. */}
              {/*
                ⛔ THE WEEK, AS A WEEK (founder 2026-08-04). What stood here was a horizontal strip
                of chips with the day letters on them — a chooser, not a week — and the lifts of the
                chosen one sat above it in no relation to anything.

                The column inverts that: the week is the page, and the queued session is the row
                that OPENS and holds the lifts. Everything the chips could do, a row does; what a
                row can also do is be a Tuesday.

                ⚠️ `selectedId` falls back to matching by NAME because `dayId` is absent on an
                engine-era plan, which is exactly what the chips did and for the same reason.
              */}
              <WeekColumn
                workouts={props.workouts}
                selectedId={props.dayId ?? props.workouts.find((w) => w.name === props.dayName)?.id ?? null}
                onChoose={props.onChooseWorkout}
                changes={props.briefCount}
                onChanges={props.onWeeklyUpdate}
                inert={!!props.resumable}
                /* ⛔ `shape` IS NOT PASSED (2026-08-12). It composed the queued card's line from
                   `plan`, while every other card composed its own from its `items`/`minutes` — two
                   derivations of one fact, caught disagreeing in the harness on the first mount.
                   Every card answers for itself now. See `WeekColumn.shapeOf`. */
              >

              {/*
                ⛔ THE S-3 NOTE WAS HERE AND IS GONE (2026-08-16), FOR TWO REASONS AND A MEASUREMENT.

                · It was PERMANENTLY OFF. `Home` passed `overBudget={false}` — a literal, with a note
                  saying the generator no longer composes the day this screen draws. A branch that
                  cannot render is not a feature waiting to be switched on; it is a claim the file
                  makes about itself that is not true.
                · It named a budget that no longer exists. The sentence is *"won't fit in {{n}}
                  minutes. Add time…"* and F-15 made the session 45-60 for everyone — nothing asks her
                  for minutes and nothing can add them, so `budgetMinutes` was always undefined and
                  the line would have printed "in 0 minutes" if it ever had rendered.
                · And the state itself does not occur: swept over 520 generated days including every
                  single-muscle body map, `overBudget` was stamped ZERO times. `enforceTimeCap` always
                  lands the day inside the hour.

                ⚠️ THE ENGINE FLAG STAYS. S-3 is ratified, several audits use `overBudget` as their
                one legal exemption, and `PreWorkoutScreen` reads it per day — so the fact keeps its
                home. What is deleted is a SECOND surface for it on this screen, which `weekNotice`
                (above, `props.notice`) already owns and states in one sentence with its remedy.
              */}
              </WeekColumn>

              {/*
                ════ ⛔ AND THEN IT LEFT AGAIN, THE SAME DAY, AND HE WAS RIGHT TWICE ════

                FOUNDER, 2026-08-12: *"למה במסך הTODAY יש גם את הימים וגם את תוכנית האימון שמוצגת
                למטה, וגם יש מסך PREWORKOUT?"*

                Because I put it there. I found `HomeView` never calling the `onForm` it was handed —
                three sheets behind a door that did not exist — and I fixed that by drawing the whole
                lift table on Today, then justified the duplication with a distinction he never asked
                for ("Today is the queued workout, PreWorkout is any other"). **That distinction was
                built to defend the thing I had just done**, which is the tell.

                One workout's contents belong in ONE place, and his vision names it: the week is a
                sequence, and pressing a workout raises a sheet from the bottom holding it. So the
                table is gone from here and `PreWorkout` is that sheet (`Root.tsx`, presentation:
                'modal'). Today is the week and nothing else.

                ⚠️ THE REAL FINDING SURVIVES AND IS NOT LOST IN THE REVERSAL: the wedge's door was
                shut, and it is open now on the surface that owns the lifts. `theWedgeLandsBeforeSheTrains`
                asserts it there.
              */}

              {props.startError ? <Body tone="secondary" style={styles.error}>{t('errors.general')}</Body> : null}

            </View>
          )}
        </ScrollView>
        {/* ════ THE ONE ACT IS NEVER BELOW THE FOLD (founder B.5) ════
            "With many exercises the Begin button — and the free-workouts line — fall below the
            fold; it scrolls, but the athlete may simply not find Start."

            It used to live INSIDE the scroller, pushed to the bottom with `marginTop: 'auto'` —
            which put it at the foot of the CONTENT, not the foot of the SCREEN. On a four-lift day
            those are the same place, so it looked right; on an eight-lift day the only thing the
            screen exists to offer was a scroll away, under a list she had already read. Pinned
            here it is identical on a short page and present on every long one. Nothing else moved:
            it keeps its own 26 px gutter, which is what the negative margin inside the 30 px
            column was reproducing. Recovery has no act, so it draws nothing at all. */}
        {props.resting ? null : (
          <View style={styles.cta}>
              {props.resumable ? (
                <Button
                  variant="primary"
                  size="lg"
                  block
                  label={t('home.continueWorkout', { name: bidi(props.resumable.workoutName) })}
                  onPress={props.onResume}
                  leading={<Icon name="play" size={16} color={color.onAccent} />}
                />
              ) : props.dayDone ? (
                <View style={styles.doneRow}>
                  <Icon name="check" size={16} color={color.up} strokeWidth={2.4} />
                  <Text style={styles.doneText}>{t('program.doneThisWeek')}</Text>
                </View>
              ) : props.dayName ? (
                <Button
                  variant="primary"
                  size="lg"
                  block
                  label={t('home.begin', { name: bidi(props.dayName) })}
                  onPress={props.onStart}
                  leading={<Icon name="play" size={16} color={color.onAccent} />}
                />
              ) : null}

              {/* the trial — one quiet mono line under the act, gone when the trial is.

                  ⛔ TRACKING 0.1 → 0.04 (founder's screenshot, 2026-08-12). At 17px with 0.1 em of
                  tracking, "4 WORKOUTS LEFT IN YOUR TRIAL" broke across two lines with **TRIAL alone
                  on the second** — a widow, centred, directly under the one act on the screen.
                  Uppercase tracked type is what pushed it over; the type floor is not negotiable, so
                  the tracking is what gives way. */}
              {props.trialLeft != null && props.trialLeft > 0 && !props.dayDone ? (
                <Legend size={17} track={0.04} align="center" style={styles.trialLine}>
                  {t('home.trialLeft', { count: props.trialLeft })}
                </Legend>
              ) : null}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

/**
 * The measured-range mark — a hairline spanning two end ticks, struck in cream beside the wordmark
 * (the brand's range glyph). The same glyph the tab bar strikes in moss under the active tab.
 */
function RangeMark() {
  return (
    <View style={styles.mark}>
      <View style={styles.markBar} />
      <View style={[styles.markTick, styles.markTickStart]} />
      <View style={[styles.markTick, styles.markTickEnd]} />
    </View>
  );
}

/*
 * ⛔ THE FIGURE ASSEMBLY LEFT WITH THE TABLE (2026-08-05). `figureLoad`, `figureUnit`,
 * `figureScheme` and `planFigureLabel` are the one place the app decides how a prescription READS
 * — "54 kg · 4×8–10" — and they now live in `components/PlanLifts`, beside the rows they format.
 *
 * ⚠️ LEAVING A SECOND COPY HERE IS EXACTLY THE DRIFT `bandOf` HAD TO BE INVENTED TO END: two
 * ladders for one fact, eight hundred lines apart, and the shorter one winning on the screen that
 * mattered. The table is not on this screen any more; neither is its vocabulary.
 */

/**
 * The week's workouts with WHAT IS LEFT FIRST — finished ones fall to the end of the strip
 * (founder A.16: "a completed workout may not belong in the row of pending ones at all").
 *
 * This is not an invention: the canonical v7 handoff already does exactly this on the wrist, where
 * the done workout is struck through, dimmed, and pushed to the foot of the list with
 * `margin-top:auto`. Today is the screen that answers "what is up next", so the row it offers has
 * to lead with what is still to do; the record follows, and reads as a record.
 *
 * Order is otherwise preserved (a stable partition) — the week has a shape, and Upper A · Lower A ·
 * Upper B · Lower B is part of it.
 */
function whatIsLeftFirst(workouts: HomeWorkoutOption[]): HomeWorkoutOption[] {
  return [...workouts.filter((w) => !w.done), ...workouts.filter((w) => w.done)];
}



/** One fact of the week's band — a mono figure over its sans meta label (MOVED / KCAL / LOADS UP). */
/**
 * ⛔ ONE FACT, ONE ROW (founder, 2026-08-12): *"תן למשקל שהורם, לקלוריות ולהעלאות כל שורה משל עצמו
 * אבל תעצב את זה יפה כי יהיה לך הרבה מקום."*
 *
 * They shared a 12-point band, three abreast, under a paragraph that has now gone — so the space
 * the deletion freed goes to the three facts that were crowded by it. The figure leads the row and
 * its name closes it, ruled, in the same shape the finish poster's facts take: two screens that
 * report a week and a session should not report them in two different languages.
 */
function RestFact({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={styles.restFact}>
      <Text style={[styles.restFactVal, accent && styles.restFactValUp]}>{value}</Text>
      <Legend size={20} tone={accent ? 'accent' : 'muted'}>{label}</Legend>
    </View>
  );
}

/* ⚠️ Twelve style keys left with the lift table on 2026-08-05 — `plan`, `planRow`, `planName`,
   `planFigure` and the five `figure*` spans among them. They are in `components/PlanLifts` now.
   An orphaned style is what `styles.ask` became when the band graphic was deleted around it, and
   it then rendered the second largest figure on the set screen at the platform default for a week. */
const styles = StyleSheet.create({
  /* The lapsed rest window. Quiet, above the week, and gone the moment she answers. */
  easeAsk: { marginBottom: 22 },
  easeAskTitle: { fontFamily: font.serif, fontSize: 19, lineHeight: 26, color: color.textPrimary },
  easeAnswers: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  easeAnswer: {
    paddingVertical: 9, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: color.borderControl,
  },
  easeAnswerText: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary },
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingTop: 16,
  },
  // The wordmark stays LTR ("hush") in every locale rather than mirroring.
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, direction: 'ltr' },
  wordmark: { fontFamily: font.serif, fontSize: 22, color: color.textPrimary, textAlign: 'left' },
  // the range-mark beside the wordmark (cream), 26 × 11
  mark: { width: 26, height: 11 },
  markBar: { position: 'absolute', start: 0, end: 0, top: 5, height: 1.5, backgroundColor: color.textPrimary },
  markTick: { position: 'absolute', top: 0, width: 1.5, height: 11, backgroundColor: color.textPrimary },
  markTickStart: { start: 0 },
  markTickEnd: { end: 0 },
  // ════ THE SHARE DOOR IS A CONTROL, SO IT LOOKS LIKE ONE (founder A.8) ════
  /*
   * ⛔ `shareDoor` GOES WITH THE DOOR IT DRESSED (2026-08-12) — see the brand row.
   *
   * Its note is kept, because the RULE it won is general and the next thing put in that corner has
   * to obey it: *"the two-people icon is swallowed by the background — effectively invisible."* It
   * was never the colour. A 1.8-weight outline floating in a bare corner with no surface under it
   * does not register as a thing to press; the eye reads it as decoration beside the wordmark and
   * moves on. A control needs a BODY — a wash, not a ring, which would compete with the range-mark
   * opposite.
   */
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.fillSubtleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary, textAlign: 'center' },

  // v7 2.1: the page's own gutter is 30; only the ACT drops to 26 (see `cta`).
  // flexGrow so the ACT can sit at the foot of a short page (the handoff's `margin-top:auto`)
  // while a long one still scrolls.
  scroll: { flexGrow: 1, paddingHorizontal: 30, paddingTop: 22, paddingBottom: 8 },
  /* `flex: 1` so the week column below has a height to centre inside. */
  block: { flex: 1, gap: 13 },
  pressedDim: { opacity: 0.62 },

  // ── the title row ──
  /*
   * ⛔ `programWhy` IS DELETED WITH ITS PROP (2026-08-12). It drew `coachPlan.why` — a paragraph the
   * engine does not write and never will (R7, `domain/enginePlan`), so it was null on every device
   * and the only place it was ever seen was a gallery fixture that invented one.
   */
  /* The engine's own note. Sans rather than the coach's serif — it is a fact about her inputs, not
     a voice speaking to her, and the two must not be mistaken for each other. */
  weekNotice: {
    marginTop: 10,
    fontFamily: font.sans,
    fontSize: 17,
    lineHeight: 20,
    color: color.textMuted,
    textAlign: 'left',
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  // `lineHeight` is tightened relative to the size so a two-line name stacks without a gulf.
  title: { flex: 1, fontFamily: font.serif, fontSize: 54, lineHeight: 56, color: color.textPrimary, textAlign: 'left' },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: radius.full,
    // A heavier moss veil than the app's default wash — the pill has to hold its own beside a
    // 54px headline. `.18` is the handoff's value for exactly this chip.
    backgroundColor: 'rgba(169,196,159,0.18)',
  },
  changeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },

  shapeLine: { color: color.textSecondary },

  // ── the plan table ──
  // The FIGURE is never squeezed: it is the fact the row exists for. The name shrinks and
  // truncates around it (handoff: the load span is `flex:none; white-space:nowrap`).
  // A.15 — no `numberOfLines` on the name: it WRAPS. `lineHeight` is set so a two-line name reads
  // as one label rather than two rows of text.
  // ── the figure's META: the unit and the scheme ──
  // The LOAD keeps the founder's 2026-07-28 enlargement (17 pt — "she reads it to decide whether to
  // go to the gym"). Its meta does not: the canonical handoff sets the whole figure at 13.5, and
  // once the unit joined the row (A.5) a 17 pt scheme was taking half the row's width from the
  // NAME, which is what pushed a long name onto a third line (A.15). Small meta is also the
  // hierarchy this row is supposed to have — one lit fact, everything else in shadow.
  // The unit is a caption on the number, never part of the fact the engine decided — so it wears
  // the muted tone whether or not the load moved.
  // The face only — the COLOUR is `directionTone(lift.changed)` at the call site, so this row can
  // never hold an opinion about direction that the rest of the app does not share.
  // S-3 — a quiet note, not an alarm. Sans (it carries words), secondary ink, sits under the plan.
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  doneText: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textSecondary, textAlign: 'left' },

  // ── the chooser (horizontal chips) ──
  chipStrip: { position: 'relative', overflow: 'hidden' },
  chipFade: { position: 'absolute', top: 0, bottom: 0, end: 0, width: 52 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, paddingEnd: space.gutter },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  // queued = cream, standing in the light (paper pill, dark ink)
  chipCurrent: { backgroundColor: color.paper, borderColor: color.paper },
  // ── done = a RECORD, and it steps back (founder A.16; canonical v7 handoff, the wrist's week
  //    list). It used to be a filled moss pill, which is a lit state — the loudest thing in the
  //    strip was the one workout that could not be started. Now: no fill, the faintest hairline,
  //    dimmed, struck through, with the moss check carrying the whole verdict.
  chipDone: { backgroundColor: 'transparent', borderColor: color.border, opacity: 0.6 },
  // …and when the athlete taps it to re-read its plan, it comes back up to full and takes a moss
  // ring. Selected, still finished — never the cream pill of something still to do.
  chipDoneCurrent: { opacity: 1, borderColor: color.up },
  /** The weekday, quieter than the name it sits beside: a label, not the thing she is choosing. */
  chipDay: {
    fontFamily: font.sans,
    fontSize: 17,
    letterSpacing: 0.6,
    color: color.textMuted,
    // The day reads in the athlete's own direction, like every other word on this page.
    textAlign: 'left',
  },
  chipText: { flexShrink: 1, fontFamily: font.sansMedium, fontSize: textScale.xs, color: color.textSecondary, textAlign: 'left' },
  chipTextDone: { color: color.textMuted, textDecorationLine: 'line-through' }, // rtl-ok: merged onto chipText, which sets textAlign
  chipTextCurrent: { fontFamily: font.sansSemibold, color: color.onPaper }, // rtl-ok: merged onto chipText, which sets textAlign

  // ── the act ──
  error: { marginTop: 4 },
  // The act drops to the 26px gutter the whole product's primary buttons sit at, and negative
  // margin walks it back out of the page's 30px column so the two agree.
  // Pinned under the scroller (B.5). The 26 px gutter every primary button in the product
  // sits at — reached directly now rather than by walking back out of the page's 30.
  cta: { paddingHorizontal: 26, paddingTop: 18, paddingBottom: 6, gap: 12 },
  trialLine: { marginTop: 4, paddingHorizontal: 4 },

  // ── recovery (v7 3.5 "THE WEEK IS DONE") ──
  restBlock: { paddingTop: 6, alignItems: 'center' },
  restEyebrow: { marginBottom: 15 },

  // the seal — a big dashed ring, its core the N/N count, a moss check at the crown
  /* ⛔ THE RING WAS INVISIBLE (founder, 2026-08-12): *"את העיגול בחלק העליון תן לו צבע, לא רואים
     בכלל ש-3/3 מוקף בעיגול."* A 1.5-point dashed hairline in `borderStrong` on black is a texture,
     not a ring — and it is the SEAL: the one mark on this screen that says the week closed. Moss,
     at 2.5, in the product's own finished colour. */
  sealRing: {
    width: 158,
    height: 158,
    borderRadius: 79,
    borderWidth: 2.5,
    borderStyle: 'dashed',
    borderColor: color.up,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealCore: {
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  sealCount: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 40, letterSpacing: -0.8, color: color.textPrimary, textAlign: 'center' },
  sealBadge: {
    position: 'absolute',
    top: -9,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.bg,
    borderWidth: 1.5,
    borderColor: color.up,
    alignItems: 'center',
    justifyContent: 'center',
  },

  restTitle: { marginTop: 15, textAlign: 'center' },

  /* The week she finished, named — the ledger that replaced the seven-day strip. Left-aligned
     inside a centred column on purpose: it is a LIST of things done, and a centred list has no
     edge for the eye to run down. */
  doneList: { alignSelf: 'stretch', marginTop: 22, paddingHorizontal: 4 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  doneRowRuled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  doneIndex: { width: 26, fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, letterSpacing: 0.8, color: color.textMuted, textAlign: 'left' },
  doneName: { flex: 1, fontFamily: font.sans, fontSize: 17, color: color.textPrimary, textAlign: 'left' },
  /* A workout the week closed without: the check's own space, held empty. Not a cross and not a
     dash — nothing failed, and the row is a record rather than a verdict. */
  doneMissing: { width: 15, height: 15 },

  // the italic-serif rest note, opened by a moss range-mark
  restNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 22,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: color.border,
    alignSelf: 'stretch',
  },
  restNoteMark: { width: 18, height: 8, marginTop: 8 },
  restNoteBar: { position: 'absolute', start: 0, end: 0, top: 3.5, height: 1.5, backgroundColor: color.up },
  restNoteTick: { position: 'absolute', top: 0, width: 1.5, height: 8, backgroundColor: color.up },
  restNoteText: { flex: 1, fontFamily: font.serif, fontStyle: 'italic', fontSize: 17, lineHeight: 24, color: color.textPrimary, textAlign: 'left' },

  // the week's facts band
  statBand: {
    alignSelf: 'stretch',
    marginTop: 26,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  restFact: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  /* 22 → 44, with the room the deleted paragraph freed. These are the week's three measured facts
     and they were set at the size of the label beside them. */
  restFactVal: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 44, lineHeight: 50, letterSpacing: -1, includeFontPadding: false, color: color.textPrimary, textAlign: 'left' },
  restFactValUp: { color: color.up },

  // NEXT — name only, no fabricated load
  nextRow: { alignSelf: 'stretch', marginTop: 16, textAlign: 'left' },
  nextLabel: { fontFamily: font.sansMedium, fontSize: 17, letterSpacing: 0.8, color: color.textMuted }, // rtl-ok: nested span, inherits textAlign from nextRow
  nextName: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary }, // rtl-ok: nested span, inherits textAlign from nextRow

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, alignSelf: 'stretch' },
  restNext: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
});
