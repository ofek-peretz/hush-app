/**
 * 4.20 Workout Edit. The day's exercises as planned: each row shows the exercise
 * name, its "weight · sets × reps", a small ▲/▼ arrow when the model changed the
 * load this week (#13), and a swap icon that opens the Swap sheet (§4.21).
 *
 * Founder change (#11): exercise REORDER (drag + up/down handles) was removed —
 * the athlete owns exercise SELECTION (swap/replace), the frozen model owns order,
 * load, sets and reps. Replace-with-another stays; position-dragging is gone.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SwapSheet } from '@/components/SwapSheet';
import { Icon } from '@/components/Icon';
import { ProgressArrow, directionFromReason } from '@/components/ProgressArrow';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { track } from '@/platform/telemetry';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import type { Capability, SetTarget } from '@/data/local/models';
import { color, space, heroTitle, press, s } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ProgramDetail'>;

interface Swapping {
  slotIndex: number;
  currentExerciseId: string;
  capability: Capability;
}

export function ProgramDetail({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
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

  const targetFor = useMemo(
    () => (exId: string) => {
      const t0 = targets.find((x) => x.exerciseId === exId && x.setIndex === 0);
      return {
        weight: t0?.recommendedWeight ?? null,
        reps: t0?.recommendedReps ?? 8,
        reason: t0?.reasonType,
      };
    },
    [targets],
  );

  async function onSelectSwap(exerciseId: string) {
    if (!swapping || !day) return;
    await app.replaceSlotExercise(day.id, swapping.slotIndex, exerciseId);
    setYoursNow(exerciseDisplayName(exerciseId));
    setSwapping(null);
  }

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
        <Text style={styles.title} accessibilityRole="header">{day?.name ?? ''}</Text>
      </View>

      {!day ? null : (
        <ScrollView contentContainerStyle={styles.body}>
          {yoursNow ? <Text style={styles.yoursNow}>{t('replacement.yoursNow', { exercise: yoursNow })}</Text> : null}

          {day.slots.map((slot, i) => {
            const tg = targetFor(slot.exerciseId);
            const w = displayWeight(tg.weight, units);
            const detail =
              w != null
                ? t('program.perExercise', { weight: `${w} ${unitLabel(units)}`, sets: slot.setCount, reps: tg.reps })
                : t('program.perExerciseBw', { sets: slot.setCount, reps: tg.reps });
            const direction = directionFromReason(tg.reason);
            return (
              <View key={`${slot.exerciseId}_${i}`} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.exName}>{exerciseDisplayName(slot.exerciseId)}</Text>
                  <Text style={styles.detail}>{detail}</Text>
                </View>

                {direction ? (
                  <View style={styles.arrowSlot}>
                    <ProgressArrow direction={direction} size={s(16)} />
                  </View>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('swap.title')}
                  hitSlop={8}
                  onPress={() => setSwapping({ slotIndex: i, currentExerciseId: slot.exerciseId, capability: slot.capability })}
                  style={({ pressed }) => [styles.swap, { opacity: pressed ? press.opacity : 1 }]}
                >
                  <Icon name="swap" size={20} color={color.textSecondary} strokeWidth={2} />
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}

      {swapping ? (
        <SwapSheet
          capability={swapping.capability}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter, paddingTop: 6, gap: 6 },
  back: { width: 36, height: 44, alignItems: 'flex-start', justifyContent: 'center', marginLeft: -8 },
  title: { ...heroTitle(s(24)), color: color.textPrimary, fontSize: s(24), fontWeight: '600' },
  body: { paddingTop: s(24), paddingHorizontal: space.gutter, paddingBottom: 48 },
  yoursNow: { fontSize: s(14), color: color.textSecondary, marginBottom: s(16) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: s(15),
    borderBottomWidth: 0.5,
    borderBottomColor: color.border,
  },
  rowMain: { flex: 1 },
  exName: { fontSize: s(16), fontWeight: '500', color: color.textPrimary },
  detail: { fontSize: s(13), color: color.textSecondary, marginTop: s(3) },
  arrowSlot: { width: s(28), alignItems: 'center', justifyContent: 'center' },
  swap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
