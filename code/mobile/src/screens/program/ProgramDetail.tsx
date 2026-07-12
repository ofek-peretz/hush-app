/**
 * Workout detail (§4.20) — rebuilt 1:1 to the Claude Design WorkoutSheet
 * (ui_kits/app/Program.jsx). The day's exercises as planned: muscle-group legend
 * → name → intro ("Lock a lift…"). Each exercise is a row: a number badge that
 * turns ochre when locked, the name, sets · reps, an inline LOCKED tag, and three
 * actions — Form (the looping demo / silhouette guide), Lock (the pin), Swap.
 *
 * The athlete owns exercise SELECTION (swap/replace) and the lock; the frozen
 * model owns order, load, sets, reps — and may auto-swap only UNLOCKED slots.
 * "Begin {name}" sets this as Home's offered workout and returns to Home, so the
 * actual start stays on the canonical, Saturday-23:59-gated path.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SwapSheet } from '@/components/SwapSheet';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { Icon } from '@/components/Icon';
import { Legend, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { track } from '@/platform/telemetry';
import { exerciseCues, exerciseDisplayName, muscleGroupsLabel } from '@/data/exercises';
import { estimateSessionMinutes } from '@/data/api/fixtureModel';
import type { SetTarget } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, press, radius } from '@/design/tokens';
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
  const [formFor, setFormFor] = useState<number | null>(null);
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
    try {
      await app.replaceSlotExercise(day.id, swapping.slotIndex, exerciseId);
      setYoursNow(exerciseDisplayName(exerciseId));
    } catch {
      // The swap did not persist. Say nothing false — the sheet closes and the slot still shows
      // the exercise it actually has.
    } finally {
      // ALWAYS: a rejection used to leave the swap sheet open with no way to dismiss it.
      setSwapping(null);
    }
  }

  // The day's shape at a glance: exercise count + honest work-time estimate (the same
  // estimator the 60-minute program cap runs on), rounded to a calm 5 minutes.
  const estMin = day ? Math.max(5, Math.round(estimateSessionMinutes(day) / 5) * 5) : 0;

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
          {day?.muscleGroups?.length ? <Legend>{muscleGroupsLabel(day.muscleGroups)}</Legend> : null}
          <Text style={styles.title} accessibilityRole="header">{day?.name ?? ''}</Text>
        </View>
      </View>

      {!day ? null : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>{t('program.dayMeta', { exercises: day.slots.length, min: estMin })}</Text>
          {yoursNow ? <Text style={styles.yoursNow}>{t('replacement.yoursNow', { exercise: bidi(yoursNow) })}</Text> : null}

          {day.slots.map((slot, i) => {
            const locked = slot.locked === true;
            const lockable = slot.locked !== undefined;
            return (
              <View key={`${slot.exerciseId}_${i}`} style={[styles.lift, i === day.slots.length - 1 && styles.liftLast]}>
                <View style={[styles.badge, locked && styles.badgeLocked]}>
                  <Text style={[styles.badgeText, locked && styles.badgeTextLocked]}>{i + 1}</Text>
                </View>
                <View style={styles.liftBody}>
                  <Text style={styles.liftName} numberOfLines={1}>{exerciseDisplayName(slot.exerciseId)}</Text>
                  <View style={styles.liftMeta}>
                    <Text style={styles.setsReps}>{t('program.setsReps', { sets: slot.setCount, reps: repsFor(slot.exerciseId) })}</Text>
                    {locked ? (
                      <View style={styles.lockedTag}>
                        <Icon name="pin" size={12} color={color.accentText} strokeWidth={2} />
                        <Text style={styles.lockedTagText}>{t('program.locked').toUpperCase()}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('workout.form')}
                    onPress={() => setFormFor(i)}
                    style={({ pressed }) => [styles.formBtn, pressed && styles.formBtnPressed]}
                  >
                    <Icon name="play" size={18} color={color.textPrimary} />
                  </Pressable>
                  {lockable ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: locked }}
                      accessibilityLabel={locked ? t('program.unlockExercise') : t('program.lockExercise')}
                      onPress={() => void app.toggleSlotLock(day.id, i)}
                      style={({ pressed }) => [styles.actionBtn, locked && styles.lockBtnOn, pressed && styles.actionBtnPressed]}
                    >
                      <Icon name="pin" size={17} color={locked ? color.accentText : color.textTertiary} strokeWidth={2} />
                    </Pressable>
                  ) : (
                    <View style={styles.actionBtn} />
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('workout.swapAction')}
                    onPress={() => setSwapping({ slotIndex: i, currentExerciseId: slot.exerciseId })}
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                  >
                    <Icon name="repeat" size={17} color={color.textTertiary} strokeWidth={2} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* A FINISHED workout is a record, not an offer (founder 2026-07-11): "Begin" is gone —
          the screen just states, quietly, that this one is already trained this week. */}
      {day && day.completed ? (
        <View style={styles.footer}>
          <View style={styles.doneRow}>
            <Icon name="check" size={16} color={color.up} strokeWidth={2.4} />
            <Text style={styles.doneText}>{t('program.doneThisWeek')}</Text>
          </View>
        </View>
      ) : day ? (
        <View style={styles.footer}>
          <Button
            variant="primary"
            size="lg"
            block
            label={t('home.begin', { name: bidi(day.name) })}
            leading={<Icon name="play" size={18} color={color.onAccent} />}
            onPress={() => navigation.navigate('Home', { focusDayId: day.id })}
          />
        </View>
      ) : null}

      {swapping ? (
        <SwapSheet
          currentExerciseId={swapping.currentExerciseId}
          exclude={day?.slots.map((s) => s.exerciseId) ?? []}
          onSelect={onSelectSwap}
          onClose={() => setSwapping(null)}
        />
      ) : null}

      {day && formFor != null ? (
        <ExerciseDemo
          title={exerciseDisplayName(day.slots[formFor].exerciseId)}
          exerciseId={day.slots[formFor].exerciseId}
          cues={exerciseCues(day.slots[formFor].exerciseId)}
          focusLabel={t('workout.focusOn')}
          formGuideLabel={t('workout.form')}
          doneLabel={t('common.close')}
          onDone={() => setFormFor(null)}
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
  intro: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, lineHeight: 20, paddingTop: 2, paddingBottom: 8 },
  yoursNow: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary, marginBottom: 4 },

  lift: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: color.border },
  liftLast: { borderBottomWidth: 0 },
  badge: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.border,
  },
  badgeLocked: { borderColor: color.accent, backgroundColor: color.accentWash },
  badgeText: { fontFamily: font.mono, fontSize: textScale.sm, color: color.textMuted },
  badgeTextLocked: { color: color.accentText },
  liftBody: { flex: 1, minWidth: 0 },
  liftName: { fontFamily: font.sansMedium, fontSize: textScale.base, letterSpacing: trackingPx(textScale.base, tracking.tight), color: color.textPrimary },
  liftMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  setsReps: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted },
  lockedTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lockedTagText: { fontFamily: font.sansSemibold, fontSize: 10.5, letterSpacing: trackingPx(10.5, tracking.legend), color: color.accentText },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // Design RowAction "emphasis": a quiet sunken tile with an ink glyph — NOT a
  // heavy black square (which broke the row's balance).
  formBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: color.fillSubtle, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  formBtnPressed: { backgroundColor: color.fillSubtleStrong },
  actionBtn: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionBtnPressed: { backgroundColor: color.fillSubtle },
  lockBtnOn: { backgroundColor: color.accentWash, borderWidth: 1, borderColor: color.accent },

  footer: { paddingHorizontal: space.gutter, paddingTop: 14, paddingBottom: 18, borderTopWidth: 1, borderTopColor: color.border },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  doneText: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textSecondary },
});
