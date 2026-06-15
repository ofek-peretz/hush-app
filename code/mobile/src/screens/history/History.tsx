/**
 * 1.21 History — the flight recorder (spec §1.21, §2.10, §3.1, §4.10).
 * Reverse-chronological. Owner-voice annotations ONLY on sessions where Hush
 * acted or the athlete ended early. Records without interpreting — forbidden:
 * "Great Session", "PR Achieved", etc. Empty = header alone, no prompt.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import type { Session } from '@/data/local/models';
import { color, layout, press, type as typo } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'History'>;

export function History({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    db.loadHistory().then(setSessions); // newest first (db unshifts)
  }, []);

  const dayName = (id: string) => app.program?.days.find((d) => d.id === id)?.name ?? 'Workout';

  function annotationLine(s: Session): string | null {
    if (s.annotation === 'ended_early') return t('history.annEndedEarly');
    if (s.annotation === 'increased' && s.annotationCapability) {
      return t('history.annIncreased', { target: t(`capabilityLoad.${s.annotationCapability}`) });
    }
    if (s.annotation === 'swapped') return t('history.annSwapped', { exercise: '' });
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.header} accessibilityRole="header">{t('history.title')}</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {sessions.map((s) => {
          const ann = annotationLine(s);
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              onPress={() => navigation.navigate('WorkoutDetail', { sessionId: s.id })}
              style={({ pressed }) => [styles.row, { opacity: pressed ? press.opacity : 1 }]}
            >
              <Text style={styles.title}>{dayName(s.programDayId)}</Text>
              <Text style={styles.date}>{new Date(s.startedAt).toLocaleDateString()}</Text>
              {ann ? <Text style={styles.annotation}>{ann}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase },
  header: { color: color.textPrimary, fontSize: typo.titleL.size, fontWeight: typo.titleL.weight, paddingTop: 24, paddingHorizontal: layout.screenMargin },
  list: { paddingHorizontal: layout.screenMargin, paddingTop: 16, paddingBottom: 48 },
  row: { paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderSubtle },
  title: { color: color.textPrimary, fontSize: typo.bodyL.size },
  date: { color: color.textTertiary, fontSize: typo.caption.size, marginTop: 4 },
  annotation: { color: color.textSecondary, fontSize: typo.bodyM.size, marginTop: 8 },
});
