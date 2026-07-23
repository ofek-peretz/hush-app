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
import { Icon } from '@/components/Icon';
import { Legend, Display, Body, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import type { Line } from '@/domain/voice';
import { displayWeight, unitLabel } from '@/domain/schedule';
import * as haptics from '@/platform/haptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, space, font, textScale, radius } from '@/design/tokens';

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
 * its load struck in moss (v7 2.1): "changed loads sit in moss."
 */
export interface HomePlanLift {
  exerciseId: string;
  name: string;
  /** kg; null = bodyweight (the row then says the reps carry the work, not a weight). */
  load: number | null;
  sets: number;
  /**
   * HER BAND — `[Tlo, Thi]`, not a single number. The prescription IS the band (register S-6):
   * land in it, and clearing the top earns weight. Printing `recommendedReps` alone printed Tlo,
   * the FLOOR, dressed as the whole target.
   */
  band: [number, number];
  /** The engine raised / lowered / swapped this lift's load this week — it stands in moss. */
  changed?: boolean;
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
  onCardio: () => void; // Open training (run / walk) — recorded, not coached; a tab now
  /** Workouts left in the free trial — one quiet line under the act; absent once the trial is over
   *  or the athlete is a member. */
  trialLeft?: number | null;
  /** Open the account surface (the You tab) — the avatar opposite the wordmark. */
  onAccount?: () => void;

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
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* brand + account — the range-mark and "hush" in the coach's serif, the avatar opposite */}
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <RangeMark />
            <Text style={styles.wordmark}>hush</Text>
          </View>
          {props.onAccount ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('nav.you')}
              hitSlop={8}
              onPress={props.onAccount}
              style={({ pressed }) => [styles.avatar, pressed && styles.pressedDim]}
            >
              <Text style={styles.avatarText}>{(props.name?.trim()?.[0] ?? '·').toUpperCase()}</Text>
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

              {/* On a recovery day, a run IS the act — so here it keeps its card. */}
              <View style={styles.openTraining}>
                <Legend style={styles.hubLegend}>{t('home.openTraining')}</Legend>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('cardio.title')}
                  onPress={props.onCardio}
                  style={({ pressed }) => [styles.cardioCard, pressed && styles.cardioCardPressed]}
                >
                  <View style={styles.cardioIconBox}>
                    <Icon name="runner" size={20} color={color.textSecondary} strokeWidth={2} />
                  </View>
                  <View style={styles.cardioText}>
                    <Text style={styles.cardioTitle}>{t('cardio.title')}</Text>
                    <Text style={styles.cardioSub}>{t('cardio.recordedNotCoached')}</Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.block}>
              {/* UP NEXT — a quiet eyebrow, never a day. The engine has no calendar (register L7). */}
              <Legend>{t('home.nextWorkout')}</Legend>

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
                    <Text style={styles.changePillText}>
                      {t('home.briefChanges', { count: props.briefCount }).toUpperCase()}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* The shape of the session, one line. SANS (not mono): it holds translated words
                  ("LIFTS", "MIN"), and mono has no Hebrew glyphs (law monoCarriesNoWords). */}
              {liftCount ? (
                <Text style={styles.shapeLine}>
                  {t('home.planShape', { lifts: liftCount, min: props.planMinutes || 0 }).toUpperCase()}
                </Text>
              ) : null}

              {/* TODAY'S LIFTS — a table the eye scans down. Each row: form-clip glyph + name on the
                  start edge, the load in a mono column on the end edge (moss if the engine changed it). */}
              {props.plan?.length ? (
                <View style={styles.plan}>
                  {props.plan.map((lift, i) => (
                    <Pressable
                      key={`${lift.exerciseId}_${i}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${lift.name} · ${planFigureLabel(lift, props.units)}`}
                      accessibilityHint={t('workout.form')}
                      onPress={() => props.onForm(lift.exerciseId)}
                      style={({ pressed }) => [styles.planRow, pressed && styles.pressedDim]}
                    >
                      <View style={styles.planLeft}>
                        <Icon name="playCircle" size={15} color={color.textMuted} strokeWidth={1.5} />
                        <Text style={styles.planName} numberOfLines={1}>{bidi(lift.name)}</Text>
                      </View>
                      <Text style={styles.planFigure} numberOfLines={1}>
                        <Text style={lift.changed ? styles.figureChanged : styles.figureLoad}>
                          {figureLoad(lift, props.units)}
                        </Text>
                        <Text style={styles.figureScheme}>{figureScheme(lift)}</Text>
                      </Text>
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
                  (standing in the light); a done one wears the moss check; the rest rest in shadow.
                  One act: a tap selects, and the plan above repaints. A done workout can be read but
                  not started again; an interrupted session freezes the row (the CTA disagrees). */}
              {props.workouts.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                  accessibilityLabel={t('home.weekChips')}
                >
                  {props.workouts.map((w) => {
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
                          isDone && styles.chipDone,
                          current && styles.chipCurrent,
                          pressed && styles.pressedDim,
                        ]}
                      >
                        {isDone ? <Icon name="check" size={13} color={color.up} strokeWidth={2.6} /> : null}
                        <Text
                          style={[
                            styles.chipText,
                            isDone && styles.chipTextDone,
                            current && styles.chipTextCurrent,
                          ]}
                          numberOfLines={1}
                        >
                          {bidi(w.name)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

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
                    leading={<Icon name="play" size={18} color={color.onAccent} />}
                  />
                ) : null}

                {/* the trial — one quiet mono line under the act, gone when the trial is */}
                {props.trialLeft != null && props.trialLeft > 0 && !props.dayDone ? (
                  <Text style={styles.trialLine}>{t('home.trialLeft', { count: props.trialLeft }).toUpperCase()}</Text>
                ) : null}
              </View>
            </View>
          )}
        </ScrollView>
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

/** The load, formatted for display — "80", "" for bodyweight. */
function figureLoad(lift: HomePlanLift, units: 'kg' | 'lb'): string {
  if (lift.load == null) return '';
  const w = displayWeight(lift.load, units);
  return w == null ? '' : `${+w.toFixed(2)} ${unitLabel(units)}`;
}

/** The scheme, with an EN-dash range: " · 4 × 8–10" (a leading separator when a load precedes it). */
function figureScheme(lift: HomePlanLift): string {
  const [lo, hi] = lift.band;
  const scheme = `${lift.sets} × ${hi > lo ? `${lo}–${hi}` : lo}`;
  return lift.load == null ? scheme : ` · ${scheme}`;
}

/** The whole right-hand figure, for accessibility labels. */
function planFigureLabel(lift: HomePlanLift, units: 'kg' | 'lb'): string {
  const load = figureLoad(lift, units);
  return load ? `${load}${figureScheme(lift)}` : figureScheme(lift);
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
    paddingHorizontal: space.gutter,
    paddingTop: 8,
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
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.fillSubtleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: font.sansSemibold, fontSize: 14, color: color.textPrimary, textAlign: 'center' },

  scroll: { paddingHorizontal: space.gutter, paddingTop: 22, paddingBottom: 32 },
  block: { gap: 13 },
  pressedDim: { opacity: 0.62 },

  // ── the title row ──
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontFamily: font.serif, fontSize: 54, lineHeight: 56, color: color.textPrimary, textAlign: 'left' },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: radius.full,
    backgroundColor: color.accentWash,
  },
  changePillText: { fontFamily: font.sansSemibold, fontSize: 11.5, letterSpacing: 0.6, color: color.accent, textAlign: 'left' },
  changeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },

  // the shape line — SANS, holds translated words
  shapeLine: { fontFamily: font.sansMedium, fontSize: textScale.xs, letterSpacing: 0.5, color: color.textSecondary, textAlign: 'left' },

  // ── the plan table ──
  plan: { marginTop: 2 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    paddingVertical: 10.5,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  planLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  planName: { flex: 1, minWidth: 0, fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textPrimary, textAlign: 'left' },
  planFigure: { flex: 0, fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 13.5, textAlign: 'right' },
  figureLoad: { color: color.textSecondary, fontFamily: font.monoMedium }, // rtl-ok: nested span, inherits end-alignment from planFigure
  figureChanged: { color: color.accent, fontFamily: font.monoMedium }, // rtl-ok: nested span, inherits end-alignment from planFigure
  figureScheme: { color: color.textMuted, fontFamily: font.mono }, // rtl-ok: nested span, inherits end-alignment from planFigure
  planLoading: { height: 168 },
  // S-3 — a quiet note, not an alarm. Sans (it carries words), secondary ink, sits under the plan.
  overBudgetNote: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 20, color: color.textSecondary, textAlign: 'left', marginTop: 10 },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  doneText: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textSecondary, textAlign: 'left' },

  // ── the chooser (horizontal chips) ──
  chips: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, paddingEnd: space.gutter },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  // queued = cream, standing in the light (paper pill, dark ink)
  chipCurrent: { backgroundColor: color.paper, borderColor: color.paper },
  // done = moss
  chipDone: { backgroundColor: color.upWash, borderColor: color.up },
  chipText: { flexShrink: 1, fontFamily: font.sansMedium, fontSize: textScale.xs, color: color.textSecondary, textAlign: 'left' },
  chipTextDone: { color: color.textPrimary },
  chipTextCurrent: { fontFamily: font.sansSemibold, color: color.onPaper }, // rtl-ok: merged onto chipText, which sets textAlign

  // ── the act ──
  error: { marginTop: 4 },
  cta: { marginTop: 10, gap: 12 },
  // SANS, not mono: it holds translated words ("workouts left in your trial"), and mono carries no
  // Hebrew glyphs (law monoCarriesNoWords).
  trialLine: { fontFamily: font.sansMedium, fontSize: 10.5, letterSpacing: 1, color: color.textMuted, textAlign: 'center' },

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
  stripLabel: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 9, letterSpacing: 0.4, color: color.textMuted, textAlign: 'center' },
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
  nextLabel: { fontFamily: font.sansMedium, fontSize: 11, letterSpacing: 0.8, color: color.textMuted }, // rtl-ok: nested span, inherits textAlign from nextRow
  nextName: { fontFamily: font.sansSemibold, fontSize: 13, color: color.textPrimary }, // rtl-ok: nested span, inherits textAlign from nextRow

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, alignSelf: 'stretch' },
  restNext: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  openTraining: { marginTop: 30, alignSelf: 'stretch' },
  hubLegend: { marginBottom: 8 },
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
});
