/**
 * Workout detail (§4.20) — a READ-ONLY plan preview (Rev 7, S-73). The day's exercises as Hush
 * assembled them: muscle-group legend → name → sets · reps, each with its Form clip (the looping demo
 * / silhouette guide). Nothing here edits the plan.
 *
 * The programme-edit swap (S-31) and the pin/lock button are DELETED (S-73): the athlete owns exercise
 * selection through the IN-WORKOUT swap (learned into a standing choice, S-69) and through the body
 * map (turning a muscle off, S-56), never a couch-planning screen. What survives is exactly what the
 * register keeps — the day's exercises + form clips — off the START path.
 *
 * "Begin {name}" sets this as Home's offered workout and returns to Home, so the actual start stays on
 * the canonical, Saturday-20:30-gated path.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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

export function ProgramDetail({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const day = app.program?.days.find((d) => d.id === route.params.dayId);

  const [targets, setTargets] = useState<SetTarget[]>([]);
  const [formFor, setFormFor] = useState<number | null>(null);

  useEffect(() => {
    if (!day) return;
    void track('program_day_viewed', { dayId: day.id });
    app.model
      .sessionTargets({ programDayId: day.id, completedSessions: app.modeState.completedSessions })
      .then(setTargets);
  }, [app.model, app.modeState.completedSessions, day]);

  const repsFor = (exId: string) => targets.find((x) => x.exerciseId === exId && x.setIndex === 0)?.recommendedReps ?? 8;

  // The day's shape at a glance: exercise count + honest work-time estimate (the same
  // estimator the program time cap runs on), rounded to a calm 5 minutes.
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

          {day.slots.map((slot, i) => (
            <View key={`${slot.exerciseId}_${i}`} style={[styles.lift, i === day.slots.length - 1 && styles.liftLast]}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{i + 1}</Text>
              </View>
              <View style={styles.liftBody}>
                <Text style={styles.liftName} numberOfLines={1}>{exerciseDisplayName(slot.exerciseId)}</Text>
                <View style={styles.liftMeta}>
                  <Text style={styles.setsReps}>{t('program.setsReps', { sets: slot.setCount, reps: repsFor(slot.exerciseId) })}</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('workout.form')}
                onPress={() => setFormFor(i)}
                style={({ pressed }) => [styles.formBtn, pressed && styles.formBtnPressed]}
              >
                <Icon name="play" size={18} color={color.textPrimary} />
              </Pressable>
            </View>
          ))}
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
  title: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 1, textAlign: 'left' },
  body: { paddingHorizontal: space.gutter, paddingBottom: 24 },
  intro: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, lineHeight: 20, paddingTop: 2, paddingBottom: 8, textAlign: 'left' },

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
  badgeText: { fontFamily: font.mono, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  liftBody: { flex: 1, minWidth: 0 },
  liftName: { fontFamily: font.sansMedium, fontSize: textScale.base, letterSpacing: trackingPx(textScale.base, tracking.tight), color: color.textPrimary, textAlign: 'left' },
  liftMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  setsReps: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },

  // Design RowAction "emphasis": a quiet sunken tile with an ink glyph.
  formBtn: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: color.fillSubtle, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  formBtnPressed: { backgroundColor: color.fillSubtleStrong },

  footer: { paddingHorizontal: space.gutter, paddingTop: 14, paddingBottom: 18, borderTopWidth: 1, borderTopColor: color.border },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  doneText: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textSecondary, textAlign: 'left' },
});
