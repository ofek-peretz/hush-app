/**
 * Workout Complete (§4.18) — rebuilt 1:1 to the Claude Design "Design System"
 * Complete (ui_kits/app/Complete.jsx). A quiet closing moment on the inverted
 * stage: the session is already SAVED (invariant §8.4); the product confirms and
 * steps back. No confetti, no streaks.
 *
 * "Saved" legend → "{workout} complete." → a calm one-line summary → Duration /
 * Sets / Progressed → Done (→ Home) · View session record (→ History). The
 * success haptic fires once. Stats come from the real session summary.
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Metric, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { wellDone as wellDoneHaptic } from '@/platform/haptics';
import { color, space, stage, font, textScale, tracking, trackingPx, up } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WellDone'>;

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function WellDone({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const summary = route.params?.summary;
  const early = summary?.earlyFinish ?? false;
  const progressed = summary?.progressed ?? 0;

  useEffect(() => {
    wellDoneHaptic();
  }, []);

  function goHome() {
    app.clearPortraitFlag();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }
  function goRecord() {
    app.clearPortraitFlag();
    navigation.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'History' }] });
  }

  const completeWord = early ? t('complete.savedWord') : t('complete.completeWord');
  const body = early
    ? t('complete.bodyEarly')
    : progressed === 0
      ? t('complete.bodyZero')
      : progressed === 1
        ? t('complete.bodyOne')
        : t('complete.body', { count: progressed });

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.body}>
          <View style={styles.savedRow}>
            <Icon name="check" size={22} color={up[0]} strokeWidth={2.4} />
            <Text style={styles.savedLegend}>{t('complete.saved')}</Text>
          </View>

          <Text style={styles.title} accessibilityRole="header">
            {summary?.workoutName ? `${summary.workoutName}\n${completeWord}` : completeWord}
          </Text>

          <Text style={styles.copy}>{body}</Text>

          {summary ? (
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Metric onStage value={fmtDuration(summary.durationMs)} label={t('complete.duration')} size="md" />
              </View>
              <View style={styles.stat}>
                <Metric onStage value={summary.sets} label={t('complete.sets')} size="md" />
              </View>
              <View style={styles.stat}>
                <Metric onStage value={progressed} unit="↑" label={t('complete.progressed')} size="md" />
              </View>
            </View>
          ) : null}
        </View>

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
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  savedLegend: {
    fontFamily: font.sansMedium,
    fontSize: textScale['2xs'],
    letterSpacing: trackingPx(textScale['2xs'], tracking.legend),
    textTransform: 'uppercase',
    color: up[0],
  },
  title: {
    fontFamily: font.sansSemibold,
    fontSize: textScale['4xl'],
    lineHeight: textScale['4xl'],
    letterSpacing: trackingPx(textScale['4xl'], tracking.display),
    color: stage.ink0,
    marginTop: 18,
  },
  copy: {
    fontFamily: font.sans,
    fontSize: textScale.md,
    lineHeight: 24,
    color: stage.ink1,
    marginTop: 16,
    maxWidth: 320,
  },
  stats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 36,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: stage[2],
  },
  stat: { flex: 1 },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 18, gap: 10 },
  ghost: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  ghostPressed: { backgroundColor: stage[1] },
  ghostLabel: { fontFamily: font.sansSemibold, fontSize: textScale.base, color: stage.ink1 },
});
