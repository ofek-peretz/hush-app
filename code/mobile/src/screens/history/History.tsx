/**
 * 4.22 / 4.23 History — the flight recorder. Reverse-chronological list of
 * completed sessions; empty state is a single quiet line. Each entry shows the
 * date, the workout name, and an optional first-person Hush note (only when Hush
 * acted or the athlete ended early). Records without interpreting — no
 * "Great session" / "PR" praise. Tapping a row opens the read-only detail.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppTabBar, TAB_BAR_SPACE } from '@/components/AppTabBar';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import type { Session } from '@/data/local/models';
import { sessionDayName } from '@/domain/schedule';
import { color, space, heroTitle, press, s } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'History'>;

export function History({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [sessions, setSessions] = useState<Session[] | null>(null); // null = loading

  // Reload on focus so a session completed this run appears without a relaunch.
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

  function note(s: Session): string | null {
    if (s.annotation === 'ended_early') return t('history.annEndedEarly');
    if (s.annotation === 'increased' && s.annotationCapability) {
      return t('history.annIncreased', { target: t(`capabilityLoad.${s.annotationCapability}`) });
    }
    if (s.annotation === 'swapped') return t('history.annSwapped', { exercise: '' });
    return null;
  }

  const isEmpty = sessions != null && sessions.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.headerWrap}>
        <Text style={styles.header} accessibilityRole="header">{t('history.title')}</Text>
        {sessions != null && sessions.length > 0 ? (
          <Text style={styles.sub}>{t('history.count', { n: sessions.length })}</Text>
        ) : null}
      </View>

      {isEmpty ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>{t('history.empty')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {(sessions ?? []).map((s) => {
            const n = note(s);
            return (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                onPress={() => navigation.navigate('WorkoutDetail', { sessionId: s.id })}
                style={({ pressed }) => [styles.row, { opacity: pressed ? press.opacity : 1 }]}
              >
                <Text style={styles.date}>{new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                <Text style={styles.name}>{dayName(s)}</Text>
                {n ? <Text style={styles.note}>{n}</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <AppTabBar active="history" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  headerWrap: { paddingTop: 22, paddingHorizontal: space.gutter },
  header: { ...heroTitle(s(28)), color: color.textPrimary, fontSize: s(28), fontWeight: '600' },
  sub: { fontSize: s(13), color: color.textSecondary, marginTop: s(6) },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter, paddingBottom: TAB_BAR_SPACE },
  empty: { fontSize: s(14), color: color.textSecondary, textAlign: 'center' },
  list: { paddingHorizontal: space.gutter, paddingTop: 20, paddingBottom: TAB_BAR_SPACE },
  row: { paddingVertical: s(13), borderBottomWidth: 0.5, borderBottomColor: color.border },
  date: { fontSize: s(12), color: color.textSecondary },
  name: { fontSize: s(18), fontWeight: '600', color: color.textPrimary, marginTop: s(3) },
  note: { fontSize: s(12), lineHeight: s(12) * 1.4, color: color.textSecondary, marginTop: s(5) },
});
