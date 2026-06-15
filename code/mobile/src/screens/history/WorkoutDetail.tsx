/**
 * 1.21 Workout Detail (spec §4.2, §10.9). Shows ACTUAL logged values only,
 * never planned/target. History is immutable — read-only (§10.9). No volume
 * totals, tonnage, duration, or progression curves.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import type { Session, SetLog } from '@/data/local/models';
import { color, layout, type as typo } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WorkoutDetail'>;

export function WorkoutDetail({ route }: Props) {
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    db.loadHistory().then((all) => setSession(all.find((s) => s.id === route.params.sessionId) ?? null));
  }, [route.params.sessionId]);

  if (!session) return <SafeAreaView style={styles.root} />;

  // Group logged sets by exercise, preserving order.
  const order: string[] = [];
  const byEx: Record<string, SetLog[]> = {};
  for (const set of session.sets) {
    if (!byEx[set.exerciseId]) {
      byEx[set.exerciseId] = [];
      order.push(set.exerciseId);
    }
    byEx[set.exerciseId].push(set);
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        {order.map((exId) => (
          <View key={exId} style={styles.exercise}>
            <Text style={styles.exName}>{exerciseById(exId)?.name ?? exId}</Text>
            {byEx[exId].map((set, i) => {
              const w = displayWeight(set.actualWeight, units);
              return (
                <Text key={i} style={styles.setLine}>
                  {w == null ? `${set.actualReps} reps` : `${w} ${unitLabel(units)} × ${set.actualReps}`}
                </Text>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase },
  body: { paddingTop: 24, paddingHorizontal: layout.screenMargin, paddingBottom: 48 },
  exercise: { marginBottom: 24 },
  exName: { color: color.textPrimary, fontSize: typo.bodyL.size, marginBottom: 8 },
  setLine: { color: color.textSecondary, fontSize: typo.bodyM.size, marginBottom: 4 },
});
