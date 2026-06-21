/**
 * History (§4.22/§4.23) — the flight recorder, rebuilt 1:1 to the Claude Design
 * "Design System" History (ui_kits/app/History.jsx). A reverse-chronological list
 * of completed sessions; each row shows the workout, the date · duration, and the
 * session volume. Tapping opens the read-only record (WorkoutDetail). Records
 * without interpreting — no praise, no PRs.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend, ListRow } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import type { Session } from '@/data/local/models';
import { sessionDayName, displayWeight, unitLabel } from '@/domain/schedule';
import { color, space, font, textScale, tracking, trackingPx, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'History'>;

function sessionDurationLabel(s: Session): string {
  const start = Date.parse(s.startedAt);
  const ends = s.sets.map((x) => Date.parse(x.persistedAt)).filter((n) => !Number.isNaN(n));
  const end = ends.length ? Math.max(...ends) : start;
  const total = Math.max(0, Math.round((end - start) / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function sessionVolumeKg(s: Session): number {
  return s.sets.reduce((sum, x) => sum + (x.actualWeight ?? 0) * x.actualReps, 0);
}

export function History({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [sessions, setSessions] = useState<Session[] | null>(null); // null = loading

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      db.loadHistory().then((all) => active && setSessions(all)); // newest first
      return () => {
        active = false;
      };
    }, []),
  );

  const dayName = (s: Session) => sessionDayName(s, app.program);
  const isEmpty = sessions != null && sessions.length === 0;
  const list = sessions ?? [];

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
          <Legend>{t('history.legend')}</Legend>
          <Text style={styles.title} accessibilityRole="header">{t('history.title')}</Text>
        </View>
      </View>

      {isEmpty ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>{t('history.empty')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {list.map((s, i) => {
            const dateLabel = new Date(s.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
            const volKg = sessionVolumeKg(s);
            const vol = displayWeight(Math.round(volKg), units) ?? 0;
            return (
              <ListRow
                key={s.id}
                title={dayName(s)}
                subtitle={`${dateLabel} · ${sessionDurationLabel(s)}`}
                chevron
                last={i === list.length - 1}
                onPress={() => navigation.navigate('WorkoutDetail', { sessionId: s.id })}
                leading={
                  <View style={styles.iconBox}>
                    <Icon name="dumbbell" size={16} color={color.textSecondary} strokeWidth={2} />
                  </View>
                }
                trailing={
                  <Text style={styles.vol}>
                    {vol.toLocaleString()} {unitLabel(units)}
                  </Text>
                }
              />
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 12, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headTitles: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter, paddingBottom: 40 },
  empty: { fontFamily: font.sans, fontSize: textScale.base, color: color.textSecondary, textAlign: 'center' },
  list: { paddingHorizontal: space.gutter, paddingBottom: 40 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vol: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted },
});
