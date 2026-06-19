/**
 * Quarterly Progress report (founder, replaces the Portrait 3-month retrospective).
 * For each exercise trained in ≥9 of the last 12 weeks, it shows the initial peak
 * weight → the best weight reached since, with a ▲ and the gain. Peak-based, so a
 * recent dip never hides real progress. Monochrome; read-only.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BackBar } from '@/components/BackBar';
import { ProgressArrow } from '@/components/ProgressArrow';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { quarterlyPeakProgress, type QuarterlyProgressEntry } from '@/domain/progressReport';
import type { Session } from '@/data/local/models';
import { color, space, heroTitle, tnum, s } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'QuarterlyReport'>;

export function QuarterlyReport({ navigation }: Props) {
  const { t } = useCopy();
  const units = useApp().profile?.units ?? 'kg';
  const [sessions, setSessions] = useState<Session[] | null>(null);

  useEffect(() => {
    db.loadHistory().then(setSessions);
  }, []);

  const entries = useMemo<QuarterlyProgressEntry[]>(
    () => (sessions ? quarterlyPeakProgress(sessions, Date.now()) : []),
    [sessions],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <BackBar onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.header} accessibilityRole="header">{t('report.title')}</Text>
        <Text style={styles.sub}>{t('report.subtitle')}</Text>

        {sessions != null && entries.length === 0 ? (
          <Text style={styles.empty}>{t('report.empty')}</Text>
        ) : (
          entries.map((e) => {
            const from = displayWeight(e.initialPeakKg, units);
            const to = displayWeight(e.periodPeakKg, units);
            const delta = displayWeight(e.deltaKg, units);
            const up = e.deltaKg > 0;
            return (
              <View key={e.exerciseId} style={styles.row}>
                <Text style={styles.name}>{exerciseDisplayName(e.exerciseId)}</Text>
                <View style={styles.values}>
                  {/* Start in gray, peak in white — the comparison the founder asked for. */}
                  <Text style={styles.fromText}>{from} {unitLabel(units)}</Text>
                  <Text style={styles.arrow}>→</Text>
                  <Text style={styles.toText}>{to} {unitLabel(units)}</Text>
                  {up ? (
                    <View style={styles.delta}>
                      <ProgressArrow direction="up" size={s(14)} />
                      <Text style={styles.deltaText}>{delta}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { paddingTop: 8, paddingHorizontal: space.gutter, paddingBottom: 40 },
  header: { ...heroTitle(s(28)), color: color.textPrimary, fontSize: s(28), fontWeight: '700' },
  sub: { fontSize: s(13), color: color.textSecondary, marginTop: s(6) },
  empty: { fontSize: s(14), color: color.textSecondary, marginTop: s(40), textAlign: 'center' },
  row: { paddingVertical: s(16), borderBottomWidth: 0.5, borderBottomColor: color.border },
  name: { fontSize: s(17), fontWeight: '600', color: color.textPrimary },
  values: { flexDirection: 'row', alignItems: 'center', marginTop: s(8), gap: s(8) },
  // Initial peak — gray, the "then".
  fromText: { ...tnum, fontSize: s(20), fontWeight: '600', color: color.textSecondary },
  arrow: { fontSize: s(16), color: color.textTertiary },
  // In-period peak — white + bold, the "now".
  toText: { ...tnum, fontSize: s(24), fontWeight: '700', color: color.textPrimary },
  delta: { flexDirection: 'row', alignItems: 'center', gap: s(3), marginLeft: 'auto' },
  deltaText: { ...tnum, fontSize: s(14), fontWeight: '700', color: color.textPrimary },
});
