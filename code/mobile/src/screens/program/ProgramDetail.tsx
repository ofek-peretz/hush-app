/**
 * 4.20 Workout Edit. The day's exercises as planned: each row has a reorder
 * handle, the exercise name, its "weight · sets × reps", and a swap icon that
 * opens the Swap sheet (§4.21). Reorder + swap persist to the program (athlete
 * owns exercise selection + order; the frozen model owns load/sets/reps).
 *
 * Reorder is drag-and-drop (long-press a row to lift, drag to a new slot — §4.20),
 * with accessible up/down controls kept as an equivalent for VoiceOver/Switch.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SwapSheet } from '@/components/SwapSheet';
import { DraggableList } from '@/components/DraggableList';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { track } from '@/platform/telemetry';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import type { Capability, SetTarget } from '@/data/local/models';
import { color, space, heroTitle, press, s } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'ProgramDetail'>;

// Fixed row height — the draggable list positions rows absolutely by slot index.
const ROW_HEIGHT = s(64);

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
      return { weight: t0?.recommendedWeight ?? null, reps: t0?.recommendedReps ?? 8 };
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

          <DraggableList
            data={day.slots}
            keyExtractor={(slot) => slot.exerciseId}
            rowHeight={ROW_HEIGHT}
            onReorder={(from, to) => void app.reorderExercise(day.id, from, to)}
            renderItem={(slot, i) => {
              const tg = targetFor(slot.exerciseId);
              const w = displayWeight(tg.weight, units);
              const detail =
                w != null
                  ? t('program.perExercise', { weight: `${w} ${unitLabel(units)}`, sets: slot.setCount, reps: tg.reps })
                  : t('program.perExerciseBw', { sets: slot.setCount, reps: tg.reps });
              return (
                <View style={styles.row}>
                  {/* Grip = drag affordance; arrows are the accessible equivalent. */}
                  <View style={styles.grip}>
                    <Icon name="grip" size={18} color={color.textTertiary} strokeWidth={2} />
                    <View style={styles.arrows}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('program.moveUp')}
                        disabled={i === 0}
                        onPress={() => void app.reorderExercise(day.id, i, i - 1)}
                        style={({ pressed }) => [styles.arrow, { opacity: i === 0 ? 0.25 : pressed ? press.opacity : 1 }]}
                      >
                        <Icon name="chevronUp" size={16} color={color.textSecondary} strokeWidth={2} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('program.moveDown')}
                        disabled={i === day.slots.length - 1}
                        onPress={() => void app.reorderExercise(day.id, i, i + 1)}
                        style={({ pressed }) => [styles.arrow, { opacity: i === day.slots.length - 1 ? 0.25 : pressed ? press.opacity : 1 }]}
                      >
                        <Icon name="chevronDown" size={16} color={color.textSecondary} strokeWidth={2} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.rowMain}>
                    <Text style={styles.exName}>{exerciseDisplayName(slot.exerciseId)}</Text>
                    <Text style={styles.detail}>{detail}</Text>
                  </View>

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
            }}
          />
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
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT, borderBottomWidth: 0.5, borderBottomColor: color.border, backgroundColor: color.bg },
  grip: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  arrows: { marginLeft: 4 },
  arrow: { width: 28, height: 22, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: color.textSecondary, fontSize: 14 },
  rowMain: { flex: 1 },
  exName: { fontSize: s(16), fontWeight: '500', color: color.textPrimary },
  detail: { fontSize: s(13), color: color.textSecondary, marginTop: s(3) },
  swap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
