/**
 * Program · This week — rebuilt 1:1 to the Claude Design "Design System" Program
 * (ui_kits/app/Program.jsx). The week's plan split by status:
 *   header (Week N · freq) → Completed meter → Remaining → Completed.
 * Each row opens the workout (ProgramDetail = the Workout Edit surface, where
 * exercises are inspected / swapped / reordered). Rest is a Home state (weekly
 * model), never a row here.
 *
 * (The design's inline workout sheet is consolidated into the dedicated
 * ProgramDetail screen; "Set as next" lives on Home's "Choose another workout".)
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend, ProgressMeter, ListRow } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { track } from '@/platform/telemetry';
import { weekProgress } from '@/domain/schedule';
import { trainingWeekNumber } from '@/domain/weekCadence';
import type { ProgramDay, Session } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Program'>;

export function Program({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const program = app.program;
  const [history, setHistory] = useState<Session[]>([]);

  useEffect(() => {
    void track('program_viewed', {});
    db.loadHistory().then(setHistory);
  }, []);

  function weekdayFor(day: ProgramDay): string | null {
    const s =
      history.find((h) => h.programDayId === day.id) ??
      history.find((h) => h.programDayName === day.name);
    // Full "Mon 16 Jun" (the design shows the date, not a bare weekday).
    return s
      ? new Date(s.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
      : null;
  }

  const workouts = (program?.days ?? []).filter((d) => !d.isRest);
  // Split label for the eyebrow (the model has no name field): unique base names
  // (drop the trailing " A"/" B"/variant), joined — e.g. "Upper / Lower".
  const splitLabel = workouts
    .map((d) => d.name.replace(/\s+[A-Za-z0-9]$/, '').trim())
    .filter((b, i, arr) => b && arr.indexOf(b) === i)
    .join(' / ');
  const completed = workouts.filter((d) => d.completed);
  const upcoming = workouts.filter((d) => !d.completed);
  const prog = program ? weekProgress(program) : { done: 0, total: 0 };
  const weekNumber = trainingWeekNumber(app.profile?.memberSince, Date.now());

  const openDay = (id: string) => navigation.navigate('ProgramDetail', { dayId: id });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* header */}
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
          <Legend>
            {splitLabel
              ? t('program.weekLegendSplit', { n: weekNumber, split: splitLabel, freq: program?.frequency ?? workouts.length })
              : t('program.weekLegend', { n: weekNumber, freq: program?.frequency ?? workouts.length })}
          </Legend>
          <Text style={styles.title} accessibilityRole="header">{t('program.thisWeek')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryCount}>
              {prog.done}
              <Text style={styles.summaryTotal}> / {prog.total}</Text>
            </Text>
            <Text style={styles.summaryLabel}>{t('program.sessionsDone')}</Text>
          </View>
          <Text style={styles.summaryBody}>
            {prog.total - prog.done <= 0 ? t('program.weekDone') : t('program.momentum', { count: prog.total - prog.done })}
          </Text>
          <View style={styles.summaryMeter}>
            <ProgressMeter value={prog.done} max={prog.total || 1} tone="signal" />
          </View>
        </View>

        {upcoming.length > 0 ? (
          <View style={styles.group}>
            <Legend style={styles.groupLegend}>{t('program.remaining')}</Legend>
            {upcoming.map((d, i) => (
              <ListRow
                key={d.id}
                title={d.name}
                subtitle={d.muscleGroups.join(' · ')}
                chevron
                last={i === upcoming.length - 1}
                onPress={() => openDay(d.id)}
                leading={<Icon name="circle" size={20} color={color.textSecondary} strokeWidth={2} />}
                trailing={<Text style={styles.meta}>{t('program.exCount', { n: d.slots.length })}</Text>}
              />
            ))}
          </View>
        ) : null}

        {completed.length > 0 ? (
          <View style={styles.group}>
            <Legend style={styles.groupLegend}>{t('program.completedMeter')}</Legend>
            {completed.map((d, i) => (
              <ListRow
                key={d.id}
                title={d.name}
                subtitle={d.muscleGroups.join(' · ')}
                index={i + 1}
                done
                muted
                chevron
                last={i === completed.length - 1}
                onPress={() => openDay(d.id)}
                trailing={weekdayFor(d) ? <Text style={styles.meta}>{weekdayFor(d)}</Text> : undefined}
              />
            ))}
          </View>
        ) : null}
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
  summary: { paddingTop: 2, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: color.border },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  summaryCount: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['4xl'], letterSpacing: -1.4, color: color.textPrimary },
  summaryTotal: { fontSize: textScale.xl, color: color.textTertiary },
  summaryLabel: { fontFamily: font.sans, fontSize: textScale.base, color: color.textSecondary },
  summaryBody: { marginTop: 12, fontFamily: font.sans, fontSize: textScale.md, lineHeight: 24, color: color.textSecondary },
  summaryMeter: { marginTop: 14 },
  group: { marginTop: 24 },
  groupLegend: { marginBottom: 2 },
  meta: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted },
});
