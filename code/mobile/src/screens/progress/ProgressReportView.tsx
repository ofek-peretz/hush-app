/**
 * ProgressReportView — shared presentational report, 1:1 from the design
 * `ui_kits/app/Progress.jsx`. For each lift: the initial peak vs the best peak
 * reached since, the gain (LoadDelta), and a quiet gauge with the initial peak as
 * a reference mark. A header sums the total strength added.
 *
 * Used by BOTH surfaces: the always-on **Progress** screen (all-time window) and
 * the periodic **QuarterlyReport** (12-week window). They differ only in `legend`
 * and which entries they pass.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Legend, Badge, ProgressMeter, LoadDelta } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import type { QuarterlyProgressEntry } from '@/domain/progressReport';
import type { Units } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, press } from '@/design/tokens';

interface Props {
  title: string;
  legend: string; // e.g. "All time" / "Last 12 weeks"
  entries: QuarterlyProgressEntry[];
  loaded: boolean; // false while history is still loading (suppresses the empty state)
  units: Units;
  onBack: () => void;
}

export function ProgressReportView({ title, legend, entries, loaded, units, onBack }: Props) {
  const { t } = useCopy();
  const totalGainKg = entries.reduce((a, e) => a + Math.max(0, e.deltaKg), 0);
  const totalGain = displayWeight(Math.round(totalGainKg * 10) / 10, units) ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* header — back chevron + legend + title */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.back, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Icon name="chevronLeft" size={24} color={color.textPrimary} strokeWidth={2} />
        </Pressable>
        <View style={styles.headTitles}>
          <Legend>{legend}</Legend>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loaded && entries.length === 0 ? (
          <Text style={styles.empty}>{t('report.empty')}</Text>
        ) : (
          <>
            {/* total strength added */}
            <View style={styles.totalBlock}>
              <Legend>{t('report.totalAdded')}</Legend>
              <View style={styles.totalRow}>
                <Text style={styles.totalValue}>+{totalGain}</Text>
                <Text style={styles.totalUnit}>{unitLabel(units)}</Text>
                <View style={styles.totalBadge}>
                  <Badge tone="up">{t('report.acrossLifts', { count: entries.length })}</Badge>
                </View>
              </View>
            </View>

            {/* per-lift rows */}
            <View style={styles.lifts}>
              {entries.map((e) => {
                const initial = displayWeight(e.initialPeakKg, units) ?? 0;
                const best = displayWeight(e.periodPeakKg, units) ?? 0;
                const deltaDisp = displayWeight(e.deltaKg, units) ?? 0;
                const ceiling = Math.round(best * 1.08) || best + 1;
                return (
                  <View key={e.exerciseId} style={styles.lift}>
                    <View style={styles.liftHead}>
                      <Text style={styles.liftName}>{exerciseDisplayName(e.exerciseId)}</Text>
                      <View style={styles.liftRight}>
                        <Text style={styles.liftBest}>
                          {best}
                          <Text style={styles.liftBestUnit}> {unitLabel(units)}</Text>
                        </Text>
                        <LoadDelta value={deltaDisp} unit={unitLabel(units)} size="sm" />
                      </View>
                    </View>
                    <ProgressMeter value={best} max={ceiling} mark={initial} tone="up" />
                    <View style={styles.liftFoot}>
                      <Text style={styles.footText}>{t('report.initialPeak', { value: initial, unit: unitLabel(units) })}</Text>
                      <Text style={[styles.footText, styles.footNow]}>{t('report.best', { value: best, unit: unitLabel(units) })}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 12, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headTitles: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 1 },

  body: { paddingHorizontal: space.gutter, paddingBottom: 40 },
  empty: { fontFamily: font.sans, fontSize: textScale.base, color: color.textSecondary, marginTop: 48, textAlign: 'center' },

  totalBlock: { paddingTop: 4, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: color.border },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 },
  totalValue: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['4xl'], letterSpacing: trackingPx(textScale['4xl'], tracking.display), color: color.textPrimary },
  totalUnit: { fontFamily: font.mono, fontSize: textScale.lg, color: color.textMuted },
  totalBadge: { marginStart: 'auto', alignSelf: 'center' },

  lifts: { marginTop: 18, gap: 18 },
  lift: {},
  liftHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  liftName: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textPrimary, flexShrink: 1 },
  liftRight: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  liftBest: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.md, color: color.textPrimary },
  liftBestUnit: { fontFamily: font.mono, fontSize: textScale['2xs'], color: color.textMuted },
  liftFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  footText: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale['2xs'], color: color.textTertiary },
  footNow: { color: color.up },
});
