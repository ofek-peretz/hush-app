/**
 * HomeView — the center of gravity.
 *
 * Hub-and-spoke, no tab bar. A scrolling hub that answers two questions on open — what did Hush
 * decide, and what am I doing today — and offers the one act:
 *
 *   brand (hush·) + settings
 *   I DECIDED           · Hush's own sentences about what it changed; the why one tap away; and an
 *                         UNDO when the change it is announcing was a rotation (S-71, out loud)
 *   NEXT WORKOUT ~45min · its lifts, each with the LOAD Hush set + its form clip
 *   Begin {name}        · Cardio
 *   Week N · n/m        · the cycle's workouts as chips (the chooser)
 *   History / Progress
 *
 * The legend says NEXT WORKOUT, never "Today": **the engine has no days** (register L7). The week is
 * a display container of N workouts trained in any order, and nothing schedules one for today — so
 * "Today · Push A" is a claim the engine never made, and a lie the moment she trains it tomorrow.
 *
 * Rest state centers "Recovery." with the completed-week meter, one quiet fact — when the next week
 * opens — and Open training, which on a recovery day IS the day's act.
 *
 * ═══ THE PLAN IS THE HERO (founder 2026-07-17) ═══
 *
 * "Home should show, at the top, in a few very short sentences, which changes the engine decided…
 * and tapping each chip shows the workout plan. That way the athlete knows, already from Home, what
 * is waiting for him in today's workout — and so we present the engine already on the home screen."
 *
 * Both halves were wrong before. The engine's sentences were the LAST thing on the page, under the
 * chips, inside a card at the bottom. And the plan was not on the page at all: it lived a screen
 * away (ProgramDetail), which listed the lifts and left out the LOAD — the one number Hush decides.
 * Home showed a 60pt name, six muscle pills, and "6 exercises · Loads set": three ways of saying
 * what the list itself says better, and none of them the engine.
 *
 * So the decision came to the top, the lifts came onto the page with their loads, and the three
 * labels describing them went. ProgramDetail is deleted — its form clip is a tap on the lift's row.
 *
 * ═══ THE WEEK CARD (founder 2026-07-13) — three findings, one object ═══
 *
 *  · "The app still doesn't say what it does. It doesn't read like anyone is MANAGING my
 *    programme." So the card opens with Hush's own sentence — what it did to this week's plan and
 *    why (domain/weekBriefing): the loads it raised, the load it matched back down, the lift it
 *    swapped. Not an explanation of the product; the product, narrating itself.
 *  · "The Program section at the bottom gets swallowed." It was three quiet list rows. It is now
 *    the only CARD on the page, and it holds the week itself.
 *  · "Nobody can know they can edit the plan, pin a lift, or watch the clip — you have to tap
 *    This-week, then a workout, and only then does it open." The workouts are chips ON the card
 *    now: a check when trained, the ochre index on the one that is queued, and the plan is reachable
 *    from the card itself (see the second pass below for what a tap does today). The week's state is
 *    legible without entering anything.
 *
 * ═══ ONE WEEK, ONE SURFACE (founder 2026-07-13, second pass) ═══
 *
 * "There are three screens for the same purpose." There were: the chips, the 'choose another
 * workout' sheet, and the whole This-week screen — three lists of the same four workouts. Two are
 * gone. The CHIPS are the chooser:
 *
 *   · tap a chip            → that workout is the one queued.
 *   · tap a DONE chip       → the record it became (it cannot be queued again, founder 2026-07-11).
 *
 * So choosing never leaves Home. The week's state — what is done, what is left, how many of how
 * many — was always on this card; it never needed a screen of its own.
 *
 * ═══ ONE CONTROL, ONE ACT (2026-07-17) ═══
 *
 * The queued chip used to open its plan on a SECOND tap, and this file admitted the cost in
 * writing: "the chips carry two acts now, and an athlete cannot be expected to guess the second" —
 * so it paid for the overloaded control with a line of instructions under it ("Tap to queue a
 * workout · tap it again to open it"). A hint is a symptom; the control was wrong.
 *
 * A chip now does exactly one thing: it selects its workout, and the list of lifts repaints under
 * it. That IS the chip explaining itself — no caption, and none present. A DONE chip selects too
 * (a record can be read); only the button changes, because a finished workout cannot be started
 * again. The gate belongs on the act, never on the view.
 *
 * That frees Home's secondary button, and cardio takes it (founder): a run is a real option, and it
 * was buried inside the sheet we just deleted. On a RECOVERY day it is the day's ACT, so there it
 * still gets its own card.
 *
 * The container (Home.tsx) wires state + navigation.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon } from '@/components/Icon';
import { HushMark } from '@/components/HushMark';
import { Legend, Display, BodyL, Body, Button, ProgressMeter, ListRow, IconButton } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import type { Line } from '@/domain/voice';
import { displayWeight, unitLabel } from '@/domain/schedule';
import * as haptics from '@/platform/haptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, space, font, textScale, signal, radius, up } from '@/design/tokens';

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
 * One lift of the selected workout, as Home prints it (founder 2026-07-17: "the athlete should
 * know, already from Home, what is waiting for him in today's workout").
 *
 * The LOAD is the point. `ProgramDetail` listed the day's lifts with their sets and reps and left
 * the weight out — which is the one number Hush decided, so the preview showed everything except
 * the product. Here the line reads "Bench Press · 80 kg · 3 × 8", and every one of those figures is
 * the engine's, sitting on the first screen the athlete opens.
 */
export interface HomePlanLift {
  exerciseId: string;
  name: string;
  /** kg; null = bodyweight (the row then says the reps carry the work, not a weight). */
  load: number | null;
  sets: number;
  /**
   * HER BAND — `[Tlo, Thi]`, not a single number (founder 2026-07-17: "our engine shows the range
   * for the reps; T defaults to 8-10, so we need to match that here too").
   *
   * The prescription IS the band (register S-6): land in it, and clearing the top earns weight —
   * "they never have to grind to the top of a range" (the brief). Printing `recommendedReps` alone
   * printed **Tlo, the FLOOR** (models.ts says so in as many words) dressed as the whole target: it
   * hid the ceiling, and with it the fact that she owns this range at all. One of the engine's
   * headline strengths, invisible on the screen that introduces the workout.
   *
   * The STAGE deliberately does NOT show a range: there the number is the value that gets LOGGED if
   * she taps Complete Set without editing (`sessionStore` → `actualReps: recommendedReps`). A range
   * on a loggable value would promise a choice and silently record the floor.
   */
  band: [number, number];
}

export interface HomeViewProps {
  resting: boolean;
  /** The athlete's first name, when they gave one — spoken only where Hush is speaking TO them. */
  name?: string;
  dayName: string | null;
  /** The QUEUED workout's id. The chips key off this, never off the name: two workouts in a week
   *  can be called the same thing, and a chip that matched by name would light the wrong one — and,
   *  worse, open a plan when it was asked to queue one. */
  dayId?: string | null;
  muscles: string; // "Chest · Shoulders · Triceps"
  trainedThisWeek: number;
  startError: boolean;
  weekNumber: number; // training-week counter ("Week N"), from memberSince
  /** The SELECTED workout's lifts, with the loads Hush set. Null while they are being read — the
   *  section holds its shape rather than flashing an empty list. */
  plan: HomePlanLift[] | null;
  /** Honest work-time estimate for the selected workout (minutes), from the same estimator the
   *  time cap runs on. 0 = unknown. */
  planMinutes?: number;
  /** Open one lift's form clip — the last job the deleted plan screen was doing. */
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
  /** Hush's sentence(s) about what it did to this week's plan (domain/weekBriefing). Null while
   *  the engine's record is still being read — the card holds its shape and stays silent. */
  brief: Line[] | null;
  /** How many lifts the engine changed this week — the count Home states before the sentence
   *  (founder 2026-07-13: "say whether there are changes, and how many"). Null in week one. */
  briefCount: number | null;
  /** This week's update has not been opened yet — the card wears the ochre mark. */
  briefUnseen: boolean;
  /**
   * The engine ROTATION she can take back, named by the lift it took away. Null unless one is live.
   *
   * Founder 2026-07-17: "when the engine changes an exercise, show it in the engine's review and
   * offer an undo." It sits with the SENTENCE that announced the swap, because that is the claim it
   * answers — an undo anywhere else would be a control looking for its subject.
   */
  undoable?: { anchor: string; name: string } | null;
  onUndoSwap?: () => void;
  onWeeklyUpdate: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onProgress?: () => void;
  onCardio: () => void; // Open training (run / walk) — recorded, not coached
}

/**
 * The right-hand column of a plan row: "80 kg · 3 × 8", or "3 × 12" on a bodyweight lift, where
 * there is no weight to state and the reps are the work (the stage holds the same rule).
 */
function planFigure(lift: HomePlanLift, units: 'kg' | 'lb'): string {
  const [lo, hi] = lift.band;
  // An EN DASH, and no spaces around it: "8–10" is one figure — a range — and a hyphen with air
  // reads as two numbers with something between them.
  const scheme = `${lift.sets} × ${hi > lo ? `${lo}–${hi}` : lo}`;
  if (lift.load == null) return scheme;
  const w = displayWeight(lift.load, units);
  return `${w == null ? '' : +w.toFixed(2)} ${unitLabel(units)} · ${scheme}`;
}

export function HomeView(props: HomeViewProps) {
  const { t } = useCopy();
  const reduced = useReducedMotion();

  const total = props.workouts.length || 0;
  const done = Math.min(props.trainedThisWeek, total);

  /* ---- the Recovery moment (founder 2026-07-12) ----------------------------------
   * Finishing a week is the biggest thing an athlete does here and the app said nothing.
   * Not confetti — a SEAL: the sage mark draws itself closed as the screen settles, with
   * the week-complete haptic (two soft beats resolving into one, like something being set
   * down). Once per week, ever: the flag is keyed by the week number, so it never fires
   * twice on the same achievement no matter how often Home is reopened.
   * -------------------------------------------------------------------------------*/
  const seal = useRef(new Animated.Value(0)).current;
  const [sealed, setSealed] = useState(false); // true once we know this week's flag state
  useEffect(() => {
    if (!props.resting) return;
    let active = true;
    const week = String(props.weekNumber);

    // Storage NEVER decides whether the mark is drawn — only whether it is celebrated. A
    // rejected read used to leave `sealed` false forever, which held the seal's reserved box
    // open as a permanent 72pt hole above "Recovery." The flag is a nice-to-have; the mark is
    // the screen.
    const settle = (celebrate: boolean) => {
      if (!active) return;
      setSealed(true);
      if (!celebrate || reduced) {
        seal.setValue(1); // already celebrated (or motion is off) — the mark is simply there
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
      // Storage is gone: draw the mark, stay silent. A stray celebration on every open would
      // be worse than a missed one.
      .catch(() => settle(false));

    return () => {
      active = false;
    };
  }, [props.resting, props.weekNumber, reduced, seal]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* brand + account */}
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <HushMark size={26} />
            <Text style={styles.wordmark}>hush</Text>
            <View style={styles.dot} />
          </View>
          <IconButton accessibilityLabel={t('menu.title')} onPress={props.onSettings}>
            <Icon name="sliders" size={20} color={color.textPrimary} strokeWidth={2} />
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* ═══ I DECIDED — THE ENGINE, FIRST (founder 2026-07-17) ═══
              "Home should show, at the top, in a few very short sentences, which changes the engine
              decided." It always said them — at the BOTTOM, inside the week card, under the chips.
              The one thing that makes this a managed programme rather than a nicely-drawn workout
              screen was the last thing on the page.
              It opens with the COUNT (founder 2026-07-13): how many lifts changed, or that none
              did — the fact first, the sentence under it, the WHY one tap away. */}
          {/* Hush's sentence — what it DID to this plan. The one line that makes this a
              managed programme rather than a nicely-drawn workout screen. It opens with the
              COUNT (founder 2026-07-13): how many lifts changed, or that none did — the fact
              first, the sentence under it, and the WHY one tap away. */}
          {props.brief?.length ? (
            /* A CARD, and NOT one big button any more. It was a single Pressable labelled "What
               changed, and why", which merged everything inside it into one accessibility element —
               fine while there was one act, impossible now: an Undo nested in it would fight the
               parent's tap and never reach VoiceOver at all. Two acts, two real targets.

               COLOUR: none, deliberately, and that is the answer to "how do you mark a change vs no
               change". The distinction is the SENTENCE — "3 changes this week" or "No changes this
               week" — because a steady week is a DECISION (S-24), not a lesser state, and tinting
               one green and the other grey would be Hush editorialising about its own verdicts.
               Under READOUT the emphasis is already spent correctly: this block is raised off the
               ground and sits at the top of the page. That IS the mark. */
            <View style={styles.brief}>
              {props.briefCount != null ? (
                <View style={styles.briefCountRow}>
                  <Text style={styles.briefCount}>
                    {props.briefCount > 0
                      ? t('home.briefChanges', { count: props.briefCount })
                      : t('home.briefNoChanges')}
                  </Text>
                  {props.briefUnseen ? (
                    <View style={styles.briefNew}>
                      <View style={styles.briefNewDot} />
                      <Text style={styles.briefNewText}>{t('home.briefNew').toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <Text style={styles.briefText}>{props.brief.map((l) => t(l.key, l.params ?? {})).join(' ')}</Text>
              <View style={styles.briefActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('home.briefOpen')}
                  hitSlop={8}
                  onPress={props.onWeeklyUpdate}
                  style={({ pressed }) => [styles.briefLinkRow, pressed && styles.weekPressed]}
                >
                  <Text style={styles.briefLink}>{t('home.briefOpen')}</Text>
                  <Icon name="chevronRight" size={14} color={color.accentText} strokeWidth={2} />
                </Pressable>

                {/* THE UNDO — quiet on purpose. It reverses a decision, so it must be findable and
                    must not compete with it: an outline, never a fill. The engine's sentence is the
                    news; this is the athlete's right of reply.

                    NO ICON. The only candidates were `repeat`/`swap` — the glyph of the very act
                    being reversed, which would read as "swap it again" — and `history`, which is
                    the nav row's icon two sections down. There is no honest undo glyph here, and a
                    misleading one is worse than none: the label already says exactly what happens.

                    It says KEEP, not "undo": "undo" names the mechanism, "Keep Leg Press" names the
                    outcome, and the outcome is the thing she wants. */}
                {props.undoable && props.onUndoSwap ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('home.undoSwapA11y', { lift: props.undoable.name })}
                    hitSlop={8}
                    onPress={props.onUndoSwap}
                    style={({ pressed }) => [styles.undoBtn, pressed && styles.undoBtnPressed]}
                  >
                    <Text style={styles.undoText} numberOfLines={1}>
                      {t('home.undoSwap', { lift: bidi(props.undoable.name) })}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
          {/* Founder 2026-07-10: the greeting line above NEXT WORKOUT said nothing the
              legend + workout name don't — cut. The workout is the star. */}
          {/* ONE legend over the lifts, and it says NEXT WORKOUT — not "today".
              I briefly had both: this one, and a "TODAY" over the plan list four lines below it.
              Two legends, back to back, for one section — the same stutter this screen has been
              losing all day.
              Keeping this one is not just about which came first. **The engine has no days.** There
              is no calendar in v5 (register L7): the week is a display container of N workouts she
              trains in any order, and nothing schedules this one for today. "TODAY · PUSH A" is the
              shape a scheduled app uses, and the moment she trains it tomorrow it is a lie the
              engine never told. "Next workout" is exactly as true on Thursday as on Monday.
              The minutes ride here — the one fact the list below cannot show. */}
          <View style={styles.legendTop}>
            <Legend>{props.resting ? t('home.recovery') : t('home.nextWorkout')}</Legend>
            {!props.resting && props.planMinutes ? (
              <Text style={styles.planMin}>{t('home.planMinutes', { min: props.planMinutes })}</Text>
            ) : null}
          </View>

          {props.resting ? (
            <View style={styles.block}>
              {/* the seal — the week, closed. It draws itself in once, the first time the
                  athlete lands here having finished every session. */}
              {sealed ? (
                <Animated.View
                  style={[
                    styles.restSeal,
                    { opacity: seal, transform: [{ scale: seal.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
                  ]}
                >
                  <Icon name="check" size={26} color={up[0]} strokeWidth={2.6} />
                </Animated.View>
              ) : (
                <View style={styles.restSealSlot} />
              )}
              {/* THE NAME (founder 2026-07-13): "we ask for it and then never say it." A finished
                  week is one of the three moments that earn it (with the programme being handed
                  over, and the Saturday letter) — the athlete is being spoken to, not reported at.
                  Never on a working surface, never twice on one screen. */}
              <Display>{t('home.restTitle')}</Display>
              <BodyL tone="secondary" style={styles.restCopy}>
                {props.name ? t('home.restSubNamed', { name: bidi(props.name) }) : t('home.restSub')}
              </BodyL>
              <View style={styles.meterWrap}>
                <ProgressMeter
                  label={t('home.weekComplete', { n: props.weekNumber })}
                  valueLabel={`${total} / ${total}`}
                  value={total}
                  max={total || 1}
                  tone="up"
                  size="lg"
                />
              </View>
              {/* The one fact recovery is waiting on. It is a SENTENCE, not a measurement —
                  so it is set in the speaking voice. It was in JetBrains Mono, which made it
                  read as a placeholder somebody forgot to replace (founder 2026-07-12). */}
              <View style={styles.metaRow}>
                <Icon name="calendar" size={15} color={color.textTertiary} strokeWidth={2} />
                <Text style={styles.restNext}>{t('home.restNext')}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.block}>
              {/* ═══ THE PLAN IS THE HERO (founder 2026-07-17) ═══
                  "The athlete should know, already from Home, what is waiting for him in today's
                  workout." Once the lifts and their loads are on the page, three things that used
                  to live here are answering questions the list answers better:
                    · the 60pt name — the selected chip says which workout, the CTA says it again
                      when you start it. Two mentions, which is the floor the founder set; a third,
                      set in Display, was the screen shouting a label over its own content.
                    · the muscle pills — "chest · shoulders · triceps" is a summary of a summary.
                      "Bench Press / Overhead Press / Triceps Pushdown" is the same fact, specific.
                    · "6 exercises · Loads set" — you can count six rows, and every one of them
                      shows its load. The line was describing the list that is now underneath it.
                  All three are gone. What is left is what the athlete came to find out. */}

              {/* TODAY'S LIFTS — the answer to the only question Home exists to answer.
                  The legend does NOT repeat the name (the chip above it is lit, the button below
                  says it): it carries the one fact neither of them does — how long this will take,
                  from the same estimator the engine's time cap runs on. */}
              {props.plan?.length ? (
                <View style={styles.plan}>
                  {props.plan.map((lift, i) => (
                    <Pressable
                      key={`${lift.exerciseId}_${i}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${lift.name} · ${planFigure(lift, props.units)}`}
                      accessibilityHint={t('workout.form')}
                      onPress={() => props.onForm(lift.exerciseId)}
                      style={({ pressed }) => [
                        styles.planRow,
                        i === (props.plan?.length ?? 0) - 1 && styles.planRowLast,
                        pressed && styles.weekPressed,
                      ]}
                    >
                      <Text style={styles.planName} numberOfLines={1}>{bidi(lift.name)}</Text>
                      {/* The figures are MONO and right-aligned into a column, so six lifts read as
                          a table the eye can scan down — not six sentences it has to parse. */}
                      <Text style={styles.planFigure} numberOfLines={1}>{planFigure(lift, props.units)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                /* Never an empty flash: the section holds its height while the loads are read. */
                <View style={styles.planLoading} />
              )}

              {props.startError ? <Body tone="secondary" style={styles.error}>{t('errors.general')}</Body> : null}

              <View style={styles.cta}>
                {props.resumable ? (
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    label={t('home.continueWorkout', { name: bidi(props.resumable.workoutName) })}
                    onPress={props.onResume}
                    leading={<Icon name="play" size={18} color={color.onAccent} />}
                  />
                ) : props.dayDone ? (
                  /* A FINISHED workout is a record, not an offer (founder 2026-07-11). Its plan is
                     right there to read; the button is not, because there is nothing to press. */
                  <View style={styles.doneRow}>
                    <Icon name="check" size={16} color={color.up} strokeWidth={2.4} />
                    <Text style={styles.doneText}>{t('program.doneThisWeek')}</Text>
                  </View>
                ) : props.dayName ? (
                  /* THE BUTTON NAMES WHAT IT STARTS — and it is allowed to, now.
                     The founder's law is TWO mentions, never three (2026-07-14: "the screen said
                     Upper B three times — the Display, the button, the chip"). The Display was one
                     of the two, so the button went plain. The Display is gone now, and the count is
                     unchanged: the lit chip says which workout, this button says it as it starts
                     it. Two — and the second one is on the act, which is where a name is worth
                     most. A bare "Begin" under a list of six lifts would be the screen declining to
                     say what it is about to do. */
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    label={t('home.begin', { name: bidi(props.dayName) })}
                    onPress={props.onStart}
                    leading={<Icon name="play" size={18} color={color.onAccent} />}
                  />
                ) : null}
                {/* The second door on Home is the RUN (founder 2026-07-13) — but it was a
                    full-width bordered button, the same SHAPE and weight as the primary act, so the
                    page offered two equal doors and made the athlete choose between them. It is a
                    secondary path; it now looks like one (founder 2026-07-14). A link, centred,
                    under the act. */}
                {!props.resumable ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('cardio.title')}
                    hitSlop={10}
                    onPress={props.onCardio}
                    style={({ pressed }) => [styles.cardioLink, pressed && styles.weekPressed]}
                  >
                    <Icon name="runner" size={15} color={color.textMuted} strokeWidth={2} />
                    <Text style={styles.cardioLinkText}>{t('home.cardioCta')}</Text>
                    <Icon name="chevronRight" size={14} color={color.textMuted} strokeWidth={2} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}

          {/* RECOVERY ONLY: on a day with no workout to do, a run or a walk IS the day's act —
              so here, and only here, open training keeps its card (founder 2026-07-13). During a
              training week it is one of the options in "choose another workout", where a
              secondary path belongs. */}
          {props.resting ? (
            <View style={styles.openTraining}>
              <Legend style={styles.hubLegend}>{t('home.openTraining')}</Legend>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('cardio.title')}
                onPress={props.onCardio}
                style={({ pressed }) => [styles.cardioCard, pressed && styles.cardioCardPressed]}
              >
                <View style={styles.cardioIconBox}>
                  {/* a running figure, not the old footprints — which read as two cups */}
                  <Icon name="runner" size={20} color={color.textSecondary} strokeWidth={2} />
                </View>
                <View style={styles.cardioText}>
                  <Text style={styles.cardioTitle}>{t('cardio.title')}</Text>
                  <Text style={styles.cardioSub}>{t('cardio.recordedNotCoached')}</Text>
                </View>
                <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />
              </Pressable>
            </View>
          ) : null}

          {/* ── the week, and the voice that manages it (see the header) ── */}
          <View style={styles.hub}>
            <Legend style={styles.hubLegend}>{t('home.programLegend')}</Legend>
            <View style={styles.weekCard}>
              {/* The head is a STATEMENT, not a door: the screen it used to open (This week) is
                  gone — everything it held is on this card (founder 2026-07-13).
                  THE COUNT IS BACK, and it is back for the reason it left. It was cut on
                  2026-07-14 as the THIRD rendering of one fact — the chips showed it, the week
                  METER stated it in figures, and this head said it again. The meter is gone now
                  (the chips were always its bar: four chips, one checked, IS 1 / 4 — the bar drew
                  the same picture underneath them), so the head is no longer a third voice. It is
                  the only one that states the count, and the week it belongs to. */}
              <View style={styles.weekHead}>
                <Text style={styles.weekTitle}>{t('home.weekLabel', { n: props.weekNumber })}</Text>
                <Text style={styles.weekCount}>{`${done} / ${total}`}</Text>
              </View>

              {/* THE CHIPS ARE THE CHOOSER, AND THAT IS ALL THEY ARE (2026-07-17).
                  A chip queues its workout. One act, one control — the second act (open the plan)
                  moved to the meta line above, which names it. A finished workout cannot be queued
                  again (founder 2026-07-11), so its tap opens the record it became: that is not a
                  hidden second act, it is the only thing a record can do. */}
              {props.workouts.length ? (
                <View style={styles.chips} accessibilityLabel={t('home.weekChips')}>
                  {props.workouts.map((w) => {
                    const isDone = !!w.done;
                    const current = props.dayId != null ? w.id === props.dayId : w.name === props.dayName;
                    /* ONE ACT: a chip SHOWS its workout. The list below repaints, which is how the
                       chip explains itself — no caption required, and none present.
                       A DONE chip shows its plan too (it is a record you can read); only the button
                       changes, because a finished workout cannot be started again.
                       An INTERRUPTED session is the exception: it owns the whole screen ("Continue
                       Pull A"), so a chip that repainted the list under that button would be
                       offering a workout the button disagrees with. There is exactly one act until
                       she finishes or abandons it, so the chips stand down and say so. */
                    const inert = !!props.resumable;
                    return (
                      <Pressable
                        key={w.id}
                        accessibilityRole="button"
                        accessibilityLabel={w.name}
                        accessibilityState={{ selected: current, disabled: inert }}
                        disabled={inert}
                        onPress={() => {
                          // `disabled` already stops the finger; this stops everything else. The
                          // rule — a chip never queues behind the CTA's back — is worth holding
                          // here rather than trusting a prop two layers down to be the only thing
                          // between an interrupted session and a plan that contradicts it.
                          if (inert) return;
                          haptics.tick(); // the list changed under the finger — it should be felt
                          props.onChooseWorkout(w.id);
                        }}
                        style={({ pressed }) => [
                          styles.chip,
                          isDone && styles.chipDone,
                          current && styles.chipCurrent,
                          pressed && styles.weekPressed,
                        ]}
                      >
                        {isDone ? (
                          <Icon name="check" size={13} color={color.up} strokeWidth={2.6} />
                        ) : current ? (
                          <View style={styles.currentDotSm} />
                        ) : null}
                        {/* Workout names are English in every locale (the RTL law). Inside a Hebrew
                            chip, sitting right next to a glyph, an un-isolated Latin run is exactly
                            where the bidi algorithm reorders things — so it is isolated. */}
                        <Text style={[styles.chipText, isDone && styles.chipTextDone]} numberOfLines={1}>
                          {bidi(w.name)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

            </View>

            <ListRow
              title={t('home.hubHistory')}
              subtitle={t('home.hubHistorySub')}
              chevron
              onPress={props.onHistory}
              leading={<Icon name="history" size={20} color={color.textSecondary} strokeWidth={2} />}
            />
            {props.onProgress ? (
              <ListRow
                title={t('home.hubProgress')}
                subtitle={t('home.hubProgressSub')}
                chevron
                last
                onPress={props.onProgress}
                leading={<Icon name="trendingUp" size={20} color={color.textSecondary} strokeWidth={2} />}
              />
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
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
    paddingHorizontal: space.gutter,
    paddingTop: 4,
  },
  // The wordmark + accent dot is a brand lockup — it stays LTR ("Hush·") in every
  // locale rather than mirroring to "·Hush".
  brand: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, direction: 'ltr' },
  wordmark: { fontFamily: font.sansSemibold, fontSize: 21, letterSpacing: -0.6, color: color.textPrimary, textAlign: 'left' },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.textMuted, marginLeft: 2, marginBottom: 5 }, // rtl-ok: inside LTR brand lockup

  scroll: { paddingHorizontal: space.gutter, paddingBottom: 32 },
  legendTop: { paddingTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  block: { paddingTop: 14 },
  restCopy: { marginTop: 14, maxWidth: 320 },

  openTraining: { marginTop: 24 },
  cardioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardioCardPressed: { backgroundColor: color.fillSubtle },
  cardioIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: color.fillSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardioText: { flex: 1, minWidth: 0 },
  cardioTitle: { fontFamily: font.sansSemibold, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  cardioSub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2, textAlign: 'left' },

  // Metadata pills — scanned, not read. They had a fill one step off the page and no edge, so on
  // paper they were shapeless smudges, and under gym light they were gone (founder 2026-07-14).
  // A hairline gives them an EDGE without giving them weight: they become objects the eye can
  // count, while staying quieter than everything they sit under.
  /* ── Today's lifts ──────────────────────────────────────────────────────────
     A TABLE, not a list of sentences: the name on the start edge, the figures in a mono column on
     the end edge. Six lifts have to be scannable in one pass — the eye runs down the loads, which
     is the column that carries the engine's decisions. */
  // SANS, not mono: this reads "~45 min" in English but "~45 דק׳" in Hebrew, and JetBrains Mono
  // has no Hebrew glyphs — the law caught it (`monoCarriesNoWords`). A slot that ever holds a
  // translated WORD is a sans slot, however many figures it also carries.
  planMin: { fontFamily: font.sans, fontSize: textScale.xs, color: color.textTertiary, textAlign: 'left' },
  plan: { marginTop: 2 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  planRowLast: { borderBottomWidth: 0 },
  planName: { flex: 1, minWidth: 0, fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textPrimary, textAlign: 'left' },
  planFigure: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textSecondary, textAlign: 'right' },
  /* The section holds its height while the loads are read — a list that pops in under a name the
     athlete is already reading is worse than one that arrives a beat later. */
  planLoading: { height: 168 },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  doneText: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textSecondary, textAlign: 'left' },


  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  // a sentence, in the speaking voice (never the measuring one)
  restNext: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },

  // the week's seal
  restSeal: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: color.up,
    backgroundColor: color.upWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  restSealSlot: { height: 72 }, // reserve the seal's box so the copy never jumps in

  meterWrap: { marginTop: 28 },
  error: { marginTop: 16 },
  cta: { marginTop: 24, gap: 14 },
  // the run — a link under the act, not a rival to it
  cardioLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 6 },
  cardioLinkText: { fontFamily: font.sansMedium, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },

  hub: { marginTop: 34 },
  hubLegend: { marginBottom: 4 },

  // ── the week card ──
  // A card sits on the page with a HAIRLINE, not a shadow (the design's law). It is the only
  // card on Home, which is the point: the section that was "swallowed" is now the one object
  // on the page with a frame around it.
  weekCard: {
    marginTop: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  weekPressed: { opacity: 0.62 },
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weekTitle: { flex: 1, fontFamily: font.sansSemibold, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  weekCount: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textMuted, textAlign: 'right' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.fillSubtle,
  },
  // Done = sage, and sage only. Queued = the ochre index. Never both, never swapped.
  chipDone: { backgroundColor: color.upWash, borderColor: color.up },
  // "You are here." A selection lifts — it does not tint. (Was an ochre rule on an ochre wash.)
  chipCurrent: { borderColor: color.textPrimary, backgroundColor: color.lift },
  chipText: { flexShrink: 1, fontFamily: font.sansMedium, fontSize: textScale.xs, color: color.textSecondary, textAlign: 'left' },
  chipTextDone: { color: color.textPrimary },
  currentDotSm: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.textPrimary },

  /* THE DECISION, RAISED. It is the first thing on the page and the reason the product exists, so
     it sits ON the ground rather than in it — READOUT's own grammar, spent on the news. */
  brief: {
    marginTop: 4,
    marginBottom: 18,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  briefActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 },
  /* An OUTLINE, never a fill: it reverses the sentence above it and must not out-shout it. */
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.borderControl,
    backgroundColor: color.lift,
  },
  undoBtnPressed: { backgroundColor: color.fillSubtle },
  undoText: { flexShrink: 1, fontFamily: font.sansMedium, fontSize: textScale.sm, color: color.textPrimary, textAlign: 'left' },
  // The FACT, before the sentence: how many lifts changed this week (or that none did).
  briefCountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  briefCount: { fontFamily: font.sansSemibold, fontSize: textScale.sm, color: color.textPrimary, textAlign: 'left' },
  // Hush SPEAKING — the sans voice, never the measuring one, and at reading size: this is the
  // sentence the whole product is judged by.
  briefText: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 21, color: color.textSecondary, textAlign: 'left' },
  briefLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  briefLink: { fontFamily: font.sansSemibold, fontSize: textScale.sm, color: color.accentText, textAlign: 'left' },
  briefNew: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.full, backgroundColor: color.fillSubtle },
  briefNewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.textPrimary },
  briefNewText: { fontFamily: font.sansSemibold, fontSize: 10, letterSpacing: 0.6, color: color.accentText, textAlign: 'left' },
});
