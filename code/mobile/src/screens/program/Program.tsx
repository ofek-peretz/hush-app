/**
 * 4.19 Program · Weekly View. The week's plan grouped by status:
 *  - COMPLETED THIS WEEK: finished workouts, each with the weekday it was done
 *    (derived from history) and a grey DONE chip.
 *  - UP NEXT: upcoming workouts (no weekday) with a "Set as next" action that
 *    makes Home show that workout next (athlete-owned order; §4.19 / §5.8).
 * Tapping a row body opens Workout Edit (ProgramDetail). Rest is a Home state,
 * not a row here (weekly model).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppTabBar, TAB_BAR_SPACE } from '@/components/AppTabBar';
import { Eyebrow } from '@/components/Eyebrow';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { track } from '@/platform/telemetry';
import type { ProgramDay, Session } from '@/data/local/models';
import { color, space, heroTitle, press, s } from '@/design/tokens';
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

  // Weekday a completed workout was performed (most-recent matching session).
  function weekdayFor(day: ProgramDay): string | null {
    const s =
      history.find((h) => h.programDayId === day.id) ??
      history.find((h) => h.programDayName === day.name);
    return s ? new Date(s.startedAt).toLocaleDateString(undefined, { weekday: 'short' }) : null;
  }

  // "Set as next": Home should immediately offer THIS workout. We pass it to Home as
  // `focusDayId` (survives Home's program refetch, which was reverting a local
  // reorder), and also persist the athlete's workout order so FUTURE weeks keep it
  // (the current week is already composed server-side — §4.19 / §5.8).
  async function onSetAsNext(dayId: string) {
    if (!program) return;
    const from = program.days.findIndex((d) => d.id === dayId);
    const firstUpcoming = program.days.findIndex((d) => !d.isRest && !d.completed);
    void track('set_as_next', { dayId });
    if (from >= 0 && firstUpcoming >= 0 && from !== firstUpcoming) {
      await app.reorderWorkouts(from, firstUpcoming);
    }
    navigation.navigate('Home', { focusDayId: dayId });
  }

  const workouts = (program?.days ?? []).filter((d) => !d.isRest);
  const completed = workouts.filter((d) => d.completed);
  const upcoming = workouts.filter((d) => !d.completed);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.header} accessibilityRole="header">{t('program.title')}</Text>
        {program ? <Text style={styles.sub}>{t('program.perWeek', { n: program.frequency })}</Text> : null}

        {completed.length > 0 ? (
          <View style={styles.group}>
            <Eyebrow label={t('program.completedThisWeek')} size={11} trackingPx={1.5} />
            {completed.map((d) => (
              <Pressable
                key={d.id}
                accessibilityRole="button"
                onPress={() => navigation.navigate('ProgramDetail', { dayId: d.id })}
                style={({ pressed }) => [styles.row, { opacity: pressed ? press.opacity : 1 }]}
              >
                <View style={styles.rowMain}>
                  {weekdayFor(d) ? <Text style={styles.weekday}>{weekdayFor(d)}</Text> : null}
                  <Text style={styles.name}>{d.name}</Text>
                  <Text style={styles.muscles} numberOfLines={1}>{d.muscleGroups.join(' · ')}</Text>
                </View>
                <View style={styles.doneChip}>
                  <Icon name="check" size={11} color={color.doneText} strokeWidth={2.4} />
                  <Text style={styles.doneText}>{t('program.doneChip')}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {upcoming.length > 0 ? (
          <View style={styles.group}>
            <Eyebrow label={t('program.upNext')} size={11} trackingPx={1.5} />
            {upcoming.map((d) => (
              <Pressable
                key={d.id}
                accessibilityRole="button"
                onPress={() => navigation.navigate('ProgramDetail', { dayId: d.id })}
                style={({ pressed }) => [styles.row, { opacity: pressed ? press.opacity : 1 }]}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.name}>{d.name}</Text>
                  <Text style={styles.muscles} numberOfLines={1}>{d.muscleGroups.join(' · ')}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('program.setAsNext')}
                  hitSlop={8}
                  onPress={() => void onSetAsNext(d.id)}
                  style={({ pressed }) => [styles.setNext, { opacity: pressed ? press.opacity : 1 }]}
                >
                  <Text style={styles.setNextText}>{t('program.setAsNext')}</Text>
                  <Icon name="chevronRight" size={14} color={color.accentBlue} strokeWidth={2} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <AppTabBar active="program" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { paddingTop: 22, paddingHorizontal: space.gutter, paddingBottom: TAB_BAR_SPACE },
  header: { ...heroTitle(s(28)), color: color.textPrimary, fontSize: s(28), fontWeight: '600' },
  sub: { fontSize: s(13), color: color.textSecondary, marginTop: s(6) },
  group: { marginTop: s(28) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 0.5,
    borderBottomColor: color.border,
  },
  rowMain: { flex: 1, marginRight: 12 },
  weekday: { fontSize: s(12), color: color.textSecondary, marginBottom: 2 },
  name: { fontSize: s(18), fontWeight: '600', color: color.textPrimary },
  muscles: { fontSize: s(12), color: color.textSecondary, marginTop: s(2) },
  doneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: color.surface2,
    borderWidth: 0.5,
    borderColor: color.doneBorder,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  doneText: { fontSize: s(10), fontWeight: '600', letterSpacing: 0.6, color: color.doneText },
  setNext: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  setNextText: { fontSize: s(13), fontWeight: '500', color: color.accentBlue },
});
