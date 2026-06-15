/**
 * 1.20 Program Detail. The day's exercises as PLANNED, and the place an athlete
 * deliberately replaces a slot's exercise (UX §1). On a deliberate replacement,
 * a single confirming line appears: "[exercise] is yours now." (§1.10, §1.13).
 * No volume totals, tonnage, or progression curves (spec §4.2).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ReplacementSheet } from '@/components/ReplacementSheet';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { track } from '@/platform/telemetry';
import { exerciseById } from '@/data/exercises';
import type { Capability, SetTarget } from '@/data/local/models';
import { color, layout, press, type as typo } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ProgramDetail'>;

interface Replacing {
  slotIndex: number;
  currentExerciseId: string;
  capability: Capability;
  target: { weight: number | null; reps: number };
}

export function ProgramDetail({ route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const day = app.program?.days.find((d) => d.id === route.params.dayId);

  const [targets, setTargets] = useState<SetTarget[]>([]);
  const [replacing, setReplacing] = useState<Replacing | null>(null);
  const [yoursNow, setYoursNow] = useState<string | null>(null); // confirming line copy

  useEffect(() => {
    if (!day) return;
    void track('program_day_viewed', { dayId: day.id });
    app.model
      .sessionTargets({ programDayId: day.id, completedSessions: app.modeState.completedSessions })
      .then(setTargets);
  }, [app.model, app.modeState.completedSessions, day]);

  const targetFor = useMemo(
    () => (exId: string) => {
      const t0 = targets.find((x) => x.exerciseId === exId && x.setIndex === 0);
      return { weight: t0?.recommendedWeight ?? null, reps: t0?.recommendedReps ?? 8 };
    },
    [targets],
  );

  if (!day) return <SafeAreaView style={styles.root} />;

  async function onUse(exerciseId: string) {
    if (!replacing || !day) return;
    await app.replaceSlotExercise(day.id, replacing.slotIndex, exerciseId);
    setYoursNow(exerciseById(exerciseId)?.name ?? '');
    setReplacing(null);
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{day.name}</Text>
        {/* Said once, never repeated, after a deliberate replacement (§1.13). */}
        {yoursNow ? <Text style={styles.yoursNow}>{t('replacement.yoursNow', { exercise: yoursNow })}</Text> : null}

        {day.slots.map((slot, i) => {
          const ex = exerciseById(slot.exerciseId);
          return (
            <View key={`${slot.exerciseId}_${i}`} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setReplacing({
                    slotIndex: i,
                    currentExerciseId: slot.exerciseId,
                    capability: slot.capability,
                    target: targetFor(slot.exerciseId),
                  })
                }
                style={({ pressed }) => [styles.rowMain, { opacity: pressed ? press.opacity : 1 }]}
              >
                <Text style={styles.exName}>{ex?.name ?? slot.exerciseId}</Text>
                <Text style={styles.sets}>{`${slot.setCount} sets`}</Text>
              </Pressable>
              {/* Athlete-owned exercise order (Athlete > Model; persists across weeks). */}
              <View style={styles.reorder}>
                {i > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('program.moveUp')}
                    onPress={() => void app.reorderExercise(day.id, i, i - 1)}
                    style={({ pressed }) => [styles.arrow, { opacity: pressed ? press.opacity : 1 }]}
                  >
                    <Text style={styles.arrowText}>↑</Text>
                  </Pressable>
                ) : null}
                {i < day.slots.length - 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('program.moveDown')}
                    onPress={() => void app.reorderExercise(day.id, i, i + 1)}
                    style={({ pressed }) => [styles.arrow, { opacity: pressed ? press.opacity : 1 }]}
                  >
                    <Text style={styles.arrowText}>↓</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {replacing ? (
        <ReplacementSheet
          capability={replacing.capability}
          currentExerciseId={replacing.currentExerciseId}
          target={replacing.target}
          units={units}
          recents={app.recents}
          mode="deliberate"
          onUse={onUse}
          onDismiss={() => setReplacing(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase },
  body: { paddingTop: 24, paddingHorizontal: layout.screenMargin, paddingBottom: 48 },
  title: { color: color.textPrimary, fontSize: typo.titleL.size, fontWeight: typo.titleL.weight, marginBottom: 16 },
  yoursNow: { color: color.textSecondary, fontSize: typo.bodyM.size, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderSubtle },
  rowMain: { flex: 1 },
  exName: { color: color.textPrimary, fontSize: typo.bodyL.size },
  sets: { color: color.textSecondary, fontSize: typo.caption.size, marginTop: 4 },
  reorder: { flexDirection: 'row', alignItems: 'center' },
  arrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: color.textSecondary, fontSize: typo.titleM.size },
});
