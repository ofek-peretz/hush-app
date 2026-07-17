/**
 * HomeView — the center of gravity, rebuilt 1:1 to the Claude Design "Design
 * System" Home (ui_kits/app/Home.jsx).
 *
 * Hub-and-spoke, no tab bar. A scrolling hub that answers one question on open —
 * what do I do next? — and offers the one affordance to begin:
 *   brand (hush·) + settings · Legend(NEXT WORKOUT) · workout name · muscle
 *   groups · one quiet meta line (exercises · loads set) · week ProgressMeter ·
 *   Begin {name} · Cardio · THE WEEK CARD (the chooser) · hub rows (History / Progress).
 * Rest state centers "Recovery." with the completed-week meter, one quiet fact —
 * when the next week opens — and Open training, which on a recovery day IS the
 * day's act.
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
 * gone. The CHIPS are now the chooser:
 *
 *   · tap a chip            → that workout is the one queued; the Begin button renames itself to it.
 *   · tap the queued chip   → its plan opens (swap · pin · reorder · the form clip).
 *
 * So choosing never leaves Home, and the editor is one further tap from the thing you just chose.
 * The week's state — what is done, what is left, how many of how many — was always on this card;
 * it never needed a screen of its own.
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
  exerciseCount?: number; // next workout's exercise count (meta line)
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
  onWeeklyUpdate: () => void;
  /** Open ONE workout's plan (swap · pin · reorder · form clip) — the second tap on the queued chip. */
  onOpenWorkout: (id: string) => void;
  onHistory: () => void;
  onSettings: () => void;
  onProgress?: () => void;
  onCardio: () => void; // Open training (run / walk) — recorded, not coached
}

export function HomeView(props: HomeViewProps) {
  const { t } = useCopy();
  const reduced = useReducedMotion();

  const total = props.workouts.length || 0;
  const done = Math.min(props.trainedThisWeek, total);
  const groups = props.muscles ? props.muscles.split(' · ').filter(Boolean) : [];

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
          {/* Founder 2026-07-10: the greeting line above NEXT WORKOUT said nothing the
              legend + workout name don't — cut. The workout is the star. */}
          <View style={styles.legendTop}>
            <Legend>{props.resting ? t('home.recovery') : t('home.nextWorkout')}</Legend>
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
              <Display>{props.dayName ?? ''}</Display>
              {/* The muscle groups are METADATA, not a sentence — pills, so the eye takes
                  them in one pass instead of parsing a run of interpuncts (founder 2026-07-12). */}
              {groups.length ? (
                <View style={styles.groups}>
                  {groups.map((g, i) => (
                    <View key={`${g}-${i}`} style={styles.pill}>
                      <Text style={styles.pillText}>{g}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* one quiet meta line — what's ahead + the product promise, together */}
              <View style={styles.metaRow}>
                <Icon name="checkCircle" size={15} color={color.up} strokeWidth={2} />
                <Text style={styles.metaMono}>
                  {props.exerciseCount
                    ? `${t('home.exerciseCount', { n: props.exerciseCount })} · ${t('home.loadsSet')}`
                    : t('home.loadsSet')}
                </Text>
              </View>

              {/* DONE IS SAGE, EVERYWHERE (founder 2026-07-13: "anything to do with something
                  that was completed should be our green"). This meter measures workouts TRAINED;
                  it was ochre, which is the instrument's "you are here" mark, not its "this is
                  finished" mark. The two must never be the same colour. */}
              <View style={styles.meterWrap}>
                <ProgressMeter
                  label={t('home.weekLabel', { n: props.weekNumber })}
                  valueLabel={`${done} / ${total}`}
                  value={done}
                  max={total || 1}
                  tone="up"
                />
              </View>

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
                ) : props.dayName ? (
                  /* THE BUTTON DOES NOT REPEAT THE NAME (founder 2026-07-14). The screen said
                     "Upper B" three times — the Display, the button, the chip. The workout's name
                     is set 60pt tall directly above this button; there is nothing else it could
                     begin. Two mentions is the floor and the right one: the Display says what you
                     are about to do, the ochre chip says where that sits in the week. Three is a
                     stutter, and a stutter is what a screen does when it doesn't trust itself.
                     (`Continue {name}` keeps its name — it names an INTERRUPTED session, which is
                     not necessarily the workout on the hero, so there the name carries fact.) */
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    label={t('home.beginPlain')}
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
                  gone — everything it held is on this card (founder 2026-07-13). */}
              {/* The count that used to sit here ("1 / 4") is GONE (founder 2026-07-14): the week
                  meter above already states it, and the chips below already SHOW it — a check on
                  what is done, an empty chip on what is left. Three renderings of one fact on one
                  screen. The card keeps the two that earn their place. */}
              <View style={styles.weekHead}>
                <Text style={styles.weekTitle}>{t('home.hubThisWeek')}</Text>
              </View>

              {/* THE CHIPS ARE THE CHOOSER (see the header): one tap queues the workout, a second
                  tap on the queued one opens its plan. A finished workout is a record — it cannot be
                  queued again (founder 2026-07-11) — so its tap goes straight to the plan it was. */}
              {props.workouts.length ? (
                <View style={styles.chips} accessibilityLabel={t('home.weekChips')}>
                  {props.workouts.map((w) => {
                    const isDone = !!w.done;
                    const current = !isDone && (props.dayId != null ? w.id === props.dayId : w.name === props.dayName);
                    // An interrupted workout owns the CTA ("Continue …"), so queueing another one
                    // would light a chip the Begin button does not agree with. While a session is
                    // waiting to be resumed, a chip is a door to the plan and nothing else.
                    const opens = isDone || current || !!props.resumable;
                    return (
                      <Pressable
                        key={w.id}
                        accessibilityRole="button"
                        accessibilityLabel={w.name}
                        accessibilityHint={opens ? t('home.chipOpenHint') : t('home.chipChooseHint')}
                        accessibilityState={{ selected: current }}
                        onPress={() => {
                          if (opens) {
                            props.onOpenWorkout(w.id);
                            return;
                          }
                          haptics.tick(); // the queue changed under the finger — it should be felt
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

              {/* The chips carry two acts now, and an athlete cannot be expected to guess the
                  second. One quiet line, in the smallest voice on the page, says what a tap does —
                  and only while there is actually something to queue (never on a finished week,
                  where every chip is a record and the line would be a lie). */}
              {props.workouts.filter((w) => !w.done).length > 1 && !props.resumable ? (
                <Text style={styles.chipsHint}>{t('home.chipsHint')}</Text>
              ) : null}

              {/* Hush's sentence — what it DID to this plan. The one line that makes this a
                  managed programme rather than a nicely-drawn workout screen. It opens with the
                  COUNT (founder 2026-07-13): how many lifts changed, or that none did — the fact
                  first, the sentence under it, and the WHY one tap away. */}
              {props.brief?.length ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('home.briefOpen')}
                  onPress={props.onWeeklyUpdate}
                  style={({ pressed }) => [styles.brief, pressed && styles.weekPressed]}
                >
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
                  <View style={styles.briefLinkRow}>
                    <Text style={styles.briefLink}>{t('home.briefOpen')}</Text>
                    <Icon name="chevronRight" size={14} color={color.accentText} strokeWidth={2} />
                  </View>
                </Pressable>
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
  legendTop: { paddingTop: 24 },
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
  groups: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 6 },
  pill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.fillSubtle,
  },
  pillText: {
    fontFamily: font.sansMedium,
    fontSize: textScale.xs,
    letterSpacing: 0.2,
    color: color.textSecondary,
    textAlign: 'left',
  },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  metaMono: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
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
  chipsHint: { marginTop: 8, fontFamily: font.sans, fontSize: textScale.xs, color: color.textTertiary, textAlign: 'left' },

  brief: { marginTop: 14, borderTopWidth: 1, borderTopColor: color.border, paddingTop: 12, paddingBottom: 10 },
  // The FACT, before the sentence: how many lifts changed this week (or that none did).
  briefCountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  briefCount: { fontFamily: font.sansSemibold, fontSize: textScale.sm, color: color.textPrimary, textAlign: 'left' },
  // Hush SPEAKING — the sans voice, never the measuring one, and at reading size: this is the
  // sentence the whole product is judged by.
  briefText: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 21, color: color.textSecondary, textAlign: 'left' },
  briefLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  briefLink: { fontFamily: font.sansSemibold, fontSize: textScale.sm, color: color.accentText, textAlign: 'left' },
  briefNew: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.full, backgroundColor: color.fillSubtle },
  briefNewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.textPrimary },
  briefNewText: { fontFamily: font.sansSemibold, fontSize: 10, letterSpacing: 0.6, color: color.accentText, textAlign: 'left' },
});
