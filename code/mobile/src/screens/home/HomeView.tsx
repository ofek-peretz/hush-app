/**
 * HomeView — the Today tab, v7 "All Dark · One Lit Stage".
 *
 * The first tab under the bar (Today · Cardio · Progress · You). It answers the only two questions
 * an open earns — what is up next, and what did Hush change — and offers the one act:
 *
 *   hush (range-mark + serif)     — the wordmark, with the account avatar opposite it
 *   UP NEXT                       — a quiet mono-styled eyebrow; the engine has no days (register L7)
 *   Upper A            · N CHANGES· the workout name in the coach's serif, the change count in a moss
 *                                   pill beside it — tap it for the week's decisions (the WHY)
 *   N LIFTS · ~M MIN              — the shape of the session, one line
 *   lift · load · scheme          · each lift with its form-clip glyph; a CHANGED load stands in moss
 *   [Upper A][Lower A]…           · the week's workouts as a horizontal chooser; the queued one is cream
 *   Begin Upper A                 · the one act — cream standing on the dark stage
 *   N WORKOUTS LEFT IN YOUR TRIAL · one quiet line, gone when the trial is
 *
 * WHY THE STRUCTURE CHANGED (founder v7, 2026-07-22). The old Home led with a brief CARD (the
 * engine's sentence in a framed box) and closed with a week CARD (the chips inside a second frame).
 * v7 dissolves both frames into the page: the change count becomes a pill on the title, and the
 * chips become an inline scroller under the plan. Nothing is a card on the stage now — the stage
 * itself is lit, and emphasis is standing in that light (cream) versus resting in shadow.
 *
 * THE NAME IS BACK, big, in the serif — this is the coach naming the session, and it is the one
 * place the workout's name is set as a headline. The button says it again as it starts it; the lit
 * chip says it a third time only while it is the selection. Cardio is its own TAB now, so the run
 * link that used to sit under the act is gone from here.
 *
 * Rest state centers "Recovery." with the completed-week meter and the one fact recovery waits on —
 * when the next week opens. There, and only there, Open training keeps its card: on a day with no
 * workout, a run IS the day's act.
 *
 * The container (Home.tsx) wires state + navigation.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { Legend, Display, Body, Button, Stage } from '@/components/ds';
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
  muscles: string; // "Chest · Shoulders · Triceps"
  trainedThisWeek: number;
  startError: boolean;
  weekNumber: number; // training-week counter ("Week N"), from memberSince
  /** The SELECTED workout's lifts, with the loads Hush set. Null while they are being read — the
   *  section holds its shape rather than flashing an empty list. */
  plan: HomePlanLift[] | null;
  /** Honest work-time estimate for the selected workout (minutes). 0 = unknown. */
  planMinutes?: number;
  /** S-3 — the engine could not fit this day inside her declared minutes even after every legal cut
   *  (every trained muscle is down to its last lift). Set on ProgramDay by generateProgram. When
   *  true, Hush SAYS so under the plan rather than starving a muscle in silence. */
  overBudget?: boolean;
  /** Her declared time budget in minutes (profile.workoutMinutes) — the number the S-3 line names. */
  budgetMinutes?: number;
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
  /** Hush's sentence(s) about what it did to this week's plan (domain/weekBriefing). Held for the
   *  WHY surface the change pill opens; null while the engine's record is still being read. */
  brief: Line[] | null;
  /** How many lifts the engine changed this week — the count on the moss pill beside the title.
   *  Null / 0 in a steady week, where no pill shows. */
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
  /** Open the account surface (the You tab) — the avatar opposite the wordmark. */
  /** Open the SHARE surface — the two-figure door opposite the wordmark (v7 2.1). */
  /** Open the coach — the conversation, from the corner of the first screen she sees. */
  onCoach?: () => void;
  /** Open the plan-share door. Reached from the You tab now; Today's corner is the coach's. */
  onShare?: () => void;

  // ── RECOVERY, v7 3.5 "THE WEEK IS DONE" — all optional, all best-effort. Absent → the section
  //    simply does not draw (the closing verdict still reads from the seal + copy alone).
  /** Sun→Sat (7), each day of THIS week: trained (a session logged) and whether it is today. The
   *  strip lands day by day — trained days wear the moss check, rest days a dashed ring. */
  weekDays?: { trained: boolean; today: boolean }[];
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
          {/* ════ THE DOOR OPPOSITE THE WORDMARK IS THE COACH (founder 2026-08-01) ════
              It held the share glyph, and before that an initial in a circle. It is the coach now,
              and the founder's reason for putting it HERE rather than in the tab bar is the whole
              product's positioning in one sentence:

                > *"I don't want to put the AI in the tab bar, because that would signal hardest of
                > all that we're just another AI app — when we really, really aren't."*

              Which is exactly right. A tab is a section of an app; this is not a section, it is who
              decides everything the rest of the app shows. A door in the corner is what a coach
              gets: available from the first screen, always, and announcing nothing.

              Sharing moved to the You tab rather than being deleted — it was the only way into it.

              ⚠️ AND THE GLYPH WAS STILL THE SHARE GLYPH. `twoPeople` is two figures over two
              shoulders, drawn for exactly one job: "send this to another person". Left in the
              corner it did not read as a neutral placeholder, it read as the door it used to be —
              the one thing this door can no longer do. A bubble says the plain true thing (something
              here talks) without saying the forbidden one: no sparkle, no robot, nothing that makes
              the corner announce an AI in an app whose whole positioning is that it is not one.

              ⏸️ Still a placeholder — the founder is drawing this in Claude Design. */}
          {props.onCoach ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('coach.title')}
              hitSlop={10}
              onPress={props.onCoach}
              style={({ pressed }) => [styles.shareDoor, pressed && styles.pressedDim]}
            >
              <Icon name="speech" size={21} color={signal[0]} strokeWidth={2.1} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
                  <Legend size={9.5} tone="muted">{t('home.sessionsLabel')}</Legend>
                </View>
                <View style={styles.sealBadge}>
                  <Icon name="check" size={11} color={color.up} strokeWidth={3} />
                </View>
              </Animated.View>

              <Display style={styles.restTitle}>{t('home.restTitle')}</Display>

              {/* THE WEEK, as seven marks — trained days wear the moss check, rest days a dashed ring,
                  today ringed in moss. Absent (the test path) → the strip simply does not draw. */}
              {props.weekDays?.length ? (
                <View style={styles.strip}>
                  {props.weekDays.map((day, i) => (
                    <View key={i} style={styles.stripCol}>
                      <View
                        style={[
                          styles.stripDot,
                          day.trained ? styles.stripDotOn : styles.stripDotOff,
                          day.today && styles.stripDotToday,
                        ]}
                      >
                        {day.trained ? <Icon name="check" size={13} color={color.onAccent} strokeWidth={2.8} /> : null}
                      </View>
                      <Text style={[styles.stripLabel, day.today && styles.stripLabelToday]}>{weekdayShort(i)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* the rest note — the coach's serif in italic, a moss range-mark opening it */}
              <View style={styles.restNote}>
                <View style={styles.restNoteMark}>
                  <View style={styles.restNoteBar} />
                  <View style={[styles.restNoteTick, styles.markTickStart]} />
                  <View style={[styles.restNoteTick, styles.markTickEnd]} />
                </View>
                <Text style={styles.restNoteText}>
                  {props.name ? t('home.restSubNamed', { name: bidi(props.name) }) : t('home.restSub')}
                </Text>
              </View>

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
              <Legend track={0.18}>{`${restWeekday} · ${t('home.upNext')}`}</Legend>

              {/* THE NAME, in the coach's serif — with the change count in a moss pill beside it.
                  Tap the pill for the week's decisions (the WHY surface, where the undo lives). */}
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>{bidi(props.dayName ?? '')}</Text>
                {props.briefCount != null && props.briefCount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('home.briefChanges', { count: props.briefCount })}
                    hitSlop={8}
                    onPress={props.onWeeklyUpdate}
                    style={({ pressed }) => [styles.changePill, pressed && styles.pressedDim]}
                  >
                    {props.briefUnseen ? <View style={styles.changeDot} /> : null}
                    {/* The pill says the fact — "3 CHANGES". The screen reader gets the longer
                        sentence above, where there is room for "this week". */}
                    <Legend size={11.5} track={0.08} weight="semibold" tone="accent">
                      {t('home.briefChangesShort', { count: props.briefCount })}
                    </Legend>
                  </Pressable>
                ) : null}
              </View>

              {/* The shape of the session, one line — "6 LIFTS · ~55 MIN". */}
              {liftCount ? (
                <Legend size={12.5} track={0.04} weight="regular" tone="onStage" style={styles.shapeLine}>
                  {t('home.planShape', { lifts: liftCount, min: props.planMinutes || 0 })}
                </Legend>
              ) : null}

              {/* TODAY'S LIFTS — a table the eye scans down. Each row: form-clip glyph + name on the
                  start edge, the load in a mono column on the end edge (moss if the engine changed it). */}
              {props.plan?.length ? (
                <View style={styles.plan}>
                  {props.plan.map((lift, i) => (
                    <Pressable
                      key={`${lift.exerciseId}_${i}`}
                      accessibilityRole="button"
                      accessibilityLabel={
                        lift.pending ? lift.name : `${lift.name} · ${planFigureLabel(lift, props.units)}`
                      }
                      accessibilityHint={t('workout.form')}
                      onPress={() => props.onForm(lift.exerciseId)}
                      style={({ pressed }) => [
                        styles.planRow,
                        // The table is CLOSED — the last row carries the bottom rule, so the plan
                        // reads as a block of facts rather than a list that trails off.
                        i === props.plan!.length - 1 && styles.planRowLast,
                        pressed && styles.pressedDim,
                      ]}
                    >
                      <View style={styles.planLeft}>
                        <Icon name="playCircle" size={15} color={color.textMuted} strokeWidth={1.5} />
                        {/* THE NAME WRAPS, IT DOES NOT TRUNCATE (founder A.15). It was clamped to
                            one line, so "Overhead Triceps Extension" arrived as "Overhead Triceps
                            Ex…" — and an ellipsis on the first screen of the day hides the one word
                            that distinguishes two lifts of the same family. A second line costs
                            nothing here: the row already stands 54 px tall. */}
                        <Text style={styles.planName}>{bidi(lift.name)}</Text>
                      </View>
                      {/* A CHANGED load stands lit IN ITS OWN DIRECTION and carries its unit and
                          scheme in shadow; an unchanged row is one quiet tone end to end.
                          A PENDING row draws no figure at all — see `pending`. */}
                      {lift.pending ? null : (
                        <Text style={styles.planFigure} numberOfLines={1}>
                          <Text style={[lift.changed ? styles.figureChanged : styles.figureQuiet, lift.changed ? { color: directionTone(lift.changed) } : null]}>
                            {figureLoad(lift, props.units)}
                          </Text>
                          <Text style={[styles.figureMeta, styles.figureUnit]}>{figureUnit(lift, props.units)}</Text>
                          <Text style={[styles.figureMeta, lift.changed ? styles.figureScheme : styles.figureQuiet]}>
                            {figureScheme(lift)}
                          </Text>
                        </Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={styles.planLoading} />
              )}

              {/* S-3 · the day genuinely cannot fit her minutes. The engine has already cut everything
                  it legally can (a muscle's last lift is protected), so it says so plainly and offers
                  the two levers she owns — more minutes, or a muscle off — rather than starve one in
                  silence. A quiet note, not an alarm: it is a fact about her budget, not an error. */}
              {props.overBudget && props.plan?.length ? (
                <Text style={styles.overBudgetNote}>
                  {t('home.overBudget', { n: props.budgetMinutes ?? 0 })}
                </Text>
              ) : null}

              {/* THE CHOOSER — the week's workouts as a horizontal scroller. The queued one is cream
                  (standing in the light); a done one is struck through and stands aside; the rest
                  rest in shadow. One act: a tap selects, and the plan above repaints. A done workout
                  can be read but not started again; an interrupted session freezes the row (the CTA
                  disagrees). */}
              {props.workouts.length ? (
                <View style={styles.chipStrip}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                  accessibilityLabel={t('home.weekChips')}
                >
                  {whatIsLeftFirst(props.workouts).map((w) => {
                    const isDone = !!w.done;
                    const current = props.dayId != null ? w.id === props.dayId : w.name === props.dayName;
                    const inert = !!props.resumable;
                    return (
                      <Pressable
                        key={w.id}
                        accessibilityRole="button"
                        accessibilityLabel={w.name}
                        accessibilityState={{ selected: current, disabled: inert }}
                        disabled={inert}
                        onPress={() => {
                          if (inert) return;
                          haptics.tick();
                          props.onChooseWorkout(w.id);
                        }}
                        style={({ pressed }) => [
                          styles.chip,
                          // ════ DONE OUTRANKS QUEUED (founder A.16) ════
                          // `current` used to be applied LAST, so a finished workout the athlete
                          // tapped to re-read put on the cream queued pill — "a completed workout's
                          // chip stays white, reads like another workout still to do". A record
                          // cannot wear the skin of an offer, whatever else is true of it. Selection
                          // on a done chip is said with a moss ring instead: it is still the thing
                          // the plan below belongs to, and it is still finished.
                          !isDone && current && styles.chipCurrent,
                          isDone && styles.chipDone,
                          isDone && current && styles.chipDoneCurrent,
                          pressed && styles.pressedDim,
                        ]}
                      >
                        {isDone ? <Icon name="check" size={13} color={color.up} strokeWidth={2.6} /> : null}
                        <Text
                          style={[
                            styles.chipText,
                            !isDone && current && styles.chipTextCurrent,
                            isDone && styles.chipTextDone,
                          ]}
                          numberOfLines={1}
                        >
                          {bidi(w.name)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {/* The strip runs off the page rather than stopping — a 52px fade at the end
                    edge says "there is more here" without a scrollbar or an arrow. */}
                <View pointerEvents="none" style={styles.chipFade}>
                  <Svg width="100%" height="100%">
                    <Defs>
                      <SvgGradient id="chipFade" x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0" stopColor={color.bg} stopOpacity="0" />
                        <Stop offset="1" stopColor={color.bg} stopOpacity="1" />
                      </SvgGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" fill="url(#chipFade)" />
                  </Svg>
                </View>
                </View>
              ) : null}

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

              {/* the trial — one quiet mono line under the act, gone when the trial is */}
              {props.trialLeft != null && props.trialLeft > 0 && !props.dayDone ? (
                <Legend size={10.5} track={0.1} align="center" style={styles.trialLine}>
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

/**
 * The load, formatted for display — "41", "" for bodyweight.
 */
function figureLoad(lift: HomePlanLift, units: 'kg' | 'lb'): string {
  // A pre-written figure carries its own numbers; a load column beside it would print twice.
  if (lift.detail != null) return '';
  if (lift.load == null) return '';
  const w = displayWeight(lift.load, units);
  return w == null ? '' : String(+w.toFixed(2));
}

/**
 * The unit, in shadow beside the load — " kg" / " lb", and nothing at all for a bodyweight lift.
 *
 * ════ THE UNIT IS BACK (founder A.16→A.5, 2026-07-29: "the unit is missing") ════
 * v7 2.1 took it off on the argument that the plan is a COLUMN of loads in one declared unit, so
 * repeating "kg" six times turns a scannable column into six sentences. The founder overturned
 * that on the device, and he is right for a reason the argument missed: this is the FIRST screen
 * of the day, and every row already ends in a scheme ("· 4×8–10"), so the number was never alone
 * in a bare column — it was a bare number inside a sentence. It is set in the muted tone the
 * scheme wears, so the LOAD is still the only lit thing in the figure.
 */
function figureUnit(lift: HomePlanLift, units: 'kg' | 'lb'): string {
  if (lift.detail != null) return '';
  return lift.load == null ? '' : ` ${unitLabel(units)}`;
}

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

/** The scheme, tight and with an EN-dash range: " · 4×8–10" (leading separator when a load precedes). */
function figureScheme(lift: HomePlanLift): string {
  if (lift.detail != null) return lift.detail;
  const [lo, hi] = lift.band;
  const scheme = `${lift.sets}×${hi > lo ? `${lo}–${hi}` : lo}`;
  return lift.load == null ? scheme : ` · ${scheme}`;
}

/** The whole right-hand figure, as one string, for the row's accessibility label. */
function planFigureLabel(lift: HomePlanLift, units: 'kg' | 'lb'): string {
  const load = figureLoad(lift, units);
  return load ? `${load}${figureUnit(lift, units)}${figureScheme(lift)}` : figureScheme(lift);
}

/** The short weekday label for the day strip's column i (0 = Sunday), in the active locale. */
function weekdayShort(i: number): string {
  // 2023-01-01 was a Sunday; add i days to land on that column's weekday.
  return new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
}

/** One fact of the week's band — a mono figure over its sans meta label (MOVED / KCAL / LOADS UP). */
function RestFact({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={styles.restFact}>
      <Text style={[styles.restFactVal, accent && styles.restFactValUp]}>{value}</Text>
      <Legend size={10} tone={accent ? 'accent' : 'muted'}>{label}</Legend>
    </View>
  );
}

const styles = StyleSheet.create({
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
  // "The two-people icon is swallowed by the background — effectively invisible."
  //
  // It was NOT the colour: the glyph is lit moss on a near-black stage, which is about as much
  // contrast as this palette has. It was that a 1.8-weight outline floating in a bare corner with
  // no surface under it does not register as a THING TO PRESS — the eye reads it as decoration
  // beside the wordmark and moves on. The fill it used to have was removed on the argument that a
  // ring would compete with the range-mark opposite; a WASH does not compete, it just gives the
  // glyph a body. The stroke goes up with it, because a hairline is what got swallowed.
  shareDoor: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.fillSubtleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.fillSubtleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: font.sansSemibold, fontSize: 14, color: color.textPrimary, textAlign: 'center' },

  // v7 2.1: the page's own gutter is 30; only the ACT drops to 26 (see `cta`).
  // flexGrow so the ACT can sit at the foot of a short page (the handoff's `margin-top:auto`)
  // while a long one still scrolls.
  scroll: { flexGrow: 1, paddingHorizontal: 30, paddingTop: 22, paddingBottom: 8 },
  block: { gap: 13 },
  pressedDim: { opacity: 0.62 },

  // ── the title row ──
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontFamily: font.serif, fontSize: 54, lineHeight: 54, color: color.textPrimary, textAlign: 'left' },
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
  plan: { marginTop: 2 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    // THE PLAN IS THE POINT OF THIS SCREEN (founder 2026-07-28). It was set as a dense list — 44 px
    // rows, a 15 pt name, a 13.5 pt load — under a card that had room to spare. She reads it to
    // decide whether to go to the gym; it should be the easiest thing here to read, not the
    // tightest.
    minHeight: 54,
    paddingVertical: 14,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.10)',
  },
  planRowLast: { borderBottomWidth: 1, borderBottomColor: 'rgba(241,238,229,0.10)' },
  // The FIGURE is never squeezed: it is the fact the row exists for. The name shrinks and
  // truncates around it (handoff: the load span is `flex:none; white-space:nowrap`).
  planLeft: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  // A.15 — no `numberOfLines` on the name: it WRAPS. `lineHeight` is set so a two-line name reads
  // as one label rather than two rows of text.
  planName: { flexShrink: 1, minWidth: 0, fontFamily: font.sansMedium, fontSize: textScale.md, lineHeight: 21, color: color.textPrimary, textAlign: 'left' },
  planFigure: { flexGrow: 0, flexShrink: 0, fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 17, textAlign: 'right' },
  figureQuiet: { color: color.textSecondary, fontFamily: font.mono }, // rtl-ok: nested span, inherits end-alignment from planFigure
  // ── the figure's META: the unit and the scheme ──
  // The LOAD keeps the founder's 2026-07-28 enlargement (17 pt — "she reads it to decide whether to
  // go to the gym"). Its meta does not: the canonical handoff sets the whole figure at 13.5, and
  // once the unit joined the row (A.5) a 17 pt scheme was taking half the row's width from the
  // NAME, which is what pushed a long name onto a third line (A.15). Small meta is also the
  // hierarchy this row is supposed to have — one lit fact, everything else in shadow.
  figureMeta: { fontSize: 13.5 },
  // The unit is a caption on the number, never part of the fact the engine decided — so it wears
  // the muted tone whether or not the load moved.
  figureUnit: { color: color.textMuted, fontFamily: font.mono }, // rtl-ok: nested span, inherits end-alignment from planFigure
  // The face only — the COLOUR is `directionTone(lift.changed)` at the call site, so this row can
  // never hold an opinion about direction that the rest of the app does not share.
  figureChanged: { fontFamily: font.monoMedium }, // rtl-ok: nested span, inherits end-alignment from planFigure
  figureScheme: { color: color.textMuted, fontFamily: font.mono }, // rtl-ok: nested span, inherits end-alignment from planFigure
  planLoading: { height: 168 },
  // S-3 — a quiet note, not an alarm. Sans (it carries words), secondary ink, sits under the plan.
  overBudgetNote: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 20, color: color.textSecondary, textAlign: 'left', marginTop: 10 },
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
  trialLine: { marginTop: 4 },

  // ── recovery (v7 3.5 "THE WEEK IS DONE") ──
  restBlock: { paddingTop: 6, alignItems: 'center' },
  restEyebrow: { marginBottom: 15 },

  // the seal — a big dashed ring, its core the N/N count, a moss check at the crown
  sealRing: {
    width: 158,
    height: 158,
    borderRadius: 79,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.borderStrong,
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

  // the seven-mark week strip
  strip: { flexDirection: 'row', gap: 9, marginTop: 16 },
  stripCol: { alignItems: 'center', gap: 5 },
  stripDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stripDotOn: { backgroundColor: color.up },
  stripDotOff: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.borderStrong },
  stripDotToday: { borderWidth: 3, borderStyle: 'solid', borderColor: color.upWash },
  stripLabel: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 13, letterSpacing: 0.4, color: color.textMuted, textAlign: 'center' },
  stripLabelToday: { fontFamily: font.monoSemibold, color: color.up }, // rtl-ok: merged onto stripLabel, which sets textAlign:'center'

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
  restNoteText: { flex: 1, fontFamily: font.serif, fontStyle: 'italic', fontSize: 16.5, lineHeight: 24, color: color.textPrimary, textAlign: 'left' },

  // the week's facts band
  statBand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: color.border,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  restFact: { gap: 2 },
  restFactVal: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: textScale.lg, color: color.textPrimary, textAlign: 'left' },
  restFactValUp: { color: color.up },

  // NEXT — name only, no fabricated load
  nextRow: { alignSelf: 'stretch', marginTop: 16, textAlign: 'left' },
  nextLabel: { fontFamily: font.sansMedium, fontSize: 14.5, letterSpacing: 0.8, color: color.textMuted }, // rtl-ok: nested span, inherits textAlign from nextRow
  nextName: { fontFamily: font.sansSemibold, fontSize: 13, color: color.textPrimary }, // rtl-ok: nested span, inherits textAlign from nextRow

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, alignSelf: 'stretch' },
  restNext: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
});
