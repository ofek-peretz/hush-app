/**
 * 4.24 Workout Detail — read-only record of a logged session. Header shows the
 * workout name and "date · duration"; each exercise block lists its sets as
 * "Set N" + the ACTUAL "weight × reps" logged. Immutable; no targets, no editing.
 *
 * Duration is derived from the session span (start → last set logged), since the
 * session stores per-set timestamps rather than a duration field.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import { displayWeight, unitLabel, sessionDayName } from '@/domain/schedule';
import type { Session, SetLog } from '@/data/local/models';
import { color, space, tnum, heroTitle, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WorkoutDetail'>;

export function WorkoutDetail({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.loadHistory().then((all) => {
      setSession(all.find((s) => s.id === route.params.sessionId) ?? null);
      setLoading(false);
    });
  }, [route.params.sessionId]);

  function durationMin(s: Session): number {
    if (s.sets.length === 0) return 0;
    const last = s.sets[s.sets.length - 1].persistedAt;
    const ms = Date.parse(last) - Date.parse(s.startedAt);
    return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 60000)) : 0;
  }

  // Group logged sets by exercise, preserving order.
  const order: string[] = [];
  const byEx: Record<string, SetLog[]> = {};
  for (const set of session?.sets ?? []) {
    if (!byEx[set.exerciseId]) {
      byEx[set.exerciseId] = [];
      order.push(set.exerciseId);
    }
    byEx[set.exerciseId].push(set);
  }

  const dateLabel = session
    ? new Date(session.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.back, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Icon name="chevronLeft" size={22} color={color.textSecondary} strokeWidth={2} />
        </Pressable>
        {session ? (
          <View style={styles.headerText}>
            <Text style={styles.title} accessibilityRole="header">{sessionDayName(session, app.program)}</Text>
            <Text style={styles.meta}>{t('history.dateDuration', { date: dateLabel, min: durationMin(session) })}</Text>
          </View>
        ) : null}
      </View>

      {loading || !session ? null : (
        <ScrollView contentContainerStyle={styles.body}>
          {order.map((exId) => (
            <View key={exId} style={styles.exercise}>
              <Text style={styles.exName}>{exerciseById(exId)?.name ?? exId}</Text>
              {byEx[exId].map((set, i) => {
                const w = displayWeight(set.actualWeight, units);
                return (
                  <View key={i} style={styles.setRow}>
                    <Text style={styles.setN}>{t('history.setN', { n: i + 1 })}</Text>
                    <Text style={styles.setVal}>
                      {w == null ? `${set.actualReps} reps` : `${w} ${unitLabel(units)} × ${set.actualReps}`}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter, paddingTop: 6, gap: 6 },
  back: { width: 36, height: 44, alignItems: 'flex-start', justifyContent: 'center', marginLeft: -8 },
  headerText: { flex: 1 },
  title: { ...heroTitle(22), color: color.textPrimary, fontSize: 22, fontWeight: '600' },
  meta: { fontSize: 13, color: color.textSecondary, marginTop: 2 },
  body: { paddingTop: 22, paddingHorizontal: space.gutter, paddingBottom: 48 },
  exercise: { marginBottom: 20 },
  exName: { fontSize: 17, fontWeight: '500', color: color.textPrimary, marginBottom: 8 },
  setRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  setN: { fontSize: 14, color: color.textSecondary },
  setVal: { ...tnum, fontSize: 14, color: color.textSecondary },
});
