/**
 * Workout Complete (§4.18) — rebuilt 1:1 to the Claude Design Complete
 * (ui_kits/app/Complete.jsx). A three-beat closing on the inverted stage:
 *   1) SESSION SAVED · "{workout} complete."
 *   2) Hush READS the session — each lift checks in (the work becomes evidence)
 *   3) LOGGED · "That's the work." — top set, duration + estimated calories, and
 *      a calm pointer to Saturday's update (founder 2026-07-10: sets/volume and
 *      the body paragraph removed — the athlete just finished; facts only). A
 *      single workout never builds next week's program; that ritual is the
 *      weekly update. No confetti, no daily-streak pressure.
 *   4) MILESTONE — only when this session crossed one (domain/milestones): the
 *      one licensed loud moment. A beat of black, a heavy stamp haptic, and the
 *      engraved emblem lands. At most ONE per workout (rarity law) — when
 *      several cross, the most personal is celebrated and the rest surface
 *      quietly in the Progress gallery.
 *
 * The session is already SAVED (invariant §8.4); stats are read from it. The
 * success haptic fires once.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Metric, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { wellDone as wellDoneHaptic, tick as tickHaptic } from '@/platform/haptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { useFocusedStatusBar } from '@/platform/statusBar';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { newlyEarned } from '@/domain/milestones';
import { milestoneCopy } from '@/domain/milestoneCopy';
import { strengthSessionKcal } from '@/domain/energy';
import { fmtMinutesFromMs } from '@/domain/duration';
import { milestone as milestoneHaptic } from '@/platform/haptics';
import { MilestoneEmblem } from '@/components/MilestoneEmblem';
import type { Session, SetLog } from '@/data/local/models';
import { space, stage, font, textScale, tracking, trackingPx, up, signal, radius } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WellDone'>;

const vol = (s: SetLog) => (s.actualWeight ?? 0) * s.actualReps;

interface Lift {
  exerciseId: string;
  name: string;
  best: SetLog;
}

export function WellDone({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const summary = route.params?.summary;
  const notStarted = route.params?.notStarted ?? false;
  const early = summary?.earlyFinish ?? false;
  // Partial = ended early but real work was logged; Full = completed every set.
  const partial = !notStarted && early && (summary?.sets ?? 0) > 0;
  // …and a partial that didn't reach half the prescribed sets leaves the workout OPEN for the
  // week (domain/completion). `trained === false` says exactly that.
  const stillOpen = partial && summary?.trained === false;
  const reduced = useReducedMotion();

  const [history, setHistory] = useState<Session[] | null>(null);
  const [phase, setPhase] = useState<'saved' | 'result' | 'milestone'>(reduced ? 'result' : 'saved');
  const [read, setRead] = useState(0);
  const session = history?.[0] ?? null;

  useFocusedStatusBar('light'); // stage screen: light glyphs, restored to dark on blur

  useEffect(() => {
    // Nothing was completed → no success moment, no history read.
    if (notStarted) return;
    let active = true;
    wellDoneHaptic();
    // Never let a storage hiccup leave the result data empty without recovering.
    db.loadHistory()
      .then((h) => active && setHistory(h))
      .catch(() => active && setHistory(null));
    return () => {
      active = false;
    };
  }, [notStarted]);

  // Milestones crossed by THIS session (the latest in history), most personal
  // first. [0] is the single celebrated mark; the rest go quietly to the gallery.
  const celebration = useMemo(() => (history ? newlyEarned(history)[0] ?? null : null), [history]);
  const celebrated = useRef(false);
  const pendingExit = useRef<(() => void) | null>(null);

  // The stamp: a beat of black, the heavy plate-lock haptic, and the emblem lands.
  const stamp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== 'milestone') return;
    if (reduced) {
      stamp.setValue(1);
      milestoneHaptic();
      return;
    }
    stamp.setValue(0);
    const timer = setTimeout(() => {
      milestoneHaptic();
      Animated.spring(stamp, { toValue: 1, damping: 14, stiffness: 220, useNativeDriver: true }).start();
    }, 650);
    return () => clearTimeout(timer);
  }, [phase, reduced, stamp]);

  // Per-lift bests (first-seen order) + the session's top set, from the saved sets.
  const { lifts, topSet, setsCount } = useMemo(() => {
    const sets = session?.sets ?? [];
    const order: string[] = [];
    const bestByEx = new Map<string, SetLog>();
    let top: SetLog | null = null;
    for (const s of sets) {
      if (!bestByEx.has(s.exerciseId)) order.push(s.exerciseId);
      const prev = bestByEx.get(s.exerciseId);
      if (!prev || vol(s) > vol(prev)) bestByEx.set(s.exerciseId, s);
      if (!top || vol(s) > vol(top)) top = s;
    }
    return {
      lifts: order.map((id): Lift => ({ exerciseId: id, name: exerciseDisplayName(id), best: bestByEx.get(id)! })),
      topSet: top,
      setsCount: sets.length,
    };
  }, [session]);

  // Beat 2 → 3: advance to the result on a fixed ceiling, INDEPENDENT of whether
  // the session loads — so a storage failure can never trap the athlete on the
  // (button-less) "saved" beat after a workout. The result beat reads `session`
  // reactively, so it fills in if the data arrives late (or stays a graceful
  // fallback if it never does).
  useEffect(() => {
    if (reduced) return; // reduced-motion starts on 'result' already
    const t = setTimeout(() => setPhase('result'), 3400);
    return () => clearTimeout(t);
  }, [reduced]);

  // The "reading" checks fill in as the session's lifts resolve. Each check that lands
  // taps the wrist (founder 2026-07-12): the copy says HUSH IS READING YOUR SESSION, and a
  // tick per lift is what makes that felt rather than claimed — the machine is chewing
  // through the evidence, and the athlete can feel it doing so with the phone in a pocket.
  useEffect(() => {
    if (reduced || lifts.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const STEP = 260;
    const START = 500;
    for (let i = 1; i <= lifts.length; i++) {
      timers.push(
        setTimeout(() => {
          setRead(i);
          tickHaptic();
        }, START + i * STEP),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [reduced, lifts.length]);

  function skip() {
    setRead(lifts.length);
    setPhase('result');
  }
  function goHome() {
    app.clearPortraitFlag();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }
  function goRecord() {
    app.clearPortraitFlag();
    navigation.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'History' }] });
  }
  /** Any exit from the result passes through the milestone beat exactly once. */
  function leave(exit: () => void) {
    if (celebration && !celebrated.current) {
      celebrated.current = true;
      pendingExit.current = exit;
      setPhase('milestone');
      return;
    }
    exit();
  }

  const setLabel = (s: SetLog) => `${displayWeight(s.actualWeight, units) ?? t('workout.bodyweight')} × ${s.actualReps}`;

  /* ---- Not started (item 3A): nothing was completed — not a workout, nothing saved ---- */
  if (notStarted) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.notStartedBody}>
            <View style={styles.savedRow}>
              <Icon name="minus" size={18} color={stage.ink2} strokeWidth={2.4} />
              <Text style={styles.notStartedLegend}>{t('complete.notStartedLegend')}</Text>
            </View>
            <Text style={styles.savedTitle} accessibilityRole="header">{t('complete.notStartedTitle')}</Text>
            <Text style={styles.copy}>{t('complete.notStartedBody')}</Text>
          </View>
          <View style={styles.footer}>
            <Button variant="onstage" size="lg" block label={t('complete.done')} onPress={goHome} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  /* ---- Beat 4: a milestone landed — the one licensed loud moment ---- */
  if (phase === 'milestone' && celebration) {
    const mc = milestoneCopy(celebration, t, units);
    const dateLabel = new Date(celebration.earnedAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.milestoneBody}>
            <Animated.View
              style={{
                alignItems: 'center',
                opacity: stamp,
                transform: [{ scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }],
              }}
            >
              <Text style={styles.milestoneLegend}>{t('milestones.legend').toUpperCase()}</Text>
              <View style={styles.milestoneEmblem}>
                {/* the one licensed loud moment — the medallion gives off heat here, and
                    nowhere else in the app (founder 2026-07-12) */}
                <MilestoneEmblem size={216} onStage pulse value={mc.value} caption={mc.caption} glyph={mc.glyph} />
              </View>
              <Text style={styles.milestoneTitle} accessibilityRole="header">{mc.title}</Text>
              {mc.sub ? <Text style={styles.milestoneSub}>{mc.sub}</Text> : null}
              <Text style={styles.milestoneDate}>{dateLabel}</Text>
            </Animated.View>
          </View>
          <View style={styles.footer}>
            <Button
              variant="onstage"
              size="lg"
              block
              label={t('milestones.continue')}
              onPress={() => (pendingExit.current ?? goHome)()}
            />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  /* ---- Beats 1+2: saved, then Hush reads the session into evidence ---- */
  if (phase !== 'result') {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <Pressable style={styles.savedBody} onPress={skip} accessibilityRole="button" accessibilityLabel={t('complete.tapSkip')}>
            <View style={styles.savedRow}>
              <Icon name="check" size={18} color={up[0]} strokeWidth={2.4} />
              <Text style={styles.savedLegend}>{t('complete.saved')}</Text>
            </View>
            <Text style={styles.savedTitle} accessibilityRole="header">
              {summary?.workoutName
                ? `${bidi(summary.workoutName)} ${partial ? t('complete.savedWord') : t('complete.completeWord')}`
                : partial ? t('complete.savedWord') : t('complete.completeWord')}
            </Text>
            {/* PARTIAL that did not finish the workout (under half the prescribed sets, founder
                2026-07-11): the work counts — it is logged and the engine folds it — but the
                workout is still on this week's list. Say so plainly; never imply it is gone. */}
            {stillOpen ? <Text style={styles.stillOpen}>{t('complete.stillOpen')}</Text> : null}

            {lifts.length > 0 ? (
              <View style={styles.reading}>
                <View style={styles.readingHead}>
                  <View style={styles.readingDot} />
                  <Text style={styles.readingLabel}>{t('complete.reading', { sets: setsCount }).toUpperCase()}</Text>
                </View>
                {lifts.map((l, i) => {
                  const done = i < read;
                  return (
                    <View key={l.exerciseId} style={[styles.readRow, i < lifts.length - 1 && styles.readRowBorder, { opacity: done ? 1 : 0.32 }]}>
                      <View style={[styles.readCheck, done && styles.readCheckDone]}>
                        {done ? <Icon name="check" size={11} color={stage[0]} strokeWidth={2.6} /> : null}
                      </View>
                      <Text style={styles.readName} numberOfLines={1}>{l.name}</Text>
                      <Text style={styles.readBest}>{setLabel(l.best)}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </Pressable>
          {lifts.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('complete.tapSkip')} onPress={skip} style={styles.tapSkipHit}>
              <Text style={styles.tapSkip}>{t('complete.tapSkip').toUpperCase()}</Text>
            </Pressable>
          ) : null}
        </SafeAreaView>
      </View>
    );
  }

  /* ---- Beat 3: the work, logged. The top set, the time, the cost. ---- */
  const durationMs = summary?.durationMs ?? 0;
  // Honest MET estimate (domain/energy) — absent bodyweight ⇒ no number, never a guess.
  const kcal = strengthSessionKcal(durationMs, app.profile?.weightKg);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.savedRow}>
            <Icon name="checkCheck" size={16} color={up[0]} strokeWidth={2} />
            <Text style={styles.savedLegend}>{t('complete.logged')}</Text>
          </View>
          {/* The big line stands alone (founder 2026-07-12). "I'll account for the shortened
              session in your next recommendation" is a promise the athlete has already been
              given — at the moment they chose to end early, on the confirm sheet, which is the
              only moment it could have changed their mind. Repeating it under the finish line
              turns a closing beat into an explanation. */}
          <Text style={styles.resultTitle} accessibilityRole="header">{partial ? t('complete.partialTitle') : t('complete.thatsTheWork')}</Text>

          {topSet ? (
            <View style={styles.topCard}>
              <Text style={styles.topLegend}>{t('complete.topSet').toUpperCase()}</Text>
              <View style={styles.topRow}>
                <Text style={styles.topName} numberOfLines={1}>{exerciseDisplayName(topSet.exerciseId)}</Text>
                <Text style={styles.topValue}>
                  {displayWeight(topSet.actualWeight, units) ?? t('workout.bodyweight')}
                  {topSet.actualWeight != null ? <Text style={styles.topUnit}> {unitLabel(units)}</Text> : null}
                  <Text style={styles.topTimes}> × </Text>
                  {topSet.actualReps}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Metric onStage value={fmtMinutesFromMs(durationMs, t('common.minShort'))} label={t('complete.duration')} size="md" />
            </View>
            {kcal != null ? (
              <View style={styles.stat}>
                {/* No "≈". The tilde was the one hedging mark in an app that never hedges —
                    the LABEL carries the honesty ("EST. CALORIES") and the figure stays
                    clean (founder 2026-07-12). */}
                <Metric onStage value={kcal} unit={t('complete.kcal')} label={t('complete.caloriesEst')} size="md" />
              </View>
            ) : null}
          </View>

          <View style={styles.saturday}>
            <Icon name="calendar" size={16} color={stage.ink1} strokeWidth={2} />
            <Text style={styles.saturdayText}>{t('complete.saturday')}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button variant="onstage" size="lg" block label={t('complete.done')} onPress={() => leave(goHome)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('complete.viewRecord')}
            onPress={() => leave(goRecord)}
            style={({ pressed }) => [styles.ghost, pressed && styles.ghostPressed]}
          >
            <Text style={styles.ghostLabel}>{t('complete.viewRecord')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: stage[0] },
  safe: { flex: 1 },

  // not started
  notStartedBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  notStartedLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2, textAlign: 'left' },

  // beats 1+2
  savedBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  savedLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: up[0], textAlign: 'left' },
  savedTitle: { fontFamily: font.sansSemibold, fontSize: textScale['3xl'], lineHeight: Math.round(textScale['3xl'] * 1.02), letterSpacing: trackingPx(textScale['3xl'], tracking.display), color: stage.ink0, marginTop: 14, textAlign: 'left' },
  stillOpen: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 20, color: stage.ink2, marginTop: 10, textAlign: 'left' },
  reading: { marginTop: 34 },
  readingHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  readingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: stage.ink1 },
  readingLabel: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink1, textAlign: 'left' },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  readRowBorder: { borderBottomWidth: 1, borderBottomColor: stage[2] },
  readCheck: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: stage[2] },
  readCheckDone: { backgroundColor: up[0], borderColor: up[0] },
  readName: { flex: 1, fontFamily: font.sans, fontSize: textScale.base, color: stage.ink0, textAlign: 'left' },
  readBest: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: stage.ink2, textAlign: 'left' },
  // The hint itself is a target too — the whole body Pressable skips, but the label
  // must honor its own promise (44pt).
  tapSkipHit: { minHeight: 44, justifyContent: 'center', paddingBottom: 10 },
  tapSkip: { textAlign: 'center', fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2 },

  // beat 3
  resultScroll: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16, flexGrow: 1, justifyContent: 'center' },
  resultTitle: { fontFamily: font.sansSemibold, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.tight), lineHeight: Math.round(textScale['2xl'] * 1.05), color: stage.ink0, marginTop: 12, textAlign: 'left' },
  copy: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 23, color: stage.ink1, marginTop: 10, maxWidth: 320, textAlign: 'left' },

  topCard: { marginTop: 22, padding: 16, borderRadius: radius.lg, backgroundColor: stage[1] },
  topLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2, marginBottom: 10, textAlign: 'left' },
  topRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  topName: { flex: 1, fontFamily: font.sansSemibold, fontSize: textScale.md, letterSpacing: trackingPx(textScale.md, tracking.tight), color: stage.ink0, textAlign: 'left' },
  topValue: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.xl, color: stage.ink0, textAlign: 'left' },
  topUnit: { fontFamily: font.mono, fontSize: 12, color: stage.ink2, textAlign: 'left' },
  topTimes: { color: stage.ink2 },

  stats: { flexDirection: 'row', gap: 16, marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: stage[2] },
  stat: { flex: 1 },

  saturday: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: stage[2] },
  saturdayText: { flex: 1, fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink1, lineHeight: 20, textAlign: 'left' },

  // beat 4 — the milestone stamp
  milestoneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  milestoneLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: signal[0], textAlign: 'left' },
  milestoneEmblem: { marginTop: 36, marginBottom: 36 },
  milestoneTitle: { fontFamily: font.sansSemibold, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.tight), lineHeight: Math.round(textScale['2xl'] * 1.08), color: stage.ink0, textAlign: 'center' },
  milestoneSub: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22, color: stage.ink1, textAlign: 'center', marginTop: 10, maxWidth: 300 },
  milestoneDate: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: stage.ink2, marginTop: 18, textAlign: 'left' },

  footer: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 18, gap: 10, borderTopWidth: 1, borderTopColor: stage[2] },
  ghost: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  ghostPressed: { backgroundColor: stage[1] },
  ghostLabel: { fontFamily: font.sansSemibold, fontSize: textScale.base, color: stage.ink1, textAlign: 'left' },
});
