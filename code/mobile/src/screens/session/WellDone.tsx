/**
 * Workout Complete (§4.18) — rebuilt 1:1 to the Claude Design Complete
 * (ui_kits/app/Complete.jsx). A three-beat closing on the inverted stage:
 *   1) SESSION SAVED · "{workout} complete."
 *   2) Hush READS the session — each lift checks in (the work becomes evidence)
 *   3) LOGGED · "That's the work." — top set, duration/volume/sets, and a calm
 *      pointer to Saturday's update. A single workout never builds next week's
 *      program; that ritual is the weekly update. No confetti, no streaks.
 *
 * The session is already SAVED (invariant §8.4); stats are read from it. The
 * success haptic fires once.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Metric, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { wellDone as wellDoneHaptic } from '@/platform/haptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { useFocusedStatusBar } from '@/platform/statusBar';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { trainingWeekNumber } from '@/domain/weekCadence';
import type { Session, SetLog } from '@/data/local/models';
import { space, stage, font, textScale, tracking, trackingPx, up, radius } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WellDone'>;

const vol = (s: SetLog) => (s.actualWeight ?? 0) * s.actualReps;

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
  const reduced = useReducedMotion();

  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<'saved' | 'result'>(reduced ? 'result' : 'saved');
  const [read, setRead] = useState(0);

  useFocusedStatusBar('light'); // stage screen: light glyphs, restored to dark on blur

  useEffect(() => {
    // Nothing was completed → no success moment, no history read.
    if (notStarted) return;
    let active = true;
    wellDoneHaptic();
    // Never let a storage hiccup leave the result data empty without recovering.
    db.loadHistory()
      .then((h) => active && setSession(h[0] ?? null))
      .catch(() => active && setSession(null));
    return () => {
      active = false;
    };
  }, [notStarted]);

  // Per-lift bests (first-seen order) + the session's top set, from the saved sets.
  const { lifts, topSet, volumeKg, setsCount } = useMemo(() => {
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
      volumeKg: sets.reduce((a, s) => a + vol(s), 0),
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

  // The "reading" checks fill in as the session's lifts resolve (purely cosmetic).
  useEffect(() => {
    if (reduced || lifts.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const STEP = 260;
    const START = 500;
    for (let i = 1; i <= lifts.length; i++) timers.push(setTimeout(() => setRead(i), START + i * STEP));
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

  const setLabel = (s: SetLog) => `${displayWeight(s.actualWeight, units) ?? t('workout.bodyweight')} × ${s.actualReps}`;
  const weekN = trainingWeekNumber(app.profile?.memberSince, Date.now()) + 1;

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
                ? `${summary.workoutName} ${partial ? t('complete.savedWord') : t('complete.completeWord')}`
                : partial ? t('complete.savedWord') : t('complete.completeWord')}
            </Text>

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
          {lifts.length > 0 ? <Text style={styles.tapSkip}>{t('complete.tapSkip').toUpperCase()}</Text> : null}
        </SafeAreaView>
      </View>
    );
  }

  /* ---- Beat 3: the work, logged. Grounded in kg. Points to Saturday. ---- */
  const durationMs = summary?.durationMs ?? 0;
  const volumeDisplay = displayWeight(Math.round(volumeKg), units) ?? 0;
  const body = early ? t('complete.bodyEarly') : t('complete.resultBody', { workout: summary?.workoutName ?? '', lifts: lifts.length });

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.savedRow}>
            <Icon name="checkCheck" size={16} color={up[0]} strokeWidth={2} />
            <Text style={styles.savedLegend}>{t('complete.logged')}</Text>
          </View>
          <Text style={styles.resultTitle} accessibilityRole="header">{partial ? t('complete.partialTitle') : t('complete.thatsTheWork')}</Text>
          <Text style={styles.copy}>{body}</Text>

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
            <View style={styles.stat}><Metric onStage value={fmtDuration(durationMs)} label={t('complete.duration')} size="md" /></View>
            <View style={styles.stat}><Metric onStage value={volumeDisplay.toLocaleString()} unit={unitLabel(units)} label={t('complete.volume')} size="md" /></View>
            <View style={styles.stat}><Metric onStage value={setsCount} label={t('complete.sets')} size="md" /></View>
          </View>

          <View style={styles.saturday}>
            <Icon name="calendar" size={16} color={stage.ink1} strokeWidth={2} />
            <Text style={styles.saturdayText}>{t('complete.saturday', { week: t('complete.weekN', { n: weekN }) })}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button variant="onstage" size="lg" block label={t('complete.done')} onPress={goHome} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('complete.viewRecord')}
            onPress={goRecord}
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
  notStartedLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2 },

  // beats 1+2
  savedBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  savedLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: up[0] },
  savedTitle: { fontFamily: font.sansSemibold, fontSize: textScale['3xl'], lineHeight: Math.round(textScale['3xl'] * 1.02), letterSpacing: trackingPx(textScale['3xl'], tracking.display), color: stage.ink0, marginTop: 14 },
  reading: { marginTop: 34 },
  readingHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  readingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: stage.ink1 },
  readingLabel: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink1 },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  readRowBorder: { borderBottomWidth: 1, borderBottomColor: stage[2] },
  readCheck: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: stage[2] },
  readCheckDone: { backgroundColor: up[0], borderColor: up[0] },
  readName: { flex: 1, fontFamily: font.sans, fontSize: textScale.base, color: stage.ink0 },
  readBest: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: stage.ink2 },
  tapSkip: { textAlign: 'center', paddingBottom: 18, fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2 },

  // beat 3
  resultScroll: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16, flexGrow: 1, justifyContent: 'center' },
  resultTitle: { fontFamily: font.sansSemibold, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.tight), lineHeight: Math.round(textScale['2xl'] * 1.05), color: stage.ink0, marginTop: 12 },
  copy: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 23, color: stage.ink1, marginTop: 10, maxWidth: 320 },

  topCard: { marginTop: 22, padding: 16, borderRadius: radius.lg, backgroundColor: stage[1] },
  topLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2, marginBottom: 10 },
  topRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  topName: { flex: 1, fontFamily: font.sansSemibold, fontSize: textScale.md, letterSpacing: trackingPx(textScale.md, tracking.tight), color: stage.ink0 },
  topValue: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.xl, color: stage.ink0 },
  topUnit: { fontFamily: font.mono, fontSize: 12, color: stage.ink2 },
  topTimes: { color: stage.ink2 },

  stats: { flexDirection: 'row', gap: 16, marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: stage[2] },
  stat: { flex: 1 },

  saturday: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: stage[2] },
  saturdayText: { flex: 1, fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink1, lineHeight: 20 },

  footer: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 18, gap: 10, borderTopWidth: 1, borderTopColor: stage[2] },
  ghost: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  ghostPressed: { backgroundColor: stage[1] },
  ghostLabel: { fontFamily: font.sansSemibold, fontSize: textScale.base, color: stage.ink1 },
});
