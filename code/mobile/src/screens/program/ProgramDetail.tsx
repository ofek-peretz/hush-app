/**
 * Workout Edit (§4.20) — rebuilt 1:1 to the Claude Design "Design System" workout
 * sheet (ui_kits/app/Program.jsx → WorkoutSheet). The day's exercises as planned:
 * legend (muscle groups) → name → each exercise as an indexed ListRow (sets · reps)
 * with a Swap action that opens the Swap sheet (§4.21). The athlete owns exercise
 * SELECTION (swap/replace); the frozen model owns order, load, sets and reps.
 *
 * "Begin {name}" sets this workout as Home's offered workout (focusDayId) and
 * returns to Home — so the actual start stays on the canonical, Sunday-04:00-gated
 * Home path (identical to Home's "Choose another workout"), never bypassing it.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SwapSheet } from '@/components/SwapSheet';
import { Icon } from '@/components/Icon';
import { Legend, ListRow, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { track } from '@/platform/telemetry';
import { exerciseDisplayName } from '@/data/exercises';
import type { SetTarget } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ProgramDetail'>;

interface Swapping {
  slotIndex: number;
  currentExerciseId: string;
}

export function ProgramDetail({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const day = app.program?.days.find((d) => d.id === route.params.dayId);

  const [targets, setTargets] = useState<SetTarget[]>([]);
  const [swapping, setSwapping] = useState<Swapping | null>(null);
  const [yoursNow, setYoursNow] = useState<string | null>(null);

  useEffect(() => {
    if (!day) return;
    void track('program_day_viewed', { dayId: day.id });
    app.model
      .sessionTargets({ programDayId: day.id, completedSessions: app.modeState.completedSessions })
      .then(setTargets);
  }, [app.model, app.modeState.completedSessions, day]);

  const repsFor = (exId: string) => targets.find((x) => x.exerciseId === exId && x.setIndex === 0)?.recommendedReps ?? 8;

  async function onSelectSwap(exerciseId: string) {
    if (!swapping || !day) return;
    await app.replaceSlotExercise(day.id, swapping.slotIndex, exerciseId);
    setYoursNow(exerciseDisplayName(exerciseId));
    setSwapping(null);
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
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
          {day?.muscleGroups?.length ? <Legend>{day.muscleGroups.join(' · ')}</Legend> : null}
          <Text style={styles.title} accessibilityRole="header">{day?.name ?? ''}</Text>
        </View>
      </View>

      {!day ? null : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {yoursNow ? <Text style={styles.yoursNow}>{t('replacement.yoursNow', { exercise: yoursNow })}</Text> : null}

          {day.slots.map((slot, i) => (
            <ListRow
              key={`${slot.exerciseId}_${i}`}
              index={i + 1}
              title={exerciseDisplayName(slot.exerciseId)}
              subtitle={t('program.setsReps', { sets: slot.setCount, reps: repsFor(slot.exerciseId) })}
              last={i === day.slots.length - 1}
              trailing={
                <Button
                  variant="ghost"
                  size="sm"
                  label={t('workout.swapAction')}
                  leading={<Icon name="swap" size={16} color={color.textPrimary} strokeWidth={2} />}
                  onPress={() => setSwapping({ slotIndex: i, currentExerciseId: slot.exerciseId })}
                />
              }
            />
          ))}
        </ScrollView>
      )}

      {day ? (
        <View style={styles.footer}>
          <Button
            variant="primary"
            size="lg"
            block
            label={t('home.begin', { name: day.name })}
            leading={<Icon name="play" size={18} color={color.onAccent} />}
            onPress={() => navigation.navigate('Home', { focusDayId: day.id })}
          />
        </View>
      ) : null}

      {swapping ? (
        <SwapSheet
          currentExerciseId={swapping.currentExerciseId}
          onSelect={onSelectSwap}
          onClose={() => setSwapping(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 12, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headTitles: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 1 },
  body: { paddingHorizontal: space.gutter, paddingBottom: 24 },
  yoursNow: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary, paddingTop: 12, marginBottom: 4 },
  footer: { paddingHorizontal: space.gutter, paddingTop: 14, paddingBottom: 18, borderTopWidth: 1, borderTopColor: color.border },
});
