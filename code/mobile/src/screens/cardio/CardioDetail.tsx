/**
 * CardioDetail — read-only record of one recorded run/walk, opened from the
 * unified History timeline. Shows the activity's own details (distance, duration,
 * pace, heart rate, calories, per-km splits). Records without interpreting: Hush
 * never grades a run and never attaches a coaching or engine decision to it.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { fmtClock, fmtPace } from '@/platform/cardio/cardioTracker';
import { color, space, font, textScale, radius, tracking, trackingPx, press, signal } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'CardioDetail'>;

export function CardioDetail({ navigation, route }: Props) {
  const { t } = useCopy();
  const a = route.params.activity;
  const dateLabel = new Date(a.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const fastest = a.splits.length ? Math.min(...a.splits.map((s) => s.paceSec)) : 0;
  const slowest = a.splits.length ? Math.max(...a.splits.map((s) => s.paceSec)) : 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.back, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Icon name="chevronLeft" size={24} color={color.textPrimary} strokeWidth={2} />
        </Pressable>
        <View style={styles.headTitles}>
          <Legend>{`${dateLabel} · ${t('cardio.readOnlyRecord')}`}</Legend>
          <Text style={styles.title} accessibilityRole="header">
            {a.gait === 'run' ? t('cardio.run') : t('cardio.walk')}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* hero distance */}
        <View style={styles.heroRow}>
          <Text style={styles.heroNum}>{a.distanceKm.toFixed(2)}</Text>
          <Text style={styles.heroUnit}>{t('cardio.km')}</Text>
        </View>

        {/* core metrics */}
        <View style={styles.metrics}>
          <Stat value={fmtClock(a.durationSec)} label={t('cardio.duration')} />
          <Stat value={fmtPace(a.avgPaceSec)} unit={t('cardio.perKm')} label={t('cardio.avgPace')} />
          {a.avgHr ? <Stat value={a.avgHr} unit={t('cardio.bpm')} label={t('cardio.avgHeart')} /> : null}
          {a.calories ? <Stat value={a.calories} unit={t('cardio.kcal')} label={t('cardio.calories')} /> : null}
        </View>

        {/* splits */}
        {a.splits.length > 0 ? (
          <View style={styles.splitsWrap}>
            <Legend style={styles.splitsLegend}>{t('cardio.splitsPerKm')}</Legend>
            <View style={styles.splitsList}>
              {a.splits.map((s) => {
                const frac = slowest > fastest ? (s.paceSec - fastest) / (slowest - fastest) : 0;
                const w = 30 + (1 - frac) * 70;
                const isFast = s.paceSec <= fastest;
                return (
                  <View key={s.km} style={styles.splitRow}>
                    <Text style={styles.splitKm}>{s.km}</Text>
                    <View style={styles.splitTrack}>
                      <View style={[styles.splitFill, { width: `${w}%`, backgroundColor: isFast ? signal[0] : color.fillSubtleStrong }]} />
                      {s.gait === 'walk' ? <Text style={styles.splitWalkTag}>{t('cardio.walkTag')}</Text> : null}
                    </View>
                    <Text style={[styles.splitPace, isFast && { color: color.accentText, fontFamily: font.monoSemibold }]}>{fmtPace(s.paceSec)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* honest close — Hush does not grade a run */}
        <View style={styles.note}>
          <Icon name="lock" size={15} color={color.textMuted} strokeWidth={2} />
          <Text style={styles.noteText}>{t('cardio.savedNote')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, unit, label }: { value: string | number; unit?: string; label: string }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statRow}>
        <Text style={styles.statVal}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <Legend>{label}</Legend>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 12, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headTitles: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 1 },
  scroll: { paddingHorizontal: space.gutter, paddingBottom: 40 },

  heroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginTop: 12 },
  // lineHeight ≥ fontSize (+ includeFontPadding:false) or RN clips the tall mono digit tops.
  heroNum: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.data, lineHeight: Math.round(textScale.data * 1.06), includeFontPadding: false, letterSpacing: -3, color: color.textPrimary },
  heroUnit: { fontFamily: font.monoMedium, fontSize: textScale.xl, color: color.textMuted, marginLeft: 6, marginBottom: 8 },

  metrics: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18, marginTop: 24, paddingTop: 22, borderTopWidth: 1, borderTopColor: color.border },
  stat: { width: '50%', gap: 4 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  statVal: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.xl, letterSpacing: -0.6, color: color.textPrimary },
  statUnit: { fontFamily: font.sansMedium, fontSize: 12, color: color.textMuted },

  splitsWrap: { marginTop: 28 },
  splitsLegend: { marginBottom: 14 },
  splitsList: { gap: 9 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  splitKm: { width: 16, fontFamily: font.mono, fontSize: textScale.sm, color: color.textMuted },
  splitTrack: { flex: 1, height: 22, backgroundColor: color.fillSubtle, borderRadius: 4, overflow: 'hidden', justifyContent: 'center' },
  splitFill: { height: '100%', borderRadius: 4 },
  splitWalkTag: { position: 'absolute', right: 8, fontFamily: font.sansMedium, fontSize: 9, letterSpacing: trackingPx(9, tracking.legend), color: color.textMuted, textTransform: 'uppercase' },
  splitPace: { width: 52, textAlign: 'right', fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textPrimary },

  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 26, paddingTop: 16, borderTopWidth: 1, borderTopColor: color.border },
  noteText: { flex: 1, fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary, lineHeight: 20 },
});
